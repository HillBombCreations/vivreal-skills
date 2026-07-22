---
name: vivreal-subagent-driven
description: Use when executing an approved Vivreal plan.md/design.md task-by-task in the current session. Vivreal-owned fork of the subagent-driven-development discipline; dispatches a fresh coder agent per task, a reviewer pass (spec + quality) after each, and a final whole-branch reviewer pass at the end. Drives the vivreal-workflow agents (coder, reviewer, tester) as the subagents. Triggers on: execute the plan, run the plan, implement task-by-task, subagent-driven, build out the plan.
---

# Vivreal Subagent-Driven Development

Vivreal-owned execution discipline. Execute an approved plan by dispatching a
fresh `coder` subagent per task, a `reviewer` pass (spec compliance + code
quality) after each task, and one broad whole-branch `reviewer` pass at the end.
Self-contained fork — no dependency on the upstream superpowers skills or their
helper scripts.

**Why subagents:** you delegate each task to a fresh agent with isolated
context. By crafting exactly the instructions and context it needs, you keep it
focused and preserve your own context for coordination. A subagent never
inherits your session history — you construct precisely what it needs.

**Core principle:** fresh `coder` per task + per-task `reviewer` (spec + quality)
+ broad final `reviewer` = high quality, fast iteration.

**Announce at start:** "Using vivreal-subagent-driven to execute the plan."

**Narration:** between tool calls, narrate at most one short line — the ledger
and tool results carry the record.

**Continuous execution:** do NOT pause to check in between tasks. Execute every
task in the plan without stopping. The only reasons to stop are: a BLOCKED
status you cannot resolve, ambiguity that genuinely prevents progress, or all
tasks complete. "Should I continue?" prompts waste the user's time — they asked
you to execute the plan, so execute it.

## When to use

- You have an approved `docs/projects/<slug>/plan.md` (or `design.md`) — usually
  produced by `vivreal-workflow:vivreal-writing-plans`.
- Tasks are mostly independent (tightly-coupled work → implement inline instead).
- You are staying in this session (no parallel-session handoff).

If the plan does not exist yet, go back to `vivreal-workflow:vivreal-writing-plans`
(invoke with the full plugin-qualified name — the bare name does not resolve). If the work
is a production bug with a reproducer and user impact, use `/coordinator`
instead — it adds the research/document phases and a 3-pass review gate.

**Every subagent dispatch must instruct the agent to read the `shared-standards`
skill first**, plus the relevant repo `CLAUDE.md`. This is the Vivreal house rule
that keeps multi-tenancy, proxy-factory, CSRF, and hydration conventions intact.

## The process

```
Read plan once → note Global Constraints → create todos + ledger
  └─ for each task (one at a time, never in parallel):
       1. Extract the task's text to docs/projects/<slug>/task-N-brief.md
       2. Dispatch coder (implementer-prompt.md) with brief + report paths + context
       3. coder asks questions? → answer, re-dispatch
       4. coder implements, tests, commits, self-reviews → reports status
       5. Package the diff → dispatch reviewer (task-reviewer-prompt.md)
       6. reviewer reports spec ✅ + quality Approved?
            no  → dispatch coder in fix mode for Critical/Important → re-package → re-review
            yes → append "Task N: complete" to the ledger, mark todo done
  └─ all tasks done → dispatch reviewer once on the whole branch (final gate)
       └─ findings? → ONE coder fix dispatch with the full list → re-review
  └─ offer wrap-up (commit / PR) — never push to main, never commit without OK
```

## Pre-flight plan review

Before dispatching Task 1, scan the plan once for conflicts:

- tasks that contradict each other or the plan's Global Constraints
- anything the plan mandates that the reviewer rubric treats as a defect (a test
  that asserts nothing, verbatim duplication of a logic block)

Present everything you find as ONE batched question — each finding beside the
plan text that mandates it, asking which governs — before execution begins, not
one interrupt per discovery mid-plan. If the scan is clean, proceed silently.

## Model selection

Use the least powerful model that can handle each role. **Always set the model
explicitly when dispatching** — an omitted model inherits your (often most
expensive) session model and silently defeats this section.

- **Transcription tasks** (the plan task contains the complete code; 1-2 files):
  `model: haiku`.
