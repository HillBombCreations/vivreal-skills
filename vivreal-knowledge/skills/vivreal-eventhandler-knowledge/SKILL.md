---
name: vivreal-eventhandler-knowledge
description: Use when working in Vivreal_EventHandler — the AWS Step Functions site-deployment pipeline that branches a template, creates an Amplify app, deploys, optionally registers a custom domain, and marks the site live/failed. Covers the ordered state list (with preserved typos you must NOT rename), the seedCollections front state, the hybrid template model, Amplify env-var injection, and the Serverless-Framework + esbuild build. Triggers on: Vivreal_EventHandler, site deployment, Step Functions, Amplify deploy, createGithubBranch, seedCollections, templateType, markSiteLive, deploy pipeline. Source of truth: C:\repos\Vivreal_EventHandler\CLAUDE.md.
---

# Vivreal_EventHandler — knowledge digest

Orchestrates the **full customer-site deploy pipeline** via AWS Step Functions. Called only by `VR_Secure_API/createSites`. **Serverless Framework + esbuild** (NOT SAM), Node 20, Step Functions + Amplify + Route53 + GitHub API + DynamoDB. Read `C:\repos\Vivreal_EventHandler\CLAUDE.md` for depth.

## Pipeline (ordered — typos preserved, DO NOT rename)

```
SeedCollections → CreateGithubBranch → CreateAmplifyApp → StartAmplifyDeploy
→ WaitBeforeCheck (30s) → CheckAmplifyDeploy (poll) → DeployComplete? (Choice)
→ GetDefaultUrl → AssociateDomain? (Choice) → AssociateDomain (optional)
→ WaitBeforeCheckingDomain (30s) → CheckDomainAssociation → DomainAssociated? (Choice)
→ MarkLive | MarkFailed
```

ASL **state names are PascalCase** (`SeedCollections`, `MarkLive`, `MarkFailed`); the Lambda/handler names are camelCase. The `checkDomainAssociaion` typo survives only in the Lambda name / ASL `Resource` ARN (`vh-site-deployment-checkDomainAssociaion`) — the ASL *state* is `CheckDomainAssociation`. Renaming requires coordinated updates.

Each state is its own Lambda named `vh-${stage}-{name}` (e.g. `vh-prod-seedCollections`, `serverless.yml:124`); the ASL `Resource` ARNs reference `vh-site-deployment-{name}`. (The old `vh_site_deployment_*` underscore form is wrong.)

- **`seedCollections`** is the front state, added to fix a 504: it lifted the (then ~17+) sequential CMS-API invokes out of the API Gateway 29s / Lambda 30s budget (`POST /api/siteCollectionData` now <5s). It now **writes collection groups + default objects DIRECTLY to mainDb + the tenant DB** via the `@hillbombcreations/schemas` shapes — **no CMS-API invokes** (`seedCollections/index.js:9-32`). Reads `seed.author` + optional `seed.token` + `templateType`, calls the seed builders in `src/shared/seeding/` (`buildCollectionGroups`/`buildDefaultObjects`/`buildPages`), then writes `pages`/`collectionGroups`/`integrationsUsed` back to the site doc (`:179-289`). Idempotent: a non-empty `collectionGroups` array on the site doc makes the step a no-op (`:145-170`). Failure → `MarkFailed`; partial seeds cleaned up by `VR_Secure_API/deleteSite`.

## State machine is NOT in IaC

