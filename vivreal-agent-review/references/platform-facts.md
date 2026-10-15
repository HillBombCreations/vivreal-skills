# Platform fact ledger

Doc-verified claims about Claude Code behavior, each with a verbatim quote, its
source, and the date it was verified. This is what lets the `claim-false` check run
**offline**. Check this ledger BEFORE any WebFetch; fetch only on a miss.

**Every finding derived from this ledger must print the ledger's verified date**, so
staleness shows up in the output instead of silently rotting.

**Ledger verified: 2026-10-14**, against the live pages below, with Claude Code 2.1.299
installed. Every quote was matched mechanically against the fetched page text (markdown
link syntax and backticks stripped on both sides). The 2026-08-06 ledger had drifted: 23
of its 40 quoted passages no longer matched, and several claims had changed, not only their
wording (agent names may now hold digits, `TaskOutput` left filter one, the documented
manifest keys grew, and three "unsupported" rows are now documented).

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

Each entry gives the **claim**, a **verbatim quote** from the docs, its **source**
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

> "To keep one subagent from spawning while nesting is on, such as a reviewer that
> should stay read-only, omit `Agent` from its `tools` list or add it to
> `disallowedTools`."

Source: sub-agents, *Let subagents spawn their own subagents*. Verified 2026-10-14.

**Version caveat, do not assert the integer.** The depth is a configurable default,
not a constant:

> "To change the limit, set `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` to the number of
> subagent layers you want below your main conversation."
> "Set `1` to turn nesting off."
> "v2.1.172 through v2.1.216: subagents could nest by default, up to five layers
> deep, and the limit couldn't be changed. v2.1.217 through v2.1.218: the limit
> defaulted to one, so a subagent couldn't spawn its own unless you raised it;
> v2.1.219 raised the default to three."

**Therefore:** assert the *behavior*, subagents CAN nest, and never a literal
depth number. A finding or eval that hard-codes `3` is a dated assertion.

---

## B. Tool filters

**Claim: two filters narrow a subagent's tools, and a fork skips both.**

> "Subagents inherit the built-in tools and MCP tools available in the main
> conversation, narrowed by two filters: the first removes a short list of tools
> from every subagent, and the second reduces the built-in tool set for subagents
> that run in the background, which is the default."

> "Forks skip both filters and receive the main conversation's exact tool pool."

**Filter one, removed from every subagent, even when listed in `tools`** (the doc
gives it as a bulleted list; each item quoted):

> "`Agent`, when the subagent is at the depth limit; in a fork the tool stays listed
> but returns an error instead of spawning"
> "`EndConversation`, which can end only the main conversation"
> "`ExitPlanMode`, unless the subagent's `permissionMode` is `plan`"

The other items are bare names: `AskUserQuestion`, `EnterPlanMode`, `ScheduleWakeup`,
`WaitForMcpServers`, `Workflow`. So the **unconditional** subset is six tools:
`AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ScheduleWakeup`,
`WaitForMcpServers`, `Workflow`. `Agent` and `ExitPlanMode` are conditional.
`TaskOutput` was on this list on 2026-08-06 and is not today. **The fork carve-out
means "removed unconditionally" is an overbroad claim**, a common drift.

**Filter two, the background set:**

> "a background subagent keeps every MCP tool but only these built-in tools: `Read`,
> `Grep`, `Glob`, `LSP`, `Bash`, `PowerShell`, `Edit`, `Write`, `NotebookEdit`,
> `WebFetch`, `WebSearch`, `TodoWrite`, `Skill`, `ToolSearch`, `EnterWorktree`,
> `ExitWorktree`, `Monitor`, `TaskStop`, `SendMessage`, and `Artifact`"

> "Claude Code removes every other built-in tool from a background subagent, whether
> inherited or listed in the `tools` field, so the same definition can resolve to
> different tools in the foreground and the background."

Do not assert a count for this set; it gained `LSP` between ledger dates.

