---
name: vivreal-renderer-knowledge
description: Use when working in vivreal-site-renderer (the @hillbombcreations/site-renderer npm package) — the rendering engine that turns Vivreal site config into a live website, consumed by both Vivreal_Templates (customer sites) and the portal Studio live-preview. Covers the publish-to-GitHub-Packages release runbook (publishing hits every live customer site), the ImageComponent injection seam, the Tailwind v4 @source requirement, prefers-reduced-motion, and the DESIGN_LANGUAGE.md authority. Triggers on: vivreal-site-renderer, site-renderer, @hillbombcreations/site-renderer, renderer package, ContentRenderer, PageTemplates, publish renderer, bump renderer, primitives, design language. Source of truth: C:\repos\vivreal-site-renderer\CLAUDE.md + docs/DESIGN_LANGUAGE.md.
---

# vivreal-site-renderer — knowledge digest

The **rendering engine** (`@hillbombcreations/site-renderer`) that turns Vivreal site config (pages + collections + pageConfigs) into a live website. Consumed by `Vivreal_Templates` (customer sites) and `Vivreal_Portal_Mobile` (Studio live-preview) — both pull from GitHub Packages at build time. React 18+ peer, TypeScript, framer-motion, Tailwind classes in source. Read `C:\repos\vivreal-site-renderer\CLAUDE.md` and `docs/DESIGN_LANGUAGE.md` for depth. For the site product/authoring model that drives this renderer (page formats, sections, Studio↔live composePage parity) see `vivreal-sites`.

## Structure

`src/components/` (Navbar/Footer/CTA/ScrollReveal), `src/HomeSections/`, `src/PageTemplates/` (Products/Shows/Team), `src/layouts/`, `src/primitives/` (editorial: SectionMasthead, MonoMeta, EditorialCard, Spotlight, CategoryChipRail), `src/context/SiteRendererContext`, `ContentRenderer.tsx` (top-level dispatch), `index.ts` (public barrel = what consumers import). `dist/` is generated — **never hand-edit** (it's gitignored; CI builds it).

## Publishing = a production gate (it hits every live site)

The renderer is a published npm package; a publish reaches every deployed customer site on their next rebuild. Release runbook:
1. Edit `src/`, `npm run build` (tsc → dist), commit **src + package.json only** (dist is gitignored).
2. **Bump the version** (semver — patch/minor; major unused). Never republish a version (GitHub Packages rejects it).
3. **Push to `master`** → `.github/workflows/publish.yml` runs `npm ci` + build + `npm publish` automatically. (Local `npm publish` is discouraged + 403s with the read-only hb-api-secrets token; CI uses its own write token.)
4. **Bump consumers** — `Vivreal_Portal_Mobile` + `Vivreal_Templates` `package.json` → new version → `npm install` → commit each separately.
5. Deploy: portal on merge to main; Templates `main` push auto-syncs to all customer branches (no manual sync). Expect a rollout wave.

Rollback: ship a new patch (don't `npm unpublish`); consumers can pin an older version as an emergency lock.

## Key patterns

- **`SiteRendererContext.ImageComponent`** — the renderer does NOT import `next/image` (that would force Next.js on consumers). Default is plain `<img>`; Next consumers inject `next/image` via a provider. Studio preview strips it to plain `<img>` deliberately.
- **Respect `prefers-reduced-motion`** — all motion primitives fall back to static (`useReducedMotion()` / `motion-reduce:`).
- **Tailwind v4 `@source` requirement** — renderer utility classes silently no-op in v4 consumers unless the consumer's CSS `@source`-scans the renderer package/dist. Root cause of "padding missing / past shows not displaying" bugs. Portal `globals.css` `@source`-scans the renderer dist for Studio-preview parity.
- **Source is authoritative** — grep `src/`, not `dist/`. **Styling anything? Read `docs/DESIGN_LANGUAGE.md` FIRST** (primitives, palette-proofing via `color-mix`/CSS vars, the inline-layout "Tailwind-generation-proof" rule, `object-contain` for showpiece imagery).

## Forward/backward skew

`DetailSection` is a closed union: adding an enum value is a MINOR bump; changing existing semantics is MAJOR. Unknown section values from a future portal version render `null` (no crash). Versioning in older CLAUDE.md sections is historical — current published line moves fast; check `package.json`.
