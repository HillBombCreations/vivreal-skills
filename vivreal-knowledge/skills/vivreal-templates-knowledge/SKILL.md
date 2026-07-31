---
name: vivreal-templates-knowledge
description: Use when working in Vivreal_Templates — the Next.js 16 universal customer-site template (every customer site builds the shared `stable` branch; per-customer branches are dead) that renders a Vivreal customer's content via VR_Client_API and the @hillbombcreations/site-renderer package. Covers the data-driven (no hardcoded brand) rule, server-component-first fetch via clientFetch/clientFetchCached + the HMAC tag-revalidation webhook, CloudFront signed media (getSignedUrl/getSrcSet/unsignMediaUrl), the demo-site noindex gate (lifecycleState demo|live), analytics (SiteAnalytics vs SiteBeacon), per-page SEO + dynamic OG images, per-site theming, the promote-stable release workflow, GitHub-Packages renderer installs, and the storefront checkout path (PAYMENTS_PROVIDER_TYPES, checkoutIdentifier threading, cart-mount gate). Triggers on: Vivreal_Templates, site template, customer site, clientFetch, getSiteData, stable branch, promote-stable, site-renderer install, SiteBeacon, OG image route, per-site font, revalidate webhook, lifecycleState, demo site, cart, checkout, PAYMENTS_PROVIDER_TYPES, hasProducts, transformProduct. Source of truth: C:\repos\Vivreal_Templates\CLAUDE.md.
---

# Vivreal_Templates — knowledge digest

Last synced: 2026-07-30

Next.js **16** (App Router, TS strict, Tailwind 4, Turbopack builds) **universal customer-site template**, v0.2.0. The repo has **only `main`, `stable`, and dev PR branches** (Phase 2, 2026-07-15): every customer site's Amplify app builds the shared **`stable`** branch. Merging `main` releases NOTHING — releases go out via the **promote-stable** workflow (see below), which rebuilds every site app including the cross-account Waves of Grain app. Fully data-driven from the Vivreal CMS via VR_Client_API. Read `C:\repos\Vivreal_Templates\CLAUDE.md` for depth — but it is STALE: last refreshed 2026-07-21, now 29 commits (PRs #74–#86) behind; truth = source + this digest. Its branch-model text (main+stable/promote-stable) is still correct. For the cross-repo site product/authoring model see `vivreal-sites`; for the AWS deploy pipeline see `vivreal-site-deploy-pipeline`; for site-visitor stats see `vivreal-analytics-knowledge`.

## Data flow

All fetching goes through `src/lib/api/client.ts`:
- `clientFetch<T>(path)` — fetch VR_Client_API, unwrap `{success,data,error}`.
- `clientFetchSafe<T>(path, fallback)` — same with fallback on error.
- `clientFetchCached` — cached fetch tagged `site:<SITE_ID>` with `SITE_CACHE_TTL_SECONDS` (default 60); invalidated by the revalidate webhook. Preview tokens bypass the cache.
- Quota: `isQuotaError`/402 → renders `<QuotaExceeded />`.

**Server Components first**: `page.tsx` (async, fetches) → `*Client.tsx` (interactive). All `generateMetadata()` reads `getSiteData()`.

## Revalidation webhook (Save → live in seconds, no rebuild)

`src/app/api/revalidate/route.ts` — **Node runtime + `force-dynamic`** (needs `revalidateTag` and `node:crypto` `timingSafeEqual`). VR_Secure_API's webhookDelivery Lambda POSTs change events signed `X-Vivreal-Signature: sha256=<hex(HMAC_SHA256(secret, rawBody))>`; after constant-time verification, `tagsForEvent` derives the affected tags — `site:<SITE_ID>` (site chrome/theme/nav/footer), `collection:<refID>`, `integration:<type>` — and calls `revalidateTag`. **Fails closed (401)** until `REVALIDATE_WEBHOOK_SECRET` is provisioned on the app.

## Routes

