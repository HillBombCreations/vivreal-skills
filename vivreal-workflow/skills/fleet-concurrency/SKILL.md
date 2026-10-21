---
name: fleet-concurrency
description: "How to run several agents at once without them starving each other or the machine. Read before dispatching more than one agent into the same repository, and before any agent runs a test suite, a dev server or a browser. Covers who owns the commit gate when agents work in parallel, the cap of four agents and the shared session budget, routing new finds to the agent that owns the area, one publisher per shared target and one consumer bump pass, the shared ports, stash and scratchpad, and keeping the machine at a healthy load rather than pegged."
---

Parallelism here is limited by the machine and by a handful of shared resources,
not by how many agents you can think of. Exceed either and throughput goes down,
not up: runs hang, gates report another agent's result as yours, and the work has
to be redone.

## The commit gate, when agents run in parallel

The standing rule is that the local hooks are the only thing that reads code
before it lands, and **you never bypass them outside a named mode that authorises
it**: `portal-coder`'s PARALLEL mode, or its FOLLOWUP mode on a branch that already
passed the full gate (owner, 2026-10-06). That rule is not suspended here. What
changes is **who runs the gate**, not whether it runs.

**The portal has no full e2e gate (owner, 2026-10-10).** A portal release-head
check is eslint, both `tsc` configs, and every test file the release added or
changed; the local QA walks replace the full e2e run. Never schedule the full e2e
suite, the full vitest run or the smoke as a separate batch gate for the portal.

The pre-commit hook runs lint-staged, the unit suite and the coverage map. The
pre-push hook runs the repo lint, both type configs, the unit suite, the coverage
map and an end-to-end smoke. Each is expensive. Run several of them concurrently
on one machine and they contend for CPU and for the shared ports, and the honest
outcome is not a slow pass, it is a hang.

So, when more than one agent is working the same repository as part of one
coordinated batch:

- **The orchestrator owns the gate.** It runs the one gate once, at the end, over
  the accumulated diff: the hooked push for a backend, the release-head check above
  for the portal.
- **Each agent writes the tests its change needs and runs only those files, by
  name.** Never the whole suite, the coverage map or the smoke: those are the
  contended runs. A targeted run of your own test files is cheap and is how you
  establish red (the `shared-standards` red proof).
- **Each agent still runs lint and the type check on its own files.** Those are
  cheap, local and do not contend.
- An individual agent may skip the commit hook **only** when an orchestrator has
  explicitly taken ownership of the gate for that batch and dispatched it in a
  mode that says so (PARALLEL or FOLLOWUP for the portal). That is the whole
  exception. An agent working alone never skips it, and "I was in a hurry" is not
  an orchestrator.
- **The orchestrator must actually run it.** A gate nobody ends up running is
  worse than a gate every agent ran slowly, because the record says it passed.

If you find yourself reaching for a hook bypass and no orchestrator has claimed
the gate, stop. You are about to make an ungated change look gated.

## The shared resources, and what each one does when contended

**Fixed ports.** The portal's test server and its mock upstream sit on fixed
ports, and the runner is configured to reuse an existing server. That means one
worktree's server can serve and test **another worktree's code**. The failure is
not only starvation: it produces **false passes**, where an agent's suite goes
green against a tree that is not the one it changed. If a step needs a running
portal, serialize that step across the whole batch, and identify a running server
by its **path**, never by the package banner, because the portal's package name
does not match its repository name.

**`VR_HARNESS_OFFSET` gives a targeted portal e2e run its own ports.** The harness
reads it as an integer from 0 to 400 and shifts the app port, the mock-upstream
port and the Next dist dir for that run (portal `e2e/fixtures/harnessPorts.ts`;
offset 0 is the historical pair, and a bad value throws rather than falling back to
0). v7 reviewers ran targeted e2e at small non-zero offsets while the default ports
stayed free. A second agent running targeted e2e sets it. The pre-push gate still
binds the defaults, so it stays one at a time.

