---
name: vivreal-renderer-knowledge
description: 'Use when working in vivreal-site-renderer (@hillbombcreations/site-renderer), the engine behind Vivreal_Templates sites and the portal Studio preview. Covers the publish runbook (a publish hits every site) and pre-publish compose diff, the dev-sync.js dev overlay (a green consumer run can describe unpublished code), the ImageComponent seam, the Tailwind v4 @source rule, canHidePoweredBy, checkoutIdentifier, isPageAllowed, motion presets, identity kits, and DESIGN_LANGUAGE.md. Triggers on: vivreal-site-renderer, site-renderer, @hillbombcreations/site-renderer, renderer package, ContentRenderer, PageTemplates, publish renderer, bump renderer, primitives, design language, canHidePoweredBy, checkoutIdentifier, CartAdapter, isPageAllowed, DemoRibbon, motion preset, dev:linked, dev-sync, dev overlay, dev-status, RENDERER-DEV-OVERLAY, compose diff, pre-publish check, nullOnEmpty, hideOnMobile, imageFocus. Source of truth: C:\repos\vivreal-site-renderer\CLAUDE.md + docs/DESIGN_LANGUAGE.md + docs/DEV_OVERLAY.md.'
---

# vivreal-site-renderer: knowledge digest

**This package publishes most weeks, and its deployed line is `origin/master`: it has no `main`.**
Read the published version from `package.json` there, confirm it on the registry with
`npm view @hillbombcreations/site-renderer version`, and read what each consumer actually runs
from the consumer lockfile. The CLAUDE.md version header lags deliberately and is never the
answer. Nothing below states a current version, on purpose: every version this file has ever
carried was wrong within a fortnight, and a stale version reads exactly like a current one.

The **rendering engine** (`@hillbombcreations/site-renderer`) that turns Vivreal site config (pages + collections + pageConfigs) into a live website. Consumed by `Vivreal_Templates` (customer sites) and `Vivreal_Portal_Mobile` (Studio live-preview), both pull from GitHub Packages at build time, and also by `VR_Client_API` (the `./agent` subpath behind the Site MCP purchase tools), `VR_Secure_API` (pinned EXACTLY for the instantiation worker, with a vendored capability manifest) and `Vivreal_Site_Migrator` (kit capabilities regenerated from the published tarball). React 19 peer, next `^15||^16` peer, TypeScript, framer-motion 12, Tailwind classes in source. `C:\repos\vivreal-site-renderer\CLAUDE.md` + `docs/DESIGN_LANGUAGE.md` give depth. CLAUDE.md was refreshed 2026-09-30 and its version line (`CLAUDE.md:6`) now says to read `package.json` rather than naming a number, after it once went 23 minors stale and was believed; its feature sections still carry the version each feature SHIPPED in, which is history, not the current version. For the site product/authoring model that drives this renderer (page formats, sections, Studio↔live composePage parity) see `vivreal-sites`.

## The installed package is not always the published one

**Before you conclude anything about renderer capability from a consumer build, test, type-check or
screenshot, confirm that consumer is running the published package.** `scripts/dev-sync.js` in this
repo, reached through `npm run dev:linked` in `Vivreal_Templates` and `Vivreal_Portal_Mobile`, builds
this repo and copies `dist/` and `styles/` over that consumer's installed
`node_modules/@hillbombcreations/site-renderer`. It never reverts, and it deliberately never writes
that package's own `package.json`, so **the version string, `npm ls` and the lockfile `integrity` all
stay authentic**. No ordinary check sees it.

Measured 2026-09-30: an overlay stood in for the published package for **five days across both
consumers** and produced **three wrong conclusions, two of which reached commits**. Every one came
off a green run. It is not a rogue script, it is the intended local-validation path and it keeps
working; what was missing was a way to tell afterwards. This is the skill that gets loaded when
somebody reasons about what the renderer can do, which is exactly the population that got this
wrong, so the warning lives here.

