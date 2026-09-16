---
name: vivreal-atlas-topology
description: 'Use when reasoning about Vivreal''s MongoDB Atlas at the OPS/INFRA level (cluster topology, connection capacity, a connection-saturation outage, SSL alert number 80 across backends, the `@hillbombcreations/mongo-connection` package every backend is migrating to, the shared-tier 500-conn cap that the owner stayed on 2026-09-15, the deleted DEV stacks, or why content "isn''t connecting"). This is TOPOLOGY/OPS, distinct from the vivreal-db skill (which is QUERY RULES); cross-link them. Use when diagnosing MongooseServerSelectionError, pool exhaustion, conn churn, orphaned clients, or capacity planning. Triggers on: Atlas, connection cap, SSL alert 80, ssl3_read_bytes, MongooseServerSelectionError, MongoNetworkError, connection pool, maxPoolSize, mongo-connection package, useDb view, readyState stale, admin().ping, maxTimeMS plugin, M10 upgrade, shared tier, conn saturation, dynamicDb, dbKey routing topology, DEV stack, dogfood, hb-api-secrets, per-service database user.'
---

# Vivreal MongoDB / Atlas Topology & Ops

The infrastructure/ops view of the database. For **how to write safe queries** (which DB, groupID scoping, publishDate gate, redaction) use the **`vivreal-db`** skill — that's the query-rules companion to this topology/ops skill.

## Topology — multi-tenant, three databases on ONE cluster

