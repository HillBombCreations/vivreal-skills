# Portal-only standards (Vivreal_Portal_Mobile)

Moved out of the `shared-standards` SKILL.md on 2026-10-14 so the sections every Vivreal repo
needs load without the portal-only ones. Read this file when the trigger map in SKILL.md points
here: portal proxy routes, the axios tier, hydration and SSR, portal component conventions.

## Contents

- Tech stack quick ref
- The three-tier API rule (NEVER VIOLATE)
- Proxy route factory
- Hydration & SSR rules
- Conventions you'll see and must respect
- Default-renderer fallbacks for shared UI components
- Proxy-route guard hook (deterministic)

## Tech stack quick ref
- Next.js 16 App Router, React 19, TypeScript 5 strict
- Four proxied backends: VR_Main_API (auth), VR_Secure_API (group/site/billing), VR_CMS_API (collections/integrations/media), VR_Outreach_API (sequences/contacts/booking, the `outreach/*` proxy routes, `NEXT_PUBLIC_OUTREACH_URL`)
- Public content delivery: VR_Client_API (read-only, applies publishDate/archived filters)
- All proxy routes at `src/app/api/proxy/*` run on edge runtime
- MongoDB multi-tenant, each group has its own DB identified by `dbKey`

## The three-tier API rule (NEVER VIOLATE)
| Context | Tool |
|---|---|
| Authenticated proxy routes (`/app/api/proxy/*`) | `createAuthAxios()` from `@/lib/api/axiosInstance` |
| Public main API (`NEXT_PUBLIC_MAIN_API`) | `publicAxios` from `@/lib/api/axiosInstance` |
| S3 presigned, service worker, AuthContext login | Native `fetch()` |

NEVER use native `fetch()` for proxy routes. Any 401/419 from a proxy route MUST redirect to login, only `createAuthAxios` does this automatically.

Errors from axios calls: use `getApiError(err, fallback)` from `@/lib/api/auth/helpers`, extracts the backend's `error.response.data.error` before falling back.

## Proxy route factory
- Most proxy routes use the `createProxyHandler()` factory in `src/app/api/proxy/_helpers/`, the **filesystem is the count reference** (CLAUDE.md's route table is a self-described "core snapshot, not exhaustive"). Classify factory-vs-manual by the `_helpers/createProxyHandler` **module path**, never a string grep, manual routes may import a single helper (e.g. `extractUpstreamError`) from that same module path without using the `createProxyHandler()` factory itself.
- Manual routes only justified for: cookie-setting, httpOnly cookie reads, heavy body transforms, complex param handling, **public no-`active_ctx` routes** (the factory 401s without `active_ctx`, `outreach/book/[slug]` ×3, `outreach/studio-demo/visit`, `outreach/demo-link/[code]`, `marketing/sandbox-lead`, `claim/verify`, `claim/complete`), **raw-header/idempotency forwarding** (`sites/instantiateTemplate`, `ProxyContext` exposes no raw request), **body-preserving error responses** (`user/delete-account`, a 409's body carries the blocker list the UI renders, and the factory collapses any non-2xx into a bare `apiError(message, status)`, same reason `user/update-email` is manual), and **non-envelope responses** (`media/share-image` streams bytes; the factory always terminates in `apiSuccess()`)
- Manual routes should unwrap upstream errors via the exported `extractUpstreamError()`/`extractUpstreamDetail()` from `_helpers/createProxyHandler` rather than a hand-rolled `data?.error` read, VR_Main_API sends bare-JSON-string error bodies, and a hand-rolled read against a string silently returns `undefined`. That was the exact bug that killed the login error branches in prod.
- All authenticated proxy routes MUST verify `active_ctx` via `verifyCtxEdge()`
- Helpers: `injectCtxParams()`, `filterParams()`, `cleanSearchParam()`. `injectCtxParams()` sets **`key`** (CMS convention) + `groupID`; Secure endpoints whose Joi validator names the tenant key `dbKey` reject `key` as unknown, set `dbKey`/`groupID` manually **instead** for those
- New portal surfaces ship "live but dark" behind `group.featureFlags.<flag>`, written only by operators at `/admin/flags`; the only live flag is `aiActionsEnabled` (`templatePicker` + `squareStorefront` retired 2026-07-29, both GA). Gated entry points **hide, never disable** (`useAgentAccess()` is the single gate). Absence of AI in a group's UI is the expected default, not a bug
- The portal is **light-only**, a bare `dark:` Tailwind utility is a regression (no `@custom-variant dark`; it resolves against the OS scheme)

## Hydration & SSR rules
- Any `useAuth()` in app layout MUST use `useHydrated()` guard
- No `Date.now()` / `Math.random()` in initial render path
- `force-dynamic` preserved on dashboard routes
- Server vs client: default to Server Components, mark `'use client'` only for interactivity

## Conventions you'll see and must respect
- Component pattern per feature: `Client.tsx` (interactive) / `Loader.tsx` (skeleton) / `Dialog.tsx` (modals)
- Route groups: `(app)` protected, `(public)` unauthenticated
- Base path `/app` set in `next.config.ts`, affects links and API routes
- Theme CSS vars injected at runtime in `Providers/index.tsx` `useEffect` from `siteData`
- Onboarding state in cookies (`src/lib/cookies/onboarding.ts`)
- Integration manifests in `src/data/manifests/` drive the integration UI, never hardcode integration logic

## Default-renderer fallbacks for shared UI components
<!-- learned from bug: collection-object-initial-view-polish on 2026-04-10 -->

Shared sheet, dialog, drawer, and card components MUST NOT fall back to `JSON.stringify(obj)` (or any raw object dump) as developer-facing UI when a render-prop is omitted. These dev-only fallbacks ship to production the moment a new caller forgets the prop, and they look like a bug to users.

Pick one:
- Make the renderer prop **required** in TypeScript so the compiler forces every caller to either pass a renderer or explicitly opt out via a default re-export.
- Or supply a **real** default renderer that produces a label/value layout, narrows types via `typeof`/`instanceof` (never `as`), and hides internal metadata keys (`_id`, `__v`, timestamps) into a footer block.

The architect should flag any review that introduces an `Optional` render-prop with a `JSON.stringify` fallback.


## Proxy-route guard hook (deterministic)
The old prompt-based PreToolUse Write hook (which sometimes mis-fired on non-proxy files) was replaced by the deterministic `vivreal-proxy-factory/hooks/proxy-route-guard.cjs`, it exits 0 immediately for any path outside `src/app/api/proxy/**/route.ts` and never interferes with other writes. If it blocks a legitimate manual proxy route, add the route to its allowlist; do NOT route around the Write tool with heredocs or temp scripts.
