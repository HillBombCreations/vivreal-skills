# Workflow Self-Sufficiency, Auto-Review & Mongo Validation — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax. Each task ends with a concrete verification (these deliverables are markdown skill/agent/command files, so the "test" is a grep/load/chain check, not a unit test).

**Goal:** Make `vivreal-workflow` self-sufficient (own forks of brainstorming + writing-plans), wire auto-review into the coder/planner paths, validate the `vivreal-db` Mongo skill against live Mongo, and confirm the tooling is ready for the deferred cross-repo audit.

**Architecture:** Add two auto-discovered skills under `vivreal-workflow/skills/`, give the `reviewer` agent an artifact-review mode, make the `coder` agent + `/implement` auto-dispatch the reviewer, add a `/plan` command that runs research → plan → auto-review, and refresh the `vivreal-db` skill + `/db-query` schema doc against live Mongo via the `mcp__mongodb__*` tools.

**Tech Stack:** Markdown skills/agents/commands (Claude Code plugin format), `mcp__mongodb__*` MCP tools (read-only), git.

## Global Constraints

- New skills live in `vivreal-workflow/skills/<name>/SKILL.md` — auto-discovered, no `plugin.json` edit needed.
- Artifact paths follow the existing convention: `docs/projects/<slug>/` (spec.md, plan.md, design.md, research.md, review-N.md). NOT `docs/superpowers/`.
- The forks must contain **no** `superpowers:` references.
- Keep `superpowers:systematic-debugging` and `superpowers:test-driven-development` references in `shared-standards` intact — only brainstorming + writing-plans are forked.
- Mongo work is **read-only** (`find`/`aggregate`/`count`/`list-*`/`collection-schema`), scoped + limited, secrets redacted, per the skill's own safety rules.
- Branch: `workflow-self-sufficiency` (already created; spec already committed there).
- Commit per task. Conventional commit messages.

---

### Task 1: Create the `vivreal-brainstorming` skill

**Files:**
- Create: `vivreal-workflow/skills/vivreal-brainstorming/SKILL.md`

**Interfaces:**
- Produces: a skill named `vivreal-brainstorming` whose terminal state invokes `vivreal-writing-plans` (Task 2).

- [ ] **Step 1: Write the skill file** with this exact content:

```markdown
---
name: vivreal-brainstorming
description: Use before any creative or design work in the Vivreal workflow — a new feature, component, refactor, migration, or behavior change — to turn an idea into an approved design before any code is written. Vivreal-owned fork of the brainstorming discipline; saves specs to docs/projects/<slug>/spec.md and hands off to vivreal-writing-plans. Triggers on: design X, build X, add a feature, how should we, plan the migration, brainstorm, new component.
---

# Vivreal Brainstorming — Ideas Into Approved Designs

Vivreal-owned brainstorming discipline. Turns an idea into a validated design
spec through collaborative dialogue, then hands off to `vivreal-writing-plans`.
No dependency on the upstream superpowers skills.

<HARD-GATE>
Do NOT write code, scaffold a project, or invoke any implementation skill/agent
until you have presented a design AND the user has approved it. This applies to
every task regardless of perceived simplicity. The design can be short for
simple work — but you MUST present it and get approval.
</HARD-GATE>

## Checklist (create one task per item, complete in order)

1. Explore project context — files, the relevant repo `CLAUDE.md`, recent commits, the `shared-standards` trigger map.
2. Ask clarifying questions — one at a time; purpose, constraints, success criteria. Multiple-choice preferred.
3. Propose 2-3 approaches — tradeoffs + your recommendation first.
4. Present the design in sections scaled to complexity; get approval after each section.
5. Write the spec to `docs/projects/<slug>/spec.md` and commit it.
6. Spec self-review — placeholder scan, internal consistency, scope, ambiguity. Fix inline.
7. User reviews the written spec.
8. Hand off — invoke the `vivreal-writing-plans` skill to create the implementation plan.

## Process

- Check the current project state first (files, CLAUDE.md, recent commits).
- Assess scope before refining details: if the request spans multiple independent
  subsystems, flag it and decompose into sub-projects first. Each sub-project gets
  its own spec → plan → implement cycle. Brainstorm the first one through the
  normal flow.
- Ask questions one at a time. Prefer multiple-choice. Focus on purpose,
  constraints, success criteria.
- Propose 2-3 approaches with tradeoffs; lead with your recommendation and why.
- Present the design once you understand what you are building. Cover architecture,
  components, data flow, error handling, testing. Ask after each section whether it
  looks right.
- Design for isolation: break the system into small units with one clear
  responsibility and well-defined interfaces. A unit you can hold in context at
  once is one you edit reliably.
- In existing Vivreal repos, explore the current structure and follow established
  patterns (three-tier API rule, proxy factory, multi-tenancy). Consult
  `shared-standards` when the work touches a trigger area. Don't propose unrelated
  refactoring.

## Key principles

- One question at a time. Multiple-choice preferred. YAGNI ruthlessly.
- Always explore 2-3 alternatives before settling.
- Incremental validation — present, get approval, move on. Be flexible; go back
  when something doesn't fit.

## After the design

- Write the validated spec to `docs/projects/<slug>/spec.md`. Commit it to git.
- Spec self-review (inline): scan for placeholders/TBDs, check internal
  consistency, confirm scope is focused enough for one plan, resolve ambiguity.
  Fix inline; no re-review needed.
- Ask the user to review the written spec:
  > "Spec written and committed to `<path>`. Please review it and tell me if you
  > want changes before we write the implementation plan."
  Wait for approval. If changes are requested, make them and re-run the self-review.
- Terminal state: invoke the `vivreal-writing-plans` skill. Do NOT invoke any
  other skill — `vivreal-writing-plans` is the only next step.
```

