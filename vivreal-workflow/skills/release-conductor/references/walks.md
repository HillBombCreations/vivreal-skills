# Walks: the defects watch, the machine and the clean-up

The main thread's steps while a QA walk runs, moved out of `release-conductor` section 5 (which keeps
the walk's shape: one walker run, every row first, then the fixes). Each step is a release B or C
slip; the lesson id names it in that release's `progress.md` Lessons table.

- **Watch the defects file, do not wait for messages.** `vivreal-product:qa-walker` has no
  SendMessage, so never ask it to message the main thread. At walk start, arm Monitor on its live
  defects file, `tail -n 0 -F <walk>-defects.md | grep --line-buffered -E "^## |NEED-"`, and route
  each defect as it lands (release-conductor section 3). A `tail -F` watch that delivers nothing
  while the file grows is a dead watch, not a quiet walk: on deploy day the same watch on a run record
  delivered no line for an hour on Windows (release C, L-C-25), so check the file's line count at
  every re-arm and switch to the line-count poll of `references/deploy-day.md` when they disagree.
- **Every re-arm reads the gap first** (release C, L-C-08). The watch expires (every 30 minutes on
  2026-11-23), and a `NEED-TIER-FREE` line written between one watch ending and the next waited 42
  minutes. Before arming again, grep the file for `NEED-` and `## ` lines newer than the last one
  you handled, and handle them first.
- **Re-arm the watch BEFORE you open any owner dialog during a walk** (L-C-13). An open dialog
  holds the session; the watch lapsed under one and four lines (two `NEED-OWNER`, two defects)
  waited up to an hour.
- **A done file is written only after an explicit check of what it reports** (L-C-12). A done
  file at the end of an `&&` chain through `tee` was written while the write it logged had failed
  (HTTP 403), and the walker briefly saw a false done. Run the step, read its result back (the
  status code, the stored value), test that read, and only then write the done file, as its own
  command.
- **A helper started inside a watch holds a single-instance lock and dies with its watch**
  (L-C-20). Stopping a Monitor did not stop the loop it launched, so eleven copies raced on the
  handshake files and one deleted a fresh go file. Give such a helper a pid file it checks with
  `kill -0` before starting, kill it when its watch is replaced, and list processes naming its
  script before every re-arm.
- **Stop the watch pipes this session started, before each re-arm and at the walk's FINAL end**
  (release C, L-C-24). Stopping or expiring a Monitor ends the watch, not the processes of its pipe:
  at the end of release C's walk 34 `tail -F` processes on the defects file were still running, one
  per re-arm. Before each re-arm, stop the `tail` and `grep` of the watch this session armed last.
  The FINAL end is after the last failed-row re-walk passes, not `## WALK PASS 1 COMPLETE`: there,
  stop every watch pipe this session started, then LIST every other process whose command line names
  the walk folder (fleet-concurrency, "Sweep for orphans"). Stop a listed process only when the agent
  that owns it is finished or cut off, checked against the agent list (the L-C-05 sweep, section 7
  of the skill): two shells of an earlier walker part sat blocked on a script edit there. A process a
  running agent owns is left alone and named in the walk report. The walk is closed only when the
  list holds nothing but such named processes.
- **Keep the walk machine awake** until the walk's end marker (a sleeping machine looks like a
  stalled walk), and say so in the walk report. On Windows hold `ES_DISPLAY_REQUIRED` as well as
  `ES_SYSTEM_REQUIRED` (`SetThreadExecutionState(0x80000003)`, continuous) for the whole walk, and
  ask the owner to leave the lid open (release C, L-C-14): on a Modern Standby laptop the screen
  going off still entered standby, and the walk machine slept 6.5 hours mid-walk with only the
  system flag held.
- **A restart at a setup point, or for a harness failure, is the only stack handshake left**
  (WALK-THEN-FIX removes the per-fix restarts and the two-walker handshake they needed). When a
  restart does need one, the harness notes from release C hold: a background wait for `STACK-UP`
  writes the resume file itself the moment the stack is up, never the main thread by hand after a
  dialog (L-C-09); a coordinator resumes reading from the `STACK-UP` line itself, never from the
  file's end, deletes the spent go file at resume, and is run against a fixture file before it is
  armed (L-C-18); and its helpers follow the single-instance rule above (L-C-20).
