# RESULT — agent-definition-reviewer

- **Date:** 2026-08-06
- **Workflow:** `/orchestrate` FEATURE (Complex)
- **Repo:** `C:\repos\vivreal-skills`
- **Branch:** `project/agent-definition-reviewer`
- **PR:** https://github.com/HillBombCreations/vivreal-skills/pull/3
- **Review verdict:** Ship with notes — 0 BLOCK across two adversarial passes; all 7 concerns
  and 2 of 3 new findings closed.

## What shipped

A new standalone plugin, **`vivreal-agent-review`**, containing a read-only reviewer for Claude
Code *definition* files — the `.md` and `.json` files that configure Claude Code itself. It is not
a code reviewer.

| Component | Path | Size |
|---|---|---|
| Agent | `vivreal-agent-review/agents/definition-reviewer.md` | 328 lines, description 874 chars |
| Command | `vivreal-agent-review/commands/definition-review.md` | 58 lines |
| Rule table | `vivreal-agent-review/references/rules.md` | 497 lines |
| Platform-fact ledger | `vivreal-agent-review/references/platform-facts.md` | 349 lines |
| Eval corpus | `vivreal-agent-review/references/evals/` | 4 files, 6 cases |
| Manifest | `vivreal-agent-review/.claude-plugin/plugin.json` | description 199/200 |
| Generated mirrors | `vivreal-agent-review/skills/**/SKILL.md` | 2, byte-identical to source |

Registered as marketplace entry 14. `metadata.version` deliberately **not** bumped (scope OUT).

## Placement decision

**New standalone plugin**, not folded into `vivreal-workflow`.

> `vivreal-workflow` fails `claude plugin validate --strict` at exit 1 today over 4 unrelated
> skill YAML-parse errors, so the brief's "validates clean" definition-of-done is unreachable
> there — and a repo-agnostic Claude Code linter has no business inheriting the Vivreal
> bug-workflow's description, its `shared-standards` coupling, or its router competition with
> `vivreal-workflow:reviewer`.

Naming note: the agent is `definition-reviewer`, not the obvious `claude-config-reviewer`, because
`sync-to-agy.js` copies every agent verbatim into a generated `SKILL.md` — so the agent's `name`
becomes a *skill* name, and `skill-name-reserved` makes "claude"/"anthropic" a `[spec]` ERROR. The
obvious name would have made this agent defect #35 in its own report.

## Definition of done — evidence

```
claude plugin validate ./vivreal-agent-review --strict   ✔ Validation passed   EXIT=0
claude plugin validate . --strict (marketplace root)     ✔ Validation passed   EXIT=0
own Stage 1 rules vs own plugin (Profile A, in-repo)     0 errors, 0 warnings  EXIT=0
                                                          (2 generated mirrors excluded)
```

All 6 eval cases verified independently by the reviewer against the real blobs, not taken on the
implementer's report:

| # | Case | Expected | Result |
|---|---|---|---|
| 1 | `social-video-director.md:22` @29b9404 — false "subagents cannot spawn subagents" | ERROR, escalated | HOLDS — both tells fire (`:4` holds `Agent`; `:23-25` branches on the claim) |
| 2 | `prompt.md:4` @29b9404 — `AskUserQuestion` in `tools` | WARNING, escalated | HOLDS — 0 escape-hatch hits at that commit |
| 3 | `content-creator/README.md:1` @29b9404 — frontmatter-less `.md` | WARNING `[unsupported]` | HOLDS — exactly one such file |
| 4 | `runner.md:52` @29b9404 — no output contract | WARNING | HOLDS |
| 5 | `prompt.md:4` @HEAD — same `tools` line, now documented | NOTE, never a blocker | HOLDS — de-escalated, escape hatch at `:9`/`:15`/`:16` |
| 6 | `content-creator/README.txt` @HEAD — deliberately `.txt` | no finding at all | HOLDS — zero findings |

Scope discipline verified: `vivreal-hq` worktree clean at `cfa5ed9` with no stashes (read via
`git show`/`git archive` only), the validation kit unmodified at 82,415 bytes, the 34 pre-existing
broken skills untouched, no marketplace version bump, zero author-path strings in the plugin.

## Findings that outlived the build

**1. The brief's "current `vivreal-hq` main is clean, 0 errors" premise is false.** Independently
confirmed against the first-party validator: `carousel-editor.md:3`, `contact-enricher.md:3`, and
`commands/carousel.md:2` each carry an unquoted `: ` in a frontmatter scalar and load with **empty
metadata — no description, unroutable**. The "0 errors" figure was measured with the kit's rule
set, which has no frontmatter-parse check.