**One stash, shared across every worktree.** Worktrees share the common git
directory, so they share one stash stack. lint-staged stashes. Two agents
committing at the same moment pop each other's work. Serialize any commit that
triggers lint-staged, or take the orchestrator route above.

**One browser session.** The browser profile holds a real signed-in session, and
only one agent can drive it. A second agent driving it sees tabs it did not open
and pages that navigate under it. Dispatch exactly one browser-driving agent at a
time, and tell it to stop and report rather than fight a page that moves on its
own.

**`node_modules` does not follow a branch.** Switching a worktree's branch leaves
the installed tree alone, so declared, locked and installed can all disagree, and
a version mirror test then fails in a way that reads as a real product gap. Print
all three before trusting anything, then reinstall from the lockfile.

## Keeping the machine healthy

**Watch the real load, not a spot reading.** An instantaneous processor sample is
spiky and has read 100 percent on a machine that was 4 percent busy. Measure a
per-process delta over an interval before concluding anything, and suspect your
own leftovers first.

**Sweep for orphans, and do it routinely rather than once.** Long agent runs
leave things behind: dev servers on the fixed ports, browser processes with no
driver, test runners whose parent is gone, and **recursive directory walks that
outlived the question they were answering**. That last one costs out of all
proportion here, because a recursive search crosses every worktree and every
`node_modules` inside each, and there are many. Two such leftovers were once the
top consumers on this machine while a spot reading was being blamed on something
else.

A dev server left on a fixed port is worse than idle: the next agent reuses it
and tests the wrong tree.

`scripts/sweep-orphans.ps1` does this. It reports by default and kills only with
`-Kill`. Run it before dispatching a batch and again between phases, and pass
`-Protect` the worktree path of any run legitimately in flight.

**The rule that makes a sweep safe, and it is not optional.** "Its parent has
exited" is **not a signal by itself on Windows**. `csrss`, `wininit`, `winlogon`,
the service hosts and most vendor background agents all have exited parents by
design. A first version of that script duly listed `csrss.exe` as a kill
candidate, and killing it bluescreens the machine instantly.

So orphanhood is only ever considered **inside a candidate set** of things an
agent run actually spawns, with a second independent denylist refusing system
processes whatever the signals say. A browser counts only when something is
driving it, which a person's own browser never is. If you write your own sweep,
build both guards before you build the detector.

Three signals, none sufficient alone: orphaned within the candidate set, busy
measured as a **delta over an interval**, and walking a path recursively. **Age is
not a signal.** An editor open for three days is fine.

Kill, then **verify it is gone**. A kill that silently failed reads as a clean
sweep. And anything killed mid-run leaves residue that poisons the next run: a
killed smoke leaves a server on its port and a test build directory behind, so
remove both.

**The walk that costs the most is the one that excluded downstream.** The single
worst leftover measured here was a recursive search that filtered `node_modules`
out of its RESULTS rather than out of its TRAVERSAL, so it kept descending into
every dependency tree in every worktree. It had burned thousands of CPU seconds
over hours by the time anyone looked. Prune at the source, and treat a search
that is still running minutes later as a bug rather than as thoroughness.

**Prefer fewer, longer-lived agents to many short ones** when they contend for
the same repository. The coordination cost is real and it is paid in wall clock
either way.

## Budget and collisions

**Cap: at most four background agents at once (owner, 2026-10-17; it replaced the
earlier "about five").** Count every coder, reviewer, researcher, walker and ledger
agent. An orchestrator that runs its own sub-agents uses slots too, so leave it the
slot it needs. When a slot
frees, start the next item rather than idling. Restarting an agent that crashed (a
login error, a dropped connection) is not a new dispatch. Prefer handing new work of
the same kind to an agent about to finish in the same repository over a fresh
dispatch.

**Route every find at once (owner, 2026-10-19).** The moment a walk, review or coder
surfaces a new item, hand it to the running agent that owns that repository or area
(a message, for same-scope work), or dispatch a new agent if a slot is free. Never
hold finds for a later batch. Walkers append each defect to a live `*-defects.md` as
they find it, and the coordinator watches that file (one background wait, not a poll
loop) so research and fixes start mid-walk. There is still one retest at the end.

