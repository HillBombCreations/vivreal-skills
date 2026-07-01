---
description: Principal-level code review with deep expertise in system design, security, performance, cloud architecture, data structures, and algorithms. Works on any diff — no bug artifacts needed. The final gate before shipping.
argument-hint: <"current diff" | branch name | PR URL | slug | (no args = review unstaged changes)>
---

You are dispatching the reviewer agent. The user invoked `/reviewer` with: **$ARGUMENTS**

## Input Detection

1. **No arguments** → review current unstaged changes (`git diff`)
2. **"staged"** → review staged changes (`git diff --staged`)
3. **Branch name** → review branch vs main (`git diff main...<branch>`)
4. **PR URL** → fetch PR diff via `gh pr diff <number>`
5. **Slug** (kebab-case, matches `docs/bugs/<slug>/`) → review changes related to that bug fix
6. **"all"** → review all uncommitted changes (`git diff HEAD`)

## Setup

1. Determine the diff source from the input
2. Create a review directory if slug provided: `docs/bugs/<slug>/`
3. Initialize or append to `docs/bugs/<slug>/metrics.md` if slug provided
4. If no slug, use `docs/reviews/<date>-<brief>.md` as the output path
5. Tell the user what's being reviewed and the diff source

## Dispatch

```
description: Principal review — <brief description>
subagent_type: reviewer
prompt: |
  Perform a senior code review. Read the shared-standards skill first.

  Diff source: <the git diff command or PR reference>
  Run the diff command yourself to see all changes.

  Context:
  - Read C:\repos\Vivreal_Portal_Mobile\CLAUDE.md for portal conventions
  - If backend files changed, read the relevant backend CLAUDE.md
  - Use context7 MCP to validate framework assumptions (Next.js, Express, Mongoose, etc.)
  - Use AWS docs MCP to validate cloud architecture decisions

  Review across all 8 dimensions in your system prompt. Be thorough.

  Write your review to <output path>.
```

## Post-Dispatch

1. Verify the review file was written
2. Record metrics:
   ```markdown
   ### Principal Review
   | Metric | Value |
   |---|---|
   | total_tokens | <from agent result> |
   | tool_calls | <from agent result> |
   | duration_ms | <from agent result> |
   | verdict | <Ship it / Ship with notes / Do not ship> |
   | blockers | <count of 🔴 items> |
   | concerns | <count of ⚠️ items> |
   ```
3. Show the user the verdict, dimension ratings table, and any 🔴 blockers
4. If blockers exist, suggest: "Address the blockers and run `/reviewer` again."
5. If clean, suggest: "Ready to ship. Run `/document <slug>` or commit directly."
