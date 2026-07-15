# Authoring model — Studio, composePage parity, going live

How sites are authored and how the Studio preview is kept identical to the live site. (Reference of `vivreal-sites`.)

## Studio is the single management surface

The portal **Studio** (`/sites/studio`) is where a site's pages, sections, bindings, and chrome are edited. It edits the same `sites` document the live site renders from.

- **Content goes live on Save — there is NO Publish button.** The old Publish button + "Not published" chip + `useDeployStatus.ts` were removed; saving in Studio persists the change and it's live. "Redeploy" only exists for code rollouts (renderer/template changes), not content.
- Studio surfaces editors for: section title, per-page CTA ("Bottom banner", `page.cta`), subtitle/hero-subtitle/cta-subheading (textareas), hero trust badges (`labels.trustIndicators`), form badges (`sectionConfig.badges`, min 1 — `narrowFormConfig` drops `[]`), and **filter-bound enums** (object editor resolves enum options matching the products-page filter keys live — fixes the label-vs-value drift; see `references/page-formats.md`).
- The left rail is drag-resizable (300–600px, persisted to `localStorage studio_rail_width`); the portal sidebar is hidden on `/sites/studio`; desktop preview fills containers >1440px at native width.

## composePage parity — preview can't drift from live

The Studio live preview renders through a **real Next.js route** (`src/app/(studio-frame)/sites/studio/preview-shell/page.tsx`) that calls the **same `composePage()` the live site uses** (`Vivreal_Templates/src/app/[slug]/page.tsx`). The old `srcDoc` / hand-rolled-CSS preview hack is retired. Studio `postMessage`s a structured-clone-safe draft (`buildPreviewContext.ts` → `previewMessages.ts`) into the route, which reconstructs the renderer data context and renders the renderer's own `Navbar`/`Footer` around `composePage`'s body.

Deliberate preview **seams** (parity is intentional, these are not bugs):
- Preview strips `next/image`/`next/font` to a plain `<img>` (blurDataURL/LQIP is unimplemented anyway).
- The portal `globals.css` `@source`-scans the renderer dist so renderer-only Tailwind classes generate in the preview (Tailwind v4 `@source` requirement — see `vivreal-renderer-knowledge`).
- The `(studio-frame)/layout.tsx` loads the display font via `next/font` through `--font-outfit` so preview headings match live; preview includes the same page set as live routing.

When touching Studio/preview/Templates parity, read the project artifacts first (the site-studio-next-level + composePage-migration docs in the portal) — the goal is that the same composePage runs in both places.

## Going live = a code rollout (for renderer/template changes)

Content edits are live on Save. But changes to the **renderer** or **template code** roll out through the deploy pipeline:

1. Publish the new `@hillbombcreations/site-renderer` version (its CI publishes on push to its `master`).
2. Bump the renderer dep in `Vivreal_Templates` `package.json` + lockfile.
3. **Merge to Vivreal_Templates `main`**, then **run the promote-stable workflow** (Actions → promote-stable → Run workflow). It fast-forwards `main`→`stable`; every customer site's Amplify app builds the shared `stable` branch, so that push rebuilds them all (including cross-account Waves of Grain).

**Merging Templates `main` alone releases NOTHING** (Phase 2, 2026-07-15 — per-site branches and the old auto-sync workflow are deleted). The rollout gate is the promote-stable run; the live gate for renderer changes is the renderer version pinned in Templates `package.json`+lockfile. (Full pipeline: `vivreal-site-deploy-pipeline`. Per-site Amplify **env vars** are per-app — a release does not touch them.)

## Local visual loop (unpublished renderer edits)

`Vivreal_Templates`: `npm run dev:linked` (builds local renderer + syncs dist; restart needed — Turbopack caches `node_modules`). Once the renderer is published, plain `npm run dev`. The `--install-links` dance for installing a git-dep renderer is in `vivreal-templates-knowledge`.
