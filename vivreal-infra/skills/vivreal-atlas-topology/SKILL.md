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

- **Shared tier cap = 500 connections.** Per-Lambda `maxPoolSize` is **3** (Client/Secure) or **5** (CMS/Outreach). Safe concurrent ≈ cap ÷ pool ≈ **166** on shared tier.
- **M10 (dedicated) ≈ 1500 connections** (≈500 safe concurrent) AND unlocks downloadable logs + the Real-Time Performance Panel.
- This is why the public, unbounded VR_Client_API is the one capped via reserved concurrency (120 × 3 = 360 < 500). See `vivreal-lambda`.

## SSL alert number 80 = the cluster is at its connection cap

**`SSL routines:ssl3_read_bytes:tlsv1 alert internal error ... SSL alert number 80` from Mongo across MULTIPLE backends at once = the cluster is REJECTING new TLS handshakes**, almost always because it hit its connection cap. It is a **server-sent** TLS alert (Atlas aborting the handshake) — NOT a client cert/config problem and NOT a code regression. Crossing the cap makes every service fail simultaneously, surfacing as `MongooseServerSelectionError` / `MongoNetworkError` / `MongoPoolClearedError`, and as portal `serverFetchDirect upstream 500` + SSO login 500.

**Confirm:** Atlas → Metrics → **Connections** (vs limit) + Opcounters `command` line (a `command` spike tracking the connection climb = churn — every new conn burns hello/saslStart/ping = the serverless no-reuse signature).

### Shared-tier diagnostic blind spots
On M0/M2/M5, even as `atlasAdmin` you CANNOT use `$currentOp` / `db.serverStatus()` / `getLog` (the MCP `mongodb-logs` tool) — Atlas blocks data-plane admin commands on managed clusters. No downloadable logs, no RTPP (both M10+). **So there's no per-appName connection attribution on shared tier** — infer the culprit from **Sentry error distribution by project** (`message:"SSL alert number 80"` grouped by project + first-seen timing). In the 2026-06-09 outage that pointed at `vr-client-api` (172/193 errors, failing ~8h before the others). M10 would attribute it in minutes.

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
