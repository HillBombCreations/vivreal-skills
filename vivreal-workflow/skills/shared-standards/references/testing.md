# Testing rules

Moved out of `SKILL.md` ("Testing rules") on 2026-11-18 so that file stays a map (definition review
F476 6). Every rule below is binding exactly as it was; agents that cite "shared-standards, Testing
rules" read it here.

Contents, in order: the test guard rule; the e2e harness (fixtures, real signed ctx cookies, raw upstream mocks, the
coverage map); gates that cannot fail; the test inventory; the red proof (forms (a), (b), (c) and the
`Red:` line); real code paths, tests defending a defect, faked layers; fixtures recorded from real
answers; mocks in the deployed shape; copy checks on the screen that shows the copy; inert fixes;
honest assertions; a green suite is not a build; vacuous controls; child output read by content;
lint, the hook gates, the portal release-head check and the one full run; targeted runs under a
timeout.

- **The test guard rule (F160, SW-C19): no unit test reaches real AWS or the network.** Every
  repository's test bootstrap, the file its runner loads before any test (a mocha `--require`, a
  vitest `setupFiles` entry, a `test/helpers/setupEnv.js`), does two things before the first test
  file loads:
  1. **Fake AWS credentials.** It sets `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` and
     `AWS_REGION` to test values and deletes `AWS_PROFILE` and `AWS_SESSION_TOKEN`, and an
     unstubbed AWS SDK v3 `send` throws, so a client a test forgot to stub can never sign with the
     machine's own credentials.
  2. **Every outbound connection blocked except loopback.** `fetch` (undici), `http` and `https`
     `request` and `get`, `tls.connect`, and `net.connect` (with `net.Socket.prototype.connect`)
     refuse any host but `localhost`, `127.0.0.1` and `::1` (an in-memory MongoDB, a local mock).
     A refused call throws a named error and is also recorded, and the run fails on any record,
     so a test that catches the error still fails the run.

  The guard lives in the bootstrap, never in a `beforeEach` another hook can replace: a CMS run
  reached a payment provider's real sandbox because two hooks reset `fetch` (2026-11-06), and an
  EventHandler unit test with an unstubbed Amplify client ran on the machine's real credentials
  and changed a live customer's site settings (2026-11-05, reverted under an owner GO). Its own
  tests are a planted-request REFUSE test per transport (fetch, http, https, tls, net: the call is
  refused and recorded) and an ALLOW test of a loopback connection, red at the base commit like any
  guard. The reference is VR_CMS_API `test/helpers/setupEnv.js` at its deployed line; read it
  there, and name the guard's error the way that repository already does.