- [ ] **Step 2: Verify it loads and is clean**

Run: `grep -rn "superpowers" vivreal-workflow/skills/vivreal-brainstorming/SKILL.md`
Expected: no output (exit 1 — no matches).

Run: `grep -n "name: vivreal-brainstorming" vivreal-workflow/skills/vivreal-brainstorming/SKILL.md`
Expected: matches line 2.

- [ ] **Step 3: Commit**

```bash
git add vivreal-workflow/skills/vivreal-brainstorming/SKILL.md
git commit -m "feat(workflow): add vivreal-brainstorming skill (fork, no superpowers dep)"
```

---

### Task 2: Create the `vivreal-writing-plans` skill (with auto-review terminal step)

**Files:**
- Create: `vivreal-workflow/skills/vivreal-writing-plans/SKILL.md`

**Interfaces:**
- Consumes: spec at `docs/projects/<slug>/spec.md` (Task 1 output).
- Produces: plan at `docs/projects/<slug>/plan.md`; dispatches `reviewer` in artifact mode (Task 4 capability).

- [ ] **Step 1: Write the skill file** with this exact content:

```markdown
---
name: vivreal-writing-plans
description: Use when you have an approved Vivreal spec or requirements for a multi-step task, before touching code. Vivreal-owned fork of the writing-plans discipline; saves the plan to docs/projects/<slug>/plan.md, hands execution to the coder / the /implement command, and AUTO-DISPATCHES the reviewer on the finished plan. Triggers on: write the plan, implementation plan, plan this feature, break down the work, plan the migration.
---

# Vivreal Writing Plans

Vivreal-owned planning discipline. Produces a bite-sized implementation plan and
then AUTO-REVIEWS it with the reviewer agent. No dependency on superpowers.

**Announce at start:** "Using vivreal-writing-plans to create the implementation plan."

**Save plans to:** `docs/projects/<slug>/plan.md` (feature/audit/refactor) or
`docs/projects/<slug>/design.md` (architecture-only). NOT `docs/superpowers/`.

## Scope check

If the spec spans multiple independent subsystems, split into one plan per
subsystem. Each plan must produce working, testable software on its own.

## File structure

Before defining tasks, map which files are created/modified and what each is
responsible for. Design units with clear boundaries; prefer small focused files;
in existing repos follow established patterns.

## Task right-sizing & bite-sized steps

A task is the smallest unit that carries its own verification cycle and is worth a
fresh reviewer's gate. Each step is one action (2-5 minutes): write the failing
test / run it to confirm it fails / minimal implementation / run to confirm pass /
commit. For markdown/config deliverables, replace the test cycle with a concrete
verification (grep/load/chain check) and a commit.

## Plan document header

Every plan MUST start with:

​```markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Implement task-by-task with the Vivreal `coder` agent
> (via `/implement` or `/coordinator`). Steps use checkbox (`- [ ]`) syntax.

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]

