---
description: "How to run several agents at once without them starving each other or the machine. Read before dispatching more than one agent into the same repository, and before any agent runs a test suite, a dev server or a browser. Covers who owns the commit gate when agents work in parallel, the shared ports and the shared stash, and keeping the machine at a healthy load rather than pegged."
---

Parallelism here is limited by the machine and by a handful of shared resources,
not by how many agents you can think of. Exceed either and throughput goes down,
not up: runs hang, gates report another agent's result as yours, and the work has
to be redone.

## The commit gate, when agents run in parallel

The standing rule is that the local hooks are the only thing that reads code
before it lands, and **you never bypass them**. That rule is not suspended here.
What changes is **who runs the gate**, not whether it runs.

The pre-commit hook runs lint-staged, the unit suite and the coverage map. The
pre-push hook runs the repo lint, both type configs, the unit suite, the coverage
map and an end-to-end smoke. Each is expensive. Run several of them concurrently
on one machine and they contend for CPU and for the shared ports, and the honest
outcome is not a slow pass, it is a hang.

So, when more than one agent is working the same repository as part of one
coordinated batch:

- **The orchestrator owns the gate.** It runs the full suite once, at the end,
  over the accumulated diff.
- **Each agent writes the tests its change needs and does not run them.** That is
  deliberate, not laziness. The one sweep at the end covers all of it, and a test
  written and not run is still the artefact that makes the sweep meaningful.
- **Each agent still runs lint and the type check on its own files.** Those are
  cheap, local and do not contend.
- An individual agent may skip the commit hook **only** when an orchestrator has
  explicitly taken ownership of the gate for that batch. That is the whole
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

Anything killed mid-run leaves residue that poisons the next run: a killed smoke
leaves a server on its port and a test build directory behind, so remove both.

**Prefer fewer, longer-lived agents to many short ones** when they contend for
the same repository. The coordination cost is real and it is paid in wall clock
either way.

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
