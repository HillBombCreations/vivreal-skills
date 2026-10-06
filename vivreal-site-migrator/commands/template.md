---
description: Turn an example website into a reusable Vivreal template (identity kit) end to end, scout → design gate → build (Round A/B) → validate (confirm + harden + exemplar-diff), with human approval gates.
argument-hint: <exemplar-url>
---

You are the **Coordinator** for building a Vivreal **template**, a reusable renderer identity
kit derived from an example site, worn by a distinct fictional brand. Build the template from the
exemplar the user gave: **$ARGUMENTS**

Work from `C:\repos\Vivreal_Site_Migrator`. The durable reference for the whole track is
`docs/template-flow.md`; the per-stage agent prompts in `.claude/agents/` are the source of truth
(`kit-designer`, `component-builder`, `page-confirm`, and, for a new vertical,
`ingest`/`collections`/`integrations`/`site`). The validation method is
`docs/projects/industry-example-site-templates/PAGE-1TO1-PLAYBOOK.md`; the kit rules are
`template-identity-kits.md` (quota) + `bakery-netnew-kit.md` (net-new rule).

**A template build is NOT a `/migrate` run.** Migration reaches 1:1 DATA parity with a live
client site. A template reaches 1:1 DESIGN + LAYOUT parity with an exemplar, wearing PLACEHOLDER
content and a distinct fictional brand. The two share only the deterministic back half
(`assemble-blueprint → preview-bundle → serve-preview`).

## KIT STANDARD (non-negotiable, the pass/fail bar for this track)
- **1:1 with the exemplar on DESIGN + LAYOUT.** Match its visual grammar, section anatomy,
  chrome, and motion, page by page. Content is deliberately PLACEHOLDER (this is not data
  parity); the *look and structure* are the bar.
- **A full IDENTITY KIT, meeting the quota** (`template-identity-kits.md`): **Nav** 1 ·
  **Header-hero** variant 1 · **Landing structured components** ≥3 · **Motion preset** 1 ·
  **Page type** (new `format`) ≥1. Knobs are welcome but do NOT count toward quota.
- **The NET-NEW rule** (`bakery-netnew-kit.md`): the kit ships genuinely new grammar. Prior
  templates' components are building blocks only, a template that just re-tones existing
  vehicles has FAILED. Net-new components are built by `component-builder` (TEMPLATE mode).
- **Fleet-safe / default-absent, always.** Every renderer change is exact-literal and
  default-absent, byte-identical for every other site in the fleet. Universal component names
  (no vertical words), colors via `theme` tokens, motion via the preset. `sectionConfig` is
  permissive (`z.record`) so most knobs need no schema change; a strict/enum field must be
  widened at EVERY surface that pins it, GREP each surface, never assume a fixed trio (the
  blueprint schema lives in `packages/site-loader/src/blueprint/schema.js`; the per-surface-type
  map, hero variant vs nav layout vs footer variant vs format, is `PAGE-1TO1-PLAYBOOK.md §3`)
  or assemble fails.
- **Distinct fictional brand + full placeholderization.** ZERO exemplar / source / other-template
  identity in the rendered demo (the zero-trace gate enforces it), a distinct brand + persona,
  blessed by the human.
- **Demo-quality:** 0 dead external links; nothing renders "can't reach."

## GATE 1, DESIGN (before any build)
Dispatch the **`kit-designer` agent** on the exemplar. It live-scouts the site, extracts the
brand ground truth + signature devices (Existing knob vs NET-NEW build), maps them onto the
quota, proposes a distinct brand/persona + the content-model MODE, and writes the design brief
(`docs/projects/industry-example-site-templates/HANDOFF-<vertical-N>.md`) + a GATE-1 question set.

Put its proposal to the user with `AskUserQuestion`; proceed only on approval of:
- **Content-model MODE**, **SIBLING** (reskin a copy of an existing capture that shares the
  content model, which capture?) or **NEW-VERTICAL** (crawl a representative content source + run
  the migration agents once, which URL, `--max-pages`?).
- **Brand + persona**, the distinct fictional identity (+ any invented persona), from the
  kit-designer's proposal or the user's own.
- **Kit slotting**, bless/adjust the nav, header-hero, and the ≥3 net-new landing components.
- **Page type(s)** and **motion preset**, the new `format`(s) and the named preset.
Record the decisions into the brief STATUS ("DESIGN GATE ANSWERED").

