---
name: release-conductor
description: "Use in the main thread when running a Vivreal release or batch: before dispatching more than one agent, whenever a slot frees, when resuming after a cut-off or a usage limit, collecting a GO, running a runbook or a QA walk, working the post-release list, updating the Next Release Picks sheet, recording a lesson, or flipping a live value (agent cap, model, current release). The playbook: read the live values, the slot check that keeps the current release moving, the dispatch shape, owner GOs, walks, records, resume, close-out, where a lesson goes, and the one-line live-value commit. It cites the owner rules by ID (vivreal-hq docs/standards/INDEX.md, detail in process.md) and never restates a live value. Triggers on: release, batch, runbook, dispatch several agents, free slot, agent cap, usage limit, resume an agent, GO, QA walk, post-release list, Next Release Picks, Assigned to, lesson, live value, flip the cap, switch the model."
---

# Release conductor: the main thread's playbook

The owner rules live in vivreal-hq: `docs/standards/INDEX.md` (one line per rule, loaded at
session start) and `docs/standards/process.md` (the rule with its date and detail, same ID). This
skill is the HOW for the main thread and cites those IDs as `P-<id>`. It never states a live value:
the agent cap, the model, the current release, who runs it and where its state lives are keys of
`docs/standards/live-values.md`, and the number you act on is the one printed at session start.

It is for whichever thread dispatches agents: the main thread, or a coordinator or
delivery-orchestrator run. An agent that dispatches nothing does not need it.

## 1. Before the first dispatch

1. **Read the live values.** The vivreal-workflow session-rules hook prints them at session start,
   under a first line `Vivreal shared rules from hq origin/main@<sha7>, printed by the
   vivreal-workflow plugin's session-rules hook:`. If that block is missing, or it carries a
   "last fetched" note, fetch and read them yourself:
   ```bash
   export MSYS_NO_PATHCONV=1
   git -C "$VIVREAL_REPOS/_wt/hq-main" fetch origin
   git -C "$VIVREAL_REPOS/_wt/hq-main" show origin/main:docs/standards/live-values.md
   git -C "$VIVREAL_REPOS/_wt/hq-main" show origin/main:docs/standards/INDEX.md
   ```
   A line `This checkout cannot load the current rules (...)` means the hq checkout the session
   started in is stale: the `origin/main` index printed under it is the one that holds. A single
   line saying `no rules index could be read` means that hq clone's `origin/main` predates the
   shared rules and no rule was printed: run the fetch it names, then the two `show` commands above.
   They run in the kept hq worktree (shared-standards, "Path resolution"; F641), the main thread's
   reads too: a fetch there moves the refs every hq worktree shares, and nothing runs in the hq
   clone itself, which is an owner's checkout with their uncommitted work.
2. **Read the release state** on the branch the live value `release-state` names, never on `main`:
   fetch, then read `docs/projects/next-release-<X>/progress.md` at `origin/<that branch>`.
3. **Open the sheet** (section 6, `references/sheet.md`) and see what is claimed in Assigned to.
4. **Read `vivreal-workflow:fleet-concurrency`** for the machine-side limits (ports, gates, stash,
   scratchpad, the orphan sweep).

## 1a. The shape of a release: one deployment per repo (P-one-promote, amended 2026-11-18)

The owners' rule (hq `docs/standards/process.md`, P-one-promote, amended 2026-11-18): "it should be
one deployment per repo per release, we validate everything locally and once validate then we
deploy" and "we'll validate locally and if we find defects we fix them and rerun locally until it
passes the valdiation then one deployment per repo". It applies to every plan and every step from
now, the rest of release B included ("Like all these BR23 and BR33 as well"). Only release B's
deployments already made before the owners' decision (hq `decisions.md`, 2026-11-18T16:48:03Z) are
exempt. BR-30's alarm flips and Main's BR-35c and BR-35d rode each repo's one batch; the help move
(a window of reviewed edge one-shots) and the rebuild's pilot and fleet steps (parameter flips) run
after the deployments and are not deployments (item 1). Staging a repo across deployments is an
exception an owner must approve, never the plan's default.

1. **Every repo deploys at most ONCE per release.** Everything a repo needs in the release is built
   into its one batch, one PR: features, fixes, a runtime move, alarm actions, a help or site move,
   IAM conditions. A find mid-batch joins that repo's PR as another commit. Parameter and data
   flips, one-shots such as indexes and kits, package publishes under P-packages and docs merges are
   not deployments, and a repo whose several stacks deploy back to back in one step counts as one
   deployment.
