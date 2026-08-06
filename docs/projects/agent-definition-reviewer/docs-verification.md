# Docs re-verification — `agent-definition-reviewer`

**Re-verified:** 2026-08-06 (same calendar day the kit claims; kit header says "verified 2026-08-06")
**Kit under review:** `C:\Users\jcecc\OneDrive\Desktop\MiscThings\# Local Plugin & Agent Validation K.txt`
**Method:** live `WebFetch` of every Sources-table URL that a Stage 1 rule depends on. No claim below is asserted without quoted doc text.

---

## Verdict

> **PARTIALLY.** The two load-bearing claims the build brief rests on — **subagents can spawn subagents up to three layers deep**, and **`AskUserQuestion` is stripped from every subagent** — are both **doc-confirmed today, verbatim**. But the kit is materially wrong or incomplete in **six** places, one of which (`skills` frontmatter set) will generate false-positive WARNINGs on correct files, and one of which (the fork exception to the tool filter) makes the kit's strongest claim overbroad. Three further kit rules are **UNSUPPORTED-BY-DOCS** — plausible from observed behavior but the docs never say it.

**Headline answers:**

| Claim | Doc-confirmed? |
|---|---|
| "Subagents CAN spawn subagents; the limit is three layers below the main conversation" | **YES** — verbatim, and the default is now `3` as of v2.1.219 |
| "`AskUserQuestion` is stripped from every subagent, foreground and background" | **YES, with one documented exception the kit omits: conversation forks** |

---

## Sources table

Kit's stated verification date for all rows: **2026-08-06**.

| # | URL (as listed in kit) | Fetch result | Finding today |
|---|---|---|---|
| 1 | `https://code.claude.com/docs/en/sub-agents` | **200** (~95KB) | Live. Frontmatter table now **16 fields**. Depth-limit section exists and is explicit. Tool-filter section exists and is explicit. |
| 2 | `https://code.claude.com/docs/en/plugins-reference` | **200** (~89KB) | Live. `name` still the only required manifest field. Manifest key set matches the kit exactly. **`claude plugin validate` has no CLI-reference section** — see below. |
| 3 | `https://code.claude.com/docs/en/skills` | **200** (~77KB) | Live. Frontmatter table has **20 fields**; the kit's set is missing `when_to_use`. `$N` semantics are 0-based and the kit never states this. |
| 4 | `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices` | **200** | Live. All four hard limits the kit cites (64 / 1,024 / reserved words / 500 lines) are confirmed verbatim. |
| 5 | `https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills` | not fetched | No Stage 1 rule depends on it (Stage 2 rubric background only). |
| 6 | `https://code.claude.com/docs/en/hooks` | not fetched | Kit's hooks rules (`hooks-json-exists`, `hooks-json-valid`, `hook-script-exists`) are filesystem checks, not frontmatter claims; `hooks/hooks.json` location is independently confirmed by source #2's file-locations table. |
| 7 | `https://code.claude.com/docs/llms.txt` | not fetched | Index only; no rule depends on it. |

No fetch failed. No redirect was encountered — `code.claude.com/docs/en/*` served directly. The kit's note that `docs.claude.com/en/docs/claude-code/*` 301s to `code.claude.com/docs/en/*` was not re-tested (no rule depends on it).

---

## Claim-by-claim

### A. Subagent nesting depth — **the single most important claim**

| | |
|---|---|
| **Claim** | Subagents CAN spawn subagents; the limit is three layers below the main conversation. |
| **Kit's position** | Implicit — kit rule `agent-tools-never-available` says `Agent` is removed "at the depth limit", and Mode A step 2 names "subagents cannot spawn subagents" as an example of stale folklore to catch. |
| **Doc status** | **CONFIRMED** |

> "By default, a subagent can spawn subagents of its own, up to three layers below the main conversation. At the depth limit, Claude Code withholds the `Agent` tool from every subagent except a [fork](#fork-the-current-conversation), so a subagent at the limit does its delegated work itself and returns one summary. A fork at the limit keeps `Agent` in its inherited tool list, but the tool returns an error instead of spawning."
> — sub-agents, *Let subagents spawn their own subagents*

Configurable, and the history matters for an eval case:

> "To change the limit, set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to the number of subagent layers you want below your main conversation."
> "Set `1` to turn nesting off."
> "**v2.1.172 through v2.1.216**: subagents could nest by default, up to five layers deep, and the limit couldn't be changed. **v2.1.217 through v2.1.218**: the limit defaulted to one, so a subagent couldn't spawn its own unless you raised it; v2.1.219 raised the default to three."

