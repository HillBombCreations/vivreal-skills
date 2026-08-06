# Eval corpus — definition-reviewer

Six regression cases drawn from a real repository, four positive and two negative.
They exist because a reviewer that cannot be tested is a reviewer nobody can trust.

## Table of contents

- [Provenance](#provenance)
- [How to run](#how-to-run)
- [Form: assertions, not snapshots](#form-assertions-not-snapshots)
- [Files](#files)

## Provenance

The corpus is the `.claude/` tree of `C:/repos/vivreal-hq` at two commits:

| Ref | Commit | Role |
|---|---|---|
| before | `29b9404` | Four real defects, one of which no lexical rule can catch |
| after | `HEAD` at the time of writing (`cfa5ed9`) | The fixed state, source of the two negative cases |

**That repository is a read-only corpus.** Reconstruct it with `git archive` and
never check it out, branch it, or write inside it.

## How to run

Reconstruct both trees into a scratch directory:

```bash
git -C C:/repos/vivreal-hq archive 29b9404 | tar -x -C <scratch>/hq-before
git -C C:/repos/vivreal-hq archive HEAD    | tar -x -C <scratch>/hq-head
```

**Archive the whole tree, not just `.claude`.** `ref-unresolved` resolves a token
against the citing file's directory, the target root, the git toplevel, and then a
bounded suffix fallback over the repository. These agents cite paths relative to
their own monorepo package, so a `.claude`-only archive deletes the corpus the
fallback searches and turns roughly fifty correct citations into confident, wrong
ERRORs — **112** of them at `HEAD`, against a true count of **2** ERRORs and 2
output-path NOTEs. Note also that `git archive` omits git-ignored files, and one
citation in the corpus points at one; `expected/head.md` says which. The
reviewer still resolves the profile at the `.claude` subdirectory either way.

Then point the reviewer at `<scratch>/hq-before` and `<scratch>/hq-head` in turn.
Both resolve as **Profile B**, rooted at the `.claude` directory. Compare the output
against `expected/29b9404.md` and `expected/head.md`.

For the lexical subset only, the kit's Stage 1 script can corroborate. It cannot
perform `ref-unresolved` or `claim-false`, so it is silent on case 1 — which is the
single most important thing this corpus demonstrates.

## Form: assertions, not snapshots

Each case asserts that a `(rule-id, file, severity-class)` tuple is **PRESENT** or
**ABSENT**. It does **not** assert a total finding count.

This matters. The `29b9404` tree carries **4 errors and 7 warnings**, not the "four
defects" a casual description would suggest, because four agent files there have a
`:` in their `name` and never load at all. An eval asserting exact equality fails on
correct behavior. **Extra findings are allowed, and are listed rather than failed.**

Expected values come from the platform docs and from the intent of each file — never
from pasting whatever the reviewer currently emits. Snapshotting output would freeze
today's bugs in as requirements.

## Files

| File | Contents |
|---|---|
| `cases.md` | The six cases, with the evidence and the detectable signal for each |
| `expected/29b9404.md` | Expected finding set for the before tree |
| `expected/head.md` | Expected finding set for the after tree, including what must NOT appear |
