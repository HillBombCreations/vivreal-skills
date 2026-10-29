---
description: Orchestrate non-bug work (audits, features, refactors, migrations, design, docs) by dispatching the vivreal-principal coordinator agent in the matching mode.
argument-hint: <task description> [--workflow=audit|investigate|feature|refactor|migration|design|docs]
disable-model-invocation: true
---

Dispatch `vivreal-principal:coordinator` in the foreground with `--mode=<mode>` and the arguments: **$ARGUMENTS**

The mode comes from `--workflow`, else from the task's wording: `audit` and `investigate` run `--mode=audit`;
`feature`, `refactor`, `design` and `docs` run `--mode=feature` (for `design`, tell it to stop after the design
approval); `migration` runs `--mode=migration`. Ambiguous wording runs `--mode=audit`, and say so.

Relay its report and its `STATUS.md` path. The protocol lives in the agent, not here.
