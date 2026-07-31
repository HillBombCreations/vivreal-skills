---
name: vivreal-content-knowledge
description: Use when planning, writing, or producing Vivreal organic/social content, or working in the vivreal-content repo — the content studio (planning + creation in one repo, consolidated OUT of Vivreal_Portal_Mobile on 2026-06-25; content tooling no longer lives in the portal). Covers the video production pipeline (footage library → edit brief → draft render, Remotion+Playwright capture, Python EditDNA extractor), the knowledge read-order map 01–08 (voice rules, strategy, content library, posting playbook, calendar, earned-media playbook, platform video playbook, repurpose tracker), and the in-repo agents (content-planner, content-creator, footage-recorder, short-form-editor, linkedin-editor, social-video-director, filming-hygiene). Triggers on: vivreal-content, content studio, content calendar, posting playbook, content plan, earned media, content briefs, EditDNA, footage library, edit brief, social video, TikTok draft, content-planner, content-creator, /record, /social, /tiktok, /instagram, /linkedin. Source of truth: C:\repos\vivreal-content\knowledge\README.md + knowledge\CLAUDE.md + content\README.md (the repo-root CLAUDE.md lags — 2026-06-25 vintage).
---

# vivreal-content — knowledge digest

Last synced: 2026-07-30

The **Vivreal content studio** — planning *and* creation in one repo. Consolidated out of `Vivreal_Portal_Mobile` (plus two sibling repos and a loose `C:\Content` folder) on **2026-06-25** — content tooling no longer lives in the portal. This skill is a **map, not a copy**: operational content work (planning sessions, drafts, renders, calendar updates) happens **in `C:\repos\vivreal-content`**, following its `knowledge/` docs. Repo is private (copyright-firewalled reference clips, Git LFS media). **Caveat: the repo-root `CLAUDE.md` is stale (2026-06-25) — it predates the video pipeline and the new agents; sync from `knowledge/README.md`, `knowledge/CLAUDE.md`, and `content/README.md` instead.**

## Subsystems (decoupled)

