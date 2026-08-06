# Design — agent-definition-reviewer

- **Slug:** `agent-definition-reviewer` | **Workflow:** FEATURE | **Phase:** 2 (Design) | **Date:** 2026-08-06
- **Repo under change:** `C:\repos\vivreal-skills`
- **Inputs:** `brief.md`, `findings.md` (595 lines), `docs-verification.md`
- **Approval gate:** WAIVED by the user ("one pass"). This document is written so the reasoning is auditable, not to block Phase 3.
- **Standards:** the `shared-standards` trigger map returns *"Skip this file"* for every row — no proxy route, no backend, no Mongo, no CSRF, no hydration, no Lambda. The only applicable discipline is house convention (F16–F20) plus the repo's two standing memory rules (qualified plugin names; generated-vs-source skills).

---

> **Phase 3 approval gate — WAIVED.** The user invoked this build with an explicit
> "one pass" instruction and "do not stop for approval on the placement decision".
> The orchestrator auto-approved all 12 change items on 2026-08-06 with the architect's
> stated defaults for the 5 flagged judgment calls. The user retains the right to
> override any item after the fact; nothing here was silently chosen.

## Recommendation

**Ship a new standalone plugin, `vivreal-agent-review`, containing one flat agent (`definition-reviewer`), one command (`/definition-review`), and a `references/` tree carrying the corrected rule set, the doc-verified platform-fact ledger, and the 6-case eval corpus.**

**One-sentence justification (D-1):** A new plugin is the only placement where the brief's definition-of-done — `claude plugin validate <the new plugin dir> --strict` returns clean — is actually reachable, because `vivreal-workflow` fails `--strict` at exit 1 today over 4 unrelated skill YAML-parse errors (findings.md:66–73), and because a repo-agnostic Claude Code linter has no business inheriting the Vivreal bug-workflow plugin's description, its `shared-standards` coupling, or its router competition with `vivreal-workflow:reviewer`.

**Verdict on stopping:** not stopping. The user waived the gate and asked for one pass. Every judgment call below is made with a stated rationale; the five that are genuinely the user's preference are collected in *Open questions I could not resolve* and are all non-blocking for Phase 3.

---

## Alternatives considered

### D-1. Placement — exactly two options

#### Option A — New standalone plugin `vivreal-agent-review/` **← RECOMMENDED**

| Dimension | Assessment |
|---|---|
| **DoD reachability** | **Decisive.** The brief's gate is `claude plugin validate <the new plugin dir> --strict` — a **positional `<path>`**, per-plugin, not repo-wide (findings.md:50–58). This resolves **OQ-1**: the DoD is per-plugin. A brand-new plugin starts from a clean gate; 10 of 13 existing plugins already exit 0 (findings.md:66–73). |
| **Repo-agnosticism** | The subject matter is Claude Code's own configuration format. Nothing in it is Vivreal-specific. `vivreal-principal` is the precedent for a repo-agnostic plugin under the `vivreal-` prefix. |
| **Router collision** | Isolating it lets a user install the config reviewer *without* installing the Vivreal bug workflow, and vice versa. Two reviewers in one plugin is a discovery hazard; two reviewers in two plugins the user can choose between is not. |
| **Install granularity** | A user who only wants "lint my `.claude/` dir" installs one small plugin, not the 28-skill workflow plugin. |
| **Cost** | +1 `plugin.json`, +1 `marketplace.json` entry, +1 directory. |
| **Rollback** | Delete the directory and the one marketplace entry. Zero blast radius on anything existing. |

#### Option B — Fold into `vivreal-workflow/`

| Dimension | Assessment |
|---|---|
| **DoD reachability** | **Fails today.** `claude plugin validate ./vivreal-workflow --strict` → true exit **1** (findings.md:66–73), caused by 4 skills whose YAML frontmatter does not parse. To satisfy the DoD we would first have to fix 4 of the 34 broken skills in OQ-3 — work the brief puts explicitly out of scope (`brief.md` Scope OUT; findings.md:564). Shipping "the validator that cannot pass validation" is precisely the failure the brief forbids. |
| **Repo-agnosticism** | Poor fit. `vivreal-workflow`'s marketplace description is *"The Vivreal bug/feature workflow"* (`marketplace.json:25`); a Claude Code config linter is not that, so the description would have to grow to cover an unrelated capability, degrading routing for the 15 things already in there. |
| **Router collision** | **Worst case.** `vivreal-workflow:reviewer` already lives there. Two agents named `*reviewer` in one plugin, with overlapping trigger vocabulary ("review"), inside a plugin whose own description leads with workflow roles. The boundary sentence would have to work harder and would still be competing inside its own namespace. |
| **Genuine upside** | Real, and worth naming: one fewer plugin to install, register, and version; `vivreal-workflow` already owns the reviewer *role* concept; no new `plugin.json`. |
| **Cost** | Lower artifact count, higher coupling, and an unrelated 4-skill remediation on the critical path. |

**Decision: Option A.** The DoD argument alone is dispositive; repo-agnosticism and router isolation are corroborating, not load-bearing. Had `vivreal-workflow` validated clean, this would have been a closer call decided on the description-collision axis — and still Option A.

### Rejected sub-alternatives

- **Ship it as a skill instead of an agent.** Rejected: the brief requires a subagent specifically so file-reading stays out of the caller's context and only the verdict returns. A skill runs inline and would dump every reviewed file into the caller's window.
- **Vendor the two Python scripts into the plugin.** Rejected: `brief.md` Scope OUT forbids it. They are materialized on demand (D-5).
- **Put the agent in `agents/review/definition-reviewer.md`.** Rejected: `docs-verification.md:145` — for *plugin* `agents/` directories the subfolder becomes part of the scoped identifier, yielding `vivreal-agent-review:review:definition-reviewer`, a three-segment name. Combined with the standing memory rule that bare skill names fail to resolve, that is a gratuitous footgun. **The agent file stays flat in `agents/`.**

---

## D-2. Names

| Artifact | Name | Why |
|---|---|---|
| Plugin dir + `plugin.json.name` + marketplace `name` | `vivreal-agent-review` | Kebab-case (`manifest-name-kebab`); equals the directory name (`manifest-name-match`); carries the house `vivreal-` prefix that all 13 siblings use, even the repo-agnostic `vivreal-principal`. Matches the user's own mental name for this thing (their source brief is filed as *"build the agent-review agent"*). |
| Agent file | `vivreal-agent-review/agents/definition-reviewer.md` | **Flat**, per `docs-verification.md:368`. Invoked as `vivreal-agent-review:definition-reviewer` — two segments. |
| Agent `name` | `definition-reviewer` | 19 chars (≤64). Lowercase letters + hyphens only — satisfies both the kit's reading and the narrower doc reading (`docs-verification.md:108`). No `:`. |
| Command file | `vivreal-agent-review/commands/definition-review.md` → `/definition-review` | Distinct from the agent name so `/definition-review` and `@definition-reviewer` never read as the same token. |

### The naming constraint nobody would find by reading the docs

`sync-to-agy.js:34-48` copies `agents/*.md` **verbatim** into `skills/<stem>/SKILL.md` (F16, verified by two byte-identical `diff`s). That means **the agent's `name` field becomes a *skill* `name` field**, and skill names are governed by `skill-name-reserved`, a `[spec]` ERROR: *"Cannot contain reserved words: 'anthropic', 'claude'"* (`docs-verification.md:269`).

**Therefore the agent may not be called `claude-config-reviewer`, `claude-code-linter`, or anything containing `claude`** — the obvious names are all forbidden, and picking one would have made this agent defect #35 in its own report. `definition-reviewer` is chosen partly for this reason.

---

## Change plan

Twelve items. Each is independently approvable.

---

### 1. Create `vivreal-agent-review/.claude-plugin/plugin.json`

**Summary.** The plugin manifest. Shape copied from `vivreal-ops/.claude-plugin/plugin.json` (F18): six keys, no more.