**2. The same defect has 34 instances in this repo** — `vivreal-knowledge` (21), `vivreal-infra`
(9), `vivreal-workflow` (4). Reported, not fixed, per scope. Worth its own project: 34 skills
currently cannot be routed to.

**3. What is wrong with the validation kit** (17 corrections recorded as advisory in `design.md`;
the kit file itself was left unedited because both doc URLs re-verified with zero drift, so the
brief's conditional kit-fix never triggered):

- **D1 (critical)** — the directory-qualified-reference rule, the fix credited with taking a run
  from 26 false positives to 0, **is not in the kit at all**. Not as a rule, not as prose, no rule
  ID. It exists only in the build brief.
- **D2 (critical)** — the platform-claim check has no rule ID or severity either. The kit's own
  Stage 1 script was materialized and run: it is **completely silent on eval case 1**, the
  highest-severity defect.
- **D3 (high)** — Agency `[policy]` rules default ON and mis-fire outside Agency; `readme-exists`
  false-ERRORs on all 13 pre-existing plugins here. Now defaulted OFF, with the header always
  disclosing it.
- **D5** — nothing validated that frontmatter *parses*, and Profile B has no Stage 0 — which is
  precisely why the 37 broken files above were invisible.
- `SKILL_FIELDS` missing `when_to_use` — the only kit drift that produces wrong output on valid
  input. Corrected in the shipped rule set.

**4. OQ-2 settled empirically.** `claude plugin validate` *does* cover agent files (`Validating
agent:` lines) but on an agent checks only frontmatter parse and presence — probes passed
`name: probe2:broken`, `model: gpt-4`, a bogus color, an unknown field, and a nonexistent tool in
silence. **Every field-level agent rule is Stage-1-only, in both profiles.** Stage 0 is a floor,
not a gate.

**5. The docs did not move** since the kit's 2026-08-06 verification. Both load-bearing claims
confirmed verbatim. One caveat carried into the rule set: the subagent nesting depth of `3` is a
*default*, settable via `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`, and was `5` in v2.1.172–216 and
`1` in v2.1.217–218 — so the eval asserts the behavior, not the integer.

## Corrections forced by running it for real

`ref-unresolved` needed three clauses the design did not anticipate — a monorepo suffix fallback,
a fenced/indented-sample exclusion, and an extension-segment guard — after the first real run
produced 55 findings of which 52 were false positives, twice the scale of the original bug.

Three rule ambiguities were then given explicit tiebreaks, each in the same form, because each was
producing different answers on the same tree:

| Ambiguity | Tiebreak |
|---|---|
| clause 1 (two non-empty segments) vs clause 2 (ends in `/`) | clause 1 wins wherever the two read differently |
| worked-example corollary vs the output-path verb test | the corollary governs; the six verbs are the only exit |
| "four-space indented block" vs markdown list continuation | CommonMark indented code block; list continuation is never one |

Plus clause 3b, a closed-TLD bare-hostname reject, so `instagram.com/p/` is not a path.

The HEAD baseline was re-pinned three times (6 → 3 → **5 archive / 4 live**) as each measurement
exposed a flaw in how the eval tree was built, not in the rules: `git archive HEAD .claude` yields
49 files against 804 for the full tree, which deletes the corpus the suffix fallback searches. The
final split is deterministic in both directions — `footage-recorder.md:22` cites a git-ignored file
that `git archive` drops, so it errors on the reconstruction and resolves silently on a checkout.

## Left open deliberately

- **N2** — clause 6a's `- [` sample tell also matches markdown task lists. 6a skips *silently*, so
  a misfire is a false negative, not a false positive. Reviewer recommended leaving it.
- **2 standalone `ref-unresolved` errors** — `commands/definition-review.md:13` cites
  `.claude-plugin/marketplace.json`, a path belonging to the *target under review*; the rules' own
  corollary says such paths should carry a `<target>/` placeholder. Visible, not silent, one
  scenario.
- The 34 broken skills, and the 3 in `vivreal-hq`.

## Process notes

Two deviations from the standard `/orchestrate` cadence, both deliberate and recorded:

1. **Phase 3 approval gate waived** on the user's explicit "one pass" and "do not stop for approval
   on the placement decision" instruction. All 12 change items auto-approved with a banner in
   `design.md`; nothing was silently chosen.
2. **Phase 1 split into two parallel dispatches** because the `researcher` agent has no `WebFetch`
   and the brief required re-verifying the doc URLs.

Review passes: 2 (the workflow limit), plus three scoped remediation passes. The final pass was
verified by measurement and independent orchestrator re-run rather than a third review.

## Artifacts

`docs/projects/agent-definition-reviewer/` — `brief.md`, `findings.md` (594), `docs-verification.md`
(368), `design.md` (748), `review.md` (746, both passes preserved), `metrics.md`, this file.