**Affected Stage 1 rule:** `agent-tools-never-available` (the `Agent`-at-depth-limit clause) and Mode A step 2 (the folklore check). Both stand. **The brief's assertion is correct and safe to build an eval case on** — with the caveat that "three" is a *default*, not a constant, so an eval expecting a hard `3` will break for any user who sets `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`.

---

### B. `AskUserQuestion` stripped from subagents

| | |
|---|---|
| **Claim** | `AskUserQuestion` is unavailable in every subagent, foreground and background. |
| **Kit's position** | `agent-tools-never-available` — "removed from every subagent **unconditionally**, foreground and background alike". |
| **Doc status** | **CONFIRMED, but the kit's "unconditionally" is DRIFTED — the docs carve out forks.** |

> "Subagents inherit the built-in tools and MCP tools available in the main conversation, narrowed by two filters: the first removes a short list of tools from every subagent, and the second reduces the built-in tool set for subagents that run in the background, which is the default. **Forks skip both filters and receive the main conversation's exact tool pool.** The first filter removes these tools, even when listed in the `tools` field:
> * `Agent`, when the subagent is at the depth limit; in a fork the tool stays listed but returns an error instead of spawning
> * `AskUserQuestion`
> * `EndConversation` […]
> * `EnterPlanMode`
> * `ExitPlanMode`, unless the subagent's `permissionMode` is `plan`
> * `ScheduleWakeup`
> * `TaskOutput`
> * `WaitForMcpServers`
> * `Workflow`"
> — sub-agents, *Available tools*

The kit's `NEVER_IN_SUBAGENT` set is **exactly** the doc's unconditional subset (7 tools, with `Agent` and `ExitPlanMode` correctly split out as conditional). Only the word "unconditionally" is wrong: a conversation fork skips the filter entirely.

The background-filter list is also confirmed verbatim and matches the kit's `BACKGROUND_TOOLS` set:

> "a background subagent keeps every MCP tool but only these built-in tools: `Read`, `Grep`, `Glob`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`, `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`, `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, and `Artifact`."

And the default-to-background premise:

> "As of v2.1.198, subagents run in the background by default. Claude runs a subagent in the foreground when it needs the result before continuing."

**Affected Stage 1 rules:** `agent-tools-never-available` (wording fix), `agent-tools-background-filter` (**no change — confirmed verbatim**).

---

### C. Agent frontmatter — required vs optional

| | |
|---|---|
| **Claim** | `name` + `description` required; `tools`/`model` optional; kit's 16-key allowlist. |
| **Doc status** | **CONFIRMED** (allowlist matches exactly), with **two DRIFTs**. |

> "The following fields can be used in the YAML frontmatter. **Only `name` and `description` are required.**"

Documented set, in doc order: `name`, `description`, `tools`, `disallowedTools`, `model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`, `background`, `effort`, `isolation`, `color`, `initialPrompt` — **identical to the kit's `AGENT_FIELDS`.** No new field since the kit was written.

**DRIFT C1 — `name` charset.** Doc: *"Unique identifier using lowercase letters and hyphens."* The kit's `agent-name-format` says "lowercase letters, **numbers**, and hyphens". The doc does not sanction digits. Also confirmed verbatim, and it is the only documented load-failure mode for an agent file:

> "Names can't contain `:`, which is reserved for plugin-scoped identifiers such as `my-plugin:reviewer`. **Claude Code doesn't load a file whose name contains one and logs an error to the debug log.** Before v2.1.218, such names were accepted"

**DRIFT C2 — plugin agents support a *narrower* field set than the kit models.** The kit's `agent-plugin-ignored-field` flags only `hooks`, `mcpServers`, `permissionMode`. The plugins reference lists a shorter positive set:

> "Plugin agents support `name`, `description`, `model`, `effort`, `maxTurns`, `tools`, `disallowedTools`, `skills`, `memory`, and `isolation` frontmatter fields. The only valid `isolation` value is `"worktree"`. For security reasons, `hooks`, `mcpServers`, and `permissionMode` are not supported for plugin-shipped agents." *(plus `background`)*

`color` and `initialPrompt` appear in the sub-agents table but **not** in the plugins-reference plugin-agent list. The two pages disagree; the sub-agents page is the fuller reference. Treat as a doc-internal inconsistency, not a hard rule.

**`tools` default and format:**

