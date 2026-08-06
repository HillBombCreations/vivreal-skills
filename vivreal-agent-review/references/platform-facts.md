# Platform fact ledger

Doc-verified claims about Claude Code behavior, each with a verbatim quote, its
source, and the date it was verified. This is what lets the `claim-false` check run
**offline**. Check this ledger BEFORE any WebFetch; fetch only on a miss.

**Every finding derived from this ledger must print the ledger's verified date**, so
staleness shows up in the output instead of silently rotting.

**Ledger verified: 2026-08-06.** Claude Code 2.1.223.

**Do not link onward from this file.** It sits one level below the agent body, and a
second hop gets partially read. The rule table is linked from the body separately.

## Table of contents

- [How to read a row](#how-to-read-a-row)
- [A. Subagent nesting depth](#a-subagent-nesting-depth)
- [B. Tool filters](#b-tool-filters)
- [C. Agent frontmatter](#c-agent-frontmatter)
- [D. Recursive scanning and identity](#d-recursive-scanning-and-identity)
- [E. Plugin manifest](#e-plugin-manifest)
- [F. Skill and command frontmatter](#f-skill-and-command-frontmatter)
- [G. Skill hard limits](#g-skill-hard-limits)
- [H. Argument substitution](#h-argument-substitution)
- [UNSUPPORTED BY DOCS](#unsupported-by-docs)
- [Sources](#sources)

---

## How to read a row

Each entry gives the **claim**, a **verbatim quote** from the docs, its **source**,
and any **version caveat**. A claim is settled only if it appears here with a quote.
Anything not in this ledger and not fetched live is UNVERIFIED, and a finding built
on it must say so.

---

## A. Subagent nesting depth

**Claim: subagents CAN spawn subagents.** The widespread assertion that they cannot
is false, and it is the single highest-value false claim to catch.

> "By default, a subagent can spawn subagents of its own, up to three layers below
> the main conversation. At the depth limit, Claude Code withholds the `Agent` tool
> from every subagent except a fork, so a subagent at the limit does its delegated
> work itself and returns one summary. A fork at the limit keeps `Agent` in its
> inherited tool list, but the tool returns an error instead of spawning."

Source: sub-agents, *Let subagents spawn their own subagents*. Verified 2026-08-06.

**Version caveat — do not assert the integer.** The depth is a configurable default,
not a constant:

> "To change the limit, set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to the number of
> subagent layers you want below your main conversation."
> "Set `1` to turn nesting off."
> "v2.1.172 through v2.1.216: subagents could nest by default, up to five layers
> deep, and the limit couldn't be changed. v2.1.217 through v2.1.218: the limit
> defaulted to one, so a subagent couldn't spawn its own unless you raised it;
> v2.1.219 raised the default to three."

**Therefore:** assert the *behavior* — subagents CAN nest — and never a literal
depth number. A finding or eval that hard-codes `3` is a dated assertion.

---

## B. Tool filters

**Claim: two filters narrow a subagent's tools, and a fork skips both.**

> "Subagents inherit the built-in tools and MCP tools available in the main
> conversation, narrowed by two filters: the first removes a short list of tools
> from every subagent, and the second reduces the built-in tool set for subagents
> that run in the background, which is the default. Forks skip both filters and
> receive the main conversation's exact tool pool."

**Filter one — removed from every subagent, even when listed in `tools`:**

> "`Agent`, when the subagent is at the depth limit; in a fork the tool stays listed
> but returns an error instead of spawning · `AskUserQuestion` · `EndConversation` ·
> `EnterPlanMode` · `ExitPlanMode`, unless the subagent's `permissionMode` is `plan`
> · `ScheduleWakeup` · `TaskOutput` · `WaitForMcpServers` · `Workflow`"

The **unconditional** subset is seven tools: `AskUserQuestion`, `EndConversation`,
`EnterPlanMode`, `ScheduleWakeup`, `TaskOutput`, `WaitForMcpServers`, `Workflow`.
`Agent` and `ExitPlanMode` are conditional. **The fork carve-out means "removed
unconditionally" is an overbroad claim** — a common drift.

**Filter two — the background set (19 built-ins plus every MCP tool):**

> "a background subagent keeps every MCP tool but only these built-in tools:
> `Read`, `Grep`, `Glob`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`,
> `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`,
> `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, and `Artifact`."

**Background is the default:**

> "As of v2.1.198, subagents run in the background by default. Claude runs a
> subagent in the foreground when it needs the result before continuing."

**Precedence:**

> "If both are set, `disallowedTools` is applied first, then `tools` is resolved
> against the remaining pool. A tool listed in both is removed."

Source: sub-agents, *Available tools*. Verified 2026-08-06.

---

## C. Agent frontmatter

**Claim: 16 documented keys; only `name` and `description` are required.**

> "The following fields can be used in the YAML frontmatter. Only `name` and
> `description` are required."

Documented set, in doc order: `name`, `description`, `tools`, `disallowedTools`,
`model`, `permissionMode`, `maxTurns`, `skills`, `mcpServers`, `hooks`, `memory`,
`background`, `effort`, `isolation`, `color`, `initialPrompt`.

**Claim: a `:` in `name` is the only documented agent load failure.**

> "Names can't contain `:`, which is reserved for plugin-scoped identifiers such as
> `my-plugin:reviewer`. Claude Code doesn't load a file whose name contains one and
> logs an error to the debug log. Before v2.1.218, such names were accepted"

**Name charset — narrower than commonly stated.** The doc says *"Unique identifier
using lowercase letters and hyphens."* It does **not** sanction digits. That
phrasing is descriptive rather than an explicit charset rule, so a digit is a
quality warning, never an error.

**`tools` default:**

> "Tools the subagent can use. Inherits every tool available to subagents if
> omitted. If no entry in the list resolves to a tool, the subagent usually fails to
> launch with an error naming the entries."

Note the hedge: **"usually"**. Stating an unresolvable `tools` entry as a certain
launch failure is slightly stronger than the docs support.

**`model`:** `sonnet`, `opus`, `haiku`, `fable`, `inherit`, or a full model id.
*"Omitted: defaults to `inherit` and uses the same model as the main conversation."*

**`color`:** `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan`.

**Plugin-shipped agents support a narrower set:**

> "Plugin agents support `name`, `description`, `model`, `effort`, `maxTurns`,
> `tools`, `disallowedTools`, `skills`, `memory`, and `isolation` frontmatter
> fields. The only valid `isolation` value is `"worktree"`. For security reasons,
> `hooks`, `mcpServers`, and `permissionMode` are not supported for plugin-shipped
> agents."

`color` and `initialPrompt` appear in the sub-agents table but not in this
plugins-reference list. **The two pages disagree.** Treat it as a doc-internal
inconsistency, not a hard rule, and do not flag `color` on a plugin agent.

Source: sub-agents; plugins-reference. Verified 2026-08-06.

---

## D. Recursive scanning and identity

> "Claude Code scans `.claude/agents/` and `~/.claude/agents/` recursively, so you
> can organize definitions into subfolders such as `agents/review/` or
> `agents/research/`. The subdirectory path doesn't affect how a subagent is
> identified or invoked, because identity comes only from the `name` frontmatter
> field."

**But plugin scope differs, and this is easy to miss:**

> "Plugin `agents/` directories are also scanned recursively. Unlike project and
> user scopes, a subfolder inside a plugin's `agents/` directory becomes part of the
> scoped identifier: a file at `agents/review/security.md` in plugin `my-plugin`
> registers as `my-plugin:review:security`."

**Duplicate names resolve nondeterministically:**

> "Keep `name` values unique across the whole tree: if two files under the same
> `.claude/agents/` directory, including its subfolders, declare the same name,
> Claude Code loads only one of them, chosen by filesystem read order rather than a
> documented precedence. The `/doctor` setup checkup reports files in the same
> directory that share a name"

Source: sub-agents. Verified 2026-08-06.

---

## E. Plugin manifest

> "The manifest is optional. If omitted, Claude Code auto-discovers components in
> default locations and derives the plugin name from the directory name."

> "If you include a manifest, `name` is the only required field."

**The 24 documented top-level keys:** `$schema`, `name`, `displayName`, `version`,
`description`, `author`, `homepage`, `repository`, `license`, `keywords`,
`metadata`, `defaultEnabled`, `skills`, `commands`, `agents`, `workflows`, `hooks`,
`mcpServers`, `outputStyles`, `lspServers`, `experimental`, `userConfig`,
`channels`, `dependencies`.

**Unrecognized fields and type errors:**

> "`claude plugin validate` reports unrecognized fields as warnings, not errors. If
> a field is one or two characters off from a recognized one, the warning suggests
> the likely intended name. A plugin with only unrecognized-field warnings still
> passes validation and loads at runtime."

> "Most fields: the plugin fails to load. For example, a `keywords` value that is a
> string instead of an array is a load error. `experimental` and `metadata`: Claude
> Code ignores a non-object value, and `claude plugin validate` reports a warning."

**Marketplace naming — why `manifest-name-match` cannot be an ERROR:**

> "`name` | string | Unique identifier (kebab-case, no spaces). When a
> [marketplace entry](/docs/en/plugin-marketplaces#plugin-entries) lists the plugin
> under a different name, the marketplace entry name is what `enabledPlugins` keys
> and `/plugin` use"

The docs therefore treat a manifest `name` differing from the marketplace entry name
as a supported configuration with defined resolution semantics, not a defect. An
ERROR would block it, which is why that rule is a WARNING.

**Directory layout:**

> "The `.claude-plugin/` directory contains the `plugin.json` file. All other
> directories (commands/, agents/, skills/, workflows/, output-styles/, themes/,
> monitors/, hooks/) must be at the plugin root, not inside `.claude-plugin/`."

**`--strict`:**

> "Pass `--strict` to treat warnings as errors. Use it in CI to catch a misspelled
> field name or a field left over from another tool's manifest before publishing,
> even though the plugin would load at runtime."

**Validation scope:**

> "Run `claude plugin validate ./my-plugin` or `/plugin validate ./my-plugin` [...]
> to check `plugin.json`, skill/agent/command frontmatter, and `hooks/hooks.json`
> for syntax and schema errors"

Source: plugins-reference. Verified 2026-08-06.

---

## F. Skill and command frontmatter

**Commands are merged into skills:**

> "Custom commands have been merged into skills. A file at
> `.claude/commands/deploy.md` and a skill at `.claude/skills/deploy/SKILL.md` both
> create `/deploy` and work the same way. Your existing `.claude/commands/` files
> keep working."

**The 20 documented keys:** `name`, `description`, **`when_to_use`**,
`argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`,
`allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`,
`background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`.

`when_to_use` is documented and encouraged. **Omitting it from an allowlist WARNs on
correct files** — the single most consequential drift to guard against.

> "All fields are optional. Only `description` is recommended so Claude knows when
> to use the skill."

Source: skills. Verified 2026-08-06.

---

## G. Skill hard limits

> "`name`: Maximum 64 characters · Must contain only lowercase letters, numbers, and
> hyphens · Cannot contain XML tags · Cannot contain reserved words: "anthropic",
> "claude"
> `description`: Must be non-empty · Maximum 1,024 characters · Cannot contain XML
> tags"

> "Keep SKILL.md body under 500 lines for optimal performance."
> "Always write in third person. The description is injected into the system prompt,
> and inconsistent point-of-view can cause discovery problems."
> "Keep references one level deep from SKILL.md."
> "For reference files longer than 100 lines, include a table of contents at the top."
> "Always use forward slashes in file paths, even on Windows."

**Truncation applies to the combined text:**

> "the combined `description` and `when_to_use` text is truncated at 1,536
> characters in the skill listing to reduce context usage."

Source: agent-skills best practices; skills. Verified 2026-08-06.

---

## H. Argument substitution

> "`$ARGUMENTS` | All arguments passed when invoking the skill. If `$ARGUMENTS` is
> not present in the content, arguments are appended as `ARGUMENTS: <value>`."
> "`$ARGUMENTS[N]` | Access a specific argument by 0-based index, such as
> `$ARGUMENTS[0]` for the first argument."
> "`$N` | Shorthand for `$ARGUMENTS[N]`, such as `$0` for the first argument or `$1`
> for the second."
> "`$name` | Named argument declared in the `arguments` frontmatter list."

> "An indexed placeholder with no corresponding argument, such as `$2` when only one
> argument was passed, stays in the content unchanged. A named placeholder [...]
> expands to an empty string."

**So `$1` is the SECOND argument.** Any prose treating it as the first is wrong.

Source: skills. Verified 2026-08-06.

---

## UNSUPPORTED BY DOCS

Three checks rest on observed behavior with **no doc support**. The agent may report
them, tagged `[unsupported]` and capped at WARNING, and may **never** claim the docs
back them.

| Claim | Status | What may be said |
|---|---|---|
| A frontmatter-less `.md` in an agents tree "is scanned, fails to load, and logs an error" | Docs are **silent**. The only documented agent load failure is a `:` in `name`. | Report as hygiene. In Profile A, `claude plugin validate` does emit `No frontmatter block found` on such a file — cite that as observed first-party behavior, not as documentation. |
| `claude plugin validate` emits a specific, stable output shape | The plugins CLI reference has **no `plugin validate` section**, no options table, and no example output. Every mention is incidental prose. | Run it, report the exit code and the lines it printed. **Never parse or assert its format.** |
| The agent `tools` field accepts comma separation | Shown by **example only**; the separators are never specified. By contrast the skills doc explicitly states that `allowed-tools` accepts a space- or comma-separated string or a YAML list. | Follow the example, but do not assert a documented separator rule. |

Measured, not documented, and worth recording because it changes how much the agent
can lean on Stage 0: on Claude Code 2.1.223, `claude plugin validate` **does** cover
agent files (its output lines read `Validating agent:`), but on an agent it checks
only that frontmatter **parses** and is **present**. It does not check `name`
charset (a `:` in an agent `name` passes validation silently), `model`, `color`,
unknown fields, or tool availability. Every field-level agent rule is therefore
gated by Stage 1 alone, in both profiles.

---

## Sources

| # | URL | Verified | Used for |
|---|---|---|---|
| 1 | `https://code.claude.com/docs/en/sub-agents` | 2026-08-06 | A, B, C, D |
| 2 | `https://code.claude.com/docs/en/plugins-reference` | 2026-08-06 | C, E |
| 3 | `https://code.claude.com/docs/en/skills` | 2026-08-06 | F, G, H |
| 4 | `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices` | 2026-08-06 | G |

All four returned 200 with no redirect on 2026-08-06. When a claim is not in this
ledger, fetch the one relevant URL above — never all four — and if the fetch fails,
downgrade to UNVERIFIED rather than asserting anything.
