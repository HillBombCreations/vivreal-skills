---
name: vivreal-atlas-topology
description: Use when reasoning about Vivreal's MongoDB Atlas at the OPS/INFRA level — cluster topology, connection capacity, a connection-saturation outage (SSL alert number 80 across backends), the connection-manager "gold standard" every backend must follow, the shared-tier 500-conn cap vs M10, or why content "isn't connecting". This is TOPOLOGY/OPS — distinct from the vivreal-db skill (which is QUERY RULES); cross-link them. Use when diagnosing MongooseServerSelectionError, pool exhaustion, conn churn, or capacity planning. Triggers on: Atlas, connection cap, SSL alert 80, ssl3_read_bytes, MongooseServerSelectionError, MongoNetworkError, connection pool, maxPoolSize, gold standard connection, admin().ping, maxTimeMS plugin, M10 upgrade, shared tier, conn saturation, dynamicDb, dbKey routing topology.
---

# Vivreal MongoDB / Atlas Topology & Ops

The infrastructure/ops view of the database. For **how to write safe queries** (which DB, groupID scoping, publishDate gate, redaction) use the **`vivreal-db`** skill — that's the query-rules companion to this topology/ops skill.

## Topology — multi-tenant, three databases on ONE cluster

- **One Atlas cluster** (`vivreal.dmrw1.mongodb.net`), connection string `CLUSTER_URL` in `hb-api-secrets` (shared by all backends, user `justinceccarelli`).
- **Three databases, NOT one-per-group:** `Vivreal` (mainDb control plane: `groups`, `checkoutsessions`, `leads`), `general_shared` (free/basic/pro tenant content), `pro_plus` (proplus tenant content). Tenants in a tier **share** a DB; isolation is the `groupID` field on every doc.
- **`dynamicDb[dbKey]` routing:** `dbKey` (`general_shared`/`pro_plus`) is derived from tier (`deriveDbKey()`) and selects the database connection. `dbKey` is the **database name** — not `group.key` (the S3 slug). (Full key disambiguation lives in `vivreal-db`.)

## Connection capacity — the real scaling ceiling

- **Shared tier cap = 500 connections.** Measured live 2026-08-31: `serverStatus.connections` returned `current 63, available 437`, later `current 144, available 356`. Both sum to exactly 500.
- **NEVER compute "safe concurrent" as cap ÷ maxPoolSize.** That divides by ONE pool. A warm Client/Secure/CMS/Outreach/Analytics container holds **at least two**: the main pool, PLUS one tenant pool **per `dbKey` it has served**, cached for the life of the container (`tenantDb.js:82` keeps `connObj` keyed per tenant DB). Per-container footprint, read from source:

  | Service | main | tenant, per dbKey | Max per warm container |
  |---|---|---|---|
  | VR_Client_API | 3 | 3 | **6** one dbKey, **9** both |
  | VR_CMS_API | 5 | 5 | **10 to 15** (largest in the estate) |
  | VR_Outreach_API | 3 | 5, plus 3 outreach | **11 to 16** |
  | VR_Secure_API | 3 | 3 | 6 to 9 |
  | VR_Client_Auth, Main Express | 3 | none | 3 |
  | EventHandler, Insights_Scan | 3 | 3 | 3 + 3N |

