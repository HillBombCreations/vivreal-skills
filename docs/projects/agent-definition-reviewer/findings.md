The harness blocked writing the report file, so I'm returning the full findings inline — the parent agent should persist this to `C:\repos\vivreal-skills\docs\projects\agent-definition-reviewer\findings.md`.

## Direct answers to what you needed immediately

- **One-sentence summary:** The kit is factually accurate (both doc URLs re-verified line-by-line, zero drift), Stage 0 is real, and commit `29b9404` exists — but the kit's single highest-value rule (directory-qualified cross-file references) is **completely absent** from it, and I proved empirically that Stage 1 cannot catch eval case 1 at all, which is precisely why this agent must exist.
- **Artifact path (blocked, needs writing by you):** `C:\repos\vivreal-skills\docs\projects\agent-definition-reviewer\findings.md`
- **Finding count:** 24 (F1–F22 + D1–D11 consolidated as 22 numbered findings + 11 kit defects + 7 open questions)
- **(a) Does `claude plugin validate --strict` exist here?** **YES.** Claude Code `2.1.223`. Help text: `Usage: claude plugin validate [options] <path>` / `--strict  Treat warnings as errors (exit 1).` Stage 0 is **not** built on a false premise.
- **(b) Does commit `29b9404` exist in vivreal-hq?** **YES.** `git cat-file -t` → `commit`; `29b9404043cfb21963e9e03c756e28ef0050a1ad Tue Aug 4 11:57:26 2026 -0700 docs(ring2): log the 2026-08-04 reddit replies, and two process misses`.

---

# Findings — agent-definition-reviewer (Phase 1, Investigation)

- **Slug:** `agent-definition-reviewer` | **Workflow:** FEATURE | **Date:** 2026-08-06
- **Repo under change:** `C:\repos\vivreal-skills`
- **Read-only corpus:** `C:\repos\vivreal-hq` — accessed via `git show` / `git archive` only; never checked out, never edited

## Executive summary

Both blocking questions are YES (above). The kit (1,536 lines / 82,415 bytes) is substantially accurate: I re-fetched both Sources-table URLs and verified the agent frontmatter field table, colour set, model aliases, never-available tool filter, background-tool filter, plugin-ignored-fields rule, and the subagent depth limit — **all match the live docs verbatim**. The 2026-08-06 verification date holds; nothing moved.

The kit's most serious problem is an **omission**. The rule that took a run from 26 false positives to 0 — count only directory-qualified paths as references — **does not appear in the kit at all**. Neither the cross-file-reference check nor the platform-claim check has a rule ID or severity; both exist only as four sentences of Mode A prose (kit:337-346). Everything precise lives in the build brief, not the specification. I proved why that matters: I materialized the kit's own Stage 1 script and ran it against a scratchpad reconstruction of `29b9404`. It catches cases 2, 3, 4 — and is **completely silent on case 1**, the highest-severity defect.

Two further empirical findings reshape Phase 2. First, **`vivreal-workflow` currently fails `claude plugin validate --strict` with exit 1** (4 skill YAML-parse errors), so folding the agent in makes the brief's "validate --strict returns clean" criterion unachievable without unrelated remediation. Second, the kit's Agency `[policy]` rules default ON and mis-fire here: `readme-exists` fires as a false ERROR on **all 13** plugins (none has a README), and `--author-domain` defaults to `microsoft.com`. Profile A/B is the #1 false-failure the brief names; `[policy]`-on-by-default is #2 and is not in the kit's Gotchas.

Repo hazard the coder must not trip: `sync-to-agy.js` **generates** `skills/<name>/SKILL.md` as byte-identical copies of every `agents/*.md` and `skills/cmd-<name>/SKILL.md` from every `commands/*.md`. Editing a generated copy is silently reverted by the next sync.

## Scope covered

Full kit (1,536 lines, end to end); build brief (133 lines); `vivreal-experts/agents/portal.md` (full), `vivreal-workflow/agents/reviewer.md` (full), `principal-reviewer.md` frontmatter, all 30 agent descriptions, 4 command files, 4 `plugin.json`s, full `marketplace.json`, `sync-to-agy.js` (full), `docs/SYNC.md`; tooling checks + a `--strict` sweep across all 13 plugins; all 6 eval cases at both commits with the kit's Stage 1 executed against reconstructions of both trees; live re-verification of both named doc URLs.

## Scope NOT covered

- **The design** — no agent/command/rule set/placement recommendation proposed. F5 and F19 are decision *inputs*, not the decision.
- **Stage 2 (`judge.py`) was not executed.** No backend invoked, no API call, no scores produced. Rubric transcribed and reviewed statically only.
- **The other 5 Sources URLs** (skills, best-practices, engineering post, hooks, `llms.txt`) not re-fetched.
- **The 34 broken skills in OQ-3 were not fixed** — reported only.
- **Nothing under `C:\repos\vivreal-hq` was created, modified, or checked out.** The reconstructed `29b9404` tree lives entirely in session scratchpad.

## Detailed findings

### Tooling reality check

**F1 — `claude plugin validate --strict` EXISTS with exactly the kit's semantics.**
```
$ claude --version
2.1.223 (Claude Code)
$ claude plugin validate --help
Usage: claude plugin validate [options] <path>
Validate a plugin or marketplace manifest
Options:
  -h, --help  Display help for command
  --strict    Treat warnings as errors (exit 1). Use in CI to fail on
              unrecognized fields, missing metadata, and other issues that the
              runtime tolerates.
```
Help text independently confirms kit:176-177. Takes a **positional `<path>`** — kit:1408's invocation form is correct.

**F2 — Python 3.14.0 available; Mode B viable.** `python`/`python3` both at `/c/Users/jcecc/AppData/Local/Python/bin/python`. Exceeds the kit's 3.10+ floor (kit:353). Extracted `structural_check.py` → `py_compile` **OK**, ran successfully 4 times.

**F3 — `validate` also checks marketplace manifests; this repo's is clean.** `claude plugin validate . --strict` → `✔ Validation passed`, true exit `0`.

**F4 — `validate` prints only failures, so a silent pass isn't proof agents were scanned.** `vivreal-experts` (8 agents) printed only the manifest line + pass. `vivreal-workflow` printed `Validating skill:` lines only for the 4 failures, not the ~24 passes. See OQ-2.

**F5 — `vivreal-workflow` currently FAILS `--strict` (true exit 1).** Decision-relevant.
```
$ claude plugin validate ./vivreal-workflow --strict >/dev/null 2>&1; echo $?
1
$ claude plugin validate ./vivreal-ops --strict >/dev/null 2>&1; echo $?
0
```
Cause: 4 skills with unparseable YAML frontmatter. The other 10 plugins pass at exit 0 — a **new** plugin starts from a clean gate.

### Doc re-verification (the brief's "before you trust the kit" task)

**F6 — Both URLs live at their kit-listed addresses; no redirect.**
```
https://code.claude.com/docs/en/sub-agents        → http_code=200 final=<same>
https://code.claude.com/docs/en/plugins-reference → http_code=200 final=<same>
```
`final == input` for both; kit:37-38 need no update.

**F7 — Every checkable `sub-agents` claim matches. No drift.** (fetched `.md` source, 97,090 bytes)

