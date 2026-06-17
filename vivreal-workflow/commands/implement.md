---
description: Principal-level implementation of a feature or change. Writes production-grade code with proper error handling, performance, and security. Use for complex implementations that need senior-level judgment.
argument-hint: <"add webhook retry logic" | "implement the rate limiter" | "refactor the auth flow" | description of what to build>
---

You are dispatching the coder agent. The user invoked `/implement` with: **$ARGUMENTS**

## Setup

1. Determine if there's an existing design doc:
   - Check `docs/designs/*/design.md` for a matching topic
   - Check `docs/bugs/*/plan.md` for a matching slug
2. If a design/plan exists, include its path in the dispatch
3. Tell the user: "Dispatching principal coder."

## Dispatch

```
description: Implement — <brief description>
subagent_type: coder
prompt: |
  Implement: $ARGUMENTS

  Read the shared-standards skill first.
  Read C:\repos\Vivreal_Portal_Mobile\CLAUDE.md for portal conventions.
  [If design exists: Read docs/designs/<slug>/design.md for the approved architecture.]
  [If backend: Read the relevant backend CLAUDE.md.]

  Write production-grade code. Run lint and type-check when done.
  Report all files modified and any decisions you made.
```

## Post-Dispatch

1. Show the user files modified and lint/type-check results
2. Suggest: "Run `/reviewer` to get a senior-level review before shipping."
