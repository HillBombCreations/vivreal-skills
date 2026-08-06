# Expected findings — `HEAD` (the after tree)

Target: `<scratch>/hq-head`, resolving to **Profile B**, root `<scratch>/hq-head/.claude`.

This tree is the fixed state. It is the source of both negative cases, and the
baseline that proves the reviewer does not manufacture findings on clean input.

**Reconstruct the WHOLE tree, not just `.claude`** (see the README). These agents
cite paths relative to their own monorepo package, so a `.claude`-only archive
deletes the corpus `ref-unresolved`'s suffix fallback searches, and the same commit
then measures **112** `ref-unresolved` errors instead of the **2** it actually has.

## Table of contents

- [Must be PRESENT](#must-be-present)
- [Must be ABSENT — these are the negative assertions](#must-be-absent--these-are-the-negative-assertions)
- [Aggregate](#aggregate)
- [Why `footage-recorder.md:22` is reconstruction-dependent](#why-footage-recordermd22-is-reconstruction-dependent)
- [Known false-positive class, measured](#known-false-positive-class-measured)
- [Permitted extra findings](#permitted-extra-findings)
- [Corroboration from the lexical subset](#corroboration-from-the-lexical-subset)

## Must be PRESENT

| rule-id | file | line | severity | note |
|---|---|---|---|---|
| `agent-tools-never-available` | `agents/prompt.md` | 4 | **NOTE** | de-escalated by the documented-escape-hatch test |

The de-escalation reason must be printed, and must name the test that fired. The
finding text should cite the documented path — `claude --agent prompt` at line 16,
"main thread" at line 9, "MAIN conversation" at line 15 — and state plainly that the
file is correct as written.

## Must be ABSENT — these are the negative assertions

| rule-id | file | why it must not fire |
|---|---|---|
| `agent-tools-never-available` **as an ERROR or blocker** | `agents/prompt.md` | Case 5. The rule firing is correct; the escalation is not. The `tools` line is unchanged from the before tree — only the documentation changed, and that is the whole point. |
| `agent-stray-md` | `agents/content-creator/README.txt` | Case 6. The rule is scoped to `.md` only. Any widening re-flags a deliberately renamed file. |
| **any finding at all** | `agents/content-creator/README.txt` | It is documentation in a `.txt`, exactly where it belongs. |
| `agent-stray-md` | anywhere in the tree | Zero frontmatter-less `.md` files remain at this commit. |
| `claim-false` **as an ERROR** | `agents/social-video-director.md` | Fixed upstream. The corrected file records the correction inline. |
| `ref-unresolved` **at all** | `agents/profiler.md:501` | `instagram.com/p/` is a bare hostname, rejected at clause 3b. Not an ERROR and not a NOTE. Before 3b it flipped between the two depending on how clause 6's "four-space indented block" was read — the ambiguity clause 6's tiebreak now settles. |

## Aggregate

**Do not assert "0 errors" here.** That figure was measured with the *kit's* rule
set, which has no frontmatter-parse check, against a Profile B tree, which has no
Stage 0. Under the corrected rule set the same commit yields **5 genuine errors**
that nothing previously detected:

| rule-id | file | line | why it is real |
|---|---|---|---|
| `agent-frontmatter-parses` | `agents/carousel-editor.md` | 3 | `description` is an unquoted scalar containing `brief: Instagram` — colon-space. The file loads with empty metadata and can never be routed to. |
| `agent-frontmatter-parses` | `agents/contact-enricher.md` | 3 | same defect (`modes: (1) sequence-enrolled`) |
| `command-frontmatter-parses` | `commands/carousel.md` | 2 | same defect (`carousel: Instagram`) |
| `ref-unresolved` | `agents/short-form-editor.md` | 160 | `content/footage/2026-08-06-domains/footage-manifest.json`. Prose, between the fences at 153/155 and 167/169, so clause 6 does not reach it. No such path at `HEAD` and the suffix fallback finds nothing — the only `footage-manifest.json` files are under `2026-07-30-bakery-menu-update` and `2026-07-30-content-calendar`. Lines 150–172 contain **none** of the six output-path verbs. Per the worked-example tiebreak in `rules.md`, a hypothetical-looking prose path without a trigger verb is a citation, and an unresolved citation is an ERROR. |
| `ref-unresolved` | `agents/footage-recorder.md` | 22 | `.claude/agents/content-creator/auth.storageState.json`. Prose, no verb, resolves by no candidate **in the reconstructed tree**. Correct output for the tree the README tells you to build — see the next section before "fixing" it. |

The first three are the highest-value findings the reviewer produces on this corpus,
and they are invisible to every other check available: the kit's script has no such
rule, and Profile B has no `claude plugin validate` to fall back on.

- **Errors: exactly the 5 above.** Any *other* error is a false positive in the
  reviewer; `ref-unresolved` contributes exactly **two**, per the rows above.
- **The four cases-5-and-6 negative assertions above still hold** — none of the five
  involves `prompt.md` or `README.txt`.
- **Notes: at least 1** — the case-5 note. The measured run also emits about **90**
  `ref-unresolved` NOTEs (suffix-fallback disclosures, in-fence instructional
  tokens, the two output paths). Notes are never asserted by count.

## Why `footage-recorder.md:22` is reconstruction-dependent

`.claude/agents/content-creator/auth.storageState.json` **exists in the real
repository** and is **excluded from `git archive`**, because `.gitignore:33` carries
`*storageState*`. So the fifth error is present on the reconstructed corpus and
absent on a live checkout, and the eval pins the reconstructed number because that is
the tree the README's build instructions produce.

The section below is the corroboration: the live run's original 55 errors included a
`secret-in-tree` hit on this very file — which only fires when the file is *present* —
and no `ref-unresolved` for the citation at `:22`, which resolved. On the archive tree
the picture inverts: the file is gone, so `secret-in-tree` has nothing to see and
`ref-unresolved` fires instead. Same file, two rules, opposite trees. (`secret-in-tree`
is now silent on both, since the git-ignored exemption was added; the citation check is
what still moves.)

Do **not** "fix" this by narrowing `ref-unresolved`. A citation that resolves only to
a git-ignored file is genuinely worth seeing, and `rules.md`'s fallback scope already
forbids a git-ignored copy from satisfying a tail match. Expect **5** on the archive
tree and **4** on a live checkout that still holds the session file.

## Known false-positive class, measured

A run against the real repository initially produced **55 errors**. Fifty were
`ref-unresolved` against paths that genuinely exist under monorepo package roots
(`packages/leadgen/commands/crawl.js` cited as `commands/crawl.js`), one was a
git-ignored `*storageState*` file that the rule explicitly exempts, and one was a
`<slug>` placeholder read as an XML tag. The suffix fallback, the git-ignored
exemption, and matched-pair tag detection removed all 52.

**Two `ref-unresolved` findings survive as NOTEs.** They are **output** paths the
files themselves generate — the documented limitation in the rule, whose verb test
pins a NOTE rather than leaving "NOTE or drop" open, so this figure is deterministic:

| file:line | token | verb evidence |
|---|---|---|
| `agents/guide-writer.md:139` | `public/search-index.json` | "The build **regenerates** tracked artifacts" |
| `agents/guide-writer.md:140` | `public/embeddings.json` | same sentence |

A third output-path candidate was previously listed here —
`agents/short-form-editor.md:160` — justified by the word "writes". That word is not
in the file; the sentence carries no trigger verb at all, and the token is an ERROR.
It is now in the error table above, which is where the rule as written puts it.

So the corrected end state of that live run is **55 errors to 4**, plus the
reconstruction-only fifth described above for a total of **5** on the archive tree.
An earlier figure of **6** counted all three output paths as errors and is superseded;
an intermediate figure of **3** counted `short-form-editor.md:160` as an output-path
NOTE, and is superseded by the tiebreak in `rules.md`.

## Permitted extra findings

Listed, not failed:

| rule-id | file | severity ceiling | rationale |
|---|---|---|---|
| `claim-false` | `agents/prompt.md:11-12` | **NOTE** | The file says `AskUserQuestion` is "stripped from EVERY subagent, in the foreground and the background alike". Slightly overbroad — a conversation fork skips both tool filters. Not load-bearing, and the file's remedy is correct regardless, so this may never escalate. |

## Corroboration from the lexical subset

    PASS  hq-head  [profile B]  (0 errors, 1 warnings)
      ! [agent-tools-never-available] agents/prompt.md lists ['AskUserQuestion'] ...
    Stage 1: errors=0 warnings=1 passed=True

The lexical pass reports the tool finding as a plain WARNING because it has no way
to read the documentation that makes it legitimate. Reading that documentation and
de-escalating to a NOTE is the reviewer's job, and the difference between this file
and its own earlier version is the clearest demonstration of it.