> "`tools` | No | Tools the subagent can use. **Inherits every tool available to subagents if omitted.** If no entry in the list resolves to a tool, the subagent usually fails to launch with an error naming the entries. To preload Skills into context, use the `skills` field rather than listing `Skill` here"

Comma-separated is shown by example (`tools: Read, Grep, Glob, Bash`) but **the docs never state the accepted separators for the agent `tools` field** — SILENT. (By contrast the skills doc explicitly says `allowed-tools` "Accepts a space- or comma-separated string, or a YAML list.")

**`model` default:** *"Omitted: defaults to `inherit` and uses the same model as the main conversation."* Aliases: `sonnet`, `opus`, `haiku`, `fable`, full model ID, or `inherit`. **CONFIRMED** — kit's `MODEL_ALIASES` is correct.

**`color`:** `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`. **CONFIRMED** — kit's `COLORS` is correct.

**Also confirmed:** `disallowedTools` precedence — *"If both are set, `disallowedTools` is applied first, then `tools` is resolved against the remaining pool. A tool listed in both is removed."* The kit has no rule for this; worth adding.

**Affected rules:** `agent-name-format` (C1), `agent-plugin-ignored-field` (C2), `agent-unknown-field` (no change), `agent-model-valid` (no change), `agent-color-valid` (no change), `agent-tools-resolve` (no change).

---

### D. Recursive scanning of `agents/`, and frontmatter-less `.md` files

| | |
|---|---|
| **Claim (recursion)** | `agents/` is scanned recursively; subdirectory path does not affect identity. |
| **Doc status** | **CONFIRMED for project/user scope. DRIFTED for plugin scope.** |

> "Claude Code scans `.claude/agents/` and `~/.claude/agents/` **recursively**, so you can organize definitions into subfolders such as `agents/review/` or `agents/research/`. The subdirectory path doesn't affect how a subagent is identified or invoked, because identity comes only from the `name` frontmatter field."

But — and the kit does **not** say this:

> "Plugin `agents/` directories are also scanned recursively. **Unlike project and user scopes, a subfolder inside a plugin's `agents/` directory becomes part of the scoped identifier**: a file at `agents/review/security.md` in plugin `my-plugin` registers as `my-plugin:review:security`."

This matters directly for this build: if the reviewer agent is shipped in a plugin under a subfolder, its invocation name gains a path segment. Given the repo memory note *"Plugin skills need qualified names"*, a nested plugin agent would need `<plugin>:<subfolder>:<name>` — a third segment.

Also newly documented and absent from the kit:

> "Keep `name` values unique across the whole tree: if two files under the same `.claude/agents/` directory, including its subfolders, declare the same name, Claude Code loads only one of them, **chosen by filesystem read order rather than a documented precedence.** The `/doctor` setup checkup reports files in the same directory that share a name"

| | |
|---|---|
| **Claim (stray `.md`)** | A `.md` file under the agents tree with no valid frontmatter "is scanned, fails to load, and logs an error." |
| **Kit rule** | `agent-stray-md` (quality, WARN) |
| **Doc status** | **SILENT → UNSUPPORTED-BY-DOCS** |

Neither page states what happens to a `.md` file in `agents/` that lacks frontmatter. The **only** documented agent load failure is the `:`-in-`name` case quoted in C1. The claim may be true from observed behavior, but it is **not doc-backed** and must not be presented as `[spec]`.

**Affected rules:** `agent-stray-md` (re-tag), plus a new rule needed for plugin-scoped nesting identity.

---

### E. Plugin manifest — required vs optional, and directory layout

| | |
|---|---|
| **Claim** | `.claude-plugin/plugin.json` optional upstream; `name` is the only required field; 24-key documented set. |
| **Doc status** | **CONFIRMED — all three, verbatim.** |

> "The manifest is optional. If omitted, Claude Code auto-discovers components in default locations and derives the plugin name from the directory name."

> "**If you include a manifest, `name` is the only required field.**"

Documented top-level keys: `$schema`, `name`, `displayName`, `version`, `description`, `author`, `homepage`, `repository`, `license`, `keywords`, `metadata`, `defaultEnabled`, `skills`, `commands`, `agents`, `workflows`, `hooks`, `mcpServers`, `outputStyles`, `lspServers`, `experimental`, `userConfig`, `channels`, `dependencies` — **exactly the kit's `MANIFEST_FIELDS`, all 24. No drift.**

