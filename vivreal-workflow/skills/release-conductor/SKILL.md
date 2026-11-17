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
3. **Never stop a running agent to make room** (P-cap).

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
- **Content adds go through the product's own screens** (owner, 2026-11-17). A new help page, a
  blog post or a collection item is added in Studio or the portal's content editor by an agent
  acting as an owner would, signed in as `vivreal-knowledge:vivreal-accounts-and-writes` says, under
  the owner's GO quoted in its dispatch; for a help or vivreal.io page that agent is
  `vivreal-content:help-page-producer`. Brief a one-off database script
  (`vivreal-workflow:ops-one-shot`) only for a step those screens cannot do, and name that step and
  why in the brief.
- **Every WSL step in a brief starts by changing into the worktree** inside one quoted command,
  `wsl bash -c 'cd /mnt/<drive>/<clones>/_wt/<worktree> && <command>'`. A bare `wsl ...` runs in
  the folder the Bash call reset to, which is often an owner's own checkout.

## 4. Owners

- **An owner is Justin or Hunter**; either may give any GO (P-owners). **Collecting a GO**
  (P-go-form): ask "Who is giving this go, Justin or Hunter?" in the same question, never infer it
  from an account email or git config; run `date -u +%Y-%m-%dT%H:%M:%SZ` right after the answer;
  quote `GO: "<exact words>" from <Justin|Hunter>, <ISO time>, <source>` in the FIRST prompt of
  the dispatch. For a portal release, ask for the walk sign-off on the exact head in the same
  question.
- **One GO runs the whole remaining runbook** (P-blanket-go): dispatch the release engineer once
  in RUNBOOK mode with every remaining step and that GO quoted once; no per-step check-ins.
- **An owner-gated command** (a deploy-role change set, a typed confirmation) wants the owner's
  approval, not their typing: re-check its shape, then run it yourself (P-owner-gated-yourself).
- Warn the owners before any Sentry test event (P-sentry-warn). Report unusual CI, build or agent
  spend the first time it shows (P-flag-cost). In a live support chat, type the reply and never
  press send (P-chat-drafts). No added WAF spend (P-no-waf-cost). No new QA users or businesses
  (P-no-new-qa-users).

## 5. Walks

- **A reviewed walk plan first** (P-walk-plan): every change in the release maps to a row with
  preconditions, steps, the expected result, a REFUSE check and the view, and every blocker is
  cleared before the walk GO. Walk the exact flows before any recording (P-walk-before-footage).
- **Watch the defects file, do not wait for messages.** `vivreal-product:qa-walker` has no
  SendMessage, so never ask it to message the main thread. At walk start, arm Monitor on its live
  defects file, `tail -n 0 -F <walk>-defects.md | grep --line-buffered "^## "`, and route each
  defect as it lands (section 3).
- **Keep the walk machine awake** until the walk's end marker (a sleeping machine looks like a
  stalled walk), and say so in the walk report.
- **Keep the walk's known errors off the Sentry quota:** add the project's IP inbound filter for
  the walk machine before the walk, and remove it after.

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
S=$(git -C "$W" status --porcelain) && test -z "$S"   # must exit 0: the worktree starts clean
cd "$W" && git fetch origin && git checkout --detach origin/main
# Edit the ONE line of that key inside the live-values markers, keeping `- <key>: <value> | <source>`.
npm run standards:lint
node --test "packages/fleet-ops/standards-lint/test/**/*.test.js"
git diff --numstat origin/main
```

**The worktree starts clean.** The `status --porcelain` line exits non-zero when `$W` holds any
change: another session's flip in flight, or a STOP that was never restored. STOP there, leave
the file alone (P-shared-checkout), and tell the owner what `git -C "$W" status --porcelain` printed.

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
