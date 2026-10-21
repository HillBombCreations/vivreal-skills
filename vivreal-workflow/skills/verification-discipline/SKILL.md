---
name: verification-discipline
description: Use whenever a result is about to become a finding, a claim, a PASS or a merge. Covers the false-zero mechanisms that make a broken search look like a clean absence, the positive control that is the only defence against them, why a gate can be enabled and still incapable of failing, why a count is the wrong assertion when the question is which, the faked layers (a stubbed model, a mocked next hop, a too-broad spy) that pass on broken code, and how to read a deployed line instead of a working tree. Triggers on, grep returned nothing, no results found, zero occurrences, the test passes, coverage is 100 percent, the lint rule is on, I verified, I confirmed, I checked, audit, sweep, measure, count, mutation testing, break harness, is this shipped, does this exist.
---

# Verification discipline

This skill is about one failure: **you looked, you saw nothing, and nothing was the wrong
answer.** Every rule below is a shape that failure takes. None of them announce themselves.
All of them look exactly like a clean result.

---

## The rule that covers every case, including the ones not listed here

> **A negative result is not a finding until a positive control, using the SAME tool, the
> SAME pattern style and the SAME path shape, comes back non-empty IN THE SAME RUN.**

All three "same"s are load bearing, and each one has been the difference on its own.

- **Same tool.** A hit with `rg` does not validate a miss with `git grep`. They do not share a
  regex dialect, a default, or a path handling rule.
- **Same pattern style.** A control searching a plain word does not validate a miss on a
  pattern with escaped parentheses, an alternation, or a lookahead. The escape is the thing
  that broke; a control that avoids it tests nothing.
- **Same path shape.** A control on `src/lib/thing.ts` does not validate a miss on
  `src/app/[slug]/page.tsx`. The brackets are the thing that broke.
- **Same run.** A control from ten minutes ago was run in a different working directory, a
  different shell, possibly a different ref. Pair them in one command.

A control that cannot fail proves nothing. Before trusting a control, ask what would make the
control itself come back empty, and make sure that is not also true of the real search.

---

## Six mechanisms that return a clean, confident, wrong zero

These were all found on one machine, in one night. Each one is indistinguishable from a real
absence when you read only the output.

1. **MSYS mangles a path argument.** A leading-slash or dotfile path handed to a Windows
   binary through Git Bash is rewritten before the program sees it. The program then reports,
   accurately, that the thing it was asked about is not there. Set `MSYS_NO_PATHCONV=1`, and
   suspect this the moment a path-shaped argument produces a denial or an emptiness you did
   not expect.

2. **`git grep` defaults to BASIC regular expressions.** In basic regex, `\(` is a capture
   group, not a literal parenthesis. So a pattern written for a modern regex engine,
   containing escaped parens, matches nothing at all. It does not error. It returns zero and
   an exit status you will read as "no matches". Pass `-E`, or verify the dialect with a
   control using the same escapes.

3. **An alternation inside an ANSI-C quoted string can return zero on a file full of
   matches.** `grep -c $'a|b'` is locale sensitive and quoting sensitive, and the failure mode
   is a count of zero rather than an error. Do not build patterns through shell quoting layers
   you have not controlled.

4. **`grep -P` can return a clean empty result** where the same pattern matches elsewhere,
   because PCRE support is a build-time option and the locale affects it. Empty, exit status
   1, no diagnostic.

5. **A bracketed path handed to a glob-expanding runner matches nothing.** `[slug]`,
   `[id]`, `[...rest]` are glob character classes. A runner that expands globs before the tool
   sees the argument silently drops the path.

6. **`git show <ref>:src/app/[slug]/page.tsx` on a repo that lacks that path returns exit
   status 0 with EMPTY OUTPUT**, because git treats the path in the `rev:path` form as a
   pattern. **This happens through a Python argument list with `shell=False`, so bypassing the
   shell does not save you.** The only honest existence check is:

   ```bash
   git cat-file -e "<ref>:<path>" && echo present || echo absent
   ```

   Use `cat-file -e` first, then `show`. Treat an empty `git show` as "I do not know" until
   `cat-file -e` has answered.

**There is a seventh, and an eighth.** The list is not the point. The control is the point.