| Kit claim | Kit line | Live doc | Verdict |
|---|---|---|---|
| never-in-subagent: `AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ScheduleWakeup`, `TaskOutput`, `WaitForMcpServers`, `Workflow`; + `ExitPlanMode` unless `permissionMode: plan`; + `Agent` at depth limit | 247 | `sub-agents.md:329-339` — identical set + conditions | **MATCH** |
| background filter keeps exactly `Read, Grep, Glob, Bash, PowerShell, Edit, Write, NotebookEdit, WebFetch, WebSearch, TodoWrite, Skill, ToolSearch, EnterWorktree, ExitWorktree, Monitor, TaskStop, SendMessage, Artifact` + all MCP | 248 | `sub-agents.md:341` — identical 19-tool list | **MATCH** |
| colours `red, blue, green, yellow, purple, orange, pink, cyan` | 245 | `sub-agents.md:296` | **MATCH** |
| models `sonnet, opus, haiku, fable, inherit` or full id; default `inherit` | 244 | `sub-agents.md:286` incl. `fable` | **MATCH** |
| agent frontmatter key set | 249 | `sub-agents.md:223` | **MATCH** (see F8) |
| plugin subagents ignore `hooks`/`mcpServers`/`permissionMode` | 250 | `sub-agents.md:230` | **MATCH** |
| unresolvable `tools` → fails to launch | 246 | `sub-agents.md:284, 367` | **MATCH w/ hedge** (F9) |
| depth limit three layers | implied 247 | `sub-agents.md:867`: "up to three layers below the main conversation" | **MATCH** — ground truth for case 1 |

**F8 — One benign delta.** `sub-agents.md:223` describes the `--agents` **JSON flag**, so it includes `prompt` and omits `name`. For file-based agents the body *is* the prompt and `name` is real. The kit's `AGENT_FIELDS` (kit:249, 366-370) is correct for file-based. **No kit change needed** — but a validator must not accept `prompt` nor reject `name`.

**F9 — `agent-tools-resolve` as absolute ERROR is slightly stronger than the doc.** Doc hedges twice: "**usually** fails to launch" (:284) and "**Before v2.1.208**, that subagent launched with no tools" (:367). We're on 2.1.223, so ERROR is right *today*; the kit states it as timeless.

**F10 — Every checkable `plugins-reference` claim matches. No drift.** (91,661 bytes)

| Kit claim | Kit line | Live doc | Verdict |
|---|---|---|---|
| `name` is the **only** required manifest field | 202 | `:461` "If you include a manifest, `name` is the only required field." | **MATCH** |
| unrecognized fields = warnings, still loads | 173-175, 209 | `:479-481` | **MATCH** |
| type errors are load errors **except** `experimental`/`metadata` (warn) | 174-175 | `:486-487` | **MATCH** |
| `--strict` promotes warnings | 176 | `:489, 494` | **MATCH** |
| documented manifest key set | 209 | `:502-540` | **MATCH** |
| validate covers plugin.json + skill/agent/command frontmatter + hooks.json | 167 | `:1196` | **MATCH** |
| marketplace entry may use a different name | 204 | `:465` | **MATCH** — and why `manifest-name-match` as ERROR is wrong (D4) |

**Conclusion: the kit needs no factual correction from these two URLs.** Its defects are structural/editorial, not stale facts.

### The three stages and two modes

**F11 — Stage boundaries** (kit:83-92, 116-120):

| Stage | What | Blocking | Profile | Pass bar |
|---|---|---|---|---|
| **0** | `claude plugin validate <dir> --strict` — "authoritative... the same code that loads the plugin at runtime" (kit:89-90). Covers `plugin.json`, skill/agent/command frontmatter, `hooks/hooks.json`. | Yes | **A only** | clean |
| **1** | Deterministic rules, no LLM. Adds Agency policy + content-depth rules Stage 0 doesn't know; **the only option for Profile B** (kit:91-92, 179-181). | Yes | A+B | **0 errors** |
| **2** | LLM-as-judge. "Directional" — doesn't replicate upstream's 48-chunk holistic reconciliation; absolute number can differ from CI "by roughly a point" (kit:147-151). | Yes, directional | A+B | **avg >= 3.0/5.0** |

Kit:179-181 is explicit that Stage 0 has **no Profile B equivalent** — frontmatter errors "surface only in the debug log at session start". Confirmed as a real hole (D5).

**F12 — Mode A vs B, and where the scripts live.**
- **Mode A (agent-native, THE DEFAULT per brief)** — kit:96-106. Zero dependencies. Kit:105-106 argues it's *better* than Mode B for Stage 1 "because you can resolve cross-file references... that a regex cannot".
- **Mode B (scripted)** — kit:108-112. Stage 1 = Python 3.10+ stdlib; Stage 2 adds a chat backend.

| Script | Kit line range | Length | Notes |
|---|---|---|---|
| `structural_check.py` | **kit:356-777** (fence opens 355, closes 778) | 422 lines | Pure stdlib. Extracts cleanly via `sed -n '356,777p'`; compiles; runs. |
| `judge.py` | **kit:949-1325** (fence opens 948, closes 1326) | 377 lines | `ollama/openai/azure/github` stdlib; `anthropic` needs `pip install anthropic`, lazily imported. |

`structural_check.py` sub-landmarks: constants 365-407; `split_frontmatter()` 410-440; `git_ignored()` 455-463; `check()` 466-749 (profile detect 471-479, manifest 481-511, authors 518-551, README 553-559, agents 561-630, skills 632-699, commands 701-715, hooks 717-731, empty dirs 733-737, secrets 739-747); `main()` 752-777.
`judge.py`: `SYSTEM_PROMPT` 966-982; `CRITERIA` 984-1019; `ADVISORY` 1021-1029; `RESPONSE_FORMAT` 1031-1035; `RESPONSE_SCHEMA` 1040-1072; `collect()` 1086-1114; `call_anthropic()` 1126-1151; `judge_once()` 1182-1216; `main()` 1236-1321.

**F13 — Profile detection + the four Profile-A-only rules that mis-fired.** Rule (kit:75-77, code 471-479):
> **Profile A** if `<target>/.claude-plugin/plugin.json` exists. **Otherwise Profile B**, rooted at whichever of `<target>/.claude/` or `<target>/` contains `agents/`, `skills/`, or `commands/`.

Code falls back to `<target>/.claude` only when `<target>` itself has no `agents|skills|commands` dir (kit:476-479). Confirmed: running against `C:\repos\vivreal-hq` printed `[profile B]` and resolved `agents\prompt.md`.

Kit:1456-1458: "produces **four or five bogus ERRORs** (missing manifest, missing README, missing authors)." The Profile-A-only **ERROR** rules — exactly the mis-firers — are:
1. `manifest-exists` [policy]
2. `manifest-field-<f>` [policy] (`description`/`version`/`author` — one or three depending on granularity, hence "four **or five**")
3. `manifest-author-emails` [policy]
4. `readme-exists` [policy]

All four are `[policy]`; **none is `[spec]`**. Also Profile-A-only but non-ERROR: `manifest-valid-json`, `manifest-field-name`, `manifest-name-match`, `manifest-name-kebab`, `manifest-version-semver`, `manifest-description-length`, `manifest-homepage`, `manifest-unknown-field`, `agency-valid-json`, `agency-valid-engine`, `readme-length`, `agent-plugin-ignored-field`.
**Every Profile-A-only ERROR rule is an Agency policy rule** — the cleanest possible guard predicate.

**F14 — Stage 2: 7 scored dimensions + 1 advisory** (kit:826-902).
Scored: `instruction_clarity`, `behavioral_completeness`, `example_quality`, `safety_and_guardrails`, `user_experience`, `robustness`, and `script_quality` — the last **only if** the target ships `.ps1/.sh/.py/.js/.ts` (kit:828-829), so the normal case is 6.
**Pass = average >= 3.0/5.0** (kit:120, 925). Must average **raw per-part means**; rounding each dimension to an integer first "can flip a 2.98 to a 3.00 or the reverse" (kit:927-929).
Advisory: **`discovery_fit`** (kit:884-902) — **excluded from the pass average and the pass/fail decision** because it's not in the upstream rubric (kit:886-887); reported separately. Kit:889-891 calls it "the single most common real defect in shipped agents and skills: a component that is well written and never triggers."
Anchors (kit:816-817): `hello-skills` ~2, `deep-review` ~4-5. Bias controls (kit:811-814): ANTI-VERBOSITY ("a concise clear file MUST score >= a long vague one"), ANTI-POSITION, ANTI-SELF-ENHANCEMENT. Response format (kit:907-914): raw JSON only, all scored dimensions, integer 1-5, rationale 1-2 sentences, summary 2-3 sentences, **exactly 3** improvements.
**Load-bearing for this build:** `safety_and_guardrails` caps at 2 when "safety is incidental (inherently read-only/trivial), not deliberate" (kit:857). This agent *is* read-only, so its guardrails must be deliberate and explicit to score above 2.