`[slug]` (universal page, `COMPOSE_FORMATS` — now incl. `catalog` / `craft` / `profile` / `location-hub` / `panorama` / `discography`; a format ABSENT from `COMPOSE_FORMATS` 404s — the `/shop` and `/about-us` regressions), `[slug]/[itemId]` (collection-item detail incl. `collection-list` arm + depth-2 nested pages), `og/[slug]` (dynamic OG image), `api/{review,subscribe,shows,contact,checkout,validate-coupon,revalidate}`, `feeds/schedule.ics`, `mcp` + `.well-known/{mcp.json,llms.txt}`.

## Everything is data-driven — no hardcoded brand

Colors/logo/site name/social/contact all come from `siteData`. **Never commit client-specific content, brand names, colors, or logos.** SSR theme vars go on `<html>` (`THEME_TOKEN_KEYS`). Per-site: `siteData.fontFamily` (`resolveSiteFont` — Geist via next/font, 7 curated families via globals @import, arbitrary → runtime `<link>`), `siteData.favicon`, `styleVariant`, nav chrome (`headerStyle`/`headerWidth`/`secondaryCta`/`brand.logoHeight`, `siteData.chrome` dark/light), footer (`socialStyle`/`newsletterPlacement`/`brand.logoFilter`/tagline), `siteData.floatingCta` FAB, `siteData.emailPopup`, inline email capture via Providers-injected `onSubscribe`. The "Powered by Vivreal" attribution is tier-gated: `StaticPageTemplate` (and the renderer Footer) call `canHidePoweredBy`, imported **from the renderer re-export** — the direct `@hillbombcreations/tier-quotas` dependency was DROPPED (a second private GitHub Packages package can't auth in customer Amplify builds).

**Page-gate mirror retired**: `src/lib/pageGating.ts` + its spec are DELETED — `EmailPopup/index.tsx` and `Navigation/NavbarChrome.tsx` import `isPageAllowed`/`normalizePageSlug` from the renderer (1.36.0); `currentSlugFromPathname` → `normalizePageSlug` is behavior-identical incl. the null case. Consequence: **announcement bar per-page targeting now works** — it was previously authored in Studio and honored by nobody (the hand-mirrored page gate was the cause); it's now honored via the renderer's `isPageAllowed`.

## Analytics — TWO separate components

- `SiteAnalytics` — the CUSTOMER's third-party tag (`siteData.analytics {provider: google_analytics|plausible|fathom, trackingId}`), fail-closed ID validation.
- `SiteBeacon` — Vivreal's first-party cookieless beacon → `https://collect.vivreal.io/e` (override `NEXT_PUBLIC_ANALYTICS_ENDPOINT`), gated on `SITE_ID` set and ≠ `'preview'` (on by default for deployed sites, NOT gated on `siteData.analytics`).

## SEO / OG + the demo-safety gate

Origin resolution chain: `NEXT_PUBLIC_SITE_URL` → `domainInformation.live_url` → `domainName` (`resolveSiteOrigin`; `domainInformation` threads through `getSiteData`). Per-page `seo.metaTitle`/`seo.metaDescription`, exact-title rule (no `title.template`), `buildOgImageUrl` → `/og/<slug>`.

- **Per-page search visibility**: `seo.noindex` on a page emits `robots {index:false, follow:false}` from `generateMetadata` in BOTH `[slug]/page.tsx` and the home `page.tsx`; emitted only when set (the root `layout.tsx` demo-site rule stands alone). Stored as the negative (`noindex`) — absence = indexed, no backfill needed.
- **Site-wide default share image**: the `/og` fallback chain is three rungs — page `labels.ogImage` → site `defaultOgImage` → generated branded card. `defaultOgImage` is read from `siteDetails.values` ONLY (no top-level fallback, unlike the announcement/utility/fulfillment strips) — it's a MEDIA descriptor and `values` is the only location the mediaFields registry can reach to sign; a top-level copy arrives unsigned and renders nothing.

**Demo sites must not outrank the customer's real site.** `src/lib/seo/demoSafety.ts` — `isDemoSite()` + `getDemoSourceUrl()`, keyed on `siteData.lifecycleState` (`'demo' | 'live'` — flat `siteDetails.values` field alongside `sourceUrl`; flips at cutover via the revalidate webhook, no rebuild) with a `SITE_LIFECYCLE` env fallback. **Fail-safe: absent ⇒ NOT demo ⇒ indexable.** Wired into `robots.tsx` (`Disallow: /` for demos), `getSiteMap` (returns an empty sitemap for demos; the live sitemap is built by `buildSitemapEntries` in `src/lib/seo/sitemap.ts` from `raw.pages`), and the root `layout.tsx` `generateMetadata` (`noindex,nofollow` + canonical → `sourceUrl`).

## Media — CloudFront signed only

`src/lib/api/media.ts` is canonical:
- `getSignedUrl(field)` — reads `currentFile.source` (signed by VR_Client_API's signCloudFrontUrl; **unsigned CDN URLs 403**). Never build CDN URLs manually.
- `getSrcSet(field)` — reads `currentFile.srcset` (signed resized variants; absent until the backfill has run for that media).
- `getArtDirectedSources(field)` — maps `{primary, sources[]}` to the renderer's `ContentItem.artDirectedSources` (`<picture>`), dropping variants missing a media query or signed source.

CDN domain `media.vivreal.io` lives in `next.config.ts` `images.remotePatterns` (plus `*.s3.us-east-1.amazonaws.com`). Signing TTL is 300s (`CLOUDFRONT_SIGNED_URL_TTL_SECONDS` on the API side) — so `src/components/JsonLd/unsignMediaUrl.ts` strips `Expires`/`Signature`/`Key-Pair-Id` before JSON-LD/OG embedding (signed URLs expire before crawlers read them). `images.unoptimized` is env-gated (`VIVREAL_PREVIEW_UNOPTIMIZED === '1'`, local pre-cutover previews only); `dangerouslyAllowSVG` is on with a hardened CSP (`script-src 'none'; sandbox`) so migrated SVG logos don't 400.

## Storefront checkout path (Stripe + Square — PRs #77, #78, #80, #86)

- **The wire contract**: the cart POSTs `products[] = [{price, quantity, name}]` to `/api/checkout`; VR_Client_API resolves the payments provider SERVER-side from the group's single active payments integration. The `price` slot carries a Stripe price id OR a Square catalog `variationId` — page config can never misroute money; a wrong/missing provider binding yields an EMPTY catalog, not a mis-charge.
- **`src/lib/payments.ts`** — `PAYMENTS_PROVIDER_TYPES` (`stripe`, `square`) + `isPaymentsProvider()`: a deliberate LOCAL mirror of VR_Secure_API's D4-mutex set (`updateIntegrations.js` `PAYMENTS_PROVIDER_TYPES`) — same pattern as the renderer's local poweredBy tier set. Shopify is EXCLUDED on purpose (Phase 5 hosted-redirect checkout; not in the backend mutex set); a size-pinned test fails loudly on accidental additions. Consumers: the `Providers` `hasProducts` cart-mount gate, the `[slug]/[itemId]` detail route (provider resolved via `collectBindingTargets` — the SAME collector the list page uses, so list and detail fail consistently), and `buildPageContext`'s productBridge routing.
- **Cart-mount gate walks coordinated groups** (PR #78): the `Providers` `hasProducts` gate now WALKS coordinated-group child bindings (`src/lib/payments.ts` gained the walker; `Providers/index.tsx` simplified) — a coordinated-group parent binding alone no longer hides the cart.
- **Live overrides + PDP on ANY page format** (PR #80): `composePage` component overrides (`ProductsPageComposed`/`CoordinatedProductsComposed` — which carry `SiteRendererBridge` → the `CartAdapter`) were registered only in the `products` arm, so on any other format Add/Buy/card-click were silent no-ops (`ProductsProvider.handleAdd` guards on the adapter). Fixed via the shared `LIVE_PRODUCTS_OVERRIDES` module (`src/components/PageTemplates/liveProductsOverrides.ts`) + extracted `parseProductQuery` (`src/lib/composition/productQuery.ts`), registered for EVERY composed format; `renderComposedPage` accepts overrides + the controlled product query. The `[slug]/[itemId]` PDP arm fires when the page's bindings resolve a payments provider via `collectBindingTargets`, and falls through to the collection/menu arms on a product miss so catalog tiles keep working. Found on the first live Square E2E (catalog-format Shop page).
- **BrandMark cart adoption** (PR #86, ships with `^1.42.0`): `Navigation/CartDialog.tsx` + `ProductDetailClient/FloatingCartDialog.tsx` render the renderer's `BrandMark` instead of a cropped fixed-box logo ("never crop a brand logo").
- **`checkoutIdentifier` threading** (renderer ≥1.38.0): consumers resolve `checkoutIdentifier ?? default_price` — coalesced BEFORE `resolveVariantableString`, which is what keeps legacy Stripe sites argument-identical. The identifier passes through FOUR explicit whitelist projections; silently dropping it from any one breaks Square checkout (empty `priceID`) with no compile error, so each is a pure test-pinned module: `lib/api/products/transformProduct.ts` (objectValue → `Product`, adds `checkoutIdentifier: objectValue.checkoutIdentifier ?? default_price ?? scalar variationId`), `lib/cartProduct.ts` (`rendererProductToTemplates`), `components/PageTemplates/ProductDetailRenderer/templatesProductToRenderer.ts`, plus the renderer's own `contentItemToProduct`.
- **Testability extraction pattern**: `npm test` is `node --experimental-strip-types --test "src/**/*.test.ts"` — it cannot load `'use client'`/`.tsx`/`server-only` modules, and RUNTIME imports need relative explicit-`.ts` paths (type-only `@/` imports are fine — they're stripped). Pure logic that needs pinning gets extracted into a plain `.ts` sibling (precedents: `mapItem.ts`, `transformProduct.ts`, `cartProduct.ts`, `templatesProductToRenderer.ts`).

## Branch model, releases + env

- `main` = the only template; `stable` = the release channel every site builds. There are NO per-customer or per-template-type branches. Per-site emergency hold = disable that app's `stable` auto-build + explicit `start-job`.
- **promote-stable** (`.github/workflows/promote-stable.yml`): `workflow_dispatch`-only manual promotion fast-forwarding `main` → `stable`. GitHub App installation token, `promote-stable` concurrency group, a `merge-base --is-ancestor` guard plus a non-force push (double fast-forward protection). The stable push rebuilds the whole fleet.
- **Lockfile gotcha**: recurring stable-fleet build breakage has come from package-lock drift — the class covers npm 10/11 pruning `@emnapi` transitive entries AND dropped `sharp` optional transitives (the 1.40.1 fleet rollout was blocked by a clean regen dropping sharp's optional transitives — "fix(lockfile): clean regen — restore sharp optional transitives"); Amplify's `npm ci` then fails. Same fix every time: delete `node_modules` + `package-lock.json`, full reinstall, verify `npm ci` locally.
- Env injected by EventHandler at Amplify deploy: `API_KEY`, `SITE_ID`, `NEXT_PUBLIC_SITE_URL`, `SITE_CACHE_TTL_SECONDS`, `REVALIDATE_WEBHOOK_SECRET`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT`, `NEXT_PUBLIC_SENTRY_DSN`, `PARTNERS_ID` (`SHOWS_ID`/`TEAMMEMBERS_ID` legacy fallbacks). `BUCKET_NAME`/`CDN_BASE_URL` are gone.

## Updating @hillbombcreations/site-renderer

Installed from **GitHub Packages** (`.npmrc`: `@hillbombcreations:registry=npm.pkg.github.com` + `NODE_AUTH_TOKEN`), currently ^1.42.0 on `main`. Note a clean regen floats OTHER carets too (the 1.38.0 bump rode next 16.2.11→16.2.12 + sentry 10.68 to the whole fleet) and can DROP optional transitives (the 1.40.1 sharp incident above) — treat the first post-merge `main` CI build as the canary before `promote-stable`. Bump the version, then clean-reinstall (delete `node_modules` + `package-lock.json` — Amplify runs `npm ci`; a stale or npm-pruned lock fails the fleet build). Local renderer dev: `npm run dev:linked` (runs `../vivreal-site-renderer/scripts/dev-sync.js`). The old `--install-links` git-dep dance is dead. Do NOT add other private `@hillbombcreations/*` deps — customer Amplify tokens can only read the renderer package.

## Gotchas

- The rendered site does NOT read `templateType` for layout — layout comes from `pageConfigs[].format` (one exception: `templateType === 'restaurant'` enables the FAB). Render-behavior changes belong in the renderer, not branch logic.
- `data/mockData.ts` is fallback only (used if the API is unavailable).
