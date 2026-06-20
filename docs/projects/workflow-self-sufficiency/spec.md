# Workflow Self-Sufficiency, Auto-Review & Mongo Validation — Design Spec

**Date:** 2026-06-19
**Status:** Approved (design), pending implementation plan
**Repo:** `vivreal-skills` (the plugin marketplace)

## Goal

Make the `vivreal-workflow` plugin self-sufficient (no dependency on the
upstream `superpowers` brainstorming/writing-plans skills), wire automatic
review into the producing agents so that **auto-review is the review** on
solo/planner/coder paths, and validate the existing MongoDB skill against
live Mongo. Then — as a deferred follow-on — run a full cross-repo audit of
recent changes through the new machinery.

## Background / current state

The repo is a plugin marketplace. The `vivreal-workflow` plugin already has
`researcher`, `architect`, `coder`, `tester`, `reviewer`, `documenter`,
`vuln` agents and the commands `/coordinator`, `/orchestrate`, `/research`,
`/design`, `/implement`, `/investigate`, `/reviewer`, `/bug-review`, `/test`,
`/document`, `/write-tests`, `/vuln-fix`. The single workflow skill is
`shared-standards`.

Key facts that shape this work:

- The `coder` agent today **explicitly refuses to review its own code**
  (`agents/coder.md` — "DON'T review your own code"). Review is a separately
  gated phase in `/coordinator`.
- The `reviewer` agent today only reviews **code diffs** (a 12-point diff
  checklist). It has no notion of reviewing a *plan* or *research* artifact.
- `superpowers:brainstorming` and `superpowers:writing-plans` are referenced
  (in `shared-standards`) but never auto-invoked; they are upstream, in the
  `claude-plugins-official/superpowers` plugin — NOT in this marketplace.
- A MongoDB knowledge skill already exists: `vivreal-knowledge/skills/
  vivreal-db/SKILL.md`, plus the `/db-query` command with full per-collection
  schema docs. The risk is **schema drift** — the docs may no longer match
  live Mongo.

## Decisions (locked)

1. **Fork, don't depend.** Create vivreal-owned copies of brainstorming and
   writing-plans; remove all references to the superpowers versions from our
   agents/skills/commands. "Remove" = remove our *references/dependency*, not
   uninstall the upstream plugin (which we don't own and which provides the
   `using-superpowers` entrypoint).
2. **Auto-review IS the review** on the solo/planner/coder paths. Producing
   agents dispatch the reviewer themselves; on solo runs there is no separate
   gated review phase. The heavyweight multi-pass gated review inside
   `/coordinator` stays as-is for the full bug workflow.
3. **Audit is deferred** until sub-projects 1–3 land, then dogfoods the new
   auto-reviewing planner. Scope = everything (schemas/shared, client API,
   portal, outreach, secure, CMS, main).
4. **Validate, don't duplicate** the Mongo skill — refresh the existing
   `vivreal-db` skill against live Mongo and tighten its activation triggers.
5. New skills live **inside `vivreal-workflow`** (workflow concern, not a new
   plugin).
6. The planner ships as **both** an auto-activating skill and a `/plan`
   command.

## Sub-project 1 — Fork the planning skills

Create two skills in `vivreal-workflow/skills/`:

### `vivreal-brainstorming/SKILL.md`
Forked from superpowers brainstorming. Changes from the upstream:
- Saves the spec to `docs/projects/<slug>/spec.md` (our convention), not
  `docs/superpowers/specs/`.
- References our `researcher` / `architect` agents and the `shared-standards`
  skill where it talks about exploring/designing.
- Terminal state hands off to **`vivreal-writing-plans`** (not
  `superpowers:writing-plans`).
- Keeps the core discipline: hard gate (no implementation before an approved
  design), one-question-at-a-time, 2-3 approaches, design-section approval,
  spec self-review.

### `vivreal-writing-plans/SKILL.md`
Forked from superpowers writing-plans. Changes from the upstream:
- Saves to `docs/projects/<slug>/plan.md` (feature/audit) or `design.md`,
  matching existing artifact conventions.
- Execution handoff points to **our** `coder` / `/implement` (and
  `/coordinator` for the gated path), not `subagent-driven-development` /
  `executing-plans`.
- **Terminal step auto-dispatches the `reviewer` on the written plan**
  (artifact-review mode — see Sub-project 2). Surfaces FAILs; the plan is not
  "done" until they are addressed or explicitly accepted. This satisfies
  task 1 ("planner automatically uses the reviewer to review it").
