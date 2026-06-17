---
name: sentry-tracer
description: Use when investigating what happened during a Vivreal user action across the stack, tracing an error end-to-end, validating a deploy, or doing tenant-scoped triage with Sentry. Teaches WHEN to trace cross-stack (frontend spans ↔ backend logs ↔ WebSocket events) and HOW (trace-ID propagation, the standard tag set, request_id fallback, service.* breadcrumbs). Triggers on: "what happened when I did X", "why did this error", trace this request, Sentry issue, deploy validation, "everything's broken for this group", crash, error timeline. For the full investigation agent with Sentry MCP tools wired in, dispatch the `sentry` agent / `/sentry-trace` (both in the `vivreal-sentry` plugin); this skill is the passively-loaded knowledge layer.
---

# Cross-Stack Sentry Tracing (Vivreal)

Every portal user action produces a **complete distributed trace**: browser → edge proxy → backend Lambda → MongoDB. Reconstruct that trail from Sentry to explain what happened, what failed, and what's missing. This skill is the **passive knowledge layer**; the active **`sentry` agent** (in the `vivreal-sentry` plugin, driven by `/sentry-trace`) owns the Sentry MCP querying. For LIVE infrastructure state (Lambda concurrency, Step Functions executions, Atlas saturation) rather than Sentry telemetry, that's the `vivreal-ops` agent.

**Always pass `organizationSlug: 'vivreal'` and `regionUrl: 'https://us.sentry.io'` on every Sentry MCP call.**

## Project → service map

| Project slug | Service | Tracing |
|---|---|---|
| `vivreal-portal` | Portal (Next.js) — browser + edge + SSR | 100% |
| `vr-secure-api` | VR_Secure_API + WebSocket Lambdas | 100% |
| `vr-cms-api` | VR_CMS_API | 100% |
| `vr-main-api` | VR_Main_API (auth/signup/email) | 100% |
| `vr-client-api` | VR_Client_API (public content) | 100% |
| `vr-client-auth` | VR_Client_Auth authorizer | 100% |
| `site-deployment` | Vivreal_EventHandler Step Functions | 100% |
| `vivreal-mcp-server` | VR-MCP-Server | 100% |
| `vivreal-templates` | Customer sites | errors only (no tracing by design) |

## When to trace across the stack

- **"I just did X — what happened?"** → query `vivreal-portal` HTTP client spans in the last ~5 min, grab the Trace ID, follow it into the relevant backend project(s), then read backend logs + WebSocket send events. Build a chronological timeline.
- **An error / Sentry issue** → fetch the issue, read the stack's first first-party frame, pull breadcrumbs (the `service.*` category names the controller + operation), check tag distribution, then trace upstream (portal failed HTTP span) or downstream (backend error log).
- **Deploy validation** → check `find_releases` for the new version, compare error rate last hour vs 24h, look for new issue types and expected log patterns.
- **Tenant triage ("everything's broken for my group")** → filter `environment:production` FIRST, then scope by `groupID` across projects to find the noisiest service, drill in, read breadcrumbs on a representative event.

## How traces stitch together

- The **browser** makes the head-based sampling decision (100%) and propagates `sentry-trace` + `baggage` headers. The portal edge proxy forwards them; the backend Lambda's `initSentry()` (first line of `lambda.js`) extracts them via `awsLambdaIntegration`. A single Trace ID connects browser → edge → backend → Mongoose spans.
- `mongooseIntegration` creates DB spans (real query time). `pinoIntegration` ingests structured logs — but only with the **two-arg pino form** `logger.info(obj, 'event_name')`; single-arg `logger.info({event:'x'})` yields empty `message` bodies (a regression signal post-2026-05-18).
- `get_sentry_resource(resourceType:'trace', resourceId:<traceId>)` shows the full waterfall in one view.

## Standard tag set — your fastest scoping levers

| Tag | Use to filter by |
|---|---|
| `environment` | **Filter this FIRST** — `production` vs `staging`. Never investigate unscoped. |
| `groupID` | Tenant triage (Mongo `_id`). |
| `dbKey` | DB-routing scope (`general_shared` / `pro_plus`). |
| `request_id` / `requestId` | **Critical fallback** when trace IDs don't stitch — `search_events(... 'tagged request_id:<id> across all projects')`. |
| `lambda` | Which Lambda fired. |
| `route` | Endpoint scope. |
| `release` | Bisect by deploy. |

## service.* breadcrumbs (read on every error)

Backend services emit `Sentry.addBreadcrumb({ category: 'service.<area>' })` at entry + risky ops: `service.collectionObjects`, `service.integrationObjects`, `service.sites`, `service.group`, `service.integrations`, `service.billing`. The **LAST `service.*` breadcrumb before the throw** names the controller + operation that failed. Cross-reference it with the stack trace's first first-party frame.

## Gotchas

- **No events ≠ not instrumented.** Every traced project produces spans at its rate; zero spans means a deploy issue, not missing instrumentation.
- **2026-05-16 → 2026-05-18 window:** a Sentry Lambda Layer (briefly used, then dropped) caused SDK-version skew that silently dropped Express Lambda logs. For that window, fall back to CloudWatch.
- **Don't expect PII.** Backends scrub `password*`, `*token*`, `apikey`, `secret`, `integrationkey`. Seeing a raw secret is a regression to flag — don't quote it.
- **Incomplete trace today** → suspect a manual proxy route not forwarding `sentry-trace`/`baggage`, an un-redeployed Lambda, or a header-stripping hop. Fall back to `request_id` correlation.
- **Ingestion delay ~30s** — use slightly wider time windows.

## Output shape

Produce a timeline table (Time UTC | Service | Event | Trace ID | Request ID | Tenant `groupID`/`dbKey` | Details), then Trace Health (continuity ✓/✗, environment, source maps resolved), then Findings citing trace ID + request_id + breadcrumb + tenant tags.

Reference audit: `Vivreal_Portal_Mobile/docs/audits/sentry-observability-2026-05-16.md`.
