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

## Runbook commands and STOP conditions (REQUIRED in a release plan)

- **Every command carries every argument its script needs**, checked against the script's own
  argument parser, cited by file and line beside the command. Name every value (an item id, a
  journal, a run folder) or the step that produces it; a builder or release engineer must never
  supply one from memory. A release B walk row left out the item id its script's parser requires.
- **A STOP on "a new alarm" lists the known baseline alarms with their history**, so a quiet-week
  alarm (one that breaches on most quiet days) is classified against its own record instead of
  halting a correct step, and any alarm on a resource the step changes stays a STOP.
- **A merge that deploys a whole-repository package names its size check.** A function that packages
  the repository root (`CodeUri: ../`) can exceed the Lambda unzipped-size cap once coverage output or
  dev dependencies ride along; the step names the workflow's prune and size check, and the last
  deploy's size, or adds them first.

## Plan traps the release B reviews found (walk them before the auto-review)

Each was a NEW CLASS blocker in a release B plan review (vivreal-hq
`docs/projects/next-release-B/review-*.md`). Walk the list over the plan before dispatching the
reviewer. The general forms are the shared-standards anti-pattern catalog's "Plan steps that cannot
run as written" and "Plan rows that drift from settled answers".

**Steps that cannot run as written**
1. **A stop rule pinned to a remembered number.** A STOP said "54 of 60" from memory; the base
   measured 58, so its test failed and the STOP would have halted a correct deploy. Pin every
   threshold to the value measured at the base commit, with the command and its output beside it.
2. **A step the named workflow cannot do.** A plan cut a release "from the commit below" when the
   cut workflow only branches from `main`'s tip and takes no ref input. Read the workflow's inputs and
   its checkout step before writing a step that depends on them.
3. **An expected set the tooling cannot produce.** A preview's expected rows were written for one
   deploy path and applied to a stack whose deploy script also changes a stack tag (a Modify on every
   taggable resource). Write each expected set from a preview, or the script, of the SAME path.
4. **A stop action the repository's own gate refuses.** A STOP's revert would have dropped coverage
   under a floor set with zero headroom, so CI would refuse the deploy in the middle of an incident.
   Run every stop and rollback action through the repository's gates (coverage floors, size checks,
   required checks) on paper or by dry run, and write the companion change it needs into the action.

**Rows that drift from settled answers**
5. **A settled precondition whose design still says the old one.** When a precondition settles (a
   key found, a value decided), change every design line that states it in the same edit. A builder
   pins the design, and a rollback written for the old premise can now be destructive.
6. **One behaviour owned by a later row.** A behaviour built in one row and tested in a later one
   cannot go red at the later row's base. Give each behaviour one row that builds it and carries its
   red-at-base test.
7. **A row that reopens a question already closed.** Cite the closing record on any row that touches
   a settled question. A reopened one can undo a protection (blocking a default host that a
   certificate monitor and a crawler need).
8. **Scope beyond an owner answer.** A row the owner's answer did not name goes to the next release,
   or back to the owner as a question, never into the plan by default.

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
  blast-radius coverage, convention fit, missing edge cases / failure modes,
  testability of the plan, and every item of the vivreal-writing-plans skill's
  "Runbook commands and STOP conditions" and "Plan traps" lists. Verdict PASS or
  FAIL with section citations. Write to
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