## Global Constraints
[project-wide requirements copied verbatim from the spec — one line each]

---
​```

## Task structure, no-placeholders, self-review

- Each task: **Files** (exact create/modify/test paths), **Interfaces**
  (Consumes/Produces with exact signatures), then numbered checkbox steps with
  complete content — real code/content in every step, exact commands, expected
  output.
- No placeholders: never "TBD", "add error handling", "similar to Task N", or
  steps that say what without showing how.
- Self-review after writing: spec coverage (every requirement maps to a task),
  placeholder scan, type/name consistency across tasks. Fix inline.

## Auto-review (terminal — REQUIRED)

After saving the plan and running the inline self-review, dispatch the reviewer
agent in **artifact mode** on the plan:

​```
subagent_type: reviewer
prompt: Review the plan at docs/projects/<slug>/plan.md in ARTIFACT mode against
  docs/projects/<slug>/spec.md (and research.md if present). Check: completeness
  vs the spec/research, scope correctness (no creep, nothing missing), risk and
  blast-radius coverage, convention fit, missing edge cases / failure modes, and
  testability of the plan. Verdict PASS or FAIL with section citations. Write to
  docs/projects/<slug>/plan-review-N.md.
​```

- Surface the verdict to the user.
- If FAIL: fix the flagged items in the plan and re-review. Cap at 3 passes; if
  still failing, escalate to the user to adjudicate or send back to brainstorming.
- The plan is "done" only when the reviewer returns PASS or the user explicitly
  accepts remaining notes. **This auto-review IS the plan review.**

## Execution handoff

After the plan PASSes review, offer:
1. **Coder-driven (recommended)** — dispatch the `coder` agent per task via
   `/implement` (solo) or `/coordinator` (full gated workflow).
2. **Inline** — implement tasks in this session with checkpoints.
```

> Note to implementer: in the file above, the three `​```` fences shown with a
> zero-width marker are nested code blocks — write them as normal triple-backtick
> fences. The outer block delimiter for this task is the surrounding fence.

- [ ] **Step 2: Verify clean + auto-review wired**

Run: `grep -rn "superpowers" vivreal-workflow/skills/vivreal-writing-plans/SKILL.md`
Expected: no output.

Run: `grep -n "subagent_type: reviewer" vivreal-workflow/skills/vivreal-writing-plans/SKILL.md`
Expected: one match (the auto-review dispatch).

- [ ] **Step 3: Commit**

```bash
git add vivreal-workflow/skills/vivreal-writing-plans/SKILL.md
git commit -m "feat(workflow): add vivreal-writing-plans skill with auto-review terminal step"
```

---

### Task 3: Verify no superpowers brainstorm/plan references + wire architect to the fork

**Files:**
- Modify: `vivreal-workflow/agents/architect.md` (add a pointer to `vivreal-writing-plans`)
- Verify-only: whole repo

**Interfaces:**
- Consumes: skills from Tasks 1-2.

- [ ] **Step 1: Confirm there is nothing to remove**

Run: `grep -rn "superpowers:brainstorming\|superpowers:writing-plans" --include=*.md .`
Expected: matches ONLY in `docs/projects/workflow-self-sufficiency/spec.md` (prose). No agent/skill/command references. (Confirms the removal step is already satisfied.)

- [ ] **Step 2: Wire the architect to the fork.** In `vivreal-workflow/agents/architect.md`, in its standards/skill section, add a line instructing it to use `vivreal-writing-plans` when producing a multi-step plan (read the file first; insert near where it describes writing plan.md/design.md). Exact insertion:

```markdown
- When producing a multi-step implementation plan, use the `vivreal-writing-plans` skill (the Vivreal fork — not the upstream superpowers version). It saves to `docs/projects/<slug>/plan.md` and auto-dispatches the reviewer on the finished plan.
```

- [ ] **Step 3: Verify**

Run: `grep -n "vivreal-writing-plans" vivreal-workflow/agents/architect.md`
Expected: one match.

- [ ] **Step 4: Commit**

```bash
git add vivreal-workflow/agents/architect.md
git commit -m "chore(workflow): point architect at vivreal-writing-plans fork; confirm no superpowers plan refs"
```

---

### Task 4: Give the reviewer an artifact-review mode

**Files:**
- Modify: `vivreal-workflow/agents/reviewer.md` (add an "Artifact mode" section + mode auto-detection; update Output Format)

**Interfaces:**
- Produces: reviewer accepts a `.md` artifact target and runs a plan/research rubric, writing `plan-review-N.md` / `<artifact>-review-N.md`.

- [ ] **Step 1: Add mode detection** near the top of `reviewer.md` (after the `## Identity` section). Insert:

