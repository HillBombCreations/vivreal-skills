---
name: vivreal-templates-knowledge
description: Use when working in Vivreal_Templates — the Next.js 15 customer-site templates (each git branch = one template type) that render a Vivreal customer's content via VR_Client_API and the @hillbombcreations/site-renderer package. Covers the data-driven (no hardcoded brand) rule, server-component-first fetch via clientFetch, CloudFront signed media, the branch/template model + auto-sync workflow, and the --install-links renderer-update dance. Triggers on: Vivreal_Templates, site template, customer site, showcase/ecommerce template, clientFetch, getSiteData, template branch, site-renderer install, --install-links. Source of truth: C:\repos\Vivreal_Templates\CLAUDE.md.
---

# Vivreal_Templates — knowledge digest

Next.js 15 (App Router, TS strict, Tailwind 4) **customer-site templates**. Each branch = one template type; EventHandler forks per-customer branches off them; a GitHub Actions workflow syncs template changes to all matching customer sites. Fully data-driven from the Vivreal CMS via VR_Client_API. Read `C:\repos\Vivreal_Templates\CLAUDE.md` for depth. For the cross-repo site product/authoring model (page formats, site values, chrome, Studio parity) see `vivreal-sites`; for the AWS deploy pipeline see `vivreal-site-deploy-pipeline`.

## Data flow

All fetching goes through `src/lib/api/client.ts`:
- `clientFetch<T>(path)` — fetch VR_Client_API, unwrap `{success,data,error}`.
- `clientFetchSafe<T>(path, fallback)` — same with fallback on error.
- Collection endpoints return `{ items, totalCount }` inside `data`.

**Server Components first**: `page.tsx` (async, fetches) → `*Client.tsx` (interactive). Navbar + Footer are also Server Components (fetch nav). All `generateMetadata()` reads `getSiteData()`.

## Everything is data-driven — no hardcoded brand

Colors/logo/site name/social links/contact all come from `siteData` (CSS vars injected at runtime via `Providers`). **Never commit client-specific content, brand names, colors, or logos** — it must come from the API.

## Media — CloudFront signed only

`getSignedUrl(field)` extracts `currentFile.source` (the signed URL VR_Client_API generates for any field in `objectValue.mediaFields`). Unsigned CDN URLs → 403. Never build CDN URLs manually.

## Branch / template model

- Branches: `main` (landing), `ecommerce-v2`, `showcase`. User-site branches auto-created by EventHandler. Template changes auto-sync to customer branches via GitHub Actions — **there is NO manual sync step** (pushing/merging Templates `main` propagates to all customer branches, including for renderer bumps).
- Env vars (`API_KEY`, `SITE_ID`, `BUCKET_NAME`, `CDN_BASE_URL`, `SHOWS_ID`, `TEAMMEMBERS_ID`, …) are injected by EventHandler at Amplify deploy — not stored in the repo.

## Updating @hillbombcreations/site-renderer (the install dance)

```bash
rm -rf .next node_modules/@vivreal/site-renderer
npm install "github:HillBombCreations/vivreal-site-renderer#master" --install-links
npm run dev
```
`--install-links` forces a real copy — Turbopack can't resolve through npm's git-dep symlinks (build fails "Can't resolve '@vivreal/site-renderer'"). Clear `.next` because Turbopack caches compiled modules aggressively.

## Gotchas

- The rendered storefront does NOT read `templateType` — layout comes from `pageConfigs[].format`. Render-behavior changes belong in the renderer, not branch logic.
- `data/mockData.ts` is fallback only (used if the API is unavailable).
