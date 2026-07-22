---
name: vivreal-eventhandler-knowledge
description: Use when working in Vivreal_EventHandler — the AWS Step Functions site-deployment pipeline that assigns the shared `stable` channel branch (per-site branches are DEAD as of Phase 2, 2026-07-15), creates an Amplify app, deploys, optionally registers a custom domain, and marks the site live/failed. Covers the ordered state list (with preserved typos you must NOT rename), the seedCollections front state, the hybrid template model, Amplify env-var injection, the Serverless-Framework + esbuild build, the domain purchase + transfer-in sagas (separate state machines), and the GitHub installation-token → Amplify accessToken 255-char fix. Triggers on: Vivreal_EventHandler, site deployment, Step Functions, Amplify deploy, createGithubBranch, seedCollections, templateType, markSiteLive, deploy pipeline, stable branch, channel branch, domain purchase, domain transfer, domainOrders, transferDomain, getInstallationToken. Source of truth: Vivreal_EventHandler source (CLAUDE.md refreshed 2026-07-21).
---

Last synced: 2026-07-21

# Vivreal_EventHandler — knowledge digest

Orchestrates the **full customer-site deploy pipeline** via AWS Step Functions. Called only by `VR_Secure_API/createSites`. **Serverless Framework + esbuild** (NOT SAM), Node 20, Step Functions + Amplify + Route53 + GitHub API + DynamoDB. Read `C:\repos\Vivreal_EventHandler\CLAUDE.md` for depth (CLAUDE.md refreshed 2026-07-21 — current as of this sync).

## Pipeline (ordered — typos preserved, DO NOT rename)

```
SeedCollections → CreateGithubBranch → CreateAmplifyApp → StartAmplifyDeploy
→ WaitBeforeCheck (30s) → CheckAmplifyDeploy (poll) → DeployComplete? (Choice)
→ GetDefaultUrl → AssociateDomain? (Choice) → AssociateDomain (optional)
→ WaitBeforeCheckingDomain (30s) → CheckDomainAssociation → DomainAssociated? (Choice)
→ MarkLive | MarkFailed
```

ASL **state names are PascalCase** (`SeedCollections`, `MarkLive`, `MarkFailed`); the Lambda/handler names are camelCase. The `checkDomainAssociaion` typo survives only in the Lambda name / ASL `Resource` ARN (`vh-site-deployment-checkDomainAssociaion`) — the ASL *state* is `CheckDomainAssociation`. Renaming requires coordinated updates.

Each state is its own Lambda named `vh-${stage}-{name}` (e.g. `vh-prod-seedCollections`); the ASL `Resource` ARNs reference `vh-site-deployment-{name}`. (The old `vh_site_deployment_*` underscore form is wrong.) The `serverless.yml` functions block now declares **27 Lambdas**: 12 site-deploy (incl. `updateSiteEnvVars` + `subdomainCleanup`), 9 `domainPurchase*`, 6 `domainTransfer*`.

- **`seedCollections`** is the front state, added to fix a 504: it lifted the (then ~17+) sequential CMS-API invokes out of the API Gateway 29s / Lambda 30s budget (`POST /api/siteCollectionData` now <5s). It now **writes collection groups + default objects DIRECTLY to mainDb + the tenant DB** via the `@hillbombcreations/schemas` shapes — **no CMS-API invokes** (`seedCollections/index.js`). Reads `seed.author` + optional `seed.token` + `templateType`, calls the seed builders in `src/shared/seeding/` (`buildCollectionGroups`/`buildDefaultObjects`/`buildPages`), then writes `pages`/`collectionGroups`/`integrationsUsed` back to the site doc. Entry quotas come from `getTierQuotas(group.tier).entries` (`@hillbombcreations/tier-quotas` ^3.0.0). Idempotent: a non-empty `collectionGroups` array on the site doc makes the step a no-op. Failure → `MarkFailed`; partial seeds cleaned up by `VR_Secure_API/deleteSite`.

## State machine is NOT in IaC

