# Brief — agent-definition-reviewer

- **Filed:** 2026-08-06
- **Workflow:** FEATURE
- **Complexity:** Complex
- **Repo:** `C:\repos\vivreal-skills`
- **Approval gate:** WAIVED by explicit user instruction ("one pass"; "do not stop for
  approval on the placement decision"). Phase 3 auto-approves; `design.md` is still written
  so the reasoning is auditable.

## Verbatim task

Build a new feature in C:\repos\vivreal-skills: a read-only reviewer that validates Claude Code
agent, skill, command, and plugin definitions (the .md/.json files that configure Claude Code
itself) and reports what is wrong with them. It is NOT a code reviewer.

The full spec is already written. Read these three sources before writing anything:

1. The build brief:
   C:\Users\jcecc\OneDrive\Desktop\MiscThings\PROMPT - build the agent-review agent.md
2. The validation kit that is the actual specification (three stages, two target profiles, two run modes, the tagged rule table, the advisory discovery_fit dimension, the Sources table with verification dates):
   C:\Users\jcecc\OneDrive\Desktop\MiscThings\# Local Plugin & Agent Validation K.txt
3. This repo's existing conventions — read vivreal-experts/agents/portal.md and the vivreal-workflow/ agents and commands so the new files match the house style, especially the long, trigger-rich `description` format.

Phase: research first, then design, then implement, then self-review — in one pass. Do not stop for approval on the placement decision; make the call and justify it.

What to build:
- An agent that does the review. Subagent, so file-reading stays out of the caller's context and only the verdict comes back. Tools: Read, Grep, Glob, Bash, WebFetch. Bash is for `claude plugin validate` and for optionally materializing the Stage 1 script; WebFetch is for re-verifying the doc URLs.
- A slash command that dispatches it, taking a target path and defaulting to the current repo.
- A placement decision: new standalone plugin (repo-agnostic Claude Code tooling, unlike everything else here which is Vivreal-specific) vs folding into vivreal-workflow (which already owns the reviewer role agents). Give me the 2 options with their tradeoffs, pick one, justify it in a sentence, and register it in .claude-plugin/marketplace.json if new.

Hard requirements:
- Read-only. It reports findings; it never edits the files it reviews. State that in the DON'Ts the way the other agents in this repo do.
- Mode A (agent-native) is the default: no pip install, no backend, no API key on the normal path. Offer Mode B only for repeatable/CI-shaped runs.
- Detect the target profile FIRST (Profile A = packaged plugin with .claude-plugin/plugin.json; Profile B = bare .claude/ with no manifest) and print it in the header. Getting this wrong is the #1 false-failure mode — it fired four bogus ERRORs against a Profile B repo.
- Do the two things a script cannot, because they found the highest-value defects:
  (a) Resolve every cross-file reference. Count ONLY directory-qualified paths as references; a bare basename in prose (post.md, slides.json) is a mention, not a reference — treating those as references produced a 26-false-positive run.
  (b) Check platform claims against the live docs. Stale platform folklore in agent files silently disables their best path; that is where the worst defect came from.
- Encode judgment as guidance, not as a rigid severity table. Carry forward the `agent-tools-never-available` lesson: it was first written as an ERROR and that was wrong, because the correct fix was documentation, not tool removal. It is now a WARNING that says when to escalate.

Build the evals first, from the real regression corpus. From C:\repos\vivreal-hq, read the "before" files with `git show 29b9404:<path>`. The reviewer must catch all four:
  1. .claude/agents/social-video-director.md — asserts "subagents cannot spawn subagents". False; the limit is three layers below the main conversation. HIGH: a false platform claim that disabled the primary path.
  2. .claude/agents/prompt.md — lists AskUserQuestion in `tools`; that tool is stripped from every subagent, foreground and background. WARNING that escalates (legitimate only if a main-thread path is documented, which it was not at that commit).
  3. .claude/agents/content-creator/README.md — a .md with no frontmatter inside the recursively-scanned agents/ tree; fails to load and errors at every session start. WARNING.
  4. .claude/agents/runner.md — no output contract, so callers cannot rely on what returns. WARNING.
Two negative cases it must NOT flag: current vivreal-hq main is clean (0 errors repo-wide; the seven content agents and seven commands return 0 errors / 0 warnings, and prompt.md's remaining AskUserQuestion warning is now correct because the main-thread requirement is documented at the top of the file — do not re-flag it as a blocker); and .claude/agents/content-creator/README.txt is deliberately .txt — do not flag it.

Writing the definition itself: put the best signal early (judges and readers truncate long files); lead with guardrails and one complete, short, file:line-cited example of input → actions → output; state the output format, scope boundaries, and MUST / MUST NOT explicitly; write the `description` for the router, not the reader — third person, primary use case first, with an explicit boundary against the sibling reviewers it could be confused with.

Before you trust the kit: its rules were verified 2026-08-06. Re-fetch https://code.claude.com/docs/en/sub-agents and https://code.claude.com/docs/en/plugins-reference and confirm the frontmatter field tables and tool-filter lists still match. If they moved, fix the kit file too and tell me what changed.

Definition of done — do not report done until all of these are shown:
- The agent file, the command file, and the marketplace.json entry exist.
- `claude plugin validate <the new plugin dir> --strict` returns clean, output pasted.
- The reviewer's own Stage 1 rules run against the plugin you just wrote, clean. An agent-validator that fails its own validation is not shippable.
- All four eval cases run against vivreal-hq commit 29b9404 with the verdicts shown, plus the two negative cases confirmed not flagged.
- The placement decision stated with its one-sentence justification.
Also tell me anything in the kit you think is wrong — it is a working document, not scripture.

## Scope IN

- New agent definition that reviews Claude Code agent/skill/command/plugin `.md` + `.json` files.
- New slash command dispatching it, with a target-path argument defaulting to cwd.
- Placement decision (new plugin vs fold into `vivreal-workflow`) + `.claude-plugin/marketplace.json`
  registration if new.
- Eval corpus derived from `vivreal-hq@29b9404` (4 positive cases, 2 negative cases).
- Re-verification of the two Claude Code doc URLs against the kit's 2026-08-06 claims; correct the
  kit file if the docs moved.
- Self-validation: `claude plugin validate --strict` + the reviewer's own Stage 1 rules run against
  the newly written plugin.

## Scope OUT

- Any edit to `C:\repos\vivreal-hq` (it is a read-only regression corpus; `git show` only).
- Any general-purpose code review capability — the subject is Claude Code configuration files only.
- Building/shipping the Mode B Python scripts as a maintained package; they are materialized on
  demand from the kit, not vendored.
- Version bump / release of the marketplace beyond registering the new plugin entry.
- `sync-to-agy.js` generated-skill regeneration unless the placement decision requires it.
