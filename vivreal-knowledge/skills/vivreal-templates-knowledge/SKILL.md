---
name: vivreal-templates-knowledge
description: Use when working in Vivreal_Templates — the Next.js 16 universal customer-site template (every customer site builds the shared `stable` branch; per-customer branches are dead) that renders a Vivreal customer's content via VR_Client_API and the @hillbombcreations/site-renderer package. Covers the data-driven (no hardcoded brand) rule, server-component-first fetch via clientFetch/clientFetchCached + the HMAC tag-revalidation webhook, CloudFront signed media (getSignedUrl/getSrcSet/unsignMediaUrl), the demo-site noindex gate (lifecycleState demo|live), analytics (SiteAnalytics vs SiteBeacon), per-page SEO + dynamic OG images, per-site theming, the promote-stable release workflow, and GitHub-Packages renderer installs. Triggers on: Vivreal_Templates, site template, customer site, clientFetch, getSiteData, stable branch, promote-stable, site-renderer install, SiteBeacon, OG image route, per-site font, revalidate webhook, lifecycleState, demo site. Source of truth: C:\repos\Vivreal_Templates\CLAUDE.md.
---

# Vivreal_Templates — knowledge digest

Last synced: 2026-07-21

Next.js **16** (App Router, TS strict, Tailwind 4, Turbopack builds) **universal customer-site template**, v0.2.0. The repo has **only `main`, `stable`, and dev PR branches** (Phase 2, 2026-07-15): every customer site's Amplify app builds the shared **`stable`** branch. Merging `main` releases NOTHING — releases go out via the **promote-stable** workflow (see below), which rebuilds every site app including the cross-account Waves of Grain app. Fully data-driven from the Vivreal CMS via VR_Client_API. Read `C:\repos\Vivreal_Templates\CLAUDE.md` for depth (CLAUDE.md refreshed 2026-07-21 — current as of this sync; its branch-model text now describes main+stable/promote-stable correctly). For the cross-repo site product/authoring model see `vivreal-sites`; for the AWS deploy pipeline see `vivreal-site-deploy-pipeline`; for site-visitor stats see `vivreal-analytics-knowledge`.

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

`[slug]` (universal page, `COMPOSE_FORMATS` — now incl. `catalog` / `craft` / `profile` / `location-hub`), `[slug]/[itemId]` (collection-item detail incl. `collection-list` arm + depth-2 nested pages), `og/[slug]` (dynamic OG image), `api/{review,subscribe,shows,contact,checkout,validate-coupon,revalidate}`, `feeds/schedule.ics`, `mcp` + `.well-known/{mcp.json,llms.txt}`.

## Everything is data-driven — no hardcoded brand

