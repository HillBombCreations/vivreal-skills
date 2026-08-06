# Stage 1 rule set — corrected

The full rule table the `definition-reviewer` agent applies. Base is the local
plugin/agent validation kit's Stage 1 table; every correction below is annotated
with why it changed. Paths are written with forward slashes only, on every platform.

**Do not link onward from this file.** It is one level below the agent body, and a
second hop gets partially read. The platform fact ledger is linked from the agent
body independently, never from here.

## Table of contents

- [Authority tags](#authority-tags)
- [Severity is a default, not a verdict](#severity-is-a-default-not-a-verdict)
- [Policy posture](#policy-posture)
- [Cross-cutting rules](#cross-cutting-rules)
  - [ref-unresolved](#ref-unresolved)
  - [claim-false](#claim-false)
  - [frontmatter-parses](#frontmatter-parses)
  - [generated-mirror-drift](#generated-mirror-drift)
  - [secret-in-tree](#secret-in-tree)
  - [empty-directory](#empty-directory)
- [Manifest rules — Profile A only](#manifest-rules--profile-a-only)
- [Agent rules](#agent-rules)
- [Skill rules](#skill-rules)
- [Command rules](#command-rules)
- [Hook rules](#hook-rules)
- [Dropped rules](#dropped-rules)
- [Change log against the kit](#change-log-against-the-kit)

---

## Authority tags

| Tag | Meaning |
|---|---|
| `[spec]` | Enforced by Claude Code and quotable from the live docs. |
| `[policy]` | Agency marketplace rule with no upstream equivalent. **OFF by default.** |
| `[quality]` | Reviewer heuristic. Defensible, but not a platform requirement. |
| `[unsupported]` | Plausible from observed behavior; the docs are silent. |

**An `[unsupported]` finding may never be an ERROR, and must print its tag on the
finding line.** This tag exists because the kit asserted `[spec]`-grade load-failure
behavior the docs never state — the same folklore failure mode the reviewer exists
to catch in other people's files.

## Severity is a default, not a verdict

Each rule below carries a default severity. Five adjudication tests may move it, and
any deviation must print a one-line reason naming the test that fired. The tests are
in the agent body under "Severity is guidance, not a lookup". In short: a load
failure is always an ERROR; purpose-dependency escalates; a documented escape hatch
de-escalates to NOTE; a defect whose right fix is documentation rather than deletion
is a WARNING that says so; and an `[unsupported]` finding caps at WARNING.

## Policy posture

Every Profile-A-only ERROR rule in the kit is an Agency `[policy]` rule, and every
one of them mis-fires outside Agency. `readme-exists` false-ERRORs on all 13 plugins
in this repo, none of which ships a README. `--author-domain` defaults to
`microsoft.com`.

- **OFF by default:** `manifest-exists`, `manifest-field-description`,
  `manifest-field-version`, `manifest-field-author`, `manifest-name-match`,
  `manifest-author-emails`, `readme-exists`, `readme-length`, `agency-valid-json`,
  `agency-valid-engine`.
- **Stays ON:** `empty-directory` (downgraded to WARNING) and `secret-in-tree`
  (ERROR, security). Neither is a marketplace support rule in substance.
- **Switch:** `--policy=agency` turns the bundle on. Default is off.
- **Never silent.** The header always prints the posture. An omitted check the
  reader cannot see is indistinguishable from a passed check.

---

## Cross-cutting rules

These four are the reason a human-judgment agent exists rather than a script. The
first two are absent from the kit's rule table entirely — they live there only as
four sentences of prose, with no id, no severity, and no authority tag.

### ref-unresolved

`[quality]` · **ERROR** · applies to Profile A and B.

A cited file path that does not exist. An agent told to read a file that is gone
does not error — it improvises, which is worse than failing.

**Scope.** Scanned only in files Claude Code actually loads as instructions:
`agents/**/*.md`, `commands/*.md`, `skills/*/SKILL.md`, and files those link to.
**Never** in `references/`, `docs/`, or any unlinked file. A dead citation only
matters where the citation is an instruction. This scoping is also what stops eval
fixtures and design notes, which cite illustrative paths on purpose, from producing
a wall of false positives.

**Matching predicate.** A token is a reference, and therefore must resolve, if and
only if **all six** hold:

1. **Directory-qualified.** It matches `[\w.@$-]*([/\\][\w.${}@-]+)+` — at least one
   separator joining two non-empty segments. A token with **no separator at all**
   (`post.md`, `slides.json`, `sync-to-agy.js`) is a **mention, not a reference**.
   Never resolve it. Never report it. *This one clause is the entire 26-to-0 fix.*
   **1b.** Every **non-final** segment must be a plausible directory name — that is,
   not a bare file extension. `.md/.json` is prose shorthand for "`.md` or `.json`
   files", not a path, and resolving it produces a confident, wrong ERROR. This
   phrasing is common in exactly the files this reviewer reads.
2. **Extension-bearing or directory-terminal.** The final segment ends in one of
   `.md .json .ts .tsx .js .mjs .cjs .py .ps1 .sh .txt .yaml .yml .css .html .svg
   .sql`, or the token ends in `/`. **The directory-terminal branch applies only to
   a token that already satisfies clause 1**, and clause 1 wins wherever the two
   read differently. `docs/bugs/` is a reference; a single-segment `docs/`,
   `references/`, or `.claude/` is a **mention**. Measured: under the permissive
   reading, this agent's own body — which names those directories in prose and in
   its description — takes **10 confident, wrong ERRORs** against its own plugin
   installed standalone, including the line telling the reviewer not to scan them.
   Under this reading, zero.
3. **Not a URL, and not a bare hostname.** No `://`; does not begin with `http`,
   `mailto:`, or `#`. **3b.** The **first** segment must not be a hostname — a
   filesystem path does not begin with a domain. Reject when segment one matches
   `^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)*\.(com|net|org|io|co|ai|dev|app|gov|edu|me|tv)$`,
   case-insensitively. Narrow twice over, so it cannot eat a legitimate dotted path
   segment: **only the first** segment is tested (the `.example.json` in
   `agents/content-creator/fixtures.example.json` is never seen) and the TLD list is
   **closed** (`fixtures.example.json`, `brand-tokens.css`, `next.config.mjs` miss it).
   Without 3b, `instagram.com/p/` satisfies clause 2's directory-terminal branch and
   reads as a dead path — one such finding on the corpus, `profiler.md:501`.
4. **Not a package specifier.** `@scope/name` with no file extension is an npm
   package, not a path.
5. **Not a placeholder.** The token contains none of `< > * { } ...` — **except**
   the two recognized plugin roots. `agents/<name>.md`, `skills/**/SKILL.md`, and
   `docs/bugs/<slug>/plan.md` are templates, not citations. Skip them silently.
6. **Inside a block — never an ERROR, and only sometimes silent.** A token within a
   fenced code block or a four-space indented block may **never** be an ERROR.
   Definition files routinely show sample output containing `file:line` findings and
   worked examples naming paths that belong to some *other* target. Resolving those
   against the reviewed tree is a large false-positive class — it fired on this very
   plugin's own output-format template, whose sample findings cite `agents/runner.md`
   and `agents/prompt.md` in a repository that contains neither. But the exclusion is
   **not unconditional**, because definition files also put live *instructions* in
   fences — a dispatch block, a runbook command sequence — and a dead instruction is
   still dead inside a fence. Two sub-cases:
   - **6a. Sample or transcript block → skip silently.** The block qualifies when its
     lead-in line or its fence info string marks it as output, example, sample,
     transcript, fragment, or "exactly this shape", or when its own lines carry
     finding markers (`x [`, `! [`, `- [`). Its paths are citations into some other
     tree and mean nothing here.
   - **6b. Every other block is instructional → NOTE, never ERROR.** A token that
     resolves by any primary candidate **or by the suffix fallback** stays silent: a
     command written relative to a documented working directory is not a citation to
     make explicit, and a NOTE there would advise the wrong fix. A token that
     resolves **nowhere** is a dead instruction sitting inside live instructions —
     emit it as a NOTE naming the block, so it is visible without claiming the
     confidence an ERROR carries.

   **Tiebreak — what "four-space indented block" means.** A CommonMark **indented code
   block**, and **list continuation is never one**. A block **opens** on a line that
   (i) carries four or more leading spaces, a tab counting as four; (ii) has **no list
   item open at a smaller indent** — a list opens on `^\s*([-*+]|\d{1,9}[.)])\s` and
   closes at the first non-blank line indented less than its own marker column; and
   (iii) is preceded by a blank line. It then **continues** through every following line
   indented four or more, interior blanks included, until a non-blank line indented less
   than four. **Where (i) and (ii) read differently, (ii) wins** — the same shape as
   clause 1 beating clause 2 above. Why: definition files are list-heavy and routinely
   cite real paths in nested bullets four or more spaces deep, and reading those as
   blocks routes them into **6a, which skips silently** — the one direction clause 6's
   "never an ERROR" guarantee does not protect. Both halves were measured. Test (iii)
   per **line** rather than per block and this plugin's own multi-line output template
   stops being a block, taking **4 wrong ERRORs** on the sample findings it prints for
   `agents/runner.md` and `agents/prompt.md`. Swap (ii) for "any four-space indent" and
   one corpus token flips, `agents/profiler.md:501` — which clause 3b now rejects before
   clause 6 runs, so today the readings yield **identical finding sets**. The tiebreak
   stands anyway; the next corpus will not be so lucky. Separately, on that 21-file tree
   the 6a/6b split added **6 NOTEs, zero errors** and removed nothing; the one that
   mattered was `node scripts/check-links.mjs` in a bash fence.

**Corollary for worked examples written in prose.** A path in ordinary prose that
belongs to a hypothetical target, not the file's own tree, should be written with an
explicit root placeholder — `<target>/agents/foo.md` — which clause 5 then skips.
Bare `agents/foo.md` in prose is indistinguishable from a real citation, and should
be treated as one.

**Tiebreak — the corollary governs; the six verbs are the only exit.** It and the
output-path downgrade below read in opposite directions on one token shape: a prose path
that *looks* hypothetical (a worked example, an "edge case" walkthrough, a sample payload
quoted inline) and carrying **none** of the six trigger verbs. **The corollary wins — it
is a citation, an unresolved citation is an ERROR, and "it is only an example" is not a
downgrade.** "Hypothetical-looking" is a reading, not a tell, so admitting it as a
suppressor puts the error total back on the reader's judgement — what the "not 'or drop
it'" ruling below closes — and the author has a one-edit escape: write `<target>/…`,
which clause 5 skips silently. Applied: `agents/short-form-editor.md:160` cites
`content/footage/2026-08-06-domains/footage-manifest.json` in prose between the fences at
153/155 and 167/169, no such path exists at `HEAD`, the fallback finds nothing, and lines
150–172 hold **zero** of the six verbs. **ERROR**; `expected/head.md` pins it as one.

**Resolution order.**

- `${CLAUDE_PLUGIN_ROOT}` or `${PLUGIN_ROOT}` prefix → strip it and any leading
  slash, resolve against the plugin root. Same normalization `hook-script-exists`
  already specifies.
- Otherwise try in order: the citing file's own directory, then the resolved target
  root, then the git toplevel. It resolves if any candidate exists.
- **Then, before reporting anything, the suffix fallback.** If the token matches the
  tail of exactly one real path in the repository, it **resolves** — but never
  silently. Reaching this step means all three primary candidates missed, and the two
  explanations for that are indistinguishable to any matcher: an implicit
  working-directory assumption, or a file that has **moved** and left the citation
  dead. **Emit a NOTE** naming the token and the path it resolved to
  (`- [ref-unresolved] <file>:<line> cited as <token>, resolved only by suffix match
  to <path> → make the citation explicit, or confirm the file has not moved`). Never
  an error. If it matches several paths, it still resolves and the NOTE names the
  ambiguity instead. Resolution by any of the three primary candidates stays silent —
  the NOTE marks fallback use specifically, which is the thing worth seeing.
- **Search scope for the fallback.** Never an unbounded full-tree walk. When the
  target sits inside a git worktree, match against `git ls-files` output only; when it
  does not — a bare extracted `.claude/` tree, for instance — walk the target and skip
  `.git/`, `node_modules/`, and anything the tree's own `.gitignore` excludes. Either
  way a vendored, generated, or ignored copy must not be allowed to satisfy a tail
  match, and the search stays bounded on a large repository.

**Why the suffix fallback is not optional.** In a monorepo, agents cite paths
relative to their own package — `commands/crawl.js` when the file actually lives at
`packages/leadgen/commands/crawl.js`. All three primary candidates miss, and without
this fallback a single real repository produced **about fifty** confident, wrong
ERRORs on paths that exist. That is the original 26-false-positive failure
reproduced at twice the scale, by the very rule written to prevent it. A path that
demonstrably exists in the tree is not a dead instruction; at most it is an implicit
working-directory assumption, which is a documentation nit and not an error — but a
nit is not nothing, which is why the fallback reports a NOTE rather than resolving in
silence.

**Known limitation — output paths. Read the verb before reporting.** A path a file
*produces* is a legitimate forward reference, not a dead instruction —
`public/search-index.json` next to the words "the build regenerates". It does not
exist at review time and never should. Judging input against output is a reading task,
not a matching task, which is why this check belongs to an agent rather than a script.
When the sentence **containing the token** says **writes, produces, emits, generates,
regenerates, or creates**, **downgrade it to a NOTE** — not "or drop it". A silent drop
makes the error total depend on which of two permitted behaviors the run chose, which
is how an eval ends up asserting two different aggregates for the same tree. The six
are a **closed list**, the verb must sit in the token's own sentence rather than merely
nearby, and the tiebreak above governs when none is present. Exactly **two** survive at
`HEAD` — `agents/guide-writer.md:139` and `:140`, both under "the build **regenerates**
tracked artifacts" — so `ref-unresolved` contributes **two** errors there, not zero.

**Never flagged.** Any other `${...}` placeholder (`${VIVREAL_REPOS}/...`) is
unresolvable by design → skip silently. Absolute paths outside the target tree
(`C:/repos/...`, `/c/repos/...`) → skip silently. Agents in this repo cite
cross-repo absolute paths constantly; flagging them manufactures a second false
positive class as large as the first.

### claim-false

`[quality]` · **WARNING, escalating to ERROR** · applies to Profile A and B.

A statement of Claude Code platform behavior in a file's prose that is not true.
Stale platform folklore silently disables a file's best path, and no lexical rule
can catch it.

**Scope.** Same as `ref-unresolved` — only files Claude Code loads as instructions.
A fact ledger, a changelog, or a design note may quote a false claim in order to
correct it, and flagging the quotation instead of the claim is a false positive.

**Step 1 — extract candidates.** A sentence is a candidate when it contains **both**:

- a platform noun: `subagent`, `agent`, `tool`, `hook`, `skill`, `plugin`,
  `command`, `frontmatter`, `MCP`, `Agent`, `background`, `model`, `context`,
  `fork`, `marketplace`; **and**
- a capability modal or negation: `cannot`, `can't`, `is not able to`,
  `does not support`, `doesn't support`, `is stripped`, `is removed`,
  `only works when`, `is limited to`, `is not available`, `there is no way to`,
  `never`, `always`, `must be`.

**Step 2 — check the offline ledger FIRST.** Compare against the platform fact
ledger linked from the agent body. This is what keeps the normal path at zero
network calls. If the ledger settles it, emit with the ledger's verified date
attached, so staleness is visible in the output rather than silent.

**Step 3 — WebFetch only on a miss,** and only when the claim is load-bearing for
the file. One fetch per URL per run, four maximum:

- `https://code.claude.com/docs/en/sub-agents` — agent, tool, and depth claims
- `https://code.claude.com/docs/en/plugins-reference` — manifest and plugin claims
- `https://code.claude.com/docs/en/skills` — skill and command frontmatter claims
- `https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices`
  — skill hard limits

**Step 4 — fetch failure.** On any failure (offline, 4xx, timeout, truncation) the
agent **MUST NOT** assert the claim is false. Downgrade to `claim-unverified`,
severity **NOTE**, with the literal text `UNVERIFIED (fetch failed: <reason>)`.
Never silently drop it; never let a failed fetch produce an ERROR. A false positive
caused by a network outage destroys the reviewer's credibility faster than a miss.

**Step 5 — never invent doc support.** Write "the docs say X" only when holding a
verbatim quote. A check resting on observed behavior alone is emitted
`[unsupported]` and capped at WARNING.

**Escalation to ERROR** — when the false claim gates the file's own primary path.
Two machine-checkable tells:

- the file **denies a capability in prose while its own frontmatter holds the
  corresponding tool or field**; or
- the file's own procedure **branches on the false claim** — a "degraded" or "if you
  were invoked as a subagent" path keyed to it.

**Version caveat.** Assert the *behavior* ("subagents CAN nest"), never a literal
depth integer. The depth is a per-session default settable through an environment
variable, and its value has changed across releases. An eval or a finding that
hard-codes the number is a dated assertion that will rot.

### frontmatter-parses

`agent-frontmatter-parses` / `skill-frontmatter-parses` /
`command-frontmatter-parses` · `[spec]` · **ERROR**.

Nothing in the kit validates that frontmatter parses as YAML. Its own splitter is
explicitly not a YAML parser — it regex-matches `^key:\s*(.*)$` per line, so a
description containing an unquoted `: ` parses "successfully" into a wrong value
instead of failing. This is how 34 skills in this repo load with empty metadata, no
description, and no possible route.

**How Mode A performs it.** No free YAML parser is available — PyYAML is not stdlib
and Node ships none — so this is a deterministic checklist aimed at the exact
documented failure class. For each top-level line matching
`^([A-Za-z_][\w-]*):\s*(.*)$`, take the value `V` and emit ERROR when:

1. `V` is a **plain scalar** (non-empty, and does not begin with `"` `'` `[` `{` `|`
   `>` `&` `*` `!`) **and** contains `: ` (colon-space) or ends with `:`; or
2. `V` begins with `"` or `'` and has no matching close on the same line and no
   block indicator; or
3. `V` begins with a reserved indicator `@` or `` ` `` or `%`; or
4. any **tab character** appears in the block — YAML forbids tabs for indentation; or
5. the closing `---` fence is absent.

**Confidence, stated honestly.** In Profile A, `claude plugin validate` emits this
same error and names the file, so report it as `corroborated by Stage 0`. In
Profile B there is no Stage 0, so report it as
`checklist-only (Profile B has no Stage 0 equivalent)`. Same rule, two confidence
levels, and the reader always knows which one they got.

### generated-mirror-drift

`[quality]` · **WARNING**.

A `skills/<X>/SKILL.md` that matches the generated-mirror naming pattern but is
**not** byte-identical to its source. Someone hand-edited a generated file, and the
next sync silently reverts it. Free to compute once mirror detection exists, and it
catches a real, silent data-loss mode.

Mirror identification, since generated files carry no marker: a `skills/<X>/SKILL.md`
is a generated mirror **iff** a sibling source exists and the two are byte-identical
— either `<plugin>/agents/<X>.md`, or `<plugin>/commands/<Y>.md` where `<X>` equals
`"cmd-" + <Y>`. Byte-identity is the right test because the sync writes the source
through unmodified, with no transform.

### secret-in-tree

`[quality]` · **ERROR** · stays ON regardless of policy posture.

No file matching `*storageState*`, `*.pem`, `*.key`, `.env`, `*credential*`, or
`*secret*` may sit in the component tree unless git reports it as ignored. Agent
asset folders accumulate captured sessions, and a committed browser storage state
is a live credential.

**Two corrections to the kit's predicate,** which is wrong in both directions:

- **Test path segments, not just the file basename.** The kit tests the basename
  only, so a `secrets/` or `credentials/` directory full of innocuously-named files
  is completely invisible.
- **Require a delimiter boundary, and exempt `.md`/`.txt` from the loose
  `*secret*` and `*credential*` substrings.** Those substrings are unanchored, so a
  legitimate document named `iam-secrets.md` would ERROR.

Keep the git-ignored exemption exactly as the kit has it.

### empty-directory

`[policy]` in origin but genuinely useful · **WARNING** · stays ON.

None of `skills/`, `agents/`, `commands/`, `scripts/`, `hooks/` may exist yet
contain no files recursively. Downgraded from ERROR because nothing in the docs
makes an empty `skills/` directory a load failure, so ERROR overstates it.

---

## Manifest rules — Profile A only

| id | authority | sev | rule |
|---|---|---|---|
| `manifest-exists` | policy | ERROR | `.claude-plugin/plugin.json` must exist. **Upstream the manifest is optional** — without one, components are auto-discovered and the name comes from the directory. OFF by default. |
| `manifest-valid-json` | spec | ERROR | must parse as a JSON object |
| `manifest-field-name` | spec | ERROR | `name` present and non-empty. The **only** upstream-required field. |
| `manifest-field-<f>` | policy | ERROR | `description`, `version`, `author` present and non-empty. OFF by default. |
| `manifest-name-match` | policy | **WARNING** | `name` should equal the plugin directory name. **Downgraded from ERROR** — the docs explicitly allow a marketplace entry to list a plugin under a different name, so an ERROR here blocks a documented, supported configuration. |
| `manifest-name-kebab` | spec | WARNING | `^[a-z0-9]+(-[a-z0-9]+)*$`. Used for component namespacing. |
| `manifest-version-semver` | quality | WARNING | `^\d+\.\d+\.\d+$`. Omitting `version` entirely is valid upstream; Claude Code then falls back to the git commit SHA. |
| `manifest-description-length` | quality | WARNING | `description` at most 200 chars. A much tighter budget than the 1,024 that governs agent and skill descriptions — do not confuse them. |
| `manifest-homepage` | quality | WARNING | consider a `homepage` for support |
| `manifest-unknown-field` | spec | WARNING | flag top-level keys outside the 24 documented ones. Claude Code ignores them and `--strict` promotes the warning to an error. |
| `manifest-author-emails` | policy | ERROR | two or more distinct `@<author-domain>` addresses. Purely an Agency support rule. OFF by default. |
| `agency-valid-json` / `agency-valid-engine` | policy | ERROR | OFF by default. |
| `readme-exists` / `readme-length` | policy | ERROR / WARNING | OFF by default. Would false-ERROR on all 13 plugins in this repo. |

## Agent rules

Claude Code scans the agents directory **recursively**. For project and user scopes
the subdirectory path does not affect identity, which comes only from the `name`
field. For **plugin** `agents/` directories the subfolder becomes part of the scoped
identifier.

| id | authority | sev | rule |
|---|---|---|---|
| `agent-frontmatter-parses` | spec | ERROR | see the cross-cutting rule above |
| `agent-frontmatter-present` | spec | ERROR | file must open with a `---` fence |
| `agent-field-name` | spec | ERROR | `name` required, non-empty |
| `agent-field-description` | spec | ERROR | `description` required, non-empty. It is the sole routing signal — it tells Claude when to delegate. |
| `agent-name-format` | spec | **ERROR for `:` only** | A `:` is rejected at load and the file is **not loaded**, with an error in the debug log. This is the only documented agent load failure. A **digit** in the name is a `[quality]` **WARNING**, not an error — the docs say "lowercase letters and hyphens", but that phrasing is descriptive, not exhaustive, and ERRORing on it would be asserting doc support we do not hold. |
| `agent-name-filename-match` | quality | WARNING | `name` should match the filename stem. Not required, but a mismatch makes a fleet hard to navigate. |
| `agent-model-valid` | spec | WARNING | `sonnet`, `opus`, `haiku`, `fable`, `inherit`, or a full model id. Defaults to `inherit`. |
| `agent-color-valid` | spec | WARNING | one of `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` |
| `agent-tools-resolve` | spec | ERROR | every `tools` entry should resolve to a real tool. If no entry resolves the subagent usually fails to launch. Treat `mcp__*` as always valid — those resolve at runtime. |
| `agent-tools-never-available` | spec | WARNING | `tools` names a tool removed from every subagent, foreground and background alike, **except a conversation fork** — a fork skips both filters and receives the main conversation's exact tool pool. The set is `AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ScheduleWakeup`, `TaskOutput`, `WaitForMcpServers`, `Workflow`. Also `ExitPlanMode` unless `permissionMode` is `plan`, and `Agent` at the depth limit. **WARNING, not ERROR, because the right fix is usually to document the invocation rather than drop the tool.** Escalate when the agent's purpose depends on it and no main-thread path is documented. |
| `agent-tools-background-filter` | spec | WARNING | subagents run in the background by default, and a background subagent keeps only the 19 built-ins plus every MCP tool. Anything else in `tools` is silently dropped. |
| `agent-tools-precedence` | spec | WARNING | a tool listed in **both** `tools` and `disallowedTools` is removed; `disallowedTools` applies first. Listing a tool in both is a self-contradiction. |
| `agent-unknown-field` | spec | WARNING | flag keys outside the 16 documented ones |
| `agent-plugin-ignored-field` | spec | WARNING | Profile A only. `hooks`, `mcpServers`, and `permissionMode` are ignored for plugin subagents — dead config. |
| `agent-plugin-nested-identity` | spec | WARNING | an agent file in a **plugin** subfolder registers as `<plugin>:<subfolder>:<name>`, three segments. Not a defect in itself; a defect when the file or its callers assume two. |
| `agent-output-format` | quality | WARNING | the file should state its **purpose**, its **procedure**, and the **shape** of what it returns. A heading-only regex is a proxy, not the property — a section titled "How to report" that describes what to say but never the shape of the return value still fails this rule, and a file mentioning "CSV format" in passing still passes a naive keyword scan. Require an output-family heading **plus** a template, fenced block, field list, or schema. |
| `agent-stray-md` | **unsupported** | WARNING | a `.md` file under the agents tree with no frontmatter. **Re-tagged from `[quality]`**: the docs are silent on what happens to such a file, so report it as hygiene, never as a load-failure claim. Corroboration worth citing in Profile A — `claude plugin validate` does warn on it (`No frontmatter block found`), which is observed first-party behavior, still not a documented one. Scope strictly to the `.md` extension; a deliberate `README.txt` in an agents tree is not a finding, and any widening re-flags it. |

## Skill rules

Hard limits are from the Agent Skills spec and are authoritative.

| id | authority | sev | rule |
|---|---|---|---|
| `skill-md-exists` | spec | ERROR | every `skills/<name>/` must contain `SKILL.md` |
| `skill-name-length` | spec | ERROR | `name` at most **64** characters |
| `skill-name-charset` | spec | ERROR | lowercase letters, numbers, hyphens only; no XML tags. **Detect a tag as a matched pair or a self-closing element**, not any angle bracket. A lone placeholder such as `<slug>` in a description is a template, and ERRORing on it asserts a detection rule the docs never specify — report it as a WARNING that the token may read as a tag. |
| `skill-name-reserved` | spec | ERROR | must not contain `anthropic` or `claude` |
| `skill-description-length` | spec | ERROR | at most **1,024** characters, non-empty, no XML tags |
| `skill-description-truncation` | spec | WARNING | **measure `description` + `when_to_use` combined** against 1,536. **Corrected** — the kit measures `description` alone, which can never detect the documented condition, and any description over 1,536 already tripped the 1,024 ERROR, so the warning only ever fired alongside an error. |
| `skill-description-person` | quality | WARNING | third person. The description is injected into the system prompt, so "I can help you" and "You can use this to" both cause discovery problems. |
| `skill-body-500` | spec | WARNING | body under **500** lines |
| `skill-refs-one-level` | quality | WARNING | referenced files link directly from `SKILL.md`. Nested references get partially read, producing incomplete information. |
| `skill-ref-exists` | quality | ERROR | every relative markdown link must resolve |
| `skill-windows-paths` | quality | WARNING | forward slashes only; backslash paths break off Windows |
| `skill-toc-100` | quality | WARNING | a reference file over 100 lines needs a table of contents |
| `skill-md-quality` | quality | WARNING | should mention examples, output, and error handling; flag whichever are missing |
| `skill-time-sensitive` | quality | WARNING | flag date-conditional guidance; move superseded material to an "old patterns" section |

## Command rules

Custom commands have been merged into skills. `.claude/commands/deploy.md` and
`.claude/skills/deploy/SKILL.md` both create `/deploy` and behave the same way.

| id | authority | sev | rule |
|---|---|---|---|
| `command-frontmatter-valid` | spec | WARNING | keys from the **20**-key skill set: `name`, `description`, **`when_to_use`**, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`. **`when_to_use` was missing from the kit** — the single correction that stops a false positive on a valid file. |
| `command-description` | quality | WARNING | without one, the body's first paragraph is used |
| `command-argument-hint` | quality | WARNING | a command referencing `$ARGUMENTS`, `$ARGUMENTS[N]`, `$0`, `$1`, or a `$name` declared in `arguments` should document `argument-hint`. Indices are **0-based** — `$0` is the first argument and `$1` is the second. Any prose calling `$1` "the first argument" is itself a defect. |

## Hook rules

| id | authority | sev | rule |
|---|---|---|---|
| `hooks-json-exists` | spec | ERROR | if `hooks/` exists it must contain `hooks.json` |
| `hooks-json-valid` | spec | ERROR | `hooks.json` must be valid JSON |
| `hook-script-exists` | spec | ERROR | every referenced script path must exist. Strip a leading `${CLAUDE_PLUGIN_ROOT}` or `${PLUGIN_ROOT}` and any leading slash before resolving. |

## Dropped rules

| id | why |
|---|---|
| `agent-md-depth` (body at least 30 lines) | Unsourced `[quality]`, and in direct contradiction with the kit's own anti-verbosity control, which states that a concise clear file must score at least as well as a long vague one. A tool whose job is definition **quality** must not reward line count. Replaced by the content-completeness requirement folded into `agent-output-format`. |
| `skill-md-depth` (at least 20 lines) | Same reasoning. |

## Change log against the kit

| # | Change | Kind |
|---|---|---|
| 1 | `command-frontmatter-valid` gains `when_to_use` (19 to 20 keys) | corrects a false positive on valid input |
| 2 | `ref-unresolved` added with the bare-basename exclusion | adds the highest-value missing rule |
| 3 | `claim-false` promoted to a first-class rule with id, severity, tag | adds the only rule that catches false platform claims |
| 4 | Agency `[policy]` bundle defaults OFF, with `--policy=agency` to enable | removes a whole class of false ERRORs |
| 5 | `*-frontmatter-parses` rules added | closes the YAML-validity hole, total in Profile B |
| 6 | `agent-tools-never-available` loses "unconditionally", gains the fork carve-out | narrows an overbroad claim |
| 7 | `manifest-name-match` ERROR to WARNING | the rule contradicted its own note and the docs |
| 8 | `agent-stray-md` re-tagged `[unsupported]`, wording softened | stops asserting undocumented load-failure behavior |
| 9 | `skill-description-truncation` measures `description` + `when_to_use` | the rule was previously unreachable |
| 10 | `secret-in-tree` tests path segments, anchors the substrings, exempts `.md`/`.txt` | was wrong in both directions |
| 11 | `empty-directory` ERROR to WARNING | ERROR overstated a non-load-failure |
| 12 | `command-argument-hint` trigger set extended; 0-based semantics stated | the kit never stated the semantics |
| 13 | `agent-tools-precedence` and `agent-plugin-nested-identity` added | two documented behaviors with no rule |
| 14 | Stage 0 prose stops asserting an output contract | `claude plugin validate` has no documented output format |
| 15 | `agent-md-depth` and `skill-md-depth` dropped | contradicted the kit's own anti-verbosity control |
| 16 | `ref-unresolved` clause 3 gains **3b**, a closed-TLD bare-hostname reject on the first segment | kills the `instagram.com/p/` false-positive class |
| 17 | Clause 6 defines "four-space indented block" as a CommonMark indented code block, with **list continuation never a block** | removed an ambiguity that flipped a token between ERROR and NOTE |
| 18 | The worked-example corollary is given an explicit tiebreak over the output-path verb test | two rules pointed opposite ways on the same token with no stated winner |
