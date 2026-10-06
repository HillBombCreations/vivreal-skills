---
description: Principal-level implementation of a feature or change. Writes production-grade code with proper error handling, performance, and security. Use for complex implementations that need senior-level judgment.
argument-hint: <"add webhook retry logic" | "implement the rate limiter" | "refactor the auth flow" | description of what to build>
---

You are dispatching the coder agent (or `portal-coder` for a portal task). The user invoked
`/implement` with: **$ARGUMENTS**

## Setup

1. Determine if there's an existing design doc:
   - Check `docs/designs/*/design.md` for a matching topic
   - Check `docs/bugs/*/plan.md` for a matching slug
2. If a design/plan exists, include its path in the dispatch
3. Determine the target repo from $ARGUMENTS and the design/plan if one exists. If it is
   `Vivreal_Portal_Mobile` (or the task is clearly portal-only: proxy routes, CSRF, the
   three-tier axios rule, a portal component), use `portal-coder` in SOLO mode for the rest of
   this command. Otherwise use `coder`.
4. Tell the user: "Dispatching principal coder." or "Dispatching portal coder (SOLO)." as
   appropriate.

## Dispatch

```
description: Implement, <brief description>
subagent_type: coder   # or portal-coder, per Setup step 3; portal-coder defaults to SOLO mode
prompt: |
  Implement: $ARGUMENTS

  Read the shared-standards skill first.
  [If portal-coder: this is SOLO mode, you are the only portal coder on this task.]
  [If coder and the task touches the portal incidentally: read C:\repos\Vivreal_Portal_Mobile\CLAUDE.md for portal conventions, but the portal's own implementation work still belongs to portal-coder.]
  [If design exists: Read docs/designs/<slug>/design.md for the approved architecture.]
  [If backend: Read the relevant backend CLAUDE.md.]

  Write production-grade code. Run lint and type-check when done.
  Report all files modified and any decisions you made.
  SKIP your auto-review, this command runs the review gate in Post-Dispatch.
  SKIP your own commit, push, and PR, this command owns the git mechanics now
  (portal-coder: still create your fresh worktree and run your mode's gates,
  just stop before committing).
```

## Post-Dispatch

1. Show the user files modified and lint/type-check results.
2. Auto-dispatch the reviewer on the diff (this is the review for solo runs):

```
subagent_type: reviewer
prompt: Review the diff just produced for "$ARGUMENTS" in diff mode. Cite
  file:line for every FAIL. Verdict PASS or FAIL.
```

3. Show the reviewer verdict. If FAIL, dispatch the same agent (coder or portal-coder) to fix
   the flagged items, then re-review (cap 3 passes). If still failing, escalate to the user
   with the latest verdict and STOP here, no commit, no push, no PR.
4. Once the reviewer verdict is PASS (or the user explicitly accepts remaining
   notes), finish the job yourself. The coder (or portal-coder) was told to
   skip its own git mechanics precisely because this command owns them now:
   - Show `git status` and `git diff --stat` for the full diff.
   - Stage by name and commit, `git commit --only <explicit paths>`, never
     `git add -A` and never a bare `git commit`, with hooks green. A hook
     failure is a bug to fix, never `--no-verify`.
   - If currently on `main`, create a branch first, `implement/<short-kebab-slug>`
     derived from $ARGUMENTS (<=50 chars).
   - Push through the gate in the foreground, holding the turn open until it
     finishes. Never background a push.
   - `gh pr create` with a terse body: what changed, the reviewer verdict, and
     any deviations the coder reported.
   - Report the PR URL.
5. State the release state in plain words in the final summary, merged, or
   open and unmerged, never glossed as "Ship it". Only report the task
   complete once the PR exists (or the review loop was escalated to the user
   per step 3, in which case say so plainly instead).
