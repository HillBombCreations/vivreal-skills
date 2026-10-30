---
name: sentry-tracer
description: 'Use when investigating what happened during a Vivreal user action across the stack, tracing an error end-to-end, validating a deploy, or doing tenant-scoped triage with Sentry. Teaches WHEN to trace cross-stack (frontend spans ↔ backend logs ↔ WebSocket events) and HOW (trace-ID propagation, the standard tag set, request_id fallback, service.* breadcrumbs). Triggers on: "what happened when I did X", "why did this error", trace this request, Sentry issue, deploy validation, "everything''s broken for this group", crash, error timeline. For the full investigation agent with Sentry MCP tools wired in, dispatch the `sentry` agent / `/sentry-trace` (both in the `vivreal-sentry` plugin); this skill is the passively-loaded knowledge layer. Also covers the step from a Sentry error to the AWS and Atlas metric that confirms an infrastructure cause (502 with no backend event, Lambda timeout, Mongo connect-hang, throttling, OOM, stalled deploy).'
---

# Cross-Stack Sentry Tracing (Vivreal)

Every portal user action produces a **complete distributed trace**: browser → edge proxy → backend Lambda → MongoDB. Reconstruct that trail from Sentry to explain what happened, what failed, and what's missing. This skill is the **passive knowledge layer**; the active **`sentry` agent** (in the `vivreal-sentry` plugin, driven by `/sentry-trace`) owns the Sentry MCP querying. For LIVE infrastructure state (Lambda concurrency, Step Functions executions, Atlas saturation) rather than Sentry telemetry, that's the `vivreal-ops` agent, and when a Sentry error's cause looks like infrastructure (502 with no backend event, timeout, Mongo connect-hang, throttle, OOM, deploy stall), the **`sentry-infra-bridge`** skill maps the error class to the confirming CloudWatch/Atlas metric and `/sentry-to-aws` runs the trace→metric chain end-to-end.

**Always pass `organizationSlug: 'vivreal'` and `regionUrl: 'https://us.sentry.io'` on every Sentry MCP call.**

## Project → service map

| Project slug | Service | Tracing |
|---|---|---|
| `vivreal-portal` | Portal (Next.js), browser + edge + SSR | 100% |
| `vr-secure-api` | VR_Secure_API + WebSocket Lambdas | 100% |
| `vr-cms-api` | VR_CMS_API | 100% |
| `vr-main-api` | VR_Main_API (auth/signup/email) | 100% |
| `vr-client-api` | VR_Client_API (public content) | 100% |
| `vr-client-auth` | VR_Client_Auth authorizer | 100% |
| `site-deployment` | Vivreal_EventHandler Step Functions | 100% |
| `vivreal-mcp-server` | VR-MCP-Server | 100% |
| `vivreal-templates` | Customer sites | errors only (no tracing by design) |

## When to trace across the stack

- **"I just did X, what happened?"** → query `vivreal-portal` HTTP client spans in the last ~5 min, grab the Trace ID, follow it into the relevant backend project(s), then read backend logs + WebSocket send events. Build a chronological timeline.
- **An error / Sentry issue** → fetch the issue, read the stack's first first-party frame, pull breadcrumbs (the `service.*` category names the controller + operation), check tag distribution, then trace upstream (portal failed HTTP span) or downstream (backend error log).
- **Deploy validation** → check `find_releases` for the new version, compare error rate last hour vs 24h, look for new issue types and expected log patterns.
- **Tenant triage ("everything's broken for my group")** → filter `environment:production` FIRST, then scope by `groupID` across projects to find the noisiest service, drill in, read breadcrumbs on a representative event.

## How traces stitch together

- The **browser** makes the head-based sampling decision (100%) and propagates `sentry-trace` + `baggage` headers. The portal edge proxy forwards them; the backend Lambda's `initSentry()` (first line of `lambda.js`) extracts them via `awsLambdaIntegration`. A single Trace ID connects browser → edge → backend → Mongoose spans.
- `mongooseIntegration` creates DB spans (real query time). `pinoIntegration` ingests structured logs, but only with the **two-arg pino form** `logger.info(obj, 'event_name')`; single-arg `logger.info({event:'x'})` yields empty `message` bodies (a regression signal post-2026-05-18).
- `get_sentry_resource(resourceType:'trace', resourceId:<traceId>)` shows the full waterfall in one view.

