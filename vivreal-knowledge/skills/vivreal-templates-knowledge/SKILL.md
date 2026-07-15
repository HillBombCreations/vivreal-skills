---
name: vivreal-templates-knowledge
description: Use when working in Vivreal_Templates — the Next.js 16 universal customer-site template (ALL customer sites build the shared `stable` channel branch; per-customer branches are DEAD as of Phase 2, 2026-07-15) that renders a Vivreal customer's content via VR_Client_API and the @hillbombcreations/site-renderer package. Covers the data-driven (no hardcoded brand) rule, server-component-first fetch via clientFetch/clientFetchCached + tag revalidation, CloudFront signed media, the two analytics components (SiteAnalytics third-party tag vs SiteBeacon first-party), per-page SEO + dynamic OG images, per-site theming (fonts/favicon/chrome), the promote-stable release workflow, and GitHub-Packages renderer installs. Triggers on: Vivreal_Templates, site template, customer site, clientFetch, getSiteData, stable branch, promote-stable, site-renderer install, SiteBeacon, site analytics beacon, OG image route, per-site font, revalidate webhook. Source of truth: C:\repos\Vivreal_Templates\CLAUDE.md.
---

# Vivreal_Templates — knowledge digest

Last synced: 2026-07-13

Next.js **16** (App Router, TS strict, Tailwind 4, Turbopack builds) **universal customer-site template**, v0.2.0. The repo has **only `main`, `stable`, and dev PR branches** (Phase 2, 2026-07-15): every customer site's Amplify app builds the shared **`stable`** branch. Merging `main` releases NOTHING — releases go out via the **promote-stable** workflow (workflow_dispatch, fast-forward-only main→stable, GitHub App auth), which auto-builds every site app including the cross-account Waves of Grain app. Fully data-driven from the Vivreal CMS via VR_Client_API. Read `C:\repos\Vivreal_Templates\CLAUDE.md` for depth. For the cross-repo site product/authoring model see `vivreal-sites`; for the AWS deploy pipeline see `vivreal-site-deploy-pipeline`; for site-visitor stats see `vivreal-analytics-knowledge`.

## Data flow

All fetching goes through `src/lib/api/client.ts`:
- `clientFetch<T>(path)` — fetch VR_Client_API, unwrap `{success,data,error}`.
- `clientFetchSafe<T>(path, fallback)` — same with fallback on error.
- `clientFetchCached` — cached fetch tagged `site:<SITE_ID>` with `SITE_CACHE_TTL_SECONDS` (default 60); invalidated by the HMAC-verified `/api/revalidate` webhook. Preview tokens bypass the cache.
- Quota: `isQuotaError`/402 → renders `<QuotaExceeded />`.

**Server Components first**: `page.tsx` (async, fetches) → `*Client.tsx` (interactive). All `generateMetadata()` reads `getSiteData()`.

## Routes

`[slug]` (universal page, `COMPOSE_FORMATS`), `[slug]/[itemId]` (collection-item detail incl. `collection-list` arm + depth-2 nested pages), `og/[slug]` (dynamic OG image), `api/{review,subscribe,shows,contact,checkout,validate-coupon,revalidate}`, `feeds/schedule.ics`, `mcp` + `.well-known/{mcp.json,llms.txt}`.

## Everything is data-driven — no hardcoded brand

Colors/logo/site name/social/contact all come from `siteData`. **Never commit client-specific content, brand names, colors, or logos.** SSR theme vars go on `<html>` (`THEME_TOKEN_KEYS`). Per-site: `siteData.fontFamily` (`resolveSiteFont` — Geist via next/font, 7 curated families via globals @import, arbitrary → runtime `<link>`), `siteData.favicon`, `styleVariant`, nav chrome (`headerStyle`/`headerWidth`/`secondaryCta`/`brand.logoHeight`, `siteData.chrome` dark/light), footer (`socialStyle`/`newsletterPlacement`/`brand.logoFilter`/tagline), `siteData.floatingCta` FAB, `siteData.emailPopup`, inline email capture via Providers-injected `onSubscribe`.

## Analytics — TWO separate components

- `SiteAnalytics` — the CUSTOMER's third-party tag (`siteData.analytics {provider: google_analytics|plausible|fathom, trackingId}`), fail-closed ID validation.
- `SiteBeacon` — Vivreal's first-party cookieless beacon → `https://collect.vivreal.io/e` (override `NEXT_PUBLIC_ANALYTICS_ENDPOINT`), gated on `SITE_ID` set and ≠ `'preview'` (on by default for deployed sites, NOT gated on `siteData.analytics`).

## SEO / OG

Origin resolution chain: `NEXT_PUBLIC_SITE_URL` → `domainInformation.live_url` → `domainName` (`resolveSiteOrigin`; `domainInformation` threads through `getSiteData`). Per-page `seo.metaTitle`/`seo.metaDescription`, exact-title rule (no `title.template`), `buildOgImageUrl` → `/og/<slug>`.

## Media — CloudFront signed only

`getSignedUrl(field)` extracts `currentFile.source` (signed URL from VR_Client_API for fields in `objectValue.mediaFields`). Unsigned CDN URLs → 403. Never build CDN URLs manually.

## Branch model + env

- `main` = the only template; `stable` = the release channel every site builds. There are NO per-customer or per-template-type branches. Release = run the promote-stable workflow; per-site emergency hold = disable that app's `stable` auto-build + explicit `start-job`.
- Env injected by EventHandler at Amplify deploy: `API_KEY`, `SITE_ID`, `NEXT_PUBLIC_SITE_URL`, `SITE_CACHE_TTL_SECONDS`, `REVALIDATE_WEBHOOK_SECRET`, `NEXT_PUBLIC_ANALYTICS_ENDPOINT`, `NEXT_PUBLIC_SENTRY_DSN`, `PARTNERS_ID` (`SHOWS_ID`/`TEAMMEMBERS_ID` legacy fallbacks). `BUCKET_NAME`/`CDN_BASE_URL` are gone.

## Updating @hillbombcreations/site-renderer

Installed from **GitHub Packages** (`.npmrc`: `@hillbombcreations:registry=npm.pkg.github.com` + `NODE_AUTH_TOKEN`), currently ^1.29.3. Bump the version, regenerate the lockfile (Amplify runs `npm ci` — a stale lock fails the build). Local renderer dev: `npm run dev:linked` (runs `../vivreal-site-renderer/scripts/dev-sync.js`). The old `--install-links` git-dep dance is dead.

## Gotchas

- The rendered site does NOT read `templateType` for layout — layout comes from `pageConfigs[].format` (one exception: `templateType === 'restaurant'` enables the FAB). Render-behavior changes belong in the renderer, not branch logic.
- `data/mockData.ts` is fallback only (used if the API is unavailable).
