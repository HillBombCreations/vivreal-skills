# The six eval cases

Four positive cases at `29b9404`, two negative cases at `HEAD`. Each states the
evidence, the detectable signal, and the expected verdict.

Paths below are relative to the reconstructed `.claude` root. They are illustrative
fixture references, not citations into this plugin — the `ref-unresolved` rule is
scoped to files Claude Code loads as instructions, which is why an eval corpus can
name files that do not exist here without failing the reviewer's own review.

## Table of contents

- [Case 1 — false platform claim](#case-1--false-platform-claim)
- [Case 2 — never-available tool, no documented path](#case-2--never-available-tool-no-documented-path)
- [Case 3 — frontmatter-less .md in the scanned tree](#case-3--frontmatter-less-md-in-the-scanned-tree)
- [Case 4 — no output contract](#case-4--no-output-contract)
- [Case 5 — NEGATIVE, same tool, now documented](#case-5--negative-same-tool-now-documented)
- [Case 6 — NEGATIVE, deliberate .txt](#case-6--negative-deliberate-txt)
- [Corpus-level assertions](#corpus-level-assertions)

---

## Case 1 — false platform claim

**File.** `agents/social-video-director.md:22` at `29b9404`
**Expect.** `claim-false` · **ERROR** (escalated from the WARNING default)

**Evidence.** Line 22 reads:

    (subagents cannot spawn subagents — same constraint as content-creator.md).

Line 4 of the same file reads `tools: Read, Write, Edit, Bash, Glob, Grep, Agent`.
Lines 23 to 25 branch on the claim, routing every subagent invocation into a
`"degraded":"inline-sequential"` path.

**Why it is false.** The fact ledger settles it — a subagent CAN spawn subagents
below the main conversation, and the `Agent` tool is withheld only at the depth
limit. Assert the behavior, never a depth integer.

**Why it escalates.** Both machine-checkable tells fire at once. The file denies a
capability in prose while its own frontmatter holds the corresponding tool, and its
own procedure branches on the false claim. The consequence is that the file's
primary path was disabled for no reason.

**Detectable signal — and the whole reason this agent exists.** No lexical rule
fires on this file at all. The kit's Stage 1 script produces **zero** findings
against it. Catching this requires extracting a prose assertion (platform noun plus
capability negation) and checking it against a fact ledger.

**Bonus false-positive guard on the same line.** `content-creator.md` is a bare
basename with no directory separator, so it is a **mention, not a reference**, and
`ref-unresolved` must skip it silently. This is not hypothetical: that file does not
exist at `HEAD`. A reviewer that resolves bare basenames would report a confident,
wrong broken-reference error here.

---

## Case 2 — never-available tool, no documented path

**File.** `agents/prompt.md:4` at `29b9404`
**Expect.** `agent-tools-never-available` · **WARNING, escalated toward a blocker**

**Evidence.** `tools: Bash, Read, Glob, AskUserQuestion`. The agent's purpose
depends on that tool — line 29 says "choosable list (use `AskUserQuestion`)" and
line 97 says "**You are interactive.** Talk to the user with `AskUserQuestion`".

**Escalation predicate.** Search the body for a documented main-thread invocation:
`claude --agent <name>`, "main thread", "main-thread", "MAIN conversation",
"session agent". At this commit there are **zero** such hits. Absent, plus a purpose
that depends on the tool, means escalate — an intake agent that can never ask a
question fails silently, and a guessed answer is worse than none.

---

## Case 3 — frontmatter-less .md in the scanned tree

**File.** `agents/content-creator/README.md:1` at `29b9404`
**Expect.** `agent-stray-md` · **WARNING**, tagged `[unsupported]`

**Evidence.** The file opens `# Content Creator Agent`, not a `---` fence. Scanning
every `.md` under the agents root and testing whether line 1 equals `---` finds
**exactly one** failure, this file.

**Two things make the rule correct rather than noisy.** The scan must be
**recursive** — this file is one directory deep. And it must key on the **`.md`
extension only**, which is precisely what makes case 6 a non-finding.

**Tag discipline.** The docs are silent on what happens to such a file, so this may
never be reported as a load failure. `claude plugin validate` does warn on it in
Profile A (`No frontmatter block found`), which is observed first-party behavior
worth citing — and still not documentation.

---

## Case 4 — no output contract

**File.** `agents/runner.md:52` at `29b9404`
**Expect.** `agent-output-format` · **WARNING**

**Evidence.** The file has a `## How to report` section at lines 52 to 62 that
states *what to say* after each stage but never *the shape of the return value*.
There is no template, no schema, no fenced block, no delimiters.

**Why the naive checks are both wrong.** A keyword scan for
`output|format|response|contract` returns **zero** matches, so the kit's regex fires
here by luck — any file mentioning "the CSV format" in passing would pass while
still having no contract. And a `^## Output` heading check would miss this entirely,
because the heading is called "How to report". The rule therefore needs **heading
breadth plus a shape requirement**: an output-family heading AND a template, fenced
block, field list, or schema defining the return value.

---

## Case 5 — NEGATIVE, same tool, now documented

**File.** `agents/prompt.md:4` at `HEAD`
**Expect.** `agent-tools-never-available` present as a **NOTE**. It must **NOT** be
reported as a blocker.

**Evidence.** The `tools` line is **unchanged** — still
`tools: Bash, Read, Glob, AskUserQuestion`. What changed is the documentation. Line
9 opens `## Run me on the main thread (read this first)`; lines 15 to 16 give the
correct invocation, "run the intake in the MAIN conversation, either as the session
agent (`claude --agent prompt`)"; line 36 records that the tool is kept "on purpose
— it is live on the main-thread path and only dead on the subagent path".

**Why this case exists.** The same rule, on the same unchanged line, must produce
the opposite verdict from case 2, decided purely from body evidence. That is the
documented-escape-hatch test, and it is why severity cannot be a table lookup.

**It is also the `agent-tools-never-available` lesson in full.** The rule was first
written as an ERROR and that was wrong. The correct fix was documentation, not tool
removal — proven here, because the fix touched only the prose.

**Permitted extra finding.** Lines 11 to 12 state that `AskUserQuestion` "is
stripped from EVERY subagent, in the foreground and the background alike". That is
very slightly overbroad, because a conversation fork skips both tool filters. A
NOTE-level observation is acceptable. It must **never** escalate — the claim is not
load-bearing, and the file's remedy is correct either way.

---

## Case 6 — NEGATIVE, deliberate .txt

**File.** `agents/content-creator/README.txt` at `HEAD`
**Expect.** **No finding of any kind.**

**Evidence.** Case 3 was fixed by renaming `.md` to `.txt`, which removes the file
from the recursive `*.md` scan while keeping the documentation in place. Scanning
every `.md` under the agents root at `HEAD` yields **zero** frontmatter-less files.

**The trap.** The stray rule must stay scoped to the `.md` extension. Any widening
to "non-agent files in the agents tree" re-flags this file and is wrong. The same
tree legitimately contains `.gitkeep`, `.css`, `.json`, `.svg`, and `.html` assets —
none of them flaggable.

---

## Corpus-level assertions

| Assertion | Value |
|---|---|
| `29b9404` total | **at least 4 errors and at least 7 warnings** — never an exact-count assertion |
| `29b9404` extra errors beyond the four named cases | 4 files whose `name` contains `:` and therefore never load |
| `HEAD` baseline | **5 errors** on the reconstructed tree — 3 `*-frontmatter-parses` plus 2 `ref-unresolved` (`short-form-editor.md:160`, `footage-recorder.md:22`). **4 on a live checkout**, where the git-ignored `auth.storageState.json` the second one cites is present. **Not 0** — see `expected/head.md`. The widely-quoted "0 errors" figure was measured with the kit's rule set, which has no frontmatter-parse check. |
| `HEAD` warnings | the case-5 finding, correct as written |
| Profile detection, both trees | **Profile B**, root at the `.claude` directory |

The four extra errors at `29b9404` are `agents/content-creator/overlay-shot.md`,
`portal-footage.md`, `typography-slide.md`, and `ui-mockup-slide.md`, each declaring
a `name` such as `content-creator:overlay-shot`. All four were fixed by deletion.
They are genuine and must be reported; they are simply not among the cases the
original brief enumerated, which is exactly why the eval asserts presence rather
than totals.
