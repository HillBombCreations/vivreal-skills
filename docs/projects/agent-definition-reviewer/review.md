# Review — agent-definition-reviewer (Phase 5)

- **Slug:** `agent-definition-reviewer` | **Phase:** 5 (Review) | **Date:** 2026-08-06
- **Reviewer:** adversarial gate. Every claim below was re-derived from the files or from a
  command I ran myself; nothing is taken from the coder's report.
- **Standards:** `vivreal-workflow:shared-standards` trigger map returns *"Skip this file"* for
  every row — no proxy route, no backend, no Mongo, no CSRF, no hydration, no Lambda. Applicable
  discipline is house convention plus the reviewed artifact's own rule set.
- **Diff surface:** ` M .claude-plugin/marketplace.json`, ` M docs/SYNC.md`, `?? vivreal-agent-review/`
  (9 authored + 2 generated files). Nothing else in the working tree.

**Verdict: Ship with notes.** 0 BLOCK · 7 CONCERN · 8/8 dimensions SOLID or SOLID-with-concern.

---

## The 8 dimensions

### 1. Correctness — SOLID (1 concern)

The plugin does what it claims, and I could not find a case where it produces a wrong verdict on
its own inputs. Profile detection is ordered and first-match-wins with a NO-TARGET terminal
(`agents/definition-reviewer.md:97-108`); mirror exclusion is a computed byte-identity test rather
than a marker (`:112-122`), which I verified holds today — `md5sum` gives `7a5dc7f5…` for both
`agents/definition-reviewer.md` and `skills/definition-reviewer/SKILL.md`, and `4eec9172…` for
both command files.

I re-implemented the six-clause `ref-unresolved` predicate and ran it against the plugin's own
in-scope files. The only tokens that survive all six clauses are
`${CLAUDE_PLUGIN_ROOT}/references/rules.md` (`:138`, `:175`),
`${CLAUDE_PLUGIN_ROOT}/references/platform-facts.md` (`:37`, `:54`, `:176`),
`.claude-plugin/marketplace.json` (`commands/definition-review.md:13`) and
`.claude-plugin/plugin.json` (`:26`). **All six resolve.** The plugin passes its own
highest-value rule.

Concern **C2** below is the one real correctness gap.

### 2. Security — SOLID (1 concern)

Read-only is enforced structurally, not asserted: `tools: Read, Grep, Glob, Bash, WebFetch`
(`agents/definition-reviewer.md:4`) — no `Edit`, no `Write`. I grepped every write-shaped verb in
both authored files; the only hits are the DON'Ts themselves (`:86`, `:315`, `:319`), the Mode B
"scratch directory only" constraint (`:292`), and a quoted `tools:` line belonging to the reviewed
corpus (`:50`). Nothing in the procedure instructs a write to a reviewed target.

The `secret-in-tree` git-ignored exemption (`references/rules.md:289`) survived an adversarial
probe I designed to break it. `C:/repos/vivreal-hq/.claude/agents/content-creator/auth.storageState.json`
is 23,936 bytes of live browser session state sitting inside the eval corpus tree and matches
`*storageState*` exactly. `git check-ignore -v` returns `.gitignore:33:*storageState*` and
`git ls-files --error-unmatch` confirms it is untracked. **Without the exemption the reviewer
would ERROR on its own shipped corpus.** Keeping it was right.

Concern **C6** below (hardcoded personal path in a distributed artifact) is the security-adjacent one.

### 3. Performance — SOLID (folded into C1)

Bounded by construction: ledger-first with WebFetch capped at "one fetch per URL per run, four
maximum" (`references/rules.md:194-201`), mirror exclusion removes duplicate work rather than
adding it, and `ref-unresolved` is scoped to instruction files only rather than the whole tree
(`:88-93`). The one unbounded operation is the suffix fallback (`:136-139`) — see C1.

### 4. Error handling — SOLID

The failure contract is unusually good for a prompt-defined agent. Fetch failure has a mandatory
downgrade with literal wording, not a suggestion: `claim-unverified`, NOTE, `UNVERIFIED (fetch
failed: <reason>)`, and an explicit "never let a failed fetch produce an ERROR"
(`references/rules.md:203-207`). `NO-TARGET` refuses to run any rule rather than guessing
(`agents/definition-reviewer.md:107-108`). The `Unverified` section is always emitted even when
empty (`:281`), so a silently dropped unverifiable claim is structurally distinguishable from a
verified one. That is the right instinct and it is rare.

### 5. Testing — SOLID (1 concern)

The strongest part of the build. I spot-checked far more than the two cases I was asked to, against
the real blobs, and **every factual claim in the corpus is true**:

| Claim | Where asserted | My verification |
|---|---|---|
| C1: `social-video-director.md:22` says "subagents cannot spawn subagents" | `evals/cases.md:28-30` | `git show 29b9404:…` — line 22 verbatim ✓ |
| C1: same file lists `Agent` in its own `tools` at line 4 | `cases.md:32` | line 4 = `tools: Read, Write, Edit, Bash, Glob, Grep, Agent` ✓ |
| C1: lines 23-25 branch on the claim | `cases.md:33-34` | `"degraded":"inline-sequential"` at :25 ✓ — both escalation tells fire |
| C2: no main-thread doc at `29b9404` | `cases.md:67-71` | body opens "Your one job" at :9; zero hits ✓ |
| C3: `content-creator/README.md` opens without a fence | `cases.md:80` | line 1 = `# Content Creator Agent` ✓ |
| C4: `runner.md` `## How to report` at line 52, no shape | `cases.md:100-102` | heading at :52 ✓; grep for `output\|format\|response\|contract` returns **zero** ✓ |
| C5: `prompt.md` `tools` line unchanged, only prose changed | `cases.md:120-125` | both commits `tools: Bash, Read, Glob, AskUserQuestion` ✓; HEAD `:9-17` documents the main thread ✓; `:36` records the keep is deliberate ✓ |
| C6: zero frontmatter-less `.md` under agents at HEAD | `cases.md:150` | recursive scan → zero ✓; `README.txt` present ✓ |
| Corpus: exactly 4 extra `:`-in-name errors | `cases.md:169-171` | the four named files, all at line 2 ✓ |

