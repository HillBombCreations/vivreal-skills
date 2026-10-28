---
name: vivreal-content-knowledge
description: 'Use when planning, writing, or producing Vivreal organic/social content, help-centre pages, guides, tutorials or carousels, or working in vivreal-hq''s content half (merged from vivreal-content on 2026-08-03; C:\repos\vivreal-content is a leftover). Covers where everything lives (brand/voice.md, knowledge/, content/, packages/content-studio), the video pipeline (footage library, Remotion, portal capture, EditDNA, the tutorial harness), the content agents, the channel set, and posting safety rules. Triggers on: vivreal-content, vivreal-hq content, content studio, content-studio, content calendar, posting playbook, content plan, earned media, content briefs, EditDNA, footage library, record footage, tutorial-maker, carousel, guide-writer, help-page-producer, short-form-editor, linkedin-editor, voice-check, filming hygiene, W42 drafts. Source of truth: C:\repos\vivreal-hq\CLAUDE.md, packages/content-studio/CLAUDE.md, knowledge/README.md.'
---

# Vivreal content (vivreal-hq): knowledge digest

Last synced: 2026-10-15

**The content studio is part of `C:\repos\vivreal-hq` now.** Content tooling left
`Vivreal_Portal_Mobile` on 2026-06-25 for a `vivreal-content` repo, and that repo was merged
with the lead generator into `vivreal-hq` on 2026-08-03 (vivreal-hq `CLAUDE.md`, "What This
Is"). A `C:\repos\vivreal-content` checkout may still exist on a machine; it is a leftover and
never the place to work or to read rules from. This skill is a **map, not a copy**: the
operational work happens in `vivreal-hq`, following its own docs. The repo is private
(copyright-firewalled reference clips, real lead data).

## Where things live (vivreal-hq layout)

| Path | What it is |
|---|---|
| `brand/voice.md` | **THE canonical voice doc.** Load it before writing or posting anything. `knowledge/01-voice-and-rules.md` is now a stub that points here. `brand/positioning.md` is the positioning doc. See `vivreal-brand-voice`. |
| `knowledge/02` to `08` | `02-strategy.md` (ICP, pillars, channels, the GEO play), `03-content-library.md` (backlog and ready briefs), `04-posting-playbook.md`, `05-content-calendar.md` (read it first, update it last), `06-ring2-earned-playbook.md`, `07-platform-video-playbook.md` (per-platform specs and hook rules the editors load every run), `08-repurpose-tracker.md`. Plus month briefs and `draft-*.md` pages (industry guides, help drafts, trust pages). `knowledge/README.md` is the index. |
| `content/` | `calendars/`, `drafts/` (per-week, e.g. `2026-W42/REVIEW.md`), `footage/<date>-<topic>/`, `social/<date>-<slug>/`, `tutorials/`, `ring2/`, `banners/`. |
| `packages/content-studio/` | ESM TypeScript (its own `package.json`, `"type": "module"`; leadgen is CommonJS, which is why `packages/` exists). `src/` is the pipeline, `extractor/` the Python EditDNA extractor, `src/tutorial/` the tutorial harness, `scripts/` the renderers and `voice-check.mjs`. Tests: `npm run test:content` (vitest) from the root. |
| `docs/filming-hygiene.md` | The HARD capture rules (account, URLs, what never appears on camera); `footage-recorder` reads it first. It used to be an agent; it is a doc now. |
| `packages/content-studio/capture-assets/` | The capture runtime assets (page registry `pages.json`, `portal-scenes.json`, demo-tenant fixtures, slide templates, brand tokens). They used to sit at `.claude/agents/content-creator/`; `docs/capture-assets.md` records the move. |
| `docs/agent-notes/<agent>.md` | vivreal-hq-specific run notes an agent has accumulated. The plugin agent reads its file first when one exists. |

## The pipeline (packages/content-studio)

1. **Footage library → edit brief → draft render.** `footage-manifest.ts`, `footage-split.ts`, `stage-footage.ts`, `beat-planner.ts`, `edit-brief.ts`, `render-video.ts`, `render-targets.ts`, `ffmpeg.ts`, `srt.ts`, `audio-plan.ts`, `tts-kokoro.ts`. Master `vertical-9x16` 1080x1920@30fps, burned-in captions plus a sidecar `captions.srt`, Kokoro TTS for narrated cuts. **Music beds stay blocked in code (`src/audio-plan.ts`) until a licensed pack is bought** (content-studio `CLAUDE.md:195`).
2. **EditDNA extractor** (`extractor/`, Python): reads a reference video, emits mathematical descriptors only, talks to the pipeline only through `*.dna.json`. `references/INDEX.md` is the style catalog.
3. **Portal capture** (`portal-capture.ts`, Playwright against production `vivreal.io/app`), with the URL denylist in `src/denylist.ts`.
4. **Tutorial harness** (`src/tutorial/`, `/tutorial` or `npm run tutorial -- <script>`): `tutorial-maker` shoots its own footage in one pass at BOTH viewports (1440x810 and 540x960), the highlight ring drawn in-page at capture time, `platform: "tutorial"` because a walkthrough outruns every social duration ceiling (content-studio `CLAUDE.md:116-124`).

## Agents and commands (the vivreal-skills marketplace, not this repo's `.claude/`)

Owner decision 2026-10-06: every agent, command and skill lives in the vivreal-skills marketplace; `vivreal-hq/.claude/` holds only `settings.json` and `hooks/`. Install `vivreal-content@vivreal-skills` and `vivreal-leadgen@vivreal-skills` (and `vivreal-product` for the critics) to use them here.


- **Content (`vivreal-content` plugin):** `content-planner` (weekly calendar and per-platform expansion), `footage-recorder` (`/record`), `short-form-editor`, `linkedin-editor` (`/linkedin`), `carousel-editor` (`/carousel`), `guide-writer` (`/guide`), `tutorial-maker` (`/tutorial`), `help-page-producer` (`/help-page`), `mascot-artist`; plus `qa-walker`, `template-critic` and `social-critic` from the `vivreal-product` plugin.
- **`content-creator` is RETIRED (2026-08-06)**: its four specialists were never registered as agents, so its dispatch could not fire. Slides moved to `carousel-editor`, capture to `footage-recorder`. Its asset directory moved to `packages/content-studio/capture-assets/` (above), the package that reads it.
- **Leadgen (`vivreal-leadgen` plugin; the other half of the repo):** `lead-scout`, `profiler`, `contact-enricher`, `owner-researcher`, `runner`, `coordinator`, `prompt`.

## Channels (re-read before planning a post)

- **X is retired** from the plan (`content-planner.md:74`): `02-strategy.md` does not list it, older calendars' X rows are ignored, and X is also gone from the product (CMS refuses X posts; portal v0.33.0 removed it from the terms and privacy pages).
- **Instagram is approved** (Meta App Review, 2026-09-28), so it is connectable and "coming soon" copy about it is a defect.
- **TikTok is audited and approved** (owner, 2026-10-04, `docs/projects/channel-tutorials/plan.md:17`), so public posting is available; an unaudited app was limited to `SELF_ONLY`.
- LinkedIn and Facebook stay; Facebook is a discovery re-skin of the TikTok/IG cut, not a fourth pillar.

## Safety rules that bite

- **Nothing auto-publishes.** Every `post.md` carries a verify block and DRAFT ONLY. Agents never type social credentials and never post except approved calendar posts after the owner's weekly go (`docs/projects/deferred-2026-10-03.md`, "Standing rules").
- **The demo tenant's channels are Vivreal's REAL accounts.** A test site does not make posting safe.
- **Honesty floor**: never assert an unverified feature claim or price; the verify list is in `brand/voice.md`. Violations hide in the meta description, the closing paragraph and cover-image copy, the three places `voice-check.mjs` cannot see (it word-checks only the `## Body` block).
- Never commit `packages/leadgen/Data/`, `auth.storageState.json` or `fixtures.json`. Reference MP4s are local inputs, never crawled or republished.
- Zero em or en dashes in any copy; scan bytes, because `grep -P` lies on this machine.

## Companions

- `vivreal-brand-voice` for the voice rules themselves.
- `vivreal-social-sync` for how posts get back from the platforms into Vivreal and onto a site.
- `vivreal-portal-knowledge` for the screens the footage shows.
