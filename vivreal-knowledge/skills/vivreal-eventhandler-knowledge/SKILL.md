---
name: vivreal-eventhandler-knowledge
description: 'Use when working in Vivreal_EventHandler, the AWS Step Functions site-deployment pipeline that assigns the shared `stable` channel branch (per-site branches are DEAD as of Phase 2, 2026-07-15), creates an Amplify app, deploys, optionally registers a custom domain, and marks the site live/failed. Covers the ordered state list (with preserved typos you must NOT rename), the seedCollections front state, the hybrid template model, Amplify env-var injection, the Serverless-Framework + esbuild build, the domain purchase + transfer-in sagas (separate state machines), and the GitHub installation-token → Amplify accessToken 255-char fix. Triggers on: Vivreal_EventHandler, site deployment, Step Functions, Amplify deploy, createGithubBranch, seedCollections, templateType, markSiteLive, deploy pipeline, stable branch, channel branch, domain purchase, domain transfer, domainOrders, transferDomain, getInstallationToken. Source of truth: Vivreal_EventHandler source (CLAUDE.md refreshed 2026-07-21).'
---

Last synced: 2026-10-20 against `origin/main` at `19e8102` (#95; no `stable` here, a merge to `main` is the deploy)
Last extended: 2026-09-16 (stored buildSpec vs `buildSpec.js`, the `SITE_RENDER_MODE` fleet fix)

# Vivreal_EventHandler: knowledge digest

Orchestrates the **full customer-site deploy pipeline** via AWS Step Functions. Four entry points start the Deploy-Site SFN: `createSiteCollectionData` (mode `hosted_by_us`), `POST /api/deploySite` (blank first deploy), `redeploySite` (Secure, since 2026-07-29), and `updateSiteEnvVars`'s rebuild (here, since 2026-07-29). **Serverless Framework + esbuild** (NOT SAM), Node 22 since 2026-10-02 (`serverless.yml:43`, gated by a test on the deploy workflow), Step Functions + Amplify + Route53 + GitHub API + DynamoDB. Read `${VIVREAL_REPOS}/Vivreal_EventHandler/CLAUDE.md` for depth (audited claim by claim 2026-09-21, last edited 2026-09-23; it records that four files it once cited no longer exist, so check a path before trusting it).

## Pipeline (ordered: typos preserved: DO NOT rename)

```
SeedCollections → CreateGithubBranch → CreateAmplifyApp → StartAmplifyDeploy
→ WaitBeforeCheck (30s) → CheckAmplifyDeploy (poll) → DeployComplete? (Choice)
→ GetDefaultUrl → AssociateDomain? (Choice) → AssociateDomain (optional)
→ WaitBeforeCheckingDomain (30s) → CheckDomainAssociation → DomainAssociated? (Choice)
→ MarkLive | MarkFailed
```

ASL **state names are PascalCase** (`SeedCollections`, `MarkLive`, `MarkFailed`); the Lambda/handler names are camelCase. The `checkDomainAssociaion` typo survives only in the Lambda name / ASL `Resource` ARN (`vh-site-deployment-checkDomainAssociaion`), the ASL *state* is `CheckDomainAssociation`. Renaming requires coordinated updates.

Each state is its own Lambda named `vh-${stage}-{name}` (e.g. `vh-prod-seedCollections`); the ASL `Resource` ARNs reference `vh-site-deployment-{name}`. (The old `vh_site_deployment_*` underscore form is wrong.) The `serverless.yml` functions block now declares **several Lambdas**: 12 site-deploy (incl. `updateSiteEnvVars` + `subdomainCleanup`), 9 `domainPurchase*`, 6 `domainTransfer*`.

- **`seedCollections`** is the front state, added to fix a 504: it lifted the (then ~17+) sequential CMS-API invokes out of the API Gateway 29s / Lambda 30s budget (`POST /api/siteCollectionData` now <5s). It now **writes collection groups + default objects DIRECTLY to mainDb + the tenant DB** via the `@hillbombcreations/schemas` shapes, **no CMS-API invokes** (`seedCollections/index.js`). Reads `seed.author` + optional `seed.token` + `templateType`, `seed.author` is now asserted BEFORE the blank short-circuit, so the automated env-var rebuild synthesizes a system identity, and calls the seed builders in `src/shared/seeding/` (`buildCollectionGroups`/`buildDefaultObjects`/`buildPages`/`buildPageBlocks.js`/`buildFromManifest.js`; `buildPageBlocks` gained musician format arms `panorama` + `discography`), then writes `pages`/`collectionGroups`/`integrationsUsed` back to the site doc. Entry quotas come from `getTierQuotas(group.tier).entries` (`@hillbombcreations/tier-quotas`). Idempotent: a non-empty `collectionGroups` array on the site doc makes the step a no-op. Failure → `MarkFailed`; partial seeds cleaned up by `VR_Secure_API/deleteSite`.

## State machine is NOT in IaC

The Deploy-Site state machine pre-dates the serverless setup and is invoked by VR_Secure_API via a static ARN. Source of truth: `docs/ops/deploy-site-state-machine.asl.json`; pushed by `scripts/update-state-machine.sh` (idempotent, doesn't disturb running executions), run automatically by CI after `serverless deploy` on `main`. Console edits are drift and get clobbered. `update-state-machine.sh` covers Deploy-Site ONLY, the domain purchase and transfer-in sagas ship via their own `scripts/deploy-domain-purchase-saga.sh` / `scripts/deploy-domain-transfer-saga.sh`.

## Template model (hybrid: read before touching deploy logic)

1. **Seed time (here, in `seedCollections`):** `templateType` drives which collection schemas + page configs get seeded. **A blank/empty `templateType` short-circuits seeding entirely** (June 2026, pairs with the portal's Blank-site flow, where the user deploys explicitly later). VR_Secure_API seeds nothing now, its `createSiteCollectionData` only creates the site doc + logo + counters and starts the Step Function.
2. **Channel time (here):** the `createGithubBranch` state is now **channel assignment only** (Phase 2, 2026-07-15), resolves `CHANNEL_BRANCH || 'stable'`, creates **no git branch**, writes **no marker file**. `createAmplifyApp` persists `deployment.branchName` on the site doc (schemas ≥1.21.0) and sets `enableBranchAutoDeletion: false`.
3. **Runtime (Templates + site-renderer):** layout selection uses `pageConfigs[].format`, NOT `templateType`.

Live template keys (5): `ecommerce`, `showcase`, `restaurant`, `services`, `portfolio` (`src/shared/templates/index.js`; mirrored in `VR_Secure_API` `validators.js`). Live Templates branches: **only `main` + `stable`** (+ dev PR branches), no per-customer and no per-template-type branches exist. Releases go out via the **promote-stable** workflow (main→stable FF), after which `scripts/fleet-build.mjs` starts release builds for the `live` build tier only; demo apps catch up weekly. New apps are created with autobuild OFF (v7, below), so a push to `stable` alone builds nothing on them.

## Amplify env-var injection (createAmplifyApp)

Populates build env so Templates branches build against live data. Injected (`createAmplifyApp/index.js`): `API_KEY`, `SITE_ID`, `NODE_AUTH_TOKEN` (PAT for `npm ci` against GitHub Packages), `NEXT_PUBLIC_SENTRY_DSN`, optional analytics vars (`NEXT_PUBLIC_GA_ID`/`PLAUSIBLE_DOMAIN`/`FATHOM_ID`), and the optional cache-invalidation pair `SITE_CACHE_TTL_SECONDS` + `REVALIDATE_WEBHOOK_SECRET`. A build-time var only reaches the app if it is also grepped in the buildSpec allowlist (`src/shared/amplify/buildSpec.js`). **`BUCKET_NAME`, `CDN_BASE_URL`, collection-group IDs (`SHOWS_ID`, …), and `STRIPE_SECRET_KEY` are NOT injected.** Written to `.env.production` in the Amplify `preBuild` phase.

The bucket is `bucketOf(group)` (VR_Secure_API `src/shared/groupBucket.js`): the stored `group.bucket` wins, else `${group.type}-${group.key}`. Neither half is the tenant database name, and the type is not always `vivreal` (Sentry shows `collection-<key>` buckets), so never assume a `vivreal-` prefix.

### Stored buildSpec vs `buildSpec.js` (2026-09-16)

- **What governs a build is each Amplify app's STORED buildSpec. `src/shared/amplify/buildSpec.js` is only the template for it.** There is no `amplify.yml` in Vivreal_Templates, and editing `buildSpec.js` changes nothing for an app that already exists. Only three paths rewrite a stored spec: `createAmplifyApp` (CreateApp, and UpdateApp on every redeploy through the Deploy-Site state machine), the `updateSiteEnvVars` self-heal, and `scripts/backfill-revalidate-webhooks.js --execute`. An app nobody has redeployed keeps the spec it was created with.
- **A key in the Amplify env but not grepped is worse than a missing key.** `next build` sees the full Amplify env; the running server sees only `.env.production`. So a build-time decision and a runtime decision can disagree with no error anywhere. `canonicalEnv.js` + `test/unit/shared-amplify-build-spec.test.js` keep `buildSpec.js` honest, and nothing checks the stored specs.
- **A stored spec missing the `SITE_RENDER_MODE` grep froze vivreal.io's home page** (and two customer sites had the same gap): `next build` saw `isr` and prerendered home as ISR, the runtime saw no value and ran the render-mode gate off, so edits never reached home until a rebuild, and the gated routes (`/robots.txt`, `/sitemap.xml`, `/icon`) logged `DYNAMIC_SERVER_USAGE`. Symptom and mechanism: `vivreal-templates-knowledge`, "ISR render mode".
- **The safe repair, as applied 2026-09-16:** snapshot the app and branch and hash both env maps; `aws amplify update-app --app-id <id> --build-spec file://<spec>` with ONLY `--build-spec`; re-read and assert the stored spec equals the intended file and both env hashes are unchanged (an env write REPLACES the whole map); then `start-job --job-type RELEASE --commit-id <the commit already deployed>` so the spec is the only change. Before setting any key on a site, compare the stored spec's grep list with the app AND branch env.
- **Stale comment:** `canonicalEnv.js` still says `SITE_RENDER_MODE` is "Not read by Vivreal_Templates yet". Templates reads it in `src/lib/renderMode.ts`.

### Newer behavior
- **The group API key comes from the GROUP DOCUMENT, not the execution input** (`6bee3fa`, 2026-09-24, H2313/H4305): `createAmplifyApp` reads the key it injects as `API_KEY` from the group, because an execution input is stored verbatim in Step Functions execution history and echoed into every state. The input is NOT accepted as a fallback; VR_Secure_API's three starters no longer write `groupApiKey` into the input (only comments recording the removal remain, `src/createSites/services/deploySite.js:116` on `origin/stable`).
- **A customer site is cost-tagged when it is created** (`cf51fdf`, 2026-09-27): the Amplify app carries a `vivreal:app` product tag from creation rather than being swept up later (`65922d4` fixed the tag's value to the product source, not the app's name).
- **`bookings` is in the CMS siteRole allowlist mirror here** (`9301c55`, 2026-09-29), kept in step with VR_CMS_API's widened allowlist; add a new siteRole in both places.
- **Per-site cache-invalidation provisioning**, when `SITE_CACHE_TTL_SECONDS` is set on the EventHandler, each deploy mints a per-site `REVALIDATE_WEBHOOK_SECRET`, injects the TTL + secret, and auto-upserts a `webhooks` subscription so on-publish revalidation works out of the box (`createAmplifyApp/index.js`). The auto-provisioned webhook is now tagged `system` (schemas 1.28.0 `webhookSchema.system`).
- **GitHub App auth**, `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` mint a short-lived installation token for the git clone; a long-lived `NODE_AUTH_TOKEN` PAT (replacing the old `GITHUB_TOKEN`) is what `npm ci` uses for org packages. **Amplify accessToken fix:** `src/shared/github/getInstallationToken.js` sends `X-GitHub-Stateless-S2S-Token: disabled` to force GitHub's classic ~40-char installation-token format, GitHub's 2026 stateless rollout minted ~520-char tokens exceeding Amplify CreateApp/UpdateApp's 255-char `accessToken` cap, failing EVERY new-site deploy in `createAmplifyApp` with an opaque ValidationException. A guard throws if a minted token exceeds 255 chars (means GitHub likely sunset the override).
- **Domain-purchase saga**, a separate state machine (`docs/ops/domain-purchase-saga.asl.json`) with a Stripe `invoice.paid` task-token wait + reconciliation cron. `activateStripeSubscription` now attaches a 100%-off coupon (`DOMAIN_BUNDLE_COUPON_ID` env) for the domain bundle.
- **Domain-transfer-in saga (D3)**, a THIRD state machine (`docs/ops/domain-transfer-saga.asl.json`), deployed by its own `scripts/deploy-domain-transfer-saga.sh`. Charge-before-transfer: `CheckTransferability → ActivateStripeSubscription → TransferDomain → WaitForTransfer (3600s, hourly) → PollTransferOperation → MarkTransferred | RefundTransferFee`; it drops the Amplify spine entirely, terminal status is `transferred`, never `live`. The purchase ASL is byte-for-byte untouched (blast-radius isolation). Six `src/handlers/domainTransfer/` Lambdas: `checkTransferability`, `transferDomain` (keeps the customer's nameservers verbatim, creates NO hosted zone, email safety), `pollTransferOperation`, `markTransferred`, `refundTransferFee` (also cancels the Stripe sub on a $0 transfer refund), `resendTransferAuthorization` (out-of-band, invoked by VR_Secure_API). `domainPurchaseReconciliation` also sweeps stuck transferring orders (Route53 `ListOperations`). `serverless.yml` adds 3 `route53domains` IAM actions (`CheckDomainTransferability`, `TransferDomain`, `ResendOperationAuthorization`) + a `Vivreal/DomainTransfer` metric namespace. Consumes schemas (read the pin from package.json) (`orderType` discriminator, 9 transfer statuses appended after the 13 purchase statuses, encrypted `authCode`; tier-quotas stays ^3.0.0 here).
- **Secrets Phase 2** (`serverless.yml` only), env resolves from per-service `<secret-prefix>/*` Secrets Manager secrets (`site-deployment`, `github-app` [shared with Secure], `stripe`, `core`) + SSM `<ssm-prefix>/*` params; env var NAMES are unchanged.
- **Tier quotas (W6/W7)**, ops scripts `scripts/backfill-normalize-quotas.js` (normalizes the 6 tier-driven quota fields on mainDb `Vivreal.groups` to `@hillbombcreations/tier-quotas` package values; Decimal128 for `cdnUsage.quota`; optimistic-concurrency guard on `{_id, tier}`; dry-run default) and `scripts/reconcile-media-usage.js` (report-only S3 footprint vs `mediaUsage.totalSize`).
- **`subdomainCleanup` daily cron** + **`updateSiteEnvVars` Lambda**. `updateSiteEnvVars`'s rebuild now **StartExecutions the Deploy-Site SFN** (since 2026-07-29): `DEPLOY_STATE_MACHINE_ARN` from the same SSM param VR_Secure_API resolves, `CHANNEL_BRANCH` in the execution input, `states:StartExecution` IAM. Same completion-orphan shape as Secure's `redeploySite`, the old direct Amplify StartJob had no terminal-status writer, so rebuilds hung forever. The env-var UPDATE itself (buildSpec self-heal + UpdateBranch) stays local; `groupId` is required only when a rebuild is requested; doc + socket now say `queued`. `subdomainCleanup`'s group projection now includes `dbKey`.
- **`markSiteLive` push notification**, enqueues to VR_Main_API's `vivreal-notification-queue` (`NOTIFICATION_QUEUE_URL` via SSM, same mechanism as `WEBHOOK_QUEUE_URL`) on a template-instantiated site's FIRST live deploy, gated on `siteInfo.template` + `instantiation` both present via a `.lean()` read (both strict-bypassed undeclared schema paths). Runs after the critical DB write, 5s-raced, failures logged and swallowed. Lambda timeout raised 60s → 75s.
- **Tenant placement is STORED, never computed** (`resolvePlacement(group)`, see `vivreal-tenancy`).
- **Site registration at creation time (analytics ingest phase 0)**, newly created sites are now registered at creation so an enterprise tenant's site becomes visible to the analytics ingest pipeline; lays groundwork for VR_Analytics_API's `ANALYTICS_TENANT_DB_KEYS` gap (today it only probes the DATABASE names in that env list and silently drops beacons from any other tenant DB, see `vivreal-analytics-knowledge`).
- **`subdomainCleanup` Mongo pool-leak fix**, the daily cron no longer leaks Mongo connections on each run (part of the cross-repo Atlas half-open-connection teardown fix this window).
- **Sentry environment tagging**, the repo now sets an explicit Sentry `environment` tag (previously defaulted, making local/dev errors indistinguishable from prod).
- **Full test suite + ESLint + husky + 100%-coverage gate**, the repo joined the cross-repo 2026-08-11→14 testing campaign (test suite, lint, husky pre-push, coverage gate), matching the other backends.
- Renderer-oracle parity fixture (`test/fixtures/renderer-oracle/`): a vendored snapshot of the renderer's `dist/composition/`. Its version is stated in exactly ONE place, the README's "Sync anchor" section; read it there, and never write it anywhere else.
- `sync_conflict` status is **legacy only**, `VR_Secure_API/templateSyncWebhook.js` was deleted in Phase 2 (2026-07-15); nothing writes it anymore.
- **Migration script** (reusable): `scripts/migrate-to-channel-branch.js`, dry-run default, `--execute`, `--app-id`, `--profile`, `--region`, `--db-keys`, separate verify-first `--delete-old-branches` pass; needs `CLUSTER_URL`. Gotcha: Amplify returns the apex subdomain prefix as `null` but UpdateDomainAssociation requires `""`.

## v7 and v7.1 (merged and live 2026-10-19/20; a merge here is the deploy)
- **New apps build only when asked (V7.247, #92).** `createAmplifyApp` creates every app with `enableAutoBuild: false` and a `vivreal:buildTier` tag (`src/shared/amplify/costTags.js`, `buildTierFor`): `live` by default, `demo` or `qa` only on an exact match of a listed group id, so every unknown fails toward `live`. A redeploy keeps a tier the app already carries (TagResource would otherwise reset a backfilled or overridden tier). The Templates promote starts release builds by this tag, live tier only; demos catch up weekly (`vivreal-infra:vivreal-site-deploy-pipeline`).
- **Seeded items are metered under `collectionObject_<id>` (v7.1 S9-D7, #95).** `seedCollections` writes each seeded item's usage row field for field as VR_CMS_API's `trackBulkDocs` does (`itemUsageRow`); the legacy `collection_<id>` key released nothing on delete and was counted twice on the first edit.
- **Audit rows carry `expiresAt`** from the group's tier (`src/shared/auditLog.js`, the same rule as VR_CMS_API and VR_Secure_API), with the group tier lookup raced against a 1 s timeout that covers both the connect and the read (`GROUP_TIER_LOOKUP_TIMEOUT_MS`).
- **`scripts/build-indexes.js --new-placement <pod>`** builds the next pod's indexes before its first tenant: it must be exactly the next pod by tenant-db's rule and is refused when the pod already holds data; `--placements` must name a stored tenant dbKey (`vivreal-tenancy`).
- **The deploy logs in to ECR Public first** (`.github/workflows/lambda_api.yml`, step "Log in to Amazon ECR Public", after anonymous pulls were throttled with 429 on 2026-10-17). It needs `ecr-public:GetAuthorizationToken` and `sts:GetServiceBearerToken` on the deploy role, the latter UNCONDITIONED: an `sts:AWSServiceName` condition simulated `allowed` and was denied for real, which failed the first v7 deploy.

## Hard rules / gotchas

- The pipeline is started only via the four SFN entry points (createSiteCollectionData, deploySite, redeploySite, updateSiteEnvVars rebuild), don't invoke individual Lambdas directly.
- Don't rename `checkDomainAssociaion` (typo in state machine + handler).
- "Render differently for ecommerce vs showcase" belongs in Vivreal_Templates + site-renderer, NOT here (runtime ignores `templateType`).
- Seed builders + template manifests live ONLY here (`src/shared/seeding/`, `src/shared/templates/`); the old `VR_Secure_API/src/createSites/services/templates` + `buildCollectionGroups`/`buildPages` files no longer exist. VR_Secure_API keeps only integration helpers under `services/HelperFunctions/` and a hardcoded `countExpectedSeeds()` per template, bump that count if you add seeds here.

## Before you report an absence

Load `vivreal-workflow:verification-discipline`: a zero is only evidence once the same query returns a known hit. Its founding example is this repo: a `git grep ... origin/stable` printed nothing and was reported as "nothing invokes the thumbnail Lambda", because **`Vivreal_EventHandler` has no `origin/stable`** (the invoke was in `markSiteLive`). Resolve refs against `git branch -r` first, and remember that an empty CloudWatch log group can mean "never invoked" rather than "never fails".

## Lambda and MongoDB checklist (ported from the `event-handler` expert agent, 2026-10-20)

The expert agents are no longer loadable as skills, so the review checklist an agent without an
`Agent` tool used to load from them lives here. Query rules (tenant scoping, the mainDb `_id`
lookup, the `publishDate` and `archived` filters) live in `vivreal-knowledge:vivreal-db`, and
packaging and limits in `vivreal-infra:vivreal-lambda`; they are not repeated here.

### AWS Lambda best-practice alignment

- Each Step Function step is its own Lambda. Cold start matters for orchestration latency.
- Idempotency: every step must be re-runnable. The state machine retries on transient failures.
- IAM: `StartExecution` ARN format for triggering; `DescribeExecution`/`StopExecution` use a different ARN format (`:execution:` vs `:stateMachine:`), common gotcha.
- Polling pattern: avoid hot loops. Use Step Functions Wait state for delays > 1s.
- Failure rollback: `markSiteFailed` step must be idempotent and clean up partial Amplify/Route53 resources.

### MongoDB consistency & performance

- Site status is lowercase: `deploying` (`createSiteCollectionData.js`) → `live` (`markSiteLive/index.js`) | `failed`. `sync_conflict` is dead (no writer in `src/` since the 2026-07-15 channel move), and there is NO `PROVISIONING` status.
- Idempotency, not a status lock: the seed step no-ops if `site.collectionGroups` is non-empty (`seedCollections/index.js`); `CreateBranchCommand` is wrapped in try/catch for retry safety.
- Domain purchase AND transfer-in orders live in the `domainOrders` collection (`src/shared/db/domainOrders.js`). Transfer orders use `orderType: 'transfer'` + 9 transfer statuses (encrypted `authCode`); `domainPurchaseReconciliation` also sweeps stuck transferring orders (Lambda-crash recovery via Route53 `ListOperations`); `refundTransferFee` cancels the Stripe sub on a $0 transfer refund.