**Background is the default:**

> "Where fork mode is off, Claude runs the subagent in the background by default and
> in the foreground when it needs the result before continuing."

**Precedence:**

> "If both are set, `disallowedTools` is applied first, then `tools` is resolved
> against the remaining pool. A tool listed in both is removed."

Source: sub-agents, *Available tools*; *Run subagents in foreground or background*.
Verified 2026-10-14.

---

## C. Agent frontmatter

**Claim: only `name` and `description` are required, and an unknown field is ignored
in silence.**

> "Configure a subagent with YAML frontmatter between `---` markers at the top of its
> file, and write its system prompt as Markdown after the closing `---`. Only `name`
> and `description` are required."

> "Multi-word field names use camelCase, such as `maxTurns` and `disallowedTools`, and
> must match the table exactly: Claude Code ignores a field it doesn't recognize
> without reporting an error."

Documented set, in doc order: `name`, `description`, `tools`, `disallowedTools`,
`model`, `permissionMode`, `maxTurns`, `autoCompactWindow`, `skills`, `mcpServers`,
`hooks`, `memory`, `background`, `omitClaudeMd`, `effort`, `isolation`, `color`,
`initialPrompt`, `experimental`. Do not assert a count; three keys arrived between
ledger dates.

**Claim: the load failures for a project, user or managed agent file are documented.**

> "Claude Code skips a file in a project, user, or managed `agents` directory, or in
> one under a directory you add with `--add-dir`, without reporting it in the
> session, when the frontmatter has any of these problems"

Each item, quoted: "No `name`: Claude Code treats the file as documentation kept beside
your agents." "An opening `---` that isn't the file's first line: Claude Code reads the
file as having no frontmatter and treats it as documentation." "A `name` that starts with
`-`, contains `:`, or is longer than 256 characters: Claude Code skips the file and writes
an error to the debug log." "A `name` but no `description`: Claude Code skips the file and
writes the reason to the debug log." "YAML that doesn't parse: Claude Code reads no fields
from the file, skips it, and writes the parse error to the debug log."

**But a PLUGIN agent loads anyway, and this is easy to miss:**

> "A plugin subagent whose frontmatter has no `name` or doesn't parse still loads,
> under its filename."

> "Frontmatter that doesn't parse: the agent still loads with every field ignored.
> It's named after the file, and its description reads `Agent from my-plugin plugin`."

So in Profile A an unparseable agent is a live agent with the default tool set and a
useless description, never a skipped file.

**Name charset.** The doc now gives a length and an example with a digit:

> "Unique identifier of at most 256 characters, such as `code-reviewer` or
> `reviewer-v2`."

> "Names can't contain `:`, which is reserved for plugin-scoped identifiers such as
> `my-plugin:reviewer`"

A digit in an agent `name` is therefore sanctioned, not a warning. Skills keep their
own, stricter charset (section G).

**`tools` default and separator:**

> "Tools the subagent can use, as a comma-separated string such as `Read, Grep, Bash`
> or a YAML list. Inherits every tool available to subagents if omitted. If no entry in
> the list resolves to a tool, the subagent usually fails to launch with an error
> naming the entries."

Note the hedge: **"usually"**. Stating an unresolvable `tools` entry as a certain
launch failure is slightly stronger than the docs support.

**`model`:**

> "`sonnet`, `opus`, `haiku`, `fable`, a full model ID such as `claude-opus-5-5`, or
> `inherit`. When you omit it, Claude Code picks the model in the subagent model order"

An omitted `model` is no longer documented as `inherit`; it follows the documented
resolution order.

**`color`:**

> "Accepts `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, or `cyan`"

**Plugin-shipped agents support a narrower set:**

> "Supported fields: `name`, `description`, `model`, `effort`, `maxTurns`,
> `autoCompactWindow`, `tools`, `disallowedTools`, `skills`, `memory`, `background`,
> `omitClaudeMd`, `isolation`, `color`, and the `cacheTtl` key of `experimental`. The
> only valid `isolation` value is `"worktree"`."

