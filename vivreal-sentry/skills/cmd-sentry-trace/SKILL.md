---
description: Trace and validate user actions across the Vivreal stack using Sentry logs, traces, errors, and events. Cross-correlates frontend, backend, and WebSocket telemetry.
argument-hint: <"what happened when I did X" | issue ID | trace ID | "health check" | "validate deploy <service>">
---

You are the Sentry trace coordinator for the Vivreal ecosystem. The user has invoked `/sentry-trace` with: **$ARGUMENTS**

Dispatch the `sentry` agent (by name, via the Agent tool) with the user query. That agent has the Sentry MCP tools wired into its frontmatter and knows the Vivreal project structure. The passive `sentry-tracer` knowledge skill (in the `vivreal-knowledge` plugin, if installed) will have primed the project→service map.

**Input modes** (detect from $ARGUMENTS):

1. **Action trace** -- "I just created a collection object", "what happened when I logged in"
   -> Dispatch the `sentry` agent with Playbook 1 (recent event correlation)

2. **Error investigation** -- issue ID like `VR-SECURE-API-B`, Sentry URL, or error description
   -> Dispatch the `sentry` agent with Playbook 2 (error deep-dive). It pulls breadcrumbs to identify the failing `service.*` operation.

3. **Deployment validation** -- "validate deploy CMS", "is the portal deploy working"
   -> Dispatch the `sentry` agent with Playbook 3 (release + health check)

4. **Cross-service correlation** -- trace ID, "trace the /app/content request"
   -> Dispatch the `sentry` agent with Playbook 4 (distributed trace reconstruction). Post-2026-05-16 the trace should span portal + backend; if not, it falls back to request_id (Playbook 7).

5. **Health check** -- "health check", "is everything working", "status"
   -> Dispatch the `sentry` agent to query event counts and error rates across all 8 projects, filtered by `environment:production`.

6. **DevTools network request** -- user pastes request/response headers from browser DevTools
   -> Dispatch the `sentry` agent with Playbook 5 (extract x-request-id, sentry-trace, timestamp; correlate across services)

7. **Tenant-scoped triage** -- "what's broken for groupID:X", "all errors in dbKey:pro_plus", "show me errors for tenant <name>"
   -> Dispatch the `sentry` agent with Playbook 6 (tenant-scoped triage). Always filtered to `environment:production` unless explicitly told staging.

8. **Request ID fallback** -- user pastes a request_id (UUID-shaped) from the portal toast / Network tab
   -> Dispatch the `sentry` agent with Playbook 7 (request_id correlation). Use when trace IDs don't stitch — historical events, manual proxy routes, or third-party hops that strip headers.

9. **Breadcrumb deep-dive** -- "what was the controller doing when it threw", "inspect breadcrumbs on issue X"
   -> Dispatch the `sentry` agent with Playbook 8 (service breadcrumb inspection)

**Note on live-infrastructure questions:** if the request is actually about RUNNING AWS/Atlas state (Lambda concurrency, Step Functions execution history, Atlas connection saturation) rather than Sentry telemetry, that's the `vivreal-ops` agent's job, not this command. Hand off with a one-line note.

**Dispatch template:**
```
description: Sentry trace -- <brief description>
prompt: <Include full context: what the user asked, which playbook, time window, any known service/trace IDs.>
```

After the `sentry` agent returns, present the timeline table and findings to the user. If it identified code-level issues, suggest next steps (route the fix to `principal-coder` / `coder`).
