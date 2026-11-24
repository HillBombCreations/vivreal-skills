# Network git calls: a deadline and no prompt

Release C, L-C-39: the hq docs tool's git runner (`packages/docs-publisher/src/drift.mjs`, a
`spawnSync` with no timeout) hung over an hour on one `git ls-remote` to GitHub, at 0 CPU, until the
main thread ended it. A git call that reaches a remote can wait forever on a slow network or on a
login prompt nobody can see. So every one an agent runs (`ls-remote`, `fetch`, `pull`, `clone`,
`push`) has a deadline and cannot prompt.

## The commands

- **Both variables, every time:** `GIT_TERMINAL_PROMPT=0` makes git fail at once instead of asking
  for a user name, and `GCM_INTERACTIVE=never` stops the Windows credential manager opening a
  sign-in window. With only the second, git falls back to its own "Username for" prompt after the
  credential manager declines.
- **The default: run it inside your own worktree**, which shares the clone's `.git`, so a fetch
  there moves the same remote refs:
  `cd "$VIVREAL_REPOS/_wt/<your worktree>" && GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 300 git fetch origin`,
  and `... timeout 60 git ls-remote origin <ref>` for a read. A whole-repo fetch or a clone gets the
  longer deadline (`timeout 300`).
- **Only for a repo with no worktree yet, the one-off clone form** (SKILL.md, "Path resolution"),
  which takes no `GIT_*` variable (the owner-checkout guard ends the form on one and refuses the
  command):
  `cd "$VIVREAL_REPOS/_wt/<your worktree>" && GCM_INTERACTIVE=never timeout 300 git -C "$VIVREAL_REPOS/<repo>" fetch origin`.
  This call is **capped, not prevented**: without `GIT_TERMINAL_PROMPT=0` a missing login can still
  wait on git's prompt until the deadline ends it. Make the worktree right after it and fetch
  there from then on.
- **A hooked push** runs its repo's gate first, so its deadline covers the hook: `GIT_TERMINAL_PROMPT=0`
  and a `timeout` just under the Bash call's own (a call of `timeout: 600000` takes `timeout 590`).

## A timeout is VOID

`timeout` exits 124. Report the step VOID with its reason, in the shape hq's tools use
(`git ls-remote timed out after 60 s in <folder>`), never as a pass and never as an empty answer
(an empty `ls-remote` read as "no such branch" is the false zero of
`vivreal-workflow:verification-discipline`). Retry it once; a second timeout is reported, not
retried again.

## The hq implementation

hq's tools do the same through `packages/fleet-ops/lib/git-network.js` (hq #157): a network
subcommand gets a deadline and the no-prompt environment, a local read (`rev-parse`, `ls-tree`,
`cat-file`) keeps none, and a timeout is a named failure. Read the deadline there rather than from
here. A new hq tool that makes a network git call uses it.

A coordinator that sees a step sit at 0 CPU reads its process tree before waiting longer:
`vivreal-workflow:fleet-concurrency`, "A step at 0 CPU for minutes".
