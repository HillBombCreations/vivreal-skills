---
description: Generate RESOLUTION.md and PR description for a completed bug fix. Reads all artifacts for the given slug. Records metrics.
argument-hint: <slug>
---

You are dispatching the documenter agent directly. The user invoked `/document` with: **$ARGUMENTS**

## Setup

1. Extract the slug from `$ARGUMENTS`
2. Verify the following exist:
   - `docs/bugs/<slug>/issue.md`
   - `docs/bugs/<slug>/research.md` (optional but preferred)
   - `docs/bugs/<slug>/plan.md` (optional but preferred)
   - At least one `docs/bugs/<slug>/review-*.md` with APPROVED verdict
3. If none of the above exist, tell the user: "No artifacts found for `<slug>`. Run the workflow first."
4. Tell the user: "Dispatching documenter for `<slug>`."

## Dispatch

```
description: Document <slug>
subagent_type: documenter
prompt: Document the fix for bug <slug>. Read docs/bugs/<slug>/issue.md, research.md (if exists), plan.md (if exists), and the latest review-N.md (if exists). Run git log to get commit SHAs. Write docs/bugs/<slug>/RESOLUTION.md (playbook entry) and docs/bugs/<slug>/pr-description.md (for GitHub PR). Be honest about severity. "How we'd catch this earlier" must be specific — no vague platitudes.
```

## Post-Dispatch

1. Verify both `RESOLUTION.md` and `pr-description.md` exist
2. Append metrics to `docs/bugs/<slug>/metrics.md`:
   ```markdown
   ### Documentation — documenter
   | Metric | Value |
   |---|---|
   | total_tokens | <from agent result> |
   | tool_calls | <from agent result> |
   | duration_ms | <from agent result> |
   ```
3. Show the user paths to both files
4. Suggest: "Ready for PR. You can commit and push manually, or run `/coordinator trace:<slug>` to use the full PR workflow."
