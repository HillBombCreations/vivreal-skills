---
name: vivreal-atlas-topology
description: 'Use when reasoning about Vivreal''s MongoDB Atlas at the OPS/INFRA level (cluster topology, the M10 tier''s connection cap and connection-rate limit, connection capacity, a connection-saturation outage, the data-out throttle that made reads slow with no errors on the old M0 tier, SSL alert number 80, the `@hillbombcreations/tenant-db` package, the deleted DEV stacks, or why content "isn''t connecting"). This is TOPOLOGY/OPS, distinct from the vivreal-db skill (QUERY RULES); cross-link them. Use when diagnosing MongooseServerSelectionError, pool exhaustion, orphaned clients, slow site reads, or capacity planning. Triggers on: Atlas, M10, connection rate limit, M0, Flex, data transfer limit, data-out throttle, slow reads, ClientApiSlowFetch, connection cap, SSL alert 80, MongooseServerSelectionError, MongoNetworkError, connection pool, maxPoolSize, tenant-db package, useDb view, readyState stale, stale primary, shared tier, conn saturation, dynamicDb, DEV stack, dogfood, per-service database user.'
---

# Vivreal MongoDB / Atlas Topology & Ops

The infrastructure/ops view of the database. For **how to write safe queries** (which DB, groupID scoping, publishDate gate, redaction) use the **`vivreal-db`** skill, that's the query-rules companion to this topology/ops skill.

## Topology: multi-tenant: a few databases on ONE cluster

