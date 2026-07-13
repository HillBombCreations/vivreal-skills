---
name: vivreal-migrator-knowledge
description: Use when migrating an external website into the Vivreal CMS, or working in Vivreal_Site_Migrator — the agent-driven pipeline (crawl → ingest → collections/integrations → site → assemble → bundle → audit → Studio → user-gated cutover). Covers the /migrate command's 3 human approval gates, the 1:1 PARITY STANDARD, the two mandatory audit passes (live-DOM parity sweep + local render vs live), the block/best-fit/partial gap policies, static-crawl blind spots + platform-aware deep extraction (WooCommerce/Shopify/Squarespace APIs), the slug-depth ≤2 rule, and the CAPABILITIES.md capability manifest useful to any Vivreal agent. Triggers on: site migration, migrate a site, Site_Migrator, /migrate, migration parity, cutover, crawl, site audit, capability manifest, CAPABILITIES.md. Source of truth: C:\repos\Vivreal_Site_Migrator\README.md + docs/migration-flow.md (the repo has NO CLAUDE.md).
---

# Vivreal_Site_Migrator — knowledge digest

Last synced: 2026-07-13

Agent-driven pipeline that migrates an external website's content into the Vivreal CMS. This repo is the **orchestrator only** — renderer components, collection types, and integration providers are built in their own repos, never here; a layout the renderer can't produce is a renderer **buildout ticket**, not migrator code. There is **no CLAUDE.md** — `README.md` + `docs/` are truth, with `docs/migration-flow.md` as the durable end-to-end guide. Per-stage operational detail lives in the five stage agents: `.claude/agents/{ingest,collections,integrations,site,cutover}.md`.

## Pipeline + the /migrate gates

`crawl` (`commands/crawl.js <url> --max-pages=45 --deep`) → `ingest` agent → `collections` + `integrations` agents (parallel; then the deterministic `build-derived-collections.js` step) → `site` agent (LAST — binds only to keys collections emitted) → `assemble-blueprint.js` → `preview-bundle.js` → **audit** → Studio validation → `load.js` (**user-gated cutover**: seeds collections, creates the site, triggers deploy; resume-safe via `load-state.json`). `captures/<domain>/` is gitignored and fully regenerable.

`/migrate <url>` runs it end to end with **3 human approval gates**: **Gate 1** pre-flight (URL + crawl scope, brand name — drives the `<key>.vivreal.io` subdomain, rendered brand, AND the Templates branch name — target group, gap policy), **Gate 2** pre-creation (blueprint summary + per-page parity diff + screenshots; zero data/structure defects expected), **Gate 3** cutover (dispatches the `cutover` agent against production).

## PARITY STANDARD (the pass/fail bar)

**1:1 parity with the live site on DATA and STRUCTURE** — every page, section, item, field, media asset, link, and nav entry present, nothing invented. **Gaps are DEFECTS to resolve, not residuals to accept.** Styling is the ONE allowed divergence (Vivreal's design system may look *better*). Never declare a page done from the crawl alone.

## Two required audit passes

- **4A — live-DOM parity sweep (MANDATORY, first):** for EVERY page, Playwright-load the LIVE site, scroll top-to-bottom, extract a fingerprint (headings, `<video>` + CSS `background-image` srcs, iframes, image/form counts, nav, every external href), diff against the blueprint. Any delta is a defect — recover from the live DOM and re-dispatch the owning agent.
- **4B — local render vs live:** serve-preview shim on `127.0.0.1:8799` + Templates dev server (`dev:linked` for unpublished renderer work), screenshots at 1280 + 375 for home, a nested page, and each content-type page, compared against live.

## Gap policy (block / best-fit / partial)

- **`block`** — the Gate 1 default: assembly HALTS (exit 2) on any unresolved gap. The parity-run setting.
- **`best-fit`** — substitutes the nearest renderable block; allowed ONLY with an explicit, per-gap user waiver. Never report best-fit coverage as faithful render.
- **`partial`** — the load/cutover stage's policy: seed what's resolvable.

## Key heuristics (hard-won, verified live)

- **Static-crawl blind spots:** the crawl captures initial HTML, not the runtime DOM — it misses CSS-`background-image` media (hero videos, bio photos), lazy galleries, and JS-wired `href`s (press/gift-card/reserve/nav links). `--deep` recovers most; the 4A sweep is the backstop.
- **Platform-aware deep extraction:** detect the source platform and prefer its structured API over card scraping — WooCommerce `/wp-json/wc/store/v1/products`, Shopify `/products.json`, Squarespace `?format=json`. Model `description` + `options` + `gallery` from day one; HTML-entity-decode names before matching.
- **Slug depth ≤ 2:** Templates routes only `[slug]` and `[slug]/[itemId]` — a 3+ segment source path preserved as a slug hard-404s even though it seeds fine. Flatten to a routable leaf and rewrite every nav/footer href.
- **WordPress `-WxH` thumbnail normalization:** `src/capture/imageUrl.js` strips trailing `-WxH` from `/wp-content/uploads/` image URLs (sized thumbnails 404; originals always exist).

## capabilities/CAPABILITIES.md — useful to ANY Vivreal agent

Generated (`npm run gen-capabilities`) machine-readable manifest of every renderer format, layout, and component (dispatchId, kind, required backing fields, tags) plus integration providers — the authoritative answer to "can the renderer do X?". It reads the sibling renderer's **built dist**: a stale manifest surfaces FALSE gaps, so rebuild the renderer and regenerate before a run.

Also worth knowing: `docs/first-pass-fidelity.md` (live-fix ledger + migrator TODOs from real cutovers) and `docs/standards/bakery-site-standard.md` (per-vertical quality bar layered ON TOP of parity — styling may exceed the source).