```json
{
  "name": "vivreal-agent-review",
  "version": "1.0.0",
  "description": "Read-only reviewer for Claude Code definition files — agent, skill, command, and plugin manifests. Detects profile, resolves cross-file references, and checks platform claims against the live docs.",
  "author": { "name": "Vivreal", "email": "justin@vivreal.io" },
  "homepage": "https://github.com/HillBombCreations/vivreal-skills",
  "keywords": ["claude-code", "agent", "skill", "command", "plugin", "validation", "review", "read-only", "definition", "frontmatter", "linter"]
}
```

**Budget the coder must respect:** the `description` here is **196 characters** and the ceiling is **200** (`manifest-description-length`, WARN). This is a *different, much tighter* budget than the agent description (1,024) and the marketplace entry (unbounded). Do not paste the agent description in here.

Every key is in the documented 24-key set (`docs-verification.md:176`), so `manifest-unknown-field` cannot fire and `--strict` cannot promote it. `name` equals the directory name, satisfying `manifest-name-match` even though we downgrade that rule (see D-3).

**Files affected.** 1 new file.
**Blast radius.** None until item 7 registers it; an unregistered plugin dir is invisible to both Claude Code and `sync-to-agy.js` (F17).
**Risk.** Low. Only realistic failure is drifting past 200 chars on the description.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 2. Create `vivreal-agent-review/agents/definition-reviewer.md`

**Summary.** The reviewer itself. Full frontmatter and body skeleton are specified in the two sections below (*Agent frontmatter* and *Agent body*). Hard budget: ≤320 lines total, description ≤900 chars.

**Files affected.** 1 new file.
**Blast radius.** This file becomes a *skill* on the next `sync-to-agy.js` run (item 11), so it is subject to the skill `[spec]` limits — see D-7.
**Risk.** Medium. Three named failure modes: (a) an unquoted `: ` in the description silently empties its own frontmatter — the exact defect that broke 34 skills here (findings.md:564); (b) exceeding 1,024 description chars joins the 11 already over the limit (OQ-3); (c) an XML-ish `<example>` block in the description violates the no-XML-tags rule *and* blows the length limit, which is why the four rich-description agents in this repo are not the pattern to copy.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 3. Create `vivreal-agent-review/references/rules.md`

**Summary.** The corrected rule table — the full *Rule set* section of this design, verbatim, as the agent's one-level reference. Kept out of the agent body so the body stays under budget.

**Files affected.** 1 new file.
**Blast radius.** Linked directly from the agent body (one level — satisfies `skill-refs-one-level`). It must **not** link onward to `platform-facts.md`; both are linked from the body independently, so neither is ever two levels deep.
**Risk.** Low, but needs a **table of contents** at the top because it will exceed 100 lines (`skill-toc-100`), and **forward slashes only** in every path it cites (`skill-windows-paths`), including Windows paths written as `C:/repos/...`.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 4. Create `vivreal-agent-review/references/platform-facts.md`

**Summary.** The doc-verified claim ledger that makes the platform-claim check work **offline**. Every entry is `claim | verbatim doc quote | source URL | verified date | version caveat`. Seeded from `docs-verification.md` sections A–H: nesting depth + the fork exception + the `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` history; the 7 unconditionally-stripped tools; the 19-tool background filter; the 16 agent frontmatter keys; the **20** skill/command keys including `when_to_use`; model aliases; the 8 colors; the `:`-in-name load failure; manifest optionality and `name`-only-required; the 24 manifest keys; commands-merged-into-skills; 0-based `$N`; the four skill hard limits.

It also carries an explicit **UNSUPPORTED-BY-DOCS** section listing the three claims the docs do not back (`agent-stray-md`'s load-failure assertion, `claude plugin validate`'s output shape, the agent `tools` separator format) so the agent can never cite doc support that does not exist.

**Files affected.** 1 new file.
**Blast radius.** This is what lets Mode A run with **zero** network calls on the normal path — WebFetch becomes the exception, not the mechanism.
**Risk.** Medium — it is a dated snapshot and will rot. Mitigation: every row carries its own `verified:` date, and the agent must print the ledger date in any finding it derives from the ledger, so staleness is visible in the output rather than silent. Needs a ToC (>100 lines).

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 5. Create `vivreal-agent-review/commands/definition-review.md`

**Summary.** The dispatcher. Frontmatter + body specified in the *Command file* section below.

**Files affected.** 1 new file.
**Blast radius.** Mirrored to `skills/cmd-definition-review/SKILL.md` by item 11 — so its `description` is under the same 1,024-char and no-colon-space rules as the agent's.
**Risk.** Low. One real trap: `$1` is the **second** argument (0-based, `docs-verification.md:251`). The body uses `$ARGUMENTS` only and never a positional.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 6. Create `vivreal-agent-review/references/evals/`

**Summary.** The regression corpus (D-9). Three files: `README.md` (provenance + how to run), `cases.md` (the 6 cases as assertions), `expected/29b9404.md` and `expected/head.md` (expected finding sets, as assertions not snapshots).

**Files affected.** 4 new files in a new subdirectory.
**Blast radius.** None at runtime. `references/` is not a component directory, is not scanned by Claude Code, and is not read by `sync-to-agy.js` (which reads only `agents/` and `commands/`). It is also **not** in `empty-directory`'s watched set (`skills/ agents/ commands/ scripts/ hooks/`).
**Risk.** Low — but note the self-trap it avoids: `cases.md` quotes paths like `.claude/agents/prompt.md` that do not exist in this plugin. The `ref-unresolved` rule is scoped to files Claude Code actually *loads* as instructions (see D-3), so eval fixtures are never scanned. Without that scoping sentence the plugin would fail its own review.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 7. Edit `.claude-plugin/marketplace.json` — append one entry

**Summary.** Append to `plugins[]`, exactly the 3-key shape (F17):

```json
{
  "name": "vivreal-agent-review",
  "source": "./vivreal-agent-review",
  "description": "Read-only review of Claude Code definition files — the agent, skill, command, and plugin .md/.json files that configure Claude Code itself. The definition-reviewer agent and /definition-review command detect the target profile (packaged plugin vs bare .claude/), run claude plugin validate, apply the tagged rule set, resolve every directory-qualified cross-file reference, and check platform claims in agent prose against the live docs. Distinct from the code reviewers in vivreal-workflow and vivreal-principal, which review product-code diffs."
}
```

**Files affected.** 1 edited file, one array element appended. `metadata.version` is **not** bumped (`brief.md` Scope OUT) — see *Open questions*.
**Blast radius.** **This is the highest-blast-radius item in the plan.** It is the single registration point for two independent systems: Claude Code plugin discovery, and `sync-to-agy.js` visibility (F17 — `:19` iterates `marketplace.plugins.forEach`). It also gates whether item 11 generates mirrors at all.
**Risk.** Medium. `claude plugin validate . --strict` passes clean today (F3) and must still pass after. A JSON syntax slip here breaks the whole marketplace, not just this plugin. Verify with `claude plugin validate . --strict; echo $?` immediately after the edit.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 8. Run the OQ-2 probe experiment (scratchpad only, no repo writes)

**Summary.** Settle whether `claude plugin validate` covers **agent** files or only skills. F4 established the tool prints only failures, and across 13 plugins and ~30 agent files every failure line was `Validating skill:` — never `Validating agent:`. If Stage 0 does not cover agents, then **Stage 1's agent rules are the sole gate even for Profile A**, and the report header must say so.

**The cheap experiment** — build a throwaway plugin in the session scratchpad with a **positive control**, so a silent run is distinguishable from a broken invocation:

```
<scratch>/probe/.claude-plugin/plugin.json     {"name":"probe"}
<scratch>/probe/agents/broken.md               frontmatter with BOTH defects:
                                                 name: probe:broken        (documented load failure)
                                                 description: Triggers on: this breaks   (unparseable YAML)
<scratch>/probe/skills/broken/SKILL.md         same unparseable description  ← positive control
```
Then `claude plugin validate <scratch>/probe --strict; echo $?`.

| Outcome | Interpretation | Header consequence |
|---|---|---|
| Output names **both** `agents/broken.md` and `skills/broken/SKILL.md` | Stage 0 covers agents. Stage 1's agent rules are a second net. | `stage 0: ran clean` |
| Output names **only** `skills/broken/SKILL.md` (control fires, agent silent) | **Stage 0 does not cover agents.** | `stage 0: ran clean (does NOT cover agent files — agent rules gated by Stage 1 only)` |
| Output names **neither**, exit 0 | Invocation is wrong; re-check the path before concluding anything. | — |