```markdown
## Review mode (auto-detect)

- **Diff mode (default):** target is a git diff, branch, PR, or slug with code changes → run the 12-point checklist below.
- **Artifact mode:** target is a plan/spec/research markdown file (`docs/projects/<slug>/plan.md`, `design.md`, `research.md`) with no diff to review → run the Artifact rubric below instead of the 12-point checklist.

Pick the mode from what you are pointed at. If both a diff and an artifact are in scope, run diff mode and reference the artifact as the spec.
```

- [ ] **Step 2: Add the Artifact rubric** immediately after the mode-detection section:

```markdown
## Artifact rubric (plan / design / research review)

Walk every item. Mark PASS / FAIL / N-A with a one-sentence justification and a
section citation. Overall PASS only if every item is PASS.

1. **Completeness vs source** — every requirement in the spec/research maps to a task or section in the plan. Cite any gap.
2. **Scope correctness** — no scope creep (tasks the spec didn't ask for) and nothing missing. Cross-reference the spec's success criteria.
3. **Risk & blast radius** — high-risk changes (auth, billing, multi-tenant routing, public read path, deploy pipeline, shared schemas) are called out with mitigations.
4. **Convention fit** — the plan respects the three-tier API rule, proxy factory, multi-tenancy scoping, hydration/SSR rules where relevant (consult shared-standards if a trigger area is touched).
5. **Edge cases / failure modes** — the plan addresses empty/null inputs, concurrency, partial failure, and rollback where applicable.
6. **Testability** — each task ends with a concrete, checkable verification; no "looks done" steps.
7. **No placeholders** — no TBD/TODO, no "similar to Task N", no steps that say what without how.

Final verdict line: "Verdict: PASS" or "Verdict: FAIL — N items to fix."
```

- [ ] **Step 3: Update Output Format** — append to the existing `## Output Format` block:

```markdown
- In artifact mode, write to `docs/projects/<slug>/plan-review-N.md` (or `<artifact>-review-N.md`) and run the Artifact rubric instead of the 12-point checklist.
```

- [ ] **Step 4: Verify**

Run: `grep -n "Artifact rubric\|Review mode (auto-detect)" vivreal-workflow/agents/reviewer.md`
Expected: both headings present.

- [ ] **Step 5: Commit**

```bash
git add vivreal-workflow/agents/reviewer.md
git commit -m "feat(workflow): add artifact-review mode to reviewer (plan/design/research rubric)"
```

---

### Task 5: Make the coder auto-dispatch the reviewer (auto-review IS the review)

**Files:**
- Modify: `vivreal-workflow/agents/coder.md` (remove "DON'T review your own code"; add auto-review protocol)
- Modify: `vivreal-workflow/commands/implement.md` (post-dispatch auto-runs reviewer instead of suggesting it)

**Interfaces:**
- Consumes: reviewer artifact/diff modes (Task 4).

- [ ] **Step 1: Edit `coder.md`.** Replace the line:

