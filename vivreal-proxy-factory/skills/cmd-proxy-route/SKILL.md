---
name: proxy-route
description: Generate a new factory-based proxy route for the Vivreal portal using createProxyHandler()
allowed-tools: Read, Write, Edit, Glob, Grep
user-invocable: true
---

# /proxy-route — Generate Factory Proxy Route

Creates a new edge proxy route using the `createProxyHandler()` factory pattern.

## Arguments

`/proxy-route <method> <path> <upstream-path> [--upstream=cms|secure|main] [--params=param1,param2] [--csrf=true|false] [--timeout=15000] [--validate] [--transform-body] [--transform-response]`

- `<method>`: HTTP method — GET, POST, PUT, DELETE
- `<path>`: Route path relative to `src/app/api/proxy/` (e.g., `integrations/analytics`)
- `<upstream-path>`: Path on the upstream service (e.g., `/tenant/integrationAnalytics`)
- `--upstream`: Which backend — `cms` (default), `secure`, `main`. (Outreach routes are OUT OF SCOPE for this generator — the 55 `outreach/*` routes follow their own conventions incl. public no-`active_ctx` exceptions; build those by hand from a sibling route.)
- `--params`: Comma-separated allowed query params to forward. Tenant params are injected per upstream — see the ctx-param rule below; they are NOT always `dbKey`/`groupID`.
- `--csrf`: Override CSRF requirement (defaults to true for POST/PUT/DELETE, false for GET)
- `--timeout`: Upstream timeout in ms (default: 15000)
- `--validate`: Add a `validateBody` stub
- `--transform-body`: Add a `transformBody` stub
- `--transform-response`: Add a `transformResponse` stub

## Upstream URL Map

| Flag | Env Var | Pinned prod host |
|---|---|---|
| `cms` | `NEXT_PUBLIC_CMS_URL` | `https://cms.vivreal.io` |
| `secure` | `NEXT_PUBLIC_SECURE_URL` | `https://secure.vivreal.io` |
| `main` | `NEXT_PUBLIC_MAIN_API` | `https://api.vivreal.io` |

**Never emit a `dev-*` fallback.** The old `?? 'https://dev-cms.vivreal.io'` pattern is the exact footgun the portal CLAUDE.md warns against: the `dev-*` hosts are live but serve old builds, so an unset env var fails SILENTLY with plausible-looking responses instead of refusing to connect. Pin the prod host as the fallback (per CLAUDE.md: "pin `NEXT_PUBLIC_MAIN_API` in new proxy routes").

## Generation Procedure

1. **Parse arguments** — extract method, path, upstream path, and options
2. **Check if route already exists** — use Glob to look for `src/app/api/proxy/<path>/route.ts`
3. **Read the factory** — Read `src/app/api/proxy/_helpers/createProxyHandler.ts` to confirm current API (if not recently read)
4. **Read a nearby factory route** for style reference (e.g., `src/app/api/proxy/audit/route.ts`)
5. **Generate the route file**

## Template

```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { createProxyHandler, injectCtxParams, filterParams } from '../_helpers/createProxyHandler';

const {UPSTREAM_CONST} = process.env.{ENV_VAR} || '{DEFAULT_URL}';

export const {METHOD} = createProxyHandler({
  method: '{METHOD}',
  baseUrl: {UPSTREAM_CONST},
  label: '{LABEL}',
  {TIMEOUT_LINE}
  {VALIDATE_BODY}
  {TRANSFORM_BODY}
  buildPath: ({ ctx, params }) => {
    {FILTER_PARAMS_LINE}
    {CTX_PARAMS_LINE}
    return `{UPSTREAM_PATH}?${params.toString()}`;
  },
  {TRANSFORM_RESPONSE}
});
```

## Ctx-param rule (per upstream)

`injectCtxParams(params, ctx)` sets **`key`** (CMS convention) + `groupID`. Secure-API endpoints whose Joi validator names the tenant key `dbKey` **reject `key` as an unknown param** — for `--upstream=secure`, emit `params.set('dbKey', ctx.dbKey); params.set('groupID', ctx.groupID);` **instead of** `injectCtxParams()` (see `analytics/site-traffic` and `webhooks` routes, which do this manually and document why). `{CTX_PARAMS_LINE}` resolves accordingly:

| Upstream | `{CTX_PARAMS_LINE}` |
|---|---|
| `cms` / `main` | `injectCtxParams(params, ctx);` |
| `secure` | `params.set('dbKey', ctx.dbKey); params.set('groupID', ctx.groupID);` |

### Variable Resolution

| Variable | Value |
|---|---|
| `{UPSTREAM_CONST}` | `CMS_URL` / `SECURE_URL` / `MAIN_API` |
| `{ENV_VAR}` | `NEXT_PUBLIC_CMS_URL` / `NEXT_PUBLIC_SECURE_URL` / `NEXT_PUBLIC_MAIN_API` |
| `{DEFAULT_URL}` | See upstream URL map above |
| `{METHOD}` | GET / POST / PUT / DELETE |
| `{LABEL}` | Derived from route path (e.g., `integrations/analytics` → `integrations-analytics`) |
| `{TIMEOUT_LINE}` | `timeoutMs: {value},` if non-default, omit otherwise |
| `{FILTER_PARAMS_LINE}` | `filterParams(params, new Set([{params}]));` if --params specified |
| `{VALIDATE_BODY}` | Stub function if --validate |
| `{TRANSFORM_BODY}` | Stub function if --transform-body |
| `{TRANSFORM_RESPONSE}` | Stub function if --transform-response |
| `{UPSTREAM_PATH}` | The upstream path argument (must start with `/tenant/` for CMS routes) |

## CMS Route Rule

All CMS API routes (`--upstream=cms`) MUST have upstream paths starting with `/tenant/`. This is because VR_CMS_API routes are all under `/tenant/` and require `dbKey` for multi-tenant routing. If the user provides a path without `/tenant/` prefix for a CMS route, prepend it automatically and note this.

## After Generation

- Create the directory if needed: `src/app/api/proxy/<path>/`
- Write `route.ts`
- Report: route path, upstream target, method, what helpers are used
- Remind the user to add the corresponding backend controller+service if it doesn't exist yet
- The `runtime: 'edge'` + `dynamic: 'force-dynamic'` pair at the top is a non-negotiable invariant for every proxy route — never drop it
- Only if the route genuinely CANNOT use the factory (cookie-setting, raw-byte streaming, public no-`active_ctx`): add it to the allowlist in `vivreal-proxy-factory/hooks/proxy-route-guard.cjs`, otherwise the guard will block edits to it

## Examples

`/proxy-route GET integrations/analytics /tenant/integrationAnalytics --upstream=cms --params=type,startDate,endDate`

Generates:
```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { createProxyHandler, injectCtxParams, filterParams } from '../_helpers/createProxyHandler';

const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL || 'https://cms.vivreal.io';

export const GET = createProxyHandler({
  method: 'GET',
  baseUrl: CMS_URL,
  label: 'integrations-analytics',
  buildPath: ({ ctx, params }) => {
    filterParams(params, new Set(['type', 'startDate', 'endDate']));
    injectCtxParams(params, ctx);
    return `/tenant/integrationAnalytics?${params.toString()}`;
  },
});
```