**F15 — Stage 1 output & exit contract** (kit:322-327). Header `PASS|FAIL  <name>  [profile <A|B>]  (<E> errors, <W> warnings)`; then `x [id] message` / `! [id] message`; `No issues found.` if clean; ending `Stage 1: errors=<E> warnings=<W> passed=<bool>`. Exit `0` if no errors else `1`. My runs reproduce this exactly.

### Repo conventions

**F16 — `sync-to-agy.js` GENERATES skills. Editing a generated copy is a mistake.**
`sync-to-agy.js:34-48` writes every `agents/*.md` verbatim to `skills/<stem>/SKILL.md`; `:54-69` writes every `commands/*.md` verbatim to `skills/cmd-<stem>/SKILL.md`. `fs.writeFileSync` with **unmodified** source — no transform. Verified:
```
$ diff vivreal-workflow/agents/reviewer.md   vivreal-workflow/skills/reviewer/SKILL.md      → IDENTICAL
$ diff vivreal-workflow/commands/reviewer.md vivreal-workflow/skills/cmd-reviewer/SKILL.md  → IDENTICAL
```
Consequences:
- Of `vivreal-workflow/skills/`' 28 dirs, **23 are generated** (8 agent + 15 `cmd-*` mirrors). Only 5 are source: `shared-standards`, `vivreal-brainstorming`, `vivreal-package-update`, `vivreal-subagent-driven`, `vivreal-writing-plans`.
- Generated copies are **committed to git** and carry **no "generated" marker**.
- **`agents/` is read non-recursively** (`fs.readdirSync`, `:35`) — a subdirectory agent is silently not mirrored. Claude Code *does* scan recursively (kit:234-235); the two disagree.
- Exclusion hook exists: `const EXCLUDED_COMMANDS = new Set(['promptify'])` (`:53`).

**F17 — A new plugin MUST be in `marketplace.json` or `sync-to-agy.js` ignores it entirely.**
`:19` iterates `marketplace.plugins.forEach(...)` resolving `plugin.source`. A plugin dir on disk but absent from `marketplace.json` is never visited. **`marketplace.json` is the single registration point — there is no separate list in the script.** Entry shape is exactly 3 keys (`marketplace.json:12-16`):
```json
{ "name": "vivreal-principal", "source": "./vivreal-principal", "description": "Repo-agnostic principal-level agents: ... Auto-dispatched for design+build, audits, refactors, code review, and GTM analysis in any repository." }
```
File also has top-level `name`, `owner {name,email}`, `metadata {description, version}` (currently `1.10.0`). 13 plugins registered.

**F18 — `plugin.json` shape.** Consistent: `name`, `version`, `description`, `author {name: "Vivreal", email: "justin@vivreal.io"}`, `homepage: "https://github.com/HillBombCreations/vivreal-skills"`, `keywords[]`. **No plugin has a `README.md`** — verified across all 13, so `readme-exists` is guaranteed to mis-fire (D3). Hooks shape (`vivreal-proxy-factory/hooks/hooks.json`): top-level `description` + `hooks.PreToolUse[].matcher`/`.hooks[].command`, using `node "${CLAUDE_PLUGIN_ROOT}/hooks/proxy-route-guard.cjs"` — matching kit:303's `${CLAUDE_PLUGIN_ROOT}`-stripping rule.

**F19 — House `description:` style, with a template.** Measured all 30:

| Family | Range | Shape |
|---|---|---|
| Workflow role agents | **153-310 chars** | Terse, imperative, unquoted single line |
| System experts | **501-746** | "Use this agent when working in or investigating X, or when a task touches ... Typical triggers include ... Read-only ...; reports gotchas, never edits source." |
| Principal agents | **505-595** | "Use this agent when ... — in any repository. Typical triggers include ..." |
| Rich agents (`vivreal-ops`, `finance-auditor`, `marketing-auditor`, `ux-critic`) | **2,268-2,604** | Double-quoted YAML with escaped `\"` and `\n\n<example>...</example>` |

`<example>` blocks appear in exactly 4 agent files (+ their generated mirrors), each `Context:`/`user:`/`assistant:`/`<commentary>`.

**Boundary sentences are an established house device:**
- `vivreal-workflow/agents/reviewer.md:3` — "This is the bug-workflow reviewer agent that reads docs/bugs artifacts — **distinct from the standalone `reviewer` skill**."
- `vivreal-ops/agents/vivreal-ops.md:3` — "**Distinct from** principal-architect (which DESIGNS systems and writes no telemetry) **and** the sentry agent (which reads SENTRY telemetry, not running AWS/Atlas state)."
- `marketplace.json:50` — "**Distinct from** the growth agents ... **and** the designer agents (which design+build)."

**The template to copy** (`vivreal-experts/agents/portal.md:3`, 501 chars):
> `description: Use this agent when working in or investigating Vivreal_Portal_Mobile, or when a task touches the portal's edge proxy routes, the three-tier API rule (createAuthAxios vs publicAxios vs fetch), CSRF, the createProxyHandler factory, signed-URL media via /api/proxy/get-media, or SSR/hydration conventions. Typical triggers include "how should this proxy route be built" and portal architecture questions. Read-only system-expert consultant for the Next.js 16 portal; reports gotchas, never edits source.`

Body skeleton shared by `portal.md` and `reviewer.md`: `## Identity` (Name / Role / Cognitive stance / "You ARE X, don't say 'As the X, I would...'") → `## Scope boundary` or `## Standards reading rule` → `## Voice` (3-6 quoted one-liners) → domain sections → `## Output Format (MANDATORY)` with a literal indented template → `## Boundaries` ("I handle: ... I defer to: ...") → `## DON'Ts` (5 imperative lines). The read-only precedent to mirror, `portal.md:95`: *"DON'T edit any file (your tools don't include Edit/Write — confirm before any output). Use Bash for read-only commands only — never to write or modify files."*

**Sibling reviewers needing an explicit boundary:** `vivreal-workflow:reviewer` (adversarial 12-point **code diff** review, bug artifacts), `vivreal-principal:principal-reviewer` (principal-level **code diff** review, any repo), plus `code-review:code-review` and `pr-review-toolkit:review-pr`. The distinguishing axis is **subject**: those review *product code*; this reviews the `.md`/`.json` files that configure Claude Code itself.

**F20 — Command-file convention.** Frontmatter is minimal: `description` + `argument-hint` only (`commands/reviewer.md:1-4`, `orchestrate.md:1-4`, `research.md:1-4`). `vivreal-proxy-factory/commands/proxy-route.md:1-6` adds `name`, `allowed-tools`, `user-invocable: true`. Body: "You are dispatching the X agent. The user invoked `/x` with: **$ARGUMENTS**" → `## Input Detection` (numbered arg forms) → `## Setup` → `## Dispatch` (fenced pseudo-block with `description:`/`subagent_type:`/`prompt: |`) → `## Post-Dispatch` (verify artifact written, record metrics, next step). `argument-hint` example: `<"current diff" | branch name | PR URL | slug | (no args = review unstaged changes)>`.

