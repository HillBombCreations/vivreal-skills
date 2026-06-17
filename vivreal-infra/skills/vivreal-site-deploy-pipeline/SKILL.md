---
name: vivreal-site-deploy-pipeline
description: Use when reasoning about how a customer SITE gets built and deployed — the Step Functions deploy pipeline (Vivreal_EventHandler), how Amplify builds customer sites from per-customer git branches off Vivreal_Templates, the "Sync main to site branches" workflow (pushing Templates main auto-syncs ALL customer branches with NO manual step), domain association via Route53, and what to check when a site is stuck pending/failed or "my change to Templates/the renderer isn't showing on a live site". Covers the ordered vh_site_deployment_* states (typos preserved), the seedCollections front state, and Amplify env-var injection. Triggers on: site deploy, customer site, Amplify, Step Functions, vh_site_deployment, createGithubBranch, startAmplifyDeploy, associateDomain, seedCollections, markSiteLive, markSiteFailed, sync main to site branches, Templates branch, deployment status, site stuck pending, renderer not showing on site, domain association, Route53 site domain.
---

# Vivreal Customer-Site Deploy Pipeline

How a site goes from "create" to "live on a custom domain." This is the AWS orchestration / **deploy-plumbing** view. For the site **product/data/authoring model** (pages, formats, site values, chrome, the publishDate gate, Studio↔live parity) see `vivreal-sites`. For EventHandler repo internals see `vivreal-eventhandler-knowledge`, for Templates internals see `vivreal-templates-knowledge`.

## The pipeline (AWS Step Functions, one Lambda per state)

Invoked **only** by `VR_Secure_API/createSites`. State machine = Deploy-Site. Ordered states (each its own `vh_site_deployment_*` Lambda — **typos are real, do NOT rename**):

```
seedCollections → createGithubBranch → createAmplifyApp → startAmplifyDeploy
→ checkAmplifyDeploy (poll) → getDefaultUrl → associateDomain (optional)
→ checkDomainAssociaion (SIC) → markSiteLive | markSiteFailed
```

- **`seedCollections`** (front state) — lifted 17+ sequential CMS-API invokes out of the API Gateway 29s / Lambda 30s budget that was causing 504s. Reads `seed.{author,token}` + `templateType`, seeds collection groups/objects in parallel via CMS create endpoints, writes `pages`/`collectionGroups`/`integrationsUsed` back to the site doc. Failure → `markSiteFailed`; partial seeds cleaned by `VR_Secure_API/deleteSite`.
- **`createGithubBranch`** — forks a per-customer branch from `refs/heads/main` of **Vivreal_Templates** (always `main`; runtime doesn't read `templateType`).
- **`createAmplifyApp` / `startAmplifyDeploy` / `checkAmplifyDeploy`** — creates the Amplify app pointed at that branch and triggers/polls the build.
- **`associateDomain` / `checkDomainAssociaion`** — optional custom-domain wiring via Route53 (+ a domain-purchase saga for newly registered domains).
- **`markSiteLive` / `markSiteFailed`** — terminal; sets `sites.deployment.status` (`pending`/`deploying`/`live`/`failed`).

### State machine is NOT in IaC
The Deploy-Site state machine pre-dates the serverless setup; VR_Secure_API invokes it by a static ARN (`STATE_MACHINE_ID` in `hb-api-secrets`). Source of truth = `Vivreal_EventHandler/docs/ops/deploy-site-state-machine.asl.json`, pushed by `scripts/update-state-machine.sh` (idempotent; CI runs it after `serverless deploy` on `main`). **Console edits are drift and get clobbered.**

## Amplify customer sites — how they build

- Each customer site = a **git branch off `Vivreal_Templates`** with its own Amplify app. The branch builds a Next.js site that renders via `vivreal-site-renderer` against live CMS/Client-API data.
- **`createAmplifyApp` injects build env vars** so the branch builds against the right tenant: `API_KEY`, `SITE_ID`, `BUCKET_NAME` (`vivreal-{group.key}`), `CDN_BASE_URL`, collection-group IDs (`SHOWS_ID`, etc.), and `STRIPE_SECRET_KEY` if Stripe is active. Written to `.env.production` in Amplify's `preBuild` phase.

## "Sync main to site branches" — NO manual sync step

**Pushing/merging `Vivreal_Templates` `main` automatically syncs ALL customer site branches** via the GitHub Actions workflow "Sync main to site branches." This includes **site-renderer version bumps** — bumping the renderer dep on Templates main and pushing propagates to every customer branch, which then rebuilds on Amplify. **There is NO `/sync-templates` or any manual sync step, ever.** Disregard any stale "sync pending" note.

So: renderer change → publish renderer package → bump dep on Templates main → push → branches auto-sync → Amplify rebuilds → live. (The renderer publishes via its own CI on push to its `master`.)

## Debugging a stuck / wrong site

- **Stuck `pending`/`deploying`** → inspect the Step Functions execution for the failed state; check `checkAmplifyDeploy` (build failed) or `checkDomainAssociaion` (domain not yet associated).
- **`failed`** → `markSiteFailed` ran; read the execution input/output and the failing state's logs. Re-create via `createSites` after fixing.
- **"My Templates/renderer change isn't on the live site"** → either (a) you didn't push Templates `main` (branches only sync from main), (b) the renderer package wasn't published/bumped, or (c) Amplify hasn't finished rebuilding. NOT a manual-sync problem — there is none.
- **"Content created in portal missing on site"** → that's the publishDate storefront gate, not the deploy pipeline — see `vivreal-db`.

## Sources of truth

`Vivreal_EventHandler/CLAUDE.md` (pipeline internals), `Vivreal_Templates/CLAUDE.md` (branch/render model), the `createSites` section of `VR_Secure_API/CLAUDE.md`. Memory: `insight_templates_main_autosync.md`.