1. **Social video production pipeline** (`src/`, TypeScript) — a **footage library → edit brief → draft render** chain: `footage-manifest.ts`, `footage-split.ts`, `stage-footage.ts`, `beat-planner.ts`, `edit-brief.ts`, `render-video.ts`, `render-targets.ts`, `ffmpeg.ts`, `srt.ts`, `audio-plan.ts`, `tts-kokoro.ts` (+ `tts/synthesize.py`). Master format `vertical-9x16` 1080x1920@30fps; captions burned in with a sidecar `captions.srt`; Kokoro TTS (`af_heart`) for narrated cuts. **Music beds are BLOCKED in code (`src/audio-plan.ts`) until the licensed pack is bought.** The older EditDNA → Remotion render path and the Playwright portal-capture tooling (captures PROD at `vivreal.io/app`) feed this chain.
2. **Edit extractor** (`extractor/`, Python, own .venv) — extracts an EditDNA JSON from a reference video. Talks to the pipeline **only** through `*.dna.json` — no shared runtime, zero video frames in output (mathematical descriptors only). `references/INDEX.md` is the **style-DNA catalog** (the editors' shopping list): editors resolve a vibe to the best tag-overlap row with `status: ready` and pass its `.dna.json` as the brief's `dnaRef`; controlled tag vocabulary; `quarantined` rows exist (e.g. gameplay footage).
3. **Planning knowledge** (`knowledge/`) — the strategy/voice/backlog/calendar source of truth. The `.md` files are canonical; the PDFs are human-readable copies.

## knowledge/ read-order map (01–08)

| File | What it is |
|---|---|
| `01-voice-and-rules.md` | **THE canonical voice doc** — load before writing/posting ANYTHING. Zero em/en dashes, owner-visible language only, banned-jargon list, honesty floor (incl. the Email/Mailchimp rule + live-preview wording). The plugin's `vivreal-brand-voice` skill anchors on this file. |
| `02-strategy.md` | Why/what — audience + ICP/personas, the 5 pillars, channels, GEO play (incl. the **stat quarantine**: no 23×, 51% is software buyers not consumers, BrightLocal 45% is the approved substitute), publish order. Ring 3: **Facebook = discovery re-skin of the TikTok/IG cut, not a fourth pillar; YouTube = the compounding search-intent play**, evergreen not cadence. |
| `03-content-library.md` | The backlog — starter headlines + ready-to-write briefs (H1, slug, intent, meta, angle, proof, CTA). Always draft FROM a brief. Group D = 8 industry guides. |
| `04-posting-playbook.md` | How to post — channel-by-channel cadence, create-once dogfood loop, repurposing; now includes a Facebook (Ring 3, Phase 2) section. |
| `05-content-calendar.md` | The living tracker — read it first every session, update it last. Carries the seeded-publish schedule (9 CMS-scheduled posts publishing Jul 30–Aug 19). |
| `06-ring2-earned-playbook.md` | Earned media — listings/reviews (G2/Capterra/Product Hunt), Reddit/communities, guest posts/podcasts. |
| `07-platform-video-playbook.md` | Per-platform video specs, hooks, caption rules, audio/music policy — the editor agents load this every run (LinkedIn first-210-characters, TikTok caption ≤150 chars, hook in 2s). |
| `08-repurpose-tracker.md` | The flywheel hub — one row per topic × one column per derivative surface (guide, stills, TikTok, IG, LinkedIn, X, email, community). |

(The old `07-niche-targeting.md` never shipped — vertical targeting lives in the 8 `draft-for-your-business.md`-indexed industry guides: restaurants, cafes, salons-and-spas, home-services, auto-shops, photographers, fitness-studios, boutiques.)

## In-repo agents (`.claude/agents/`) + slash commands

- **`content-planner`** — `--mode=plan` builds the weekly calendar (~17 dated entries across IG/LinkedIn/X/TikTok); `--mode=expand` turns one calendar row into four platform-specific drafts.
- **`content-creator`** — coordinator for rendered assets: parses briefs, classifies shots, dispatches 4 specialists (`portal-footage`, `typography-slide`, `ui-mockup-slide`, `overlay-shot`) in parallel, writes `MANIFEST.md`. Dispatch only works as the MAIN thread (subagents can't spawn subagents).
- **`footage-recorder`** (`/record`) — plans/records/splits portal footage into the shared footage library; writes `footage-manifest.json`.
- **`short-form-editor`** (`/tiktok`, `/instagram`) — TikTok + IG drafts now, FB Reels + YT Shorts Phase 2.
- **`linkedin-editor`** (`/linkedin`) — founder-voice vertical video under 30s or PDF carousel; 210-char hook.
- **`social-video-director`** (`/social`) — batch coordinator: runs footage-recorder blocking, then the two editors in parallel, assembles `REVIEW.md`.
- **`filming-hygiene`** — shared HARD capture rules; URL subset enforced in `src/denylist.ts`.

## content/ output tree

`calendars/`, `drafts/`, `footage/<date>-<topic>/` (`sequence.json`, `page@<hash>.webm`, `markers.json`, `clips/`, `footage-manifest.json`), `social/<date>-<slug>/` (`REVIEW.md` + per-platform `edit-brief.json`, `beat-sheet.md`, `draft.mp4`, `captions.srt`, `post.md`, `render-info.json`), `tutorials/`. **Nothing in `social/` auto-publishes** — every `post.md` carries a "Verify before posting" block and "DRAFT ONLY — human reviews and posts."

## scripts/

`sync-brand-tokens.mjs`, `voice-check.mjs` (mechanical voice pre-pass — word-checks **only the `## Body` block**, cannot check the honesty floor), `render-blog-cover.mjs` (config-driven blog covers, incl. the topic layout), `render-g2-banner.mjs`.

## Status (2026-07-30)

Group B is **done and live**: six comparison posts (Squarespace, Wix, Shopify, Webflow, WordPress, replace-your-marketing-stack) live on vivreal.io/blog with branded covers; 9 more pages seeded to the CMS as scheduled content (publishing Jul 30–Aug 19). First footage session + first TikTok draft shipped.

## Gotchas

- **Honesty floor** — never assert an unverified feature claim or pricing number; the verify-list is in `01-voice-and-rules.md`. The two resolved rulings to know cold: **no publish-to-email claims** (email = the Mailchimp integration) and **no "what you see is what publishes"** live-preview parity claims. Violations hide in the **meta description, closing paragraph, and cover-image copy** — the three places `voice-check.mjs` can't see.
- `auth.storageState.json` / `fixtures.json` (portal-capture auth) are gitignored — never commit; the session must be a standalone demo account.
- Portal seams are build-time only and gated on `PORTAL_REPO` (`sync-brand-tokens`, `verify-pages.ts`) — no runtime portal dependency.
- A licensed music/SFX pack is required before any rendered montage is posted — and `src/audio-plan.ts` enforces it in code.