```
- DON'T review your own code — that's the reviewer's job.
```

with:

```
- DON'T silently fix-and-hide reviewer findings — report the verdict honestly, including FAILs.
```

- [ ] **Step 2: Edit `coder.md`** — update the Boundaries line. Replace:

```
- I defer to: architect (design changes), tester (writes tests), reviewer (code review).
```

with:

```
- I defer to: architect (design changes), tester (writes tests). I auto-dispatch the reviewer on my own diff before reporting done (see Auto-review).
```

- [ ] **Step 3: Edit `coder.md`** — add a new section after `## Implementation Protocol`:

```markdown
## Auto-review (before reporting done)

After lint + type-check pass, dispatch the reviewer on my own diff and report its
verdict inline. On solo runs (via `/implement`), this review IS the review — there
is no separate gated phase.

​```
subagent_type: reviewer
prompt: Review my diff (git diff against the base) in diff mode. Cite file:line
  for every FAIL. Verdict PASS or FAIL.
​```

- If the reviewer returns FAIL, fix the flagged items and re-dispatch. Cap at 3
  passes; if still failing, stop and escalate to the user with the unresolved list.
- Do not claim "done" until the reviewer returns PASS or the user accepts the
  remaining notes.
- Inside `/coordinator`'s full gated workflow, the coordinator still runs the
  heavyweight multi-pass review separately — this auto-review is the solo-path gate.
```

> Implementer note: the inner `​```` fences are nested triple-backtick blocks — write as normal backticks.

- [ ] **Step 4: Edit `implement.md`** — replace the entire `## Post-Dispatch` section:

```markdown
## Post-Dispatch

1. Show the user files modified and lint/type-check results.
2. Auto-dispatch the reviewer on the diff (this is the review for solo runs):

​```
subagent_type: reviewer
prompt: Review the diff just produced for "$ARGUMENTS" in diff mode. Cite
  file:line for every FAIL. Verdict PASS or FAIL.
​```

3. Show the reviewer verdict. If FAIL, dispatch the coder to fix the flagged
   items, then re-review (cap 3 passes). If still failing, escalate to the user.
4. Only report the task complete once the reviewer verdict is PASS (or the user
   accepts remaining notes).
```

- [ ] **Step 5: Verify**

Run: `grep -n "DON'T review your own code" vivreal-workflow/agents/coder.md`
Expected: no output.

Run: `grep -n "Auto-review (before reporting done)" vivreal-workflow/agents/coder.md`
Expected: one match.

Run: `grep -n "Auto-dispatch the reviewer\|subagent_type: reviewer" vivreal-workflow/commands/implement.md`
Expected: at least one match.

- [ ] **Step 6: Commit**

```bash
git add vivreal-workflow/agents/coder.md vivreal-workflow/commands/implement.md
git commit -m "feat(workflow): coder + /implement auto-dispatch reviewer (auto-review is the review on solo runs)"
```

---

### Task 6: Add the `/plan` command (research → plan → auto-review)

**Files:**
- Create: `vivreal-workflow/commands/plan.md`

**Interfaces:**
- Consumes: `researcher` agent, `vivreal-writing-plans` skill (Task 2), `reviewer` artifact mode (Task 4).

- [ ] **Step 1: Write the command file** (modeled on `commands/research.md`):

```markdown
---
description: Plan a multi-step Vivreal task end to end — research, then write the implementation plan, then auto-review the plan. Produces docs/projects/<slug>/{research,plan}.md plus a review verdict.
argument-hint: <"add webhook retry logic" | "migrate X to Y" | description of the work>
---

You are running the Vivreal planning chain. The user invoked `/plan` with: **$ARGUMENTS**

## Phase 0 — Setup

1. Generate a slug from the first ~6 meaningful words of $ARGUMENTS.
2. `mkdir -p docs/projects/<slug>/`
3. Write `docs/projects/<slug>/brief.md` with the verbatim task and today's date.
4. Tell the user: "Slug: `<slug>`. Researching, then planning, then auto-reviewing."

## Phase 1 — Research

Dispatch the researcher:

​```
subagent_type: researcher
prompt: Research the task at docs/projects/<slug>/brief.md. Slug is <slug>. Read
  the shared-standards skill first. Trace the relevant code paths and cite
  file:line for every claim. Write findings to docs/projects/<slug>/research.md.
  Do not propose a full plan — surface constraints, reuse, and risks.
