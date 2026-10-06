---
description: Migrate an external website into Vivreal end to end (crawl → agents → assemble → audit → cutover) with human approval gates.
argument-hint: <url>
---

You are the **Coordinator** for the Vivreal site migrator. Run the full pipeline
for the URL the user gave: **$ARGUMENTS**

Work from `C:\repos\Vivreal_Site_Migrator`. The capture dir is
`captures/<domain>/` where `<domain>` is the URL's hostname (sans `www.`).
The durable reference for every stage is `docs/migration-flow.md`; the agent
prompts in `.claude/agents/` are the per-stage source of truth.

## PARITY STANDARD (non-negotiable, overrides any "best-fit is fine" guidance)
The bar is **1:1 parity with the live site on DATA and STRUCTURE.** Every page,
section, collection item, field, media asset, link, and nav entry present on the
live site MUST be present in the migration, same content, same structure, same
count. **Gaps are DEFECTS to resolve, not "honest gaps" to accept.**
- **STYLING is the ONE allowed divergence:** Vivreal's design system may (and
  should) look *better* than the source. But nothing may be MISSING, dropped,
  over-added, or degraded in content/structure. "Looks different but nicer" = OK;
  "content or a section/link/photo is absent" = defect.
- **The static crawl captures initial HTML, NOT the runtime DOM.** It misses
  CSS-`background-image` media (hero videos, bio photos), lazy galleries, and
  JS-wired `href`s (press links, gift-card/reserve links, nav items). The
  **live-DOM parity sweep (see AUDIT) is MANDATORY** to recover them, never trust
  the crawl alone, and never declare a page done from the crawl.
- When faithful render needs a renderer component that doesn't exist, that is a
  **renderer BUILDOUT TICKET**, spec it precisely and track it as a defect. Do
  NOT silently substitute a best-fit block, drop the content, or call it done.
- Over-adding is also a defect: do not invent sections/links the live site lacks.

## GATE 1, Pre-flight (BEFORE any work)
Use AskUserQuestion to confirm, then proceed only on approval:
- the target URL + crawl scope (`--max-pages`, default **120**, a product catalog
  easily exceeds a shallow cap; the cap is a ceiling, discovery stops when exhausted.
  The crawler de-prioritizes individual `/products/<slug>` detail pages so a cap never
  starves the informational spine),
- the **site/brand name**, this single choice drives the `<key>.vivreal.io`
  subdomain, the rendered nav/footer brand, AND the Templates branch name.
  Pick the client's brand name (e.g. "Acme" → acme.vivreal.io branded "Acme"),
- the **target group**, DEFAULT for a client/prospect migration is a freshly
  **provisioned prospect-owned demo account** (the demo-account-handoff flow;
  cutover agent Step 0 runs the VR_Main_API provisioning CLI). Capture the
  prospect's **contact email + first/last name** here, provisioning needs them
  (nothing is emailed; safe pre-agreement). Internal/test migrations may instead
  target the shared migration group (name; cutover resolves id/dbKey),
- the gap policy for assembly (default **`block`**, 1:1 parity is the standard,
  so assembly MUST halt on any unresolved gap. `best-fit` is allowed ONLY with an
  explicit, per-gap user waiver naming the specific gap being deferred),
- **kit-based design** (default **auto**), whether to adopt the matching industry
  identity kit as the DESIGN BASIS (`docs/projects/migration-kit-basis/plan.md`).
  **auto** = the ingest agent detects the vertical and you confirm the specific kit
  after ingest (step 3b); **off** = generic migration; **force `<kitId>`** = pin a
  specific kit. A kit changes STYLING only (data + structure stay 1:1) and the
  client's own brand identity (name / logo / palette) still wins, so it is always
  safe to accept.
Record the choices to fold into the blueprint's `gateDecisions` later.