Case 1 is caught with the correct escalation; case 5 is de-escalated to NOTE and not re-flagged as
a blocker. **The evals are genuine, not asserted.** They also follow the shared-standards rule
correctly — presence assertions on `(rule-id, file, severity-class)` tuples, never snapshots
(`evals/README.md:42-54`), with the reasoning for why exact-count assertions would fail on correct
behavior spelled out at `:47-50`.

Concern **C4** below is an internal accounting contradiction in `expected/head.md`.

### 6. Conventions — SOLID

House style is followed closely and for stated reasons. Frontmatter shape matches
`vivreal-experts/agents/portal.md:1-7` (name/description/tools/model/color); the DON'Ts opener at
`:315` mirrors `portal.md:95` verbatim in shape; `Identity` / `Boundaries` / `DON'Ts` section names
match. Command frontmatter is `description` + `argument-hint` only, the majority pattern.
Every cross-plugin reference is qualified (`vivreal-agent-review:definition-reviewer` at
`commands/definition-review.md:36`), satisfying the standing repo memory rule that bare skill names
fail to resolve. `marketplace.json` entry is the uniform 3-key shape — I checked all 14 entries and
the shape set is exactly `{('description','name','source')}` with no duplicate names.

### 7. Maintainability — SOLID (2 concerns)

Budgets are respected with headroom, verified by parsing the files rather than trusting the report:
agent `description` **874** chars (limit 1,024, budget 900); body **320** lines (limit 500, budget
320 — at budget exactly); `plugin.json` description **197** (limit 200); command description **248**
(budget 400). Reference files over 100 lines all carry a table of contents. No backslash paths
anywhere in the plugin. Neither reference file links onward, so `skill-refs-one-level` holds.

Ledger staleness — the obvious long-term rot risk — is mitigated the right way: every row carries
its own verified date, the agent prints the ledger date in derived findings
(`agents/definition-reviewer.md:9`, `:67`), so decay shows up in output rather than silently.

Concerns **C6** and **C7** below.

### 8. Docs / observability — SOLID (1 concern)

The output contract is the best thing in this build. Ten numbered caller guarantees
(`agents/definition-reviewer.md:271-283`), a machine-parseable last line, `PASS` iff `errors == 0`,
and — the part that matters — the header is required to state **what did not run**: profile, mode,
Stage 0 coverage, policy posture, exclusion count (`:83`, `:283`). The stated reason is exactly
right: "an omitted check the reader cannot see is indistinguishable from a passed check"
(`references/rules.md:70-71`). Concern **C5** below.

---

## The load-bearing checks, answered individually

### 1. Does the agent pass its own rules?

**Yes, on all five sub-checks. Verified by running them, not by reading the report.**

**`claude plugin validate ./vivreal-agent-review --strict`:**

```
Validating plugin manifest: C:\repos\vivreal-skills\vivreal-agent-review\.claude-plugin\plugin.json
✔ Validation passed
EXIT=0
```

**Marketplace root still clean after the edit:**

```
Validating marketplace manifest: C:\repos\vivreal-skills\.claude-plugin\marketplace.json
✔ Validation passed
EXIT=0
```

**Description length:** 874 chars — under the 1,024 `[spec]` limit and under the design's own 900
budget. The coder's claim is exact.

**No unquoted `: ` in any frontmatter scalar.** I parsed all four files (agent, command, and both
generated mirrors) line by line against the five-part `frontmatter-parses` checklist. Result: zero
hits on colon-space, trailing colon, unmatched quote, reserved indicator, or tab, in any of the
20 frontmatter lines across the four files. Both fences close. **This is the defect that broke 34
skills in this repo and it is absent here.** Not a BLOCK.

One field carries angle brackets — `argument-hint` at `commands/definition-review.md:3`
(`<path to a plugin dir…>`). That is not `name` or `description`, `<` is not a YAML indicator, and
the value parses. Not a finding, and consistent with the plugin's own matched-pair detection rule
(`references/rules.md:354`).

**Body length:** 320 lines exactly. Under the 500-line `[spec]` limit; at the design's self-imposed
budget, with zero headroom. Worth knowing before the next edit.

**Mirrors byte-identical:** `diff` returns clean for both pairs and the md5s match
(`7a5dc7f5…` / `4eec9172…`). No `generated-mirror-drift` against itself.

### 2. Are the 6 eval verdicts genuine, or asserted?

**Genuine.** See the table in dimension 5 — I verified nine distinct factual claims against the
real blobs at `29b9404` and at HEAD, including both cases I was asked to spot-check and seven I
was not. Every one holds, down to line numbers.

Case 1 is caught as an ERROR with both escalation tells independently confirmed present in the
blob. Case 5 is present as a NOTE and explicitly must-not-escalate (`expected/head.md:12`, `:23`).
The corpus also correctly refuses to overstate: `expected/29b9404.md:60-63` points out that the
kit's lexical script produces **no line at all** for `social-video-director.md`, which is the honest
framing — the script is not weaker on case 1, it is incapable.

Nothing here is hand-waved.

### 3. The four claimed corrections to design.md

**(a) `ref-unresolved` 55 → 6 via three added clauses.**

- **Extension-segment guard (clause 1b, `rules.md:102-105`) — sound, and load-bearing for this very
  plugin.** The phrase "`.md`/`.json` files" appears in the agent's own description
  (`agents/definition-reviewer.md:3`), the command's (`commands/definition-review.md:2`), and the
  marketplace entry. Without 1b each of those is a confident, wrong ERROR against the plugin
  itself. Narrow, targeted, correct.
