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
   git -C "$VIVREAL_REPOS/vivreal-hq" fetch origin
   git -C "$VIVREAL_REPOS/vivreal-hq" show origin/main:docs/standards/live-values.md
   git -C "$VIVREAL_REPOS/vivreal-hq" show origin/main:docs/standards/INDEX.md
   ```
   A line `This checkout cannot load the current rules (...)` means the hq checkout the session
   started in is stale: the `origin/main` index printed under it is the one that holds. A single
   line saying `no rules index could be read` means that hq clone's `origin/main` predates the
   shared rules and no rule was printed: run the fetch it names, then the two `show` commands above.
2. **Read the release state** on the branch the live value `release-state` names, never on `main`:
   fetch, then read `docs/projects/next-release-<X>/progress.md` at `origin/<that branch>`.
3. **Open the sheet** (section 6, `references/sheet.md`) and see what is claimed in Assigned to.
4. **Read `vivreal-workflow:fleet-concurrency`** for the machine-side limits (ports, gates, stash,
   scratchpad, the orphan sweep).

## 1a. The shape of a release: one deployment per repo (P-one-promote, amended 2026-11-18)

The owners' rule (hq `docs/standards/process.md`, P-one-promote, amended 2026-11-18, from release C
on): "it should be one deployment per repo per release, we validate everything locally and once
validate then we deploy". Release B staged repos across tiers, follow-up promotes and day gates,
and that is now the exception an owner must approve, never the plan's default.

1. **Every repo deploys ONCE per release.** Everything a repo needs in the release is built into its
   one batch, one PR: features, fixes, a runtime move, alarm actions, a help or site move, IAM
   conditions. A find mid-batch joins that repo's PR as another commit.
2. **Validate the whole batch end to end on the local stack once** (P-local-validate), on the runtime
   it will deploy on (a runtime move is validated on the new runtime locally, not proven by a tier in
   production).
3. **Then deploy the backends back to back**, each proven live (`vivreal-infra:vivreal-deploy-proof`)
   and watched for 1 hour before the next, **the portal last** (P-api-first).
4. **A timed soak that must stay is a flip, not a deployment.** A watch-only or shadow mode, an
   allowlist, a rate limit's mode: ship it in the one deploy behind a parameter or data value, and
   turn it on later with a parameter or data flip. Never a second promote to flip an alarm or a mode.
5. **An alarm is created with its actions on when nothing can breach before its soak ends.** No
   follow-up promote flips an alarm's actions. An alarm that could page at its own creation (an
   absence alarm with no datapoint yet) is a design question the plan answers without a second
   deployment, or an owner exception in `decisions.md` (`vivreal-infra:vivreal-observability`).
6. **Check every plan before you run it:** its table of deployments per repo says 1 for every repo.
   More than 1 for any repo needs an owner's exception recorded in hq `decisions.md`; without it,
   send the plan back (the reviewer FAILs it too).

## 2. Slots: the check before every dispatch

The cap and its counting rule are P-cap (the live value `agent-cap`, per machine): count every
running coder, reviewer, researcher, walker, publisher, ledger agent and plan-editing agent, and
any agent whose own background run is still going. A granted extra slot replaces a freed one, it
never stacks. A lowered cap never stops a running agent; it applies to the next dispatch. Heavy
local runs have their own limit (P-heavy-runs), whatever the agent count.

**The slot check (P-release-focus), in the session of the owner who runs the current release**
(the live value `release` names who). Before any dispatch that is not on the release's path:

1. **Is a step on the release path ready with no running agent on it?** A step is a build, a
   review, a fix, a walk, a release step, or a precondition of one. If yes, that step takes this
   slot, and the side work waits.
2. **Does every path step wait on an owner?** Then ask that owner for the GO now (section 4),
   in the same turn. While you wait, a free slot may take side work: no slot is held empty for the
   path. The moment a path step can start, it takes the next free slot.
3. **Does a path step wait on another running agent** (the live walk that follows a release
   engineer's ship, say)? Hold no slot for it either: it takes that agent's slot when the agent
   finishes, and the free slot runs post-release work now.
4. **Never stop a running agent to make room** (P-cap).

Side work, in order (P-idle-slots): the current release's post-release list, then research and
planning for the next release. A repo already in flight runs to approval before any new repo
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
- **Content adds go through the product's own screens** (P-content-through-ui). A new help page, a
  blog post or a collection item is added in Studio or the portal's content editor by an agent
  acting as an owner would, signed in as `vivreal-knowledge:vivreal-accounts-and-writes` says, under
  the owner's GO quoted in its dispatch; for a help or vivreal.io page that agent is
  `vivreal-content:help-page-producer`. Brief a one-off database script
  (`vivreal-workflow:ops-one-shot`) only for a step those screens cannot do, and name that step and
  why in the brief.
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

- **An owner is Justin or Hunter**; either may give any GO (P-owners). **Collecting a GO**
  (P-go-form): ask "Who is giving this go, Justin or Hunter?" in the same question, never infer it
  from an account email or git config; run `date -u +%Y-%m-%dT%H:%M:%SZ` right after the answer;
  quote `GO: "<exact words>" from <Justin|Hunter>, <ISO time>, <source>` in the FIRST prompt of
  the dispatch. For a portal release, ask for the walk sign-off on the exact head in the same
  question.
- **A blocking question stalls everything behind it, so at night only release-path questions go
  in a dialog** (release B main thread, 2026-11-18). A dialog the owner has not answered holds every
  other action of the session, including the free slots' work. When an owner may be away, ask in a
  dialog only for what the release path needs next (a GO, a STOP decision); put every other question
  (backlog placement, wording, next-release scope) in the session's report or the release state, and
  keep the slots working while it waits.
- **One GO runs the whole remaining runbook** (P-blanket-go): dispatch the release engineer once
  in RUNBOOK mode with every remaining step and that GO quoted once; no per-step check-ins.
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
- **A copy row that names a control is checked on the screen where the copy shows** (release B,
  L-B-15). Its expected result names the control as THAT screen labels it, and where it sits, read
  at the walk's head, never from the form where the control is first named: release B's sales-tax
  line said "Choose Connect with Stripe above" on a board whose only Stripe sign-in control reads
  "Switch to signing in with Stripe", below it, and the plan's STOP check had compared the words
  with the connect form. A row whose evidence is a test names the deployed handler its mock was
  built from (`vivreal-workflow:shared-standards`, Testing rules): a mock in the wrong shape is how
  "Create my site" read as tested while it failed.
- **Watch the defects file, do not wait for messages.** `vivreal-product:qa-walker` has no
  SendMessage, so never ask it to message the main thread. At walk start, arm Monitor on its live
  defects file, `tail -n 0 -F <walk>-defects.md | grep --line-buffered "^## "`, and route each
  defect as it lands (section 3).
- **Keep the walk machine awake** until the walk's end marker (a sleeping machine looks like a
  stalled walk), and say so in the walk report.
- **Keep the walk's known errors off the Sentry quota:** add the project's IP inbound filter for
  the walk machine before the walk, and remove it after.
- **Warn the owners before a walk's refusal and membership rows, and read Sentry right after**
  (release B, L-B-18). The IP filter stops only the walk browser's own events; a refusal by design
  (a removed member's open session, a view-only member on an owner screen) or a real bug is logged
  by the backend, files a NEW issue and pages the owners (P-sentry-warn): three Secure issues came
  from one day's walks unannounced. Before the walk GO, name those rows to the owners; after the
  walk's end marker, list the issues first seen in its window per project the walk touched, tie
  each to its row, and resolve the test-caused ones with that reason (P-sentry-clean).

## 6. Records

- **Release state** (P-release-state): `progress.md` on the branch the live value `release-state`
  names, with a `## Lessons` list. Pull before you write it and push right after; both owners'
  sessions write it. Keep a checkpoint current so a lost session costs a status check, not work.
