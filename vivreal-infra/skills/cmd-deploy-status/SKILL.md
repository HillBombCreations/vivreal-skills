---
description: Check the live deploy status of a Vivreal customer site — pending/deploying/live/failed, which Step Functions state it's stuck/failing in, and the Amplify build outcome. Read-only.
argument-hint: <group key | site key | site name | sites _id | Amplify appId>
---

You are checking a customer site's deploy status. The user invoked `/deploy-status` with: **$ARGUMENTS**

Follow the `vivreal-deploy-tracker` skill exactly. In short:

1. Read the skill `vivreal-deploy-tracker` (and `vivreal-db` for the Mongo connection).
2. Resolve **$ARGUMENTS** to the `sites` doc; read `deployment.{status, appId, message, updatedAt}`
   (the `sites` collection is in the tenant DB — resolve the group's `tier` from `Vivreal.groups` first).
3. If not `live`, find the `Deploy-Site` Step Functions execution for this site and the state it is IN or FAILED at
   (`aws stepfunctions list-executions` / `get-execution-history`, region `us-east-1`).
4. If the Amplify states are implicated, check the build via `aws amplify list-jobs/get-job` using `deployment.appId`.
5. Report: current status, the stuck/failed state + cause, Amplify failing step if any, one-line root cause, and the next action.

All AWS calls are read-only (`list-*`/`get-*`/`describe-*`). Never start an execution or build without an explicit user request.
If you have the `vivreal-ops` agent available, you may dispatch it for the one-shot `vh_site_deployment_check` instead.