- **The real binding point, measured on 2026-08-31:** 54 concurrent VR_Client_API containers x 6 = 324 conns, + authorizer peak 9 x 3 = 27, + a 63 to 144 resting fleet baseline = **414 to 495 against the 500 cap**. CloudWatch recorded exactly 54 concurrent in the minute before the first `SSL alert number 80`, with `Throttles = 0` and `Errors = 0`. **The cluster dies at roughly 54 warm containers of ONE function.** Not 166.
- **M10 (dedicated) ≈ 1500 connections** AND unlocks downloadable logs + the Real-Time Performance Panel. M10 is what makes VR_Client_API's deployed `ReservedConcurrentExecutions: 150` honest: 150 x 9 = 1,350 against 1,500 is thin but real, against 500 it is fiction.
- **Reserved concurrency on VR_Client_API alone does not protect the cluster.** The account holds `UnreservedConcurrentExecutions: 553`, every slot reachable by CMS x5, Outreach x4, Secure, Main Express, the authorizer and EventHandler x33, all pointed at the same 500. The old "120 x 3 = 360 < 500" justification was this same single-pool error. Cap the fleet, and upgrade the tier BEFORE capping, or a binding ceiling shows up as **empty sections on live customer sites** (Templates' `clientFetchCached` returns `{ items: [], totalCount: 0 }` on a non-2xx). See `vivreal-lambda`.

## SSL alert number 80 = the cluster is at its connection cap

**`SSL routines:ssl3_read_bytes:tlsv1 alert internal error ... SSL alert number 80` from Mongo across MULTIPLE backends at once = the cluster is REJECTING new TLS handshakes**, almost always because it hit its connection cap. It is a **server-sent** TLS alert (Atlas aborting the handshake) — NOT a client cert/config problem and NOT a code regression. Crossing the cap makes every service fail simultaneously, surfacing as `MongooseServerSelectionError` / `MongoNetworkError` / `MongoPoolClearedError`, and as portal `serverFetchDirect upstream 500` + SSO login 500.

**Confirm:** Atlas → Metrics → **Connections** (vs limit) + Opcounters `command` line (a `command` spike tracking the connection climb = churn — every new conn burns hello/saslStart/ping = the serverless no-reuse signature).

### Shared-tier diagnostic blind spots (CORRECTED 2026-08-31)
**`db.serverStatus()` IS permitted on this cluster** and returns live connection counters, so **cluster headroom is directly readable without an Atlas Admin API key**. Measured against `atlas-c92xhg-shard-0`, MongoDB 8.0.30 enterprise. An earlier revision of this skill said not to attempt it, which cost an investigation its fastest diagnostic. What IS blocked: `$currentOp {allUsers: true}` and `hostInfo`. Still unavailable on shared tier: downloadable logs and the RTPP (both M10+).

**Per-connection attribution remains impossible, and M10 alone will NOT fix it.** Two separate causes: `$currentOp` is blocked, AND every service reads `NAME=hillbomb_api` from SSM `/vivreal/prod/shared/name`, so the whole fleet reports one `appName`. Until per-service `appName` lands, M10's RTPP shows 1,500 connections belonging to a single name. **So there's no per-appName connection attribution on shared tier** — infer the culprit from **Sentry error distribution by project** (`message:"SSL alert number 80"` grouped by project + first-seen timing). In the 2026-06-09 outage that pointed at `vr-client-api` (172/193 errors, failing ~8h before the others). M10 would attribute it in minutes.

## The connection-manager GOLD STANDARD (every backend must follow)

Originated in VR_Secure_API (`shared/db/createMainDb.js` + `createTenantDb.js`); rolled out to Client/CMS/Outreach on 2026-06-09 after the outage (VR_Client_API's un-refactored managers — swallowed errors → `undefined.sites` crashes, no connect dedupe, leaked stale conns — were the saturation root cause as the public unbounded service). The seven rules:

1. **Cache** the connection across warm Lambda invocations (`readyState === 1`).
2. **In-flight connect dedupe** per key (`connectPromise` / `connectPromises[dbKey]`) — anti-dogpile.
3. **Dead-socket invalidation** — `db.on('disconnected'|'error'|'close', …)` nulls/deletes the cached entry.
4. **`admin().ping()` liveness check on MAIN connections only** (2s race) — catches stale-but-`readyState:1` sockets from Lambda-freeze/Atlas-reap. NOT on the hot tenant path (uses #5 instead → no per-render latency).
5. **`maxTimeMS` schema plugin** — server-enforced per-op timeout on find/update/delete/aggregate; **deliberately OMITS insertMany/bulkWrite** so bulk imports/upserts aren't clipped. Kills the "25s silent hang holding a connection" death-spiral. (`maxTimeMS` tuned per repo: Client 10s, CMS/Outreach 15s.)
6. **Rethrow connect errors** — fail-fast clean 5xx, never a silent `undefined`.
7. **Fail-fast timeouts** — serverSelection/connect 5s, heartbeat 5s, waitQueue 5s, maxIdle 60s.

If you build a new backend or touch a connection manager, match all seven. A manager that swallows connect errors or skips dedupe is how the cluster saturates.

## Capacity action items (from the outage)

1. **Upgrade Atlas shared → M10** (1500 conns + logs + RTPP) — the durable fix.
2. **Then** cap VR_Client_API reserved concurrency in its SAM template (capping before M10 risks 503ing customer sites on a 500-cap cluster).

## Sources of truth

Memory: `project_db_connection_gold_standard.md`, `insight_atlas_shared_tier_diagnostics.md`, `project_lambda_concurrency_reallocation.md`, `project_mongo_tier_ai_actions_cost_proposal.md`. Companion skill: `vivreal-db` (query rules). The shared `shared/db/` modules in VR_Secure_API are the reference implementation.
