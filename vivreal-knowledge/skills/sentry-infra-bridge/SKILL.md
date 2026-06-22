---
name: sentry-infra-bridge
description: Use when a Sentry error or trace points at an INFRASTRUCTURE cause and you need to dig into AWS/Atlas metrics to confirm it — e.g. a 502 with no backend event, a Lambda timeout, a Mongo connect-hang, throttling, OOM, or a stalled site-deploy. Teaches the handoff contract between the `sentry` agent (telemetry) and the `vivreal-ops` agent (live AWS/Atlas metrics): which CloudWatch/Atlas metric explains each Sentry error class, and exactly what context to carry across. Triggers on: "dig into the AWS metrics for this error", "is this a Lambda/Atlas problem", "what infra metric explains this 502/timeout", "Sentry says X — confirm in CloudWatch". Pairs with the `sentry-tracer` skill (what Sentry shows) and the `vivreal-ops` agent (the metric dig).
---

# Sentry → AWS/Atlas Metric Bridge (Vivreal)

Sentry tells you **what happened** (the error, the timeline, the failing controller). It does **not**
tell you the *running-infrastructure cause* — whether the Lambda was throttled, ran out of time, ran
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
- The **`vivreal-ops` agent** owns live AWS + Atlas state (`aws cloudwatch get-metric-statistics`,
  `aws lambda get-function-concurrency`, Step Functions history, Atlas topology). It confirms or
  refutes the infra hypothesis with metric evidence.
- The **`/sentry-to-aws` command** (vivreal-sentry plugin) runs both legs in one shot.

## When to cross the bridge (and when NOT to)

**Cross** when the Sentry finding is consistent with a resource/capacity limit rather than a code
bug: a 502/504 with no backend event, a timeout, a connection error, throttling, OOM, or a deploy
stall. The fix probably lands in IaC (timeout, memory, reserved concurrency, Atlas tier), not in a
controller.

**Don't cross** when Sentry already names a first-party code frame + a `service.*` breadcrumb that
explains the throw (e.g. a `TypeError` in `updateGroupTier`). That's a `coder` fix, not an ops dig —
no CloudWatch metric will "explain" a logic bug. Escalating it to `vivreal-ops` just burns time.

## Error class → metric map