## Standard tag set: your fastest scoping levers

| Tag | Use to filter by |
|---|---|
| `environment` | **Filter this FIRST**, `production` vs `staging`. Never investigate unscoped. |
| `groupID` | Tenant triage (Mongo `_id`). |
| `dbKey` | DB-routing scope (`pod_01` / `pod_02` since 2026-09-23; an event tagged `general_shared` or `pro_plus` predates the pod rename). |
| `request_id` / `requestId` | **Critical fallback** when trace IDs don't stitch, `search_errors(... query='tagged request_id:<id> across all projects')`, and `search_logs` with the same query. |
| `lambda` | Which Lambda fired. |
| `route` | Endpoint scope. |
| `release` | Bisect by deploy. |

## service.* breadcrumbs (read on every error)

Backend services emit `Sentry.addBreadcrumb({ category: 'service.<area>' })` at entry + risky ops: `service.collectionObjects`, `service.integrationObjects`, `service.sites`, `service.group`, `service.integrations`, `service.billing`. The **LAST `service.*` breadcrumb before the throw** names the controller + operation that failed. Cross-reference it with the stack trace's first first-party frame.

## Gotchas

- **No events ≠ not instrumented.** Every traced project produces spans at its rate; zero spans means a deploy issue, not missing instrumentation.
- **2026-05-16 → 2026-05-18 window:** a Sentry Lambda Layer (briefly used, then dropped) caused SDK-version skew that silently dropped Express Lambda logs. For that window, fall back to CloudWatch.
- **Don't expect PII.** Backends scrub `password*`, `*token*`, `apikey`, `secret`, `integrationkey`. Seeing a raw secret is a regression to flag, don't quote it.
- **Incomplete trace today** → suspect a manual proxy route not forwarding `sentry-trace`/`baggage`, an un-redeployed Lambda, or a header-stripping hop. Fall back to `request_id` correlation.
- **Ingestion delay ~30s**, use slightly wider time windows.

## Output shape

Produce a timeline table (Time UTC | Service | Event | Trace ID | Request ID | Tenant `groupID`/`dbKey` | Details), then Trace Health (continuity ✓/✗, environment, source maps resolved), then Findings citing trace ID + request_id + breadcrumb + tenant tags.

Reference audit: `Vivreal_Portal_Mobile/docs/audits/sentry-observability-2026-05-16.md`.

## From Sentry to AWS and Atlas metrics

(Merged from the retired `sentry-infra-bridge` skill, 2026-10-28.) Use this when a Sentry error or trace points at an INFRASTRUCTURE cause: a 502 with no backend event, a Lambda timeout, a Mongo connect-hang, throttling, OOM, or a stalled site deploy.

Sentry tells you **what happened** (the error, the timeline, the failing controller). It does **not**
tell you the *running-infrastructure cause*, whether the Lambda was throttled, ran out of time, ran
out of memory, or exhausted the Atlas connection pool. That answer lives in CloudWatch + Atlas, which
the **`vivreal-ops`** agent reads. This skill is the seam between the two: it maps each Sentry error
class to the metric that confirms it, and defines the **context packet** you carry across so the
metric dig starts warm instead of cold.

```
sentry agent  ──(finding + context packet)──▶  vivreal-ops agent
(what failed, when, where)                     (which metric proves the cause)
```

- The **`sentry` agent** owns Sentry telemetry (spans, logs, breadcrumbs, traces). It produces the
  timeline and classifies the failure.
- The **`vivreal-ops` agent** owns live AWS + Atlas state (`aws cloudwatch get-metric-statistics`
  `aws lambda get-function-concurrency`, Step Functions history, Atlas topology). It confirms or
  refutes the infra hypothesis with metric evidence.
- **`/sentry-trace --aws`** (vivreal-sentry plugin) runs both legs in one shot.

### When to cross the bridge (and when NOT to)

**Cross** when the Sentry finding is consistent with a resource/capacity limit rather than a code
bug: a 502/504 with no backend event, a timeout, a connection error, throttling, OOM, or a deploy
stall. The fix probably lands in IaC (timeout, memory, reserved concurrency, Atlas tier), not in a
controller.

