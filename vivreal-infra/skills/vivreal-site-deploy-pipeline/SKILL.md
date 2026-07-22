---
name: vivreal-site-deploy-pipeline
description: Use when reasoning about how a customer SITE gets built and deployed — the Step Functions deploy pipeline (Vivreal_EventHandler), how ALL customer Amplify apps build from the shared Vivreal_Templates `stable` channel branch (Phase 2, 2026-07-15 — per-site branches are DEAD), the promote-stable release workflow (workflow_dispatch; FFs main→stable, rebuilds every site), domain association via Route53 plus the domain purchase/transfer-in sagas, and what to check when a site is stuck pending/failed or "my Templates/renderer change isn't showing on a live site". Covers the ordered vh_site_deployment_* states (typos preserved), the seedCollections front state, Amplify env-var injection, and the createAmplifyApp accessToken 255-char failure. Triggers on: site deploy, Amplify, Step Functions, vh_site_deployment, createGithubBranch, associateDomain, seedCollections, markSiteLive, promote-stable, release to customer sites, renderer not showing on site, domain transfer, createAmplifyApp ValidationException.
---

# Vivreal Customer-Site Deploy Pipeline

How a site goes from "create" to "live on a custom domain." This is the AWS orchestration / **deploy-plumbing** view. For the site **product/data/authoring model** (pages, formats, site values, chrome, the publishDate gate, Studio↔live parity) see `vivreal-sites`. For EventHandler repo internals see `vivreal-eventhandler-knowledge`, for Templates internals see `vivreal-templates-knowledge`.

## The pipeline (AWS Step Functions, one Lambda per state)

Invoked **only** by `VR_Secure_API/createSites`. State machine = Deploy-Site. Ordered states (each its own `vh_site_deployment_*` Lambda — **typos are real, do NOT rename**):

```
SeedCollections → CreateGithubBranch → CreateAmplifyApp → StartAmplifyDeploy
→ WaitBeforeCheck (30s) → CheckAmplifyDeploy (poll) → DeployComplete? (Choice)
→ GetDefaultUrl → AssociateDomain? (Choice) → AssociateDomain (optional)
→ WaitBeforeCheckingDomain (30s) → CheckDomainAssociation → DomainAssociated? (Choice)
→ MarkLive | MarkFailed
```

