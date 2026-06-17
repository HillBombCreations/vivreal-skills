---
name: vivreal-eventhandler-knowledge
description: Use when working in Vivreal_EventHandler — the AWS Step Functions site-deployment pipeline that branches a template, creates an Amplify app, deploys, optionally registers a custom domain, and marks the site live/failed. Covers the ordered state list (with preserved typos you must NOT rename), the seedCollections front state, the hybrid template model, Amplify env-var injection, and the Serverless-Framework + esbuild build. Triggers on: Vivreal_EventHandler, site deployment, Step Functions, Amplify deploy, createGithubBranch, seedCollections, templateType, markSiteLive, deploy pipeline. Source of truth: C:\repos\Vivreal_EventHandler\CLAUDE.md.
---

# Vivreal_EventHandler — knowledge digest

Orchestrates the **full customer-site deploy pipeline** via AWS Step Functions. Called only by `VR_Secure_API/createSites`. **Serverless Framework + esbuild** (NOT SAM), Node 20, Step Functions + Amplify + Route53 + GitHub API + DynamoDB. Read `C:\repos\Vivreal_EventHandler\CLAUDE.md` for depth.

## Pipeline (ordered — typos preserved, DO NOT rename)

```
seedCollections → createGithubBranch → createAmplifyApp → startAmplifyDeploy
→ checkAmplifyDeploy (poll) → getDefaultUrl → associateDomain (optional)
→ checkDomainAssociaion (SIC) → markSiteLive | markSiteFailed
```

Each state is its own Lambda (`vh_site_deployment_*`). State names (incl. the `checkDomainAssociaion` typo) live in the state machine definition + handlers — renaming requires coordinated updates.

- **`seedCollections`** is the front state, added to fix a 504: it lifted the 17+ sequential CMS-API invokes out of the API Gateway 29s / Lambda 30s budget (`POST /api/siteCollectionData` now <5s). Reads `seed.author` + optional `seed.token` + `templateType`, walks manifest builders in `src/shared/{templates,seeding}/`, invokes CMS create endpoints in parallel, writes `pages`/`collectionGroups`/`integrationsUsed` back to the site doc. Failure → `MarkFailed`; partial seeds cleaned up by `VR_Secure_API/deleteSite`.

## State machine is NOT in IaC

The Deploy-Site state machine pre-dates the serverless setup and is invoked by VR_Secure_API via a static ARN. Source of truth: `docs/ops/deploy-site-state-machine.asl.json`; pushed by `scripts/update-state-machine.sh` (idempotent, doesn't disturb running executions), run automatically by CI after `serverless deploy` on `main`. Console edits are drift and get clobbered.

## Template model (hybrid — read before touching deploy logic)

1. **Seed time (VR_Secure_API):** `templateType` (`ecommerce`/`showcase`) drives which collection schemas + page configs get seeded.
2. **Fork time (here):** `createBranch.js` forks from `refs/heads/main` (Option A fix 2026-04-17 — always `main`; matches all 3 existing customer sites; runtime doesn't read `templateType`).
3. **Runtime (Templates + site-renderer):** layout selection uses `pageConfigs[].format`, NOT `templateType`. `.vivreal-template.json` records `templateType` for traceability only.

Live template keys: `ecommerce`, `showcase` (6 more commented out). Live branches: `main` + per-customer branches — **no `ecommerce`/`showcase` branch exists**.

## Amplify env-var injection (createAmplifyApp)

Populates build env so Templates branches build against live data: `API_KEY`, `SITE_ID`, `BUCKET_NAME` (`vivreal-{group.key}`), `CDN_BASE_URL`, collection-group IDs (`SHOWS_ID`, etc.), and `STRIPE_SECRET_KEY` (from the `integrationKey` param if Stripe active). Written to `.env.production` in the Amplify `preBuild` phase.

## Hard rules / gotchas

- `VR_Secure_API/createSites` is the ONLY caller — don't invoke individual Lambdas directly.
- Don't rename `checkDomainAssociaion` (typo in state machine + handler).
- "Render differently for ecommerce vs showcase" belongs in Vivreal_Templates + site-renderer, NOT here (runtime ignores `templateType`).
- Keep `src/shared/{templates,seeding}/` (ESM ports) in sync with `VR_Secure_API/src/createSites/services/{templates,HelperFunctions}/` — update both repos together.
