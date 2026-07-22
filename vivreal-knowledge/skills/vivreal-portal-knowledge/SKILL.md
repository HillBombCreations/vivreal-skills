---
name: vivreal-portal-knowledge
description: Use when working in the Vivreal Portal (Vivreal_Portal_Mobile) — a Next.js 16 App Router web app (despite the "Mobile" folder name). Covers the proxy-route layer (createProxyHandler factory vs the 31 manual routes; 180 routes total), the three-tier API client rule (createAuthAxios / publicAxios / native fetch), the four backend upstreams (Main/Secure/CMS/Outreach), auth cookies (token + active_ctx), privacy masking, and SSR-safe patterns. Triggers on: portal, Vivreal_Portal_Mobile, proxy route, createAuthAxios, createProxyHandler, active_ctx, AuthContext, edge runtime, basePath /app, site analytics dashboard, Instagram inbox, reach-out console (formerly cold-call), demo-account claim flow, site template picker, Studio editor. Source of truth: C:\repos\Vivreal_Portal_Mobile\CLAUDE.md (refreshed 2026-07-21; counts drift — recount src/app/api/proxy/ when it matters).
---

# Vivreal Portal (Vivreal_Portal_Mobile) — knowledge digest

Last synced: 2026-07-21

A **Next.js 16 web app** (App Router, React 19, TS strict, Tailwind 4 + Radix) — NOT React Native despite the folder name. Enterprise CMS management portal, v0.2.0. `basePath: '/app'`. For full depth (proxy-route snapshot, all gotchas), read `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` — this is a lean digest; CLAUDE.md refreshed 2026-07-21 — current as of this sync (route counts drift — recount when it matters). July-2026 surfaces: per-site analytics dashboard (`Sites/SiteDetail/AnalyticsPanel`, mounted via `AnalyticsEditor` from the site detail Analytics chip), Instagram comments-moderation + live DM inbox (Human Agent window removed), dedicated IG/FB publish dialogs with inline-play tiles, Studio LeftRail chrome/SEO/Reservation editors, outreach reach-out console (`/outreach/cold-call` renamed to `/outreach/reach-out`; channel SegmentedControl Calls/LinkedIn/Email), flag-gated two-level template-kit picker + `sites/instantiateTemplate` (renderer 1.31.0), managed-domain transfer-in (Transfer tab in `CustomDomainSection`, `TransferDomainTab`/`TransferDomainDialog`, `/sites/[siteId]/domain/connect` page), public demo-account claim flow (`(public)/claim/[token]`), 10-screen `CompanyProfileWizard` onboarding, unified `NotificationsPanel` (replaces `OutreachNotificationToggle`), overage billing (`OverageBillingSection`/`SpendingCapSection`), NewSiteDialog template gallery + Blank-site first-deploy flow.

## API layer — pick the right client

| Context | Tool | Why |
|---|---|---|
| Authenticated proxy calls (`/app/api/proxy/*`) | `createAuthAxios()` from `@/lib/api/axiosInstance` | Auto CSRF header, 401/419 → logout redirect, unwraps `{success,data}` envelope to `res.data` |
| Public calls to Main API | `publicAxios` | URL normalization + `X-App-Source`, no 401 redirect |
| S3 presigned uploads, service worker, AuthContext login | native `fetch()` | different domain / can't import axios / raw cookie control |

**Never** use native `fetch()` for proxy routes — only `createAuthAxios()` triggers the login redirect on 401/419. Multiple calls in one component → `useMemo(() => createAuthAxios(), [])`. Extract backend errors with `getApiError(err, fallback)` from `@/lib/api/auth/helpers`. Server components fetch via `serverFetchDirect()`.

## Proxy routes (edge runtime)

- **149 factory + 31 manual = 180 routes** (as of 2026-07-21 — count `route.ts` files when it matters; 55 of them are `outreach/*`) in `src/app/api/proxy/`. All run `runtime: 'edge'` + `dynamic: 'force-dynamic'`.
- Factory: `createProxyHandler()` (`_helpers/createProxyHandler.ts`) handles auth (`active_ctx` JWT verify), CSRF, body parse, upstream fetch, `{success,data,error}` envelope. A factory route is ~10-15 lines. Classify factory-vs-manual by the actual `_helpers/createProxyHandler` import — naive string-grep overcounts (manual routes mention it in comments).
- The **31 manual routes** are cookie-setting (login, ssoLogin, user/refresh, switch-profile, group/create, group/join), httpOnly reads (billing/upgrade, group/billing, update-email), heavy transforms (collections/sites create+update, sites/instantiateTemplate — hand-rolled to avoid double-create), complex validation (calendar), third-party upstreams (tiktok-oembed), and the **public no-`active_ctx` exceptions** (outreach/book/[slug] ×3, outreach/studio-demo/visit, marketing/sandbox-lead, claim/verify, claim/complete). Don't force these through the factory.
- Jul-15→21 route churn: NEW factory routes `sites/templates` (→ Secure GET `/api/siteTemplates`, global registry, no ctx params), `sites/domain/transfer` + `sites/domain/transfer/resend-auth` (pin `NEXT_PUBLIC_SECURE_URL`), `outreach/queue/summary` (grouped-by-sequence Outbound Queue lazy expand), `outreach/sequences/step-stats`, `outreach/social-touch/log`, `integrations/refresh-profile` (→ Secure `refreshSocialProfile`, TikTok avatar self-heal); NEW manual routes `claim/verify` + `claim/complete` (+ `claim/_shared.ts`) and `sites/instantiateTemplate`. **DELETED**: `outreach/companies/import`.
- Visitor IP in public edge routes is CloudFront-aware: read `CloudFront-Viewer-Address` (strip the `:port`), fall back to `X-Forwarded-For`, never trust `x-real-ip` — see `visitorIp()` in outreach/studio-demo/visit; the claim/verify proxy injects the visitor IP as XFF so Main's per-IP limit isn't collapsed to the Amplify egress IP.
- Helpers: `injectCtxParams()` sets `key` + `groupID` (CMS-shaped). Secure routes also need `p.set('dbKey', ctx.dbKey)` — Secure reads `dbKey`, CMS reads `key`.
- FOUR upstreams: `NEXT_PUBLIC_CMS_URL` (`/tenant/*`), `NEXT_PUBLIC_SECURE_URL` (`/api/*`), `NEXT_PUBLIC_MAIN_API` (`/api/*`), `NEXT_PUBLIC_OUTREACH_URL` (`/proxy/outreach/*` routes).

## Auth

- `token` cookie (Cognito JWT) + `active_ctx` cookie (signed context JWT, HMAC-SHA256 via `verifyCtxEdge()`). `active_ctx` holds `groupID`, `dbKey`, `bucketname` — NOT `groupName`.
- `src/proxy.ts` (Next 16 renamed middleware) checks `token` presence → `/login`, rate-limits auth endpoints — including the public claim routes: `claim/verify` 30/15m, `claim/complete` 10/15m.
- `AuthContext` holds user/groups/activeProfile/sitesByProfile/etc., persisted to `localStorage` (`auth_*`), cross-tab synced, gated by `isHydrated`. Exposes `completeClaimAndLogin()` for the public demo-account claim flow (`(public)/claim/[token]`); the claim token is kept out of Sentry/Clarity/GA4.

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

## Gotchas

- `void activeCtx` in `Resolved` server components is intentional — `<Suspense key={activeCtx}>` remounts on profile switch to force re-fetch.
- Most dashboard routes are `force-dynamic` — don't add caching.
- Theme CSS vars inject client-side in `Providers` `useEffect` → brief flash on first load.
