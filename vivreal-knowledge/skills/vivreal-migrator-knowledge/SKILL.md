---
name: vivreal-migrator-knowledge
description: Use when migrating an external website into the Vivreal CMS, turning an exemplar site into a reusable template, or working in Vivreal_Site_Migrator. Covers BOTH pipelines. /migrate <url> — 1:1 DATA/STRUCTURE parity (crawl → agents → assemble → bundle → audit → Studio → user-gated cutover, 3 human gates, block/best-fit gap policies, the verify-live post-deploy gate). /template <exemplar-url> — 1:1 DESIGN/LAYOUT parity with placeholder content + a fictional brand, producing renderer identity kits that feed the portal template picker. Also: the PARITY STANDARD, two mandatory audit passes, static-crawl blind spots + platform-aware deep extraction (WooCommerce/Shopify/Squarespace APIs), the slug-depth ≤2 rule, and the CAPABILITIES.md manifest. Triggers on: site migration, Site_Migrator, /migrate, /template, identity kit, template picker, cutover, crawl, site audit, CAPABILITIES.md. Source of truth: docs/migration-flow.md + docs/template-flow.md (README.md is stale; NO committed CLAUDE.md).
---

# Vivreal_Site_Migrator — knowledge digest

Last synced: 2026-07-21

Agent-driven repo with **two pipelines**: `/migrate` (migrate an external site's content into the Vivreal CMS, 1:1 data/structure parity) and `/template` (turn an exemplar site into a reusable renderer identity kit, 1:1 design/layout parity with placeholder content + a fictional brand). The repo is the **orchestrator only** — renderer components live in the renderer repo; net-new components are authored there via the template track's `component-builder` agent, never as migrator code. There is **no committed CLAUDE.md** — `docs/migration-flow.md` + `docs/template-flow.md` are truth (`README.md` is stale, pre-template-track). Operational detail lives in eight `.claude/agents/`: the five stage agents `{ingest,collections,integrations,site,cutover}.md` plus the Playwright-enabled template-era trio `{kit-designer,component-builder,page-confirm}.md`. The loader is extracted into `packages/site-loader` — installable as `@hillbombcreations/site-loader`, exposing `instantiateBlueprint` so the portal TEMPLATE PICKER can instantiate published blueprints.

## /migrate pipeline + gates

`crawl` (`commands/crawl.js <url> --max-pages=120 --deep` — deep = a second Playwright engine in `src/capture/deepCapture.js`; probe-discovered dead-404 routes dropped by `src/capture/deadPageFilter.js`; Elementor body recovery via `collectTopLevelBlocks` in `src/capture/extractInPage.js`; Shopify catalog facets auto-enriched into `capture.commerce`, backfillable via `commands/enrich-commerce.js`) → `ingest` agent → `collections` + `integrations` agents (parallel; then the deterministic `commands/build-derived-collections.js` step, e.g. `buildHomeComparisonRows`) → `site` agent (LAST — binds only to keys collections emitted) → `commands/assemble-blueprint.js --gap-policy` → `commands/preview-bundle.js` + `serve-preview.js` → **audit** → Studio validation → `commands/load.js` (**user-gated cutover**). `captures/<domain>/` is gitignored and fully regenerable.

`/migrate <url>` runs it end to end with **3 human approval gates**: **Gate 1** pre-flight (URL + crawl scope, brand name — drives the `<key>.vivreal.io` subdomain, rendered brand, AND the Templates branch name — target group, gap policy, AND kit selection: `commands/select-kit.js` matches the vertical to an authored kit and writes `kit.json` — styling only, client brand always wins). **Gate 2** pre-creation (blueprint summary + per-page parity diff + screenshots; zero data/structure defects expected). **Gate 3** cutover (dispatches the `cutover` agent against production).

**Cutover:** default target is a **provisioned prospect-owned demo account** (VR_Main_API `provisionDemoAccount.js`, same brand name as assemble) — deploys noindex; pass `--live` ONLY at genuine go-live. `load.js --deploy` triggers the Deploy-Site Step Function via `POST /api/deploySite` (blank-template sites don't auto-deploy) and the `/api/revalidate` cache webhook; resume-safe via `load-state.json`. The loader drops pages bound only to zero-object collections (`convertBlocks` in the site-loader package). **Closing gate (MANDATORY after every deploy): `commands/verify-live.js`** — an HTTP-status sweep is NOT enough (Next streams a 200 shell and can `notFound()` mid-stream); it browser-drives every blueprint page checking hydrated-404 swap, a hydrated-content floor, TRUE-pixel image sharpness (density-corrected, re-decoded per `currentSrc`), and same-origin favicon links.

## /template pipeline (identity kits)

`/template <exemplar-url>`: **scout → design gate → build (Round A/B) → validate**, with its own user gates. **GATE 1** — the `kit-designer` agent live-scouts the exemplar, writes the design brief (HANDOFF doc) + question set. **Round A** — kit authoring (persona + theme + chrome + home); **Round B** — the page walk, each exemplar page authored 1:1. **Validate** — `commands/{confirm-site,confirm-page,exemplar-diff,rebrand-capture,harden-demo,distill-kit}.js`; the `page-confirm` agent rates every section MATCH / ADAPTATION / SURPLUS / DEFECT. **GATE 3** ships only when the **kit quota** is met: Nav 1 · Header-hero variant 1 · Landing structured components ≥3 · Motion preset 1 · Page type (new `format`) ≥1 (knobs don't count). Kits live in `kits/authored/*.json`; three bakery kits shipped (Levain, Poilâne/"Old Mill Bakehouse", Ansel). `component-builder` is the aesthetic-matching component authority: TEMPLATE mode builds net-new in the renderer repo, MIGRATION mode reuses best-fit only. Publishing: `commands/publish-template.js` + `infra/site-templates-bucket.yaml` (S3) — the portal picker then instantiates via `instantiateBlueprint`.

## PARITY STANDARD (the pass/fail bar)

**/migrate: 1:1 parity with the live site on DATA and STRUCTURE** — every page, section, item, field, media asset, link, and nav entry present, nothing invented. **Gaps are DEFECTS to resolve, not residuals to accept.** Styling is the ONE allowed divergence (Vivreal's design system may look *better*). **/template inverts it:** the same 1:1 discipline applied to DESIGN/LAYOUT — content is placeholder and the brand fictional by design. Never declare a page done from the crawl alone.

## Audit passes + the post-deploy gate

- **4A — live-DOM parity sweep (MANDATORY, first):** for EVERY page, Playwright-load the LIVE site, scroll top-to-bottom, extract a fingerprint (headings, `<video>` + CSS `background-image` srcs, iframes, image/form counts, nav, every external href), diff against the blueprint. Any delta is a defect — recover from the live DOM and re-dispatch the owning agent.
- **4B — local render vs live:** serve-preview shim on `127.0.0.1:8799` + Templates dev server (`dev:linked` for unpublished renderer work), screenshots at 1280 + 375 for home, a nested page, and each content-type page, compared against live.
- **C — post-deploy live gate:** `verify-live.js` (above), run by the cutover agent after every load/cutover deploy.

## Gap policy (block / best-fit / partial)

- **`block`** — the Gate 1 default: assembly HALTS (exit 2) on any unresolved gap. The parity-run setting.
- **`best-fit`** — writes the blueprint with gaps recorded but exits 0 (partial-land); allowed ONLY with an explicit, per-gap user waiver. Never report best-fit coverage as faithful render. At assemble, `partial` is a friendly ALIAS for best-fit.
- `load.js` takes its own `--gap-policy block|partial` for seeding what's resolvable.

## Key heuristics (hard-won, verified live)

- **Static-crawl blind spots:** the crawl captures initial HTML, not the runtime DOM — it misses CSS-`background-image` media (hero videos, bio photos), lazy galleries, and JS-wired `href`s (press/gift-card/reserve/nav links). `--deep` recovers most; the 4A sweep is the backstop.
- **Platform-aware deep extraction:** detect the source platform and prefer its structured API over card scraping — WooCommerce `/wp-json/wc/store/v1/products`, Shopify `/products.json` (+ `capture.commerce` facets: variant sizes, option groups), Squarespace `?format=json`. Model `description` + `options` + `gallery` from day one; HTML-entity-decode names before matching.
- **Slug depth ≤ 2:** Templates routes only `[slug]` and `[slug]/[itemId]` — a 3+ segment source path preserved as a slug hard-404s even though it seeds fine. Flatten to a routable leaf and rewrite every nav/footer href.
- **WordPress `-WxH` thumbnail normalization:** `src/capture/imageUrl.js` strips trailing `-WxH` from `/wp-content/uploads/` image URLs (sized thumbnails 404; originals always exist).
- **Probe-guessed routes lie on WordPress:** guessed paths (`/menu`, `/about`, …) resolve to the theme's 404 template with a 200 — `deadPageFilter.js` drops them (probe-discovered pages ONLY; linked/sitemapped pages are never touched).

## capabilities/CAPABILITIES.md — useful to ANY Vivreal agent

Generated (`npm run gen-capabilities`) machine-readable manifest of every renderer format, layout, and component (dispatchId, kind, required backing fields, tags) plus integration providers — the authoritative answer to "can the renderer do X?". It reads the sibling renderer's **built dist**: a stale manifest surfaces FALSE gaps, so rebuild the renderer and regenerate before a run.

Also worth knowing: `docs/first-pass-fidelity.md` (live-fix ledger + migrator TODOs from real cutovers), `docs/standards/bakery-site-standard.md` (per-vertical quality bar layered ON TOP of parity), and `docs/standards/leads-migrator-outreach-integration.md` (the Leads → Migrator → Outreach demo-site tie-in). Env you'll hit: `VR_REPOS_ROOT`/`VR_RENDERER_REPO`/`VR_PORTAL_REPO`/`VR_SCHEMAS_REPO` (sibling-repo resolution), `CTX_SECRET`, `PORTAL_PREVIEW_URL`, `PORTAL_TOKEN_COOKIE`, `STUDIO_ADMIN_EMAIL`; runtime/cutover: `VR_GROUP_ID`, `VR_DB_KEY`, `VR_COGNITO_ID_TOKEN`, `VIVREAL_PREVIEW_UNOPTIMIZED`, `SITE_ID`, `API_KEY`, `NEXT_PUBLIC_CLIENT_API`, `NEXT_PUBLIC_SECURE_URL`, `NEXT_PUBLIC_CMS_URL`, `SITE_CACHE_TTL_SECONDS`.
