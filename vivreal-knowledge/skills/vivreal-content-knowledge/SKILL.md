---
name: vivreal-content-knowledge
description: Use when planning, writing, or producing Vivreal organic/social content, or working in the vivreal-content repo — the content studio (planning + creation in one repo, consolidated OUT of Vivreal_Portal_Mobile on 2026-06-25; content tooling no longer lives in the portal). Covers the three subsystems (Remotion+Playwright creation pipeline, Python EditDNA extractor, knowledge/ planning docs), the knowledge read-order map 01–07 (voice rules, strategy, content library, posting playbook, calendar, earned-media playbook, niche verticals), and the in-repo content-planner/content-creator agents. Triggers on: vivreal-content, content studio, content calendar, posting playbook, content plan, earned media, niche verticals, content briefs, EditDNA, content-planner, content-creator. Source of truth: C:\repos\vivreal-content\CLAUDE.md + knowledge\README.md.
---

# vivreal-content — knowledge digest

Last synced: 2026-07-13

The **Vivreal content studio** — planning *and* creation in one repo. Consolidated out of `Vivreal_Portal_Mobile` (plus two sibling repos and a loose `C:\Content` folder) on **2026-06-25** — content tooling no longer lives in the portal. This skill is a **map, not a copy**: operational content work (planning sessions, drafts, renders, calendar updates) happens **in `C:\repos\vivreal-content`**, following its CLAUDE.md and `knowledge/` docs. Repo is private (copyright-firewalled reference clips, Git LFS media).

## Three subsystems (decoupled)

1. **Creation pipeline** (`src/`, TypeScript) — EditDNA → Remotion render pipeline + Playwright portal-capture tooling (captures PROD at `vivreal.io/app`) that produces social assets. `EditDNA` contract lives in `src/types.ts`.
2. **Edit extractor** (`extractor/`, Python, own .venv) — extracts an EditDNA JSON from a reference video. Talks to the pipeline **only** through `*.dna.json` — no shared runtime, zero video frames in output (mathematical descriptors only).
3. **Planning knowledge** (`knowledge/`) — the strategy/voice/backlog/calendar source of truth the `content-planner` agent draws on. The `.md` files are canonical; the PDFs are human-readable copies.

## knowledge/ read-order map (01–07)

| File | What it is |
|---|---|
| `01-voice-and-rules.md` | **THE canonical voice doc** — load before writing/posting ANYTHING. Zero em/en dashes, owner-visible language only, banned-jargon list, honesty floor. The plugin's `vivreal-brand-voice` skill anchors on this file. |
| `02-strategy.md` | Why/what — audience + ICP/personas, the 5 pillars, channels, GEO play, publish order. |
| `03-content-library.md` | The backlog — 34 starter headlines + ready-to-write briefs (H1, slug, intent, meta, angle, proof, CTA). Always draft FROM a brief. |
| `04-posting-playbook.md` | How to post — channel-by-channel cadence, create-once dogfood loop, repurposing. |
| `05-content-calendar.md` | The living tracker — read it first every session, update it last. |
| `06-ring2-earned-playbook.md` | Earned media — listings/reviews (G2/Capterra/Product Hunt), Reddit/communities, guest posts/podcasts. |
| `07-niche-targeting.md` | Vertical ICPs — the five verticals to run (breweries, venues, med spas, bakeries, tattoo/barber), per-vertical content plans + call openers. |

## In-repo agents (`.claude/agents/`)

- **`content-planner`** — `--mode=plan` builds the weekly calendar (~17 dated entries across IG/LinkedIn/X/TikTok); `--mode=expand` turns one calendar row into four platform-specific drafts.
- **`content-creator`** — coordinator for rendered assets: parses briefs, classifies shots, dispatches 4 specialists (`portal-footage`, `typography-slide`, `ui-mockup-slide`, `overlay-shot`) in parallel, writes `MANIFEST.md`. Dispatch only works as the MAIN thread (subagents can't spawn subagents).

## Gotchas

- **Honesty floor** — never assert an unverified feature claim or pricing number; the verify-list is in `01-voice-and-rules.md`.
- `auth.storageState.json` / `fixtures.json` (portal-capture auth) are gitignored — never commit; the session must be a standalone demo account.
- Portal seams are build-time only and gated on `PORTAL_REPO` (`sync-brand-tokens`, `verify-pages.ts`) — no runtime portal dependency.
- A licensed music/SFX pack is required before any rendered montage is posted.
