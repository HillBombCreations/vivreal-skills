---
name: vivreal-portal-knowledge
description: Use when working in the Vivreal Portal (Vivreal_Portal_Mobile) — a Next.js 16 App Router web app (despite the "Mobile" folder name). Covers the proxy-route layer (createProxyHandler factory vs the 31 manual routes; 198 routes total), the three-tier API client rule (createAuthAxios / publicAxios / native fetch), the four backend upstreams (Main/Secure/CMS/Outreach), auth cookies (token + active_ctx), the AI agent surface (AgentFab/AgentDrawer/AiRail, useAgentAccess), feature-flag dark launches (/admin/flags), privacy masking, SSR-safe patterns, and the e2e/unit testing + gate infrastructure. Triggers on: portal, Vivreal_Portal_Mobile, proxy route, createAuthAxios, createProxyHandler, active_ctx, AuthContext, edge runtime, basePath /app, site analytics dashboard, social hub, AI FAB, agent drawer, EditPlan, feature flags, Instagram inbox, reach-out console (formerly cold-call), demo-account claim flow, site template picker, Studio editor, dashboard insights, account deletion, e2e testing, coverage map. Source of truth: C:\repos\Vivreal_Portal_Mobile\CLAUDE.md (refreshed 2026-08-15; its route table is a "core snapshot — not exhaustive" — the filesystem is the count reference; recount src/app/api/proxy/ when it matters).
---

# Vivreal Portal (Vivreal_Portal_Mobile) — knowledge digest

Last synced: 2026-08-15

A **Next.js 16 web app** (App Router, React 19, TS strict, Tailwind 4 + Radix) — NOT React Native despite the folder name. Enterprise CMS management portal, v0.2.0. `basePath: '/app'`. For full depth (proxy-route snapshot, all gotchas), read `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` (refreshed 2026-08-15; route counts drift — filesystem is the reference). 2026 surfaces: the **global AI agent** (`AgentContext` → `AgentFab`/`AgentDrawer` on every non-immersive `(app)` page + Studio `LeftRail/AiRail.tsx` with `?drawer=ai` deep link; single gate `useAgentAccess()` — **hides, never disables**; `POST /api/proxy/agent/execute`; `/agent` = usage + history, not a chat; per-page `AgentTriggerButton` retired), the **`/social` hub** (`src/app/(app)/social/` — account-health strip, cross-platform feed, upcoming-schedule timeline, batch-create composer), the **admin feature-flag console** (`/admin/flags` + `Admin/FeatureFlagsPanel`; only live flag `aiActionsEnabled`; `templatePicker` + `squareStorefront` retired 2026-07-29, both GA), the **sites hub/manage split** (`/sites` list-only; `Sites/SiteManage/` — `SiteManageHeader`/`SiteManageTabs`/`SiteStatStrip`/`useLiveSite`/`panels/` — replaced the `SiteDetail` view machine; `SiteAvatar` adopts renderer `BrandMark`, never crop a site logo; `BuildProgress/` + `DeploymentStatusBadge` watch-progress checklist with monotonic stage ratchet), **billing lifecycle** (`billing/{cancel,pause,reactivate,release-scheduled-change,retention-discount}` routes), per-site analytics dashboard (`AnalyticsPanel`, now hosted by `SiteManage` tabs), Instagram comments-moderation + live DM inbox, dedicated IG/FB publish dialogs, Studio LeftRail editors (chrome/SEO/Reservation + `AiRail`, `SocialPanelEditor`, `DesignEditor`, `LooksSection`, `SetupChecklist`, `PageSettingsDrawer`), outreach reach-out console (`/outreach/cold-call` → `/outreach/reach-out`; channel SegmentedControl Calls/LinkedIn/Email), the template-kit picker (GA, incl. musician industry — renderer **^1.50.0**, schemas **^1.29.0**), managed-domain transfer-in (`TransferDomainTab`/`TransferDomainDialog` + `sites/domain/bundle-status`), public demo-account claim flow (`(public)/claim/[token]`), 10-screen `CompanyProfileWizard`, unified `NotificationsPanel`, overage billing (`OverageBillingSection`/`SpendingCapSection`), commerce-category predicate (`COMMERCE_CATEGORIES` = `payments | ecommerce`, inert until Shopify registers; `facebook.json` manifest deleted — its Analytics tab is declared in `meta.json`).

