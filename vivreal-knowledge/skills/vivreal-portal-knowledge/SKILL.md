---
name: vivreal-portal-knowledge
description: Use when working in the Vivreal Portal (Vivreal_Portal_Mobile) — a Next.js 16 App Router web app (despite the "Mobile" folder name). Covers the proxy-route layer (createProxyHandler factory vs the 32 manual routes; 189 routes total), the three-tier API client rule (createAuthAxios / publicAxios / native fetch), the four backend upstreams (Main/Secure/CMS/Outreach), auth cookies (token + active_ctx), the AI agent surface (AgentFab/AgentDrawer/AiRail, useAgentAccess), feature-flag dark launches (/admin/flags), privacy masking, and SSR-safe patterns. Triggers on: portal, Vivreal_Portal_Mobile, proxy route, createAuthAxios, createProxyHandler, active_ctx, AuthContext, edge runtime, basePath /app, site analytics dashboard, social hub, AI FAB, agent drawer, EditPlan, feature flags, Instagram inbox, reach-out console (formerly cold-call), demo-account claim flow, site template picker, Studio editor. Source of truth: C:\repos\Vivreal_Portal_Mobile\CLAUDE.md (refreshed 2026-07-30; its route table is a "core snapshot — not exhaustive" — the filesystem is the count reference; recount src/app/api/proxy/ when it matters).
---

# Vivreal Portal (Vivreal_Portal_Mobile) — knowledge digest

Last synced: 2026-07-30

A **Next.js 16 web app** (App Router, React 19, TS strict, Tailwind 4 + Radix) — NOT React Native despite the folder name. Enterprise CMS management portal, v0.2.0. `basePath: '/app'`. For full depth (proxy-route snapshot, all gotchas), read `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` (refreshed 2026-07-30; route counts drift — filesystem is the reference). July-2026 surfaces: the **global AI agent** (`AgentContext` → `AgentFab`/`AgentDrawer` on every non-immersive `(app)` page + Studio `LeftRail/AiRail.tsx` with `?drawer=ai` deep link; single gate `useAgentAccess()` — **hides, never disables**; `POST /api/proxy/agent/execute`; `/agent` = usage + history, not a chat; per-page `AgentTriggerButton` retired), the **`/social` hub** (`src/app/(app)/social/` — account-health strip, cross-platform feed, upcoming-schedule timeline, batch-create composer), the **admin feature-flag console** (`/admin/flags` + `Admin/FeatureFlagsPanel`; only live flag `aiActionsEnabled`; `templatePicker` + `squareStorefront` retired 2026-07-29, both GA), the **sites hub/manage split** (`/sites` list-only; `Sites/SiteManage/` — `SiteManageHeader`/`SiteManageTabs`/`SiteStatStrip`/`useLiveSite`/`panels/` — replaced the `SiteDetail` view machine; `SiteAvatar` adopts renderer `BrandMark`, never crop a site logo; `BuildProgress/` + `DeploymentStatusBadge` watch-progress checklist with monotonic stage ratchet), **billing lifecycle** (`billing/{cancel,pause,reactivate,release-scheduled-change,retention-discount}` routes), per-site analytics dashboard (`AnalyticsPanel`, now hosted by `SiteManage` tabs), Instagram comments-moderation + live DM inbox, dedicated IG/FB publish dialogs, Studio LeftRail editors (chrome/SEO/Reservation + `AiRail`, `SocialPanelEditor`, `DesignEditor`, `LooksSection`, `SetupChecklist`, `PageSettingsDrawer`), outreach reach-out console (`/outreach/cold-call` → `/outreach/reach-out`; channel SegmentedControl Calls/LinkedIn/Email), the template-kit picker (GA, incl. musician industry — renderer **^1.42.1**, schemas **^1.29.0**), managed-domain transfer-in (`TransferDomainTab`/`TransferDomainDialog` + `sites/domain/bundle-status`), public demo-account claim flow (`(public)/claim/[token]`), 10-screen `CompanyProfileWizard`, unified `NotificationsPanel`, overage billing (`OverageBillingSection`/`SpendingCapSection`), commerce-category predicate (`COMMERCE_CATEGORIES` = `payments | ecommerce`, inert until Shopify registers; `facebook.json` manifest deleted — its Analytics tab is declared in `meta.json`).

## API layer — pick the right client

| Context | Tool | Why |
|---|---|---|
| Authenticated proxy calls (`/app/api/proxy/*`) | `createAuthAxios()` from `@/lib/api/axiosInstance` | Auto CSRF header, 401/419 → logout redirect, unwraps `{success,data}` envelope to `res.data` |
| Public calls to Main API | `publicAxios` | URL normalization + `X-App-Source`, no 401 redirect |
| S3 presigned uploads, service worker, AuthContext login | native `fetch()` | different domain / can't import axios / raw cookie control |