---

## The commonest class of all: the matcher was narrower than the data

The six above are tooling quirks. This one is a habit, it produced four separate wrong answers in
two days, and every instance looked like a finding rather than a mistake. In each, **the matcher was
narrower than the data along a dimension nobody thought to check**, so it returned a confident zero.

- **Case.** A grep run case-sensitively against a header whose real spelling is lowercase reported
  zero occurrences, and the conclusion drawn was that the product had stopped sending it. It had
  not. Pass `-i`, or match the spelling you verified rather than the one you remember.
- **Anchoring.** A pattern anchored to end of line cannot match a value with a trailing comma, a
  comment, or a closing brace after it. Real source almost never ends where the value ends.
- **Namespace.** A query issued against a name that turned out to be a **search index** rather than
  a database returned nothing, correctly, about a thing that was never being asked. Confirm the
  object you are querying is the KIND of object you think it is before you believe its emptiness.
- **A registry lookup that is confidently wrong.** One answered cleanly and incorrectly, and only a
  negative control run beside it exposed the answer as fabricated rather than retrieved.

**The counter-habit, and it is cheap:** every zero-result query gets a sibling that MUST return
rows, issued against the same tool, the same connection, and the same syntax. If the control comes
back empty too, you have learned something about your query rather than about the system.

## Exclude at the source, never downstream

A recursive search that filters its results instead of pruning its walk still visits everything. On
this machine that means every worktree and every `node_modules` inside each. One such search was
left running after the question it answered had been abandoned and burned **thousands of CPU
seconds** doing it, because it excluded the directories it did not want from the OUTPUT rather than
from the TRAVERSAL.

It is a correctness rule as well as a cost one: a walk that descends into vendored trees finds
copies of the thing you are looking for and reports them as if they were yours. Use the tool's own
prune flags (`--glob '!node_modules'`, `-prune`, a `.gitignore`-aware searcher) and confirm the
prune worked by timing the run, not by reading the result.

---

## Assert the exact thing, never a count

A fix was reported done, and was not, because its test asserted that a delete **happened**
rather than **which keys** it deleted. The defect satisfied that assertion perfectly: it also
deleted something.

> **When the question is WHICH, the assertion must be the SET.**

- Deleting keys: assert the key list, sorted, compared whole. Not "delete was called once".
- Emitting events: assert the event list. Not "emit was called".
- Enabling events: assert the enabled set AND the disabled set. A one-sided assertion passes
  when everything is enabled.
- Filtering: assert what survived AND what was removed. A filter that removes nothing passes
  any "the survivors are correct" test.

A call count, a length, a truthiness check and a "not empty" check are all satisfied by a
large family of wrong behaviours. Name the members and compare them.

---

## A gate can be enabled and still incapable of failing

Enabled is not the same as capable. Four live shapes, all of which reported green:

- **A coverage gate running with checking disabled.** The command name says coverage, the
  flags say do not enforce it. Read the actual flags, not the script name.
- **A lint rule that exempts the exact character it exists to catch.** The rule is in the
  config, it is set to error, and its options list the thing it was written to find.
- **A test that feeds a value in and reads it back.** It proves the pipe is connected. It
  proves nothing about the transformation, because there was none.
- **A 100 percent coverage gate satisfied by executing a stub**, because the real module was
  never loaded. Coverage instruments what ran. If the thing that ran was the mock, the number
  describes the mock.

> **Istanbul covers evaluation, not truth.** A line can be executed by a test that asserts
> nothing about it. Full branch coverage can sit on top of a behaviour no test pins.

**The check for all four:** feed the gate the thing it exists to catch and require red. Hand it
a fixture that breaks the rule (the banned character, the uncovered branch, the wrong value)
rather than editing the code or config it guards. If the bad input does not break the gate, the
gate is decoration. For a guard in code, that proof is the `shared-standards` red proof: the new
test run at the base commit in a separate read-only worktree, never a line deleted from the
working tree and restored.

---

## A break harness needs a must-pass control, and equal totals per leg

A mutation or break harness runs a suite once per injected defect and reports which legs went
red. Two ways it lies:

1. **A broken runner turns every leg red and prints a clean summary.** Every mutation "caught",
   100 percent score, and the suite never ran. **Run an unmutated control leg first and require
   it GREEN.** If the control is red, nothing else in the run means anything.
2. **A leg that went red for failing to LOAD a file reads as a caught mutation.** The suite
   errored at import; zero tests ran; the runner reports failure; you record a catch.
   **Require every leg to report the SAME TOTAL TEST COUNT.** A leg whose total differs did
   not test what the other legs tested.

Parse test names and totals out of the runner output, not just the exit status. And expect at
least one leg to come back GREEN: a harness where everything is caught is usually a harness
where nothing ran.

---

## A pipeline exit status is the last command's exit status

Its close relative, and the one that hides longer, is a step written to tolerate ONE
expected failure with a bare `||`:

```bash
npm publish || echo "Version already published, skipping"
```

That was written for a duplicate version, which is genuinely the expected outcome when a
merge changes no published code. It swallows **every other failure identically**: a bad or
expired token, a build that produced nothing, a registry outage, a permissions change. The
package silently stops publishing, the job stays green, and the first symptom is a consumer
installing a version that was never pushed, weeks later.

**Tolerate the expected failure BY NAME, and fail on everything else:**

```bash
set -o pipefail
if npm publish 2>&1 | tee publish.log; then exit 0; fi
grep -qiE 'E409|EPUBLISHCONFLICT|cannot publish over|already exists' publish.log || exit 1
echo "that version is already published, nothing to do"
```

The general rule: **a bare `||` on a command whose failure you have reasoned about turns
every OTHER failure of that command into success.** Whenever you write one, name the
condition you meant to tolerate and re-raise the rest.

And the corollary for anyone reading a build: **a green publish job is not a publish.**
Confirm on the registry (`npm view <package> version`) before letting a consumer bump.

```bash
some_check | tr -d '\r'
rc=$?          # this is tr's status. It is 0. It is always 0.
```

This produced a false SUCCESS twice in one day, and only a deliberately failing control caught
it. Use `set -o pipefail`, or capture the status of the command you care about before piping,
or do not pipe. And whenever a harness reports success, run one case that MUST fail and
confirm the harness says so.

---

## Read the deployed line, not a working tree

Most checkouts on a working machine sit on a feature branch. A stale one will have you
describing code no customer has ever run, and it will read as a real product defect.

- **Fetch first.** `git fetch origin --prune`, then prove the tip with `git ls-remote`.
- **Quote a ref, never a path.** `git show origin/stable:path` or a worktree created from the
  remote ref. Never `cat` a file in a checkout whose branch you have not printed.
- **Know which line is deployed for that repo.** Some repos deploy from a fixed release
  branch, some deploy on merge to the default branch, and at least two have no default branch
  by the usual name. Ask the repo, do not assume: `git ls-remote --symref origin HEAD`.
- **A served artifact behind a CDN needs more than one read.** A single fetch is one sample,
  not the state of the page. Read at least three times, minutes apart, and read the cache
  headers alongside the body. A later read is not automatically a more current read.

---

## Detecting a character needs poison built in the right layer

A dash detector read clean on a file that was deliberately poisoned, because the poison was
written with a shell escape. `printf` in Git Bash writes the literal characters of the escape
sequence, not the character. The detector was right; the poison was never there.

- **Build poison in the program that does the scanning**, with an explicit codepoint:
  `chr(0x2014)` in Python. Not a shell escape, not a literal pasted through three tools that
  each get a say in its encoding.
- **Run the control immediately before AND after the real scan**, in the same process. Before
  proves the scanner works. After proves it still works, and that nothing in the run disabled
  it.
- The same reasoning applies to any content detector: a secret scanner, an encoding check, a
  forbidden-import rule. Poison it, in its own language, on both sides of the measurement.

## Strip comments before you sweep config

A sweep for a bad pattern matches the COMMENT that documents its removal, so a fixed file
reports as broken. This happened while checking the publish step above: five repositories
all matched `npm publish ||`, and in two of them the only match was the comment explaining
why the swallow had been replaced. The same shape hides the opposite error, a deleted
function whose name survives in the comment recording the deletion, which reads as though
the function is still there.