## Pipeline (after Gate 1)
**Capture setup, branch on MODE:**
- *SIBLING:* copy the base capture dir → `captures/<new-kit>/`; **delete the stale copied
  `blueprint.json`** (it carries old traces until re-assembled).
- *NEW-VERTICAL:* `node commands/crawl.js <content-source> --max-pages=<N> --deep` → dispatch the
  `ingest` subagent (capture → `inventory.json`), then `collections` + `integrations` (parallel),
  then `site` LAST, exactly as `/migrate`. The parts now exist to author on top of.

**Capabilities freshness:** `npm run gen-capabilities` reads the sibling renderer's built dist,
regenerate after any net-new renderer component lands (a stale manifest surfaces false gaps).

**Build the net-new components (the kit):** for each net-new device the gate blessed, dispatch
the **`component-builder` agent in TEMPLATE mode**, one at a time (shared preview stack), each
exact-literal + default-absent, renderer suite green after. These land in the sibling repos
(`vivreal-site-renderer` + the migrator `composition`/`schema` + `Vivreal_Templates`
`COMPOSE_FORMATS`), never authored here.

**Register the kit surface in the Studio (registration debt = ZERO per kit):** once the kit's
net-new components/knobs/chrome/formats exist, dispatch the **`studio-registrar` agent**, it
wires the portal side (palette + real editor + chrome controls + type mirrors + BOTH save
whitelists + live-preview threading + page-type presets) so nothing ships as
renderable-but-uneditable. Do this BEFORE validation, not as a parked Gate-3 batch.

**Round A, kit authoring** (persona maps + theme onto both theme objects + chrome + the home
composed 1:1 vs the exemplar home; keep `homePageConfig` deep-equal to `pages[]` home):
```
node commands/assemble-blueprint.js captures/<kit> --group "<Vertical>" --gap-policy block   # gotcha L: exits nonzero on gaps but WRITES blueprint, run bundle SEPARATELY, never &&-chained
node commands/preview-bundle.js captures/<kit>/blueprint.json --out captures/<kit>/preview
node commands/serve-preview.js captures/<kit>/preview 8799                                    # bg (restart after every re-bundle)
cd C:/repos/Vivreal_Templates && NEXT_PUBLIC_CLIENT_API=http://127.0.0.1:8799 SITE_ID=preview API_KEY=dev npm run dev:linked   # bg; browse localhost:3000 (never 127.0.0.1)
```
Shoot/probe the Round-A render (zero-trace, single-H1, computed-color/type asserts).

**Round B, the page walk:** live-extract each page's exemplar analog, author it 1:1 (section
order, hover, animation, fine detail), shoot/probe. Hand any section whose data+structure are
right but whose COMPONENT doesn't match the exemplar to `component-builder`.

## GATE 2, Round-A / kit REV
Present the built kit (scrolled-viewport screenshots / a Gate-2 artifact) vs the exemplar. Use
`AskUserQuestion`: approve the kit, or order fixes (re-dispatch `component-builder` / adjust
authoring). Record the verdict into the brief STATUS.

## VALIDATION (the confirm toolchain + the fidelity agents, 1:1 fidelity gate)
1. **Placeholderize** to the distinct brand (if not already done in the Round-A persona maps):
   `node commands/rebrand-capture.js captures/<kit> --brand "<Brand>"` (reads
   `captures/<kit>/rebrand.json` for the ordered token map + logo typography; idempotent).
2. **Per-capture contracts** beside the blueprint: `captures/<kit>/trace-terms.json` (forbid the
   source + exemplar-as-proper-noun + the OTHER templates' DISTINCTIVE identity + owner personas +
   brand-regression tokens, NOT shared placeholder staff, NOT generic domain words; seed from the
   Round-A `FORBIDDEN` regex, pre-scan the blueprint) + `expected-nav.json` (the exemplar header
   nav mapped to our slugs; omit any with no faithful in-header 1:1). See PAGE-1TO1-PLAYBOOK
   §4b + gotcha N.
3. **`node commands/confirm-site.js --capture captures/<kit>`** → SITE PASS (fix nav/orphan FAILs).
4. **`node commands/confirm-page.js <slug> --capture captures/<kit>`** across every page → each ✅
   CONFIRM PASS; on a FAIL, classify + close cheapest-tier (authoring before renderer; watch
   gotchas J + O for masthead h1s).
5. **Demo-hardening:** `node commands/harden-demo.js captures/<kit>` → 0 dead external links
   (reads `captures/<kit>/harden.json` for the tenant host map, else auto-detects; PDFs →
   data-URI). Re-assemble + re-bundle + restart, then verify by curl+grep per page.
