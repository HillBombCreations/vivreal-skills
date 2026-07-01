---
name: fullstack
description: Scaffold an end-to-end feature checklist across the Vivreal stack — proxy route, backend service, frontend component, types, and E2E test
allowed-tools: Read, Glob, Grep, Write, Edit, Agent
user-invocable: true
---

# /fullstack — End-to-End Feature Scaffold

The user wants to scaffold a new feature that spans the Vivreal stack. Generate a structured implementation checklist and optionally scaffold the files.

## Arguments

`/fullstack <feature-name> [--upstream=cms|secure|main] [--method=GET|POST|PUT|DELETE] [--scaffold]`

- `<feature-name>`: Short kebab-case name for the feature (e.g., `content-approvals`, `bulk-publish`)
- `--upstream`: Which backend API this targets (default: `cms`)
- `--method`: HTTP method (default: `GET`)
- `--scaffold`: If present, create skeleton files. Otherwise, just output the checklist.

## Upstream Service Map

| Flag | Env Var | Backend Repo | Path | Typical Features |
|---|---|---|---|---|
| `cms` | `NEXT_PUBLIC_CMS_URL` | VR_CMS_API | `/tenant/*` | Collections, objects, integrations, media, audit, versions |
| `secure` | `NEXT_PUBLIC_SECURE_URL` | VR_Secure_API | `/api/*` | Groups, sites, billing, users, profiles, webhooks |
| `main` | `NEXT_PUBLIC_MAIN_API` | VR_Main_API | `/api/*` | Auth, signup, email, Slack/Discord, Stripe products |

### Key Backend Differences

| Aspect | VR_CMS_API | VR_Secure_API | VR_Main_API |
|---|---|---|---|
| Architecture | 5 Lambdas | 6+ Lambdas | 1 monolithic Lambda |
| Route handler wrapper | `handleTenantRoutes` | `handleHBRoutes` | `handleHBRoutes` |
| dbKey query param | `key` | `dbKey` | N/A (no tenant routing) |
| Auth at API Gateway | Cognito authorizer | Cognito authorizer | None (unauthenticated) |
| Response pattern | `req.resData = { status, response }` | `req.resData = { status, response }` | `req.resData = { status, response }` |
| Shared schemas | `@hillbombcreations/schemas` | Inline models | Inline models |

**Critical**: CMS API expects the query param `key` for dbKey. Secure API expects `dbKey`. The portal's `injectCtxParams()` helper sets `key` and `groupID` — Secure API routes must also manually add `dbKey` if the upstream reads it that way.

## Checklist Template

Generate this checklist (adapt based on feature):

### 1. Types (`src/types/`)
- [ ] Add/extend TypeScript interfaces for request/response shapes
- [ ] Add to existing type file or create `src/types/<Feature>.ts`

### 2. Proxy Route (`src/app/api/proxy/<feature>/route.ts`)
- [ ] Create edge route using `createProxyHandler()` factory (57 of 76 routes use this)
- [ ] Both exports required: `export const runtime = 'edge'` and `export const dynamic = 'force-dynamic'`
- [ ] Choose correct `baseUrl`:
  - CMS: `process.env.NEXT_PUBLIC_CMS_URL || 'https://dev-cms.vivreal.io'`
  - Secure: `process.env.NEXT_PUBLIC_SECURE_URL || 'https://dev-secure.vivreal.io'`
  - Main: `process.env.NEXT_PUBLIC_MAIN_API || 'https://dev-api.vivreal.io'`
- [ ] Implement `buildPath` — for CMS routes use `injectCtxParams()` (sets `key` + `groupID`); for Secure routes also add `dbKey` manually
- [ ] Set `label` for logging (e.g., `'collectionObjects/create'`)
- [ ] Default timeout is 15s — set `timeoutMs` only if you need something different
- [ ] Add `validateBody` for input validation (return error string or null)
- [ ] Add `transformBody` to reshape/filter the request body before forwarding
- [ ] Add `transformResponse` to reshape upstream data before wrapping in envelope
- [ ] CSRF is automatic for POST/PUT/DELETE (override with `requireCsrf: false` if needed)

**When NOT to use the factory** (19 manual routes exist for these cases):
- Routes that set cookies (login, ssoLogin, switch-profile, group/create, group/join)
- Routes with complex body transforms that need full control (collections/create, sites/create)
- Routes with custom validation logic (calendar routes)
- Routes with special content-type handling (uploadFiles)

### 3. Backend Controller (in target API repo)
- [ ] Add route in Express router (`api/index.js`)
- [ ] Add Joi validator in `scripts/validators.js`
- [ ] Create controller in `api/controllers/`
- [ ] Extract params: CMS uses `req.query.key` + `req.query.groupID`; Secure uses `req.query.dbKey` + `req.query.groupID`
- [ ] Call service function
- [ ] Set `req.resData = { status: <code>, response: <data> }`
- [ ] Handler wrapper (`handleTenantRoutes` / `handleHBRoutes`) does the `res.status().json()` call

### 4. Backend Service (in target API repo)
- [ ] Implement business logic in `services/` directory
- [ ] Use tenant DB via dbKey routing (`dynamicDb.connect(dbKey)`)
- [ ] Use shared Mongoose schemas from `@hillbombcreations/schemas` (CMS) or inline models (Secure)
- [ ] Add audit logging via `emitAuditLog(tenantDb, entry)` if write operation — fire-and-forget, never blocks the request
- [ ] Add content versioning via `createVersion(tenantDb, opts)` if updating collection objects — also fire-and-forget
- [ ] For CMS: if adding a new route, update the CloudFormation YAML fragment in `cloudformation/<lambda>.yaml` or the route returns 403

