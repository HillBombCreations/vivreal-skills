---
description: Adversarial 12-point review of a bug fix. Reviews the diff for the given slug against research.md and plan.md. Can also review the current unstaged diff with no arguments. Records metrics.
argument-hint: <slug | (no args = review current diff)>
---

You are dispatching the reviewer agent directly. The user invoked `/bug-review` with: **$ARGUMENTS**

## Setup

### Mode 1: Slug provided
1. Extract the slug from `$ARGUMENTS`
2. Verify `docs/bugs/<slug>/research.md` and `docs/bugs/<slug>/plan.md` exist
3. Determine the review pass number: check for existing `docs/bugs/<slug>/review-*.md` files, increment
4. Tell the user: "Dispatching reviewer pass <N> for `<slug>`."

### Mode 2: No arguments (review current diff)
1. Generate a slug from the current branch name or `ad-hoc-review-<date>`
2. `mkdir -p docs/bugs/<slug>/`
3. Initialize metrics.md if not exists
4. Tell the user: "Dispatching reviewer for current diff."

## Dispatch

```
description: Adversarial review pass <N> for <slug>
subagent_type: reviewer
prompt: Adversarial review of bug fix <slug>. This is pass <N>. Read the shared-standards skill. [If slug mode: also read docs/bugs/<slug>/research.md, docs/bugs/<slug>/plan.md, and any prior review docs]. Run git diff to see changes. Walk the 12-point checklist with PASS/FAIL/N-A per item. Cite file:line for every FAIL. Write your verdict to docs/bugs/<slug>/review-<N>.md. Approval requires ALL 12 items PASS or N-A.
```

## Post-Dispatch

1. Read the verdict from `docs/bugs/<slug>/review-<N>.md`
2. Append metrics to `docs/bugs/<slug>/metrics.md`:
   ```markdown
   ### Review pass <N> — reviewer
   | Metric | Value |
   |---|---|
   | total_tokens | <from agent result> |
   | tool_calls | <from agent result> |
   | duration_ms | <from agent result> |
   | verdict | APPROVED or REJECTED |
   ```
3. Show the user the verdict and any FAIL items
4. If REJECTED, suggest: "Run `/code <slug>` to address the FAIL items, then `/bug-review <slug>` again."
5. If APPROVED, suggest: "Run `/document <slug>` to generate RESOLUTION.md and PR description."