---

## The Stage 1 rule table (reproduced)

From kit:196-316. **Authority:** `[spec]` = enforced by Claude Code; `[policy]` = Agency marketplace rule with no upstream equivalent; `[quality]` = kit heuristic. **Profile:** `A` packaged plugin, `B` bare `.claude/`, `A+B` both. Paths relative to target; `plugin.json` = `.claude-plugin/plugin.json`. Severities **ERROR** (blocks) / **WARNING** (advisory). **Pass = 0 errors.**

### Manifest (`.claude-plugin/plugin.json`) — Profile A only

| id | profile | authority | sev | rule |
|----|---------|-----------|-----|------|
| `manifest-exists` | A | policy | ERROR | `.claude-plugin/plugin.json` must exist. **Upstream the manifest is optional**; without one, components are auto-discovered and the name is derived from the directory. Agency requires it. |
| `manifest-valid-json` | A | spec | ERROR | must parse as a JSON object |
| `manifest-field-name` | A | **spec** | ERROR | `name` must be present and non-empty. This is the **only** upstream-required field. |
| `manifest-field-<f>` | A | policy | ERROR | `description`, `version`, `author` must be present and non-empty. Agency policy, not upstream spec. |
| `manifest-name-match` | A | policy | ERROR | `name` must equal the plugin directory name. Upstream allows a marketplace entry to list it under a different name. |
| `manifest-name-kebab` | A | spec | WARN | `name` should be kebab-case (`^[a-z0-9]+(-[a-z0-9]+)*$`). Used for component namespacing (`my-plugin:reviewer`). |
| `manifest-version-semver` | A | quality | WARN | `version` should match `^\d+\.\d+\.\d+$`. Omitting it entirely is valid upstream: Claude Code then falls back to the git commit SHA, so every commit is a new version. |
| `manifest-description-length` | A | quality | WARN | `description` should be <= 200 chars |
| `manifest-homepage` | A | quality | WARN | consider a `homepage` for support |
| `manifest-unknown-field` | A | spec | WARN | flag top-level keys outside the documented set. Claude Code ignores them and `claude plugin validate` warns; `--strict` makes it an error. Documented keys: `$schema`, `name`, `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `metadata`, `defaultEnabled`, `skills`, `commands`, `agents`, `workflows`, `hooks`, `mcpServers`, `outputStyles`, `lspServers`, `experimental`, `userConfig`, `channels`, `dependencies`. |

### Authors — Profile A only

| id | profile | authority | sev | rule |
|----|---------|-----------|-----|------|
| `manifest-author-emails` | A | policy | ERROR | **>=2 distinct `@<author-domain>` email addresses** across `plugin.json`'s `author`/`authors` **and** `agency.json`'s `authors`/`author`. Emails may be comma/semicolon-separated within one field. `--author-domain` defaults to `microsoft.com`; pass `--author-domain=""` to disable this rule entirely outside Agency. |

> Upstream, `author` is a single optional object (`{name, email, url}`). The two-FTE requirement is purely an Agency marketplace support rule. (kit:217-218)

### Marketplace metadata (`agency.json`, if present) — Profile A only

| id | profile | authority | sev | rule |
|----|---------|-----------|-----|------|
| `agency-valid-json` | A | policy | ERROR | if `agency.json` exists it must be valid JSON |
| `agency-valid-engine` | A | policy | ERROR | every value in `engines` must be one of `claude`, `copilot`, `*` |

### Component frontmatter — Profile A+B

#### Agents (`agents/*.md`, `.claude/agents/**/*.md`)

> Claude Code scans the agents directory **recursively**; the subdirectory path does not affect identity, which comes only from the `name` field. (kit:234-235)

| id | authority | sev | rule |
|----|-----------|-----|------|
| `agent-frontmatter-present` | spec | ERROR | file must open with a `---` YAML frontmatter block |
| `agent-field-name` | spec | ERROR | `name` required, non-empty |
| `agent-field-description` | spec | ERROR | `description` required, non-empty. It is the sole routing signal: it tells Claude *when to delegate*. |
| `agent-name-format` | spec | ERROR | `name` must be lowercase letters, numbers, and hyphens. A `:` is **rejected at load** (reserved for plugin-scoped ids like `my-plugin:reviewer`) and the file is not loaded, with an error in the debug log. |
| `agent-name-filename-match` | quality | WARN | `name` should match the filename stem. Not required (identity comes from the field), but a mismatch makes the fleet hard to navigate. |
| `agent-model-valid` | spec | WARN | if `model` is set it must be `sonnet`, `opus`, `haiku`, `fable`, `inherit`, or a full model id. Defaults to `inherit`. |
| `agent-color-valid` | spec | WARN | if `color` is set it must be one of `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` |
| `agent-tools-resolve` | spec | ERROR | every entry in `tools` should resolve to a real tool. **If no entry resolves, the subagent fails to launch**, with an error naming the entries. Treat `mcp__*` patterns as always valid (they resolve at runtime). |
| `agent-tools-never-available` | spec | WARN | `tools` names a tool that is **removed from every subagent unconditionally**, foreground and background alike: `AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ScheduleWakeup`, `TaskOutput`, `WaitForMcpServers`, `Workflow`. Also `ExitPlanMode` unless `permissionMode: plan`, and `Agent` at the depth limit. Dead on the `@name` subagent path. It is **legitimate** only if the file is also meant to run as the main-thread session agent (`claude --agent <name>`), where the filter does not apply. WARN, not ERROR, because the right fix is often to document the invocation rather than drop the tool. Escalate to a blocker yourself when the agent's *purpose* depends on it and no main-thread path is documented: an intake agent that can never ask a question fails silently, and a guessed answer is worse than none. |
| `agent-tools-background-filter` | spec | WARN | subagents run in the background by default, and a background subagent keeps only: `Read`, `Grep`, `Glob`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, `Artifact`, plus every MCP tool. `Agent` and `ExitPlanMode` follow their own conditions. Anything else in `tools` is silently dropped in the background. Flag it. |
| `agent-unknown-field` | spec | WARN | flag frontmatter keys outside: `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`, `initialPrompt` |
| `agent-plugin-ignored-field` | spec | WARN | Profile A only: `hooks`, `mcpServers`, and `permissionMode` are **ignored** for plugin subagents. Shipping them in a plugin is dead config. |
| `agent-md-depth` | quality | WARN | body should be >= 30 lines |
| `agent-output-format` | quality | WARN | should state an output format (`output\|format\|response\|contract`) |
| `agent-stray-md` | quality | WARN | a `.md` file under the agents tree with no valid frontmatter. It is scanned, fails to load, and logs an error. Move non-agent docs out of `agents/`. |

#### Skills (`skills/<name>/SKILL.md`)

> Hard limits below are from the Agent Skills spec and are authoritative. (kit:257)

| id | authority | sev | rule |
|----|-----------|-----|------|
| `skill-md-exists` | spec | ERROR | every `skills/<name>/` dir must contain `SKILL.md` |
| `skill-name-length` | spec | ERROR | `name` max **64 characters** |
| `skill-name-charset` | spec | ERROR | `name` lowercase letters, numbers, hyphens only; no XML tags |
| `skill-name-reserved` | spec | ERROR | `name` must not contain the reserved words `anthropic` or `claude` |
| `skill-description-length` | spec | ERROR | `description` max **1,024 characters**, non-empty, no XML tags |
| `skill-description-truncation` | spec | WARN | the combined `description` + `when_to_use` text is truncated at **1,536 characters** in the skill listing. Put the key use case first. |
| `skill-description-person` | quality | WARN | write in the third person. "Processes Excel files" is correct; "I can help you..." and "You can use this to..." both cause discovery problems, because the description is injected into the system prompt. |
| `skill-body-500` | spec | WARN | `SKILL.md` body should be under **500 lines**. Past that, split into referenced files. |
| `skill-refs-one-level` | quality | WARN | referenced files should link directly from `SKILL.md`. Nested references (`SKILL.md` -> `a.md` -> `b.md`) get partially read (`head -100`-style previews), producing incomplete information. |
| `skill-ref-exists` | quality | ERROR | every relative markdown link in `SKILL.md` must resolve to a file that exists |
| `skill-windows-paths` | quality | WARN | file paths inside a skill must use forward slashes. Backslash paths break on non-Windows. |
| `skill-toc-100` | quality | WARN | a reference file longer than 100 lines should carry a table of contents at the top |
| `skill-md-depth` | quality | WARN | `SKILL.md` should be >= 20 lines |
| `skill-md-quality` | quality | WARN | should mention **examples** (`example\|walkthrough\|sample\|scenario`), **output** (`output\|response\|format\|result`), and **errors** (`error\|fail\|edge.?case\|fallback\|invalid`); flag whichever are missing |
| `skill-time-sensitive` | quality | WARN | flag date-conditional guidance ("if before August 2025, use the old API"). Move superseded material into an "old patterns" section instead. |

#### Commands (`commands/*.md`)

> Custom commands have been **merged into skills**. `.claude/commands/deploy.md` and `.claude/skills/deploy/SKILL.md` both create `/deploy` and behave the same way. Existing `commands/` files keep working; skills add supporting files, invocation control, and automatic loading. (kit:279-282)

| id | authority | sev | rule |
|----|-----------|-----|------|
| `command-frontmatter-valid` | spec | WARN | if present, keys should be from the skill set: `name`, `description`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility` |
| `command-description` | quality | WARN | a `description` should be present; without it the first paragraph of the body is used |
| `command-argument-hint` | quality | WARN | a command that references `$ARGUMENTS` or `$1` should document `argument-hint` |

### Artifacts and content depth

| id | profile | authority | sev | rule |
|----|---------|-----------|-----|------|
| `readme-exists` | A | policy | ERROR | `README.md` must exist |
| `readme-length` | A | quality | WARN | README should be >= 10 lines |

### Hooks (`hooks/`, if present) — Profile A+B

| id | authority | sev | rule |
|----|-----------|-----|------|
| `hooks-json-exists` | spec | ERROR | if `hooks/` exists it must contain `hooks.json` |
| `hooks-json-valid` | spec | ERROR | `hooks.json` must be valid JSON |
| `hook-script-exists` | spec | ERROR | every script path referenced in `hooks.json` (`*.mjs/js/ts/py/ps1/sh`) must exist. Strip a leading `${CLAUDE_PLUGIN_ROOT}`/`${PLUGIN_ROOT}` prefix and any leading slash before resolving relative to the target dir. |

### Empty directories — Profile A+B

| id | authority | sev | rule |
|----|-----------|-----|------|
| `empty-directory` | policy | ERROR | none of `skills/`, `agents/`, `commands/`, `scripts/`, `hooks/` may exist yet contain no files (recursively) |

### Secrets — Profile A+B

| id | authority | sev | rule |
|----|-----------|-----|------|
| `secret-in-tree` | quality | ERROR | no file matching `*storageState*`, `*.pem`, `*.key`, `.env`, `*credential*`, `*secret*` may sit in the component tree **unless** git reports it as ignored. Agent asset folders accumulate captured sessions; a committed browser storage state is a live credential. |

> **Scripts note:** if the target ships `.ps1/.sh/.py/.js/.ts` files, remember it for Stage 2 (the `script_quality` dimension is only scored when scripts exist). (kit:317-318)

### Rules NOT in the table (the gap)

Two checks the brief calls the highest-value ones exist **only as Mode A prose** at kit:337-346, with **no rule ID, no severity, no authority tag**:
1. *"Resolve every cross-file reference... A citation to a file that no longer exists is a silent dead instruction and is worth an ERROR. This is the highest-value check in the kit and no regex version of it exists."* (kit:338-342)
2. *"Check claims against reality. If an agent's body asserts a platform behavior ('subagents cannot spawn subagents', 'the tool is called X'), verify it against the Sources table."* (kit:343-346)

See D1 and D2.

---

## The eval corpus (6 cases)

`git -C C:\repos\vivreal-hq cat-file -t 29b9404` → `commit`. **Exists.** `29b9404043cfb21963e9e03c756e28ef0050a1ad Tue Aug 4 11:57:26 2026 -0700 docs(ring2): log the 2026-08-04 reddit replies, and two process misses`. HEAD: `cfa5ed9af8c0a68887d9648ab5c300e76125448e Thu Aug 6 07:37:29 2026 -0700`.

**Empirical baseline.** Reconstructed the `29b9404` `.claude` tree into scratchpad with `git -C C:/repos/vivreal-hq archive 29b9404 .claude | tar -x -C <scratchpad>` (read-only: no checkout, no branch, no write inside `vivreal-hq`), then ran the kit's own Stage 1:

```
$ python structural_check.py --target <scratchpad>/hq-before --author-domain ""
FAIL  hq-before  [profile B]  (4 errors, 7 warnings)
  x [agent-name-format] agents\content-creator\overlay-shot.md name 'content-creator:overlay-shot' contains ':' - file is NOT loaded
  ! [agent-name-filename-match] agents\content-creator\overlay-shot.md name '...' != filename stem 'overlay-shot'
  x [agent-name-format] agents\content-creator\portal-footage.md name 'content-creator:portal-footage' contains ':' - file is NOT loaded
  ! [agent-name-filename-match] agents\content-creator\portal-footage.md ...
  ! [agent-stray-md] agents\content-creator\README.md has no frontmatter; it is scanned, fails to load, and logs an error.
  x [agent-name-format] agents\content-creator\typography-slide.md name 'content-creator:typography-slide' contains ':' - file is NOT loaded
  ! [agent-name-filename-match] agents\content-creator\typography-slide.md ...
  x [agent-name-format] agents\content-creator\ui-mockup-slide.md name 'content-creator:ui-mockup-slide' contains ':' - file is NOT loaded
  ! [agent-name-filename-match] agents\content-creator\ui-mockup-slide.md ...
  ! [agent-tools-never-available] agents\prompt.md lists ['AskUserQuestion'], removed from EVERY subagent ...
  ! [agent-output-format] agents\runner.md states no output format
Stage 1: errors=4 warnings=7 passed=False
```

**Two things this proves.** (a) Stage 1 catches cases 2, 3, 4 and is **totally silent on case 1** — zero findings against `social-video-director.md`. (b) The corpus contains **4 ERROR-severity defects the brief never mentions** (F22), so an eval asserting "exactly 4 findings" will fail.

### Case 1 — `.claude/agents/social-video-director.md` — false platform claim (HIGH)

79 lines. Frontmatter: `name: social-video-director`, `tools: Read, Write, Edit, Bash, Glob, Grep, Agent`, `model: sonnet`, `color: orange`. Offending text, **lines 19-25**:
```
19: ## IMPORTANT: main-thread requirement
20:
21: Parallel dispatch only works when you run as the TOP-LEVEL session agent
22: (subagents cannot spawn subagents — same constraint as content-creator.md).
23: If you were invoked as a subagent: do the work inline, sequentially, in this
24: order (record → tiktok → instagram → linkedin), and add
25: `"degraded":"inline-sequential"` to your summary notes.
```
**Line 22 is the defect.** Ground truth `sub-agents.md:867`: *"By default, a subagent can spawn subagents of its own, **up to three layers below the main conversation**. At the depth limit, Claude Code withholds the `Agent` tool from every subagent except a fork."* The file **lists `Agent` in its own `tools`**, so it holds the capability it claims not to have. Impact: every subagent invocation degraded to inline-sequential for no reason. Upstream fix (HEAD `:22-24, 32-34`) includes a self-documenting note: *"Corrected 2026-08-06. This section previously read 'subagents cannot spawn subagents', which was never true of Claude Code and sent every subagent invocation down the inline-sequential path for no reason."*

**DETECTABLE SIGNAL.** Not lexical — **no Stage 1 rule fired on this file at all**. A reviewer must:
1. Extract **assertions about Claude Code platform behaviour** — declarative sentences whose subject is a platform noun (`subagent`, `tool`, `hook`, `skill`, `plugin`, `frontmatter`, `Agent`, `background`) combined with a capability modal (`cannot`, `can't`, `is not able to`, `does not support`, `is stripped`, `only works when`, `is limited to`).
2. Check each against the Sources table / live docs.
3. Escalate to HIGH when the false claim gates the agent's own primary path — the tell here is the **internal contradiction**: a capability denied in prose while the corresponding tool (`Agent`) is present in `tools`. That contradiction is machine-checkable and is the strongest available heuristic for prioritising which claims to verify.

### Case 2 — `.claude/agents/prompt.md` — `AskUserQuestion` with no documented main-thread path (WARNING that escalates)

114 lines. Offending text, **line 4**: `tools: Bash, Read, Glob, AskUserQuestion`.
Purpose depends on it — **line 29**: ``choosable list (use `AskUserQuestion`), giving a one-line overview of each``; **line 97**: ``- **You are interactive.** Talk to the user with `AskUserQuestion` — pick the``. Its `## Procedure` header (line 23) reads "(interactive — sequence first, then the search query)".

**No main-thread path was documented at that commit.** Grep over the `29b9404` blob for `main thread|main-thread|claude --agent|session agent`: the only hits in the entire file are the three `AskUserQuestion` mentions at lines 4, 29, 97. **Zero documentation hits.**

**DETECTABLE SIGNAL.** Two-part; the second is what makes the severity correct:
1. `tools` contains a member of the never-available set (`sub-agents.md:329-339`). Purely lexical — Stage 1 already fires `agent-tools-never-available`.
2. **Escalation predicate:** search the body for a documented main-thread invocation (`claude --agent <name>`, "main thread", "main conversation", "session agent"). **Absent** → escalate toward a blocker, because the agent's *purpose* depends on the tool. **Present** → correct-but-not-a-blocker; leave as a note (case 5). The `agent-tools-never-available` lesson lives exactly here: first written as ERROR, and that was wrong, because the right fix was documentation, not tool removal.

### Case 3 — `.claude/agents/content-creator/README.md` — frontmatter-less `.md` in the scanned tree (WARNING)

138 lines. Offending text, **line 1** — opens with a Markdown heading, not a `---` fence:
```
1: # Content Creator Agent
2:
3: Sibling to `content-planner`. Reads draft folders, produces assets, writes `MANIFEST.md`.
```
I enumerated every `.md` under `.claude/agents/` at `29b9404` and tested `head -1 == "---"`. **Exactly one file fails: `.claude/agents/content-creator/README.md`.** Confirmed by the Stage 1 run (`agent-stray-md`, one occurrence).

**DETECTABLE SIGNAL.** Purely lexical and cheap: **recursively** enumerate `**/*.md` under the agents root (Claude Code scans recursively — kit:234-235) and flag any whose first line is not `---`. Two things make it correct rather than noisy: the scan **must be recursive** (this file is one directory deep), and it **must key on the `.md` extension only** — which is precisely what makes case 6 a non-finding.

### Case 4 — `.claude/agents/runner.md` — no output contract (WARNING)

62 lines (57-line body). Frontmatter valid: `name: runner`, `tools: Bash, Read, Glob`. Has a `## How to report` section at **lines 52-62** describing *what to say* per stage but never *the shape of the return value*:
```
52: ## How to report
53: - After **import-leads**: state created / existing / no-website / with-contact and the
54:   campaign tag.
55: - After **crawl**: state pages/sites scraped and the CSV path, PLUS the deep pass line
56:   (`pages= emails= owners= igReach= igBlocked=`). If `igBlocked` is high or the deep pass
57:   line is missing entirely, surface that — the profiler's reach hooks depend on it.
...
62: No step costs credits. Stop and report on any auth failure — do not loop.
```
No `## Output Format`, no template, no schema, no delimiters. Contrast the house standard, `vivreal-experts/agents/portal.md:71-88`, which gives a literal indented template under `## Output Format (MANDATORY)`.

