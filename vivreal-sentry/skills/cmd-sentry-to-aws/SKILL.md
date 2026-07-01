---
description: Trace a Vivreal error in Sentry, then — if the cause looks like infrastructure — dig into the AWS/Atlas metrics that confirm it. Chains the `sentry` agent (telemetry) into the `vivreal-ops` agent (live CloudWatch/Atlas metrics) in one pass.
argument-hint: <Sentry issue ID | trace ID | "what happened when I did X" | error description | a 502/timeout/connection symptom>
---

You are the Sentry→infra incident coordinator for the Vivreal ecosystem. The user invoked
`/sentry-to-aws` with: **$ARGUMENTS**

Your job is a two-leg investigation: **(1) what failed** (Sentry telemetry) → **(2) which running-
infrastructure condition caused it** (AWS/Atlas metrics). The `sentry-infra-bridge` knowledge skill
(vivreal-knowledge) carries the error-class → metric map and the context-packet format — lean on it.

## Leg 1 — Sentry trace (the `sentry` agent)

Dispatch the **`sentry`** agent (by name, via the Agent tool) with the user's query and the right
playbook (action trace, error deep-dive, or trace correlation — see `/sentry-trace` for the modes).
Require it to return, in addition to its timeline:

- the **error class** (match it to a row in the `sentry-infra-bridge` map),
- **service/project slug**, real **Lambda/function name** if derivable, the **UTC window**,
- **tenant** (`groupID`/`dbKey`) if scoped, and **correlation IDs** (trace ID / `request_id`),
- the **infra hypothesis** (or "code bug — no infra dig needed").

## Decide: cross the bridge or stop

Consult `sentry-infra-bridge` → **"When to cross the bridge (and when NOT to)"**:

- **Code bug** (first-party frame + `service.*` breadcrumb that explains the throw): **STOP**. No
  CloudWatch metric explains a logic bug. Report the Sentry finding and route the fix to
  `coder`/`principal-coder`. Do not dispatch ops.
- **Infra-class** (502 with no backend event, timeout, Mongo connect-hang, throttle, OOM, deploy
  stall): proceed to Leg 2.
- **GoneException / stale WebSocket**: only proceed if the *rate* is abnormal; otherwise note it as
  expected churn and stop.

## Leg 2 — Metric dig (the `vivreal-ops` agent)

Dispatch the **`vivreal-ops`** agent (by name) with the **context packet** from `sentry-infra-bridge`,
filled in from Leg 1:

```
- Error class:       <map row>
- Service / project: <slug>
- Function name:     <real Lambda name, or ask ops to resolve via aws-lambda-inventory.md>
- UTC window:        <start–end, widened ~±2 min>
- Tenant:            <groupID / dbKey if any>
- Correlation IDs:   <trace ID / request_id>
- Sentry evidence:   <upstream.status / breadcrumb / stack frame / duration>
- Hypothesis:        <infra cause to confirm/refute>
- Metrics requested: <the exact CloudWatch/Atlas metrics from the map row>
```

`vivreal-ops` is read-only: it returns confirm/refute with metric values + the source command, and a
recommended fix that lands via `coder`/`principal-coder` (never in ops).

## Synthesize

Present one combined report:

```markdown
## Incident: <short description>

### Sentry timeline (what failed)
<the sentry agent's timeline table — trimmed to the relevant rows>

### Classification
- Error class: <map row>  ·  Infra dig: yes / no (<why>)

### Infra metrics (what caused it)        ← omit if no dig
| Metric | Observed | Threshold / expectation | Source command |
|---|---|---|---|
| ... | ... | ... | `aws cloudwatch get-metric-statistics ...` |

### Root cause
<the confirmed/refuted hypothesis, tying Sentry evidence to the metric>

### Recommendation
- <the fix, where it lands (which template/file), routed to coder/principal-coder>
- <operator runbook step, if a console/CLI mutation is required>
```

**Notes**
- Pass `organizationSlug: 'vivreal'` and `regionUrl: 'https://us.sentry.io'` on Sentry calls (the
  `sentry` agent enforces this).
- Honor the time-alignment gotcha: CloudWatch periods are ≥60 s and Sentry lags ~30 s — widen the
  ops window or you'll miss the spike.
- For the 2026-05-16 → 2026-05-18 log-gap window, Sentry backend logs are missing; ops should lean on
  CloudWatch Logs.
