---
name: vivreal-deploy-tracker
description: Use to actively CHECK the live deploy status of a customer site — is it pending/deploying/live/failed, which Step Functions state is it stuck or failing in, and what does Amplify say. Drives AWS (Step Functions + Amplify) and the sites.deployment doc to pinpoint a hung or failed deploy. For how the pipeline WORKS (the design), see vivreal-site-deploy-pipeline; this skill is the active runbook for tracking a specific deploy. Triggers on: deploy status, is the site live, site stuck pending, why did the deploy fail, track deployment, check amplify build, step functions execution for site, deployment status of <site>.
---

# Vivreal Deploy Tracker — active site-deploy status check

Tells you, for a given customer site, **where its deploy actually is right now** and
**why it's stuck/failed**. Read-only AWS + Mongo. For the pipeline design (state order,
auto-sync, env-var injection) read `vivreal-site-deploy-pipeline`; this is the runbook for
checking ONE deploy.

**Region:** `us-east-1`. **State machine:** `Deploy-Site` (ARN in `hb-api-secrets:STATE_MACHINE_ID`).
**Ordered states** (typos are REAL — do not "fix" them):
`seedCollections → createGithubBranch → createAmplifyApp → startAmplifyDeploy →
checkAmplifyDeploy → getDefaultUrl → associateDomain → checkDomainAssociaion →
markSiteLive | markSiteFailed`.

## Inputs you can start from
A group key / site key / site name, a `sites._id`, or an Amplify `appId`. Resolve to the
`sites` doc first (it carries `deployment.appId` + `deployment.status`).

## Procedure

### 1. Read the site's recorded deploy state (Mongo, read-only)
Use the `vivreal-db` skill to connect. The `sites` collection lives in the **tenant DB**
(`general_shared` for free/basic/pro, `pro_plus` for proplus) — resolve the group's `tier`
from `Vivreal.groups` first if you only have a group key.
```
sites.findOne({ groupID: "<gid>" })  // or { key: "<siteSlug>" }, scoped by groupID
  → deployment: { status, message, errorMessage, updatedAt, appId }
```
- `status: live` → done. Report the `domainInformation.live_url`.
- `status: failed` → `markSiteFailed` ran; `deployment.message`/`errorMessage` has the reason. Go to step 2 to find the failing state.
- `status: pending`/`deploying` → in flight or stuck. Go to step 2.

**Shortcut:** the `mcp__awslabs_lambda-tool-mcp-server__vh_site_deployment_check` tool (available
to the `vivreal-ops` agent) wraps steps 1–2 — dispatch `vivreal-ops` if you have it and want a one-shot.

### 2. Find the Step Functions execution and its current/failed state
```bash
SM_ARN=$(aws stepfunctions list-state-machines --region us-east-1 \
  --query "stateMachines[?name=='Deploy-Site'].stateMachineArn" --output text)
# most recent executions (match the one whose input has this siteId/groupID)
aws stepfunctions list-executions --region us-east-1 --state-machine-arn "$SM_ARN" \
  --max-results 20 --query "executions[].{name:name,status:status,start:startDate}" --output table
# then, for the matching execution:
aws stepfunctions get-execution-history --region us-east-1 --execution-arn "<exec-arn>" \
  --reverse-order --max-results 25 \
  --query "events[?contains(type,'State') || contains(type,'Failed')].[type,stateEnteredEventDetails.name,executionFailedEventDetails.cause]" --output table
```
- The last `*StateEntered` with no following `*StateExited` = where it's **hung**.
- A `*Failed` / `TaskFailed` event = where it **broke**; the `cause` is the error.
- Map the state to its meaning:
  - `seedCollections` stuck/failed → CMS seeding hit the 29s/30s budget or a create endpoint errored (partial seeds get cleaned by `VR_Secure_API/deleteSite`).
  - `createGithubBranch` failed → GitHub branch fork from `Vivreal_Templates@main` failed (token/permissions).
  - `checkAmplifyDeploy` stuck/failed → the Amplify build itself — go to step 3.
  - `checkDomainAssociaion` (SIC) stuck → Route53 domain association not complete yet.

### 3. Check the Amplify build (when the Amplify states are implicated)
Use `deployment.appId` from step 1.
```bash
aws amplify list-branches --region us-east-1 --app-id "<appId>" \
  --query "branches[].branchName" --output text
aws amplify list-jobs --region us-east-1 --app-id "<appId>" --branch-name "<branch>" \
  --max-results 5 --query "jobSummaries[].{id:jobId,status:status,reason:statusReason}" --output table
# for a failed job, get the failing step:
aws amplify get-job --region us-east-1 --app-id "<appId>" --branch-name "<branch>" --job-id "<jobId>" \
  --query "job.steps[].{step:stepName,status:status,reason:statusReason}" --output table
```
- A `FAILED` job step (usually `BUILD`) with its `statusReason` is the root cause. Common: missing/stale
  build env var (`API_KEY`/`SITE_ID`/`BUCKET_NAME`/collection-group IDs injected by `createAmplifyApp`),
  a renderer/Templates build break, or a private-package install failure (`@hillbombcreations/*` — see
  the GitHub Packages note in the package-update skill).

### 4. Report
- Current `deployment.status` + `updatedAt`.
- The Step Functions state it's IN or FAILED at, with the failure `cause`.
- If Amplify-related: the job status + failing step `statusReason`.
- One-line root cause + the next action (re-run `createSites` after fix, push Templates `main`, wait on Route53, etc.).

## Gotchas
- **"My Templates/renderer change isn't live"** is usually NOT a stuck deploy — it's the auto-sync/publish
  chain (push Templates `main` → branches auto-sync → Amplify rebuilds). See `vivreal-site-deploy-pipeline`.
- **"Content created in portal missing on site"** is the `publishDate` storefront gate, not the deploy — see `vivreal-db`.
- The state machine is NOT in IaC; console edits are drift. Source of truth is
  `Vivreal_EventHandler/docs/ops/deploy-site-state-machine.asl.json`.
- All AWS calls here are read-only (`list-*`, `get-*`, `describe-*`). Never `start-execution`/`start-job` without explicit user ask.