**DETECTABLE SIGNAL.** The kit's regex suffices *here* but is fragile:
```
$ git show 29b9404:.claude/agents/runner.md | grep -iE "output|format|response|contract"
(no matches)
```
So `agent-output-format` fires. **But the regex is a proxy, not the property.** Any file containing "format" anywhere — including "the CSV format" in prose — passes while still having no contract. Key on the **structural** signal: is there a section specifying the *shape* of the return (an `## Output`-family heading **plus** a template, fenced block, field list, or schema)? `runner.md` has the intent (`## How to report`) but not the shape — exactly the near-miss class a regex gets right by luck. Note `## How to report` would have defeated a naive `^## Output` heading check, so the rule needs both heading breadth and a shape requirement.

### Case 5 (NEGATIVE) — current `.claude/agents/prompt.md` — must NOT be re-flagged as a blocker

`tools` on HEAD is **unchanged** — still `tools: Bash, Read, Glob, AskUserQuestion` (line 4). What changed: the main-thread requirement is now documented **at the very top**, lines 9-23, immediately after the H1:
```
 9: ## Run me on the main thread (read this first)
10:
11: `AskUserQuestion` is stripped from EVERY subagent, in the foreground and the
12: background alike. This agent's whole procedure is a back-and-forth, so dispatching
13: it as a subagent (`@prompt ...`) leaves it unable to ask anything.
14:
15: - **Correct invocation:** run the intake in the MAIN conversation, either as the
16:   session agent (`claude --agent prompt`) or by having the main session follow
17:   this procedure directly. `AskUserQuestion` is available there.
18: - **If you are running as a subagent** and `AskUserQuestion` is not in your tool
19:   list: do NOT invent answers, and do NOT emit a brief with guessed fields. A
20:   guessed brief is worse than no brief, because `@coordinator` runs it verbatim
21:   and produces junk leads. ...
```
Lines 35-37 record provenance:
```
35: Discovered 2026-08-06 by the plugin/agent validation kit. The `tools` list keeps
36: `AskUserQuestion` on purpose: it is live on the main-thread path and only dead on
37: the subagent path.
```
**DETECTABLE SIGNAL.** The case-2 escalation predicate must now resolve the other way: find the documented main-thread path — `claude --agent prompt` (line 16), "main thread" (line 9), "MAIN conversation" (line 15) — and downgrade to a non-blocking note. The required behaviour is **the same rule producing a different verdict from body evidence**, which is why this must be agent judgment rather than a severity-table lookup. Confirmed live: the kit's Stage 1 still emits the `agent-tools-never-available` warning against current `main`, so the *rule* firing is expected and correct; only the *escalation* must not.