For each row: the Sentry signature you'd see, the AWS/Atlas metric that confirms the cause, and the
verdict if the metric is hot. (Metrics are `vivreal-ops`'s job to pull — read-only.)

| Sentry signature | Likely infra cause | Metric to pull (vivreal-ops) | Hot-metric verdict |
|---|---|---|---|
| Portal `upstream.status:502/504`, **no matching backend event** for the `request_id` | Lambda never produced a response — cold-start/init timeout, throttle, or API GW integration timeout | Lambda `Throttles` (Sum), `ConcurrentExecutions` (Max) vs reserved, `Duration` p99 vs configured timeout, `Errors`; `aws lambda get-function-concurrency` + account settings | Throttles>0 or ConcurrentExecutions at the reserved ceiling → concurrency floor too low. Duration≈timeout → init/handler too slow. |
| Sentry **timeout warning** issue, or a trace that just *stops* mid-handler with no error | Lambda hit its configured timeout (the silent-timeout class) | Lambda `Duration` p99/Max vs `Timeout` config; `Errors` vs invocations | Duration pinned at the timeout value → bump timeout or fix the hang. This is the class the timeout-flush guard was built to surface. |
| Backend error after a **long Mongoose span**, `MongoServerSelectionError` / connection timeout, or a burst of DB errors across tenants | Atlas connection pool exhausted — `poolSize × Lambda concurrency` exceeded the cluster cap | Lambda `ConcurrentExecutions` (Max) × per-Lambda pool size vs Atlas cap (**shared-tier 500**, M10 1500, M20+ higher); Atlas SSL-alert / connection count where readable | Concurrency × pool ≥ cap → connection saturation. Shared-tier hides `$currentOp`/`serverStatus`; infer from concurrency math + per-project Sentry error spread (see `vivreal-atlas-topology`). |
| Throttle/429 surfaced from a backend, or `Rate Exceeded` | Reserved concurrency floor too low, or account unreserved pool starved (<100) | Lambda `Throttles` (Sum), `ConcurrentExecutions` (Max), `aws lambda get-account-settings` | Throttles correlate with traffic peaks → raise reserved concurrency (it's floor AND ceiling — see `vivreal-lambda`). |
| `Runtime exited … signal: killed` / OOM-shaped crash | Lambda memory ceiling | CloudWatch Logs `Max Memory Used` vs `MemorySize`, `Duration` | Max Memory ≈ MemorySize → raise memory (also speeds CPU-bound handlers). |
| `site-deployment` project error, or a deploy stuck "pending" | Step Functions state stalled/failed | `aws stepfunctions describe-execution` + `get-execution-history` for the `vh_site_deployment_*` machine; Amplify build outcome | Identify the failing/stuck state; the state machine is NOT in IaC (`vivreal-site-deploy-pipeline`). |
| `GoneException` from `VR-ws-default-production` on `PostToConnectionCommand` | Stale WebSocket connection (expected churn) | **Usually none** — only escalate if the *rate* is abnormal vs baseline | Normal background churn → do not escalate. Abnormal rate → check WS Lambda concurrency. |

## The context packet (what `sentry` hands to `vivreal-ops`)

A metric dig is only as good as its scoping. When the `sentry` leg finds an infra-class failure, it
emits this packet; `vivreal-ops` reads it as its starting scope so it doesn't re-derive the basics:

```
- Error class:      <one of the rows above — e.g. "502, no backend event">
- Service / project: <Sentry project slug, e.g. vr-cms-api>
- Function name:     <real Lambda name if known — map via aws-lambda-inventory.md>
- UTC window:        <start–end, widened ~±2 min for ingestion lag and metric granularity>
- Tenant:            <groupID and/or dbKey if the error is tenant-scoped>
- Correlation IDs:   <trace ID and/or request_id>
- Sentry evidence:   <the signature: upstream.status, breadcrumb, stack frame, duration>
- Hypothesis:        <the infra cause to confirm/refute — from the map above>
- Metrics requested: <the specific CloudWatch/Atlas metrics from the map row>
```

`vivreal-ops` then pulls those metrics read-only, returns confirm/refute with values + the source
command, and recommends the fix (which lands via `coder`/`principal-coder`, never in ops).

## Gotchas that change the reading

- **Time alignment:** CloudWatch metric periods (≥60 s) are coarser than Sentry's per-event
  timestamps, and Sentry ingestion lags ~30 s. Widen the ops window or you'll miss the spike.
- **Reserved concurrency is a floor AND a ceiling** (`vivreal-lambda`) — "at the ceiling" can mean
  *correctly capped*, not *starved*. Check account unreserved headroom too.
- **Shared-tier Atlas is partly blind** (`vivreal-atlas-topology`): `$currentOp`/`serverStatus` are
  blocked, so connection saturation is *inferred* from Lambda concurrency × pool size and the spread
  of DB errors across projects — not read directly.
- **The 2026-05-16 → 2026-05-18 log gap:** for issues in that window, Express Lambda logs were
  silently dropped (SDK-version skew) — fall back to CloudWatch Logs, not Sentry logs.
- **Running config ≠ IaC:** a CLI-set timeout/concurrency can differ from the template and will
  revert on next deploy. If ops finds a divergence, that divergence is the headline finding.

## Companion skills / agents
- **`sentry-tracer`** (vivreal-knowledge) — how to read what Sentry shows (the upstream leg).
- **`vivreal-lambda`, `vivreal-atlas-topology`** (vivreal-infra) — the metric thresholds and the
  connection-ceiling / concurrency math the verdicts depend on.
- **`sentry` agent** + **`vivreal-ops` agent** — the active queryers; **`/sentry-to-aws`** chains them.
