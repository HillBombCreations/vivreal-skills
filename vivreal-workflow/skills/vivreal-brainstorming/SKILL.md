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