2. **Walk the whole batch on the local stack, on the runtime it deploys on, until it passes**
   (P-local-validate). Anything that makes a local walk row fail (a broken flow, wrong behaviour, a
   defect against what the batch promises) is fixed in that repo's batch, with a delta review, and
   the walk runs again, until it passes, in the WALK-THEN-FIX order of section 5 (every row first,
   then every approved fix moves in together); a note or nit that fails no row goes to the backlog
   (P-ship-first). Only when the walk passes do the deployments start. A runtime move is
   validated on the new runtime locally, never proven by a tier in production.
3. **Then deploy the backends back to back,** each proven live
   (`vivreal-infra:vivreal-deploy-proof`) with an immediate alarm and Sentry read, the next
   starting once the last is proven, **the portal last** (P-api-first). **No staged soak or
   calendar gate between deployments unless the owners ask for one** (release B deploy day: the
   owners waived the tier gate and dropped the 1-hour watch, GO-B-WAIVE-TIER2B and
   GO-B-NO-WAITS). Only a watch window that protects customers stays, and it is a flip after the
   deploy (item 4): a rate limit's week in shadow, a new check's days in shadow or watch-only. The
   hq rule text (P-one-promote) follows in its own PR.
4. **A timed soak that must stay is a flip, not a deployment.** A watch-only or shadow mode, an
   allowlist, a rate limit's mode: ship it in the one deploy behind a parameter or data value, and
   turn it on later with a parameter or data flip. Never a second promote to flip an alarm or a
   mode.
5. **An alarm is created with its actions on when nothing can breach before its soak ends.** No
   follow-up promote flips an alarm's actions. An alarm that could page at its own creation (an
   absence alarm with no datapoint yet) is a design question the plan answers without a second
   deployment, or an owner exception in `decisions.md` (`vivreal-infra:vivreal-observability`).
   **An absence alarm (did-not-run, no data) is created with `TreatMissingData: notBreaching`**, or
   with its actions off and a flip after its first datapoint (release C, L-C-27): CMS's new
   pickup-reminder did-not-run alarm read missing data as breaching over 3 x 3600 s, went to ALARM
   at its creation before the hourly sweep's first run, and paged the owners; its booking sibling
   did the same on 2026-10-30. The plan and its review check every new alarm for a creation-time
   breach.
6. **Check every plan before you run it:** its table of deployments per repo says at most 1 for
   every repo. More than 1 for any repo needs an owner's exception recorded in hq `decisions.md`;
   without it, send the plan back (the reviewer FAILs it too). It also carries the section "Help and
   marketing this release makes untrue or adds" (HELP-MKT-IN-PLAN), or goes back too:
   `references/help-and-marketing.md`.

## 2. Slots: the check before every dispatch

The cap and its counting rule are P-cap (the live value `agent-cap`, per machine): count every
running coder, reviewer, researcher, walker, publisher, ledger agent and plan-editing agent, and
any agent whose own background run is still going. A granted extra slot replaces a freed one, it
never stacks. A lowered cap never stops a running agent; it applies to the next dispatch. Heavy
local runs have their own limit (P-heavy-runs), whatever the agent count.

**A resumed agent takes a slot** (release B, L-B-19). Sending a finished agent new work with
SendMessage restarts it, and it counts toward the cap exactly like a new dispatch. Count running
work, resumed agents included, before EVERY dispatch and EVERY resume, call by call: in a turn that
makes several calls, recount before each one, never once for the turn. Release B went one over the
cap twice that way (L-B-19, then L-B-25: two resumes in one turn beside three running agents).

**The count line, written before every dispatch and every resume** (release C, L-C-07, the third
repeat: a resume made 4 against a cap of 3, and the resumed builder was stopped with nothing
written). Before each Agent call and each SendMessage that restarts a finished agent, write the
line `running: <n> (<names>) / cap: <the live agent-cap as it stands now>` from the agent list, and
make the call only when n is below the cap. A turn with three calls writes the line three times.

**Recount after each stop, against the cap as it stands then** (L-C-15). A cap can be conditional
(an extra slot granted only while two walkers run): when the condition ends, the cap drops with it,
and a dispatch in the same turn counts against the lower number. Closing one of two walkers dropped
the cap from 4 to 3, and a fourth agent went out in that turn, one over (stopped at once, nothing
written).

**Over the cap by a slip: stop one agent, do not leave it running** (owner amendment to P-cap,
2026-11-19: "ok so lets stop an agent dont just leace it running"; the hq rule text follows in its
own PR). Stop the agent whose stop loses the least (one that has written nothing yet, or a read
whose output is already saved), never a release engineer mid-deploy, and re-dispatch its work when
a slot frees. This is the only stop the cap allows; it corrects a slip and never makes room for new
work (item 4 below).