- **Detect**, the check with no false negatives: `node C:/repos/vivreal-site-renderer/scripts/dev-status.js`
  (`npm run dev-status` here). Byte comparison of each consumer's installed package against the tarball
  that consumer's own lockfile `integrity` resolves to in the npm cache. About 0.2s per consumer, and it
  never invokes npm, so it cannot touch a lockfile. `--require-clean` exits 1 on any overlay.
- **Undo:** `node scripts/dev-unlink.js` (`--consumer <name>`, `--marker-only`). Restores from the
  verified cache tarball and proves the result. It never runs `npm install` or `npm ci`, and it never
  deletes the package directory, which holds a nested `lucide-react` the tarball does not contain. It
  refuses while a `next dev --turbopack` server is live, because Turbopack caches `node_modules`: stop
  the server first, and restart it after, a browser refresh alone will not pick the change up.
- **The marker is evidence, never the detector.** `RENDERER-DEV-OVERLAY.json` at the consumer repo
  root, outside the package directory (an extra file inside it would fail the byte proof), and
  deliberately not gitignored so it surfaces as untracked in `git status`. It only exists from
  2026-09-30, so its absence proves nothing about an older overlay.
- **Consumer guard:** `Vivreal_Templates` `pretest` and `prebuild` refuse when the marker is present
  (`checks/assert-no-renderer-overlay.mjs`, applied 2026-09-30). Acknowledge deliberately with
  `ALLOW_RENDERER_OVERLAY=1 npm test` in bash, or `$env:ALLOW_RENDERER_OVERLAY='1'; npm test` in
  PowerShell, where the bash form the guard prints is a CommandNotFoundException. Deliberately NOT on
  `predev`. **`Vivreal_Portal_Mobile` is guarded now too**: `prebuild`, `pretest`, `pretest:e2e`, `prekit:validate` and `pretest:smoke` all run `scripts/assert-no-renderer-overlay.mjs` (`package.json:14-29` on `origin/main`). On 2026-09-30 it carried an overlay with no marker, so a portal result from before that date is unverified; run `dev-status.js` rather than trusting the guard's silence for an older tree.

**Three checks that look like they would work and do not:** the version string, `npm ls` and the
lockfile, all authentic by design; the marker alone, since the portal was contaminated and carried
none; and an NTFS creation-time gap against `package.json`, which false-positives on any tree fixed by
the documented repair, because the repair rewrites `dist/` today and leaves `package.json` alone so the
gap widens. **And never quote a raw differing-file count as damage:** of 94 differing files on the
portal only **13** are genuine content drift, the other 81 differ by line endings alone, because CRLF
inside multi-line template literals is copied through verbatim by `tsc`. The raw count overstates it
about sixfold.

Full write-up, including the repair procedure: `docs/DEV_OVERLAY.md` in this repo.

## Structure

Key src dirs: `src/chrome/` (Navbar/Footer/MobileNav/OverlayNav/CardNav/UtilityStrip/SectionShell + `SocialIconRail.tsx`, `DemoRibbon.tsx`, `poweredBy.ts`, `deriveNav`/`resolveChrome`), `src/components/` (section building blocks: FloatingCta, ConfigurableForm, FooterView, `BrandMark.tsx`, `CapturePanel.tsx`, `ListenRow.tsx`, …), `src/HomeSections/`, `src/PageTemplates/` (products/shows/team/menu/schedule/collection + `CatalogStorefront`, `DiscographyIndex`, `ComposedPageSkeleton`), `src/DetailPage/`, `src/layouts/` (one file per layout dispatchId), `src/primitives/` (editorial: SectionMasthead, MonoMeta, EditorialCard, Spotlight, CategoryChipRail, RichText, SaleBadge; filtering: FilterSheet, FacetFilterBar, FilterPillStrip), `src/composition/` (`blocks.ts`, `defaultBlocks.ts`, `panoramaPanels.tsx`), `src/lib/` (`discography.ts`, `listenLinks.ts`, `mediaCarousel.ts`, `spotlightCarousel.ts`, `agendaList.ts`, …), `src/registry/` (`registry.ts` = the canonical dispatchId source), `src/tokens/` (`motion.ts`), `src/agent/` (`./agent` subpath export), `src/context/SiteRendererContext`, `ContentRenderer.tsx` (top-level dispatch), `index.ts` (public barrel). `dist/` is generated, **never hand-edit** (gitignored; CI builds it). Tests: `npm test` = SSR-render assertions via `renderToStaticMarkup` under `node --test`.