### Case 6 (NEGATIVE) — `.claude/agents/content-creator/README.txt` — deliberately `.txt`, must NOT be flagged

```
$ git cat-file -t HEAD:.claude/agents/content-creator/README.txt   → blob  (EXISTS)
$ git cat-file -t HEAD:.claude/agents/content-creator/README.md
fatal: path '.claude/agents/content-creator/README.md' does not exist in 'HEAD'
```
Case 3 was fixed by **renaming `.md` → `.txt`**, removing it from the recursive `*.md` scan while keeping the documentation.

**DETECTABLE SIGNAL.** The stray-file rule must be scoped to the `.md` extension **only**. Any widening to "non-agent files in the agents tree" re-flags this file and is wrong. The tree also contains `.gitkeep`, `.css`, `.json`, `.svg`, `.html` under `content-creator/` — all legitimate assets, none flaggable. Verified: enumerating every `.md` under `.claude/agents/` at HEAD and testing `head -1 == "---"` yields **zero** frontmatter-less files.

### Current-state verification

**F21 — The clean-state claim VERIFIED.**
```
$ python structural_check.py --target C:/repos/vivreal-hq --author-domain ""
PASS  vivreal-hq  [profile B]  (0 errors, 1 warnings)
  ! [agent-tools-never-available] agents\prompt.md lists ['AskUserQuestion'], removed from EVERY subagent ...
Stage 1: errors=0 warnings=1 passed=True
```
**0 errors repo-wide — confirmed.** The single warning is exactly the one the brief predicts, correct-but-not-a-blocker per case 5. Identical with and without `--author-domain ""` (Profile B suppresses the author rule regardless).

