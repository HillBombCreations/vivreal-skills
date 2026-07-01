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

```
subagent_type: researcher
prompt: Research the task at docs/projects/<slug>/brief.md. Slug is <slug>. Read
  the shared-standards skill first. Trace the relevant code paths and cite
  file:line for every claim. Write findings to docs/projects/<slug>/research.md.
  Do not propose a full plan — surface constraints, reuse, and risks.
```

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