## Contracts the package owns (durable rules; the per-version history is `git log origin/master`)

- **The page gate is package-owned, enforcement is consumer-side.** `src/chrome/pageGating.ts` exports `isPageAllowed`, `normalizePageSlug` and `PageGate` for the `pages` gate on chrome configs (email popup, announcement strip). The two consumers differ in the current page (Templates from `usePathname()`, Studio is handed the active slug) and in what an unauthored gate means (the caller supplies `fallback`), so neither half moves into the other.
- **Relative palette values are dereferenced first.** `resolvePagePalette` resolves `var()` / `color-mix()` preset values before `resolveColor`, which rejects non-concrete colors (the "page color treatment is inert" bug).
- **`checkoutIdentifier` is the provider-agnostic checkout slot.** `DetailProductData.checkoutIdentifier?: Variantable<string>` is what the cart puts in `products[].price` (Stripe `default_price`; Square `variationId`, scalar only). `contentItemToProduct` fills it as `raw.checkoutIdentifier ?? raw.default_price ?? scalar raw.variationId`.
- **Dates render in the SITE's timezone**, switched on by one field, `siteDetails.values.timezone` (`src/types/Block.ts`).
- **A section's body survives an empty collection only when its layout says so.** Registry entries declare `nullOnEmpty`; `form`, `positions` and `article-toc` declare `false` (the first quality pass dropped every empty-collection section and would have deleted 30 forms on 17 live sites; only the real-data compose diff below caught it). A layout still declaring `true` is dropped when empty, by design.
- **Authoring knobs that are no-ops in places:** `sectionConfig.hideOnMobile: true` appends `hidden md:block` in `SectionShell` and does nothing on `home-section` and `cta` kinds, which pass no sectionConfig through; `imageFocus {x, y}` (0 to 100) sets the cover crop on heroes, spotlights, cards and split rows. A stored block with no `config` must render (a crash there broke vivreal.io's Amplify build once).
- **An unknown layout renders as `CardsLayout`, with no error.** `ContentRenderer.tsx` falls through `layoutMap[displayAs] ?? CardsLayout`, and site-loader never calls `checkRendererCompat`, so a binding naming a layout the PUBLISHED renderer lacks passes every check and ships a card grid. A strict enum fails the other way (`hero.variant` is a `z.enum` in site-loader, so a missing literal rejects the whole blueprint with a refusal that reads like a version problem). Check a `displayAs` against the published capability manifest, and ship a renderer publish and the kits that use its new layouts on the SAME train.
- **v6 (the minor Templates and the portal adopted 2026-10-14):** `DetailBody` is a new public export, scope entries can pin items by id (a rename never drops a picked item), and a curated font family named by its literal name carries its own stylesheet (`googleFontsHref`), beside the `siteFontsHref()` / `SITE_FONT_LITERAL_FAMILIES` helpers Templates now links from its layout because Turbopack drops a CSS `@import url()`. Read the pin from each consumer's lockfile.

- **The registry is the source of truth**, grep `src/registry/registry.ts`, not memory. Layout dispatchIds now run ~50 deep (pricing/faq/steps/comparison/tabs/link-cards/video/channel-diagram/… plus the July wave: `jump-links`, `calendar`, `agenda`, `locations`, `logo-wall`, `app-band`, `product-tiles`, `quote-carousel`, `story-panel`, `collage-strip`, `slideshow`, `category-directory`, `craft-split`, `index-list`, `social-panel`, `spotlight-panel`, `feature-split`, `longform`, `manifesto`, `positions`, `showcase-gallery`, `editorial-sections`, plus the musician wave: `media-carousel`, `spotlight-carousel`, `film-strip`, `postcard-strip`, all kind `layout`). Static blocks include `section-header`, `about`, `bio-panel`, `reservation`, `capture-panel` (`defaultBlocks.ts` appends it when no capture-panel block is present).
- **Page-template dispatchIds grew**: `catalog` (CatalogStorefront, category-rail sectioned browser for large categorized catalogs), `craft` (savoir-faire/heritage story) and `profile` (meet-the-maker), both delegate to standard composed sections; `location-hub` composes purely via `defaultBlocks.ts` (the format's value is semantics; no bespoke template); `panorama` (color-block anchored panels via `composition/panoramaPanels.tsx`) and `discography` (`DiscographyIndex.tsx`).
- **Identity kits**: there are many now (count them from the kit and registry sources, never from here). The founding four, three bakery + the musician **"poster-pop"** kit, set the pattern. The bakery three: **Levain** (split-product hero, mega dropdowns, StoryPanelLayout, QuoteCarouselLayout quote band, centerpiece footer, menu `itemStyle:'tiles'` cards via MenuTileCard + a PDP for menu items), **Poilâne** (CategoryDirectoryLayout / CraftSplitLayout / IndexListLayout landing comps, `tileStyle:'cutout'` menu cards, in-grid promo tiles, stamp badges), **Ansel** (ghost mastheads, gallery catalog, LongformLayout + the `profile` page format, boutique contact form). Shared kit primitives: UtilityStrip, FilterPillStrip, ManifestoLayout, PositionsBoardLayout, StepsLayout.
- **Motion-signature presets**, `src/tokens/motion.ts`: `MotionPreset`, `MOTION_PRESETS`, `resolveMotionPreset`, `motionPresetVars`. Named site-wide motion identities selected via the FLAT `siteData.motionPreset` field (not nested under `theme`), stamped on the DOM as `data-motion-preset`. Read the ids from `MOTION_PRESETS` (`MOTION_PRESET_NAMES` derives from it); the list grows with every kit, so never quote a count. An unknown id resolves to `DEFAULT_MOTION_PRESET`.
- **DemoRibbon** (`src/chrome/DemoRibbon.tsx` + `resolveDemoRibbon.ts`), floating pill for demo sites: sibling-theme switcher, hub-URL row, swatch dots, claim CTA; deliberately styled off the Studio palette, not the site palette. **ShowcaseGalleryLayout** = 3-up theme-comparison gallery (kind `layout`); **EditorialSectionsLayout** = magazine-band info pages.
- **Faceted filtering**, FilterSheet + FacetFilterBar driven by `sectionConfig.facets` (server-side narrowing via `sectionConfig.scope`), gated by `filterUi`: when absent, the legacy chips path renders byte-identical.
- **Config surface** (earlier wave, still current): `SiteData.floatingCta`, `SiteData.chrome: 'dark'|'light'`, per-page `PageConfig.palette` (rebase via `resolvePagePalette` with a WCAG guard), per-section `background:'dark'` band (SectionShell re-scopes palette vars), `navigation.headerWidth: 'contained'|'full'` + `megaMenu`, footer `socialStyle: 'column'|'icons'` + `newsletterPlacement: 'brand'|'bar'`, `sectionConfig.featureImage`/`detailEligible`, `PageHero.background {gradient|image|video}` + `emailCapture` + `variant`, `labels.animatedHero`, `labels.heroMotif`, `CTASection config.gradient`. Fleet-safe migration knobs (default-absent, no visual change until set): `navigation.navLinkColor`, `hero.eyebrowStyle`, `dropdownStyle:'cards'`.
- **Skeletons**: `ComposedPageSkeleton` (structure-derived; `products` + `collection-list` arms render real `CollectionPage` in loading mode).
- **`ResponsiveImage` is the srcset chokepoint**: raw `<img srcSet>` for CMS derivatives (next/image ignores manual srcSet), delegates to the injected `ImageComponent` otherwise. Gallery `sizes` now tracks column density; logo srcset tracks the rendered box. Route new image surfaces through it.

## Publishing = a production gate (it hits every live site)

The renderer is a published npm package; a publish reaches every deployed customer site on their next rebuild. Release runbook:
1. Edit `src/`, `npm run build` (tsc → dist), commit **src + package.json only** (dist is gitignored).
2. **Bump the version** (semver, patch/minor; major unused). Never republish a version (GitHub Packages rejects it).
3. **Run the real-data compose diff (below) BEFORE the version bump reaches `master`.** Unit tests run fixtures; this runs every page customers actually have.
4. **Push to `master`** → `.github/workflows/publish.yml` runs `npm ci` + build + `npm publish` automatically. It no-ops on an unchanged version, so a merged change with no bump publishes nothing (it no-op'd twice on 2026-10-03). Local `npm publish` is discouraged; CI uses its own write token.
5. **Bump consumers.** Pin the new version in each consumer's `package.json` and TEXT-PATCH the lockfile entry (version, resolved, integrity) rather than running `npm install`, which on Windows prunes the Linux-only optional dependencies the Amplify build needs; prove it with `npm ci --dry-run`. Templates, Secure (exact pin plus a re-vendored worker manifest) and the portal each had a "surgically patched lockfile" commit for every 1.7x/1.8x adoption.
6. Deploy: the portal ships via its release train, NOT a merge to `main` (`vivreal-infra:vivreal-lambda` `references/deploy.md`); Templates releases via the **promote-stable** workflow (main→stable FF), merging Templates `main` alone releases nothing; the stable push rebuilds every site app. Expect a rollout wave after promote-stable.

### The pre-publish real-data compose diff (how 1.81.0 and 1.83.0 were proven)

Render EVERY stored page of every live Templates site through the OLD and the NEW `dist` on identical real data, and diff the outcomes. It is a local, read-only check; nothing is published or deployed by it.

1. **Collect the data the live sites read.** List the Amplify apps (`aws amplify list-apps`), keep those whose repository is `Vivreal_Templates`, and for each read its `API_KEY` and `SITE_ID` env values. Fetch exactly what a live site fetches from `https://client.vivreal.io`: `GET /tenant/siteDetails?siteId=...`, then every `collectionId` / `itemCollectionId` the pages bind (`/tenant/collectionObjects?collectionId=...`) and every `integrationProvider` / `platforms` entry (`/tenant/integrationObjects?type=...`, `linkedin` canonicalised to `linkedIn`). Map items with Templates' own `src/lib/api/collections/mapItem.ts` `toContentItem`, so the renderer sees what production hands it. **This file holds real customer content and API keys: keep it in the session scratchpad, never in a repo.** **Throttle the fetch and fetch ONCE.** On 2026-10-04 this step, run as a burst (about 600 Client API calls in five minutes against the shared-tier Atlas cluster's 500-connection cap), degraded the cluster for hours and took Secure's site list down for every group (vivreal-hq `docs/projects/incident-2026-10-04-site-list/diagnosis.md`). Run at most 2 to 3 requests concurrently with a pause between sites, save the data file, and reuse it for every re-run of steps 2 to 5 instead of fetching again; if Client API latency is already elevated, wait.
   **Two cautions.** Read the app env with a `--query` naming only `API_KEY` and `SITE_ID`, into variables, and never print the values (they are per-site API keys). And every fetch that misses the API edge cache is an Atlas read against the M0 cluster's weekly data-out cap, which production sites share: run the collection once per candidate and diff from the saved data, never in a loop (limits and the throttle signature: `vivreal-infra:vivreal-atlas-topology`).
2. **Build both dists** (the published version and the candidate) and load each `dist/index.js`.
3. **For every page, call `composePage({ page, pages, data, options: { mode: 'live' }, isHome })` under each build and `renderToStaticMarkup` it**, with `siteData` assembled the way Templates does (`siteDetails.values` spread under the raw document, the home page split out as `homePageConfig`). Strip CR before comparing, because CRLF inside multi-line template literals is copied through by `tsc` and differs between checkouts.
4. **Report, per page:** a NEW throw (old rendered, new throws) is a blocker; a LOST `<section>` or `data-section-id` count is a dropped section and must be explained one by one; a lost `<h2>` is a heading change. Also count markers that prove the new feature actually renders (for 1.83.0: `duration`, `hidden md:block`, `object-position`).
5. **Controls, or the run proves nothing:** pages with at least one section must be the large majority (a loader that silently returns empty pages reports zero diffs), and the old build must render the same pages production serves today.

Measured: 1.80.1 composed all 103 stored pages of both Vivreal sites (both home pages crash without the guard); 1.81.0 composed 442 pages on 20 sites with 0 failures and cut real dead hrefs from 105 to 0; 1.83.0's run over 436 pages dropped only 9 placeholder sections on one demo site, after the first candidate had been caught removing 30 forms on 17 sites (ledger, 2026-10-03 and 2026-10-04).

Rollback: ship a new patch (don't `npm unpublish`); consumers can pin an older version as an emergency lock. **Dependency discipline**: this package must stay installable with a single GitHub Packages token, adding a second private `@hillbombcreations/*` dependency 401s customer Amplify builds (this killed 1.35.0; see the powered-by gate below).

## Key patterns

- **`SiteRendererContext`**, the injection seam: `ImageComponent`/`LinkComponent` (typed `ElementType`), `previewMode`, `CartAdapter`, `mapsApiKey`, `onSubscribe`. The renderer does NOT import `next/image` (that would force Next.js on consumers). Default is plain `<img>`; Next consumers inject `next/image` via a provider. Studio preview strips it to plain `<img>` deliberately.
- **Powered-by-Vivreal tier gate.** `src/chrome/poweredBy.ts` owns `canHidePoweredBy(tier)` against a **local** `Set`, deliberately NOT a `@hillbombcreations/tier-quotas` import: that dependency 401s a customer Amplify build, because those tokens cannot read a second private GitHub Packages package, and it broke a publish once. **Read the set out of the file; keep it in lock-step with tier-quotas `TIER_FLAGS.*.canHidePoweredBy`.** The trap worth carrying: the match is against the RAW STORED tier, so a group whose stored value is a RETIRED tier id fails the check and keeps the attribution. Folding a tier into another in the package does not rewrite a stored group document.
- **BrandMark: a brand logo is NEVER center-cropped** (`components/BrandMark.tsx`, 1.42.0+). `shape='inline'` = height-constrained `object-contain` at natural width; `shape='avatar'` = fixed square `object-contain`, and when the loaded image measures wide (`wordmarkAspect` default 1.6) the `<img>` is replaced by a letter-mark avatar (`brandInitials`); `fallbackSrc` (typically `siteData.favicon`) is preferred over the letter-mark. Aspect detection is client-side at image load, contain-fit until then, so the SSR first paint never crops. `fill` (1.42.1) lets the avatar box fill its parent so callers own responsive sizing.
- **Respect `prefers-reduced-motion`**, all motion primitives fall back to static (`useReducedMotion()` / `motion-reduce:`).
- **Tailwind v4 `@source` requirement**, renderer utility classes silently no-op in v4 consumers unless the consumer's CSS `@source`-scans the renderer package/dist. Root cause of "padding missing / past shows not displaying" bugs. Portal `globals.css` `@source`-scans the renderer dist for Studio-preview parity.
- **ESM discipline**, every relative import carries an explicit `.js` extension; match that in new code.
- **Source is authoritative**, grep `src/`, not `dist/`. **Styling anything? Read `docs/DESIGN_LANGUAGE.md` FIRST** (primitives, palette-proofing via `color-mix`/CSS vars, the inline-layout "Tailwind-generation-proof" rule, `object-contain` for showpiece imagery).

## Gotchas + forward/backward skew

- **Config-less blocks are legit**, `blockToComposedSection` in `src/composition/blocks.ts` guards `block.config?.`: a Mongo/Mixed round-trip drops empty `config` objects, and before the guard `block.config.bindings` threw and killed the entire Server-Components render. Never assume `block.config` exists.
- `DetailSection` is a closed union: adding an enum value is a MINOR bump; changing existing semantics is MAJOR. Unknown section values from a future portal version render `null` (no crash).
- Versioning in older CLAUDE.md sections is historical. The published line moves fast, so check `package.json` and the registry. Refresh the CLAUDE.md header only on a release commit, never on a docs-only master push: ANY master push triggers the publish workflow.