- **Fenced/indented-sample exclusion (clause 6, `rules.md:115-121`) — justified but over-broad.**
  See **C3**.
- **Monorepo suffix fallback (`rules.md:136-148`) — the necessary fix, implemented in a way that
  can silently swallow real defects.** See **C1**. This is the one place where the correction is
  genuinely the mirror image of the bug it replaces, and it is my highest-priority note.

The output-path carve-out (`rules.md:150-159`) is verb-scoped, keyword-listed, and explicitly
framed as a reading task rather than a matching task. That one is fine.

**(b) Is the brief's premise false — does `vivreal-hq` main really have 3 errors?**

**Yes. The coder is right and the brief's "0 errors repo-wide" premise is wrong.** I did not take
the checklist's word for it. I ran my own scan (3 hits: `carousel-editor.md:3`,
`contact-enricher.md:3`, `commands/carousel.md:2`), then copied those exact three files into a
throwaway Profile A plugin and ran the real validator:

```
Validating agent:   …\agents\carousel-editor.md
✘ frontmatter: YAML frontmatter failed to parse: YAML Parse error: Unexpected token.
  At runtime this agent loads with empty metadata (all frontmatter fields silently dropped).
Validating agent:   …\agents\contact-enricher.md    ✘ same
Validating command: …\commands\carousel.md          ✘ same
✘ Validation failed
EXIT=1
```

The offending values are `description: Renders … from a content-planner brief: Instagram carousels`,
`… three invocation modes: (1) sequence-enrolled …`, and `description: Draft a slide carousel:
Instagram PNG set …`. All three load with empty metadata and can never be routed to. **This is a
live product defect in `vivreal-hq`, found by the new agent, that no prior check could see** — the
kit's script has no such rule and Profile B has no Stage 0. `prompt.md` in the same probe validated
clean, which independently confirms the case-5 negative.

**(c) `secret-in-tree` git-ignored exemption — correct, and validated against a real credential.**
See dimension 2. **(d) XML matched-pair detection** (`rules.md:354`) — reasonable; a lone `<slug>`
is a template, and the rule downgrades rather than dropping it, so the finding stays visible.

### 4. OQ-2 — does `claude plugin validate` cover agents?

**The coder's conclusion is correct, and the header wording honestly reflects it.** I ran two
probes rather than accepting it.

*Probe A* — an agent carrying `name: probe2:broken`, `model: gpt-4`, `tools: Read, NotARealTool,
Frobnicate`, `color: chartreuse`, and `bogusField: yes`, alongside a skill with unparseable
frontmatter as a positive control. Output: the skill error fired; **the agent produced no line at
all.** Every one of those five field-level defects passes silently.

*Probe B* — agents only, one with unparseable frontmatter and one with none:

```
Validating agent: …\agents\nofrontmatter.md
⚠ frontmatter: No frontmatter block found.
Validating agent: …\agents\unparseable.md
✘ frontmatter: YAML frontmatter failed to parse …
```