## API layer — pick the right client

| Context | Tool | Why |
|---|---|---|
| Authenticated proxy calls (`/app/api/proxy/*`) | `createAuthAxios()` from `@/lib/api/axiosInstance` | Auto CSRF header, 401/419 → logout redirect, unwraps `{success,data}` envelope to `res.data` |
| Public calls to Main API | `publicAxios` | URL normalization + `X-App-Source`, no 401 redirect |
| S3 presigned uploads, service worker, AuthContext login | native `fetch()` | different domain / can't import axios / raw cookie control |

**Never** use native `fetch()` for proxy routes — only `createAuthAxios()` triggers the login redirect on 401/419. Multiple calls in one component → `useMemo(() => createAuthAxios(), [])`. Extract backend errors with `getApiError(err, fallback)` from `@/lib/api/auth/helpers`. Server components fetch via `serverFetchDirect()`.

## Proxy routes (edge runtime)

- **167 factory + 31 manual = 198 routes** (as of 2026-08-15 — count `route.ts` files when it matters) in `src/app/api/proxy/`. All run `runtime: 'edge'` + `dynamic: 'force-dynamic'`.
- Factory: `createProxyHandler()` (`_helpers/createProxyHandler.ts`) handles auth (`active_ctx` JWT verify), CSRF, body parse, upstream fetch, `{success,data,error}` envelope. A factory route is ~10-15 lines. Classify factory-vs-manual by the actual `_helpers/createProxyHandler` import — naive string-grep overcounts (manual routes may import a single helper like `extractUpstreamError` from that module path without using the `createProxyHandler()` factory itself).
- The **31 manual routes** are cookie-setting (login, ssoLogin, user/refresh, switch-profile, group/create, group/join), httpOnly reads (billing/upgrade, group/billing, update-email), heavy transforms (collections/sites create+update), raw-header forwarding (`sites/instantiateTemplate` — TWO reasons: idempotency-key forwarding AND 402 structured-payload passthrough; the factory's `apiError()` coerces `error` to a string), **non-envelope responses** (`media/share-image` — streams tenant media bytes through the portal origin so the composer can build a `File`; `get-media` can't solve it because a signed CloudFront URL is still cross-origin; the factory always terminates in `apiSuccess()`), complex validation (calendar), third-party upstreams (tiktok-oembed), account self-serve deletion (`user/delete-account` — a 409's body carries the blocker list the UI renders, and the factory collapses any non-2xx into a bare `apiError(message, status)`, same reason `user/update-email` is manual), and the **public no-`active_ctx` exceptions** (outreach/book/[slug] ×3, outreach/studio-demo/visit, outreach/demo-link/[code] — the studio-demo link resolver, GET-only so no CSRF either, marketing/sandbox-lead, claim/verify, claim/complete). Don't force these through the factory.
- Manual routes should unwrap upstream errors via the exported `extractUpstreamError()`/`extractUpstreamDetail()` from `_helpers/createProxyHandler` rather than a hand-rolled `data?.error` read — VR_Main_API sends bare-JSON-string error bodies, and a hand-rolled read against a string silently returns `undefined` (this was the exact bug that killed the login error branches in prod).
- Route churn since the last sync: NEW manual routes `outreach/demo-link/[code]` and `user/delete-account`; the `dash/insights`-era surface added a factory `dashboard-insights` proxy route feeding the dashboard's "Your week" sentences.
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

## Testing & gates

- **E2E (Playwright)**: logged-in specs authenticate with REAL HMAC-signed `active_ctx`/`user_ctx`/`csrf_token` cookies minted by `e2e/fixtures/ctx.ts` — the same primitives as `src/lib/signCtx`/`src/lib/csrf`, so `verifyCtxEdge()` and the CSRF check pass with zero source bypasses. Runs against a dedicated test dev server on `:3100` (isolated `.next-test` dist dir) with all backend URLs pointed at a mock upstream on `:4600` (`e2e/mock-upstream/`) that returns RAW upstream-shaped fixtures — the proxy still applies the `{success,data,error}` envelope.
- **Unit (Vitest)**: `tests/unit/**` — pure-logic-only (signCtx/csrf derivation, validators, `editPlan`/`catalog` helpers). Run via `npm test`.
- **Coverage map**: `e2e/coverage-map.json` + `scripts/check-coverage-map.mjs --strict` is a mechanical route→spec evidence gate — a new or changed proxy route needs a coverage-map entry or the gate fails.
- **Inventory**: `e2e/BASELINE.md` is the authoritative test/pass/annotation count — re-measure before quoting a number, never trust a remembered one. Full guide: `e2e/TESTING.md`.
- **Lint & gates**: repo-wide ESLint is 0 errors/0 warnings; `react-hooks/*` is scoped off `e2e/**` only (Playwright's `use(page)` false-positive). There is **no CI** — husky pre-commit (lint-staged + vitest + coverage-map) and pre-push (eslint 0/0 + tsc + vitest + coverage-map --strict + e2e smoke) are the only gates. Never bypass with `--no-verify`.

## Gotchas

- `void activeCtx` in `Resolved` server components is intentional — `<Suspense key={activeCtx}>` remounts on profile switch to force re-fetch.
- Most dashboard routes are `force-dynamic` — don't add caching.
- Theme CSS vars inject client-side in `Providers` `useEffect` → brief flash on first load.
- The portal is **light-only** — there is no dark theme; a bare `dark:` utility is a bug (Tailwind v4 with no `@custom-variant dark` resolves it against the OS `prefers-color-scheme`, rendering dark styles on a permanently-light surface).
- `src/proxy.ts` short-circuits ALL `/api/proxy/` matcher paths right after rate limiting — the proactive `active_ctx` refresh must never run on a proxy request, since rewriting `active_ctx` mid-flight desyncs the CSRF token (`HMAC(CTX_SECRET, 'csrf:' + active_ctx)`). Don't add a proxy POST path to the matcher expecting refresh behavior.
- Manual proxy routes should unwrap upstream errors via the exported `extractUpstreamError()`/`extractUpstreamDetail()` from `_helpers/createProxyHandler` rather than a hand-rolled `data?.error` read — VR_Main_API sends bare-JSON-string error bodies, and that hand-rolled read is what silently killed the login error branches in prod.

## Deploy model — release train (2026-08-15)

Merging to `main` no longer deploys prod. `main` is now an Amplify build canary with NO
production traffic. Prod is served via CloudFront distribution `E39DUKXYGXCX8Q`, whose origin is
`stable.d2e6e3kdfrrxak.amplifyapp.com` (swapped from `main.` — the distro is NOT CFN-managed).
Friday 5pm PST `release-cut.yml` cuts `release/vX.Y` from `main`, bumps `package.json`, tags
`vX.Y.0`, and writes a served `public/release.json` marker — check the live deployed version via
`curl https://vivreal.io/app/release.json`. Monday **16:00 UTC** `promote.yml` (last in the
stagger, after all four backends: Secure 15:00, CMS 15:15, Main 15:30, Client 15:45)
force-with-lease moves `stable` to the newest tag. Hotfix = commit on `release/vX.Y`, push (husky
gate runs), then dispatch `promote.yml` with `target=release/vX.Y` — tags `vX.Y.Z+1` and ships
it. Rollback (`rollback.yml`, dispatch-only) moves `stable` back to a prior tag and yanks it —
**Amplify autobuild only fires for never-built commits**, so a rollback or a re-promote to an
already-built commit repoints `stable` but triggers NO build; rollback must ALSO run
`aws amplify start-job --app-id d2e6e3kdfrrxak --branch-name stable --job-type RELEASE`. Full
runbook: this repo's `docs/RELEASE.md`.