### 5. Frontend Component (`src/components/<Feature>/`)
- [ ] `Client.tsx` — interactive `'use client'` component (this is the convention, not a strict requirement)
- [ ] `Loader.tsx` — skeleton loader for Suspense boundaries
- [ ] `Dialog.tsx` — CRUD modal (only if the feature has create/edit dialogs — not all features do)
- [ ] API calls: use `createAuthAxios()` (creates axios instance with baseURL `/app/api/proxy`, auto CSRF header, 401→logout redirect, envelope unwrap)
- [ ] For components making multiple API calls, memoize: `useMemo(() => createAuthAxios(), [])`
- [ ] Error handling: `try/catch` + `getApiError(err, 'fallback message')` from `@/lib/api/auth/helpers` + toast/snackbar
- [ ] Optimistic updates: update local state immediately, restore on error

### 6. Page Route (`src/app/(app)/<feature>/`)
- [ ] `page.tsx` — server component with `export const dynamic = 'force-dynamic'`
  - Uses `serverFetchDirect()` for data fetching (auto-injects `key`/`groupID` from `active_ctx` cookie)
  - Pattern: `<Suspense key={activeCtx} fallback={<Loader />}><Resolved activeCtx={activeCtx} /></Suspense>`
- [ ] `loading.tsx` — re-exports the Loader component: `export { default } from '@/components/<Feature>/Loader'`
- [ ] `error.tsx` — `'use client'` component using `PageErrorBoundary` from `@/components/Universal/PageErrorBoundary`

### 7. E2E Test (`e2e/<feature>.spec.ts`)
- [ ] Import from `e2e/fixtures/auth-setup` (protected pages) or `e2e/fixtures/global-setup` (public pages) — **never import from `@playwright/test` directly**
- [ ] Mock APIs with `page.route()` for browser-side requests (server-side fetches in server components CANNOT be mocked this way)
- [ ] Add reusable mock functions in `e2e/fixtures/api-mocks.ts` (49 existing mocks)
- [ ] Add test data in `e2e/fixtures/test-data.ts` (24 existing exports)
- [ ] Wait for `__reactProps` on elements before clicking (React 19 hydration: SSR'd elements are visible before event handlers attach)
- [ ] Use `pressSequentially()` for stubborn controlled inputs
- [ ] Sites/integrations pages: serialize tests with extended timeouts (dev server deadlock risk under parallel workers)

## Scaffold Mode

If `--scaffold` is present, create skeleton files for steps 1, 2, 5, and 6. **Always Read existing nearby files first** to match the exact patterns used in this codebase.

### Proxy Route Skeleton (CMS upstream)

```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { createProxyHandler, injectCtxParams, filterParams } from '../_helpers/createProxyHandler';

const CMS_URL = process.env.NEXT_PUBLIC_CMS_URL || 'https://dev-cms.vivreal.io';

export const GET = createProxyHandler({
  method: 'GET',
  baseUrl: CMS_URL,
  label: '<feature-name>',
  buildPath: ({ ctx, params }) => {
    filterParams(params, new Set(['page', 'limit']));
    injectCtxParams(params, ctx);
    return `/tenant/<endpoint>?${params.toString()}`;
  },
});
```

### Proxy Route Skeleton (Secure upstream)

```typescript
export const runtime = 'edge';
export const dynamic = 'force-dynamic';

import { createProxyHandler, injectCtxParams } from '../_helpers/createProxyHandler';

const SECURE_URL = process.env.NEXT_PUBLIC_SECURE_URL || 'https://dev-secure.vivreal.io';

export const GET = createProxyHandler({
  method: 'GET',
  baseUrl: SECURE_URL,
  label: '<feature-name>',
  buildPath: ({ ctx }) => {
    const p = injectCtxParams(new URLSearchParams(), ctx);
    p.set('dbKey', ctx.dbKey);  // Secure API reads dbKey, not key
    return `/api/<endpoint>?${p.toString()}`;
  },
});
```

### Error Page Skeleton

```typescript
"use client";
import PageErrorBoundary from "@/components/Universal/PageErrorBoundary";

export default function FeatureError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return <PageErrorBoundary pageName="feature" {...props} />;
}
```

## Procedure

1. Ask the user for any missing details (which upstream, what data shape, read or write operation?)
2. Read the target backend repo's CLAUDE.md to understand its specific patterns
3. Generate the checklist with feature-specific details filled in
4. If `--scaffold`, Read existing nearby files first, then create the skeleton files
5. Output a summary of what was created and what still needs manual implementation (backend side)

## Response Envelope Reference

The portal proxy wraps all responses in a standard envelope via `apiSuccess()`/`apiError()`:

```typescript
// Success (from apiSuccess):
{ success: true, data: <upstream response or transformed>, error: null }

// Error (from apiError):
{ success: false, data: null, error: "<message>", detail?: "<optional>" }
```

The `createAuthAxios()` response interceptor automatically unwraps this — client components receive `res.data` as the inner `data` field directly.

Backend APIs (CMS/Secure/Main) do NOT use this envelope — they return raw `response` via `req.resData = { status, response }`. The portal proxy factory wraps the raw upstream response in the envelope before returning to the browser.
