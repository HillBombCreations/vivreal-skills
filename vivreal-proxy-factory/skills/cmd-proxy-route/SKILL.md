---
name: proxy-route
description: Generate a new factory-based proxy route for the Vivreal portal using createProxyHandler()
allowed-tools: Read, Write, Edit, Glob, Grep
user-invocable: true
---

# /proxy-route: Generate Factory Proxy Route

Creates a new edge proxy route using the `createProxyHandler()` factory pattern.

## Arguments

`/proxy-route <method> <path> <upstream-path> [--upstream=cms|secure|main] [--params=param1,param2] [--csrf=true|false] [--timeout=15000] [--validate] [--transform-body] [--transform-response]`

- `<method>`: HTTP method, GET, POST, PUT, DELETE
- `<path>`: Route path relative to `src/app/api/proxy/` (e.g. `integrations/analytics`)
- `<upstream-path>`: Path on the upstream service (e.g. `/tenant/integrationAnalytics`)
- `--upstream`: Which backend, `cms` (default), `secure`, `main`. (Outreach routes are OUT OF SCOPE for this generator: the `outreach/*` routes follow their own conventions incl. public no-`active_ctx` exceptions; build those by hand from a sibling route.)
- `--params`: Comma-separated allowed query params to forward. Tenant params are injected per upstream, see the ctx-param rule below; they are NOT always `dbKey`/`groupID`.
- `--csrf`: Override CSRF requirement (defaults to true for POST/PUT/DELETE, false for GET)
- `--timeout`: Upstream timeout in ms (default: 15000)
- `--validate`: Add a `validateBody` stub
- `--transform-body`: Add a `transformBody` stub
- `--transform-response`: Add a `transformResponse` stub

## Upstream URL Map

| Flag | Env Var | ctx audience it maps to |
|---|---|---|
| `cms` | `NEXT_PUBLIC_CMS_URL` | `cms` |
| `secure` | `NEXT_PUBLIC_SECURE_URL` | `secure` |
| `main` | `NEXT_PUBLIC_MAIN_API` | `main` |

**Emit the bare env read, with NO fallback of any kind (H1910).** `const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL;` and nothing after it. The factory refuses an unset upstream with a loud 503 rather than guessing, and that refusal is the point: a `dev-*` fallback served old builds with plausible responses, and a pinned prod-host fallback is no better, because the factory also derives the ctx AUDIENCE from `baseUrl` (`src/lib/ctxAudience`, `resolveCtxAudience`) by matching it against these same env values, so a hardcoded host maps to no audience and answers 503 `upstream_audience_unmapped`.

**Ctx tokens are audience-bound (since 2026-09-27).** The factory mints a fresh short-lived `x-active-ctx` for the upstream's audience on every request; you write nothing for it. A MANUAL route that forwards ctx must do the same with `signCtxEdge(payload, audience)`, because every backend refuses a raw portal cookie (`aud: 'portal'`).

## Generation Procedure

1. **Parse arguments**, extract method, path, upstream path, and options
2. **Check if route already exists**, use Glob to look for `src/app/api/proxy/<path>/route.ts`
3. **Read the factory**, Read `src/app/api/proxy/_helpers/createProxyHandler.ts` to confirm current API (if not recently read)
4. **Read a nearby factory route** for style reference (e.g. `src/app/api/proxy/audit/route.ts`)
5. **Generate the route file**

## Template

```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { createProxyHandler, injectCtxParams, filterParams } from '{HELPERS_PATH}';

const {UPSTREAM_CONST} = process.env.{ENV_VAR};

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

`injectCtxParams(params, ctx)` sets **`key`** (CMS convention) + `groupID`. Secure-API endpoints whose Joi validator names the tenant key `dbKey` **reject `key` as an unknown param**, for `--upstream=secure`, emit `params.set('dbKey', ctx.dbKey); params.set('groupID', ctx.groupID);` **instead of** `injectCtxParams()` (see `analytics/site-traffic` and `webhooks` routes, which do this manually and document why). `{CTX_PARAMS_LINE}` resolves accordingly:

| Upstream | `{CTX_PARAMS_LINE}` |
|---|---|
| `cms` / `main` | `injectCtxParams(params, ctx);` |
| `secure` | `params.set('dbKey', ctx.dbKey); params.set('groupID', ctx.groupID);` |

### Variable Resolution

| Variable | Value |
|---|---|
| `{UPSTREAM_CONST}` | `CMS_URL` / `SECURE_URL` / `MAIN_API` |
| `{ENV_VAR}` | `NEXT_PUBLIC_CMS_URL` / `NEXT_PUBLIC_SECURE_URL` / `NEXT_PUBLIC_MAIN_API` |
| `{HELPERS_PATH}` | One `../` per segment of `<path>`, then `_helpers/createProxyHandler` (`integrations/analytics` → `'../../_helpers/createProxyHandler'`; a one-segment path → `'../_helpers/createProxyHandler'`) |
| `{METHOD}` | GET / POST / PUT / DELETE |
| `{LABEL}` | The route path (e.g. `integrations/analytics`), matching the existing routes |
| `{TIMEOUT_LINE}` | `timeoutMs: {value},` if non-default, omit otherwise. Every stub line (`{VALIDATE_BODY}`, `{TRANSFORM_BODY}`, `{TRANSFORM_RESPONSE}`) ends in a comma like this one; it is an object literal |
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
- The `runtime: 'edge'` + `dynamic: 'force-dynamic'` pair at the top is a non-negotiable invariant for every proxy route, never drop it
- Only if the route genuinely CANNOT use the factory (cookie-setting, raw-byte streaming, public no-`active_ctx`): add it to the allowlist in `vivreal-proxy-factory/hooks/proxy-route-guard.cjs`, otherwise the guard will block edits to it

## Examples

`/proxy-route GET integrations/analytics /tenant/integrationAnalytics --upstream=cms --params=type,startDate,endDate`

Generates:
```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { createProxyHandler, injectCtxParams, filterParams } from '../../_helpers/createProxyHandler';

const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL;

export const GET = createProxyHandler({
  method: 'GET',
  baseUrl: CMS_URL,
  label: 'integrations/analytics',
  buildPath: ({ ctx, params }) => {
    filterParams(params, new Set(['type', 'startDate', 'endDate']));
    injectCtxParams(params, ctx);
    return `/tenant/integrationAnalytics?${params.toString()}`;
  },
});
```