**Files affected.** Zero in the repo. Scratchpad only.
**Blast radius.** None.
**Risk.** None. Cost is ~4 scratch writes and one command.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 9. Self-validation gate

**Summary.** The brief's non-negotiable: *"An agent-validator that fails its own validation is not shippable."* Four checks, all outputs pasted into the Phase 4 report.

1. `claude plugin validate ./vivreal-agent-review --strict; echo $?` → must print exit **0**. The explicit `echo $?` is required because F4 proves a silent run is not proof of a pass.
2. `claude plugin validate . --strict; echo $?` → marketplace root still **0** after item 7.
3. The reviewer's **own Stage 1 rules** run against `./vivreal-agent-review` → **0 errors**. Warnings are allowed only if each is individually justified in the report.
4. Character/line budget check on the four authored `.md` files against D-7.

**Files affected.** None.
**Blast radius.** None — this is the gate, not a change.
**Risk.** The realistic failure is check 3 catching something in check 1's blind spot (which is exactly the point of item 8).

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 10. Run the 6 eval cases

**Summary.** Reconstruct the corpus read-only and assert the expected findings. See *Eval plan*.

**Files affected.** None in either repo. `C:\repos\vivreal-hq` is touched by `git archive` / `git show` only — **no checkout, no branch, no write**, per `brief.md` Scope OUT and findings.md:39.
**Blast radius.** None.
**Risk.** Medium — the eval must assert **presence** of specific findings, not exact totals. F22 proved `29b9404` carries **4 errors + 7 warnings** (8 defects), not the "4 findings" the brief names; a strict-equality eval fails on correct behavior.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 11. Run `sync-to-agy.js` with a scoped-diff guard

**Summary (resolves OQ-5).** **Yes — run it, once, at the end of Phase 4, then inspect the diff.**

Rationale: per F17, registering the plugin in `marketplace.json` means the **next** sync generates `skills/definition-reviewer/SKILL.md` and `skills/cmd-definition-review/SKILL.md` regardless of what this project does. The only choice is whether those files appear inside this project's reviewable diff, or as unexplained files in somebody's later unrelated commit. The former is auditable; the latter is how mystery files get hand-edited and silently reverted.

**Guard:** after running, `git status --porcelain`. If the sync touches anything outside `vivreal-agent-review/skills/`, **revert those hunks** and report the pre-existing drift as a finding rather than absorbing unrelated churn into this project's diff.

**Files affected.** 2 generated files inside the new plugin; potentially unrelated drift elsewhere (reverted by the guard).
**Blast radius.** Medium. The generated mirrors carry the agent's `tools:` and `color:` keys into a *skill* file, which is the systematic false-positive class in OQ-4 — handled by D-6's exclusion rule, so the reviewer will not flag its own mirrors.
**Risk.** Medium. Flagged in *Open questions* — a reasonable person could defer the sync to a separate commit.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

### 12. Append one row to `docs/SYNC.md`

**Summary.** One row recording this build, per the repo's own citation rule (`docs/SYNC.md:5-12`).

**Files affected.** 1 edited file, 1 row.
**Blast radius.** None.
**Risk.** None. Skippable if the user prefers `SYNC.md` to record only source-repo syncs.

- [x] APPROVE [ ] DENY [ ] REVISE
> Comments:

---

## D-3. Rule set (corrected)

Base: the kit's Stage 1 table as reproduced at findings.md:212–329. Below is the **delta** — every rule that changes, is added, or is dropped, with the reason. Rules not listed here are encoded verbatim; `docs-verification.md:361` confirms the bulk of the kit is safe to encode unchanged.

### Authority tags

`[spec]` enforced by Claude Code and doc-quotable · `[policy]` Agency marketplace rule with no upstream equivalent · `[quality]` reviewer heuristic · **`[unsupported]` NEW** — plausible from observed behavior but the docs are silent. **An `[unsupported]` finding may never be an ERROR and must carry the tag in its output line.** This tag exists because `docs-verification.md:351` caught the kit asserting `[spec]`-grade load-failure behavior the docs never state — the exact folklore failure mode the kit's own Mode A step 2 warns about.

### NEW rules

#### `ref-unresolved` — `[quality]` · **ERROR** · resolves D1 (CRITICAL)

The rule that took a real run from 26 false positives to 0, and which is **entirely absent from the kit** (findings.md:495–501 — `grep` for "basename", "directory-qualified", "false positive" returns no matches anywhere in 1,536 lines).

**Scope.** Scanned only in files Claude Code actually *loads as instructions*: `agents/**/*.md`, `commands/*.md`, `skills/*/SKILL.md`, and files those link to. **Never** in `references/`, `docs/`, or any unlinked file. Rationale: a dead citation only matters where the citation is an instruction — and this scoping is also what stops the plugin's own eval fixtures from failing its own review.

**Matching predicate.** A token is a **reference** — and therefore must resolve — if and only if **all** of:

1. **Directory-qualified.** It matches `[\w.@$-]*([/\\][\w.${}@-]+)+` — at least one separator joining two non-empty segments. A token with **no separator at all** (`post.md`, `slides.json`, `sync-to-agy.js`) is a **mention, not a reference**. Never resolve it. Never report it. *This single clause is the entire 26→0 fix.*
2. **Extension-bearing or directory-terminal.** Final segment ends in one of `.md .json .ts .tsx .js .mjs .cjs .py .ps1 .sh .txt .yaml .yml .css .html .svg .sql`, or the token ends in `/`.
3. **Not a URL.** No `://`; does not begin `http`, `mailto:`, or `#`.
4. **Not a package specifier.** `@scope/name` with no file extension is an npm package, not a path.
5. **Not a placeholder.** The token contains none of `< > * { } ...` **except** the two recognized plugin roots. `agents/<name>.md`, `skills/**/SKILL.md`, `docs/bugs/<slug>/plan.md` are templates, not citations — skip silently.

**Resolution order.** (a) `${CLAUDE_PLUGIN_ROOT}` / `${PLUGIN_ROOT}` prefix → strip it and any leading slash, resolve against the plugin root (same normalization the kit already specifies for `hook-script-exists`). (b) Otherwise try, in order: the citing file's own directory → the resolved target root → the git toplevel. Resolves if any candidate exists.

**Never flagged.** Any other `${...}` placeholder (e.g. `${VIVREAL_REPOS}/...`) is unresolvable by design → skip silently. Absolute paths outside the target tree (`C:/repos/...`, `/c/repos/...`) → skip silently. This repo's agents cite cross-repo absolute paths constantly and flagging them would manufacture a second 26-false-positive class.

**ERROR justification.** The brief calls it *"a silent dead instruction"* and *"the highest-value check in the kit."* An agent told to read a file that no longer exists does not error — it improvises. That is worse than failing.

#### `claim-false` — `[quality]` · **WARNING, escalating to ERROR** · resolves D2 (CRITICAL)

The only check that catches eval case 1, and findings.md:23 proves the kit's own Stage 1 script is **completely silent** on that file — not "weaker", *incapable*. In the kit this exists as four sentences of prose with no id, no severity, and no tag (findings.md:503). Here it is first-class.

**Step 1 — extract candidate assertions.** A sentence is a candidate when it contains **both**:
- a platform noun: `subagent`, `agent`, `tool`, `hook`, `skill`, `plugin`, `command`, `frontmatter`, `MCP`, `Agent`, `background`, `model`, `context`, `fork`, `marketplace`; **and**
- a capability modal or negation: `cannot`, `can't`, `is not able to`, `does not support`, `doesn't support`, `is stripped`, `is removed`, `only works when`, `is limited to`, `is not available`, `there is no way to`, `never`, `always`, `must be`.

**Step 2 — check the offline ledger FIRST.** Compare against `references/platform-facts.md`. This is what keeps Mode A at zero dependencies and zero network calls on the normal path. If the ledger settles it, emit with the ledger's `verified:` date attached.

**Step 3 — WebFetch only on a miss.** If the claim is not in the ledger **and** is load-bearing for the file, fetch the one relevant URL: `https://code.claude.com/docs/en/sub-agents` (agent/tool/depth claims), `.../plugins-reference` (manifest/plugin claims), `.../skills` (skill/command frontmatter claims), or `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices` (skill hard limits). One fetch per URL per run, maximum four.

