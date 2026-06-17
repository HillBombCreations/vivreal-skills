# Vivreal Lambda Reserved Concurrency & Scaling

The concurrency/scaling/capacity facet of `vivreal-lambda`. (Packaging/deploy lives in `references/deploy.md`.) Pairs with `vivreal-atlas-topology` (the Mongo side).

## Mental model — reserved concurrency is a floor AND a ceiling

- AWS account concurrency limit is **1000** total.
- `ReservedConcurrentExecutions` on a function **carves out** that many slots: it guarantees the function can scale to that number AND **caps it there**. Reserved slots are subtracted from the shared `UnreservedConcurrentExecutions` pool.
- AWS enforces a **hard floor of 100** unreserved. If total reservations would drop unreserved below 100, the change/deploy is **rejected**.
- Functions WITHOUT a reservation share the unreserved pool and burst into it.

Throughput ≈ concurrency ÷ avg-duration (Little's Law). To raise throughput, lower duration or raise concurrency — but only up to the real ceiling below.

## The real ceiling is Mongo connections, NOT Lambda

The binding constraint is **not** the 1000 Lambda limit. It's:

```
concurrent-DB-executions × maxPoolSize  vs  Atlas connection cap
```

- `maxPoolSize` is **3** (Client/Secure) or **5** (CMS/Outreach, kept higher for parallel bulk writes).
- Atlas **shared tier cap = 500** connections (≈166 safe concurrent at pool 3). **M10 ≈ 1500** (≈500 safe concurrent).
- So the lever that protects the cluster is **capping the one public runaway** (VR_Client_API), not capping internal functions. Example live value: Client API capped at **120** → 120 × 3 = 360 conns < 500 Atlas cap. M10 is what actually lifts the ceiling. See `vivreal-atlas-topology`.

## The "deploy decreases unreserved below 100" failure

Symptom: a deploy that sets `ReservedConcurrentExecutions` rolls back with *"Specified ReservedConcurrentExecutions decreases account's UnreservedConcurrentExecution below its minimum value of [100]."*

Cause: too much is already reserved (DEV functions hoarding reservations is the classic culprit). Diagnose with:

```bash
aws lambda get-account-settings                 # AccountLimit + UnreservedConcurrentExecutions
aws lambda get-function-concurrency --function-name <fn>
```

Fix: free reservations that aren't needed (DEV functions you don't hit) with `aws lambda delete-function-concurrency`, then redeploy. The 2026-06-16 reallocation freed 555 DEV-hoarded slots (unreserved 104 → 659) to unblock the Client API cap.

## Right-sizing principle

Most internal functions peak ≤6 concurrent over 14 days yet were reserved 20–100. Pattern: **unreserve low-volume internal functions** (let them burst into the big shared pool), keep a small guard on the hottest internal path (e.g. GetGroupInfo at 20), and **cap only the public unbounded spiker** (Client API) to bound Mongo. Current allocation after reallocation: ~151 reserved / ~849 unreserved.

## DURABILITY GOTCHA — CLI changes revert on next deploy

`ReservedConcurrentExecutions` is **template-defined**. Any `put-function-concurrency` / `delete-function-concurrency` you run via CLI is **silently overwritten by the next CloudFormation deploy** of that stack. To make concurrency changes durable you MUST edit the IaC:

- VR_Secure_API: edit `cloudformation/*.yaml` fragments, then regenerate `cloudYamls/allRoutes.yaml` via `node scripts/merge-template.js` (CI runs this pre-deploy; the generated file is committed).
- VR_Main_API: edit `sam-template.yaml`.
- VR_CMS_API: templates currently set NO reservations (so nothing to revert there — but adding one means adding it to the fragment).
- VR_Client_API: the cap rides in the SAM template / `--parameter-overrides` in the workflow.

If concurrency "mysteriously reset," it's almost always a deploy clobbering a CLI change.

## Sources of truth

Memory: `project_lambda_concurrency_reallocation.md` (the full audit + exact numbers), `project_db_connection_gold_standard.md` and `insight_atlas_shared_tier_diagnostics.md` (the Mongo ceiling). Backend `CLAUDE.md` files for which Lambdas set reservations.