The Deploy-Site state machine pre-dates the serverless setup and is invoked by VR_Secure_API via a static ARN. Source of truth: `docs/ops/deploy-site-state-machine.asl.json`; pushed by `scripts/update-state-machine.sh` (idempotent, doesn't disturb running executions), run automatically by CI after `serverless deploy` on `main`. Console edits are drift and get clobbered.

## Template model (hybrid — read before touching deploy logic)

1. **Seed time (here, in `seedCollections`):** `templateType` drives which collection schemas + page configs get seeded. VR_Secure_API seeds nothing now — its `createSiteCollectionData` only creates the site doc + logo + counters and starts the Step Function (`VR_Secure_API/.../services/createSiteCollectionData.js:16-33`).
2. **Fork time (here):** `createBranch.js` forks from `refs/heads/main` (always `main`; runtime doesn't read `templateType`).
3. **Runtime (Templates + site-renderer):** layout selection uses `pageConfigs[].format`, NOT `templateType`. `.vivreal-template.json` records `templateType` for traceability only.

Live template keys (5): `ecommerce`, `showcase`, `restaurant`, `services`, `portfolio` (`src/shared/templates/index.js:16-28`; mirrored in `VR_Secure_API` `validators.js:78`). Live branches: `main` + per-customer branches — **no `ecommerce`/`showcase` branch exists**.

## Amplify env-var injection (createAmplifyApp)

Populates build env so Templates branches build against live data. Injected (`createAmplifyApp/index.js:102-157`): `API_KEY`, `SITE_ID`, `NODE_AUTH_TOKEN` (PAT for `npm ci` against GitHub Packages), `NEXT_PUBLIC_SENTRY_DSN`, optional analytics vars (`NEXT_PUBLIC_GA_ID`/`PLAUSIBLE_DOMAIN`/`FATHOM_ID`), and the optional cache-invalidation pair `SITE_CACHE_TTL_SECONDS` + `REVALIDATE_WEBHOOK_SECRET`. A build-time var only reaches the app if it is also grepped in the buildSpec allowlist (`src/shared/amplify/buildSpec.js:22-30`). **`BUCKET_NAME`, `CDN_BASE_URL`, collection-group IDs (`SHOWS_ID`, …), and `STRIPE_SECRET_KEY` are NOT injected.** Written to `.env.production` in the Amplify `preBuild` phase.

The bucket name itself is `${group.type}-${group.key}` (e.g. `pro_plus-foo`), not `vivreal-{group.key}` (`VR_Secure_API/.../createSiteCollectionData.js:206,270`).

### Newer behavior
- **Per-site cache-invalidation provisioning** — when `SITE_CACHE_TTL_SECONDS` is set on the EventHandler, each deploy mints a per-site `REVALIDATE_WEBHOOK_SECRET`, injects the TTL + secret, and auto-upserts a `webhooks` subscription so on-publish revalidation works out of the box (`createAmplifyApp/index.js:121-221`).
- **GitHub App auth** — `GITHUB_APP_ID` / `GITHUB_APP_PRIVATE_KEY` / `GITHUB_APP_INSTALLATION_ID` mint a short-lived installation token for the git clone; a long-lived `NODE_AUTH_TOKEN` PAT (replacing the old `GITHUB_TOKEN`) is what `npm ci` uses for org packages.
- **Domain-purchase saga** — a separate state machine (`docs/ops/domain-purchase-saga.asl.json`) with a Stripe `invoice.paid` task-token wait + reconciliation cron.
- **`subdomainCleanup` daily cron** + **`updateSiteEnvVars` Lambda** (`serverless.yml:186-205`).
- New terminal/intermediate status: `sync_conflict` (set by `VR_Secure_API/templateSyncWebhook.js` on template-sync merge conflicts).

## Hard rules / gotchas

- `VR_Secure_API/createSites` is the ONLY caller — don't invoke individual Lambdas directly.
- Don't rename `checkDomainAssociaion` (typo in state machine + handler).
- "Render differently for ecommerce vs showcase" belongs in Vivreal_Templates + site-renderer, NOT here (runtime ignores `templateType`).
- Seed builders + template manifests live ONLY here (`src/shared/seeding/`, `src/shared/templates/`); the old `VR_Secure_API/src/createSites/services/templates` + `buildCollectionGroups`/`buildPages` files no longer exist. VR_Secure_API keeps only integration helpers under `services/HelperFunctions/` and a hardcoded `countExpectedSeeds()` per template — bump that count if you add seeds here.