​```

## Phase 2 — Plan

Invoke the `vivreal-writing-plans` skill to turn research.md into
`docs/projects/<slug>/plan.md`. The skill's terminal step auto-dispatches the
reviewer in artifact mode — let it run.

## Phase 3 — Report

1. Verify `docs/projects/<slug>/research.md` and `plan.md` exist and a
   `plan-review-*.md` verdict was written.
2. Show the user: a 2-3 sentence research summary, the plan path, and the reviewer
   verdict.
3. Suggest: "Run `/implement` per task, or `/coordinator` for the full gated
   workflow."
```

> Implementer note: inner `​```` fences are nested triple-backtick blocks.

- [ ] **Step 2: Verify**

Run: `grep -n "vivreal-writing-plans" vivreal-workflow/commands/plan.md`
Expected: one match.

Run: `grep -n "subagent_type: researcher" vivreal-workflow/commands/plan.md`
Expected: one match.

- [ ] **Step 3: Commit**

```bash
git add vivreal-workflow/commands/plan.md
git commit -m "feat(workflow): add /plan command (research -> plan -> auto-review chain)"
```

---

### Task 7: Validate the `vivreal-db` skill against live Mongo + tighten activation

**Files:**
- Modify: `vivreal-knowledge/skills/vivreal-db/SKILL.md` (reconcile drift; strengthen `description` triggers)
- Modify: `vivreal-db-explorer/commands/db-query.md` (reconcile schema doc drift)
- Modify: `vivreal-workflow/skills/shared-standards/SKILL.md` (add vivreal-db to the lazy-reading trigger map)

**Interfaces:**
- Consumes: `mcp__mongodb__list-databases`, `mcp__mongodb__list-collections`, `mcp__mongodb__collection-schema`, `mcp__mongodb__find` (read-only).

- [ ] **Step 1: Connect and confirm databases.**

Run (via MCP): `mcp__mongodb__list-databases`
Expected: includes `Vivreal`, `general_shared`, `pro_plus`. Record any additional DBs. If connection fails, STOP and tell the user the Mongo MCP isn't connected (they may need to run the connect step / provide a connection string) — do not fabricate schema confirmation.

- [ ] **Step 2: Confirm collection inventory** for each of the three DBs.

Run (via MCP): `mcp__mongodb__list-collections` for `Vivreal`, then `general_shared`, then `pro_plus`.
Expected: `Vivreal` has at least `groups`, `checkoutsessions`, `leads`. Tenant DBs have at least `collection_groups`, `collection_objects`, `integration_objects`, `sites`, `mediafiles`, `auditlogs`, `contentversions`, `webhooks`, `usagetrackings`. Note any collection present in Mongo but absent from the docs (drift) and vice versa.

- [ ] **Step 3: Spot-check the high-traffic schemas** that the docs make hard claims about.

Run (via MCP): `mcp__mongodb__collection-schema` for `general_shared.collection_objects` and `Vivreal.groups`.
Then `mcp__mongodb__find` one sample doc each (limit 1, redact secrets) to confirm field types:
- `collection_objects.collectionObj.refID` is a **string** (not ObjectId).
- `collection_objects.groupID` is a **string**.
- `collection_objects.publishDate` is a **Date** (or null), not a bare string.
- `groups.tier` ∈ {free, basic, pro, proplus}; `groups.key` present.
Record any mismatch against the documented schemas.

- [ ] **Step 4: Reconcile drift.** Apply targeted edits to `vivreal-db/SKILL.md` and `db-query.md` for every confirmed discrepancy from Steps 2-3 (added/renamed collections, changed field types, new/removed indexes). If everything matches, add a one-line provenance note to `vivreal-db/SKILL.md` under the title: `> Schema verified against live Mongo on 2026-06-19.` Do NOT invent changes — only edit what the live data contradicts.

- [ ] **Step 5: Tighten activation.** In `vivreal-db/SKILL.md`, extend the `description:` frontmatter so it explicitly fires on MCP usage. Ensure the description contains: `Triggers on: mcp__mongodb, query mongo via MCP, find/aggregate/count, list collections, collection schema, dbKey, groupID, publishDate.` (merge with existing trigger list, don't duplicate phrases).

- [ ] **Step 6: Cross-link from shared-standards.** In `vivreal-workflow/skills/shared-standards/SKILL.md`, in the lazy-reading trigger map (around the MongoDB row), add: `When about to use the mcp__mongodb__* tools, read the vivreal-db skill first.`

- [ ] **Step 7: Verify**

Run: `grep -n "mcp__mongodb" vivreal-knowledge/skills/vivreal-db/SKILL.md`
Expected: at least one match (in the description).

Run: `grep -n "vivreal-db" vivreal-workflow/skills/shared-standards/SKILL.md`
Expected: at least one match.

- [ ] **Step 8: Commit**

```bash
git add vivreal-knowledge/skills/vivreal-db/SKILL.md vivreal-db-explorer/commands/db-query.md vivreal-workflow/skills/shared-standards/SKILL.md
git commit -m "fix(knowledge): verify vivreal-db schema against live Mongo; tighten MCP activation triggers"
```

---

### Task 8: Confirm tooling is ready for the deferred audit

**Files:**
- Create: `docs/projects/workflow-self-sufficiency/audit-readiness.md`

**Interfaces:**
- Consumes: everything from Tasks 1-7.

- [ ] **Step 1: Smoke-test the chain** on a tiny throwaway task to prove the wiring works end to end. Run `/plan "trivial readiness check: confirm the /plan chain runs"` and confirm: research.md, plan.md, and a `plan-review-*.md` verdict are all produced, and the reviewer ran in artifact mode. Delete the throwaway `docs/projects/<throwaway-slug>/` afterward.

- [ ] **Step 2: Write the audit kickoff doc** `docs/projects/workflow-self-sufficiency/audit-readiness.md` capturing: the exact command to launch the deferred audit (`/orchestrate "audit recent cross-repo changes" --workflow=audit`), the repo/area scope (schemas/shared, client API, portal, outreach, secure, CMS, main), and a note that it should run through the new `/plan` + auto-review machinery. (This is the handoff to sub-project 4, which is a separate cycle.)

- [ ] **Step 3: Verify + commit**

Run: `git status --short`
Expected: only `audit-readiness.md` staged (throwaway removed).

```bash
git add docs/projects/workflow-self-sufficiency/audit-readiness.md
git commit -m "docs: audit-readiness handoff for deferred cross-repo audit (sub-project 4)"
```

---

## Self-Review (plan vs spec)

**Spec coverage:**
- Sub-project 1 (fork skills) → Tasks 1, 2, 3. ✅
- Sub-project 2 (auto-review is the review) → reviewer artifact mode (Task 4), coder + /implement auto-review (Task 5), /plan chain (Task 6). ✅
- Sub-project 3 (validate Mongo skill) → Task 7. ✅
- Sub-project 4 (deferred audit) → Task 8 (readiness only; actual audit is a separate cycle, per spec "out of scope"). ✅
- Success criteria 1 (no superpowers refs) → Tasks 1/2/3 verifications. Criteria 2 (coder auto-review) → Task 5. Criteria 3 (/plan chain) → Task 6. Criteria 4 (artifact mode) → Task 4. Criteria 5 (Mongo verified + activation) → Task 7. Criteria 6 (audit-ready) → Task 8. ✅

**Placeholder scan:** No TBD/TODO in steps; nested-fence implementer notes call out the one formatting subtlety. ✅

**Name consistency:** Skill names `vivreal-brainstorming` / `vivreal-writing-plans`, artifact-mode output `plan-review-N.md`, and `subagent_type: reviewer` are used identically across Tasks 2, 4, 5, 6. ✅