- **One Atlas cluster** (`vivreal.dmrw1.mongodb.net`) on the **M10** tier since **2026-10-17** (moved from M0 Free; the cluster came back at 02:50Z, and the `Vivreal/Mongo` `ConnectionsCap` metric reads 1500 from the 02:00Z hour on). M10 is three nodes with a **1,500 connection limit per node, 10 of them reserved by Atlas, so 1,490 usable**, and a **connection-creation rate limit of 15 per second per node** (see "M10 limits" below). Read `ConnectionsCap` and the Atlas UI badge before quoting either; the M0-era numbers further down are history. `CLUSTER_URL` lives in each backend's own `vivreal/prod/<service>` secret (no path, no query string), **not** in `hb-api-secrets`. That secret is fully **deleted** as of 2026-09-15 (it was briefly recreated with placeholder-only values to satisfy a few DEV CloudFormation templates mid-teardown, then deleted again with no recovery window, see "The DEV environment is gone" below). All nine production service secrets, plus Outreach's second URI, still share **one Atlas services user** today (domain-search has its own read-only user, and the portal's `.mcp.json` holds a third, undocumented one). Per-service users are an approved-but-unstarted owner decision (spec section 14, below).
- **A few databases, NOT one-per-group:** `Vivreal` (mainDb control plane: `groups`, `checkoutsessions`, `leads`, `media_files` and more), `outreach` (VR_Outreach_API suppressions), and the tenant content **pods**, `pod_01`, `pod_02` and onward. List them (`list-databases`) rather than trusting this line. **`general_shared` and `pro_plus` no longer exist:** the pod rename executed in September 2026 and both names sit in `FORBIDDEN_PLACEMENTS` (`@hillbombcreations/tenant-db`), so a script that hardcodes either connects fine and returns a FALSE ZERO. Many groups **share** a pod and tier does not decide which (one pod holds free and paid groups alike); isolation is the `groupID` field on every doc.
- **`dynamicDb[dbKey]` routing:** `dbKey` is the tenant database name, **read from the group document**, never derived from the tier. `resolvePlacement(group)` is the only way to get one and it throws rather than guessing. `dbKey` is not `group.key`, which is the S3 slug. (Full key disambiguation lives in `vivreal-db`.) Two traps that follow from the routing shape: the module-level map is re-read across async gaps by most callers, so a socket event landing between the connect and the read can change what they get, and a grep for one spelling of the map access under-reports the surface badly because several spellings are in use.

## Connection capacity: the real scaling ceiling

- **The cap is per node: 1,500 on M10, 1,490 usable.** `serverStatus.connections` (`current` plus `available`) and the `Vivreal/Mongo` `ConnectionsCap` metric read it live. **History:** on M0 the cap was 500 for the whole cluster (measured 2026-08-31: `current 63, available 437`, later `current 144, available 356`, both summing to 500) until 2026-10-17.
- **Count sockets on the PRIMARY, since the cap is per node.** On Lambda the driver polls instead of streaming, so a client holds one monitor socket per node and no RTT socket; pooled sockets go to the primary only (`readPreference` primary). **Primary sockets per warm container = 1 + `maxPoolSize`** with the shared package (one client per container, tenant databases as `useDb` views that own no sockets). Each secondary sees one socket per container.
- **NEVER compute "safe concurrent" as cap ÷ maxPoolSize.** It ignores the monitor socket above, every non-Lambda connector, and the cluster's own internal connections (part of a post-M10 floor of 65 to 78 in `ConnectionsCurrent`). On the OLD per-database factories it was wrong twice over: a warm container held a main pool PLUS one tenant pool **per `dbKey` it had served** (`tenantDb.js:82`), and every `MongoClient` kept 3 monitor sockets (one per replica-set member) regardless of traffic, so the per-client cost was `3 + k`. The per-container footprint before the shared package, kept as history for any repo still on its old `shared/db/` folder:

  | Service | main | tenant, per dbKey | Max per warm container |
  |---|---|---|---|
  | VR_Client_API | 3 | 3 | **6** one dbKey, **9** both |
  | VR_CMS_API | 5 | 5 | **10 to 15** (largest in the estate) |
  | VR_Outreach_API | 3 | 5, plus 3 outreach | **11 to 16** |
  | VR_Secure_API | 3 | 3 | 6 to 9 |
  | VR_Client_Auth, Main Express | 3 | none | 3 |
  | EventHandler, Insights_Scan | 3 | 3 | 3 + 3N |

  (Under the old factories CMS's pool was 5 on every function, not 3. The shared package's default is 3, with 5 on the pool-5 functions and 2 on two; read the value a function passes rather than assuming the default.)

- **History, the M0 binding point measured on 2026-08-31:** 54 concurrent VR_Client_API containers x 6 = 324 conns, + authorizer peak 9 x 3 = 27, + a 63 to 144 resting fleet baseline = 414 to 495 against M0's 500 cap. CloudWatch recorded exactly 54 concurrent in the minute before the first `SSL alert number 80`, with `Throttles = 0` and `Errors = 0`.
- **A second saturation event on 2026-09-15 showed concurrency was never the real driver.** The cluster held **441 connections while peak measured concurrency was 12**. No arithmetic based on concurrency x pool size explains that gap. The explanation is orphaned clients accumulating over time, not simultaneous load. See "Why containers accumulate connections" below.
- **Reserved concurrency was sized against M0's 500 cap and never re-derived for M10.** If every reserved slot were a warm container holding a full pool, the fleet would open about **1,719 primary sockets against 1,490 usable** (research 2026-10-17, section 5, read on that date). Realistic peaks are far lower (account-wide concurrency never passed 57 in the 14 days before), so the cap is not today's risk, but the reservations promise more than the cluster can hold. Re-derive the sum from live reserved concurrency before sizing anything; do not size against 500 again.
- **The connection-creation rate is the nearer wall on M10.** 15 new connections per second per node, always on; above it Atlas queues new connections, and drops some if the overload is sustained. A cold container opens about 2 new primary connections, so roughly 7 cold containers a second start queuing, and every busy container reopens its pool to the new primary after an election (including Atlas's weekly rolling maintenance). A queued handshake longer than the 5 s connect timeout fails as `DbUnavailableError` (503). This is inferred from the documented limit and the timeouts and has not been observed, because nothing measured the creation rate when it was written; check what `atlas-monitor` publishes now before claiming either way.

## SSL alert number 80 = the cluster is at its connection cap

**`SSL routines:ssl3_read_bytes:tlsv1 alert internal error ... SSL alert number 80` from Mongo across MULTIPLE backends at once = the cluster is REJECTING new TLS handshakes**, almost always because it hit its connection cap. It is a **server-sent** TLS alert (Atlas aborting the handshake), NOT a client cert/config problem and NOT a code regression. Crossing the cap makes every service fail simultaneously, surfacing as `MongooseServerSelectionError` / `MongoNetworkError` / `MongoPoolClearedError`, and as portal `serverFetchDirect upstream 500` + SSO login 500.

**Confirm:** Atlas → Metrics → **Connections** (vs limit) + Opcounters `command` line (a `command` spike tracking the connection climb = churn, every new conn burns hello/saslStart/ping = the serverless no-reuse signature).

### Diagnostics: what is readable
**`db.serverStatus()` IS permitted** and returns live connection counters, so **cluster headroom is directly readable without an Atlas Admin API key** (`atlas-monitor` reads it every minute into the `Vivreal/Mongo` metrics). An earlier revision of this skill said not to attempt it, which cost an investigation its fastest diagnostic. On M0, `$currentOp {allUsers: true}` and `hostInfo` were blocked and downloadable logs and the Real-Time Performance Panel did not exist; M10 offers the last two in the Atlas UI. Re-test `$currentOp` before saying it is still blocked.

**Attribution by `appName` works for `@hillbombcreations/tenant-db` consumers.** The package sets `appName` to `AWS_LAMBDA_FUNCTION_NAME` when the URI carries none, and the production URIs carry none, so Atlas sees the function name. The old blind spot (every service reporting `NAME=hillbomb_api` from SSM `/vivreal/prod/shared/name`) survives only in connectors that hand-roll a client, domain-search among them. Where `appName` does not help, infer the culprit from **Sentry error distribution by project** (`message:"SSL alert number 80"` grouped by project + first-seen timing); in the 2026-06-09 outage that pointed at `vr-client-api` (172/193 errors, failing ~8h before the others).

## M10 limits (live since 2026-10-17)

Read MongoDB's `atlas-limits` page before quoting a number; these were read there on 2026-10-17.

| Limit | M10 | What happens over it |
|---|---|---|
| Connections | 1,500 per node, 10 reserved by Atlas (1,490 usable) | new connections refused |
| Connection creation rate | 15 per second per node, always on | queued; dropped if the overload is sustained |
| Data transfer | no quota (the M0 throttle below is gone) | |
| RAM / storage | 2 GB / 10 GB default | |

**A stale primary after a cluster move or election reset.** After the M0 to M10 move, warm processes logged `primary marked stale due to electionId/setVersion mismatch`: the new replica set restarted its election counter below the one the driver remembered, and the driver never recovers from that by itself. Only a new `MongoClient` does, a cold start or the package's self-heal (replace after 60 s of failing health pings, at most once per 5 minutes; callers get `DbUnavailableError` 503 meanwhile). A hand-rolled client with no replace path (domain-search) stays broken until its containers recycle.

## History: M0 Free limits, and the data-out throttle (2026-10, before M10)

**Not the live tier since 2026-10-17.** Kept because the method below (telling a byte throttle from connection saturation) applies to any shared tier, and because the 2026-10 release's slow pages are explained here. MongoDB documented these limits for M0 Free (`docs/atlas/reference/free-shared-limitations`, read 2026-10-13):

| Limit | M0 Free | What happens over it |
|---|---|---|
| Data transfer | **10 GB in and 10 GB out per ROLLING 7 days** | Atlas throttles the cluster's network speed (measured here at about 90 KB/s) |
| Throughput | **100 ops/s** | per-connection one-second cooldown, a fixed queue delay per operation |
| Connections | 500 | TLS handshakes refused (SSL alert 80, above) |
| Databases / collections | **100 / 500** | creation fails; every pod and stray per-group database counts |
| Storage | 512 MB | writes fail |
| Backups | none | take a `mongodump` before any tier change or bulk write |

**The data-out throttle slowed every page of the 2026-10 release (two episodes, 10-04 and 10-12, each lasting days).** Tell it from connection saturation before acting on either:

| Signal | Data-out throttle | Connection saturation |
|---|---|---|
| Errors | none; requests succeed, slowly | `SSL alert number 80`, `MongooseServerSelectionError` across several services at once |
| Latency shape | **flat and proportional to payload size** (duration is about bytes divided by ~90 KB/s), with ~0 ms server execution time; small reads stay quick | every operation fails or hangs regardless of size |
| `Vivreal/Mongo` `ConnectionUtilizationPct`, `ConnectFailures` | normal (well under the cap, near-zero failures) | at or near the cap, failures climbing |
| Client API slow-fetch warnings (`ClientApiSlowFetch`, hourly) | a sustained plateau well above its own baseline, hour after hour | a burst during the outage |
| Ops cap instead? | an ops cap adds a fixed delay per OPERATION, so small reads would slow too; a bandwidth ceiling slows big reads in proportion | |

How to confirm it, with no Atlas Admin API key: Logs Insights on the Client API's `content.*.fetch.slow` lines (mean `durationMs` for one document divided into its size gives the rate), the two `Vivreal/Mongo` metrics above as the control, then ask the owner to read **Metrics, Network bytes out** in the Atlas UI and sum the last 7 days. The MongoDB MCP `find` returns no timings, so it cannot measure this.

**Why it happens with light traffic.** The window is rolling, so there is **no reset day**; the throttle lifts only when trailing 7-day bytes fall back under 10 GB, and throttled bytes still count. Site reads are bounded by CloudFront (`s-maxage=60` on siteDetails), so origin egress is roughly (continuously visited sites) x (site payload) x one read a minute, **independent of visitor count**: tenant growth raises bytes with no growth in real traffic, and one large site document can be most of the budget on its own. Agent and QA walks spend the same budget (memory `prod-walks-can-saturate-atlas`).

**Payload levers.** Already shipped: the Client API siteDetails projection that leaves unread site fields in Atlas (VR_Client_API #121, shipped in v6 as Client v2.16.2, 2026-10-14, v6 runbook step 7 proof). Still open (code changes, route to `coder`): a slug-only read for the Templates edge middleware instead of the full siteDetails, and projected `collection_objects` reads. Raising `s-maxage` is also a lever, but it trades publish freshness and the owner kept 60 s.

**Tier decision, resolved.** On 2026-10-14 the owner chose Flex plus payload slimming and held the switch; on 2026-10-17 the cluster moved to **M10** instead (see the top of this skill). The payload levers above still pay for themselves in latency and Lambda memory, and the 256 KB request-path reply rule stays as a review guard rather than the fix. Throttle evidence: `vivreal-hq/docs/projects/next-release-2026-10/research-atlas-throughput-2026-10-13.md`.

## Why containers accumulate connections, not just concurrency

The 2026-08-31 arithmetic above explains a peak. It does not explain 441 connections held at 12 concurrent on 2026-09-15. That gap is orphaned clients, verified in mongoose 8.24.4 / mongodb 6.20.0 source:

1. **`readyState` goes stale on a frozen Lambda.** The getter reports `disconnected` after no heartbeat for 2x `heartbeatFrequencyMS` (`mongoose/lib/connection.js:117-131`). The old factories set `heartbeatFrequencyMS: 5000`, so any idle gap of 10s or more (completely normal between invocations of a warm container) makes the NEXT invocation read `readyState !== 1`, even though the socket is perfectly fine and the driver would have reconnected it on its own.
2. **Every old-style factory (all nine backends) replaces the client on that signal, without closing the old one first** (`db.on('disconnected'|'error'|'close', …)` nulling/deleting the cache entry, then building a fresh `MongoClient` on the next call). The old client is never told to close.
3. **The orphan keeps its 3 monitor sockets for the rest of the container's life.** On Lambda the driver detects a FaaS environment and polls instead of streaming, with no RTT pinger, and idle-socket pruning never runs while the container is frozen. Nothing ever reclaims the abandoned client's sockets.
4. So a container that idles and wakes repeatedly accumulates one orphaned client, and 3 more monitor sockets, **per idle gap**, with no upper bound tied to concurrency. That is the whole explanation for "441 held at 12 concurrent."

## The fix: one `MongoClient` per container (`@hillbombcreations/tenant-db`)

**Status: published and adopted.** The spec named the package `@hillbombcreations/mongo-connection`; it shipped to private GitHub Packages as **`@hillbombcreations/tenant-db`** (source repo `Vivreal-Mongo-Connection`, whose registry symbol still says `mongo-connection`), and the nine Lambda backends pin it exactly (research 2026-10-17, section 1). Read the version from each consumer's lockfile on its deployed line, never from here. Connectors that hand-roll a client (domain-search, scripts, the MCP) are outside it. Its comments were written against M0's 500 cap and had not been revised for M10 when this was last checked.

The design (full spec: `vivreal-hq/docs/projects/atlas-connection-fixes-2026-09-15/spec.md`):

1. **One `MongoClient` per Lambda container**, from the shared package (pinned exact in every consumer, no repo hand-rolls a copy). Tenant, outreach and every other database are `main.useDb(dbKey, { useCache: true })` **views** of that one client, never a second `MongoClient`.
2. **No eviction, ever.** Nothing deletes a cache entry on `disconnected`, `close` or `error`. `disconnected` is logged and ignored, because the driver reconnects by itself. This directly replaces the old rule 3 below, which was the bug.
3. **Replace a client only when it is closed, or its health ping has failed continuously for 60s**, at most once per 5 minutes, and always make-before-break (connect the new client and rebind every model in place, THEN close the old one fire-and-forget, never the reverse, or every legacy `if (!db.DB.conn)` gate fails until the container dies). Erratum caught while implementing: the reference cooldown must start `lastReplacedAt = null`, not `0`. Starting at `0` makes the very first replacement impossible under the spec's own required test clock (0s/31s/62s/93s).
4. **Health ping at most once per 30s per container, never per request.** Today CMS, Secure, Client API, Outreach, Analytics and Insights all ping on every `connect()` call, and Client API calls `connect()` 3 times per request.
5. **`appName` = `process.env.AWS_LAMBDA_FUNCTION_NAME`**, passed as a client option, never the shared `NAME=hillbomb_api` SSM value that makes the whole fleet indistinguishable in Atlas today. Outside Lambda it takes an explicit `appName` argument instead, and throws if none is given (see "Script, CI, CLI and MCP connections" below for the non-Lambda naming convention).
6. **`maxPoolSize` 3 by default; 5 only for CMS's two bulk-write functions (CreateAndUpdateColObjects, CreateAndUpdateIntegrations) and every Outreach function.** Everything else, including CMS's other three functions, moves from today's numbers down to 3.
7. **Every model registers with an explicit physical `collectionName`.** Mongoose already resolves one today by lowercasing/pluralizing the model name; the fix pins that RESOLVED value (computed, not guessed, spec section 3.6), because two modules can otherwise register the same name with different schemas on a shared connection.
8. **Connection failures raise `DbUnavailableError` (HTTP 503)**, exported by the package along with `isDbUnavailable(err)`, never a swallowed error or a misleading `TypeError`.

**Per-client footprint after the fix:** one client per container, one monitor socket per node plus up to `maxPoolSize` pooled sockets on the primary. **Against the per-node cap, count `1 + maxPoolSize` on the primary** (4 on the default pool of 3, 6 on pool 5); the cluster-wide total is `3 + maxPoolSize`. That replaces the old-factory table above for every backend on the package.

If you build a new backend or connector, do not invent another shape. Use the package; a manager that evicts on `disconnected` or pings per request is how the cluster saturates.

### What the old "gold standard" got backwards

The pre-2026-09-15 standard (originated in VR_Secure_API, rolled out fleet-wide 2026-06-09) told every backend to null the cache on `disconnected`/`error`/`close` and to ping on every `connect()`. Both are now known to be wrong: the eviction rule is exactly mechanism step 2 above, and the per-call ping is unnecessary round-trip cost the fix removes (E1 in the spec). The one rule that survives unchanged is fail-fast timeouts (`serverSelectionTimeoutMS`/`connectTimeoutMS` 5s, `waitQueueTimeoutMS` 5s, `maxIdleTimeMS` 60s). Those are still correct and are now defaults in the package.

## The DEV environment is gone (2026-09-15)

Sixteen DEV Lambdas (CMS x5, Client API x1, Secure x9, Main Express x1) connected to the **production** cluster with the **production services user** (e2e runs and manual testing included), drawing on the same connection cap (500 on M0 then) with production write access. The owner had the stacks deleted:

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
- **Connection-level alarms.** `vivreal-mongo-connections-high` (75 percent) and `-critical` (90 percent) alarm on `atlas-monitor`'s utilisation PERCENTAGE, so they rescaled to the M10 cap by themselves (read 2026-10-17). Atlas's native alert "Connections % of configured limit above 80" is enabled and emails the Project Owner (owner read-back, 2026-10-17). A connection-CREATION rate alarm was still to come when this was written; check `atlas-monitor` before saying one exists.
- **No Atlas Admin API key exists** (2026-09-15, still true 2026-10-17). A read-only one in Secrets Manager is an open owner decision. Without it, Atlas's own alert configuration and the Real-Time Performance Panel stay unreadable from AWS; the owner reads them in the Atlas UI.

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

## History: the tier decisions (2026-09-15 to 2026-10-17)

**Superseded: the cluster has been on M10 since 2026-10-17.** On 2026-09-15 the owner chose to stay on M0 (roughly $60/mo saved) and sized reserved concurrency against its 500 cap: 150 sockets for the resting baseline, 20 for tooling and scripts, about 330 for Lambda, Client API's reservation cut from 150 to 100, and Main Express later reserved after its 2026-09-11 67-concurrency hour. On 2026-10-14 the binding limit turned out to be the M0 data-out byte quota, and the owner chose Flex with the switch held. The move to M10 replaced both. **The reservations themselves still carry the 500-era sizing** (see "Connection capacity" above); re-derive them from live numbers rather than from this history.

## Sources of truth

**M10, 2026-10-17 onward:** `vivreal-hq/docs/projects/next-release-v7/research-mongo-connections-m10-2026-10-17.md` (limits, connection math, rate limit, the package as shipped) and `post-m10-check-2026-10-17.md` beside it (the stale-primary recovery). **Connection fix, 2026-09-15 onward:** `vivreal-hq/docs/projects/atlas-connection-fixes-2026-09-15/spec.md` (the mechanism, the package, the sizing), its `inventory.md` and `cleanup-log.md` in the same folder. `vivreal-hq/docs/projects/atlas-saturation-2026-08-31/findings.md` is the first incident and the original source of the `serverStatus`/"166" corrections. `vivreal-hq/docs/projects/next-release-2026-10/research-atlas-throughput-2026-10-13.md` is the data-out throttle diagnosis (method, byte budget, levers, tier options). Companion skill: `vivreal-db` (query rules). Memory: `project_db_connection_gold_standard.md` (historical: describes the REPLACED standard above), `insight_atlas_shared_tier_diagnostics.md`, `project_lambda_concurrency_reallocation.md`, `project_mongo_tier_ai_actions_cost_proposal.md` (historical; the cluster is on M10 now). A repo still carrying its own `shared/db/` factory is the old shape, not a reference for the new one.