**Never** use native `fetch()` for proxy routes — only `createAuthAxios()` triggers the login redirect on 401/419. Multiple calls in one component → `useMemo(() => createAuthAxios(), [])`. Extract backend errors with `getApiError(err, fallback)` from `@/lib/api/auth/helpers`. Server components fetch via `serverFetchDirect()`.

## Proxy routes (edge runtime)

- **157 factory + 32 manual = 189 routes** (as of 2026-07-30 — count `route.ts` files when it matters; 55 of them are `outreach/*`) in `src/app/api/proxy/`. All run `runtime: 'edge'` + `dynamic: 'force-dynamic'`.
- Factory: `createProxyHandler()` (`_helpers/createProxyHandler.ts`) handles auth (`active_ctx` JWT verify), CSRF, body parse, upstream fetch, `{success,data,error}` envelope. A factory route is ~10-15 lines. Classify factory-vs-manual by the actual `_helpers/createProxyHandler` import — naive string-grep overcounts (manual routes mention it in comments).
- The **32 manual routes** are cookie-setting (login, ssoLogin, user/refresh, switch-profile, group/create, group/join), httpOnly reads (billing/upgrade, group/billing, update-email), heavy transforms (collections/sites create+update), raw-header forwarding (`sites/instantiateTemplate` — TWO reasons: idempotency-key forwarding AND 402 structured-payload passthrough; the factory's `apiError()` coerces `error` to a string), **non-envelope responses** (`media/share-image` — streams tenant media bytes through the portal origin so the composer can build a `File`; `get-media` can't solve it because a signed CloudFront URL is still cross-origin; the factory always terminates in `apiSuccess()`), complex validation (calendar), third-party upstreams (tiktok-oembed), and the **public no-`active_ctx` exceptions** (outreach/book/[slug] ×3, outreach/studio-demo/visit, marketing/sandbox-lead, claim/verify, claim/complete). Don't force these through the factory.
- Jul-21→30 route churn: NEW factory routes `admin/groups` (feature-flag console — deliberately NOT `/searchGroups` and deliberately not tenant-scoped, no ctx params), `billing/cancel`, `billing/pause`, `billing/reactivate`, `billing/release-scheduled-change`, `billing/retention-discount`, `integrations/objects/batch-create`, `sites/domain/bundle-status`; NEW manual route `media/share-image`. Nothing deleted.
- Visitor IP in public edge routes is CloudFront-aware: read `CloudFront-Viewer-Address` (strip the `:port`), fall back to `X-Forwarded-For`, never trust `x-real-ip` — see `visitorIp()` in outreach/studio-demo/visit; the claim/verify proxy injects the visitor IP as XFF so Main's per-IP limit isn't collapsed to the Amplify egress IP.
- Helpers: `injectCtxParams()` sets `key` + `groupID` (CMS-shaped). For Secure-API endpoints whose Joi validator names the tenant key `dbKey` and rejects unknown params, use `p.set('dbKey', ctx.dbKey); p.set('groupID', ctx.groupID)` **instead of** `injectCtxParams()` — sending `key` alongside gets the request rejected as an unknown param (see `analytics/site-traffic` and `webhooks` routes, which do it manually and document why).
- FOUR upstreams: `NEXT_PUBLIC_CMS_URL` (`/tenant/*`), `NEXT_PUBLIC_SECURE_URL` (`/api/*`), `NEXT_PUBLIC_MAIN_API` (`/api/*`), `NEXT_PUBLIC_OUTREACH_URL` (`/proxy/outreach/*` routes).

## Auth