- **`seedCollections`** (front state) — lifted the (then ~17+) sequential CMS-API invokes out of the API Gateway 29s / Lambda 30s budget that was causing 504s. Reads `seed.{author,token}` + `templateType`, then writes collection groups/objects **directly to Mongo** (mainDb + tenant DB) via `@hillbombcreations/schemas` — **no CMS create endpoints** (`seedCollections/index.js:9-32`). Writes `pages`/`collectionGroups`/`integrationsUsed` back to the site doc. Failure → `markSiteFailed`; partial seeds cleaned by `VR_Secure_API/deleteSite`.
- **`createGithubBranch`** — despite the name, this is now **channel assignment only** (Phase 2, 2026-07-15): it resolves `CHANNEL_BRANCH || 'stable'`, creates **no git branch** and writes no marker file. Per-site branches are dead.
- **`createAmplifyApp` / `startAmplifyDeploy` / `checkAmplifyDeploy`** — creates the Amplify app pointed at the channel branch (`stable`), persists `deployment.branchName` on the site doc (schemas ≥1.21.0), sets `enableBranchAutoDeletion: false`, and triggers/polls the build.
- **`associateDomain` / `checkDomainAssociaion`** — optional custom-domain wiring via Route53. Two SEPARATE state machines handle domain acquisition: the domain-purchase saga (`docs/ops/domain-purchase-saga.asl.json`, newly registered domains) and the domain-transfer-in saga (`docs/ops/domain-transfer-saga.asl.json`, D3 — charge-before-transfer, hourly poll loop, own `deploy-domain-transfer-saga.sh`, NO Amplify states; transfers keep the customer's nameservers verbatim and create no hosted zone, terminal status `transferred` not `live`).
- **`markSiteLive` / `markSiteFailed`** — terminal; sets `sites.deployment.status`. Initial status is `deploying` (`createSiteCollectionData.js:134`); the `POST /api/siteCollectionData` response returns `queued` (`controllers/createSiteCollectionData.js:80`); terminal is `live` (`markSiteLive/index.js:41`) or `failed`. No `pending` is ever written. (A legacy `sync_conflict` value may linger on old docs; the template-sync webhook that wrote it was deleted in Phase 2 — nothing produces it anymore.)

### State machine is NOT in IaC
The Deploy-Site state machine pre-dates the serverless setup; VR_Secure_API invokes it by a static ARN (`STATE_MACHINE_ID` in `hb-api-secrets`). Source of truth = `Vivreal_EventHandler/docs/ops/deploy-site-state-machine.asl.json`, pushed by `scripts/update-state-machine.sh` (idempotent; CI runs it after `serverless deploy` on `main`). **Console edits are drift and get clobbered.** (`update-state-machine.sh` covers Deploy-Site only — the domain purchase/transfer sagas ship via their own `deploy-domain-purchase-saga.sh` / `deploy-domain-transfer-saga.sh`.)

## Amplify customer sites — how they build

- Each customer site = its own Amplify app, and **every app builds the shared `Vivreal_Templates` `stable` branch** (Phase 2, 2026-07-15 — Templates has only `main`, `stable`, and dev PR branches). The build renders via `vivreal-site-renderer` against live CMS/Client-API data; per-site identity comes from the injected env vars, not from git.
- **`createAmplifyApp` injects build env vars** so the branch builds against the right tenant: `API_KEY`, `SITE_ID`, `NODE_AUTH_TOKEN` (PAT for `npm ci` against GitHub Packages), `NEXT_PUBLIC_SENTRY_DSN`, optional analytics vars, and the optional cache-invalidation pair `SITE_CACHE_TTL_SECONDS` + `REVALIDATE_WEBHOOK_SECRET`. A var only reaches the app if it is also grepped in the buildSpec allowlist (`src/shared/amplify/buildSpec.js:22-30`). **`BUCKET_NAME`, `CDN_BASE_URL`, collection-group IDs (`SHOWS_ID`, …), and `STRIPE_SECRET_KEY` are NOT injected.** Written to `.env.production` in Amplify's `preBuild` phase.
- **Per-site cache-invalidation provisioning** — when `SITE_CACHE_TTL_SECONDS` is set, each deploy mints a per-site `REVALIDATE_WEBHOOK_SECRET` and auto-upserts a `webhooks` subscription so on-publish revalidation works out of the box (`createAmplifyApp/index.js:121-221`; gated via `serverless.yml:22-28`).

## Releases — the promote-stable workflow (Phase 2, 2026-07-15)

**Merging/pushing `Vivreal_Templates` `main` does NOTHING to customer sites.** To release: run the **promote-stable** GitHub Actions workflow (Actions → promote-stable → Run workflow; `workflow_dispatch`, fast-forward-only, GitHub App auth). It fast-forwards `main` → `stable`; that push auto-builds **every** site's Amplify app, including the cross-account Waves of Grain app (acct 095232028948, us-east-2).

So: renderer change → publish renderer package → bump dep on Templates `main` → merge → **run promote-stable** → all apps rebuild → live. (The renderer publishes via its own CI on push to its `master`.)

- **Per-site emergency hold:** disable that app's `stable` branch auto-build, then use explicit `start-job` to release it later.
- The old "Sync main to site branches" workflow, per-site branches, `/sync-templates`, and the `templateSyncWebhook`/`POST /createBranch` endpoints in VR_Secure_API are all **deleted**. VR_Secure_API resolves a site's branch via `resolveSiteBranch(site, group, templateTypeOverride?)` — persisted `deployment.branchName` first, legacy `${group.key}-${site.key}-${templateType}` naming as fallback (no un-migrated sites remain).

## Debugging a stuck / wrong site

- **Stuck `deploying`** (the in-flight status; the API response says `queued`) → inspect the Step Functions execution for the failed state; check `checkAmplifyDeploy` (build failed) or `checkDomainAssociaion` (domain not yet associated).
- **EVERY new-site deploy failing at `CreateAmplifyApp` with an opaque ValidationException** → the GitHub installation token blew Amplify CreateApp/UpdateApp's 255-char `accessToken` cap (GitHub's 2026 stateless rollout mints ~520-char tokens). `getInstallationToken.js` forces the classic ~40-char format via `X-GitHub-Stateless-S2S-Token: disabled` and throws if a minted token exceeds 255 chars — if this resurfaces, GitHub has likely sunset the override.
- **`failed`** → `markSiteFailed` ran; read the execution input/output and the failing state's logs. Re-create via `createSites` after fixing.
- **"My Templates/renderer change isn't on the live site"** → either (a) you merged to Templates `main` but never ran **promote-stable** (merging main alone releases NOTHING), (b) the renderer package wasn't published/bumped, or (c) Amplify hasn't finished rebuilding the `stable` branch.
- **"Content created in portal missing on site"** → that's the publishDate storefront gate, not the deploy pipeline — see `vivreal-db`.

## Sources of truth

`Vivreal_EventHandler/CLAUDE.md` (pipeline internals), `Vivreal_Templates/CLAUDE.md` (branch/render model), the `createSites` section of `VR_Secure_API/CLAUDE.md`, and `Vivreal_Portal_Mobile/docs/projects/site-provisioning-scalability/HANDOFF-2026-07-15.md` (Phase 2 ship log).