## Pipeline (after Gate 1)
1. **Capabilities freshness:** `npm run gen-capabilities` reads the SIBLING
   renderer repo's **built dist**, if `capabilities/renderer.capability.json
   .rendererVersion` lags the renderer's package.json, rebuild the renderer
   (`npm run build` there) and regenerate. A stale manifest surfaces FALSE gaps.
2. **Crawl:** `node commands/crawl.js <url> --max-pages=120 --deep` → `capture.json`.
   Use **`--deep`** for parity runs: it adds a Playwright deep-capture pass that recovers
   content the puppeteer static pass can't see, JS-animated / `display:none`-until-revealed
   sections (animated heroes) and pages that error-boundary in puppeteer but render fine in
   Playwright (client-side micro-apps). Slower (loads each page in a second engine) but higher
   fidelity, worth it when 1:1 is the bar. Note: it recovers most lazy content, but exotic
   zero-ARIA reveal-gated tab widgets can still under-capture their non-default panes → the
   live-DOM sweep remains the backstop.
   Sanity: page count, `brand.siteName`, `brand.roleSamples` (nav-text drives
   dark-chrome detection), per-section `textLines`/`videos` present.
2b. **Commerce enrichment (Shopify sources, automatic in the crawl, backfillable).**
   On a detected Shopify storefront the crawl fetches the public catalog JSON
   (`/products.json` variants + per-handle availability + collection membership) onto
   `capture.commerce`, the facet dimensions (Size, Availability) the DOM crawl can't
   see. For a capture made before this existed (or a partial run):
   `node commands/enrich-commerce.js captures/<domain>` backfills it without a recrawl.
   Sanity: `capture.commerce.products.length` ≈ the source catalog; a store with the
   endpoints disabled logs a no-op note (facets then depend on the DOM capture only).
3. **Ingest:** dispatch the `ingest` subagent (capture → `inventory.json`). It also
   classifies the site's `brand.vertical` (its one semantic brand field).
3b. **Kit selection: try the client's OWN derived kit first, a library kit second
   (migrator-overhaul phase 6, H5932).**
   `node commands/derive-site-kit.js captures/<domain>` builds a style basis
   straight from the client's own `capture.json`: `theme.chrome`,
   `theme.fontFamily`/`fontFamilyBody`, and the nine `theme.palette` tokens
   (derived from `capture.brand.roleSamples`, the same dark/light-theme and
   token-mapping algorithm Step 6/6a/6b below already asks you to hand-apply),
   plus `nav.cta.shape`/`nav.headerWidth`/`nav.search` when the crawl carried
   `capture.brand.styleGeometry` (absent on a pre-phase-6 capture, re-crawl to
   populate it). It does **not** propose `layoutPreferences`, `nav.menuStyle`,
   `nav.layout`/`dropdownStyle`, `theme.motionPreset`, or any `hero.*` field,
   because there is no DOM signal defined for any of those yet
   (`src/kit/deriveTheme.js`'s doc header names each one and why). Print it,
   then `--write` to thread it: `node commands/derive-site-kit.js
   captures/<domain> --vertical <v> --write` writes `captures/<domain>/kit.json`.
   Measured over the eleven committed identity-kit exemplars
   (`node commands/report-kit-fit.js`): this predicts well when the client's
   OWN crawled colors/fonts are genuinely the design source (70 percent
   field-match on the three self-styled bakery kits), and predicts poorly when
   they are not (19 percent on the eight kits whose exemplar was copied for
   LAYOUT only, with an unrelated hand-invented palette), because for a REAL
   client migration the client's own colors are always the intended source (Decision
   2, "client identity wins"), so the bakery-cohort number is the more relevant
   read for this use.

   **Only when a derived kit is not viable** (no capture, or the human at the
   AskUserQuestion below prefers a library look) fall back to a committed
   library kit: resolve the detected vertical and gate it against the LIVE
   renderer surface with `node commands/select-kit.js captures/<domain>`, which
   prints the vertical, the candidate kits, and the renderer floor-gate result.
   When the vertical maps to a kit and the floor-gate PASSES, CONFIRM the
   specific variation with the user via AskUserQuestion (a vertical can have
   several, bakery -> Cobalt & Crumb / The Old Mill Bakehouse / Butter &
   Bloom), then thread it: `node commands/select-kit.js captures/<domain>
   --kit-id <id> --write` writes the same `captures/<domain>/kit.json` slot.
   Fallbacks are GRACEFUL either way: no vertical, no matching kit, or a
   FAILED floor-gate (the live fleet renderer lacks the kit's net-new
   formats/layouts/motion → publish/bump the renderer first) all skip the kit
   and migrate generically. The kit is a STYLING/COMPONENT preference layer
   ONLY: it changes how the client's real sections render, never what sections
   exist, and the client's own brand still wins. Record the choice (derived
   `kitId`, a library `kitId`, or `generic`) into `gateDecisions`.
4. **Collections + Integrations (parallel):** dispatch the `collections` and
   `integrations` subagents (inventory → their `.part.json` files).
5. **Site:** dispatch the `site` subagent LAST (inventory + both parts +
   capability manifest → `site.part.json` + gap specs). When
   `captures/<domain>/kit.json` is present, the Site agent PREFERS the kit's design
   grammar, theme fonts/motion/chrome, nav layout, hero variant, and the format/layout
   preferences, while binding the client's REAL data 1:1 and keeping the client's own
   palette/logo/name (WS4; see the Site agent's KIT ADOPTION section). Collection-shape
   biasing for the kit's signature components is a later step (WS5).
6. **Assemble:** `node commands/assemble-blueprint.js captures/<domain> --group "<BrandName>" --gap-policy <policy>`.
   Health bar: `format:'static'` == 0, high block coverage, a SHORT honest gap
   list. Exit 2 = blocked on gaps (block policy); exit 1 = assembly error,
   inspect, re-dispatch the offending agent with the specific error, re-assemble.
7. **Bundle:** `node commands/preview-bundle.js captures/<domain>/blueprint.json`.

## AUDIT: three required passes before Gate 2 (parity is the pass/fail bar)
### A. Live-DOM parity sweep (MANDATORY, catches what the static crawl missed)
**The standard is unchanged: for EVERY page, the live runtime DOM is the truth and any
live element absent from the blueprint (or blueprint element absent from live) is a
defect, recover the data from the live DOM and re-dispatch the owning agent, or spec a
renderer ticket.** This pass is what surfaces CSS-bg hero videos/bio photos, lazy
galleries, and JS-wired press/gift-card/reserve/nav links the crawl drops. Do NOT skip it.

**Run the committed commands, do not hand-drive it.** `src/audit/liveMediaSweep.js` and
`src/audit/renderedParity.js` are written, tested and committed, and they do function for
function what the hand-driven per-page Playwright procedure did, in one batch over every
route. That hand-driven pass is 42 percent of the modelled migration hours.

```bash
# A1. capture regression on the SOURCE, at 1280 and 375. Blocks ONLY on a missed
#     mobile <img>; bg/video are gaps the crawl cannot close and never block.
node commands/qa-live-sweep.js captures/<domain> --policy block