**A slot stays with its piece until that piece is approved** (owner, 2026-11-18, L-B-21). The
builder, then its reviewer, then the same builder for the findings, then the re-review, until PASS,
one after another in that one slot; only then does the slot take new work. The walk takes the next
slot an approved piece frees, and does not wait for the other pieces.

**The slot check (P-release-focus), in the session of the owner who runs the current release**
(the live value `release` names who). A slot held by an unapproved piece (above) is not free; the
check decides only a slot no piece holds. Before any dispatch that is not on the release's path:

1. **Is a step on the release path ready with no running agent on it?** A step is a build, a
   review, a fix, a walk, a release step, or a precondition of one. If yes, that step takes this
   slot, and the side work waits.
2. **Does every path step wait on an owner?** Then ask that owner for the GO now (section 4),
   in the same turn. While you wait, a free slot may take side work: no slot is held empty for the
   path. The moment a path step can start, it takes the next free slot.
3. **Does a path step wait on another running agent** (the live walk that follows a release
   engineer's ship, say)? Hold no slot for it either: it takes that agent's slot when the agent
   finishes, and the free slot runs post-release work now.
4. **Never stop a running agent to make room** for new work (P-cap); the one stop is the slip
   correction above.
5. **The one exception to items 2 and 3: while a walk runs, one slot is held for its fixes**
   (release B, L-B-22). A walk's fix has to start while the walker is still running, and item 4
   means no running agent can make room: on release B the last free slot went to a post-release
   coder minutes before the walk's first finds, and their builder waited for a slot. From the walk's
   start to its end marker, the next slot that frees is held for the walk's fix loop, never given to
   side work; side work takes only the slots beyond it.

Side work, in order (P-idle-slots): the current release's post-release list, then research and
planning for the next release. **Help and marketing drafting is release work, not after-work**
(HELP-MKT-IN-PLAN): each page row takes a free slot DURING the release, and only its publish waits
for the deploy; the steps are `references/help-and-marketing.md`. A repo already in flight runs to approval before any new repo
starts (P-finish-repo). In the other owner's session, work only the rows that owner claimed in
the sheet's Assigned to column (P-sheet); never staff the release path unprompted.

## 3. Dispatch

- **The dispatch template** is `vivreal-workflow/references/dispatch-template.md` (the routing
  hook prints its path): one repo per builder, pinned SHAs, the spec path, the mode, the exact
  commands, full authority and any GO in the FIRST prompt, verified premises, a short report,
  done means pushed (vivreal-skills: committed on a local branch, one PR per batch, pushed only
  when ready to merge, P-skills-push-after-review). Pass the live `model` on every dispatch (P-model).
- **One builder per repo per batch** (P-one-builder): it takes the repo's whole list on one
  branch and one PR, keeps a progress file, and is resumed with SendMessage rather than replaced.
  The whole planned PR is built, then reviewed once (P-build-then-review).
- **Route each find at once** to the running builder that owns that repo or area, by
  SendMessage ("after your current commit, do X in the same run, then report once"), including
  work that became ready because a dependency landed (P-route-finds). A new agent only when
  nothing owns it and a slot is free. In a release's final stretch, P-ship-first decides instead.
- **Preparing is not dispatching.** After an environment readiness report, launch the agent that
  uses it in the same turn.
- **Never tell a coder to "consult an expert".** That consumes the coder's own task. Name the
  knowledge skill it should load instead.
- **A brief names a worktree for every repo it touches, never a clone at the root** (release B,
  L-B-45; release C, L-C-01, F641). The hq clone IS an owner's own checkout, and so is every clone
  beside it: on 2026-11-20 three agents ran a read-only fetch or command in the hq clone although
  the same brief said to run nothing there, and on 2026-11-21 three more (a fetch, a worktree add
  and remove, a `git show`). Every brief names the worktree path under `$VIVREAL_REPOS/_wt/` for each
  repo (for hq reads, `$VIVREAL_REPOS/_wt/hq-main`), made by the main thread before the dispatch when the
  repo has none, and says plainly that nothing runs in a clone. The vivreal-workflow owner-checkout
  guard refuses a subagent's command in one (shared-standards, "Path resolution").
- **The main thread runs nothing in an owner's checkout either** (release C, L-C-11, a repeat of
  L-B-45). The guard lets the main thread through, so this one is a habit: on 2026-11-23 the main
  thread ran a read-only `git status` in the hq clone to see whether a file had local edits. Ask the
  owner instead, or copy the file to your scratch folder (a `cp` started from that folder) and
  compare `git -C "$VIVREAL_REPOS/_wt/hq-main" hash-object <the copy>` with
  `git -C "$VIVREAL_REPOS/_wt/hq-main" rev-parse origin/main:<path>`.
