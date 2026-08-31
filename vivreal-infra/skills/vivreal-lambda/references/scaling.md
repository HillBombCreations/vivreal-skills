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

- `maxPoolSize` is **3** (Client/Secure) or **5** (CMS/Outreach, kept higher for parallel bulk writes), **but that is per POOL, and a warm container holds more than one.** A container caches its main pool plus one tenant pool per `dbKey` it has served. Real per-container footprint: Client **6 to 9**, CMS **10 to 15**, Outreach **11 to 16**, Secure **6 to 9**. Multiply by the pool COUNT, not by `maxPoolSize`.
- Atlas **shared tier cap = 500** connections. **M10 ≈ 1500**.
- **Do not use "cap ÷ maxPoolSize".** Measured 2026-08-31: **54** concurrent VR_Client_API containers saturated the 500-conn cluster (324 conns from this function alone, plus authorizer and fleet baseline). The old ≈166 figure was 3x optimistic. Full arithmetic in `vivreal-atlas-topology`.
- **Capping the one public runaway is NOT sufficient and, before an M10, is actively risky.** VR_Client_API sits at `ReservedConcurrentExecutions: 150` and that ceiling has never bound; `Throttles` were 0 through the saturation event because the cluster died first. Meanwhile 553 unreserved slots stay reachable by CMS, Outreach, Secure, Main and EventHandler, which dominated every earlier episode. And a ceiling that DOES bind renders as silent empty sections on live customer sites, not a visible 5xx. **Upgrade the tier before capping.** See `vivreal-atlas-topology`.

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
