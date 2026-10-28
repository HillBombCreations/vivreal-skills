---
description: Orchestrate the full bug fix workflow, research, plan, user approval, implement, strict review (max 3 passes), document, PR. Dispatches the vivreal-principal coordinator agent in bug mode.
argument-hint: '<bug description, slug, "inbox #N" or a Sentry issue URL>'
---

Dispatch `vivreal-principal:coordinator` in the foreground with `--mode=bug` and the arguments: **$ARGUMENTS**

Relay its report and its `STATUS.md` path. The protocol (input detection, phases, approval loop, the 3-pass review cap,
escalation, PR mechanics) lives in the agent, not here.