6. **AGENT exemplar-diff (gotcha M):** dispatch the **`page-confirm` agent** to walk each page with
   a live exemplar analog section-by-section, classify MATCH/ADAPTATION/SURPLUS/DEFECT, close cheap
   authoring defects, and hand genuine component mismatches back to `component-builder`.
7. **STUDIO EDITABILITY gate:** bring up the local Studio harness (`npm run studio` + portal dev
   pointed at the shim, `docs/local-studio-runbook.md`). **Step 0 first (owner law, 2026-08-20): the Studio must VISIBLY be the site before anything is
   scored.** Prove (a) the portal's installed renderer is the build under test (`package.json` +
   a marker grep of `dist/index.js`; copy the branch dist over it if unpublished), (b) the shim
   signs media (`/tenant/collectionObjectMedia` returns the logo source; the brand `<img>` renders
  , a missing logo collapses the Navbar and reads as "squished"), (c) a side-by-side structural
   diff against Templates on the same build + bundle shows zero deltas. A Studio walk on an
   inaccurate render is noise; `studio-confirm` Workflow step 0 and `docs/local-studio-runbook.md`
   §Step 0 carry the exact checks. Only then: run
   `node commands/confirm-studio.js --capture captures/<kit>` → **STUDIO PASS**, then dispatch the
   **`studio-confirm` agent** for the real edit walk, every authored surface classified
   EDITABLE / STUB / UNREGISTERED / DROPPED / CLOBBERED / PREVIEW-BLIND / VIEW-ONLY-ACCEPTED.
   STUB/UNREGISTERED/DROPPED/PREVIEW-BLIND findings go back to `studio-registrar` (or
   `component-builder` for renderer defects); re-run the gate after each handback. A template a
   customer can't edit has NOT met the standard, no matter how it renders.

## GATE 3, SHIP the template (USER-GATED)
Present the DoD: confirm-site SITE PASS · every page ✅ CONFIRM PASS · 0 dead external links ·
agent exemplar-diff done with defects closed + adaptations flagged · **STUDIO PASS + the
studio-confirm classification ledger (no un-waived non-EDITABLE rows)** · **quota met** (the kit
checklist: nav / header-hero / ≥3 landing comps / motion preset / page type) · renderer + migrator
suites green if `src/` touched · nothing committed. On explicit approval, the template is shipped
as a validated kit. **Downstream (optional, separately gated like migrate's cutover):** register
it as a portal template / stand up a demo site, do not do this without an explicit go. When
registration IS greenlit, the **preview tile is part of it, not optional**: shoot the look's
real picker tile with `node commands/shoot-template-tile.js <live-demo-or-preview-url>
--template-id <id>` (inspect the JPEG), `--upload --bucket vivreal-site-templates`, then stamp
`previewImageKey` on the `site_templates` row (the command prints the exact update), see
`docs/template-flow.md` §6b leg (3b). A registered look with no real screenshot falls back to
the portal's CSS vignette, which is a registration gap, not a done state.
**Template sites live on the Vivreal Content group:** any site instantiated from a template for
validation, demo, smoke, or showcase purposes is created on **Vivreal Content**
(`groupName "Vivreal Content"`, key `vivrealcontent`, `_id 6a68169fe1457c2f3fd04530`,
dbKey `general_shared`, demo user `vivreal-content-demo`), NEVER the `vivreal` group (the
2026-07-20 smoke polluted its quota and forced a tier bump) and NEVER a prospect demo account
(those are for client migrations). Instantiate via the portal picker while signed into the
Vivreal Content profile, or pass its group env to the loader.

## Notes
- 1:1 DESIGN/LAYOUT parity with the exemplar is the bar; content is placeholder. A missing/wrong
  device, a re-skin where the exemplar has distinct grammar, or a quota miss is a DEFECT.
- The two generalized helpers (`rebrand-capture.js`, `harden-demo.js`) read per-capture config
  (`rebrand.json` / `harden.json`) beside the contracts; author them once per template.
- Bring up ONE preview stack at a time (kill any :8799/:3000 first); run `component-builder` /
  `page-confirm` one at a time (shared stack). Rebuild the renderer (`npm run dev-sync`) before
  diffing (gotcha D). Every learning that is UNIVERSAL → improve the tools/playbook at the source
  (the standing mandate), and carry it into the end-of-run handoff.
- NOTHING committed until GATE 3 sign-off; leave working trees dirty.