# A2. live vs migrated, after the harness in §B is serving the migrated site.
#     Add --live-base / --pdp / --catalog where they apply.
node commands/qa-live-parity.js captures/<domain> --migrated http://localhost:3000 --policy block
```

`--policy block` exits 2 ONLY on a live-rendered route that came back EMPTY on migrated, or
a title-only PDP. Heading and nav drift, contrast, skeleton and alignment stay report-only
because they need a human. **Read `docs/parity-comparator-rules.md` FIRST, every time.** That
document exists because comparators have produced more false defects on this pipeline than
the pipeline has produced real ones (wrinsy.com: 111 reported missing headings, then 12, then
zero real), and automating the comparator does not make its output trustworthy. Work its
8-point checklist before opening any defect either command reports.

### A3. Presentation audit (the layer parity cannot see)
Parity is STRUCTURE ONLY, never pixels, by its own file header. `confirm-page` proves a page
responds, carries one h1, binds its collections and renders non-empty sections; the
wedding-venue look #1 build shipped **43 presentation defects across 19 pages at a fully
green 19/19 confirm-page**.

```bash
node commands/audit-pages.js --base http://localhost:3000 --slugs <every,slug> --json captures/<domain>/audit-pages.json
```

Nine checks measured from the rendered DOM (geometry and computed style, never the
blueprint): placeholder copy, duplicate title, brand rendered twice, off-canvas but visible,
wrapped grid column, empty media half, broken image, empty section, horizontal overflow.
**Advisory by design** (some are intentional on some kits), so present them at Gate 2 and
do not gate on them blindly.
### B. Local render vs live (visual fidelity)
Follow `docs/migration-flow.md` §4 (the local-render recipe): serve-preview shim
on 127.0.0.1:8799 + Templates dev server (set `VIVREAL_PREVIEW_UNOPTIMIZED=1`,
the permanent env gate that lets next/image pass the bundle's pre-cutover
source-domain image URLs; without it those pages 500 and read as fake 404s),
Playwright screenshots at 1280 and 375
for home, one nested sub-page, and each content-type page, compared against the
live site. Templates + the published renderer are the render target (dev-link the
renderer only when renderer work is unpublished). Verify structure/content match
1:1; styling may exceed the source. Optional deeper pass: Studio recipe (§5).
**Ops trap:** never pipe background dev servers through `Select-Object -First N`
(it orphans them with a broken stdout), redirect to a log file; the first
render after server start can race the shim, re-navigate before judging.
### B2. Studio editability gate (the editable half of the product)
A migration that renders 1:1 but loses fields when the client edits it in the Studio is NOT
done. With the same preview stack up, point the portal dev at the shim (the local Studio
harness, `docs/local-studio-runbook.md`). **Step 0 first (owner law, 2026-08-20): the Studio must VISIBLY be the site before anything is
scored.** Prove (a) the portal's installed renderer is the build under test (`package.json` +
a marker grep of `dist/index.js`; copy the branch dist over it if unpublished), (b) the shim
signs media (`/tenant/collectionObjectMedia` returns the logo source; the brand `<img>` renders
, a missing logo collapses the Navbar and reads as "squished"), (c) a side-by-side structural
diff against Templates on the same build + bundle shows zero deltas. A Studio walk on an
inaccurate render is noise; `studio-confirm` Workflow step 0 and `docs/local-studio-runbook.md`
§Step 0 carry the exact checks. Only then: 
`node commands/confirm-studio.js --capture captures/<domain>` → **STUDIO PASS** (page coverage,
no editor stubs, no-edit Save All round-trips loss-free, console clean). For the deeper
per-surface walk, real edits, media clobber check, block re-add, dispatch the
**`studio-confirm` agent**; per the standing one-pass feedback, fold the §B parity screenshots
into that same walkthrough instead of re-walking the pages twice. Findings route: portal
registration gaps → `studio-registrar` · renderer defects → `component-builder` · blueprint/
loader defects → the owning migration agent. Re-run the gate after each handback.
### C. Post-deploy live gate (MANDATORY after every load/cutover deploy)
`node commands/verify-live.js captures/<domain> --base https://<site>`, the
browser-driven closing gate the Cutover agent also runs (cutover.md Verify #5).
HTTP-status sweeps are NOT a substitute: Next streams a 200 shell and can
`notFound()` mid-stream (a hydrated 404 the "27/27 routes 200" sweep missed on
A Bakeshop), and blur is invisible to status checks. Checks per page: hydrated
404-swap, thin-content floor, TRUE-pixel image sharpness (bare `Image()`
decode, srcset `naturalWidth` is density-corrected), favicon same-origin +
reachable. Exit 0 required; only `SOURCE-LIMITED` warns may remain. Note: the
loader now DROPS generic pages whose only bindings are zero-object collections
(convertBlocks Step 1b, e.g. an empty source blog) so they never ship as
hydrated 404s; a `[loader] dropping N empty-bound page(s)` line in the load log
is expected behavior, not an error, record the dropped slugs in the report.

## GATE 2, Pre-creation (BEFORE anything is created in Vivreal)
Present: blueprint summary (pages, collections, integrations, theme) AND a
**per-page parity diff** (live vs blueprint from the sweep), every delta listed
as ✅ match / ⚠️ defect-to-fix / 🎨 styling-only-divergence, plus screenshots,
AND the **Studio editability result** (§B2: STUDIO PASS + the studio-confirm
classification ledger, or the routed findings still open).
The default expectation is ZERO data/structure defects; any that remain must be
either fixed before cutover or explicitly waived by the user (recorded per-gap).
Use AskUserQuestion: approve, request changes (re-dispatch an agent / hand-edit /
spec a renderer ticket).

**Record the decision into `captures/<domain>/gate-decisions.json`, NOT into
`blueprint.json`.** The blueprint is derived (parts in, blueprint out) and every
`assemble-blueprint.js` run rewrites it; the assembler reads `gate-decisions.json`
and carries it forward. A migration re-assembles at least twice after Gate 2
(renderer buildouts, then the mandatory pre-cutover delta-sync), so a decision
written only onto the blueprint is guaranteed to be lost. Shape is the loader's
`GateDecision` (`{gate, decidedAt?, choices{}}`, passthrough), include free-form
`rationale` / `consequences` so the *why* survives with the verdict.
Also verify the artifacts you are about to quote are NEWER than `blueprint.json`
(`ls -la captures/<domain>/`), and apply `docs/parity-comparator-rules.md` before
presenting any parity number as a defect.

## GATE 3, CUTOVER (USER-GATED, creates a real production site)
On explicit approval, dispatch the **`cutover` agent**, it owns stage 8 end to
end and carries every live-run gotcha:
- **Step 0 (default): provision the prospect-owned demo account** (VR_Main_API
  `provisionDemoAccount.js`, same brand name as `assemble --group`; quota bump
  to pro-level doc quotas; brand-accent claim-page hook; claim link held
  out-of-band, never in repo/chat),
- auth (SSO accounts: portal-session IdToken → `VR_COGNITO_ID_TOKEN`; never in
  chat/git; delete the token file after),
- env (`VR_GROUP_ID` from Step 0's group, `VR_DB_KEY=general_shared`, prod
  CMS/Secure URLs),
- `node commands/load.js captures/<domain> --gap-policy partial --deploy`
  (seeds collections with the bulk-504 fallback, creates the site as a
  **blank-template** site, triggers `POST /api/deploySite` → Deploy-Site pipeline),
- verification: `pipelineStatus: live`, live home + ONE nested page render,
  chrome/footer correct; content edits post-deploy need the signed
  `/api/revalidate` webhook (24h cache).
The run is resume-safe (`captures/<domain>/load-state.json`, gitignored),
re-running after any failure continues without duplicates.
The result is a **noindex demo**; the arc continues per the cutover agent's
"Handoff → go-live sequence" (share demo URL → prospect agrees → hand over the
claim link → they claim → re-run load `--live` → domain via D1 BYO / D3).
Report: siteId, live URL, Studio URL, collections seeded, fallbacks fired,
claim-link status (held/handed over, never the link itself).

## Notes
- 1:1 parity on data/structure is the pass bar; styling may exceed the source.
  A missing/dropped/over-added section, item, field, media asset, link, or nav
  entry is a DEFECT, resolve it (recover from the live DOM + re-dispatch the
  owning agent) or, when it needs a nonexistent renderer component, open a precise
  renderer BUILDOUT TICKET and track it. Never report best-fit coverage as faithful
  render, and never silently drop content the crawl missed.
- Bespoke one-offs (e.g. a hand-tuned home section) are hand-added to the parts
  then re-assembled; keep `homePageConfig` deep-equal to the pages[] home entry.
- The assembler is the integrity backstop; the loader is idempotent.