Parse the key, or strip comment lines, then sweep. And give the stripper its own control:
feed it one commented occurrence and one live occurrence, and require exactly one survivor.

---

## A faked layer hides exactly the failure it fakes (v7 false greens, 2026-10-19/20)

Four suites went green on code that would have failed in production during the v7 release,
and each one faked, or only declared, the layer where the failure lived. Reviews caught them;
the suites did not.

1. **A stubbed database model never runs the schema cast.** A Mongoose `updateOne` whose
   `arrayFilters` or `$set` names a path the schema does not declare throws `Could not find
   path ... in schema` while casting, before any database call, and `strict: false` does not
   stop it. A sinon stub of the model method never casts, so a rename save that would have
   failed on every kit site passed every test (Secure, v7 rename). **Rule:** a write on a path
   outside the declared schema either declares the path or uses the native driver
   (`Model.collection.updateOne`) on purpose, and at least one test runs the write through the
   REAL schema model (in-memory Mongo, or buffering off so the cast still runs).
2. **A mocked network skips the next hop's own validation.** A portal hook test mocked the
   network, so the proxy route that still required a field the client had stopped sending
   never ran, and every save without that field would have answered 400. Unit tests that
   mocked the MCP server's CMS client never met the CMS validator, which refused the new sort
   shape and the resource URIs on every call. **Rule:** when a change alters what a client
   sends, one test goes through the real next hop (the real proxy route handler, or the real
   serverless-express plus query parser plus validator), with only the far upstream mocked.
3. **Test what renders or resolves, not what is declared.** A fonts test checked the
   `@font-face` declarations while the utility font stack named a literal family, so the
   self-hosted faces never loaded and the test stayed green. A page's wiring was proved only by
   a scratch harness that was then deleted, so nothing committed would notice the arm being
   dropped. **Rule:** assert the computed style, the rendered element or the served page, and
   commit the test that drives the real entry point.
4. **A spy wide enough to pass on broken code.** A fail-closed test's spy threw for any call,
   so it passed whether or not the guarded read happened. **Rule:** assert the exact call (its
   arguments and target), and pair it with an ALLOW proving the call happens when it should.
5. **Name matching by prefix lies.** One alarm's name is a prefix of another's, so an
   `includes()` check passes on the wrong alarm. **Rule:** match whole tokens (the test that
   caught it parses exact `ALARM("...")` terms).
6. **A parity test must move with the function it mirrors.** When the renderer moved a rule to
   a new function, two consumer parity tests that still pointed at the old one would have kept
   passing. **Rule:** re-pointing every cross-repo parity test is part of the bump checklist.
7. **A simulation that supplies a context key cannot prove the real request carries it.** An
   IAM simulation passed on a grant conditioned on a key the service's own internal call never
   sends, and the first real call was denied (2026-10-20). The first real call is the proof
   (`vivreal-infra:vivreal-iam-secrets`).
8. **An unknown flag is not a dry run.** A preview that passes a flag the script does not define
   runs the real thing. Read the argument parser before trusting any flag as a preview.

Sources, all in vivreal-hq `docs/projects/next-release-v7/`: the Secure rename and portal walk
2 reviews, the walk 2 defects research, the final deltas review (B2), the alarm suppressor
review, the renderer 1.88.2 review, and the release runbook.

---

## Two more shapes worth naming

- **A signed-out check cannot validate a credential.** The anonymous response is correct
  whether the credential works or not, so the gate could never fail. Any check whose expected
  output is identical in the pass and fail cases is not a check.
- **A one-item account hides a first-item fallback.** A wrong-key lookup that falls back to
  `items[0]` is correct on a one-item fixture and wrong everywhere else. Fixtures need at
  least two of anything whose identity matters.

---

## What to write down when you report

For every claim you are about to assert:

1. The command, verbatim, including the ref it ran against.
2. The control, verbatim, and the non-empty result it returned in the same run.
3. The count you checked and the count you changed. Zero changes across many claims is a
   result worth doubting, not a result worth celebrating.

If you cannot produce the control, say so and downgrade the claim to unverified. An
unverified claim recorded honestly costs an hour. A wrong claim recorded confidently costs a
day and the reader's trust in everything next to it.
