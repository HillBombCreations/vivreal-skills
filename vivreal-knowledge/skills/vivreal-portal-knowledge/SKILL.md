---
name: vivreal-portal-knowledge
description: Use when working in the Vivreal Portal (Vivreal_Portal_Mobile) — a Next.js 16 App Router web app (despite the "Mobile" folder name). Covers the proxy-route layer (createProxyHandler factory vs the 16 manual routes), the three-tier API client rule (createAuthAxios / publicAxios / native fetch), auth cookies (token + active_ctx), privacy masking, and SSR-safe patterns. Triggers on: portal, Vivreal_Portal_Mobile, proxy route, createAuthAxios, createProxyHandler, active_ctx, AuthContext, edge runtime, basePath /app. Source of truth: C:\repos\Vivreal_Portal_Mobile\CLAUDE.md (read it for the full proxy route table and depth).
---

# Vivreal Portal (Vivreal_Portal_Mobile) — knowledge digest

A **Next.js 16 web app** (App Router, React 19, TS strict, Tailwind 4 + Radix) — NOT React Native despite the folder name. Enterprise CMS management portal. `basePath: '/app'`. For full depth (the complete 88-route proxy table, all gotchas), read `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` — this is a lean digest.

## API layer — pick the right client

| Context | Tool | Why |
|---|---|---|
| Authenticated proxy calls (`/app/api/proxy/*`) | `createAuthAxios()` from `@/lib/api/axiosInstance` | Auto CSRF header, 401/419 → logout redirect, unwraps `{success,data}` envelope to `res.data` |
| Public calls to Main API | `publicAxios` | URL normalization + `X-App-Source`, no 401 redirect |
| S3 presigned uploads, service worker, AuthContext login | native `fetch()` | different domain / can't import axios / raw cookie control |

**Never** use native `fetch()` for proxy routes — only `createAuthAxios()` triggers the login redirect on 401/419. Multiple calls in one component → `useMemo(() => createAuthAxios(), [])`. Extract backend errors with `getApiError(err, fallback)` from `@/lib/api/auth/helpers`. Server components fetch via `serverFetchDirect()`.

## Proxy routes (edge runtime)

- **72 factory + 16 manual = 88 routes** in `src/app/api/proxy/`. All run `runtime: 'edge'` + `dynamic: 'force-dynamic'`.
- Factory: `createProxyHandler()` (`_helpers/createProxyHandler.ts`) handles auth (`active_ctx` JWT verify), CSRF, body parse, upstream fetch, `{success,data,error}` envelope. A factory route is ~10-15 lines.
- The **16 manual routes** are cookie-setting (login, ssoLogin, switch-profile, group/create, group/join), httpOnly reads (billing/upgrade, update-email), heavy transforms (collections/sites create+update), and complex validation (calendar). Don't force these through the factory.
- Helpers: `injectCtxParams()` sets `key` + `groupID` (CMS-shaped). Secure routes also need `p.set('dbKey', ctx.dbKey)` — Secure reads `dbKey`, CMS reads `key`.
- Three upstreams: `NEXT_PUBLIC_CMS_URL` (`/tenant/*`), `NEXT_PUBLIC_SECURE_URL` (`/api/*`), `NEXT_PUBLIC_MAIN_API` (`/api/*`).

## Auth

- `token` cookie (Cognito JWT) + `active_ctx` cookie (signed context JWT, HMAC-SHA256 via `verifyCtxEdge()`). `active_ctx` holds `groupID`, `dbKey`, `bucketname` — NOT `groupName`.
- `src/proxy.ts` (Next 16 renamed middleware) checks `token` presence → `/login`, rate-limits auth endpoints.
- `AuthContext` holds user/groups/activeProfile/sitesByProfile/etc., persisted to `localStorage` (`auth_*`), cross-tab synced, gated by `isHydrated`.

## Conventions

- Server Components by default; `'use client'` only for interactivity. Feature pattern: `Client.tsx` / `Loader.tsx` / `Dialog.tsx`.
- **SSR-safe**: guard `window`/`document`. Respect `prefers-reduced-motion`.
- **Privacy masking** (`@/lib/privacy`): everything masked by default in Sentry Replay + Clarity. `{...privacyUnmask}` ONLY on static app chrome (nav labels, button text). **Never** unmask user/API data (collection names, group names, author info).
- Signed media via `/api/proxy/get-media`. Factory routes via `createProxyHandler()`.

## Gotchas

- `void activeCtx` in `Resolved` server components is intentional — `<Suspense key={activeCtx}>` remounts on profile switch to force re-fetch.
- Most dashboard routes are `force-dynamic` — don't add caching.
- Theme CSS vars inject client-side in `Providers` `useEffect` → brief flash on first load.