Counts at HEAD: **14 agent `.md` files, 7 command `.md` files.** The 7 commands match exactly. "7 content agents" resolves if the subset is `carousel-editor, content-planner, footage-recorder, guide-writer, linkedin-editor, short-form-editor, social-video-director` (7), the other 7 being the lead-gen side (`coordinator, contact-enricher, lead-scout, owner-researcher, profiler, prompt, runner`). **Counts are consistent** — but note the total is 14, not 7; a reader could misread "7 content agents" as the repo total.

**F22 — The corpus has 8 defects at `29b9404`, not 4.** Four additional **ERROR**-severity defects, each a `name` containing `:` (file silently not loaded, `agent-name-format`):

| File @29b9404 | Line 2 | At HEAD |
|---|---|---|
| `.claude/agents/content-creator/overlay-shot.md` | `name: content-creator:overlay-shot` | **DELETED** |
| `.claude/agents/content-creator/portal-footage.md` | `name: content-creator:portal-footage` | **DELETED** |
| `.claude/agents/content-creator/typography-slide.md` | `name: content-creator:typography-slide` | **DELETED** |
| `.claude/agents/content-creator/ui-mockup-slide.md` | `name: content-creator:ui-mockup-slide` | **DELETED** |

Genuine (`sub-agents.md` reserves `:` for plugin-scoped ids; kit:242 and kit:1462-1463 both confirm "silently not loaded"). Fixed by deleting the four files. **The eval must expect 4 errors + 7 warnings at `29b9404`, not "4 findings."**

---

## Kit defects / things I think are wrong

**D1 (CRITICAL) — The cross-file-reference disambiguation rule is entirely absent from the kit.**
The brief calls this the fix that took a run from **26 false positives to 0** and specifies it precisely: *"Count only directory-qualified paths as references; a bare basename in prose (`post.md`, `slides.json`) is a mention"* (`PROMPT - build the agent-review agent.md:64-68`). **None of that is in the kit.** Verified:
```
$ grep -in -e basename -e "directory-qualified" -e "false positive" -e "false-positive" -e "19 of 22" "# Local Plugin & Agent Validation K.txt"
(no matches for any term)
```
The kit's entire treatment is kit:338-342, which says only *"Agents routinely cite paths (`knowledge/02-strategy.md`, `src/render-video.ts`, a sibling agent's `.md`)"* — the examples happen to be directory-qualified but the **rule is never stated**, and "a sibling agent's `.md`" actively suggests bare basenames count. There is also **no rule ID**: skills get `skill-ref-exists` (kit:270), agents get nothing. A coder implementing from the kit alone reproduces the 26-false-positive run. **This is the #1 thing to fix in the kit.**

**D2 (CRITICAL) — The platform-claim check has no rule ID, no severity, no authority tag.** Kit:343-346 is four sentences of Mode A prose, yet it caught eval case 1 — the highest-severity defect — and **I proved Stage 1 cannot catch case 1 at all**. The kit's framing understates this: kit:105-106 says Mode A "is often *better* than Mode B" for reference resolution, but for platform claims Mode B is not *worse*, it is **incapable**. Both "two things a script cannot do" should be first-class Stage 1 rules with ids, severities, and `[quality]` tags.

**D3 (HIGH) — Agency `[policy]` rules default ON, producing a second whole class of false ERRORs.** The kit correctly names Profile A/B as "the #1 false-failure" (kit:1456-1458) but never warns that policy rules mis-fire on *Profile A* targets outside Agency. `--author-domain` defaults to `microsoft.com` (kit:215, 756-757); `readme-exists` (kit:294) is an unconditional ERROR. Measured: **all 13 plugins here lack a `README.md`**, so every one takes a false ERROR:
```
$ python structural_check.py --target C:/repos/vivreal-skills/vivreal-infra --author-domain ""
  x [readme-exists] Missing README.md [policy]
```
The kit offers `--author-domain ""` for one policy rule but **no switch for `readme-exists`, `manifest-exists`, `manifest-field-<f>`, `manifest-name-match`, `agency-*`, or `empty-directory`**. There should be one `--no-policy` flag; outside Agency these should default to WARNING or off. Per F13, *every* Profile-A-only ERROR rule is `[policy]` — so the fix is one clean predicate.

**D4 (MEDIUM) — `manifest-name-match` is an ERROR that contradicts its own note and the live docs.** Kit:204 states ERROR then immediately writes *"Upstream allows a marketplace entry to list it under a different name."* Live doc agrees (`plugins-reference.md:465`). An ERROR blocking a configuration upstream explicitly supports is mis-severed; belongs at WARNING or under D3's off-switch.

**D5 (MEDIUM) — Nothing in the kit validates that frontmatter actually parses as YAML, and for Profile B nothing can.** `split_frontmatter()` (kit:410-440) is explicitly *"Deliberately not a YAML parser"* (kit:414-416) — it regex-matches `^key:\s*(.*)$` per line, so a description containing an unquoted `: ` parses "successfully" into a wrong value instead of failing. Meanwhile the rule table sells these as **load-time correctness** rules ("a file that fails them is silently not registered", kit:230-231). **There is no `*-frontmatter-parses` rule anywhere.** Proven material — Stage 0 catches it, Stage 1 does not:
```
$ claude plugin validate ./vivreal-workflow --strict
  ✘ frontmatter: YAML frontmatter failed to parse: YAML Parse error: Unexpected token.
    At runtime this skill loads with empty metadata (all frontmatter fields silently dropped).
  (× 4 skills)      TRUE exit: 1

$ python structural_check.py --target C:/repos/vivreal-skills/vivreal-workflow --author-domain ""
FAIL  vivreal-workflow  [profile A]  (2 errors, 44 warnings)
  → ZERO frontmatter-parse findings
```
Because **Stage 0 does not exist for Profile B** (kit:179-181, 1459-1461), a bare `.claude/` repo has **no YAML-validity check at any stage**. Most consequential blind spot after D1/D2: an unparseable skill "loads with empty metadata" — no description, can never be routed to.

**D6 (MEDIUM) — `skill-description-truncation` measures the wrong quantity and is redundant.** Kit:266 defines 1,536 as applying to the **combined `description` + `when_to_use`**. The implementation (kit:653-659) measures `description` alone:
```python
desc = fm.get("description", "")
if len(desc) > 1024:
    err("skill-description-length", ...)
if desc and len(desc) > 1536:
    warn("skill-description-truncation", ...)
```
(a) It never reads `when_to_use`, so it cannot detect the documented condition. (b) Any description >1536 already tripped the >1024 ERROR, so the WARNING only ever appears alongside an ERROR and adds nothing. Either measure `description + when_to_use`, or delete the rule.