- **One Atlas cluster** (`vivreal.dmrw1.mongodb.net`), shared tier, hard cap 500 connections. `CLUSTER_URL` lives in each backend's own `vivreal/prod/<service>` secret (no path, no query string), **not** in `hb-api-secrets`. That secret is fully **deleted** as of 2026-09-15 (it was briefly recreated with placeholder-only values to satisfy a few DEV CloudFormation templates mid-teardown, then deleted again with no recovery window, see "The DEV environment is gone" below). All nine production service secrets, plus Outreach's second URI, still share **one Atlas services user** today (domain-search has its own read-only user, and the portal's `.mcp.json` holds a third, undocumented one). Per-service users are an approved-but-unstarted owner decision (spec section 14, below).
- **Three databases, NOT one-per-group:** `Vivreal` (mainDb control plane: `groups`, `checkoutsessions`, `leads`), `general_shared` (free/basic/pro tenant content), `pro_plus` (proplus tenant content). Tenants in a tier **share** a DB; isolation is the `groupID` field on every doc.
- **`dynamicDb[dbKey]` routing:** `dbKey` (`general_shared`/`pro_plus`) is derived from tier (`deriveDbKey()`) and selects the database connection. `dbKey` is the **database name** — not `group.key` (the S3 slug). (Full key disambiguation lives in `vivreal-db`.)

## Connection capacity — the real scaling ceiling

- **Shared tier cap = 500 connections.** Measured live 2026-08-31: `serverStatus.connections` returned `current 63, available 437`, later `current 144, available 356`. Both sum to exactly 500.
- **NEVER compute "safe concurrent" as cap ÷ maxPoolSize.** That's wrong twice over. First, it divides by ONE pool, and a warm Client/Secure/CMS/Outreach/Analytics container holds **at least two**: the main pool, PLUS one tenant pool **per `dbKey` it has served**, cached for the life of the container (`tenantDb.js:82` keeps `connObj` keyed per tenant DB). Second, and just as large, it ignores that **every `MongoClient` keeps 3 monitor sockets** (one per replica-set member) **regardless of pool traffic**: a client sitting completely idle still holds 3 sockets, not zero. The real per-client cost is `3 + k`, where `k` is 0 to `maxPoolSize` pooled sockets. Today's per-container footprint, read from source (before any backend's connection-fix PR ships, see the package section below):

  | Service | main | tenant, per dbKey | Max per warm container |
  |---|---|---|---|
  | VR_Client_API | 3 | 3 | **6** one dbKey, **9** both |
  | VR_CMS_API | 5 | 5 | **10 to 15** (largest in the estate) |
  | VR_Outreach_API | 3 | 5, plus 3 outreach | **11 to 16** |
  | VR_Secure_API | 3 | 3 | 6 to 9 |
  | VR_Client_Auth, Main Express | 3 | none | 3 |
  | EventHandler, Insights_Scan | 3 | 3 | 3 + 3N |

  (CMS's pool is **5 on every function today**, not 3. Don't round it down to match Secure/Client. It only drops to 3 on three of its five functions once the connection-fix PR ships; the two bulk writers, CreateAndUpdateColObjects and CreateAndUpdateIntegrations, stay on 5. See "The fix" below.)

- **The real binding point, measured on 2026-08-31:** 54 concurrent VR_Client_API containers x 6 = 324 conns, + authorizer peak 9 x 3 = 27, + a 63 to 144 resting fleet baseline = **414 to 495 against the 500 cap**. CloudWatch recorded exactly 54 concurrent in the minute before the first `SSL alert number 80`, with `Throttles = 0` and `Errors = 0`. **The cluster dies at roughly 54 warm containers of ONE function.** Not 166.
- **A second saturation event on 2026-09-15 showed concurrency was never the real driver.** The cluster held **441 connections while peak measured concurrency was 12**. No arithmetic based on concurrency x pool size explains that gap. The explanation is orphaned clients accumulating over time, not simultaneous load. See "Why containers accumulate connections" below.
- **The owner decided 2026-09-15 to stay on the shared tier** (not take M10). See "The tier decision" below. Reserved concurrency is sized against the existing 500 cap, not against a future 1,500.

## SSL alert number 80 = the cluster is at its connection cap

**`SSL routines:ssl3_read_bytes:tlsv1 alert internal error ... SSL alert number 80` from Mongo across MULTIPLE backends at once = the cluster is REJECTING new TLS handshakes**, almost always because it hit its connection cap. It is a **server-sent** TLS alert (Atlas aborting the handshake) — NOT a client cert/config problem and NOT a code regression. Crossing the cap makes every service fail simultaneously, surfacing as `MongooseServerSelectionError` / `MongoNetworkError` / `MongoPoolClearedError`, and as portal `serverFetchDirect upstream 500` + SSO login 500.

**Confirm:** Atlas → Metrics → **Connections** (vs limit) + Opcounters `command` line (a `command` spike tracking the connection climb = churn — every new conn burns hello/saslStart/ping = the serverless no-reuse signature).

### Shared-tier diagnostic blind spots (CORRECTED 2026-08-31)
**`db.serverStatus()` IS permitted on this cluster** and returns live connection counters, so **cluster headroom is directly readable without an Atlas Admin API key**. Measured against `atlas-c92xhg-shard-0`, MongoDB 8.0.30 enterprise. An earlier revision of this skill said not to attempt it, which cost an investigation its fastest diagnostic. What IS blocked: `$currentOp {allUsers: true}` and `hostInfo`. Still unavailable on shared tier: downloadable logs and the RTPP (both M10+).

**Per-connection attribution remains impossible, and M10 alone will NOT fix it.** Two separate causes: `$currentOp` is blocked, AND every service reads `NAME=hillbomb_api` from SSM `/vivreal/prod/shared/name`, so the whole fleet reports one `appName`. Until per-service `appName` lands, M10's RTPP shows 1,500 connections belonging to a single name. **So there's no per-appName connection attribution on shared tier** — infer the culprit from **Sentry error distribution by project** (`message:"SSL alert number 80"` grouped by project + first-seen timing). In the 2026-06-09 outage that pointed at `vr-client-api` (172/193 errors, failing ~8h before the others). M10 would attribute it in minutes.

## Why containers accumulate connections, not just concurrency

The 2026-08-31 arithmetic above explains a peak. It does not explain 441 connections held at 12 concurrent on 2026-09-15. That gap is orphaned clients, verified in mongoose 8.24.4 / mongodb 6.20.0 source:

1. **`readyState` goes stale on a frozen Lambda.** The getter reports `disconnected` after no heartbeat for 2x `heartbeatFrequencyMS` (`mongoose/lib/connection.js:117-131`). The fleet sets `heartbeatFrequencyMS: 5000`, so any idle gap of 10s or more (completely normal between invocations of a warm container) makes the NEXT invocation read `readyState !== 1`, even though the socket is perfectly fine and the driver would have reconnected it on its own.
2. **Every old-style factory (all nine backends) replaces the client on that signal, without closing the old one first** (`db.on('disconnected'|'error'|'close', …)` nulling/deleting the cache entry, then building a fresh `MongoClient` on the next call). The old client is never told to close.
3. **The orphan keeps its 3 monitor sockets for the rest of the container's life.** On Lambda the driver detects a FaaS environment and polls instead of streaming, with no RTT pinger, and idle-socket pruning never runs while the container is frozen. Nothing ever reclaims the abandoned client's sockets.
4. So a container that idles and wakes repeatedly accumulates one orphaned client, and 3 more monitor sockets, **per idle gap**, with no upper bound tied to concurrency. That is the whole explanation for "441 held at 12 concurrent."

## The fix: one `MongoClient` per container (`@hillbombcreations/mongo-connection`)

**Status 2026-09-15: approved, package not yet published, no backend has shipped its migration PR.** Check `origin/stable` on the repo in question before assuming it has moved. Until its PR lands, that backend still runs the old per-database-client shape and the "today" table above.

The design (full spec: `vivreal-hq/docs/projects/atlas-connection-fixes-2026-09-15/spec.md`):

1. **One `MongoClient` per Lambda container**, from the new package `@hillbombcreations/mongo-connection` (publishing as 1.0.0 to private GitHub Packages, pinned exact in every consumer, no repo hand-rolls a copy). Tenant, outreach and every other database are `main.useDb(dbKey, { useCache: true })` **views** of that one client, never a second `MongoClient`.
2. **No eviction, ever.** Nothing deletes a cache entry on `disconnected`, `close` or `error`. `disconnected` is logged and ignored, because the driver reconnects by itself. This directly replaces the old rule 3 below, which was the bug.
3. **Replace a client only when it is closed, or its health ping has failed continuously for 60s**, at most once per 5 minutes, and always make-before-break (connect the new client and rebind every model in place, THEN close the old one fire-and-forget, never the reverse, or every legacy `if (!db.DB.conn)` gate fails until the container dies). Erratum caught while implementing: the reference cooldown must start `lastReplacedAt = null`, not `0`. Starting at `0` makes the very first replacement impossible under the spec's own required test clock (0s/31s/62s/93s).
4. **Health ping at most once per 30s per container, never per request.** Today CMS, Secure, Client API, Outreach, Analytics and Insights all ping on every `connect()` call, and Client API calls `connect()` 3 times per request.
5. **`appName` = `process.env.AWS_LAMBDA_FUNCTION_NAME`**, passed as a client option, never the shared `NAME=hillbomb_api` SSM value that makes the whole fleet indistinguishable in Atlas today. Outside Lambda it takes an explicit `appName` argument instead, and throws if none is given (see "Script, CI, CLI and MCP connections" below for the non-Lambda naming convention).
6. **`maxPoolSize` 3 by default; 5 only for CMS's two bulk-write functions (CreateAndUpdateColObjects, CreateAndUpdateIntegrations) and every Outreach function.** Everything else, including CMS's other three functions, moves from today's numbers down to 3.
7. **Every model registers with an explicit physical `collectionName`.** Mongoose already resolves one today by lowercasing/pluralizing the model name; the fix pins that RESOLVED value (computed, not guessed, spec section 3.6), because two modules can otherwise register the same name with different schemas on a shared connection.
8. **Connection failures raise `DbUnavailableError` (HTTP 503)**, exported by the package along with `isDbUnavailable(err)`, never a swallowed error or a misleading `TypeError`.

**Per-client footprint after the fix:** 3 monitor sockets plus up to `maxPoolSize` pooled, one client per container: **4 sockets typical, `3 + maxPoolSize` at most** (6 on the default pool of 3, 8 on the pool-5 functions). That number replaces every row of the "today" table above, one backend at a time, as spec section 7's per-repo PRs ship.

If you touch a `db/` folder or build a new backend before its migration PR lands, do not invent a sixth shape. Either wait for the package or port it early; a manager that evicts on `disconnected` or pings per request is how the cluster saturates.

### What the old "gold standard" got backwards

The pre-2026-09-15 standard (originated in VR_Secure_API, rolled out fleet-wide 2026-06-09) told every backend to null the cache on `disconnected`/`error`/`close` and to ping on every `connect()`. Both are now known to be wrong: the eviction rule is exactly mechanism step 2 above, and the per-call ping is unnecessary round-trip cost the fix removes (E1 in the spec). The one rule that survives unchanged is fail-fast timeouts (`serverSelectionTimeoutMS`/`connectTimeoutMS` 5s, `waitQueueTimeoutMS` 5s, `maxIdleTimeMS` 60s). Those are still correct and are now defaults in the package.

## The DEV environment is gone (2026-09-15)

Sixteen DEV Lambdas (CMS x5, Client API x1, Secure x9, Main Express x1) connected to the **production** cluster with the **production services user** (e2e runs and manual testing included), drawing on the same 500-connection cap with production write access. The owner had the stacks deleted:

| Stack | Status |
|---|---|
| VR-CMS-API-DEV | deleted |
| VR-Client-API-DEV | deleted |
| VR-Secure-API-DEV | deleted |
| VR-Main-API-DEV | **kept for now**: it owns the production email queue (`vivreal-email-queue`/`vivreal-email-dlq`, no `DeletionPolicy`); deletion waits on the queue-rescue PR (spec section 13.3) |

Also deleted: the `dev-api`/`dev-client`/`dev-cms`/`dev-secure`.vivreal.io custom domains and their Route53 A records. **Any proxy-route fallback or scaffold template that still emits `?? 'https://dev-cms.vivreal.io'` (or `dev-secure`/`dev-api`) now points at nothing.** Pin the prod host instead.

**Two dev-named things are PRODUCTION and must never be deleted, despite the name:**
- **`VRClientAuthorizer-dev-function1`**: the live VR_Client_API site authorizer. Its stage is `dev` only because `serverless deploy` was originally run with no `--stage`; SSM `/vivreal/prod/shared/vr-client-auth-arn` is what actually points at it.
- **`VROnCallWebhook-dev-webhook`** and its `-alarmPushBridge`: the on-call Sentry webhook path.

**The `dogfood` deploy triggers are NOT yet removed.** That's a separate, still-pending PR (spec section 13.4) for CMS, Client API, Secure, Main, Outreach, Client Auth and both MCP server repos. Until it lands, a push to a stale `dogfood` branch still fires a deploy: for CMS/Secure it would try to rebuild a stack that no longer exists, and **for VR_Client_Auth specifically, `dogfood`'s default stage IS the production authorizer above.** Its stale `dogfood` branch (`c81686c`, 2026-03-12) would redeploy PRODUCTION from March code. Don't push to `dogfood` in any of these repos until the trigger-removal PR lands.

**`hb-api-secrets` is fully deleted, not merely retired.** It was briefly recreated with 56 placeholder-only values on 2026-09-15 because a few DEV CloudFormation templates still resolved `{{resolve:secretsmanager:hb-api-secrets:...}}` at delete time; once those stacks were gone it was deleted again immediately, with no recovery window. Nothing should read it going forward.

## Alarms and the monitoring contract (added 2026-09-15)

- Every Mongo-touching log group gets a metric-filter pair, namespace `Vivreal/Mongo`, matching `SSL alert number 80` / `MongoServerSelectionError` / `MongooseServerSelectionError` / `MongoWaitQueueTimeoutError` / `DbUnavailableError` / `mongo.connect_failed`: a fleet metric `ConnectFailures` (same name everywhere, one alarm covers the fleet) and a per-service `ConnectFailures-<Service>` for attribution.
- The fleet alarm `vivreal-mongo-connect-failures` (>= 5 in a minute, 2 of 3 periods) lives in `VR_Client_API/cloudformation/shared-alarms.yaml`, alongside the account's other shared alarms. Its `OKActions` is deliberate: a long-red alarm never re-notifies (memory note), so the OK transition is what tells a human it ended.
- **CMS and Secure cannot create `AWS::Logs::MetricFilter` themselves** (their deploy role lacks `logs:DescribeMetricFilters`), so those two repos emit `ConnectFailures`/`ConnectFailures-<service>` from application code instead of a CloudFormation metric filter. Don't hand back a `MetricFilter` fragment for CMS or Secure as "the fix"; check whether the app-code path landed there instead.
- **No Atlas Admin API key exists** (2026-09-15, confirmed again on the second saturation event). A read-only one in Secrets Manager is still an open owner decision. Without it, Atlas's own connection alerts and the Real-Time Performance Panel stay unreadable from AWS, which is why the fleet alarm above is the only automated signal today.

## Script, CI, CLI and MCP connections (spec section 11)

Every non-Lambda connector (a one-off script, a GitHub Action, a CLI, an MCP server) follows the same rules, checkable by eye in review:

1. `maxPoolSize: 1` for a script or CI job (2 if it runs work in parallel), `2` for an MCP server. `minPoolSize: 0`.
2. An `appName` naming the caller: `script:<repo>/<file>`, `ci:<repo>/<workflow>`, `cli:<tool>/<command>`, `mcp:<who>`, `ops:<task>`. Without it, every connection still reports as the shared `hillbomb_api`.
3. Close in `finally`, awaited, its rejection swallowed: `finally { await client.close().catch(() => {}); }`, before any `process.exit` on a long run.
4. Fail-fast timeouts: `serverSelectionTimeoutMS`/`connectTimeoutMS` 5000 to 8000ms; a long-lived tool also sets `maxIdleTimeMS: 60000`.
5. A read-only database user when the connector only reads, and `--readOnly` / `MDB_MCP_READ_ONLY` in MCP servers.
6. No literal credentials in git (read from Secrets Manager or `${VAR}` in `.mcp.json`), and pin the MCP server version, never `@latest`.

`vivreal-db-explorer`'s launcher (`scripts/launch-mongo-mcp.cjs`) is the reference implementation: it reads `vivreal/prod/main-api` (never the deleted `hb-api-secrets`), forces `MDB_MCP_READ_ONLY=true`, pins `mongodb-mcp-server@1.13.0`, and appends `maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer` to whatever connection string it resolves. **Its one open gap:** `vivreal/prod/main-api`'s user can write. Spec section 14 proposes a dedicated read-only `dev-tools-ro` user for MCP/CLI use, and that user does not exist yet. Point the launcher at it once it does; don't invent a secret id ahead of that work.

The portal's `.mcp.json` is the counter-example: a literal password for a THIRD Atlas user, tracked in git since 2026-03-26, no pool limit, not read-only. Rotating it (deleting that Atlas user, not just editing the file) is a separate, still-open owner decision (spec section 10).

## Per-service database users (owner decision, not started)

All nine production service secrets, plus Outreach's second URI, share ONE Atlas services user today. Spec section 14 proposes one user per service (`vr-cms`, `vr-client-api`, `vr-secure` for Secure+EventHandler, `vr-main`, `vr-outreach`, `vr-analytics` for Analytics+Insights, and a **read-only** `vr-client-auth` since that service does exactly one `findOne`), plus a shared read-only `dev-tools-ro` for MCP/CLI use and an `ops-rw` for deliberate backfills. **None of this exists yet.** It is approved but unstarted. Don't describe today's Atlas as already having per-service isolation.

## The tier decision (owner, 2026-09-15): stay on the shared tier

**The owner decided to stay on the shared 500-connection tier rather than take M10** (roughly $60/mo saved), so the connection fix above plus reserved-concurrency sizing against the existing 500 cap carry all the relief. There is no tier upgrade in the current plan. Budget: 150 sockets reserved for the resting baseline, 20 for developer tooling and scripts, leaving about 330 usable for Lambda (roughly 82 warm containers at 4 sockets each). Client API's reserved concurrency drops from 150 to 100; Main Express is held **unreserved** until its 2026-09-11 67-concurrency hour is explained (spec section 8). If the fleet alarm above fires again after the fix ships, or the weekly `serverStatus` reading stays uncomfortable, M10 is still on the table. It just is not the current plan, and nothing here should tell someone to upgrade the tier "before" or "instead of" shipping the connection fix.

## Sources of truth

**Primary, 2026-09-15 onward:** `vivreal-hq/docs/projects/atlas-connection-fixes-2026-09-15/spec.md` (the mechanism, the package, the sizing), its `inventory.md` and `cleanup-log.md` in the same folder. `vivreal-hq/docs/projects/atlas-saturation-2026-08-31/findings.md` is the first incident and the original source of the `serverStatus`/"166" corrections. Companion skill: `vivreal-db` (query rules). Memory: `project_db_connection_gold_standard.md` (historical: describes the REPLACED standard above), `insight_atlas_shared_tier_diagnostics.md`, `project_lambda_concurrency_reallocation.md`, `project_mongo_tier_ai_actions_cost_proposal.md` (its M10 recommendation is superseded by the tier decision above). Until a given backend's migration PR ships, its `shared/db/` folder is still the old shape, not a reference for the new one.