- **Mechanical/integration tasks** (multi-file coordination, pattern matching,
  prose-spec implementation, most reviews): `model: sonnet`.
- **Architecture/judgment tasks and the final whole-branch review**:
  `model: opus`.

Turn count beats token price: the cheapest model often takes 2-3× the turns on
multi-step work. Use `sonnet` as the floor for reviewers and for any coder
working from a prose description; reserve `haiku` for true transcription and
single-file mechanical fixes.

## Handling coder status

The `coder` subagent reports one of four statuses:

- **DONE:** package the diff (see File handoffs) and dispatch the `reviewer`.
- **DONE_WITH_CONCERNS:** read the concerns first. If they touch correctness or
  scope, resolve before review; if they are observations ("this file is getting
  large"), note them in the ledger and proceed.
- **NEEDS_CONTEXT:** provide the missing context and re-dispatch.
- **BLOCKED:** assess the blocker — (1) context gap → add context, re-dispatch
  same model; (2) needs more reasoning → re-dispatch a more capable model; (3)
  task too large → split it; (4) the plan itself is wrong → escalate to the user.

**Never** ignore an escalation or force the same model to retry unchanged. If the
coder said it is stuck, something must change.

## Handling reviewer ⚠️ items

The `reviewer` may report "⚠️ Cannot verify from diff" items — requirements that
live in unchanged code or span tasks. These do not block the rest of the review,
but you must resolve each one yourself before marking the task complete: you hold
the plan and cross-task context the reviewer lacks. A confirmed gap is a failed
spec review — send it back to the coder and re-review.

## Constructing reviewer prompts

Per-task reviews are task-scoped gates; the broad review happens once, at the
end. When you fill the reviewer template:

- Do not add open-ended directives ("check all uses", "run race tests if
  useful") without a concrete, task-specific reason.
- Do not ask the reviewer to re-run tests the coder already ran on the same code
  — the coder's report carries the test evidence.
- Never pre-judge findings: do not tell a reviewer to ignore an issue or pre-rate
  it ("treat as Minor at most"). If you think a finding would be a false
  positive, let the reviewer raise it and adjudicate in the loop. If the prompt
  you are writing contains "do not flag" or "the plan chose" — stop, you are
  pre-judging.
- The Global Constraints block you hand the reviewer is its attention lens: copy
  the binding requirements verbatim from the plan's Global Constraints (exact
  values, formats, and stated relationships like "same proxy pattern as X"). The
  template already carries the process rules.
- Hand the reviewer its diff as a file (see File handoffs) — never paste it into
  the prompt.
- A dispatch describes one task, not the session's history. Never paste
  accumulated prior-task summaries into later dispatches — a fresh subagent needs
  its task, the interfaces it touches, and the Global Constraints. Nothing else.
- Dispatch fix subagents for Critical and Important findings. Record Minor
  findings in the ledger and point the final review at that list.
- A finding that conflicts with what the plan mandates is the user's decision:
  present the finding and the plan text, ask which governs. Do not dispatch a fix
  that contradicts the plan without asking.
- The final whole-branch review gets a package too (base = the branch's merge
  base; see File handoffs).
- Every fix dispatch carries the coder contract: it re-runs the tests covering
  its change and reports the results. Name the covering test files in the
  dispatch. Confirm the fix report contains the covering tests, the command, and
  the output before re-dispatching the reviewer.
- If the final review returns findings, dispatch ONE coder with the complete
  list — not one fixer per finding.

## File handoffs

Everything you paste into a dispatch — and everything a subagent prints back —
stays resident in your context for the rest of the session and is re-read every
turn. Hand artifacts over as files (no superpowers scripts; plain git):

- **Task brief:** before dispatching a coder, extract task N's full text from the
  plan into `docs/projects/<slug>/task-N-brief.md`. Your dispatch contains: (1)
  one line on where this task fits; (2) the brief path, introduced as "read this
  first — it is your requirements, with the exact values to use verbatim"; (3)
  interfaces/decisions from earlier tasks the brief cannot know; (4) your
  resolution of any ambiguity you noticed; (5) the report-file path and contract.
  Exact values (numbers, magic strings, signatures, test cases) live only in the
  brief.
- **Report file:** name it `docs/projects/<slug>/task-N-report.md`. The coder
  writes its full report there and returns only status, commits, a one-line test
  summary, and concerns.
- **Diff package:** record the BASE commit before dispatching the coder (the
  commit `HEAD` points at then — never `HEAD~1`, which silently drops all but the
  last commit of a multi-commit task). After DONE, write the package to a file
  and pass the path to the reviewer:
  ```bash
  out=docs/projects/<slug>/task-N.diff
  { echo "## commits"; git log --oneline BASE..HEAD; \
    echo; echo "## stat"; git diff --stat BASE..HEAD; \
    echo; echo "## diff"; git diff -U10 BASE..HEAD; } > "$out"
  ```
  The package never enters your context; the reviewer reads it in one Read call.
- **Reviewer inputs:** the reviewer gets three paths — the brief, the report, and
  the diff package — plus the Global Constraints that bind the task.
- **Fix dispatches** append their fix report (with test results) to the same
  report file and return a short summary; re-reviews read the updated file.
- For the **final review**, package `MERGE_BASE..HEAD` where
  `MERGE_BASE=$(git merge-base main HEAD)`.

## Durable progress

Conversation memory does not survive compaction. Track progress in a ledger file,
not only in todos — controllers that lose their place have re-dispatched entire
completed task sequences (the most expensive failure observed).

- Ledger path: `docs/projects/<slug>/sdd-progress.md`. At skill start, read it.
  Tasks marked complete there are DONE — do not re-dispatch; resume at the first
  task not marked complete.
- When a task's review comes back clean, append one line in the same message as
  your other bookkeeping: `Task N: complete (commits <base7>..<head7>, review clean)`.
- The ledger is your recovery map: the commits it names exist in git even when
  your context no longer remembers creating them. After compaction, trust the
  ledger and `git log` over recollection.

## Prompt templates

- [implementer-prompt.md](implementer-prompt.md) — dispatch the `coder` subagent.
- [task-reviewer-prompt.md](task-reviewer-prompt.md) — dispatch the `reviewer`
  subagent (spec compliance + code quality).
- Final whole-branch review: dispatch the `reviewer` in its standard 8-dimension
  mode on the `MERGE_BASE..HEAD` package, on `model: opus`.

## Optional: regression tests

If the plan calls for dedicated e2e/regression coverage beyond what the coder
writes inline, dispatch the `tester` agent after a task's review passes (or after
the final review), pointing it at the brief and the touched files. The tester
imports from `e2e/fixtures/*`, verifies the test fails on broken code and passes
on the fix, and reports results.