**A message may narrow or add same-scope work; a widened authority needs a fresh
dispatch.** Merge, release, a production write, a real-account action, or the
owner's go for any of them, goes in the FIRST prompt of a new dispatch. An agent
correctly refuses a go relayed as a mid-task message (v7 release engineer,
2026-10-20), and every write agent does the same, not only the release engineer
(v7.1). So when the owner approves a one-shot in the main thread (a single
production command, a change set, a typed-confirmation script), the coordinator
runs it itself rather than relaying the go to a running agent, then hands the
read-back to the agent that owns the work.

**The session budget is shared, and it kills every agent at once.** Nine agents
fanned out on 2026-10-04 drained it and seven died together mid-work, two with code
uncommitted and one holding a live security fix. Disjoint files are a correctness
argument, never a capacity one. So: priority order (security and live breakage
first, then deadlines, then the rest), tell every agent to commit early and often,
and keep a recovery snapshot current so a budget death costs a status check, not
the work.

**Collision decides which agents may run together; the budget decides how many.**
Hold an agent back when it would share a working tree, a Playwright session or
storage state, a fixed dev-server port, or the same live document with a running
agent. Agents in different repositories, databases and buckets run together freely.

**One publisher per shared target.** The template registry (`site_templates` plus
the template bucket), the live vivreal.io CMS, and any npm publish are single shared
targets. Exactly one agent publishes to each at a time, and it publishes from merged
`master`, never from a feature branch while sibling PRs are unmerged; a cleanup
agent once republished three kits from its own branch and the registry served
already-removed content for four minutes.

**Publish every pending package first, then ONE consumer bump pass (owner,
2026-10-19).** When several `@hillbombcreations/*` packages have changes, publish all
of them (each reviewed and verified on the registry), and only then dispatch one bump
pass that moves every consumer to every new version, one commit per consumer on its
release lane. Bumping per package multiplies commits, lockfile edits, suite runs and
reviews in every lane. An agent that needs a package change mid-build reports it; it
never publishes and bumps on its own. The bump pass itself is `package-publisher`.

**Namespace the scratchpad.** It is shared by every agent and session. Write
`scratchpad/<task-slug>/<file>`, never a generic name (`count.py`, `out.txt`,
`after.json`), and treat a scratch helper as untrusted between invocations: a
sibling can overwrite it with different code that still prints a plausible number.
That includes PR bodies: in v7.1 a PR body was overwritten through a shared
`pr-body.md`. Name every file uniquely (`<repo>-<branch>-pr-body.md`), and read
it back before `gh pr create --body-file` or `gh pr edit --body-file`.

**Never `git reset --hard`, `git stash`, `git checkout --` or `git restore` a file
you did not write.** An unexpected change in a repository you share is someone
else's uncommitted work, not your debris. Commit with an explicit pathspec
(`git commit --only <paths>`): a bare commit also sweeps a peer's already-staged
files into yours.

**Tell the FIRST agent too.** When a second agent is dispatched into a repository
that already has one, send the coexistence rules above, and each agent's owned file
list, to the agent already running. A rule that reaches half the participants
prevents nothing; the agent dispatched first is the one that did the damage.

## Sizing a batch

- Agents that only **read** files, in different areas, parallelise freely.
- Agents that **write** to different repositories parallelise freely.
- Agents that **write** to the same repository need separate worktrees and a
  single owner for the gate.
- Agents that need a **running server or a browser** run one at a time, always.
- A read-only audit and a writing agent in the same repository is safe only if
  the reader reads committed refs rather than a working tree, because the writer
  is changing the tree underneath it.

## The habit that makes all of this checkable

A check that cannot fail is not a check. When you assert the machine is healthy,
name what you measured and over what interval. When you assert a port is free,
show the listener list. When you assert a suite passed, say which tree it ran
against and how you identified it, because the shared-port trap means a green
run is not self-evidently **your** green run.
