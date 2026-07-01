---
description: Write regression tests for a bug fix. Reads plan.md and research.md for the given slug. Records metrics.
argument-hint: <slug>
---

You are dispatching the tester agent directly. The user invoked `/test` with: **$ARGUMENTS**

## Setup

1. Extract the slug from `$ARGUMENTS`
2. Verify `docs/bugs/<slug>/plan.md` exists — if not, tell the user: "No plan found for `<slug>`. Run `/architect <slug>` first."
3. Tell the user: "Dispatching tester for `<slug>`."

## Dispatch

```
description: Test <slug> fix
subagent_type: tester
prompt: Write tests for the fix to bug <slug>. Read the shared-standards skill, e2e/TESTING.md, docs/bugs/<slug>/plan.md "Test plan" section, and docs/bugs/<slug>/research.md. Write a regression test that exercises the exact bug path AND at least one edge case. Use e2e/fixtures, never @playwright/test directly. Run the tests and paste the output.
```

## Post-Dispatch

1. Append metrics to `docs/bugs/<slug>/metrics.md`:
   ```markdown
   ### Testing — tester
   | Metric | Value |
   |---|---|
   | total_tokens | <from agent result> |
   | tool_calls | <from agent result> |
   | duration_ms | <from agent result> |
   ```
2. Show the user a summary of tests written and their pass/fail status
3. Suggest next steps:
   - "Run `/review <slug>` to get an adversarial review"