**Don't cross** when Sentry already names a first-party code frame + a `service.*` breadcrumb that
explains the throw (e.g. a `TypeError` in `updateGroupTier`). That's a `coder` fix, not an ops dig, no CloudWatch metric will "explain" a logic bug. Escalating it to `vivreal-ops` just burns time.

### Error class → metric map

For each row: the Sentry signature you'd see, the AWS/Atlas metric that confirms the cause, and the
verdict if the metric is hot. (Metrics are `vivreal-ops`'s job to pull, read-only.)

| Sentry signature | Likely infra cause | Metric to pull (vivreal-ops) | Hot-metric verdict |
|---|---|---|---|
| Portal `upstream.status:502/504`, **no matching backend event** for the `request_id` | Lambda never produced a response, cold-start/init timeout, throttle, or API GW integration timeout | Lambda `Throttles` (Sum), `ConcurrentExecutions` (Max) vs reserved, `Duration` p99 vs configured timeout, `Errors`; `aws lambda get-function-concurrency` + account settings | Throttles>0 or ConcurrentExecutions at the reserved ceiling → concurrency floor too low. Duration≈timeout → init/handler too slow. |
| Sentry **timeout warning** issue, or a trace that just *stops* mid-handler with no error | Lambda hit its configured timeout (the silent-timeout class) | Lambda `Duration` p99/Max vs `Timeout` config; `Errors` vs invocations | Duration pinned at the timeout value → bump timeout or fix the hang. This is the class the timeout-flush guard was built to surface. |
| Backend error after a **long Mongoose span**, `MongoServerSelectionError` / connection timeout, or a burst of DB errors across tenants | Atlas connection pool exhausted, OR orphaned clients accumulated over time (not necessarily a concurrency spike, see `vivreal-atlas-topology`) | `db.adminCommand({ serverStatus: 1 })` for `connections.current`/`available` (no Atlas Admin API key needed); Lambda `ConcurrentExecutions` (Max) as a secondary signal; Atlas SSL-alert-80 in logs | `connections.current` near the per-node cap (1,500 on M10 since 2026-10-17; 500 on the old M0 tier) means saturation, regardless of what concurrency math predicts (the 2026-09-15 incident held 441 connections at 12 concurrent). `$currentOp`/`hostInfo` were blocked on M0 (re-test on M10), but every client built by `@hillbombcreations/tenant-db` now sets `appName` from `AWS_LAMBDA_FUNCTION_NAME` (scripts must pass their own, e.g. `script:<what>`), so a connection names its Lambda wherever `appName` is visible; otherwise infer the service from per-project Sentry error spread (see `vivreal-atlas-topology`). |
| Slow Client API / portal reads with **no error**: long Mongo spans, `content.*.fetch.slow` warnings, latency that grows with payload size | History (M0, before 2026-10-17): the **data-out throttle** (10 GB out per rolling 7 days exceeded). On M10 there is no byte quota: suspect the 2 GB node (working set, payload size) or a cold-connect burst against 15 new connections per second per node | `Vivreal/Mongo` `ConnectionUtilizationPct` and `ConnectFailures` as the control; `ClientApiSlowFetch` hourly vs its baseline; Logs Insights mean `durationMs` per document vs its size | On M0, connections normal plus a flat ~90 KB/s at every size with ~0 ms server time meant the throttle. Either way the fix is payload size, never pool sizing (method: `vivreal-ops`, limits: `vivreal-atlas-topology`). |
| Throttle/429 surfaced from a backend, or `Rate Exceeded` | Reserved concurrency floor too low, or account unreserved pool starved (<100) | Lambda `Throttles` (Sum), `ConcurrentExecutions` (Max), `aws lambda get-account-settings` | Throttles correlate with traffic peaks → raise reserved concurrency (it's floor AND ceiling, see `vivreal-lambda`). |
| `Runtime exited … signal: killed` / OOM-shaped crash | Lambda memory ceiling | CloudWatch Logs `Max Memory Used` vs `MemorySize`, `Duration` | Max Memory ≈ MemorySize → raise memory (also speeds CPU-bound handlers). |
| `site-deployment` project error, or a deploy stuck "pending" | Step Functions state stalled/failed | `aws stepfunctions describe-execution` + `get-execution-history` for the Deploy-Site machine, whose step Lambdas are `vh-site-deployment-<step>` (hyphens; an underscore spelling is only how the Lambda MCP names its tools); Amplify build outcome | Identify the failing/stuck state; the machine's ASL lives in Vivreal_EventHandler `docs/ops/` and only that repo's workflow applies it (`vivreal-site-deploy-pipeline`). |
| `GoneException` from `VR-ws-default-production` on `PostToConnectionCommand` | Stale WebSocket connection (expected churn) | **Usually none**, only escalate if the *rate* is abnormal vs baseline | Normal background churn → do not escalate. Abnormal rate → check WS Lambda concurrency. |

### The context packet (what `sentry` hands to `vivreal-ops`)

A metric dig is only as good as its scoping. When the `sentry` leg finds an infra-class failure, it
emits this packet; `vivreal-ops` reads it as its starting scope so it doesn't re-derive the basics:

```
- Error class:      <one of the rows above, e.g. "502, no backend event">
- Service / project: <Sentry project slug, e.g. vr-cms-api>
- Function name:     <real Lambda name if known, map via aws-lambda-inventory.md>
- UTC window:        <start, end, widened ~±2 min for ingestion lag and metric granularity>
- Tenant:            <groupID and/or dbKey if the error is tenant-scoped>
- Correlation IDs:   <trace ID and/or request_id>
- Sentry evidence:   <the signature: upstream.status, breadcrumb, stack frame, duration>
- Hypothesis:        <the infra cause to confirm/refute, from the map above>
- Metrics requested: <the specific CloudWatch/Atlas metrics from the map row>
```

`vivreal-ops` then pulls those metrics read-only, returns confirm/refute with values + the source
command, and recommends the fix (which lands via `coder`, never in ops).

### Gotchas that change the reading

- **Time alignment:** CloudWatch metric periods (≥60 s) are coarser than Sentry's per-event
  timestamps, and Sentry ingestion lags ~30 s. Widen the ops window or you'll miss the spike.
- **Reserved concurrency is a floor AND a ceiling** (`vivreal-lambda`), "at the ceiling" can mean
  *correctly capped*, not *starved*. Check account unreserved headroom too.
- **Shared-tier Atlas is only partly blind** (`vivreal-atlas-topology`): `serverStatus` IS permitted
  and reads `connections.current`/`available` directly. That's the fastest saturation check, and no
  Atlas API key is needed (for CPU, memory, read times and Performance Advisor, use
  `atlas-read.js`, see `vivreal-atlas-topology` "Live Atlas metrics"). Only `$currentOp {allUsers:true}` and `hostInfo` are
  blocked. Clients built by `tenant-db` carry `appName` = the Lambda's function name, which names
  the service where `appName` is visible; otherwise WHICH SERVICE caused a saturation event is inferred
  from Lambda concurrency, the spread of DB errors across Sentry projects, or orphaned-client
  accumulation (a service can hold connections without any concurrency spike).
- **A handled failure is invisible to `AWS/Lambda Errors`.** Under `@codegenie/serverless-express` a
  4xx/5xx from `errorHandler` is a SUCCESSFUL invocation, so an alarm on `Errors` never sees it, and a
  throttled request never runs at all (no log line, no `Errors`). Pair a log metric filter on a literal
  the code emits (VR_Secure_API's `<Function>.failed`) with an API Gateway 5xx alarm before calling a
  quiet `Errors` graph healthy.
- **Sentry was dark for error ingestion from about 2026-08-24 to 2026-09-17** (quota exhausted;
  accepting again from 2026-09-18). Silence in that window is not health: read Sentry's outcomes BY
  DAY, and fall back to CloudWatch Logs streams.
- **The 2026-05-16 → 2026-05-18 log gap:** for issues in that window, Express Lambda logs were
  silently dropped (SDK-version skew), fall back to CloudWatch Logs, not Sentry logs.
- **Running config ≠ IaC:** a CLI-set timeout/concurrency can differ from the template and will
  revert on next deploy. If ops finds a divergence, that divergence is the headline finding.

### Companion skills and agents
- The sections above, how to read what Sentry shows (the upstream leg).
- **`vivreal-lambda`, `vivreal-atlas-topology`** (vivreal-infra), the metric thresholds and the
  connection-ceiling / concurrency math the verdicts depend on.
- **`sentry` agent** + **`vivreal-ops` agent**, the active queryers; **`/sentry-trace --aws`** chains them.
