---
description: Principal-level code review with deep expertise in system design, security, performance, cloud architecture, data structures, and algorithms. Works on any diff, no bug artifacts needed. The final gate before shipping.
argument-hint: '[slug] | "staged" | "all" | branch name | PR URL | (no args = review unstaged changes)'
---

You are dispatching the reviewer agent. The user invoked `/reviewer` with: **$ARGUMENTS**

## Input Detection

1. **No arguments** → review current unstaged changes (`git diff`)
2. **"staged"** → review staged changes (`git diff --staged`)
3. **Branch name** → review branch vs main (`git diff main...<branch>`)
4. **PR URL** → fetch PR diff via `gh pr diff <number>`
5. **Slug** (kebab-case, matches `docs/bugs/<slug>/`) → **slug mode** below, the adversarial 13-point bug-fix review (this replaced `/bug-review`)
6. **"all"** → review all uncommitted changes (`git diff HEAD`)

## Slug mode (a bug fix with research.md and plan.md)

1. Verify `docs/bugs/<slug>/research.md` and `docs/bugs/<slug>/plan.md` exist; if either is missing, say so and fall back to a principal review of the diff.
2. Determine the pass number: count existing `docs/bugs/<slug>/review-*.md` files, plus one.
3. Tell the user: "Dispatching reviewer pass <N> for `<slug>`."
4. Dispatch:

```
description: Adversarial review pass <N> for <slug>
subagent_type: reviewer
prompt: Adversarial review of bug fix <slug>. This is pass <N>. Read the shared-standards skill, docs/bugs/<slug>/research.md, docs/bugs/<slug>/plan.md and any prior review docs. Run git diff to see changes. Walk the 13-point checklist (item 13, the anti-pattern catalog, is mandatory) with PASS/FAIL/N-A per item. Cite file:line for every FAIL. Write your verdict to docs/bugs/<slug>/review-<N>.md. Approval requires ALL 13 items PASS or N-A.
```

5. Read the `Verdict:` line from `docs/bugs/<slug>/review-<N>.md`, append the metrics block below to `docs/bugs/<slug>/metrics.md` with `verdict` set to PASS or FAIL, and show the FAIL items.
6. On `Verdict: FAIL`, suggest: "Run `/implement <slug>` to address the FAIL items, then `/reviewer <slug>` again." On `Verdict: PASS`, suggest: "Run `/document <slug>`."

Every other input takes the principal review below.

## Setup

1. Determine the diff source from the input
2. Create a review directory if slug provided: `docs/bugs/<slug>/`
3. Initialize or append to `docs/bugs/<slug>/metrics.md` if slug provided
4. If no slug, use `docs/reviews/<date>-<brief>.md` as the output path
5. Tell the user what's being reviewed and the diff source

## Dispatch

```
description: Principal review, <brief description>
subagent_type: reviewer
prompt: |
  Perform a senior code review. Read the shared-standards skill first.

  Diff source: <the git diff command or PR reference>
  Run the diff command yourself to see all changes.

  Context:
  - Read ${VIVREAL_REPOS}/Vivreal_Portal_Mobile/CLAUDE.md for portal conventions
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