**Step 4 — WebFetch failure.** On any failure (offline, 4xx, timeout, truncated), the agent **MUST NOT** assert the claim is false. It downgrades to `claim-unverified`, severity **NOTE**, with the literal text `UNVERIFIED (fetch failed: <reason>)`. Never silently drop it; never let a failed fetch produce an ERROR. A reviewer that reports a false positive because the network was down destroys its own credibility faster than missing a defect does.

**Step 5 — never invent doc support.** The agent may write *"the docs say X"* **only** when it holds a verbatim quote, from the ledger or a live fetch. If a check rests on observed behavior alone, it is emitted `[unsupported]` and capped at WARNING. `docs-verification.md:353` names the three checks currently in this bucket.

**Escalation to ERROR** — when the false claim gates the file's own primary path. The machine-checkable tell, and the reason case 1 is HIGH:
- the file **denies a capability in prose while its own frontmatter holds the corresponding tool or field** (`social-video-director.md:22` says *"subagents cannot spawn subagents"* while listing `Agent` in its own `tools`); **or**
- the file's own procedure branches on the false claim (a "degraded"/"if you were invoked as a subagent" path keyed to it).

Note the version caveat from `docs-verification.md:59`: assert the **behavior** ("subagents CAN nest"), never the literal integer `3` — the depth is a per-session default settable via `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, and it was `5` from v2.1.172–216 and `1` from v2.1.217–218.

#### `agent-frontmatter-parses` / `skill-frontmatter-parses` / `command-frontmatter-parses` — `[spec]` · **ERROR** · resolves D5

Nothing in the kit validates that frontmatter parses as YAML, and for Profile B **nothing can** — there is no Stage 0 (findings.md:514–525). This is how 34 skills in *this* repo silently load with empty metadata, no description, and no route.

**How Mode A performs it.** There is no free YAML parser available: PyYAML is not stdlib, Node ships none. So the check is a deterministic checklist targeting the exact documented failure class — findings.md:564 establishes all 34 failures here share one root cause, an unquoted scalar containing `: `.

For each top-level line matching `^([A-Za-z_][\w-]*):\s*(.*)$`, take value `V`. Emit ERROR when:
1. `V` is a **plain scalar** (non-empty; does not begin with `"` `'` `[` `{` `|` `>` `&` `*` `!`) **and** contains `: ` (colon-space) or ends with `:`; **or**
2. `V` begins with `"` or `'` and has no matching close on the same line and no block indicator; **or**
3. `V` begins with a reserved indicator `@` `` ` `` `%`; **or**
4. any **tab character** appears in the block (YAML forbids tabs for indentation); **or**
5. the closing `---` fence is absent.

**Corroboration and honesty about confidence.** In Profile A the agent cross-checks Stage 0, which emits this exact error and names the file, and the finding is reported as `corroborated by Stage 0`. In Profile B it is reported as `checklist-only (Profile B has no Stage 0 equivalent)`. Same rule, two confidence levels, both stated — the reader always knows which they got.

#### `generated-mirror-drift` — `[quality]` · **WARNING** · supports D-6

A `skills/<X>/SKILL.md` that matches the generated-mirror naming pattern but is **not** byte-identical to its source. Someone hand-edited a generated file and `sync-to-agy.js` will silently revert it (F16). Costs nothing to check once mirror detection exists, and catches a real, silent, repo-specific data-loss mode.

#### `agent-tools-precedence` — `[spec]` · **WARNING**

From `docs-verification.md:335`. A tool listed in **both** `tools` and `disallowedTools` is removed; `disallowedTools` applies first. Listing the same tool in both is a self-contradiction.

#### `agent-plugin-nested-identity` — `[spec]` · **WARNING**

From `docs-verification.md:145`. An agent file in a **plugin** subfolder registers as `<plugin>:<subfolder>:<name>` — three segments. Callers using the two-segment name will not resolve it. (Not a defect in itself; a defect when the file or its callers assume two segments.)

### CHANGED rules

| Rule | Change | Why |
|---|---|---|
| `command-frontmatter-valid` / skill field set | **Add `when_to_use`** → 20 keys | `docs-verification.md:243`: *"the one drift that produces wrong output on valid input."* Ship without this and the agent WARNs on every skill using a documented, encouraged field. **Highest-priority correction in the whole set.** |
| `agent-tools-never-available` | Drop "unconditionally"; **add the fork carve-out** | `docs-verification.md:71`: *"Forks skip both filters and receive the main conversation's exact tool pool."* The kit's strongest claim is overbroad. |
| `agent-name-format` | ERROR **only** for `:` in `name`. Digits → **WARNING**, `[quality]` | The `:` case is the sole *documented* agent load failure (`docs-verification.md:110`). The docs say "lowercase letters and hyphens" but that phrasing is descriptive, not exhaustive — ERRORing on a digit would be asserting doc support we do not hold, the exact thing this agent exists to catch. |
| `agent-stray-md` | Re-tag `[quality]` → **`[unsupported]`**, keep WARNING, soften wording | `docs-verification.md:159`: the docs are **silent** on frontmatter-less `.md` in `agents/`. Report it as hygiene, never as a load-failure claim. |
| `manifest-name-match` | ERROR → **WARNING**, and it is a policy rule (off by default) | D4. The kit states ERROR then immediately concedes upstream allows it; `plugins-reference:465` agrees. An ERROR blocking a configuration the docs explicitly support is mis-severed. |
| `skill-description-truncation` | Measure **`description` + `when_to_use`** combined against 1,536 | D6. The kit's implementation measures `description` alone, so it can never detect the documented condition, and any description >1,536 already tripped the >1,024 ERROR — the warning only ever fires alongside an error and adds nothing. |
| `secret-in-tree` | Test **path segments** too; require a delimiter boundary; exempt `.md`/`.txt` from the loose `*secret*`/`*credential*` substrings | D7. The kit tests `p.name` only, so a `secrets/` directory of innocuously-named files is invisible, while a legitimate doc named `iam-secrets.md` would ERROR. Wrong in both directions; it passes on this repo by accident. Keep the git-ignored exemption. |
| `empty-directory` | ERROR → **WARNING**, stays ON | Tagged `[policy]` but genuinely useful outside Agency. Nothing in the docs makes an empty `skills/` a load failure, so ERROR overstates it. |
| `command-argument-hint` | Extend trigger set to `$ARGUMENTS`, `$ARGUMENTS[N]`, `$0`, `$1`, …, and `$name` | `docs-verification.md:340`. Also: any prose treating `$1` as "the first argument" is **wrong** — indices are 0-based. |
| Stage 0 prose | Never parse or assert `claude plugin validate`'s output shape | `docs-verification.md:224`: validate has **no** CLI-reference section, no options table, no documented output format. Run it, report exit code and any lines it prints; do not pattern-match its format. |

### DROPPED rule

| Rule | Why |
|---|---|
| `agent-md-depth` (body ≥30 lines) | **Resolves OQ-7.** Unsourced `[quality]`, and in direct contradiction with the kit's own Stage 2 ANTI-VERBOSITY control (*"a concise clear file MUST score ≥ a long vague one"*). A tool whose job is definition **quality** must not reward line count. Replaced by a content-completeness check folded into `agent-output-format`: does the file state its **purpose**, its **procedure**, and its **output shape**? Trivially restorable if the user disagrees. |

### D-3 · Policy posture (resolves D3)

**Agency `[policy]` rules default OFF.** F13 established the cleanest possible predicate: *every* Profile-A-only ERROR rule is a `[policy]` rule. And every one of them mis-fires here — `readme-exists` false-ERRORs on **all 13** plugins (none has a README, F18), and `--author-domain` defaults to `microsoft.com`.

- **OFF by default:** `manifest-exists`, `manifest-field-<f>` (description/version/author), `manifest-name-match`, `manifest-author-emails`, `readme-exists`, `readme-length`, `agency-valid-json`, `agency-valid-engine`.
- **Stays ON:** `empty-directory` (downgraded to WARNING) and `secret-in-tree` (ERROR, security, with the D7 predicate fix). Neither is an Agency-marketplace support rule in substance.
- **Switch:** `--policy=agency` turns the bundle on. Default is `--policy=off`.
- **Never silent.** The header always prints `policy rules: OFF (Agency marketplace; --policy=agency to enable)`. An omitted check that the reader cannot see is indistinguishable from a passed check, which is its own defect.

### D-3 · Severity is guidance, not a lookup

The table assigns a **default**. The agent applies five adjudication tests and **must print a one-line reason whenever it deviates from the default.** A deviation without a stated reason is itself a defect in the report.

1. **Load-failure test → always ERROR.** Does the defect stop the file loading at all (`:` in `name`, unparseable frontmatter)? Overrides the table upward, unconditionally.
2. **Purpose-dependency test → escalate.** Does the file's stated purpose depend on the broken thing? An intake agent that can never ask a question fails silently, and a guessed answer is worse than none.
3. **Documented-escape-hatch test → de-escalate.** Does the body document a path where the finding is legitimate (`claude --agent <name>`, "main thread", "MAIN conversation", "session agent", a fork)? **Present → NOTE.** **Absent → escalate.** This one test is the entire difference between eval case 2 (escalates) and eval case 5 (must not) — *the same rule, the same `tools` line, opposite verdicts, decided from body evidence.* That is why this cannot be a severity table.
4. **Right-fix test → de-escalate to WARNING and name the fix.** If the correct remediation is **documentation** rather than deletion, it is a WARNING that says so. This is the `agent-tools-never-available` lesson verbatim: it was first written as an ERROR and that was **wrong**, because the right fix was to document the main-thread invocation, not to strip the tool. The upstream repo proved it — the `tools` line is unchanged at HEAD; only the documentation changed (findings.md:432–453).
5. **Doc-support test → cap at WARNING.** `[unsupported]` findings can never be ERRORs and must carry the tag.

---

## D-4. Profile detection

The #1 documented false-failure mode. Run **first**, before any rule.

**Order of operations, first match wins:**

1. `<target>/.claude-plugin/marketplace.json` exists **and** `<target>/.claude-plugin/plugin.json` does not → **Profile A-multi**. Enumerate `plugins[].source`, review each as its own Profile A target, emit one section per plugin plus a roll-up verdict. *(New — the kit has no such case, and without it the reviewer pointed at `C:/repos/vivreal-skills` itself misclassifies and reviews nothing.)*
2. `<target>/.claude-plugin/plugin.json` exists → **Profile A**, root = `<target>`.
3. `<target>` directly contains `agents/`, `skills/`, or `commands/` → **Profile B**, root = `<target>`.
4. `<target>/.claude/` contains any of those → **Profile B**, root = `<target>/.claude`.
5. Otherwise → **NO-TARGET**. **Do not run any rule.** Emit `VERDICT: NO-TARGET` plus one reason line and stop. *(New. Running the Profile-A ERROR bundle against an arbitrary directory is precisely how the kit produced four bogus ERRORs.)*

**The header always prints the profile and the resolved root**, because "which profile did you decide I was" is the first question a false-failure investigation asks. Profile A-only rules are hard-gated on the detection result — never inferred per-file.

---

## D-5. Mode A / Mode B

**Mode A (agent-native) is the default, always.** No pip install, no backend, no API key on the normal path. Mode A is not the degraded option: findings.md:503 proves it is the *only* option for the two highest-value checks, because a regex cannot resolve a cross-file reference and cannot verify a platform claim.

**Mode B is offered — not run — only when** the caller explicitly asks for CI-shaped or repeatable output, the same target will be re-checked on a schedule, or the caller wants Stage 2's LLM-judge scores (which have no honest Mode A equivalent). The agent offers it in one sentence at the end of the report and never switches unasked.

**Python is available** — F2 confirms Python **3.14.0** on both `python` and `python3`, exceeding the kit's 3.10+ floor; `structural_check.py` was extracted, `py_compile`d clean, and run successfully four times. So Mode B is viable. It is still not the default and the scripts are **not vendored** (`brief.md` Scope OUT).

**Materialization runbook** (scratch only — never write a script into the repo):

1. Confirm the kit file exists at `C:/Users/jcecc/OneDrive/Desktop/MiscThings/# Local Plugin & Agent Validation K.txt`. If absent, Mode B is **unavailable** — say so and stop. **Never synthesize a substitute script**; an invented validator that reports confidently is worse than no validator.
2. Verify the fence lines before extracting: line 355 and line 778 must be fences for `structural_check.py`; 948 and 1326 for `judge.py`. If they are not, the kit has been edited — re-locate the fences rather than extracting a wrong range.
3. Extract by range into the scratchpad: `sed -n '356,777p'` and `sed -n '949,1325p'`.
4. **Apply two corrections to the scratch copy** (this is a scratch artifact, not an edit to the kit — item D-10 keeps kit edits advisory):
   - add `when_to_use` to `SKILL_FIELDS`, or Mode B false-positives on every valid file using it;
   - set `PYTHONIOENCODING=utf-8` in the invoking environment (D10 — the em-dash in `agent-name-format`'s message mojibakes on a cp1252 Windows console).
5. Always pass `--author-domain ""`, consistent with the policy-off default.
6. Report Mode B results as **corroborating** Mode A, never as replacing it, and state plainly that Mode B cannot perform `ref-unresolved` or `claim-false`.

---

## D-6. Generated-mirror handling (resolves OQ-4 / OQ-5)

**Decision: the reviewer excludes generated mirrors, identified by a computed signal rather than a marker.**

The signal, since they carry no marker today (F16 — byte-identical committed copies with no provenance comment): a `skills/<X>/SKILL.md` is a generated mirror **iff** a sibling source exists and the two are **byte-identical** —
- `<plugin>/agents/<X>.md`, or
- `<plugin>/commands/<Y>.md` where `<X> == "cmd-" + <Y>`.

Byte-identity is the right test because `sync-to-agy.js` writes `fs.writeFileSync` with **unmodified** source and no transform (F16, verified by two `diff`s returning IDENTICAL).

**Why exclude.** The mirrors carry agent-only keys (`tools`, `color`) into a skill file and therefore trip `skill-unknown-field` for all 8 agent mirrors in `vivreal-workflow` alone — a systematic false-positive class, an artifact of the sync design rather than a defect in anything.

**Nothing is lost.** Findings against the **source** file report normally. Only the duplicate is suppressed. The header prints the count — `excluded: 23 generated skill mirrors (byte-identical to agents/ or commands/ sources)` — so the suppression is visible and auditable, never silent.

**And it earns a new check.** A file matching the mirror *naming* pattern that is **not** byte-identical is `generated-mirror-drift` (WARNING): someone hand-edited a generated file and the next sync will revert it. Free to compute once mirror detection exists, and it catches a real silent data-loss mode in this repo.

**Should `sync-to-agy.js` run in this project?** **Yes, once, at the end of Phase 4, with a scoped-diff guard** — see change item 11 for the full rationale and the guard. Flagged in *Open questions* as reasonably deferrable.

---

## D-7. Hard constraint the coder must not violate

**Because `sync-to-agy.js` copies agent and command files verbatim into `SKILL.md`, these files ARE skill files and are bound by the skill `[spec]` limits.** OQ-3 shows 11 descriptions in this repo already blow the 1,024-char limit. The new agent must not become defect #35 in its own report.

| Constraint | Spec limit | **Budget for this build** | Rule |
|---|---|---|---|
| Agent `description` length | 1,024 chars (**ERROR**) | **≤ 900** | `skill-description-length` |
| `description` + `when_to_use` combined | 1,536 chars before listing truncation | put the primary use case in sentence one | `skill-description-truncation` |
| Agent body | 500 lines (WARN) | **≤ 320 lines total, frontmatter included** | `skill-body-500` |
| Agent `name` | ≤64 chars, lowercase letters/numbers/hyphens, **no `anthropic`, no `claude`** | `definition-reviewer` (19) | `skill-name-reserved` |
| XML tags in `name`/`description` | forbidden | **no `<example>` blocks, no angle brackets at all** in the description | `skill-name-charset`, `skill-description-length` |
| Command `description` | same 1,024 | ≤ 400 | mirrored to `skills/cmd-*/SKILL.md` |
| `plugin.json` `description` | 200 chars (WARN) | **≤ 200** — a *much* tighter, separate budget | `manifest-description-length` |
| Paths in every plugin file | forward slashes only, incl. `C:/repos/...` | — | `skill-windows-paths` |
| Reference depth | one level from the body | body links `references/rules.md` and `references/platform-facts.md` directly; **neither links to the other** | `skill-refs-one-level` |
| Reference files >100 lines | need a table of contents | both do | `skill-toc-100` |

**The YAML rule that outranks all of them.** The agent and command `description` values **must contain no colon-space (`: `) sequence and must not begin with `"`, `'`, `[`, `{`, `|`, `>`, `&`, `*`, or `!`.** An unquoted YAML scalar containing `: ` is the single root cause of all 34 broken skills in this repo (findings.md:564) — the file loads with **empty metadata, no description, and can never be routed to.** Writing `Typical triggers include: "review my agents"` instead of `Typical triggers include "review my agents"` would silently destroy this agent while every validation still reported success. Do not do it.

---

## D-8. Output contract

Exact format. A caller may rely on every guarantee listed below it.

```
## Definition Review — <target name>
VERDICT: PASS   profile A   root: C:/repos/vivreal-skills/vivreal-agent-review
mode: A (agent-native)   stage 0: ran clean
policy rules: OFF (Agency marketplace; --policy=agency to enable)
excluded: 2 generated skill mirrors (byte-identical to agents/ or commands/ sources)
counts: 0 errors, 1 warnings, 2 notes

### Errors (0)
None.

### Warnings (1)
! [agent-output-format] agents/runner.md:52 — "## How to report" names what to say but not
  the shape of the return value; callers cannot rely on the result.
  → Add an "## Output Format" section with a literal template.

### Notes (2)
- [agent-tools-never-available] agents/prompt.md:4 — AskUserQuestion is stripped from every
  subagent, but the main-thread path is documented at :9-17 ("claude --agent prompt").
  Correct as written. NOT a blocker. [de-escalated: documented-escape-hatch test]

### Advisory — discovery_fit (excluded from the verdict)
4/5 — Third person, primary use case first, trigger vocabulary a user would type.
Boundary against the sibling reviewers is explicit.

### Unverified (0)
None.

Stage 1: errors=0 warnings=1 notes=2 passed=true
```

**Guarantees a caller may rely on.**

1. **Line 2 always begins `VERDICT: `** followed by exactly one of `PASS`, `FAIL`, `NO-TARGET`.
2. **`PASS` iff `errors == 0`.** Warnings and notes never affect the verdict.
3. **The last line is always** `Stage 1: errors=<E> warnings=<W> notes=<N> passed=<true|false>` — machine-parseable, and consistent with the kit's existing exit contract (F15).
4. **Every finding line** begins with `x ` (error), `! ` (warning), or `- ` (note), then `[rule-id]`, then `file:line`. `file` is **relative to the resolved root**. File-level findings with no meaningful line use `:1`.
5. **Every finding names the fix** after a `→`. A finding without a remediation is an observation, not a review.
6. **Any severity deviation from the default table prints its reason** in brackets, naming which of the five adjudication tests fired.
7. **`discovery_fit` is reported in its own section, as a single integer 1–5 plus 1–2 sentences, and is excluded from the verdict and from any pass average** — kit:886-887, it is not in the upstream rubric. Mode A produces **only** this dimension and **not** the other six Stage 2 dimensions: those need the judge's anchors and bias controls to mean anything, and a hand-waved 1–5 is worse than an absent one.
8. **`Unverified` is always present**, even when empty. A silently dropped unverifiable claim is indistinguishable from a verified one.
9. **`NO-TARGET` replaces the entire body** with the verdict line plus one reason line.
10. **The header states what did not run** — profile, mode, Stage 0 status, policy posture, exclusion count. If item 8's probe shows Stage 0 does not cover agents, the Stage 0 field reads `ran clean (does NOT cover agent files — agent rules gated by Stage 1 only)`.

---

## Agent frontmatter, field by field

```yaml
---
name: definition-reviewer
description: <the 863-char text below, on one unquoted line>
tools: Read, Grep, Glob, Bash, WebFetch
model: sonnet
color: cyan
---
```

| Field | Value | Justification |
|---|---|---|
| `name` | `definition-reviewer` | D-2. Lowercase+hyphens, no digits, no `:`, no reserved word, 19 chars. |
| `description` | below | Router-facing. ~863 chars, inside the 900 budget and the 1,024 spec limit. |
| `tools` | `Read, Grep, Glob, Bash, WebFetch` | Exactly the brief's five. **All five survive the background filter** (`sub-agents.md:341`) so `agent-tools-background-filter` cannot fire; **none is in the never-available set** so `agent-tools-never-available` cannot fire. No `Edit`/`Write` — the read-only guarantee is enforced by the tool list, not merely asserted in prose. |
| `model` | `sonnet` | House convention (`portal.md:5`). Justified on substance too: this is deterministic rule application across many files, and the judgment calls are narrow and enumerated. `inherit` would silently escalate cost on an opus session for no quality gain. |
| `color` | `cyan` | In the documented 8-color set. Distinct from `blue` (portal expert). Note the doc-internal inconsistency at `docs-verification.md:116` — `color` appears in the sub-agents table but not the plugins-reference plugin-agent list; sub-agents is the fuller reference and every sibling agent here sets it, so keep it. |
| **not set** | `hooks`, `mcpServers`, `permissionMode` | Dead config in a plugin (`agent-plugin-ignored-field`). |
| **not set** | `disallowedTools` | Would risk `agent-tools-precedence` for zero benefit. |

### Drafted `description` (house style)

> Use this agent to review Claude Code definition files — agent, skill, command, and plugin `.md`/`.json` files — and report what is wrong with them. Typical triggers include "review my agents", "validate this plugin", "why doesn't my skill trigger", "check my .claude directory", a failing `claude plugin validate`, or shipping a new agent/command/plugin. It detects the target profile first (packaged plugin vs bare `.claude/`), resolves every directory-qualified cross-file reference, and checks platform claims in agent prose against the live Claude Code docs. Read-only; it reports findings with `file:line` and never edits the files it reviews. Distinct from `vivreal-workflow:reviewer` and `vivreal-principal:principal-reviewer`, which review product-code diffs — this one reviews only the configuration that defines Claude Code itself, and reviews no application code.

**House exemplar it is patterned on** — `vivreal-experts/agents/portal.md:3` (501 chars, quoted at findings.md:202):

> `description: Use this agent when working in or investigating Vivreal_Portal_Mobile, or when a task touches the portal's edge proxy routes, the three-tier API rule (createAuthAxios vs publicAxios vs fetch), CSRF, the createProxyHandler factory, signed-URL media via /api/proxy/get-media, or SSR/hydration conventions. Typical triggers include "how should this proxy route be built" and portal architecture questions. Read-only system-expert consultant for the Next.js 16 portal; reports gotchas, never edits source.`

Structural correspondence: `Use this agent…` opener with the **primary use case first** · `Typical triggers include "…"` with quoted user phrasings · closing **read-only** clause. Added on top: an explicit **boundary sentence**, which is an established house device — `reviewer.md:3` (*"distinct from the standalone reviewer skill"*), `vivreal-ops.md:3` (*"Distinct from principal-architect … and the sentry agent …"*), `marketplace.json:50` (findings.md:196–199). The boundary is drawn on the axis that actually separates them: **subject matter**. The siblings review product-code diffs; this reviews the configuration that defines Claude Code itself.

**Not** patterned on the four rich agents (`vivreal-ops`, `finance-auditor`, `marketing-auditor`, `ux-critic`) whose descriptions run 2,268–2,604 chars with embedded `<example>` blocks — those are **already over the 1,024 `[spec]` limit** and are among the 11 defects in OQ-3. Copying them would make this agent fail its own review.

**Verify before writing:** no `: ` anywhere in the text (checked — the draft has none), no angle brackets, does not begin with a quote character.

---

## Agent body skeleton, section by section

Ordered for **best signal early** — judges and readers truncate long files. Line budget in brackets; total ≈292 of the 320 allowed.

1. **`## Identity`** [5] — Name / Role / "You ARE the Definition Reviewer. Don't say 'As the reviewer, I would…'". House convention (`portal.md:11-14`).
2. **`## Guardrails (read this before anything)`** [18] — read-only; the three false-failure modes **ranked** (1 profile misdetection, 2 policy-rules-on-outside-Agency, 3 treating a bare basename as a reference); and the standing rule *never assert doc support you do not hold*.
3. **`## Worked example — input → actions → output`** [34] — one **complete, short, `file:line`-cited** example, near the top as the brief requires. Uses eval case 1 condensed: input = a target path; actions = four numbered tool calls (Glob the agents tree → Read `social-video-director.md` → check `:22` against `references/platform-facts.md` → note the internal contradiction with its own `tools` line); output = the exact report fragment including the escalation reason. One example, not three — the point is to fix the output shape, not to pad.
4. **`## MUST / MUST NOT`** [16] — explicit, promoted high because it is short and high-signal. MUST detect profile first; MUST cite `file:line`; MUST name a fix per finding; MUST print the reason for any severity deviation; MUST report unverifiable claims as unverified. MUST NOT edit; MUST NOT resolve bare basenames; MUST NOT assert doc support without a quote; MUST NOT run policy rules unasked; MUST NOT parse `claude plugin validate` output shape.
5. **`## Procedure`** [70] — Step 0 profile detect → 1 inventory + mirror exclusion → 2 Stage 0 (Profile A only) → 3 Stage 1 rules → 4 cross-file references → 5 platform claims → 6 severity adjudication → 7 discovery_fit → 8 emit.
6. **`## Rule set`** [45] — rule IDs grouped by family, the non-obvious predicates inline, and a direct link to `references/rules.md` for the full table.
7. **`## Severity is guidance, not a lookup`** [24] — the five adjudication tests, with the `agent-tools-never-available` lesson stated as the worked case.
8. **`## Output Format (MANDATORY)`** [40] — the literal indented template from D-8, matching the house pattern at `portal.md:71-88`.
9. **`## Mode B (only when asked)`** [18] — the D-5 runbook, including "never synthesize a substitute script".
10. **`## Boundaries`** [6] — *I handle: read-only review of Claude Code definition files, with citations. I defer to: the coder for any edit, `vivreal-workflow:reviewer`/`vivreal-principal:principal-reviewer` for product-code diffs, and the user for judgment calls.*
11. **`## DON'Ts`** [8] — 6 imperative lines. The read-only line mirrors `portal.md:95` verbatim in shape:

> DON'T edit any file (your tools don't include Edit/Write — confirm before any output). Use Bash for read-only commands only — never to write or modify files.