- `token` cookie (Cognito JWT) + `active_ctx` cookie (signed context JWT, HMAC-SHA256 via `verifyCtxEdge()`). `active_ctx` holds `groupID`, `dbKey`, `bucketname` — NOT `groupName`.
- `src/proxy.ts` (Next 16 renamed middleware) checks `token` presence → `/login`, rate-limits auth endpoints — including the public claim routes: `claim/verify` 30/15m, `claim/complete` 10/15m.
- `AuthContext` holds `user`, `groups`, `activeProfile`, `collections` + `collectionsByProfile`, `isHydrated`, `loading` — persisted to `localStorage` (`auth_*`), cross-tab synced. **There is NO `sitesByProfile`, `integrationsByProfile`, or `collectionPreviews`** — collections are the only per-profile entity cached; sites and integrations are fetched per page (a component needing the site list calls `GET /api/proxy/sites/get` itself, as `AgentDrawer`'s `SiteHandoffCard` does). Exposes `completeClaimAndLogin()` for the public demo-account claim flow (`(public)/claim/[token]`); the claim token is kept out of Sentry/Clarity/GA4.

## Conventions

- Server Components by default; `'use client'` only for interactivity. Feature pattern: `Client.tsx` / `Loader.tsx` / `Dialog.tsx`.
- **SSR-safe**: guard `window`/`document`. Respect `prefers-reduced-motion`.
- **Privacy masking** (`@/lib/privacy`): everything masked by default in Sentry Replay + Clarity. `{...privacyUnmask}` ONLY on static app chrome (nav labels, button text). **Never** unmask user/API data (collection names, group names, author info).
- Signed media via `/api/proxy/get-media`. Factory routes via `createProxyHandler()`. `get-media` is ALSO the read-time signer for inline RTE images — the rich-text editor stores S3 keys (`data-media-key`), never a signed `src`, and signs them here at render time (see Rich text editor below).

## Rich text editor (long text)

- **TipTap v3** (ProseMirror) wrapper at `src/components/Universal/LongTextEditor/` — `index.tsx` (`useEditor`), `capabilities.ts` (parity registry + `PALETTE`), `SlashMenu.tsx`, `extensions/slashCommand.ts`, `extensions/mediaImage.tsx`. Caps: bold/italic/underline/strike/code/highlight, text color (vetted 9-hex `PALETTE`), H1–H3 (restrictable via `headingLevels` prop), lists, blockquote, hr, text-align, links, inline images, undo/redo, clear formatting. Paste hygiene strips `style`/`class`/`on*`; renders through the shared `.vr-rich` class (Tailwind `prose` deliberately removed) for 1:1 editor↔site rendering.
- **Sanitizer-parity contract** (`capabilities.ts`): the editor and `@hillbombcreations/site-renderer`'s `sanitizeHtml.ts` live in separate repos and can't share a module. `capabilities.ts` + `parity.test.ts` (`tests/unit/longtext-editor-parity.test.ts`) round-trip every exposed affordance through the real renderer sanitizer — **never expose an affordance whose `paritySafe` is false**. Flip it true only in the same change that widens the renderer allowlist + extends the parity test.
- **Inline images store an S3 KEY, not a signed src** (`extensions/mediaImage.tsx`): persists `<img data-media-key="…" alt="…">` (+ optional `data-width`/`data-align`); a React NodeView signs the key via `/api/proxy/get-media` at render time (~300s TTL, kept in component state only — never baked into stored HTML, which would 403 once the TTL lapses).
- **UX** (`index.tsx`): desktop = wrapping toolbar + BubbleMenu; mobile (<640px) = slim bar + BottomSheet Format sheet + SegmentedControl for align; plus a slash-command palette.
- **Studio mounts it**: `src/components/Sites/Studio/LeftRail/StaticContentEditor.tsx` (≈L14, L302–309) mounts `LongTextEditor` for the `body` (rich HTML) of seeded static-page objects; also `SchemaForm/SchemaComponents/longText.tsx` and the editor-lab parity page.

## AI agent + feature flags

- Two agent surfaces (`fab` / `studio`), one `AgentContext`; `useAgentAccess()` is the ONLY gate and consumers render `null` unless `ready && hasAccess` (**hide, never disable** — never re-derive access inline). The FAB additionally hides on immersive routes (`isImmersiveRoute()` — Studio owns its own rail) and while the drawer is open.
- Agent progress is the `agentProgress` socket event → `StatusTicker` (phrase-per-phase; no token streaming — the Lambda sits behind REST API Gateway, which buffers).
- EditPlan: hashing is **portal-only** — `baseDigest` is the request's `draftDigest.hash` echoed back verbatim; recomputing it JS-side permanently lights the staleness banner.
- Feature flags are the dark-launch mechanism: `group.featureFlags.aiActionsEnabled` is the only live flag, operator-written at `/admin/flags` (`usePermissions().canManageFeatureFlags` is cosmetic; the fail-closed `ADMIN_EMAILS` check lives in VR_Secure_API). The self-serve toggle was removed; `templatePicker`/`squareStorefront` retired (GA). Absence of AI in a group's UI is the expected default, not a bug.

## Gotchas

- `void activeCtx` in `Resolved` server components is intentional — `<Suspense key={activeCtx}>` remounts on profile switch to force re-fetch.
- Most dashboard routes are `force-dynamic` — don't add caching.
- Theme CSS vars inject client-side in `Providers` `useEffect` → brief flash on first load.
- The portal is **light-only** — there is no dark theme; a bare `dark:` utility is a bug (Tailwind v4 with no `@custom-variant dark` resolves it against the OS `prefers-color-scheme`, rendering dark styles on a permanently-light surface).