Colors/logo/site name/social/contact all come from `siteData`. **Never commit client-specific content, brand names, colors, or logos.** SSR theme vars go on `<html>` (`THEME_TOKEN_KEYS`). Per-site: `siteData.fontFamily` (`resolveSiteFont` — Geist via next/font, 7 curated families via globals @import, arbitrary → runtime `<link>`), `siteData.favicon`, `styleVariant`, nav chrome (`headerStyle`/`headerWidth`/`secondaryCta`/`brand.logoHeight`, `siteData.chrome` dark/light), footer (`socialStyle`/`newsletterPlacement`/`brand.logoFilter`/tagline), `siteData.floatingCta` FAB, `siteData.emailPopup`, inline email capture via Providers-injected `onSubscribe`. The "Powered by Vivreal" attribution is tier-gated: `StaticPageTemplate` (and the renderer Footer) call `canHidePoweredBy`, imported **from the renderer re-export** — the direct `@hillbombcreations/tier-quotas` dependency was DROPPED (a second private GitHub Packages package can't auth in customer Amplify builds).

## Analytics — TWO separate components

- `SiteAnalytics` — the CUSTOMER's third-party tag (`siteData.analytics {provider: google_analytics|plausible|fathom, trackingId}`), fail-closed ID validation.
- `SiteBeacon` — Vivreal's first-party cookieless beacon → `https://collect.vivreal.io/e` (override `NEXT_PUBLIC_ANALYTICS_ENDPOINT`), gated on `SITE_ID` set and ≠ `'preview'` (on by default for deployed sites, NOT gated on `siteData.analytics`).

## SEO / OG + the demo-safety gate

Origin resolution chain: `NEXT_PUBLIC_SITE_URL` → `domainInformation.live_url` → `domainName` (`resolveSiteOrigin`; `domainInformation` threads through `getSiteData`). Per-page `seo.metaTitle`/`seo.metaDescription`, exact-title rule (no `title.template`), `buildOgImageUrl` → `/og/<slug>`.

**Demo sites must not outrank the customer's real site.** `src/lib/seo/demoSafety.ts` — `isDemoSite()` + `getDemoSourceUrl()`, keyed on `siteData.lifecycleState` (`'demo' | 'live'` — flat `siteDetails.values` field alongside `sourceUrl`; flips at cutover via the revalidate webhook, no rebuild) with a `SITE_LIFECYCLE` env fallback. **Fail-safe: absent ⇒ NOT demo ⇒ indexable.** Wired into `robots.tsx` (`Disallow: /` for demos), `getSiteMap` (returns an empty sitemap for demos; the live sitemap is built by `buildSitemapEntries` in `src/lib/seo/sitemap.ts` from `raw.pages`), and the root `layout.tsx` `generateMetadata` (`noindex,nofollow` + canonical → `sourceUrl`).

## Media — CloudFront signed only

`src/lib/api/media.ts` is canonical:
- `getSignedUrl(field)` — reads `currentFile.source` (signed by VR_Client_API's signCloudFrontUrl; **unsigned CDN URLs 403**). Never build CDN URLs manually.
- `getSrcSet(field)` — reads `currentFile.srcset` (signed resized variants; absent until the backfill has run for that media).
- `getArtDirectedSources(field)` — maps `{primary, sources[]}` to the renderer's `ContentItem.artDirectedSources` (`<picture>`), dropping variants missing a media query or signed source.

CDN domain `media.vivreal.io` lives in `next.config.ts` `images.remotePatterns` (plus `*.s3.us-east-1.amazonaws.com`). Signing TTL is 300s (`CLOUDFRONT_SIGNED_URL_TTL_SECONDS` on the API side) — so `src/components/JsonLd/unsignMediaUrl.ts` strips `Expires`/`Signature`/`Key-Pair-Id` before JSON-LD/OG embedding (signed URLs expire before crawlers read them). `images.unoptimized` is env-gated (`VIVREAL_PREVIEW_UNOPTIMIZED === '1'`, local pre-cutover previews only); `dangerouslyAllowSVG` is on with a hardened CSP (`script-src 'none'; sandbox`) so migrated SVG logos don't 400.

## Branch model, releases + env

- `main` = the only template; `stable` = the release channel every site builds. There are NO per-customer or per-template-type branches. Per-site emergency hold = disable that app's `stable` auto-build + explicit `start-job`.
- **promote-stable** (`.github/workflows/promote-stable.yml`): `workflow_dispatch`-only manual promotion fast-forwarding `main` → `stable`. GitHub App installation token, `promote-stable` concurrency group, a `merge-base --is-ancestor` guard plus a non-force push (double fast-forward protection). The stable push rebuilds the whole fleet.
- **Lockfile gotcha**: recurring stable-fleet build breakage has come from package-lock drift — npm 10/11 prune `@emnapi` transitive entries, and Amplify's `npm ci` then fails. On renderer bumps, delete `node_modules` + `package-lock.json` and reinstall cleanly.
- Env injected by EventHandler at Amplify deploy: `API_KEY`, `SITE_ID`, `NEXT_PUBLIC_SITE_URL`, `SITE_CACHE_TTL_SECONDS`, `REVALIDATE_WEBHOOK_SECRET`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT`, `NEXT_PUBLIC_SENTRY_DSN`, `PARTNERS_ID` (`SHOWS_ID`/`TEAMMEMBERS_ID` legacy fallbacks). `BUCKET_NAME`/`CDN_BASE_URL` are gone.

## Updating @hillbombcreations/site-renderer

Installed from **GitHub Packages** (`.npmrc`: `@hillbombcreations:registry=npm.pkg.github.com` + `NODE_AUTH_TOKEN`), currently ^1.35.1. Bump the version, then clean-reinstall (delete `node_modules` + `package-lock.json` — Amplify runs `npm ci`; a stale or npm-pruned lock fails the fleet build). Local renderer dev: `npm run dev:linked` (runs `../vivreal-site-renderer/scripts/dev-sync.js`). The old `--install-links` git-dep dance is dead. Do NOT add other private `@hillbombcreations/*` deps — customer Amplify tokens can only read the renderer package.

## Gotchas

- The rendered site does NOT read `templateType` for layout — layout comes from `pageConfigs[].format` (one exception: `templateType === 'restaurant'` enables the FAB). Render-behavior changes belong in the renderer, not branch logic.
- `data/mockData.ts` is fallback only (used if the API is unavailable).