- Keeps: bite-sized tasks, no-placeholders rule, interfaces blocks,
  self-review checklist.

### Removal / repointing
Grep the whole repo for `superpowers:brainstorming` and
`superpowers:writing-plans` and repoint each reference to the vivreal fork.
Known reference site: `vivreal-workflow/skills/shared-standards/SKILL.md`.
Leave references to other superpowers skills (systematic-debugging, TDD,
etc.) intact — only the two forked skills are superseded.

## Sub-project 2 — Auto-review is the review

### Reviewer artifact mode (`agents/reviewer.md`)
Add a second review mode alongside the existing diff checklist:
- **Artifact review** (plan.md / design.md / research.md): rubric covering
  completeness against the research, scope correctness (no creep, nothing
  missing), risk / blast-radius coverage, convention fit, missing edge cases
  / failure modes, and testability of the plan.
- Mode auto-detected from the target: a `.md` artifact path → artifact mode;
  a diff/branch/PR → existing diff mode.
- PASS/FAIL per rubric item with file:line or section citations, same
  adversarial discipline.

### Coder auto-review (`agents/coder.md`, `commands/implement.md`)
- Remove the "DON'T review your own code" / "reviewer is a separate phase"
  language.
- After lint + type-check pass, the coder **dispatches the reviewer on its
  diff** and reports the verdict inline. On solo `/implement` runs, that
  review IS the review — no separate gated phase.
- The coder still does not *fix-and-hide*: it reports the reviewer verdict
  honestly, including any FAILs, and addresses them in a bounded loop
  (cap the passes; escalate to the user if unresolved).

### Planner convenience command (`commands/plan.md`)
New `/plan <task>` command that runs the full chain end to end:
research (`researcher`) → write plan (`vivreal-writing-plans` via
`architect`) → auto-review (`reviewer` artifact mode) → surface verdict.
Output artifacts in `docs/projects/<slug>/`.

### Coordinator / orchestrate
No behavioral change to their gated review, but update any references so they
invoke the **forked** skills. Confirm `/coordinator`'s heavyweight multi-pass
review path is untouched.

## Sub-project 3 — Validate & tighten the Mongo skill

- **Connect to live Mongo via the `mcp__mongodb__*` tools** and verify the
  databases (`Vivreal`, `general_shared`, `pro_plus`), the collection
  inventory, and the documented key fields/indexes in
  `vivreal-knowledge/skills/vivreal-db/SKILL.md` and
  `vivreal-db-explorer/commands/db-query.md`. Reconcile drift (new/renamed
  collections or fields, changed indexes). Use read-only ops only, scoped and
  limited per the skill's own safety rules; redact secrets.
- **Tighten activation** so the skill reliably fires whenever `mcp__mongodb__*`
  is about to be used — strengthen the `description:` trigger phrases and add a
  cross-link from `shared-standards`' lazy-reading trigger map.
- Output: an updated, reality-checked `vivreal-db` skill + corrected
  `/db-query` schema doc. No duplicate skill.

## Sub-project 4 — Full cross-repo audit (deferred)

After 1–3 are merged, run `/orchestrate --workflow=audit` against the changed
surface (schemas/shared, client API, portal, outreach, secure, CMS, main),
driven through the new auto-reviewing planner so it dogfoods the new machinery.
This sub-project gets its own scope/spec once 1–3 land; it is explicitly out of
scope for the current implementation plan beyond confirming the tooling is ready
for it.

## Out of scope

- Uninstalling or modifying the upstream `superpowers` plugin.
- Changing the `/vuln-fix` workflow.
- Changing the `/coordinator` multi-pass gated review semantics (only its skill
  references are repointed).
- The audit's actual findings/fixes (sub-project 4 is deferred to its own cycle).

## Success criteria

1. `vivreal-brainstorming` and `vivreal-writing-plans` skills exist, are
   self-contained, and contain no `superpowers:` references; no repo file still
   points to `superpowers:brainstorming` / `superpowers:writing-plans`.
2. `/implement` (and the `coder` agent) auto-runs the reviewer at the end and
   reports the verdict.
3. `/plan` runs research → plan → auto-review end to end and produces
   `docs/projects/<slug>/{research,plan}.md` + a review verdict.
4. The `reviewer` agent has a working artifact-review mode distinct from its
   diff mode.
5. The `vivreal-db` skill and `/db-query` schema doc match live Mongo (verified),
   and the skill activates reliably on `mcp__mongodb__*` usage.
6. Tooling is confirmed ready to run the deferred cross-repo audit.