So `Validating agent:` lines do exist — validate covers agents — but only for frontmatter parse and
presence. `agents/definition-reviewer.md:130-134` states exactly this, names the version it was
measured on, and draws the correct consequence ("Every field-level agent rule below is therefore
gated by Stage 1 alone, in both profiles"). `references/platform-facts.md:321-327` records it in
the UNSUPPORTED-BY-DOCS section as measured-not-documented, which is the honest place for it.

Probe B also incidentally corroborates `agent-stray-md`: the tool itself warns on a
frontmatter-less `.md`. The plugin already cites that at `rules.md:344` as observed first-party
behavior and still not documentation. Correct tag discipline.

One wording gap: **C7** below.

### 5. Read-only guarantee — SOLID

Enforced by the tool list, not merely promised. DON'Ts section exists (`:314-320`), and its first
line matches the `vivreal-experts/agents/portal.md:95` house pattern verbatim in shape. Two
additional guards beyond the house pattern: never write into the target (`:319`) and never write
into `C:/repos/vivreal-hq` (`:319`). The command reinforces it at the dispatch boundary
(`commands/definition-review.md:45`, `:56-58` — "Never apply the fixes yourself"). Nothing in the
eight-step procedure instructs a write to a reviewed target.

**Confirmed in practice:** `git -C C:\repos\vivreal-hq status --short` is empty, `git stash list`
is empty, HEAD is `cfa5ed9` on `main`. The corpus was read with `git show` / `git archive` only.

### 6. Router quality — SOLID

Third person ✓. Primary use case in sentence one ✓. Five quoted trigger phrasings a user would
actually type ✓ ("review my agents", "validate this plugin", "why doesn't my skill trigger",
"check my .claude directory", a failing `claude plugin validate`).

The collision test is the real one, so I read both siblings. `vivreal-workflow:reviewer` opens
"Use as the final gate before shipping any diff"; `vivreal-principal:principal-reviewer` opens
"Use this agent as the final gate before shipping a diff — in any repository". Both lead with
*diff* and *ship*. The new description contains neither word in its opener and closes with an
explicit boundary naming both siblings by qualified name and drawing the line on subject matter:
"this one reviews only the configuration that defines Claude Code itself, and reviews no
application code" (`:3`). The shared token is "review", and the surrounding vocabulary disambiguates
it. No misroute risk I can construct.

### 7. `marketplace.json` correctness — SOLID

Parses as JSON. 14 entries, no duplicate names, entry-key shape set is exactly
`{('description','name','source')}` across all 14 — the new entry matches the other 13 exactly.
`source: "./vivreal-agent-review"` resolves to a real directory. `claude plugin validate . --strict`
→ exit **0** after the edit (pasted above). `metadata.version` remains `1.10.0`, per Scope OUT.

### 8. Scope discipline — SOLID

| Scope OUT item | Held? | Evidence |
|---|---|---|
| No edits to `vivreal-hq` | ✓ | `status --short` empty, `stash list` empty, HEAD `cfa5ed9` |
| No kit-file edits | ✓ | 82,415 bytes — matches the stated baseline exactly |
| Don't fix the 34 broken skills | ✓ | working tree shows only `marketplace.json`, `SYNC.md`, and the two new untracked dirs |
| No marketplace version bump | ✓ | `metadata.version` still `1.10.0` |
| Don't vendor the Python scripts | ✓ | no `.py` in the plugin; materialization is a scratch-only runbook (`:292-307`) |
| `sync-to-agy.js` scoped-diff guard | ✓ | exactly 2 mirrors generated, both inside the new plugin; nothing else touched |

I also confirmed `sync-to-agy.js` reads only `agents/` and `commands/` (`:26-27`, `:34-35`,
`:54-55`), so `references/` will never be mirrored and the eval fixtures stay inert as designed.

---

## Concerns (7) — none blocking

**C1 · `ref-unresolved` suffix fallback silently swallows genuinely-moved references, and is
unbounded.** `references/rules.md:136-139`: "If the token matches the tail of exactly one real path
anywhere in the repository, it **resolves**." The monorepo case it was written for
(`commands/crawl.js` → `packages/leadgen/commands/crawl.js`) is a working-directory assumption and
genuinely not an error. But the *moved-file* case is indistinguishable to this predicate: an agent
citing `docs/ARCHITECTURE.md` after the file moved to `archive/docs/ARCHITECTURE.md` resolves via
the fallback and produces **no output at all** — which is precisely the "silent dead instruction"
the rule exists to catch, restored by the fix. Ambiguous multi-match gets a NOTE (`:138`); the
single-match case gets silence. Fix, one line: when a token resolves **only** via the suffix
fallback (all three primary candidates missed), emit a NOTE naming the resolved path, so the
implicit-cwd assumption is visible. Preserves the 55→6 correction at zero false-positive cost.
Secondary: "anywhere in the repository" is an unbounded full-tree walk per token with no
`node_modules` / git-ignored exclusion — both a cost and a correctness hazard (a vendored path can
satisfy the tail match).

**C2 · Clause 1 and clause 2 disagree about directory-terminal tokens, and the ambiguity lands on
this file.** Clause 1 (`rules.md:98-101`) requires "at least one separator joining **two non-empty
segments**". Clause 2 (`:106-108`) admits a token that "ends in `/`". A single-segment directory
token — `docs/`, `references/`, `agents/` — satisfies clause 2 but fails clause 1, and the spec
never says which wins. It is not academic: `agents/definition-reviewer.md:145` writes "Never scan
`references/`, `docs/`, or any unlinked file", and `vivreal-agent-review/` contains no `docs/`
directory. Under the permissive reading the plugin fails its own ERROR rule; under the strict
reading it passes. Add one sentence to clause 2 restricting the directory-terminal branch to
multi-segment tokens.

**C3 · Clause 6's sample exclusion is unconditional, so a real dead reference inside an
instructional fenced block is invisible.** `rules.md:115-121` excludes every token inside a fenced
or four-space-indented block. The justification is sound and I confirmed it is load-bearing — the
agent's own output template at `:241-269` cites `agents/runner.md` and `agents/prompt.md`, neither
of which exists here. But definition files routinely put *instructions* in fences, not just sample
output; this plugin's own Dispatch block (`commands/definition-review.md:34-46`) is a fenced block
containing live dispatch configuration. A dead `Read ${CLAUDE_PLUGIN_ROOT}/references/gone.md`
inside a bash fence is now unreportable. Narrow it: exclude fences introduced as sample/transcript
output, or emit suppressed in-fence tokens as NOTEs rather than dropping them.

**C4 · `expected/head.md` contradicts itself on the aggregate, and the SYNC.md figure only
reconciles under the losing reading.** `expected/head.md:46-47`: "**Errors: exactly the 3 above.**
Any *other* error is a false positive in the reviewer." But `:60-61` states "The remaining three
`ref-unresolved` findings are **output** paths … and are the documented limitation in the rule" —
without pinning their severity. `rules.md:157` says downgrade those "to a NOTE or drop it", which
would make the total 3. Yet `docs/SYNC.md` records the live run as "55 errors to **6**" — 3
frontmatter + 3 output-path — which only holds if they *are* errors. As written the eval fails on
correct behavior in one direction or the other. Pin the three output-path findings to NOTE
explicitly in `expected/head.md` and correct the SYNC.md figure to 3, or state 6 and amend the
"exactly 3" line.

**C5 · The fact ledger asserts doc support without a quote, in the one place it matters.**
`references/platform-facts.md:34` sets the rule: "A claim is settled only if it appears here with a
quote." `:215-217` then writes "**the docs explicitly allow** a marketplace entry to list a plugin
under a name different from the manifest's" — with no verbatim quote, unlike every other row in the
file. That single sentence is the sole justification for downgrading `manifest-name-match` from
ERROR to WARNING (`rules.md:309`). The backing exists — `findings.md:111` traces it to
`plugins-reference:465` — so the fix is to carry the quote across, not to change the verdict. Worth
fixing because this is exactly the class of defect the agent exists to catch, in the artifact whose
whole premise is quote discipline.

**C6 · A hardcoded personal filesystem path ships in a marketplace-distributed plugin.**
`agents/definition-reviewer.md:295` (and its mirror at `:295`) hardcodes
`C:/Users/jcecc/OneDrive/Desktop/MiscThings/# Local Plugin & Agent Validation K.txt` as the Mode B
prerequisite. Two consequences: Mode B is unreachable for every user who is not this author — the
runbook's step 1 will always fail closed, which is at least the safe direction — and the author's
OS username and OneDrive layout are published to anyone installing the plugin. The plugin describes
itself as repo-agnostic (`design.md:36`) and sits in a 14-entry public marketplace. Change step 1 to
ask the caller for the kit path (or read it from an env var), keeping the "never synthesize a
substitute script" guard intact.

**C7 · Stage 0 coverage wording omits commands.** `agents/definition-reviewer.md:130-131` says
validate "validates the manifest, skills, AND agents". My probe shows it also emits
`Validating command:` lines and reports command frontmatter parse errors — that is how I confirmed
`vivreal-hq/.claude/commands/carousel.md`. The plugin's own ledger already quotes the docs saying
validate checks "skill/agent/command frontmatter" (`platform-facts.md:233-235`), so the agent body
is narrower than its own source. Under-claiming, so low harm, but it costs the reviewer a real
corroboration source on Profile A commands. One-word fix.

---

## Notes — what is good

Worth saying, because it is unusual. The output contract's requirement that the header state *what
did not run* (`:83`, `:283`) is the single best design decision in this build — it converts every
skipped check from an invisible gap into a visible line, and the stated reason ("an omitted check
the reader cannot see is indistinguishable from a passed check") is one I intend to steal. The eval
corpus is the second: six cases where two of them are the *same rule on the same unchanged line*
producing opposite verdicts from body evidence alone (cases 2 and 5), which is the cleanest possible
proof that the severity model cannot be a table lookup. And the `[unsupported]` authority tag,
capped at WARNING and required to print itself, is the right structural answer to the folklore
problem rather than a reminder to be careful.

The coder also did the honest thing under pressure: told the user their brief's premise was wrong,
with three specific files, rather than quietly tuning the rule set until the repo came back clean.
That claim survived my independent verification with the authoritative tool.

---

**Verdict: Ship with notes.** 0 BLOCK · 7 CONCERN. C1 (suffix fallback silence) and C6 (hardcoded
personal path) are the two I would fix before anyone else installs this; C2, C3, C4, C5, C7 are
cheap follow-ups. Nothing here is unsafe, nothing is unverified, and nothing was taken on trust.

*Written by Reviewer, Phase 5. Read-only — no file in `vivreal-agent-review/` or `vivreal-hq` was
created, edited, or deleted in this phase.*

---

## Pass 2 — final gate

- **Date:** 2026-08-06 · **Reviewer:** adversarial gate, pass 2 of 3 · **Mode:** diff + artifact
- **Standards:** `vivreal-workflow:shared-standards` re-read. Its trigger map returns *"Skip this file"*
  for every row — no proxy route, no backend, no Mongo, no CSRF, no hydration, no Lambda. No portal
  findings manufactured.
- **Method:** I re-implemented the six-clause `ref-unresolved` predicate from `rules.md:95-210`
  alone, in Python, and ran it against the real HEAD corpus and against the plugin itself in both
  install configurations. Every number below is one I measured. Nothing is taken from the coder's
  report or from pass 1.

**Verdict: Ship with notes.** 0 BLOCK · 5 CLOSED · 1 CLOSED-with-residual · 1 PARTIAL · 3 NEW notes.

---

### C1–C7 disposition

| # | Disposition | Current text | Evidence |
|---|---|---|---|
| **C1** | **CLOSED** | `rules.md:166-173` + `:174-179` | Fallback now emits a NOTE with literal wording naming token and resolved path; silence is reserved for the three primary candidates. Bounded: `git ls-files` inside a worktree, else a walk skipping `.git/`, `node_modules/`, and `.gitignore` entries. My run emits exactly these NOTEs — e.g. `agents/carousel-editor.md:3 → packages/content-studio/src/render-slide.ts`. Not reworded; the silent branch is gone. |
| **C2** | **CLOSED** | `rules.md:108-115` | "The directory-terminal branch applies only to a token that already satisfies clause 1, and **clause 1 wins wherever the two read differently**." Unambiguous — no residual reading admits `docs/`. Independently regression-tested (below). `agents/definition-reviewer.md:148` no longer self-flags. |
| **C3** | **CLOSED, one residual** | `rules.md:131-148` | Clause 6 split into 6a (silent) / 6b (NOTE, only for tokens resolving nowhere). 6a independently confirmed load-bearing. Tell objectivity is imperfect — new finding **N2**. |
| **C4** | **PARTIAL** | `expected/head.md:51,68-81`; `rules.md:198-204`; `SYNC.md` | The self-contradiction is gone, "or drop it" is gone (`:199-200`), SYNC.md reads 55→**3**. The nested-fence explanation is **correct and I located it**. But the **3 does not survive independent verification** — see **N1**. |
| **C4 side effect** | **CLOSED — necessary and correct** | `evals/README.md:34-40` | Justified below. |
| **C5** | **CLOSED** | `platform-facts.md:217-220` | Verbatim quote now carried across; `rules.md:354` verdict still **WARNING**. |
| **C6** | **CLOSED** | `agents/definition-reviewer.md:298-306` | Request → `AGENT_VALIDATION_KIT` → one direct question, failing open to Mode A with literal wording, "never synthesize a substitute script" intact. `grep -rniE "jcecc\|OneDrive\|MiscThings"` over the whole plugin → **zero hits**. |
| **C7** | **CLOSED — verified by probe, not by text** | `agents/definition-reviewer.md:130-133` | Body now says "manifest, skills, agents, AND commands". Corroborated in pass 1 by the real validator naming `commands/carousel.md`; re-confirmed here — that file is one of the 3 pinned frontmatter errors and validate is what found it. |

---

### The judgment calls, adjudicated

**C2 — is the resolution unambiguous, and is it load-bearing?** Both yes, and I measured the second.
I ran my predicate against the plugin standalone twice, changing only clause 2:

```
PERMISSIVE clause 2 (the pass-1 ambiguity)      → 8 ERRORs
  x agents/definition-reviewer.md:3    | .claude/
  x agents/definition-reviewer.md:148  | docs/          <- the line telling the reviewer not to scan it
  x commands/definition-review.md:3    | .claude/
  x commands/definition-review.md:13   | .claude-plugin/marketplace.json
  (+ the 4 mirror duplicates)
SHIPPED clause 2 ("clause 1 wins")              → 2 ERRORs (marketplace.json only)
```

`rules.md:113` pins this at 10; I measured 8. The delta is tokenizer granularity, not substance — the
direction and magnitude hold, and `:148` self-flagging under the permissive reading is reproduced
exactly as the rule claims. **CLOSED.**

**C3 — are 6a's tells objective enough to implement consistently?** **No, not fully — and I proved it
on myself.** Implementing 6a in good faith from `rules.md:132-136`, I applied the tells to *fenced*
blocks but not to *four-space indented* ones (they have no "fence info string"). Result: **6 false
NOTEs against the plugin itself**, at `agents/definition-reviewer.md:63`, `:256`, `:261` and their
three mirror duplicates — precisely the Worked-example and Output-Format templates. That is an
independent confirmation of the coder's "6a OFF → 6 false NOTEs" claim, arrived at by accident, and
it is also direct evidence that a second run can differ from the first. **6a is load-bearing:
confirmed.** The tells are not fully objective: see **N2**. Bounded risk — 6a/6b drift moves only the
note count, never the error count, because clause 6 guarantees "may never be an ERROR" and the verdict
is `PASS iff errors == 0`. That structural protection holds.

**C4 — the nested-fence explanation.** **Correct, and I located the exact site.**
`agents/content-planner.md`:

```
492| ```markdown          <- outer sample block opens
501|   ```json            <- a naive toggle parser CLOSES the outer block here
502|   {... "outputRoot":"content/social/2026-08-07-cut-c-retype/"}
503|   ```                <- naive parser RE-OPENS
506| ```                  <- naive parser closes
    (identical structure repeats at 510 / 518 / 520 / 522)
```

Under a naive toggle, lines 502 and 519 parse as **prose**, and their tokens
(`content/social/2026-08-07-cut-c-retype/`, `content/drafts/2026-W33/r11-instagram.md`,
`content/social/2026-08-14-stack-priced/`) become confident, wrong ERRORs. Under a CommonMark-correct
parse (close only on a fence of ≥ the opening marker length with no info string) they stay inside the
outer block. Fence counts are even in all 21 files, so parity checking cannot catch this. **The
artifact explanation is real, specific, and verified.**

**C4 side effect — was the `evals/README.md` edit necessary?** **Yes, and correct.** I built both trees:
`git archive HEAD` → **804 files**; `git archive HEAD .claude` → **49 files**. The `.claude`-only tree
deletes `packages/`, `content/`, and `knowledge/`, which is where every suffix-fallback target lives.
Measured on the same predicate: full tree → **2** `ref-unresolved` errors; `.claude`-only → **81**.
(The README pins 112; mine is 81 — again tokenizer granularity. The phenomenon is a ~40x swing either
way.) The README's previous build instructions genuinely could not produce the number the eval pins,
so fixing them was not scope creep — it was the only way the eval could be run at all. Beyond the
letter of C4, within its intent. Keep it.

**C5 — verbatim?** `platform-facts.md:217-220` now carries the quote. `findings.md:111` traces it to
`plugins-reference:465` and `findings.md:512` quotes the same doc line for the same purpose. The
verdict at `rules.md:354` is unchanged at **WARNING**, with the reasoning intact. **CLOSED.**

**C7 — verified against a probe.** Pass 1's probe already produced `Validating command:` lines and
named `vivreal-hq/.claude/commands/carousel.md`; that file is now one of the three pinned errors, so
the corroboration path the C7 wording was blocking is live. **CLOSED.**

---

### N1 — the pinned "3 errors at HEAD" does not verify. **Highest-priority note.**

I ran the predicate against the correctly-built full HEAD tree. `ref-unresolved` yields **2 errors**,
not the 0 the eval asserts:

```
=== ERRORS (ref-unresolved): 2
  x agents/short-form-editor.md:160 | content/footage/2026-08-06-domains/footage-manifest.json
  x agents/profiler.md:501          | instagram.com/p/
```

**`short-form-editor.md:160` is an ERROR under the rule as written, and the eval pins it as a NOTE.**
Every escape hatch fails:

- **Not in a fence.** Fences in that file are 31/41, 93/103, 116/118, 126/130, 138/143, 153/155,
  167/169. Line 160 sits between 155 and 167 → prose. Clause 6 does not apply.
- **Does not resolve.** `git ls-tree -r HEAD | grep 2026-08-06-domains` → **no such path**. The only
  `footage-manifest.json` files at HEAD are under `2026-07-30-bakery-menu-update` and
  `2026-07-30-content-calendar`, so the suffix fallback finds nothing either.
- **No output verb.** `rules.md:198-200` requires the surrounding sentence to say *writes, produces,
  emits, generates, regenerates, or creates*. I grepped lines 150–172 for all six stems: the only hit
  is the noun phrase "no tracker write" at :172, which describes something else entirely. **Zero
  trigger verbs.** `expected/head.md:77` justifies the NOTE with "a `manifestPath` in a sample job
  payload naming a file a later step **writes**" — that verb is the reviewer's, not the file's.
- **The rules' own corollary points the other way.** `rules.md:150-154`: a prose path belonging to a
  hypothetical target "should be written with an explicit root placeholder … Bare `agents/foo.md` in
  prose is indistinguishable from a real citation, and **should be treated as one**."

So the artifact now contains two rules pointing in opposite directions on this exact token, and
`expected/head.md` silently picks one. `expected/head.md:51` reads "**Errors: exactly the 3 above.**
Any *other* error is a false positive in the reviewer" — which means a rule-compliant run **fails the
eval**. That is precisely the failure mode `evals/README.md:60-62` forbids ("expected values come from
the intent … never from pasting whatever the reviewer currently emits") and precisely the species of
defect C4 was raised to eliminate, surviving one level down.

**Direct answer to the question asked: no, the "3 errors at HEAD" number is not correct.** The
reproducible floor is **4** (3 × `*-frontmatter-parses` + `short-form-editor.md:160`), and **5** under
one permitted reading of clause 6 (see N3).

**Fix — one of two, ~10 minutes.** Either (a) add `short-form-editor.md:160` as a fourth row to the
`expected/head.md:41-45` error table, change `:51` and `:80` to **4**, and change `SYNC.md` to
"55 errors to **4**"; or (b) widen `rules.md:198-200` so a path a *sibling agent* produces ("already
ran the recorder and is fanning out") qualifies for the downgrade, and say so in `expected/head.md:77`
instead of quoting a verb the file does not contain. **(a) is the honest one** — the finding is real
and the reviewer is right to emit it.

**Not ship-blocking for install.** `references/evals/` is inert: the agent body links only
`rules.md` (`:141`) and `platform-facts.md` (`:180`). Nothing loads the eval at runtime and the
plugin's behavior is correct — it reports a genuinely dead path. **It is blocking for any claim that
the eval passes.** Do not treat this eval as green until the number is corrected.

### N2 — 6a's `- [` tell is confounded with ordinary markdown, and 6a fails silently

`rules.md:135-136` lists finding markers "`x [`, `! [`, `- [`" as a tell that a block is
sample/transcript. `- [` is also markdown task-list and link syntax. It fires on real task lists in
this very corpus:

```
hq-head/.claude/agents/guide-writer.md:98    - [x] <closed items with file:line citations>
hq-head/.claude/agents/guide-writer.md:99    - [ ] **OPEN, required before seeding:** <blockers>
hq-head/.claude/agents/content-planner.md:465  - [x] <items you verified>
hq-head/.claude/agents/content-planner.md:466  - [ ] **Verify before posting:** <human checks…>
```

Both blocks happen to genuinely be sample blocks, so the tell reaches the right answer for the wrong
reason here. But 6a **skips silently**, so a wrong 6a classification is a *false negative* — a dead
reference dropped with no output at all. That is the one direction clause 6's "never an ERROR"
guarantee does not protect. Cheap fix: require the marker to be at the start of a line **and** followed
by a rule-id-shaped token (`- [a-z][a-z0-9-]*]`), which excludes `- [x]`, `- [ ]`, and `- [text](url)`.
**Genuinely fine to leave** — the tell is one of several, and every corpus instance lands correctly —
but it is the mechanism by which 6a will drift between runs.

### N3 — clause 6's "four-space indented block" is undefined against markdown list continuation

`rules.md:122-123` caps any token "within a fenced code block or a four-space indented block" at NOTE.
In CommonMark, a 4-space indent inside a list is *continuation*, not an indented code block — and
definition files are list-heavy. The two readings disagree on the corpus:

```
Reading A (CommonMark-correct: indented code block only)  → 2 ref-unresolved errors
Reading B (naive: any >=4-space indented line is a block) → 1 ref-unresolved error
```

The token that flips is `agents/profiler.md:501` — `instagram.com/p/`, sitting at 6-space indent
inside a nested bullet under item 7. This is the same species of defect as C2, which the coder closed
by adding "clause 1 wins"; clause 6 has the equivalent ambiguity and no equivalent tiebreak. It
directly determines the aggregate the eval pins. One sentence fixes it: state whether "four-space
indented block" means a CommonMark indented code block or any ≥4-space indentation.

---

### The two disclosed-but-unfixed items — should either block? **Neither.**

**(1) 2 residual standalone errors on `.claude-plugin/marketplace.json`.** Confirmed exactly:

```
STANDALONE  (plugin tree is the whole world)  → 2 ERRORs
  x commands/definition-review.md:13          | .claude-plugin/marketplace.json
  x skills/cmd-definition-review/SKILL.md:13  | (mirror of the above)
INSTALLED IN-REPO (vivreal-skills is the corpus) → 0 ERRORs, 8 NOTEs
```

The coder is right that `rules.md:150-154` says this path should carry a `<target>/` placeholder —
the plugin violates its own corollary. It matters more than it looks, because a marketplace-distributed
plugin's *shipping* configuration is standalone, not in-repo. But the blast radius is exactly one
scenario — pointing this reviewer at itself — and the finding it produces is a visible, cited,
self-correcting one rather than a silent wrong answer. **Not a block.** One-character-class fix:
write `<target>/.claude-plugin/marketplace.json` at `commands/definition-review.md:13` and re-run
`sync-to-agy.js`. Do it with the N1 fix.

**(2) `instagram.com/p/` emits a NOTE.** Confirmed as a false positive, and **worse than reported** —
under Reading A of clause 6 it is a full **ERROR**, not a NOTE (N3). The coder's diagnosis is right:
a bare hostname satisfies the multi-segment directory-terminal branch and clause 3 only rejects `://`.
**Not a block** — one wrong NOTE (or one wrong ERROR) on a corpus this size is within the rule's
declared tolerance, and it is visible rather than silent. Fix belongs with N3: extend clause 3 to
reject a first segment that matches a public-suffix-bearing hostname (`\w+\.(com|io|org|net|co)$`),
which is a two-line addition and kills the class.

---

### Regression check — real output

**Validators.**

```
$ claude plugin validate ./vivreal-agent-review --strict
Validating plugin manifest: C:\repos\vivreal-skills\vivreal-agent-review\.claude-plugin\plugin.json
✔ Validation passed
EXIT=0

$ claude plugin validate . --strict
Validating marketplace manifest: C:\repos\vivreal-skills\.claude-plugin\marketplace.json
✔ Validation passed
EXIT=0
```

**Plugin against its own Stage 1 `ref-unresolved`, installed in-repo:** **0 errors**, 8 NOTEs
(6 × 6b instructional in the output templates — which a correct 6a implementation suppresses to 0 —
plus 2 suffix-fallback disclosures on `marketplace.json`). **0 errors / 0 warnings holds.**

**Evals — spot-checked against the real blobs, not the corpus text.**

```
case 1  git show 29b9404:.claude/agents/social-video-director.md
  :4  tools: Read, Write, Edit, Bash, Glob, Grep, Agent          <- tell 1: frontmatter holds Agent
  :22 (subagents cannot spawn subagents — same constraint …)     <- the false claim
  :25 `"degraded":"inline-sequential"` to your summary notes     <- tell 2: procedure branches on it
  => both escalation tells fire independently. Caught as escalated ERROR. HOLDS.

case 5  prompt.md :4   29b9404 -> tools: Bash, Read, Glob, AskUserQuestion
                       HEAD    -> tools: Bash, Read, Glob, AskUserQuestion   (byte-identical)
        prompt.md :9   ## Run me on the main thread (read this first)
        prompt.md :15  - **Correct invocation:** run the intake in the MAIN conversation, either as the
        prompt.md :16    session agent (`claude --agent prompt`) …
  => tools line unchanged, only documentation changed; the documented-escape-hatch test has all three
     literal triggers present. De-escalated to NOTE, must not escalate. HOLDS.

case 6  README.txt present, zero frontmatter-less .md under agents at HEAD (re-confirmed). HOLDS.
```

All 6 hold **as written**. The eval's *aggregate* does not (N1); its per-case assertions do.

**Mirrors byte-identical.**

```
diff agents/definition-reviewer.md  skills/definition-reviewer/SKILL.md    -> clean
diff commands/definition-review.md  skills/cmd-definition-review/SKILL.md  -> clean
7c29a20125411d0755584d341e353dae  agents/definition-reviewer.md
7c29a20125411d0755584d341e353dae  skills/definition-reviewer/SKILL.md
4eec9172f91295a14fa36257f74cf36d  commands/definition-review.md
4eec9172f91295a14fa36257f74cf36d  skills/cmd-definition-review/SKILL.md
```

Note the agent md5 moved from pass 1's `7a5dc7f5…` to `7c29a20…` — expected, the remediation edited it —
and the mirror moved with it, which is the thing that actually matters.

**Budgets.**

| Budget | Limit | Measured | |
|---|---|---|---|
| agent body | 500 lines `[spec]` | **328** | ✓ (was 320; +8 from remediation) |
| agent `description` | 1,024 chars | **874** | ✓ unchanged |
| `plugin.json` description | 200 | **197** | ✓ |
| unquoted `: ` in frontmatter | zero | **zero across all 4 files** | ✓ |

The 328 exceeds the design's self-imposed 320-line budget by 8 lines. Under the `[spec]` limit with
172 lines of headroom, so not a finding — but the self-imposed budget is now breached and should
either be re-stated or respected on the next edit.

**Scope held.**

| Scope OUT item | Held? | Evidence |
|---|---|---|
| No edits to `vivreal-hq` | ✓ | `git status --short` → 0 lines; `stash list` empty; HEAD still `cfa5ed9` |
| Kit file unmodified | ✓ | **82,415 bytes** — exact baseline |
| `metadata.version` not bumped | ✓ | still `1.10.0`; 14 entries, no duplicate names |
| 34 broken skills untouched | ✓ | working tree is only `marketplace.json`, `SYNC.md`, and the 2 untracked dirs |
| Diff surface | ✓ | `marketplace.json` +5 lines (one uniform 3-key entry); `SYNC.md` +1 row. Nothing else. |

---

### Notes — what pass 2 found good

The remediation did not rename its problems. C1's fallback NOTE, C2's "clause 1 wins", and C6's
env-var-with-fail-open are all real mechanism changes that I regression-tested by flipping them back
and measuring the difference. The C4 nested-fence diagnosis is the standout: the coder found a
CommonMark parsing subtlety that fence-parity checking cannot detect, and it is exactly where they
said it was. And the `evals/README.md` edit is the right kind of scope expansion — the eval's build
instructions were unrunnable, and pinning a number to a tree nobody could reconstruct would have been
the worse sin.

The three notes I am leaving open all share one root: **small integers pinned in prose that depend on
implementation details the prose does not fix.** 10 vs my 8, 112 vs my 81, 3 vs my 4. The directions
are all right; the exact values are tokenizer- and parser-dependent. The durable fix is to state these
as "measured with implementation X" rather than as invariants — but N1 is the one that must change,
because it is an acceptance criterion, not a footnote.

---

**Verdict: Ship with notes.** 0 BLOCK. The plugin installs, validates clean in both scopes, passes its
own rules in-repo with 0 errors, holds every per-case eval assertion, and holds every scope boundary.
**N1 is not ship-blocking for install but is ship-blocking for the claim that the eval passes** — fix
`expected/head.md` 3→4 and `SYNC.md` 55→3→4 before anyone runs the regression, or the next maintainer
will "fix" the reviewer into suppressing a true finding. N2, N3, and the two disclosed items are
genuinely fine to leave; batch them into one cleanup with N1 if convenient.

*Written by Reviewer, pass 2 of 3 (final). Read-only — no file in `vivreal-agent-review/` or
`vivreal-hq` was created, edited, or deleted. All measurements ran against `git archive` copies in
scratch.*
