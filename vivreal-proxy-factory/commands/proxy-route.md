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
- `--upstream`: Which backend — `cms` (default), `secure`, `main`
- `--params`: Comma-separated allowed query params to forward (in addition to dbKey/groupID which are auto-injected)
- `--csrf`: Override CSRF requirement (defaults to true for POST/PUT/DELETE, false for GET)
- `--timeout`: Upstream timeout in ms (default: 15000)
- `--validate`: Add a `validateBody` stub
- `--transform-body`: Add a `transformBody` stub
- `--transform-response`: Add a `transformResponse` stub

## Upstream URL Map

| Flag | Env Var | Default URL |
|---|---|---|
| `cms` | `NEXT_PUBLIC_CMS_URL` | `https://dev-cms.vivreal.io` |
| `secure` | `NEXT_PUBLIC_SECURE_URL` | `https://dev-secure.vivreal.io` |
| `main` | `NEXT_PUBLIC_MAIN_API` | `https://dev-api.vivreal.io` |

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
    injectCtxParams(params, ctx);
    return `{UPSTREAM_PATH}?${params.toString()}`;
  },
  {TRANSFORM_RESPONSE}
});
```

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

## Examples

`/proxy-route GET integrations/analytics /tenant/integrationAnalytics --upstream=cms --params=type,startDate,endDate`

Generates:
```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { createProxyHandler, injectCtxParams, filterParams } from '../_helpers/createProxyHandler';

const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL || 'https://dev-cms.vivreal.io';

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