> "Ignored fields: `permissionMode`, `hooks`, `mcpServers`, and `initialPrompt`. An
> agent file can't add hooks or MCP servers on its own, so add those as plugin hooks
> and MCP servers instead"

The two pages now agree on `color` (supported on a plugin agent).

Source: sub-agents, *Frontmatter reference*, *Subagent files Claude Code skips*; plugins
components, *Frontmatter fields in plugin agents*. Verified 2026-10-14.

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
> `.claude/agents/` directory, including its subfolders, declare the same name, Claude
> Code loads only one of them, chosen by filesystem read order rather than a
> documented precedence."

Source: sub-agents, *Choose the subagent scope*. Verified 2026-10-14.

---

## E. Plugin manifest

> "The manifest is optional. Without it, Claude Code loads the components it finds in
> the standard layout. The plugin name then comes from the marketplace entry, or from
> the directory name when you load the plugin with `--plugin-dir`."

> "`name` is the only required key."

**The documented top-level keys:** `$schema`, `name`, `displayName`, `version`,
`description`, `author`, `homepage`, `repository`, `license`, `keywords`, `metadata`,
`icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl`,
`defaultEnabled`, `dependencies`, `settings`, `userConfig`, `types`, `channels`,
`skills`, `commands`, `agents`, `hooks`, `mcpServers`, `lspServers`, `outputStyles`,
`workflows`, `experimental`. Do not assert a count; the directory-listing fields,
`settings` and `types` arrived between ledger dates.

**Unrecognized fields and strict objects:**