The Deploy-Site state machine pre-dates the serverless setup and is invoked by VR_Secure_API via a static ARN. Source of truth: `docs/ops/deploy-site-state-machine.asl.json`; pushed by `scripts/update-state-machine.sh` (idempotent, doesn't disturb running executions), run automatically by CI after `serverless deploy` on `main`. Console edits are drift and get clobbered. `update-state-machine.sh` covers Deploy-Site ONLY — the domain purchase and transfer-in sagas ship via their own `scripts/deploy-domain-purchase-saga.sh` / `scripts/deploy-domain-transfer-saga.sh`.

## Template model (hybrid — read before touching deploy logic)

1. **Seed time (here, in `seedCollections`):** `templateType` drives which collection schemas + page configs get seeded. **A blank/empty `templateType` short-circuits seeding entirely** (June 2026 — pairs with the portal's Blank-site flow, where the user deploys explicitly later). VR_Secure_API seeds nothing now — its `createSiteCollectionData` only creates the site doc + logo + counters and starts the Step Function.
2. **Channel time (here):** the `createGithubBranch` state is now **channel assignment only** (Phase 2, 2026-07-15) — resolves `CHANNEL_BRANCH || 'stable'`, creates **no git branch**, writes **no marker file**. `createAmplifyApp` persists `deployment.branchName` on the site doc (schemas ≥1.21.0) and sets `enableBranchAutoDeletion: false`.
3. **Runtime (Templates + site-renderer):** layout selection uses `pageConfigs[].format`, NOT `templateType`.

Live template keys (5): `ecommerce`, `showcase`, `restaurant`, `services`, `portfolio` (`src/shared/templates/index.js:16-28`; mirrored in `VR_Secure_API` `validators.js:78`). Live Templates branches: **only `main` + `stable`** (+ dev PR branches) — no per-customer and no per-template-type branches exist. Releases go out via the **promote-stable** workflow (main→stable FF), which rebuilds every site app.

## Amplify env-var injection (createAmplifyApp)

Populates build env so Templates branches build against live data. Injected (`createAmplifyApp/index.js:102-157`): `API_KEY`, `SITE_ID`, `NODE_AUTH_TOKEN` (PAT for `npm ci` against GitHub Packages), `NEXT_PUBLIC_SENTRY_DSN`, optional analytics vars (`NEXT_PUBLIC_GA_ID`/`PLAUSIBLE_DOMAIN`/`FATHOM_ID`), and the optional cache-invalidation pair `SITE_CACHE_TTL_SECONDS` + `REVALIDATE_WEBHOOK_SECRET`. A build-time var only reaches the app if it is also grepped in the buildSpec allowlist (`src/shared/amplify/buildSpec.js:22-30`). **`BUCKET_NAME`, `CDN_BASE_URL`, collection-group IDs (`SHOWS_ID`, …), and `STRIPE_SECRET_KEY` are NOT injected.** Written to `.env.production` in the Amplify `preBuild` phase.

The bucket name itself is `${group.type}-${group.key}` (e.g. `pro_plus-foo`), not `vivreal-{group.key}` (`VR_Secure_API/.../createSiteCollectionData.js:206,270`).

### Newer behavior
- **Per-site cache-invalidation provisioning** — when `SITE_CACHE_TTL_SECONDS` is set on the EventHandler, each deploy mints a per-site `REVALIDATE_WEBHOOK_SECRET`, injects the TTL + secret, and auto-upserts a `webhooks` subscription so on-publish revalidation works out of the box (`createAmplifyApp/index.js:121-221`).
- **GitHub App auth** — `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` mint a short-lived installation token for the git clone; a long-lived `NODE_AUTH_TOKEN` PAT (replacing the old `GITHUB_TOKEN`) is what `npm ci` uses for org packages. **Amplify accessToken fix:** `src/shared/github/getInstallationToken.js` sends `X-GitHub-Stateless-S2S-Token: disabled` to force GitHub's classic ~40-char installation-token format — GitHub's 2026 stateless rollout minted ~520-char tokens exceeding Amplify CreateApp/UpdateApp's 255-char `accessToken` cap, failing EVERY new-site deploy in `createAmplifyApp` with an opaque ValidationException. A guard throws if a minted token exceeds 255 chars (means GitHub likely sunset the override).
- **Domain-purchase saga** — a separate state machine (`docs/ops/domain-purchase-saga.asl.json`) with a Stripe `invoice.paid` task-token wait + reconciliation cron. `activateStripeSubscription` now attaches a 100%-off coupon (`DOMAIN_BUNDLE_COUPON_ID` env) for the domain bundle.
- **Domain-transfer-in saga (D3)** — a THIRD state machine (`docs/ops/domain-transfer-saga.asl.json`), deployed by its own `scripts/deploy-domain-transfer-saga.sh`. Charge-before-transfer: `CheckTransferability → ActivateStripeSubscription → TransferDomain → WaitForTransfer (3600s, hourly) → PollTransferOperation → MarkTransferred | RefundTransferFee`; it drops the Amplify spine entirely — terminal status is `transferred`, never `live`. The purchase ASL is byte-for-byte untouched (blast-radius isolation). Six `src/handlers/domainTransfer/` Lambdas: `checkTransferability`, `transferDomain` (keeps the customer's nameservers verbatim, creates NO hosted zone — email safety), `pollTransferOperation`, `markTransferred`, `refundTransferFee` (also cancels the Stripe sub on a $0 transfer refund), `resendTransferAuthorization` (out-of-band, invoked by VR_Secure_API). `domainPurchaseReconciliation` also sweeps stuck transferring orders (Route53 `ListOperations`). `serverless.yml` adds 3 `route53domains` IAM actions (`CheckDomainTransferability`, `TransferDomain`, `ResendOperationAuthorization`) + a `Vivreal/DomainTransfer` metric namespace. Consumes schemas ^1.22.0 (`orderType` discriminator, 9 transfer statuses appended after the 13 purchase statuses, encrypted `authCode`).
- **Secrets Phase 2** (`serverless.yml` only) — env resolves from per-service `vivreal/prod/*` Secrets Manager secrets (`site-deployment`, `github-app` [shared with Secure], `stripe`, `core`) + SSM `/vivreal/prod/*` params; env var NAMES are unchanged.
- **Tier quotas (W6/W7)** — ops scripts `scripts/backfill-normalize-quotas.js` (normalizes the 6 tier-driven quota fields on mainDb `Vivreal.groups` to `@hillbombcreations/tier-quotas` package values; Decimal128 for `cdnUsage.quota`; optimistic-concurrency guard on `{_id, tier}`; dry-run default) and `scripts/reconcile-media-usage.js` (report-only S3 footprint vs `mediaUsage.totalSize`).
- **`subdomainCleanup` daily cron** + **`updateSiteEnvVars` Lambda**.
- `sync_conflict` status is **legacy only** — `VR_Secure_API/templateSyncWebhook.js` was deleted in Phase 2 (2026-07-15); nothing writes it anymore.
- **Migration script** (reusable): `scripts/migrate-to-channel-branch.js` — dry-run default, `--execute`, `--app-id`, `--profile`, `--region`, `--db-keys`, separate verify-first `--delete-old-branches` pass; needs `CLUSTER_URL`. Gotcha: Amplify returns the apex subdomain prefix as `null` but UpdateDomainAssociation requires `""`.

## Hard rules / gotchas

- `VR_Secure_API/createSites` is the ONLY caller — don't invoke individual Lambdas directly.
- Don't rename `checkDomainAssociaion` (typo in state machine + handler).
- "Render differently for ecommerce vs showcase" belongs in Vivreal_Templates + site-renderer, NOT here (runtime ignores `templateType`).
- Seed builders + template manifests live ONLY here (`src/shared/seeding/`, `src/shared/templates/`); the old `VR_Secure_API/src/createSites/services/templates` + `buildCollectionGroups`/`buildPages` files no longer exist. VR_Secure_API keeps only integration helpers under `services/HelperFunctions/` and a hardcoded `countExpectedSeeds()` per template — bump that count if you add seeds here.