- **A renderer publish brief scopes its fleet diff to the affected sites** (P-template-validate and
  P-fleet-diff as amended, release C lesson L-C-03). A read of each site's composed sections picks
  the sites whose pages draw a changed component; the report shows that list, how it was read, and
  one unaffected site as a control. A change whose rows reach every site (a Templates batch) still
  renders and builds every site. `vivreal-workflow:package-publisher` carries the steps.
- **Briefs for a screen name the owners' UI rules** (release B, L-B-46). A design, review or walk
  brief that touches a portal or customer-site screen names `vivreal-knowledge:vivreal-portal-knowledge`
  `references/ui-rules.md` and what each agent owes against it: `vivreal-principal:designer` reads it
  in full, cites the rule ids per screen and checks its recurring misses; `vivreal-principal:reviewer`
  runs its UI-rules row (artifact rubric 4a for a design, workflow item 2a for a diff);
  `vivreal-product:qa-walker` gives every changed screen a rules row in the walk plan. A
  `vivreal-product:regular-user` brief never names the rules (it must stay naive); it asks for the
  screen's title, the view and a screenshot with each confusion, so the reviewer can map it. Release
  C's designs applied the rules only because each brief asked by hand.
- **Content adds go through the product's own screens** (P-content-through-ui). A new help page, a
  blog post or a collection item is added in Studio or the portal's content editor by an agent
  acting as an owner would, signed in as `vivreal-knowledge:vivreal-accounts-and-writes` says, under
  the owner's GO quoted in its dispatch; for a help or vivreal.io page that agent is
  `vivreal-content:help-page-producer`. Brief a one-off database script
  (`vivreal-workflow:ops-one-shot`) only for a step those screens cannot do, and name that step and
  why in the brief.
- **A help producer's PLAN revision may be a resume; every PUBLISH APPLY and every ADD is a fresh
  dispatch** (release B, L-B-39) whose first prompt quotes the owner's GO verbatim (P-go-form) and
  pins the reviewed plan's sha256. A GO relayed into a resumed producer is refused by design, as a
  release engineer's is (section 7). Ask a producer to fold review notes only BEFORE the review
  that passes its plan: a fold after it makes a new plan sha, which that pass no longer covers, so
  a delta review is owed before any APPLY.
- **Every WSL step in a brief starts by changing into the worktree** inside one quoted login-shell
  command, `wsl.exe -e bash -lc 'cd /mnt/<drive>/<clones>/_wt/<worktree> && <command>'`. A bare `wsl ...`
  runs in the folder the Bash call reset to, which is often an owner's own checkout, a plain
  `bash -c` (several briefs on 2026-11-17) runs the Windows npm, and without `-e` an outer shell
  expands every `$` there first. A brief puts a long step in a script file, and for a worktree WSL
  git cannot read it names a clone made from a
  `git bundle` on WSL's own disk, never a Windows install as the fallback (two slips on 2026-11-17).
  The rest (prove Linux node first, which needs the vivreal-skills `SETUP.md` WSL step, and
  `setsid -f`) is in `vivreal-workflow:shared-standards`, `references/wsl.md`.

## 4. Owners