Plus: DON'T flag a bare basename as an unresolved reference. DON'T report a claim as false when the fetch failed. DON'T run Agency policy rules unless asked. DON'T write into the target being reviewed, or into `C:/repos/vivreal-hq` under any circumstances. DON'T exceed the output contract.

---

## Command file

```yaml
---
description: Review Claude Code definition files — the agent, skill, command, and plugin .md/.json files that configure Claude Code itself. Dispatches the definition-reviewer subagent and returns only the verdict. Read-only.
argument-hint: <path to a plugin dir, repo root, or .claude/ dir | plugin name | --policy=agency | --mode=b | (no args = current repo)>
---
```

House convention is `description` + `argument-hint` only (F20 — `reviewer.md:1-4`, `orchestrate.md:1-4`, `research.md:1-4`). No `allowed-tools`, no `user-invocable` — those appear only on `proxy-route.md` and are not the majority pattern.

**Body**, following the F20 shape:

```
You are dispatching the definition-reviewer agent. The user invoked
`/definition-review` with: **$ARGUMENTS**

## Input Detection
1. **No arguments** → target is the current working directory.
2. **A path** → use it as the target.
3. **A plugin name** matching a `plugins[].name` in `.claude-plugin/marketplace.json`
   → resolve that entry's `source` to an absolute path.
4. **`--policy=agency`** → pass through; enables the Agency policy bundle.
5. **`--mode=b`** → pass through; the agent offers the Mode B runbook.

## Setup
1. **Resolve the target to an ABSOLUTE path before dispatching** (`pwd` for the
   no-argument case). Never pass the literal string `.`: profile detection joins
   the target with `.claude-plugin/plugin.json`, and a relative target resolves
   against the subagent's cwd, not the caller's.
2. Confirm the path exists. If not, stop and say so — do not dispatch.
3. Tell the user the resolved target and the detected profile hint.

## Dispatch
... subagent_type: definition-reviewer, with the resolved absolute path,
    the policy posture, and the mode ...

## Post-Dispatch
1. Show the verdict line, the counts, and every ERROR verbatim.
2. If errors exist, suggest the highest-leverage fix first.
3. If clean, state which checks did not run (policy bundle, Stage 0 on Profile B).
```

