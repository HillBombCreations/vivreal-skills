# Deploy day: lanes, records, the machine and the alarms

The main thread's steps while release engineers run a release's deployments in lanes, from release
C's deploy day (2026-11-24). Each rule is a slip; the lesson id names it in release C's `progress.md`
Lessons table. The release engineer's own half is in `vivreal-workflow:release-engineer`, "Deploy day
in lanes".

- **Watch a run record by its line count, not with `tail -F`** (L-C-25). On Windows, Git Bash
  `tail -n 0 -F <run-record> | grep` delivered no line in two 30-minute windows while the lanes'
  record script appended lines (the same watch on a walk's defects file worked), and a lane's
  `NEED-MT` waited 1 hour 40 minutes. Poll instead: keep the last handled line number, read
  `wc -l < <run-record>` on each tick, print the new lines with `sed -n '<last+1>,$p'`, and read the
  file by hand at every re-arm.
- **One heavy WSL build at a time across every lane** (L-C-25, P-heavy-runs). Two lanes' webpack
  builds at once took WSL's memory to 16 GB and hung it; `wsl --shutdown` itself hung, and only
  `wsl --shutdown --force` cleared it. A dispatch that builds in WSL names the lane that holds the
  heavy-build turn, and the next lane waits for its end line.
- **Keep the machine awake from the first deploy to the last lane's end** (L-C-28). The machine
  slept about 6 hours with two lanes mid-checks: nine timed reads were taken 2 to 6 hours late, a saved
  QA session expired, and a page went unseen for 4 hours. Hold the same keep-awake as a walk
  (`references/walks.md`, the display flag included) and ask the owner to leave the lid open.
- **A lane never holds a shared lock across a wait on another lane** (L-C-29). Lane B held a QA
  business's lock "until after" a row that waited on PROVEN D11, which needed a lane A row that
  needed that lock: a cycle, broken only by the main thread. Locks are taken per row and freed at
  each row boundary; the runbook names which lock each row takes (`vivreal-workflow:vivreal-writing-plans`,
  "Runbook commands and STOP conditions").
- **A lane dispatch carries a bounded row list, and every lane writes HANDOFF lines as it goes**
  (L-C-33). Three release engineer dispatches ran out of working context mid-lane and handed rows
  back unrun. One dispatch takes the deploys, or the checks after them, never both; each row's end
  writes a `HANDOFF` line (row, result, what the next row needs), so a fresh dispatch starts from the
  last one with no re-reading.
- **An enable-then-dispatch workflow step waits for the enable to settle** (L-C-26). Secure's
  promote ghosted twice: dispatched about 1 s after `gh workflow enable`, each run sat queued with 0
  jobs, and cancel and force-cancel both answered 409. The rule is the release engineer's
  (enable, read the state back as `active`, wait about 60 s, dispatch, confirm a job started within
  minutes); a ghost run stays queued forever, so the main thread lists each one, with its target
  branch, in the release state and watches it until GitHub clears it.
- **Pausing an alarm's pages trades one page for another** (L-C-31). The Secure alarm verifier counts
  every actions-disabled alarm not on its hold list (`src/alarmVerifier/holdList.js`, code) and pages
  through `VR-Secure-API-AlarmVerifier-undeliverable-alarms` at its :26 runs. Pause a once-a-day
  alarm only around its own run, between two verifier runs, or add a dated hold in a reviewed Secure
  change (`vivreal-infra:vivreal-observability`).
- **A test that deletes a site waits for that site's Deploy-Site run to end first** (L-C-30). A QA
  site deleted while its own deploy still polled the domain association threw an unhandled
  `NotFoundException` in EventHandler (a test-caused Sentry issue). Record the deploy's end time
  before the delete (`vivreal-knowledge:vivreal-accounts-and-writes`).