Unrecognized-field and type-error handling, also confirmed verbatim (the kit's Stage 0 prose is accurate):

> "`claude plugin validate` reports unrecognized fields as warnings, not errors. If a field is one or two characters off from a recognized one, the warning suggests the likely intended name. A plugin with only unrecognized-field warnings still passes validation and loads at runtime."
> "**Most fields**: the plugin fails to load. For example, a `keywords` value that is a string instead of an array is a load error […] **`experimental` and `metadata`**: Claude Code ignores a non-object value, and `claude plugin validate` reports a warning."

**Directory layout — CONFIRMED:**

| Component | Default location |
|---|---|
| Manifest | `.claude-plugin/plugin.json` (optional) |
| Skills | `skills/` (with `<name>/SKILL.md`) |
| Commands | `commands/` — *"Skills as flat Markdown files. **Use `skills/` for new plugins**"* |
| Agents | `agents/` |
| Hooks | `hooks/hooks.json` |

> "The `.claude-plugin/` directory contains the `plugin.json` file. **All other directories (commands/, agents/, skills/, workflows/, output-styles/, themes/, monitors/, hooks/) must be at the plugin root, not inside `.claude-plugin/`.**"

New and not in the kit:

> "If a plugin has no `skills/` directory and no `skills` manifest field, a `SKILL.md` at the plugin root is loaded as a single skill."
> "A `CLAUDE.md` file at the plugin root is not loaded as project context."

**Affected rules:** `manifest-exists`, `manifest-field-name`, `manifest-unknown-field`, `skill-md-exists` — all stand unchanged.

---

### F. `claude plugin validate` — documented? `--strict`? output format?

| | |
|---|---|
| **Claim** | Stage 0 is `claude plugin validate <dir> --strict`, first-party, authoritative, checks `plugin.json` + skill/agent/command frontmatter + `hooks/hooks.json`. |
| **Doc status** | **Command + `--strict` CONFIRMED. Output format SILENT.** |

Confirmed:

> "Pass `--strict` to treat warnings as errors. Use it in CI to catch a misspelled field name or a field left over from another tool's manifest before publishing, even though the plugin would load at runtime."
> ```bash
> claude plugin validate ./my-plugin --strict
> ```

Scope confirmed, from the troubleshooting table:

> "Run `claude plugin validate ./my-plugin` or `/plugin validate ./my-plugin`, where `./my-plugin` is your plugin directory, to check `plugin.json`, skill/agent/command frontmatter, and `hooks/hooks.json` for syntax and schema errors"

**But:** the plugins-reference *CLI commands reference* section documents `plugin init`, `install`, `uninstall`, `prune`, `enable`, `disable`, `update`, `list`, `details`, `tag` — **there is no `### plugin validate` section, no options table, and no example output.** The *Debugging commands* section does not mention it either. Every mention is incidental prose.

**Consequence:** the kit's Stage 0 claim that validate is "authoritative" and its narrative of exactly what validate emits are **UNSUPPORTED-BY-DOCS as to output**. A reviewer agent must not parse or assert a specific validate output shape.

**Affected:** Stage 0 section prose. No Stage 1 rule id.

---

### G. Command / skill file frontmatter and `$ARGUMENTS`

| | |
|---|---|
| **Claim** | Commands merged into skills; kit's 19-key `SKILL_FIELDS` allowlist. |
| **Doc status** | **Merge CONFIRMED. Field set DRIFTED — kit is missing `when_to_use`.** |

Merge, confirmed verbatim:

> "**Custom commands have been merged into skills.** A file at `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both create `/deploy` and work the same way. Your existing `.claude/commands/` files keep working."

Documented set (20 fields): `name`, `description`, **`when_to_use`**, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`.

The kit's `SKILL_FIELDS` has 19 — **`when_to_use` is absent.** A correct file using it trips `command-frontmatter-valid` as a false-positive WARNING. This is the one drift that produces wrong output on valid input.

> "All fields are optional. **Only `description` is recommended** so Claude knows when to use the skill."

Argument substitution — the kit never states the semantics, and they are counter-intuitive:

> "`$ARGUMENTS` | All arguments passed when invoking the skill. If `$ARGUMENTS` is not present in the content, arguments are appended as `ARGUMENTS: <value>`."
> "`$ARGUMENTS[N]` | Access a specific argument by 0-based index, such as `$ARGUMENTS[0]` for the first argument."
> "**`$N` | Shorthand for `$ARGUMENTS[N]`, such as `$0` for the first argument or `$1` for the second.**"
> "`$name` | Named argument declared in the `arguments` frontmatter list."

> "An indexed placeholder with no corresponding argument, such as `$2` when only one argument was passed, **stays in the content unchanged.** A named placeholder […] expands to an empty string."

So **`$1` is the SECOND argument.** The kit's `command-argument-hint` rule ("a command that references `$ARGUMENTS` or `$1` should document `argument-hint`") still works as a trigger, but any reviewer prose that treats `$1` as "the first argument" is wrong.

**Affected rules:** `command-frontmatter-valid` (add `when_to_use`), `command-argument-hint` (extend trigger set to `$0`, `$ARGUMENTS[N]`, `$name`).

---

### H. Skill hard limits

| | |
|---|---|
| **Claim** | `name` ≤ 64 chars, lowercase/numbers/hyphens, no XML tags, no reserved words `anthropic`/`claude`; `description` ≤ 1,024 chars, non-empty, no XML tags; body < 500 lines; third person; one-level references; ToC over 100 lines; forward slashes. |
| **Doc status** | **ALL CONFIRMED verbatim** (best-practices page). |

> "`name`: Maximum 64 characters · Must contain only lowercase letters, numbers, and hyphens · Cannot contain XML tags · **Cannot contain reserved words: "anthropic", "claude"**
> `description`: Must be non-empty · Maximum 1,024 characters · Cannot contain XML tags"

> "Keep SKILL.md body under 500 lines for optimal performance."
> "**Always write in third person**. The description is injected into the system prompt, and inconsistent point-of-view can cause discovery problems."
> "**Keep references one level deep from SKILL.md.**"
> "For reference files longer than 100 lines, include a table of contents at the top."
> "Always use forward slashes in file paths, even on Windows."

The 1,536-char truncation is confirmed on the Claude Code skills page, and the kit under-states it:

> "the combined `description` and `when_to_use` text is truncated at 1,536 characters in the skill listing to reduce context usage."

**Affected rules:** `skill-name-length`, `skill-name-charset`, `skill-name-reserved`, `skill-description-length`, `skill-description-truncation`, `skill-description-person`, `skill-body-500`, `skill-refs-one-level`, `skill-toc-100`, `skill-windows-paths`, `skill-time-sensitive` — **all stand unchanged. This is the kit's strongest section.**

---

## Required kit corrections

Precise edits. **Do not apply in this phase** — this section is the spec for a later phase.

### 1. `agent-tools-never-available` — remove the overbroad "unconditionally", add the fork exception

- **Current:** "`tools` names a tool that is **removed from every subagent unconditionally**, foreground and background alike: `AskUserQuestion`, …"
- **Replace with:** "`tools` names a tool that is **removed from every subagent, foreground and background alike, except a conversation fork** (a fork skips both tool filters and receives the main conversation's exact tool pool): `AskUserQuestion`, …"

### 2. `agent-name-format` — drop "numbers"

- **Current:** "`name` must be lowercase letters, numbers, and hyphens."
- **Replace with:** "`name` must be lowercase letters and hyphens (docs say 'lowercase letters and hyphens'; digits are not sanctioned)."
- Leave the `:`-rejection sentence unchanged — confirmed verbatim.

### 3. `command-frontmatter-valid` / `SKILL_FIELDS` — add `when_to_use`

- **Current (rule row):** "… keys should be from the skill set: `name`, `description`, `argument-hint`, `arguments`, …"
- **Replace with:** "… keys should be from the skill set: `name`, `description`, **`when_to_use`**, `argument-hint`, `arguments`, …"
- **Current (`structural_check.py`):**
  ```python
  SKILL_FIELDS = {
      "name", "description", "argument-hint", "arguments", "disable-model-invocation",
  ```
- **Replace with:**
  ```python
  SKILL_FIELDS = {
      "name", "description", "when_to_use", "argument-hint", "arguments",
      "disable-model-invocation",
  ```
- **Severity: highest.** This is the only correction that stops a false positive on a valid file.

### 4. `agent-stray-md` — re-tag `quality` → `unsupported-by-docs`, soften the assertion

- **Current:** "a `.md` file under the agents tree with no valid frontmatter. **It is scanned, fails to load, and logs an error.** Move non-agent docs out of `agents/`."
- **Replace with:** "a `.md` file under the agents tree with no valid frontmatter. The docs are silent on this case (the only documented agent load failure is a `name` containing `:`), so treat this as a hygiene warning, not a load-failure claim. Move non-agent docs out of `agents/`."

### 5. Agents section preamble — add the plugin-scope identity exception

- **Current:** "Claude Code scans the agents directory **recursively**; the subdirectory path does not affect identity, which comes only from the `name` field."
- **Replace with:** "Claude Code scans the agents directory **recursively**. For project (`.claude/agents/`) and user (`~/.claude/agents/`) scopes the subdirectory path does not affect identity, which comes only from the `name` field. **For plugin `agents/` directories the subfolder becomes part of the scoped identifier**: `agents/review/security.md` in plugin `my-plugin` registers as `my-plugin:review:security`. Duplicate `name` values within one tree resolve by filesystem read order, not a documented precedence; `/doctor` reports them."

### 6. Stage 0 section — stop claiming a documented output contract

- **Current:** "Claude Code ships its own validator. Run it before anything in this kit… Documented behavior worth knowing:"
- **Add after the bullet list:** "Note: `claude plugin validate` has **no dedicated section in the plugins CLI reference** — no options table and no documented output format. `--strict` and the checked scope (`plugin.json`, skill/agent/command frontmatter, `hooks/hooks.json`) are documented only in prose. Do not parse its output or assert a specific report shape."

### 7. New rule — `agent-tools-precedence` (spec, WARN)

- **Add to the Agents rule table:** "| `agent-tools-precedence` | spec | WARN | a tool listed in **both** `tools` and `disallowedTools` is removed. `disallowedTools` is applied first, then `tools` resolves against the remaining pool. Listing the same tool in both is a contradiction worth flagging. |"

### 8. `command-argument-hint` — correct the positional semantics

- **Current:** "a command that references `$ARGUMENTS` or `$1` should document `argument-hint`"
- **Replace with:** "a command that references `$ARGUMENTS`, `$ARGUMENTS[N]`, `$0`/`$1`/…, or a `$name` declared in `arguments` should document `argument-hint`. Note the indices are **0-based**: `$0` is the first argument and `$1` is the second. An indexed placeholder with no matching argument stays in the content unchanged; a named one expands to empty."

---

## Impact on the build

**Rules that must change before the reviewer agent encodes them (4):**

1. `command-frontmatter-valid` — **blocking.** Ship as-is and the agent WARNs on every skill that uses `when_to_use`, which is a documented, encouraged field. Fix first.
2. `agent-tools-never-available` — the fork carve-out. If the agent asserts "AskUserQuestion is *always* dead in a subagent" it will be wrong about forks and about `context: fork` skills.
3. `agent-name-format` — narrow to letters+hyphens, or explicitly re-tag the digit allowance as `[quality]` rather than `[spec]`.
4. `agent-stray-md` — must be re-tagged. It currently claims `[spec]`-grade load-failure behavior the docs never state; a reviewer agent that reports it as a load error is asserting folklore, exactly the failure mode the kit's own Mode A step 2 warns about.

**Rules to be re-tagged as UNSUPPORTED-BY-DOCS (3):**

- `agent-stray-md` (above)
- Stage 0's validate output narrative
- The agent `tools` separator format (comma-separated is shown by example only; never specified)

**Rules that need adding (2):** `agent-tools-precedence`, and the plugin-scope nested-identity rule from correction #5.

**Rules confirmed with zero change — safe to encode verbatim (the bulk of the kit):** the entire manifest section (all 24 keys), all 11 skill rules including every hard limit, `agent-unknown-field` (16-key set exact), `agent-model-valid`, `agent-color-valid`, `agent-tools-resolve`, `agent-tools-background-filter` (19-tool set exact), `agent-field-name`, `agent-field-description`, `agent-plugin-ignored-field`, all three hooks rules, `readme-*`, `empty-directory`, `secret-in-tree`.

**Eval-case guidance:**

- The **nesting eval case is safe to build.** "Subagents can spawn subagents, three layers below the main conversation" is doc-confirmed verbatim. Assert the *behavior* ("subagents CAN nest") rather than the literal integer `3` — the number is a per-session default settable via `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, and it was `5` from v2.1.172–216 and `1` from v2.1.217–218. An eval hard-coding `3` is a version-dated assertion and will rot.
- An eval case that flags "AskUserQuestion in `tools`" should expect a **WARNING with a fork/main-thread escape hatch**, not an unconditional ERROR.

**Directly relevant to placement (Phase 2):** if this reviewer agent ships inside a plugin and is filed under a subfolder of `agents/`, its invocation name becomes `<plugin>:<subfolder>:<name>` — three segments. Given the repo's standing rule that plugin skills need qualified names, put the agent file **flat in `agents/`** unless a subfolder is deliberately wanted in the identifier.