**How the target defaults to cwd (D-5 of the brief's asks):** detection form 1 above, plus the Setup step-1 absolutization. That second half is the part that actually matters — a relative `.` handed to a subagent silently resolves somewhere else and produces a confident review of the wrong directory.

**`$ARGUMENTS` only, never `$1`.** Indices are 0-based (`docs-verification.md:251`), so `$1` is the *second* argument — a trap worth simply not entering. Referencing `$ARGUMENTS` is what obliges the `argument-hint`, satisfying `command-argument-hint`.

---

## Eval plan (D-9)

**Location:** `vivreal-agent-review/references/evals/` — inert, unscanned, unmirrored, and outside `empty-directory`'s watched set.

**Form: assertions, not snapshots.** Per `shared-standards`: *"Assert CORRECT behavior, never current behavior… Snapshotting output freezes the bug into a requirement."* Each case asserts that a `(rule-id, file, severity-class)` tuple is **PRESENT** (positive cases) or **ABSENT** (negative cases). **Extra findings are allowed and listed, not failed** — F22 proved `29b9404` carries **4 errors + 7 warnings** (8 defects), not the "4 findings" the brief names, so a strict-equality eval fails on correct behavior.

**Corpus reconstruction — read-only, no exceptions:**

```bash
git -C C:/repos/vivreal-hq archive 29b9404 .claude | tar -x -C <scratch>/hq-before
```
No checkout, no branch, no write inside `C:\repos\vivreal-hq` (`brief.md` Scope OUT; findings.md:39). HEAD is reviewed the same way.

| # | Case | File | Expect | Notes |
|---|---|---|---|---|
| 1 | False platform claim | `.claude/agents/social-video-director.md:22` | `claim-false` **ERROR** | *"subagents cannot spawn subagents"*. Escalates because the file lists `Agent` in its own `tools`. **The kit's Stage 1 is silent on this file** (findings.md:23) — this case is the whole reason the agent exists. Assert the **behavior** ("subagents CAN nest"), never the integer `3`. |
| 2 | Never-available tool, no documented path | `.claude/agents/prompt.md:4` | `agent-tools-never-available` **WARNING, escalated** | Purpose depends on it (`:29`, `:97`); zero main-thread documentation hits at that commit. |
| 3 | Frontmatter-less `.md` in the scanned tree | `.claude/agents/content-creator/README.md:1` | `agent-stray-md` **WARNING `[unsupported]`** | Requires a **recursive** scan (one directory deep) keyed on `.md` **only**. |
| 4 | No output contract | `.claude/agents/runner.md:52` | `agent-output-format` **WARNING** | `## How to report` states intent but not shape — defeats a naive `^## Output` check, so the rule needs heading breadth **plus** a shape requirement. |
| 5 | **NEGATIVE** — same tool, now documented | `.claude/agents/prompt.md:4` @ HEAD | `agent-tools-never-available` present as a **NOTE**, **not** a blocker | Main-thread path documented at `:9-17`. The rule firing is correct; only the escalation must not. |
| 6 | **NEGATIVE** — deliberate `.txt` | `.claude/agents/content-creator/README.txt` @ HEAD | **no finding of any kind** | The stray rule is scoped to `.md` only. Any widening re-flags this and is wrong. |
| — | Baseline | `C:/repos/vivreal-hq` @ HEAD | **0 errors** repo-wide | F21. |
| — | Corpus totals | @ `29b9404` | **≥4 errors, ≥7 warnings** | Includes the 4 `agent-name-format` `:`-in-name errors the brief never mentions (F22). |

**Additional false-positive regression** (not in the brief, but it is where this agent will actually run): point it at `C:/repos/vivreal-skills` and assert (a) it detects **Profile A-multi**, (b) it reports **zero** `readme-exists` errors with the default policy posture, (c) it reports **zero** `skill-unknown-field` findings against generated mirrors, and (d) it **does** report the 34 `*-frontmatter-parses` errors — those are real, and finding them is the point.

---

## Rollout considerations

- **Qualified names are mandatory.** Standing repo memory: bare skill names fail with "Unknown skill". Every reference in docs, commands, and this design uses `vivreal-agent-review:definition-reviewer` and `vivreal-agent-review:cmd-definition-review`. Never the bare form.
- **Plugin-cache refresh.** A newly registered plugin will not appear until the installed-plugins cache refreshes (per repo memory: manual refresh via `installed_plugins.json`). Phase 4 should verify the agent actually resolves after registration, not merely that the files exist.
- **No marketplace version bump.** `metadata.version` stays `1.10.0` per `brief.md` Scope OUT. Flagged below — the user may want `1.11.0` for cache-refresh reasons.
- **Generated mirrors appear on the next sync** whether or not this project runs it (F17). Change item 11 chooses to make them appear inside this project's diff.
- **The 34 broken skills stay broken.** Out of scope, reported not fixed (OQ-3). The new agent will report them on its first real run, which is the correct demonstration of value.
- **Ledger staleness is the long-term maintenance cost.** `references/platform-facts.md` is a dated snapshot. Every finding derived from it prints the ledger date, so decay is visible in the output rather than silent.

---

## Test plan

| # | Test | Pass condition | Blocking |
|---|---|---|---|
| 1 | `claude plugin validate ./vivreal-agent-review --strict; echo $?` | prints **0**; output pasted | **Yes** — the brief's DoD |
| 2 | `claude plugin validate . --strict; echo $?` | still **0** after the marketplace edit | **Yes** |
| 3 | Reviewer's own rules vs `./vivreal-agent-review` | **0 errors**; each warning individually justified | **Yes** — the brief's DoD |
| 4 | OQ-2 probe (item 8) | one of the three outcomes recorded; header wording set accordingly | **Yes** |
| 5 | Eval cases 1–4 @ `29b9404` | all four tuples present at the stated severities | **Yes** — the brief's DoD |
| 6 | Eval cases 5–6 @ HEAD | case 5 present as a **NOTE**, case 6 absent entirely | **Yes** — the brief's DoD |
| 7 | Baseline @ HEAD | 0 errors repo-wide | Yes |
| 8 | False-positive regression vs this repo | Profile A-multi; 0 `readme-exists`; 0 mirror findings; 34 frontmatter-parse errors found | Yes |
| 9 | Budget audit (D-7) | description ≤900, body ≤320 lines, plugin.json description ≤200, **no `: ` in any description** | **Yes** |
| 10 | Post-sync check (item 11) | `git status` shows only the 2 expected mirrors | Yes |

---

## Recommended kit corrections (advisory — not scheduled)

The docs did **not** move (F6/F7/F10 — both URLs 200, no redirect, every checkable claim matches verbatim), so the brief's conditional *"if they moved, fix the kit file too"* **did not trigger**. This design plans **no edit to the kit file**. The list below is for the user to decide on separately.

**Ranked by consequence:**

| # | Correction | Severity | Why |
|---|---|---|---|
| 1 | Add `when_to_use` to `SKILL_FIELDS` and to the `command-frontmatter-valid` row | **Highest** | The only kit drift that produces **wrong output on valid input** (`docs-verification.md:316`). |
| 2 | Add the missing `ref-unresolved` rule with a precise bare-basename exclusion | **Critical (D1)** | The kit's single highest-value rule is absent entirely; a coder implementing from the kit alone reproduces the 26-false-positive run. |
| 3 | Promote the platform-claim check to a first-class rule with id, severity, and tag | **Critical (D2)** | Currently four sentences of prose, yet it is the only thing that catches the corpus's highest-severity defect. |
| 4 | Add a `--no-policy` switch; default the Agency `[policy]` bundle OFF outside Agency | **High (D3)** | `readme-exists` false-ERRORs on all 13 plugins here; `--author-domain` defaults to `microsoft.com`. |
| 5 | Add `*-frontmatter-parses` rules; state plainly that Profile B has **no** YAML-validity check at any stage | **High (D5)** | 34 real skills silently load with empty metadata. |
| 6 | Remove "unconditionally" from `agent-tools-never-available`; add the fork carve-out | Medium | `docs-verification.md:293`. |
| 7 | `manifest-name-match` ERROR → WARNING | Medium (D4) | The rule contradicts its own note and the live docs. |
| 8 | Re-tag `agent-stray-md` as unsupported-by-docs; soften the load-failure assertion | Medium | `docs-verification.md:321`. |
| 9 | Fix `skill-description-truncation` to measure `description` + `when_to_use`, or delete it | Medium (D6) | Currently unreachable except alongside an ERROR. |
| 10 | Fix `secret-in-tree` to test path segments and anchor the substrings | Low (D7) | Wrong in both directions; passes here by accident. |
| 11 | `agent-name-format` — drop "numbers", or re-tag the digit allowance as `[quality]` | Low | `docs-verification.md:298`. |
| 12 | Add `agent-tools-precedence` and the plugin-scope nested-identity rule | Low | `docs-verification.md:335`, `:326`. |
| 13 | Correct `command-argument-hint` to 0-based `$N` semantics | Low | `docs-verification.md:340`. |
| 14 | Stage 0 section — stop claiming a documented output contract | Low | `docs-verification.md:331` — validate has no CLI-reference section at all. |
| 15 | Replace the synthetic `demo` plugin in "Verify your build" with the real 6-case corpus | Low (D9) | The kit's own Sources table cites eval-first guidance the kit does not follow. |
| 16 | Prefer ASCII in emitted messages, or document `PYTHONIOENCODING=utf-8` | Low (D10) | Windows-first repo; the em-dash mojibakes on cp1252. |
| 17 | Reconsider `agent-md-depth >= 30` | Low (OQ-7) | Contradicts Stage 2's own ANTI-VERBOSITY control. Dropped in this design. |

---

## Open questions I could not resolve

These are genuinely the user's preference. **None blocks Phase 3** — a default is stated for each so the one-pass build proceeds.

1. **Bump `marketplace.json` `metadata.version` 1.10.0 → 1.11.0?** `brief.md` Scope OUT says no. But repo memory records that version bumps are part of release mechanics and interact with plugin-cache refresh, so the new plugin may not surface for consumers without one. **Default taken: do not bump.** Say the word and it becomes a one-character change.
2. **Update `marketplace.json` `metadata.description`?** It enumerates what the marketplace contains and will be one capability out of date. Arguably in scope, arguably a release concern. **Default taken: leave it.**
3. **Run `sync-to-agy.js` in this project (item 11)?** I made the call — **yes, with a scoped-diff guard** — because the mirrors get generated on the next sync regardless (F17) and it is better for them to land in a reviewable diff. A reasonable person defers it to keep this diff minimal. **Reversible either way.**
4. **Fix the 34 broken skills (OQ-3)?** Out of scope per the brief, and I recommend keeping it that way — the new agent's first real run *reporting* them is a better demonstration than quietly fixing them mid-build. But they are real defects that mean 34 skills can never be routed to, which is a live product problem. **Recommend a follow-up project.**
5. **Apply any of the 17 kit corrections?** The docs did not move, so nothing is forced. The list above is ranked; items 1–3 are the ones I would actually do. **Default taken: recommend only, change nothing.**

**Also unresolved but self-resolving:** OQ-2 (does `claude plugin validate` cover agent files?) is not answerable from Phase 1 evidence, but change item 8 specifies a four-file, one-command experiment with a positive control and all three interpretations pre-written, so Phase 4 settles it deterministically rather than guessing.

---

*Written by Architect, Phase 2. Design only — no agent, command, or manifest file was created, edited, or scaffolded in this phase.*
