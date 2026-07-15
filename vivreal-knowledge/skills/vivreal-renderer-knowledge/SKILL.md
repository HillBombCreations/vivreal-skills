---
name: vivreal-renderer-knowledge
description: Use when working in vivreal-site-renderer (the @hillbombcreations/site-renderer npm package) — the rendering engine that turns Vivreal site config into a live website, consumed by both Vivreal_Templates (customer sites) and the portal Studio live-preview. Covers the publish-to-GitHub-Packages release runbook (publishing hits every live customer site), the ImageComponent injection seam, the Tailwind v4 @source requirement, prefers-reduced-motion, and the DESIGN_LANGUAGE.md authority. Triggers on: vivreal-site-renderer, site-renderer, @hillbombcreations/site-renderer, renderer package, ContentRenderer, PageTemplates, publish renderer, bump renderer, primitives, design language. Source of truth: C:\repos\vivreal-site-renderer\CLAUDE.md + docs/DESIGN_LANGUAGE.md.
---

# vivreal-site-renderer — knowledge digest

Last synced: 2026-07-13 (published version **1.29.3**)

The **rendering engine** (`@hillbombcreations/site-renderer`) that turns Vivreal site config (pages + collections + pageConfigs) into a live website. Consumed by `Vivreal_Templates` (customer sites) and `Vivreal_Portal_Mobile` (Studio live-preview) — both pull from GitHub Packages at build time. React 19 peer, next `^15||^16` peer, TypeScript, framer-motion 12, Tailwind classes in source. Read `C:\repos\vivreal-site-renderer\CLAUDE.md` and `docs/DESIGN_LANGUAGE.md` for depth. For the site product/authoring model that drives this renderer (page formats, sections, Studio↔live composePage parity) see `vivreal-sites`.

## Structure

14 src dirs: `src/components/` (Navbar/Footer/CTA/ScrollReveal), `src/HomeSections/`, `src/PageTemplates/` (products/shows/team/menu/schedule/collection/subscribe/checkout-status), `src/layouts/`, `src/primitives/` (editorial: SectionMasthead, MonoMeta, EditorialCard, Spotlight, CategoryChipRail, RichText, SaleBadge), `src/composition/`, `src/registry/` (`registry.ts` = the canonical dispatchId source), `src/agent/` (`./agent` subpath export), `src/context/SiteRendererContext`, `ContentRenderer.tsx` (top-level dispatch), `index.ts` (public barrel). `dist/` is generated — **never hand-edit** (gitignored; CI builds it). Tests: `npm test` = SSR-render assertions via `renderToStaticMarkup` under `node --test`.

## The June–July 2026 wave (1.5.0 → 1.29.3) — what exists now

- **Layout dispatchIds** (check `src/registry/registry.ts`, not memory): `pricing`, `faq`, `steps`, `comparison`, `tabs`, `link-cards`, `video` (+`embed` alias), `channel-diagram`, `use-case-selector`, `home-comparison`, `editor-demo`, `feature-demo`. Static blocks: `section-header`, `about`, **`reservation`** (OpenTable/Resy/Tock, config-only via `config.labels`).
- **Config surface**: `SiteData.floatingCta`, `SiteData.chrome: 'dark'|'light'`, per-page `PageConfig.palette` (rebase via `resolvePagePalette` with a WCAG guard), per-section `background:'dark'` band (SectionShell re-scopes palette vars), `navigation.headerWidth: 'contained'|'full'` + `megaMenu`, footer `socialStyle: 'column'|'icons'` + `newsletterPlacement: 'brand'|'bar'`, `sectionConfig.featureImage`/`detailEligible`, `PageHero.background {gradient|image|video}` + `emailCapture` + `variant`, `labels.animatedHero` (blur-mesh backdrop), `labels.heroMotif: 'publish-flow'|'publish-flow-storyboard'`, `CTASection config.gradient`.
- **Skeletons**: `ComposedPageSkeleton` (structure-derived; `products` + `collection-list` arms render real `CollectionPage` in loading mode).
- **`ResponsiveImage` is the srcset chokepoint** (since 1.18.5): raw `<img srcSet>` for CMS derivatives (next/image ignores manual srcSet), delegates to the injected `ImageComponent` otherwise. Route new image surfaces through it.

## Publishing = a production gate (it hits every live site)

The renderer is a published npm package; a publish reaches every deployed customer site on their next rebuild. Release runbook:
1. Edit `src/`, `npm run build` (tsc → dist), commit **src + package.json only** (dist is gitignored).
2. **Bump the version** (semver — patch/minor; major unused). Never republish a version (GitHub Packages rejects it).
3. **Push to `master`** → `.github/workflows/publish.yml` runs `npm ci` + build + `npm publish` automatically. (Local `npm publish` is discouraged + 403s with the read-only hb-api-secrets token; CI uses its own write token.)
4. **Bump consumers** — `Vivreal_Portal_Mobile` + `Vivreal_Templates` `package.json` → new version → `npm install` → commit each separately.
5. Deploy: portal on merge to main; Templates releases via the **promote-stable** workflow (main→stable FF) — merging Templates `main` alone releases nothing; the stable push rebuilds every site app. Expect a rollout wave after promote-stable.

Rollback: ship a new patch (don't `npm unpublish`); consumers can pin an older version as an emergency lock.

## Key patterns

- **`SiteRendererContext`** — the injection seam: `ImageComponent`/`LinkComponent` (typed `ElementType`), `previewMode`, `CartAdapter`, `mapsApiKey`, `onSubscribe`. The renderer does NOT import `next/image` (that would force Next.js on consumers). Default is plain `<img>`; Next consumers inject `next/image` via a provider. Studio preview strips it to plain `<img>` deliberately.
- **Respect `prefers-reduced-motion`** — all motion primitives fall back to static (`useReducedMotion()` / `motion-reduce:`).
- **Tailwind v4 `@source` requirement** — renderer utility classes silently no-op in v4 consumers unless the consumer's CSS `@source`-scans the renderer package/dist. Root cause of "padding missing / past shows not displaying" bugs. Portal `globals.css` `@source`-scans the renderer dist for Studio-preview parity.
- **Source is authoritative** — grep `src/`, not `dist/`. **Styling anything? Read `docs/DESIGN_LANGUAGE.md` FIRST** (primitives, palette-proofing via `color-mix`/CSS vars, the inline-layout "Tailwind-generation-proof" rule, `object-contain` for showpiece imagery).

## Forward/backward skew

`DetailSection` is a closed union: adding an enum value is a MINOR bump; changing existing semantics is MAJOR. Unknown section values from a future portal version render `null` (no crash). Versioning in older CLAUDE.md sections is historical — current published line moves fast; check `package.json`.
