---
name: vivreal-writing-plans
description: 'Use when you have an approved Vivreal spec or requirements for a multi-step task, before touching code. Vivreal-owned fork of the writing-plans discipline; saves the plan to docs/projects/<slug>/plan.md, hands execution to the coder / the /implement command, and AUTO-DISPATCHES the reviewer on the finished plan. Triggers on: write the plan, implementation plan, plan this feature, break down the work, plan the migration.'
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

## Cross-repo plans: shared values and package consumers (REQUIRED)

A plan that touches more than one repo carries both of these, so no builder waits on another:

- **Shared values table (owner 2026-11-10).** Every word, constant, field shape and API contract
  two repos share, with its FINAL value, in one table each repo's builder pins. Parity tests
  compare against the planned value and tolerate a sibling only at its exact old value (skip by
  name, fail on anything else). Sequence one repo after another only on a real runtime
  dependency (a published package, a deployed API), never because a test reads the other
  checkout: the open-backlog plan held EventHandler behind the portal for words already approved.
- **Package consumer list (owner 2026-11-11).** A plan that publishes a shared
  `@hillbombcreations/*` package lists EVERY consumer from a fleet pin sweep made while writing
  the plan, with the version each moves to and the PR that moves it. Naming only Templates and
  the portal for the renderer left Secure and Client API on 1.97.0 until the walk readiness check.

## Task right-sizing & bite-sized steps

A task is the smallest unit that carries its own verification cycle and is worth a
fresh reviewer's gate. Each step is one action (2-5 minutes): write the failing
test / run it to confirm it fails / minimal implementation / run to confirm pass /
commit. For markdown/config deliverables, replace the test cycle with a concrete
verification (grep/load/chain check) and a commit.

## Plan document header

Every plan MUST start with this header:

````markdown
# [Feature Name] Implementation Plan

> **For agentic workers:** Execute task-by-task with the
> `vivreal-workflow:vivreal-subagent-driven` skill (invoke with that full
> plugin-qualified name, recommended: fresh `coder` per task + `reviewer` gate
> between tasks), or the `coder` agent via `/implement` / `/coordinator`. Steps
> use checkbox (`- [ ]`) syntax.

**Goal:** [one sentence]
**Architecture:** [2-3 sentences]
**Tech Stack:** [key technologies]

## Global Constraints
[project-wide requirements copied verbatim from the spec, one line each]

---
````

## Task structure, no-placeholders, self-review

- Each task: **Files** (exact create/modify/test paths), **Interfaces**
  (Consumes/Produces with exact signatures), then numbered checkbox steps with
  complete content, real code/content in every step, exact commands, expected
  output.
- No placeholders: never "TBD", "add error handling", "similar to Task N", or
  steps that say what without showing how.
- Self-review after writing: spec coverage (every requirement maps to a task)
  placeholder scan, type/name consistency across tasks. Fix inline.

## Auto-review (terminal: REQUIRED)

After saving the plan and running the inline self-review, dispatch the reviewer
agent in **artifact mode** on the plan:

```
subagent_type: reviewer
prompt: Review the plan at docs/projects/<slug>/plan.md in ARTIFACT mode against
  docs/projects/<slug>/spec.md (and research.md if present). Check: completeness
  vs the spec/research, scope correctness (no creep, nothing missing), risk and
  blast-radius coverage, convention fit, missing edge cases / failure modes, and
  testability of the plan. Verdict PASS or FAIL with section citations. Write to
  docs/projects/<slug>/plan-review-N.md.
```

- Surface the verdict to the user.
- If FAIL: fix the flagged items in the plan and re-review. Cap at 3 passes; if
  still failing, escalate to the user to adjudicate or send back to brainstorming.
- The plan is "done" only when the reviewer returns PASS or the user explicitly
  accepts remaining notes. **This auto-review IS the plan review.**

## Execution handoff

After the plan PASSes review, offer:
1. **Subagent-driven (recommended)**, invoke the
   `vivreal-workflow:vivreal-subagent-driven` skill (full plugin-qualified name, the bare name does not resolve) to execute the plan in this session: a fresh
   `coder` per task, a `reviewer` gate (spec + quality) after each, and a final
   whole-branch `reviewer` pass.
2. **Coordinator-driven**, `/implement` (solo coder) or `/coordinator` (full
   gated bug/feature workflow).
3. **Inline**, implement tasks in this session with checkpoints.