- All E2E tests in `e2e/`. Import from `e2e/fixtures/global-setup` or `e2e/fixtures/auth-setup`. NEVER import from `@playwright/test` directly.
- **Logged-in specs authenticate with REAL signed ctx cookies**, `e2e/fixtures/ctx.ts` mints HMAC-SHA256 `active_ctx`/`user_ctx`/`csrf_token` with a test `CTX_SECRET`, run against a dedicated test dev server on port **3100** (`NEXT_DIST_DIR=.next-test` isolation) with all backend env vars pointed at a **mock upstream on port 4600** (`e2e/mock-upstream/`). Because the signature is genuinely valid, `verifyCtxEdge()` and CSRF pass with zero source bypasses, `serverFetchDirect()` calls from server components now genuinely reach the mock upstream too, not just browser-side `page.route()` intercepts.
- **Mock-upstream handlers return RAW upstream shapes**, not the portal's `{success,data,error}` envelope, the proxy route applies the envelope on top, same as it does against the real backends.
- Reuse the api-mock functions in `e2e/fixtures/api-mocks.ts` before adding (don't trust any hardcoded count, check the file).
- React 19: wait for `__reactProps` on elements before clicking. Use `pressSequentially()` for stubborn controlled inputs.
- **Coverage map**: `e2e/coverage-map.json` + `scripts/check-coverage-map.mjs --strict` (run in pre-push) is a mechanical evidence gate over **rendered pages only**. Its walk collects `page.tsx` and nothing else, so a `route.ts` proxy handler is structurally invisible to it. **Do not add a coverage-map entry for a proxy route**: the key can never appear in the checker's route list, so the gate fails with "STALE map entry: route no longer exists". Proxy routes have no evidence gate today. Building one is new tooling, not a claim about this one.
- **A gate being enabled does not make it capable of failing.** Before you trust any gate in
  this fleet, make it fail once on purpose. Live examples from this codebase: a coverage
  script that ran with checking disabled, a lint rule whose options exempted the exact
  character it existed to catch, a test that fed a value in and read it back, and a full
  branch-coverage number produced by executing a stub because the real module was never
  loaded. See the `verification-discipline` skill.
- **`e2e/BASELINE.md` is the authoritative test inventory**, and the filesystem outranks it. Re-measure before quoting any number, and never trust a remembered one. A baseline is only comparable to a run made under the same conditions: the same worker count, no sibling agent holding the shared ports, and the same machine awake throughout.
- Sites/integrations pages serialized under parallel workers, don't break that.
- **`Object.freeze` on a `Readonly<Record<Union, T>>` lets a stray key compile,** so `tsc` cannot
  prove a tier or enum key was removed. Add a test over the key set.
- **Red proof, the one rule every agent follows.** A guard, validation or fix is proven by a
  direct REFUSE test (feeds the bad input or bad object, asserts the exact refusal) paired with an
  ALLOW test (valid input, asserts success). Nothing in the working tree is ever reverted, mutated
  or stashed to see red (owner, 2026-10-06). That includes the "mutation check": deleting or
  commenting out a line of the fix, watching the test fail, and putting the line back is the
  banned revert cycle under another name, and agents did it repeatedly on 2026-10-15. The two
  rules were reconciled 2026-10-15 on the owner's delegation (owner rule P-one-suite,
  vivreal-hq `docs/standards/process.md`): **the coder owns the red proof and does it at the base
  commit; the reviewer checks the record and never repeats the cycle.** Red is established by
  (b) or (a) for code in a repository, and by (c) for a one-shot ops script outside every
  repository; the report names which:
  - **(b) Red at the base commit, in a separate read-only worktree** (owner decision D1,
    2026-10-14, the standard proof and the coder's default). `git worktree add --detach <scratch
    path> <base sha>` (detached is right here: nothing is ever committed in it), copy in ONLY the
    new or changed test files and their test-only helpers, never source, `npm ci`, run those
    files by name, record the result, then `git worktree remove --force <scratch path>`. Then
    the same files pass on the fix.
  - **(a) Test first** (added by the 2026-10-14 skills audit; neither D1 nor the 2026-10-15
    reconciliation names it). The new test ran red before any fix code existed in the tree, then green
    after it. Same counting rule as (b). It is valid only when the run really came first;
    removing fix code to recreate "before" is the banned in-place mutation, so use (b).
  - **(c) Mutation on a scratch COPY, for one-shot ops scripts only** (owner, 2026-10-20,
    standard practice). A production data-step script that lives outside every repository has
    no base commit, so red is proved by copying the script into a scratch directory outside
    every working tree, removing one guard at a time in the COPY, and showing that guard's
    named test go red. **Keep the harness and the per-guard log with the script**, naming the
    source line each mutation removed, so the reviewer can reproduce it; a deleted harness is a
    CONCERN in review (v7 scratch-2 restore, C1). Never in a working tree, never on product code.

  **What the reviewer does with it.** It confirms the `Red:` line is recorded, names the REFUSE
  assertion, and failed for the right reason; it reads the tests; and it runs each relevant test
  file at most once, at the head. It does not rerun the base-commit cycle. A missing or doubtful
  `Red:` line is a FAIL that goes back to the coder, and "by reading" alone, with no recorded
  red at base, is not proof.

  **Red counts only when the REFUSE assertion itself fails.** A load, import or environment
  failure is not red: a test that cannot import an export the fix adds, a missing `.env.local`,
  a fixture that does not exist at the base. Those fail on any code and prove nothing about the
  guard; make the test load at the base (stub only what the fix ADDS, never the guard) or say red
  could not be established. "By reading" is not a proof, and a report never says "verified it
  fails" for it. The report line names the failing assertion:
  `Red: (a|b|c) <test file> "<REFUSE test name>" at <sha>: failed on <expect line>; green at <head
  sha>: <k> passed`. A REFUSE test that is still green at the base commit pins nothing; rewrite
  it.
- **A test must INVOKE the real code path, never REPLICATE it.** A test that hand-rebuilds the logic it checks passes against broken code and still reads as coverage. Three instances found in one session: a `layout.test.ts` that replicated a metadata spread instead of calling `generateMetadata`, so it could not see the demo-safety bug it existed to rule out; a staging-evidence test that mutated the *declared* field instead of the bytes, so it passed on a fail-open gate; and a 409 test whose two fixtures each failed on several fields at once, isolating nothing. **The fixture is half the test**: per-field discrimination needs one fixture per field, mismatching that field ALONE. The check is the red proof above, never an edit to the implementation: a mirroring test stays green at the base commit, so run (b) and it shows.
- **A defect old enough to have tests has tests DEFENDING it.** Four instances in one week, the worst being a bug fix that correctly spotted a value had gone undefined, made it work again, and **re-armed a dormant account-disclosure while adding three assertions pinning it**. So when you remove a behaviour and a test goes red, the red test is evidence to READ, not an obstacle to update. Ask what the assertion was protecting and whether anyone ever decided it was correct. A green suite after a fix is not proof; it is equally consistent with the suite having been written around the defect.
- **A faked layer hides the failure it fakes** (v7, 2026-10-19/20). A stubbed Mongoose model never runs the schema cast, so a write on an undeclared path passes; a mocked network never runs the next hop's validator; a test of what is DECLARED (a `@font-face`) passes while the element resolves to something else; a spy that matches any call passes on broken code. So: one test of any write runs through the REAL schema model; when a change alters what a client sends, one test goes through the real next hop with only the far upstream mocked; assert what renders or resolves; assert the exact call. Cases and rules: `verification-discipline`, "A faked layer hides exactly the failure it fakes".
- **A test that reads a sibling repository reads a pinned worktree of it, never a shared checkout
  it moves** (release B, L-B-23). A builder that finds `${VIVREAL_REPOS}/<sibling>` behind makes
  `git -C "$VIVREAL_REPOS/<sibling>" worktree add --detach "$VIVREAL_REPOS/_wt/<scratch>" origin/<line>` (the
  one-off clone form the owner-checkout guard allows; nothing else runs in the clone) and points the
  test at it through the repo's sibling override (the portal's `VIVREAL_CLIENT_API` and
  `VIVREAL_TEMPLATES`), or reports the stale sibling; it never pulls, fast-forwards or switches the
  shared checkout, which another agent or an owner may be using (P-shared-checkout). A sibling test
  skips only when the folder is absent, and fails when it is present but unreadable.
- **A tool that compares a live AWS answer with a planned shape tests against a fixture recorded
  from a real answer** (release B, 2026-11-17). A planned shape written by hand only proves the
  comparison agrees with itself. CloudFront returns every part a policy leaves unset as an empty
  `{}` block: front-door-hsts created the right response headers policy at BR-18, then refused it as
  different, because its tests only ever compared the planned config with itself; the
  front-door-help-path origin request policy check had the same gap (F441). Save one real answer
  from a read-only call as the fixture (nothing secret in it), test that the planned shape matches
  it, and pair that with a REFUSE test of a real answer changed in one field.
- **A test mock answers in the shape the deployed backend sends** (release B, L-B-15). Build each
  mock from the deployed line's handler (quote the file and the ref) or a recorded real answer, one
  mock per shape the route can send. The site picker's e2e mock answered both creates in the hosted
  shape, while VR_Secure_API's blank create answers with the site document itself, so "Create my
  site" read as tested and left the owner on the old page (portal #496 item 7).
- **A copy check that names a control reads the screen where the copy shows** (L-B-15): the
  control's label and place on THAT screen, never the form where it is first named. A sales-tax
  line said "Choose Connect with Stripe above" on a board whose only such control reads "Switch to
  signing in with Stripe", below it; its STOP check had read the connect form.
- **A fix can be inert and still pass its tests.** Two shapes seen here: a fix whose tests fed a state the product cannot actually produce, and a guard repaired whose triggering write was itself a silent no-op, so the guard could never have fired either way. Prove the fixed path runs in the real product, not only in the harness.
- **Assert CORRECT behavior, never current behavior.** Expected values come from the spec/intent, NEVER from pasting whatever the code currently emits. Snapshotting output freezes the bug into a "requirement."
- **A failing test means the CODE is wrong until proven otherwise.** Fix the code. Change a test ONLY to correct a genuinely-wrong expectation, with a one-line reason in a comment. NEVER weaken an assertion (`toBe`→`toContain`, exact→`anything()`, deleting a check) or align new code to a buggy expectation just to go green, the reviewer treats that as test-tampering and FAILs the pass.
- **A green suite is not a building repo, because nothing in the suite runs the build.**
  Unit and e2e runs import modules directly; they never execute `next build` or `tsc -b`, so a
  type error or a build-time-only failure sails straight through a fully green run. **This
  shipped an unbuildable `main`.** When a change touches config, imports, module boundaries or
  anything the bundler resolves, run the actual build before you call it done. A test suite
  and a build are two different questions.
- **A control can go VACUOUS without failing.** A negative control that compares two refs
  stops proving anything the moment those refs converge: it keeps passing, and the pass now
  means "nothing to compare" rather than "the difference is absent". The same shape shows up
  in any control keyed on a condition that can quietly stop holding. **State the control's
  precondition and assert it**, for example assert the two refs still differ before trusting
  that the comparison between them means anything.
- **A test reads a child process's output by content, never by line position** (release B,
  VR-Outreach-MCP-Server #21 review, 2026-11-18). Its probe took the child's LAST line as the result
  while pino could flush the fix's new cause line after it, so four tests failed at random (about one
  deploy in seven would have failed its coverage gate). Pick the result by its keys and throw when
  none matches; the catalog entry is "Output read by its position while a logger can still write".
- No `.only`, no `sleep()`, use `waitFor()`.
- **Repo lint must stay 0 errors / 0 warnings.** No new `eslint-disable` without a justification comment; `react-hooks/*` is scoped off `e2e/**` only (Playwright's `use(page)` false-positive), don't widen that scope elsewhere.
- **No repository in this fleet has a pull-request test gate.** GitHub Actions does run, in most repos, but only to cut, promote, backport, roll back or deploy. Husky pre-commit (lint-staged plus vitest plus coverage-map) and pre-push (repo eslint 0 errors 0 warnings, both tsc configs, vitest, coverage-map `--strict`, e2e smoke) are the ONLY things that read your code before it lands. Never bypass with `--no-verify`, except inside a NAMED portal-coder mode that authorises it (PARALLEL, or FOLLOWUP on a branch that already passed the full gate) or a dispatch that says so. **A local-only gate is also a gate nobody else runs**, so a hook that silently skips on your machine skips for the whole fleet.
- **Prove the hooks are installed before you rely on them** (release C, L-C-04; F520). Husky 9
  runs hooks from its generated folder `.husky/_`, named by `core.hooksPath`; the scripts in
  `.husky/` itself carry no shebang and no execute bit, so a hooks path of `.husky` runs nothing.
  A `git clean` that deletes untracked or ignored files deletes `.husky/_` while the config still
  names it, and from then on every hook is skipped with no warning; a fresh clone has no hooks at
  all (an EventHandler clone pushed with no pre-push gate in release B). Before a push you rely on
  a hook for: `npx husky`, then `git config core.hooksPath .husky/_`, then `ls -l .husky/_/pre-push`
  (present and executable), and read the push log for the hook's own first line.
- **Portal release-head check (owner, 2026-10-10): no full e2e, walk instead.** Before a portal
  release, the check is eslint, BOTH `tsc` configs, and every unit test file the release added
  or changed, all green. Do not schedule the full e2e suite, the full vitest run or the
  Playwright smoke as a separate "one full gate". The local QA walks on the guarded stack
  (APIs, the portal installed app and desktop, the Templates sites the release touched) are not
  optional; they replace the confidence the e2e run gave. Fix-ups after a branch passed the full
  gate are dispatched to portal-coder in FOLLOWUP mode, never SOLO.
- **The pre-push hook is the one full run, owner rule (2026-10-06).** While iterating, run only
  the test files for what you're changing. Don't manually run the full suite, the coverage map,
  lint, or the build before a push, the hook already runs all of it once; a manual run duplicates
  that and is most of why pushes were taking far longer than they needed to. A reviewer does the
  same: it does not rerun the full suite, coverage, lint, or build on a head the hook already
  passed, it reads the diff and runs only the specific test file a named doubt requires.
- **Run the specs that touch your files, each under a timeout; a full suite only when the brief
  asks or P-one-suite needs it, and never two at once** (release B, L-B-43; owner rules
  P-touching-specs, P-heavy-runs and P-one-suite,
  vivreal-hq `docs/standards/process.md`). A coder ran a repository's whole suite twice in WSL, at
  the branch and at the base, for a change to record files only; both hung over an hour on tests
  that need a live browser, and the agent sat idle "waiting on background work", which the agent
  list shows as completed. Pick the test files that import or read the files you changed, not only
  the feature's; run each in the foreground under `timeout <seconds>`, below the tool call's own
  limit, so a hang ends the run and not the agent; report a run that times out with the test it
  stuck on. Otherwise a full suite (a repo's whole-suite script, or the same at the base commit)
  runs only when the brief asks, one at a time, with one exception: in a repo whose pre-push hook
  runs no tests, P-one-suite's single full run at the PR head (`npm test`, its summary in the PR
  body) still happens, once, under a timeout, never beside another heavy run. Everything else
  stays targeted; a full suite and a red proof are both heavy runs.