**D7 (LOW) — `secret-in-tree` matches file names only, so a `secrets/` directory is invisible.** Kit:740-747 iterates `root.rglob("*")` and tests `p.name` — the *file basename*. A directory named `secrets/`/`credentials/` full of innocuously-named files matches nothing. Conversely `credential`/`secret` are unanchored substrings, so a legitimately-named doc (`iam-secrets.md`) would ERROR. I tested the false-positive direction against `vivreal-infra` (which ships a `vivreal-iam-secrets` skill) and it did **not** fire — only because the file is named `SKILL.md` and the directory name is never tested. The rule is right by accident here and wrong in both directions in general.

**D8 (LOW) — `agent-tools-resolve` stated more absolutely than the docs support.** See F9.

**D9 (LOW) — The kit's "Verify your build is correct" section uses a synthetic demo, not the real corpus.** Kit:1426-1450 constructs a throwaway `demo` plugin. But the kit's own provenance (kit:35-36: *"run for real against `C:\repos\vivreal-hq` on 2026-08-06"*) means a real regression corpus exists — the 6 cases above — and **none of it is in the kit**. Anthropic's eval-first guidance is in the kit's own Sources table (kit:41) yet not followed by the kit itself. The four real defects and two negative cases should be an appendix.

**D10 (LOW, Windows) — Stage 1 output mojibakes on a Windows console.** The em-dash in `agent-name-format`'s message (kit:579) rendered as a replacement character in my `cp1252` console: `contains ':' <?> file is NOT loaded`. Cosmetic, but this is a Windows-first repo and the kit's quickstart is PowerShell (kit:124-139). Prefer ASCII in emitted messages, or set `PYTHONIOENCODING=utf-8`.

**D11 (INFO) — Kit v2 changelog item 2 is accurate and worth preserving.** Kit:20 records that v1 marked `description`/`version`/`author` as ERROR-level *spec* and that this was corrected to *policy*. Verified upstream: `plugins-reference.md:461` — "`name` is the only required field." The kit is right, and the fix is load-bearing for anyone reusing the rule table.

---

## Open questions

**OQ-1 — Placement is Phase 2's, but F5 constrains it.** `vivreal-workflow` fails `--strict` at exit 1 today; a new plugin starts clean. The architect should state whether the definition-of-done is interpreted per-plugin (favours a new plugin) or repo-wide (would require fixing 34 skills first — OQ-3).

**OQ-2 — Does `claude plugin validate` actually validate agent frontmatter, or only skills?** F4 shows it prints only failures, and I have no confirmed positive: across 13 plugins and ~30 agent files, every reported failure was `Validating skill: ...`, never `Validating agent: ...`. The doc claims agent coverage (`plugins-reference.md:1196`). Cheap resolution: point it at a deliberately broken agent file in a scratch plugin. Matters because if Stage 0 does **not** cover agents, Stage 1's agent rules are the only gate for Profile A too.

**OQ-3 — 34 skills in this repo currently fail `claude plugin validate --strict`.**

| plugin | `--strict` exit | YAML-parse failures |
|---|---|---|
| vivreal-knowledge | 1 | **21** |
| vivreal-infra | 1 | **9** |
| vivreal-workflow | 1 | **4** |
| the other 10 | 0 | 0 |

Single root cause: an unquoted YAML scalar containing `: `, e.g. `vivreal-workflow/skills/vivreal-brainstorming/SKILL.md:3` — `...Triggers on: design X, build X...`. Each affected skill "loads with empty metadata (all frontmatter fields silently dropped)" — **no description, can never be routed to.** Separately, the kit's Stage 1 flags 11 skill descriptions over the 1,024-char `[spec]` limit (10 in `vivreal-knowledge`, 1 in `vivreal-infra`). **Pre-existing and out of scope per the brief** — but real, and exactly what this agent is being built to find. I recommend reporting, not fixing, inside this project.

**OQ-4 — Running the new reviewer on its own repo will produce a systematic false-positive class.** Because `sync-to-agy.js` copies agent frontmatter verbatim into `SKILL.md` (F16), every generated mirror carries `tools:` and `color:` — agent keys, not skill keys. Stage 1 duly reports `skill-unknown-field ... unrecognized key 'tools'`/`'color'` for all 8 agent mirrors in `vivreal-workflow` alone. Artefacts of the sync design, not defects. Should generated mirrors be excluded from review, and if so how are they identified (see OQ-5)?

**OQ-5 — Generated `SKILL.md` files carry no "generated, do not edit" marker.** They are byte-identical committed copies. Adding a marker is out of scope, but the coder must be told which paths are generated. Should `sync-to-agy.js` run as part of this project? Scope OUT says regeneration only "unless the placement decision requires it" — and per F17, if the new plugin is registered in `marketplace.json`, the *next* run generates mirrors for its agent and command whether or not this project runs it.

**OQ-6 — The other 5 Sources URLs were not re-verified.** The two named are clean (F6/F7/F10). The skill limits (64-char name, 1,024-char description, 500-line body) come from the *unverified* best-practices URL and are load-bearing for OQ-3's 11 over-length descriptions.

**OQ-7 — Is `agent-md-depth >= 30 lines` (kit:251) defensible?** `[quality]`, unsourced, and in tension with the Stage 2 ANTI-VERBOSITY control (kit:811-812: "a concise clear file MUST score >= a long vague one"). Stage 1 rewarding length while Stage 2 explicitly refuses to is an internal inconsistency I flag but do not resolve.

---

## Layers affected

| Layer | Path | Nature | Notes |
|---|---|---|---|
| Agent definition | `<plugin>/agents/<name>.md` | **NEW** | Tools per brief: `Read, Grep, Glob, Bash, WebFetch`. All 5 survive the background filter (`sub-agents.md:341`) — no dead config. Follow the F19 body skeleton and the `portal.md:95` read-only DON'T. |
| Command definition | `<plugin>/commands/<name>.md` | **NEW** | `description` + `argument-hint` (F20); target path defaulting to cwd. |
| Plugin manifest | `<plugin>/.claude-plugin/plugin.json` | **NEW** (if new plugin) | Shape per F18. `name` must equal the directory name to satisfy the kit's own `manifest-name-match`. |
| Marketplace registry | `.claude-plugin/marketplace.json` | **EDIT** — one entry | 3-key shape per F17. Also gates `sync-to-agy.js` visibility. Validates clean today (F3); must still validate clean after. |
| Generated skill mirrors | `<plugin>/skills/<agent>/SKILL.md`, `<plugin>/skills/cmd-<command>/SKILL.md` | **GENERATED — do not hand-author** | Produced by `sync-to-agy.js:34-69`. See F16, OQ-5. |
| Docs / sync log | `docs/SYNC.md` | Possible append | One row per sync (`docs/SYNC.md:5-12`). |
| Project artifacts | `docs/projects/agent-definition-reviewer/` | this file, then `design.md`, `review-N.md` | Per `reviewer.md:173-176`. |
| **Not touched** | `C:\repos\vivreal-hq` | **READ-ONLY** | `git show`/`git archive` only. Verified: no checkout, no branch, no write. |
| **Not touched** | 34 broken skills in `vivreal-knowledge`/`vivreal-infra`/`vivreal-workflow` | Reported only (OQ-3) | Out of scope per the brief. |

**Not affected:** no portal proxy route, no backend service, no MongoDB access, no multi-tenant routing, no CSRF surface, no Lambda, no hydration/SSR path. The `shared-standards` trigger map returns "Skip this file" for every row against this task; the only applicable discipline is house convention, captured in F16-F20.

agentId: a667a7e2255f2bfc1 (use SendMessage with to: 'a667a7e2255f2bfc1', summary: '<5-10 word recap>' to continue this agent)
<usage>subagent_tokens: 217857
tool_uses: 53
duration_ms: 957105</usage>