> "Top-level fields: the field is stripped and the plugin loads. `claude plugin
> validate` reports each unrecognized top-level field as a warning"

> "Strict objects: `userConfig` options, `channels` entries, `lspServers` configs, and
> `monitors` entries are strict. An unknown key inside one is an error, and the plugin
> doesn't load"

> "Validation failed: the manifest has a type mismatch, a path that is missing or
> escapes the plugin root, or an unknown key inside a `userConfig` option, `channels`
> entry, `lspServers` config, or `monitors` entry."

**Marketplace naming, why `manifest-name-match` cannot be an ERROR:**

> "`name`: when the entry lists the plugin under a different `name` than the
> manifest, `enabledPlugins` uses the entry name, and components are namespaced under
> the manifest name"

The docs treat a manifest `name` differing from the marketplace entry name as a
supported configuration with defined resolution semantics, not a defect. An ERROR
would block it, which is why that rule is a WARNING.

**Directory layout:**

> "Save the manifest at `.claude-plugin/plugin.json` under the plugin root. Put every
> other plugin file at the plugin root, not inside `.claude-plugin/`. That includes
> `skills/`, `commands/`, and `hooks/`."

**Validation scope, output and `--strict`, now documented:**

> "Validate a plugin manifest, a marketplace manifest, or the skills, agents, and
> commands in a directory, and exit with a code a CI job can act on."

> "Treat warnings as errors, so unrecognized fields and missing metadata that the
> runtime tolerates fail the run"

Exit codes, from the same page's table: `0` with `Validation passed` or `Validation
passed with warnings`; `1` with `Validation failed` (or the `--strict` variant); `2`
with `Unexpected error during validation: <reason>`. A `--json` flag gives a stable
object (`success`, `strict`, `target`, `manifest`, `contents`).

Source: plugins-reference, *Manifest file*, *Fields*, *Unrecognized fields*; plugins
cli-reference, *plugin validate*. Verified 2026-10-14.

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
Unchanged since 2026-08-06.

`when_to_use` is documented and encouraged. **Omitting it from an allowlist WARNs on
correct files**, the single most consequential drift to guard against.

> "All fields are optional. Only `description` is recommended so Claude knows when
> to use the skill."

> "A field name must match the table exactly, hyphens included: Claude Code ignores a
> field it doesn't recognize without reporting an error."

Source: skills, *Frontmatter reference*. Verified 2026-10-14.

---

## G. Skill hard limits

> "`name`: Maximum 64 characters, lowercase letters/numbers/hyphens only, no XML tags,
> no reserved words"
> "`description`: Maximum 1,024 characters, non-empty, no XML tags"
> "Cannot contain reserved words: "anthropic", "claude""

> "Keep SKILL.md body under 500 lines for optimal performance"
> "Always write in third person. The description is injected into the system prompt,
> and inconsistent point-of-view can cause discovery problems."
> "Keep references one level deep from SKILL.md"
> "For reference files longer than 100 lines, include a table of contents at the top."
> "Always use forward slashes in file paths, even on Windows"

**Truncation applies to the combined text:**

> "the combined `description` and `when_to_use` text is truncated at 1,536
> characters in the skill listing to reduce context usage."

Source: agent-skills best practices; skills. Verified 2026-10-14.

---

## H. Argument substitution

> "`$ARGUMENTS` | All arguments passed when invoking the skill. When no placeholder
> receives an argument, Claude Code appends them as `ARGUMENTS: <value>`."
> "`$ARGUMENTS[N]` | Access a specific argument by 0-based index, such as
> `$ARGUMENTS[0]` for the first argument."
> "`$N` | Shorthand for `$ARGUMENTS[N]`, such as `$0` for the first argument or `$1`
> for the second."
> "`$name` | Named argument declared in the `arguments` frontmatter list."

> "An indexed placeholder with no corresponding argument, such as `$2` when only one
> argument was passed, stays in the content unchanged. A named placeholder [...]
> expands to an empty string."

**So `$1` is the SECOND argument.** Any prose treating it as the first is wrong.

Source: skills. Verified 2026-10-14.

---

## UNSUPPORTED BY DOCS

On 2026-08-06 three checks rested on observed behavior with no doc support. **All three
are documented now** (2026-10-14), so none of them is tagged `[unsupported]` any more:

| Was unsupported | Now |
|---|---|
| A frontmatter-less `.md` in an agents tree | Section C: in a project, user or managed directory it is treated as documentation and skipped; in a **plugin** it loads as an agent named after the file. |
| `claude plugin validate`'s output shape | Section E: the verdict lines, exit codes and a `--json` object are documented. Assert the exit code and the verdict line; still never parse the free-text error lines. |
| Comma separation in agent `tools` | Section C: "as a comma-separated string such as `Read, Grep, Bash` or a YAML list". |

What stays measured rather than documented, and worth recording because it changes how
much the agent can lean on Stage 0: on the Claude Code version in the header,
`claude plugin validate` covers agent files (its output lines read `Validating agent:`),
but on an agent it checks only that frontmatter **parses** and is **present**. The docs
now say as much for a bare agents directory ("doesn't flag a file whose frontmatter parses
but has no `name`"). Every field-level agent rule is therefore gated by Stage 1 alone, in
both profiles.

---

## Sources

| # | URL | Verified | Used for |
|---|---|---|---|
| 1 | `https://code.claude.com/docs/en/sub-agents` | 2026-10-14 | A, B, C, D |
| 2 | `https://code.claude.com/docs/en/plugins-reference` | 2026-10-14 | E |
| 3 | `https://code.claude.com/docs/en/plugins/components` | 2026-10-14 | C |
| 4 | `https://code.claude.com/docs/en/plugins/cli-reference` | 2026-10-14 | E |
| 5 | `https://code.claude.com/docs/en/skills` | 2026-10-14 | F, G, H |
| 6 | `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices` | 2026-10-14 | G |

Each page answers its markdown form at the same URL plus `.md`; all six returned 200 on
2026-10-14. When a claim is not in this ledger, fetch the one relevant URL above, never
all six, and if the fetch fails, downgrade to UNVERIFIED rather than asserting anything.