- **An owner is Justin or Hunter**; either may give any GO (P-owners). **Collecting a GO or an
  owner decision** (P-go-form, amended by the owners' GO-IDENTITY, release C lesson L-C-22): read
  the owner from the GitHub account this session's `gh` is signed in as, `gh api user --jq .login`,
  and map it by P-go-form, the one place the login map lives (hq `docs/standards/process.md`, read
  with `git -C "$VIVREAL_REPOS/_wt/hq-main" show origin/main:docs/standards/process.md`). Only when it
  prints a login the map does not name, or nothing (`gh` signed out, the call failed), ask "Who is
  giving this go, Justin or Hunter?" in the same question. Never infer the owner from the Claude
  account, an account email or git config: release C's session ran on a shared support login for
  part of a day. ALLOW: a GO typed in a session whose login the map names is recorded as that owner
  with no question. REFUSE: a login the map does not name is never mapped to an owner, however
  close it looks; ask. Run
  `date -u +%Y-%m-%dT%H:%M:%SZ` right after the answer, and quote
  `GO: "<exact words>" from <Justin|Hunter>, <ISO time>, <source>` in the FIRST prompt of the
  dispatch. For a portal release, ask for the walk sign-off on the exact head in the same question.
- **A blocking question stalls everything behind it, so at night only release-path questions go
  in a dialog** (release B main thread, 2026-11-18). A dialog the owner has not answered holds every
  other action of the session, including the free slots' work. When an owner may be away, ask in a
  dialog only for what the release path needs next (a GO, a STOP decision); put every other question
  (backlog placement, next-release scope) in the session's report or the release state, and
  keep the slots working while it waits.
- **Words need no owner sitting** (owners, Justin 2026-11-21T00:51:53Z, L-C-02; its hq
  `docs/standards/process.md` row comes by its own reviewed hq PR). Owner-facing words (screens, emails, help pages, a design's lines) are
  approved by a voice pass against hq `brand/voice.md` (`vivreal-product:marketing-auditor`) plus
  the reviewer's pass of the design or batch that carries them. There is no word sitting step and
  no words question to the owners: where a line offers two choices, the recommended one stands.
  A line added or changed after its voice pass (a mockup answer, a builder's draft) gets its own
  voice pass before the walk, and the main thread records each line in the release's word file.
  Owners still decide features, behaviour, looks and mockups (PROC-4).
- **One GO runs the whole remaining runbook** (P-blanket-go): dispatch the release engineer once
  in RUNBOOK mode with every remaining step and that GO quoted once; no per-step check-ins.
- **A GO covers the door it names.** A GO recorded for one way of making a change (in Studio,
  through help-publish, by a deploy) does not cover another (a one-off script, a different route):
  ask the owners for that door, and for a one-shot have them approve its exact dry-run pin line
  (`vivreal-workflow:ops-one-shot`, "Who runs it"). A release B search change approved as a Studio
  change was planned as a one-shot under the same GO, and its review stopped it (F541 B3).
- **An owner-gated command** (a deploy-role change set, a typed confirmation) wants the owner's
  approval, not their typing: re-check its shape, then run it yourself (P-owner-gated-yourself).
- Warn the owners before any Sentry test event or a probe that can trip a paging alarm
  (P-sentry-warn). Report unusual CI, build or agent spend the first time it shows (P-flag-cost).
  In a live support chat, type the reply and never press send (P-chat-drafts). No added WAF spend
  (P-no-waf-cost). No new QA users or businesses (P-no-new-qa-users).

## 5. Walks

- **A reviewed walk plan first** (P-walk-plan): every change in the release maps to a row with
  preconditions, steps, the expected result, a REFUSE check and the view, and every blocker is
  cleared before the walk GO. Walk the exact flows before any recording (P-walk-before-footage).
  A row that needs a Sentry event (the local portal sends none) or a Stripe event in key mode
  (`stripe listen --forward-connect-to` forwards only connected accounts' events) is planned not
  walkable (NW) with its named proof, or given a harness path, before the walk GO (release C,
  H-P12-1 and H-P5-3).
- **One walker run, every row first, then fix** (P-local-validate, its WALK-THEN-FIX clauses;
  release C lessons L-C-21 and L-C-06). Moving each fix into the walk as it was approved cost a
  stack restart per fix (eight on 2026-11-23), walkers paused or cut off at each, coordinator races
  and rows walked on a moving target. So:
  1. **One `vivreal-product:qa-walker` run walks every lane in plan order**, never one dispatch per
     lane. It pauses only at a setup point (a stack restart the plan names, a tier flip, an owner
     action), by a `NEED-<what>` line in its defects file, and goes on when the main thread writes
     the done file the line names.
  2. **It walks every row on the stack as it stands.** Each defect is filed live and the walk goes
     on. No head moves and no stack restart to re-walk a fix mid-walk; a restart only at a setup
     point or for a harness failure.
  3. **Fixes are routed, built and reviewed in parallel while it walks** (P-route-finds, the held
     fix slot of section 2 item 5). What waits is moving them in: never re-walk a section before
     moving on.
  4. **After the last row** (the walker's `## WALK PASS 1 COMPLETE` line), every approved fix moves
     into the stack together, in one restart, then one walk over every failed row and the rows each
     fix's rerun list names (`vivreal-workflow:vivreal-writing-plans`, "The walk plan and its fix
     loop"), repeated until every row passes.
- **A walk brief copies the plan's NW list for its lanes, word for word** (release C, the part 10
  brief named two rows the plan makes not walkable locally). Never retype or summarise it.
- **The stack starts detached** (release C, H-P10-1: a usage limit cut the walker's background
  shells, and the stack's API children died with them). Whoever starts it starts it as a detached
  process that outlives the starting shell (a Node `spawn` with `detached: true` and `unref()`, or
  `setsid -f` in WSL), with its pid file in the current walk part's folder, so a later session can
  find and stop it.
- **A row names the account state its expected result rests on** (which payments provider is
  active, the plan, a connection, a sandbox item), and the walk reads that state before the row
  runs. A release B row expected one QA business to sell through Square in the same session that
  used its Stripe, which one provider at a time makes impossible (walk coverage review B1).
- **A brief quotes a control or dialog label only as the screen prints it** (release B, L-B-30),
  read at the walk's head from the screen or its code, never from memory or another dialog: a brief
  asked the walker to press "Close and lose them" on a dialog whose button reads "Leave without
  saving".
- **The walker has no Sentry tool** (L-B-30). Never brief `vivreal-product:qa-walker` to read
  Sentry; the main thread reads each project the walk touched for the walk's window (below), and
  the walk report says it did not.
- **A copy row that names a control is checked on the screen where the copy shows** (release B,
  L-B-15). Its expected result names the control as THAT screen labels it, and where it sits, read
  at the walk's head, never from the form where the control is first named: release B's sales-tax
  line said "Choose Connect with Stripe above" on a board whose only Stripe sign-in control reads
  "Switch to signing in with Stripe", below it, and the plan's STOP check had compared the words
  with the connect form. A row whose evidence is a test names the deployed handler its mock was
  built from (`vivreal-workflow:shared-standards`, Testing rules): a mock in the wrong shape is how
  "Create my site" read as tested while it failed.
- **From the walk's start to its end marker, the next slot that frees is held for its fixes,**
  never given to side work (section 2, item 5); the walk itself never waits for it.
- **Watch the defects file, keep the machine awake, and clean up after the walk**: the steps are
  `references/walks.md` (the defects watch and its re-arm, done files, helpers and watch pipes, the
  keep-awake, the restart handshake). Read it before arming the first watch.
- **Keep the walk's known errors off the Sentry quota:** add the project's IP inbound filter for
  the walk machine before the walk, and remove it after.
- **Warn the owners before a walk's refusal and membership rows, and read Sentry right after**
  (release B, L-B-18). The IP filter stops only the walk browser's own events; a refusal by design
  (a removed member's open session, a view-only member on an owner screen) or a real bug is logged
  by the backend, files a NEW issue and pages the owners (P-sentry-warn): three Secure issues came
  from one day's walks unannounced. Before the walk GO, name those rows to the owners; after the
  walk's end marker, list the issues first seen in its window per project the walk touched, tie
  each to its row, and resolve the test-caused ones with that reason (P-sentry-clean).

## 5a. Deploy day

Read `references/deploy-day.md` before the first lane starts (release C, L-C-25 to L-C-33): watch the
run record by its line count, one heavy WSL build at a time across lanes, keep the machine awake from
the first deploy to the last lane's end, no shared lock held across another lane's wait, bounded lane
dispatches with `HANDOFF` lines, ghost runs listed and watched, an alarm paused only between two
verifier runs, and no site deleted while its deploy runs.

## 6. Records

- **Release state** (P-release-state): `progress.md` on the branch the live value `release-state`
  names, with a `## Lessons` list. Pull before you write it and push right after; both owners'
  sessions write it. Keep a checkpoint current so a lost session costs a status check, not work.
- **The sheet** (P-sheet): one owner runs a release, the live value `release` names who; the
  Assigned to column claims everything else, and a name goes in BEFORE work on a row starts.
  Only a main thread writes the sheet, never a subagent. Re-read the cells before every write.
  Update it with every batch state change, in the same pass as `progress.md`. Recipes, columns
  and vocabularies: `references/sheet.md`. For a large refresh, dispatch
  `vivreal-workflow:ledger-keeper` in its SHEET-PREP mode (release C, L-C-16): it reads the sheet
  and the records and returns an edit list, which the main thread re-reads against the cells and
  applies itself.
- **An agent's STOP is recorded the same hour.** When a release-path agent reports STOP (a kit
  stager's `STOPPED at step <k>`, a release engineer's STOP line), write it into the release's
  `progress.md` with its reason within the hour, before deciding the next step (release C,
  `design-fl10-placement.md` section 5).
- **Backlog rows lag the release plan.** Before triaging the backlog or dispatching a fix from it,
  search the latest release plans for the item id; a row is not ticked when a release ships it.

## 7. Resume

- Sweep for orphans first (`vivreal-workflow:fleet-concurrency`).
- **A worktree a cut-off agent used is swept before anyone touches it** (release C, L-C-05). A
  usage limit left one agent's shell running for hours, blocked on input in front of a scripted
  file edit, in a worktree another agent then reviewed and approved. Before you resume that agent,
  or dispatch a review or a merge of that worktree, list the processes whose command line names the
  worktree (fleet-concurrency, "Sweep for orphans"), stop them, and check the worktree is clean at
  its expected head (`git -C <worktree> status --porcelain` prints nothing and
  `git -C <worktree> rev-parse HEAD` is the head the agent reported).
- **A "stalled" notice describes the output stream, not the process.** Before relaunching, check
  the agent list and the agent's working directory for new writes; a relaunch beside a live
  agent in the same directory races it toward the same irreversible step.
- **Resume a rate-limited agent with SendMessage**, never a duplicate dispatch, and count it first:
  a resumed agent takes a slot (section 2). An agent cut off
  by a usage limit while the live `model` changed is re-dispatched fresh on the current model from
  its progress file (P-model).
- **"Completed" with no final report is a stall, not done** (release B, L-B-43). A coder whose two
  full-suite runs hung sat "waiting on background work" while the agent list showed it completed.
  Treat any agent the list shows completed without its final report as stalled: check its runs
  (the processes it started, its newest writes and logs), stop a hung run, and resume it with
  SendMessage to finish and report (it takes a slot, section 2). Its piece is not done until the
  report is in.
- **A resumed or running release engineer only narrows.** After a STOP, resume it with SendMessage
  only for read-only follow-ups (a proof, a record, a read the STOP asks for). Any new production
  write after a STOP (a merge, a fix-forward PR, a deploy, a promote) is a FRESH dispatch whose first
  prompt quotes every GO it relies on verbatim (P-go-form), including the GOs of the first
  dispatch; a release engineer declines a write asked for in a resume message, rightly.
- **The same holds while it runs** (release B, L-B-24). A GO that widens a RUNNING release
  engineer's timing, scope or proof (a waived gate, a dropped watch) is never sent by message: it
  declines it and stops. Ask it to stop at a safe point (or let it reach one), then make a fresh
  RUNBOOK dispatch quoting every GO. On release B's deploy day two widening GOs sent mid-run were
  declined and cost about 20 minutes before any write.
- **Narrowing by message works, and so do hold files** (L-B-35). "Stop after FIN-D7" sent by
  SendMessage was accepted. A main-thread step between two runbook steps (a one-shot, a data fix)
  is a hold: the dispatch names a marker file the engineer waits on before the next step, and the
  main thread writes the done marker when its own step has ended and been checked.

## 8. Close-out

- Ship first (P-ship-first): once shipping, an unapproved repo gets exactly its reviewer's
  blockers fixed; an approved repo is not reopened for notes; new non-blocking finds go to the
  backlog with their evidence.
- The post-release list (`post-release-list.json`) has three groups that keep what the release
  changed true, beside the release's own rows:
  - **Docs** (`DOC:` rows, P-post-release-docs): every dev doc the release made untrue, by
    `vivreal-workflow:system-doc-writer`. Dispatch it after the last deploy and the last hq merge,
    with a time budget in the brief. It regenerates the generated tables (fleet-ops
    `inventory:connections` and `inventory:dependencies`) ONCE, as its last step; never ask for a
    re-run mid-pass, and never forward another agent's regenerated tables as a trigger (they are a
    cross-check). Release C's pass ran three regenerations of over 20 minutes each and took close to
    three hours (L-C-38).
  - **Skills** (`SK:` rows, P-post-release-skills): re-sync the skills and tighten agents from the
    release's slips; skills changes are reviewed on a local branch and pushed as one PR only when
    ready to merge (P-skills-push-after-review).
  - **Help and marketing** (`HELP:` rows, one per page of either kind, P-post-release-help as
    amended by HELP-MKT-IN-PLAN): only the publish, after the deploy; the drafting, publish and
    same-day defects triage steps are `references/help-and-marketing.md`.
- Drain the `## Lessons` list (section 9): the release is not closed while a row is `owed`.
- Each owner runs `node "$VIVREAL_REPOS/_wt/hq-main/packages/fleet-ops/agent-usage/memory-audit.js" --count`
  on their own machine; the target is `memory-only=0 broken=0`.

## 9. Where a lesson goes (in the session it is learned)

1. **Classify it:** an owner rule (P), a repo trap or fact (T), an agent behaviour (A), a
   main-thread playbook step (O), a run note, session state (S) or something personal (U).
2. **Send it home now,** by a reviewed PR (for vivreal-skills, the current batch's PR): an owner rule to hq `docs/standards/process.md` and
   `INDEX.md`; a trap to its vivreal-skills knowledge skill, `shared-standards` or the anti-pattern
   catalog; agent behaviour to that agent's definition; a playbook step to this skill (skills
   changes go on the current batch's local branch, take a definition review, and ship in that batch's
   one PR, pushed only when ready to merge, P-skills-push-after-review). A run note goes to hq
   `docs/agent-notes/<agent>.md` with the next records write.
3. **When a PR cannot run now** (ship first, a full cap, a release step waiting), append a row to
   the current release's `## Lessons` list in `docs/projects/next-release-<X>/progress.md`:
   `| L-<release>-<nn> | <P/T/A/O/run note> | <one line> | <home file> | <owed / PR #n / merged <sha7> / dropped: why> | <ISO time> |`
4. **The post-release passes drain it:** P rows and run notes into the Docs group (`DOC:` rows),
   T, A and O rows into the Skills group (`SK:` rows) of `post-release-list.json`.
5. **Private memory keeps a pointer, never the only copy.** When Claude Code saves a memory note,
   give it a `shared:` field in its frontmatter: `hq:<path>#<P-id>`, `skills:<path>`, `hq:<path>`,
   `lessons:<release>/<L-id>`, `none (personal)` or `none (session)`. No shared file ever cites a
   memory note (the hq standards lint and this repo's check-definitions refuse it).
6. **Agnostic by construction** (P-agnostic): `${VIVREAL_REPOS}` in every path; no machine path,
   user name, private email address or account id in a shared file.

## 10. Flipping a live value

**The owner's words take effect in this session at once; the commit carries them to every other
session.** Only a key in `live-values.md`, and only on an owner's words taken per P-go-form. It is
the one exception to P-review-every-change: a direct one-line commit to hq `main`. Run it in a kept
hq worktree at `origin/main`, never an owner's checkout. Nothing to install: the lint and its tests
have no dependencies.

```bash
export MSYS_NO_PATHCONV=1
W="$VIVREAL_REPOS/_wt/hq-live-values"
test -e "$W/.git" || git -C "$VIVREAL_REPOS/_wt/hq-main" worktree add --detach "$W" origin/main
# One chain: a dirty worktree stops it here, before the checkout can carry the edit along.
test -z "$(git -C "$W" status --porcelain)" && cd "$W" && git fetch origin && git checkout --detach origin/main
# Edit the ONE line of that key inside the live-values markers, keeping `- <key>: <value> | <source>`.
npm run standards:lint
node --test "packages/fleet-ops/standards-lint/test/**/*.test.js"
git diff --numstat origin/main
```

**The worktree starts clean.** The `status --porcelain` chain exits non-zero when `$W` holds any
change, and also when its `git fetch` or its `git checkout` fails. Tell which by running
`git -C "$W" status --porcelain` on its own:
- **It prints anything:** the worktree is dirty (another session's flip in flight, or a STOP that
  was never restored). STOP there, leave the file alone (P-shared-checkout), and tell the owner what
  it printed.
- **It prints nothing:** the fetch or the checkout failed. Read that command's own error (no
  network, or a lock another git process holds, which you wait out and never delete), then run the
  chain again; never edit until it exits 0.

The last command must print exactly one line, `1<TAB>1<TAB>docs/standards/live-values.md`.
**STOP on a non-zero exit or any other diff output, and do not commit:** tell the owner which check
failed. This session keeps the new value meanwhile. Then restore the file you edited,
`git -C "$W" checkout -- docs/standards/live-values.md`, and confirm `git -C "$W" status --porcelain`
prints nothing, so the kept worktree does not block the next flip; only the session that made the
edit restores it (P-shared-checkout). Otherwise commit with the subject
`live-values: <key> <new value>` and the body `Owner: "<exact words>", <Justin|Hunter>, <ISO time>`,
push with `git push origin HEAD:main`, and prove it: `git ls-remote origin refs/heads/main` equals
`git rev-parse HEAD`. A rejected push: fetch, check out `origin/main` again, re-apply the line,
re-run the three checks, never force. The standards-lint workflow then runs on the push; a red run
is reverted by the same recipe. No `npm test` and no `npm ci`: a one-line edit inside the live
block can change only what the lint checks (P-one-suite), and the three checks take seconds, so
they hold no heavy-run slot.