## Red flags — never

- Start implementation on `main`/`master` without explicit user consent.
- Skip the per-task review, or accept a report missing either verdict (spec
  compliance AND task quality are both required).
- Move to the next task while the review has open Critical/Important issues.
- Dispatch multiple coder subagents in parallel (they conflict on the tree).
- Make a coder read the whole plan file — hand it its `task-N-brief.md`.
- Skip the scene-setting context (the subagent must understand where the task
  fits).
- Ignore subagent questions — answer before letting them proceed.
- Accept "close enough" on spec compliance.
- Tell a reviewer what not to flag, or pre-rate a finding's severity.
- Dispatch a reviewer without a diff package file — write it first.
- Re-dispatch a task the ledger already marks complete — check the ledger and
  `git log` after any compaction or resume.
- Push to `main`, or commit without user OK in wrap-up. Branch `project/<slug>`;
  stage by name, never `git add -A`.

## Integration

- **Upstream in the chain:** `vivreal-workflow:vivreal-brainstorming` →
  `vivreal-workflow:vivreal-writing-plans` produces the `plan.md` this skill
  executes (invoke chain skills by their full plugin-qualified names).
- **Subagents driven:** `coder` (implementer), `reviewer` (per-task + final),
  `tester` (optional regression coverage) — all from the vivreal-workflow plugin.
- **Read-first for every dispatch:** the `shared-standards` skill.
- **Alternatives:** `/coordinator` for production bugs (adds research + document
  phases and a 3-pass gate); `/orchestrate` for audits/design/refactors that need
  a design-approval gate before code.