- **The sheet** (P-sheet): one owner runs a release, the live value `release` names who; the
  Assigned to column claims everything else, and a name goes in BEFORE work on a row starts.
  Only a main thread writes the sheet, never a subagent. Re-read the cells before every write.
  Update it with every batch state change, in the same pass as `progress.md`. Recipes, columns
  and vocabularies: `references/sheet.md`.
- **Backlog rows lag the release plan.** Before triaging the backlog or dispatching a fix from it,
  search the latest release plans for the item id; a row is not ticked when a release ships it.

## 7. Resume

- Sweep for orphans first (`vivreal-workflow:fleet-concurrency`).
- **A "stalled" notice describes the output stream, not the process.** Before relaunching, check
  the agent list and the agent's working directory for new writes; a relaunch beside a live
  agent in the same directory races it toward the same irreversible step.
- **Resume a rate-limited agent with SendMessage**, never a duplicate dispatch. An agent cut off
  by a usage limit while the live `model` changed is re-dispatched fresh on the current model from
  its progress file (P-model).
- **A resumed release engineer only narrows.** After a STOP, resume it with SendMessage only for
  read-only follow-ups (a proof, a record, a read the STOP asks for). Any new production write
  after a STOP (a merge, a fix-forward PR, a deploy, a promote) is a FRESH dispatch whose first
  prompt quotes every GO it relies on verbatim (P-go-form), including the GOs of the first
  dispatch; a release engineer declines a write asked for in a resume message, rightly.

## 8. Close-out

- Ship first (P-ship-first): once shipping, an unapproved repo gets exactly its reviewer's
  blockers fixed; an approved repo is not reopened for notes; new non-blocking finds go to the
  backlog with their evidence.
- The post-release list fixes every dev doc the release made untrue (P-post-release-docs,
  dispatch `vivreal-workflow:system-doc-writer`) and re-syncs the skills and tightens agents from
  the release's slips (P-post-release-skills; skills changes are reviewed on a local branch and
  pushed as one PR only when ready to merge, P-skills-push-after-review).
- Drain the `## Lessons` list (section 9): the release is not closed while a row is `owed`.
- Each owner runs `node "$VIVREAL_REPOS/vivreal-hq/packages/fleet-ops/agent-usage/memory-audit.js" --count`
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
test -e "$W/.git" || git -C "$VIVREAL_REPOS/vivreal-hq" worktree add --detach "$W" origin/main
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
