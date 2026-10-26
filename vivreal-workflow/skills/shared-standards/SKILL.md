---
name: shared-standards
description: Vivreal Portal shared engineering standards, the non-negotiable conventions every Vivreal bug/feature workflow agent reads before working. Use when an agent or command says to consult "shared-standards" or "_shared-standards", or when a task touches Vivreal proxy routes, multi-tenancy (active_ctx/dbKey/groupID), CSRF, hydration/SSR, Lambda infra, MongoDB queries, testing rules, npm lockfiles and the node 20 versus node 22 CI runner skew, verifying a CloudFormation deploy actually landed, or proving a backport reached a release line. Carries the ${VIVREAL_REPOS} path-resolution preamble and the lazy-reading trigger map.
---

> NOTE: This skill is the relocated form of the portal's `.claude/agents/_shared-standards.md`.
> Workflow agents and commands that historically read `.claude/agents/_shared-standards.md`
> now resolve it through this skill, so it works from any repo. Content below is verbatim.

## Path resolution (read FIRST)

This workflow uses two placeholder env vars that every agent must resolve before reading cross-repo or ecosystem files. They are NOT shell expansions you literally execute, they are placeholders this section tells you how to resolve.

### `${VIVREAL_REPOS}`: root containing all Vivreal repos
**Default convention:** all Vivreal repos are sibling directories under one parent. From the project root (where this repo lives), the parent is `..`.

**Resolution rule:**
1. If env var `VIVREAL_REPOS` is set, use it
2. Otherwise, use the parent of this repo: `$(cd .. && pwd)`
3. Verify by checking that `${VIVREAL_REPOS}/Vivreal_Portal_Mobile/CLAUDE.md` exists

**Example resolution in Bash (use this in agent commands):**
```bash
VIVREAL_REPOS="${VIVREAL_REPOS:-$(cd .. && pwd)}"
cat "$VIVREAL_REPOS/VR_CMS_API/CLAUDE.md"
```

### Ecosystem docs: `docs/ecosystem/`
Cross-repo ecosystem docs (architecture, debugging guides, Lambda inventory, etc.) live in the portal repo at `${VIVREAL_REPOS}/Vivreal_Portal_Mobile/docs/ecosystem/`. They're version-controlled and always available.

### When you see `${VIVREAL_REPOS}/...` in this doc or any agent prompt
Resolve it before reading. Never paste the literal placeholder into a Read or Bash command, substitute the actual path. Ecosystem docs are at `docs/ecosystem/` (no resolution needed).

### Cross-platform note
- **Windows:** use Git Bash or WSL, backslashes in paths are NOT cross-platform; always use forward slashes when invoking the Bash tool
- **MSYS path mangling reaches further than the AWS CLI.** The known case is an `aws` argument
  that starts with `/` coming back as a bogus `AccessDenied`. The case that is missed: **MSYS
  also rewrites a `/` INSIDE a `jq` expression**, and inside a `git show ref:path` argument, so
  `jq '.a/.b'` and `git show origin/main:file.md` both silently operate on a mangled string.
  A `git show` mangled this way fails loudly, but a mangled `jq` filter can simply select
  nothing and print `null`, which reads as "no such value" rather than as an error.
  **Export `MSYS_NO_PATHCONV=1` for the whole block**, not just for the `aws` line.
- **macOS / Linux:** native bash works as-is
- **Setting env vars:** add to `~/.bashrc`, `~/.zshrc`, or your shell profile. Example: `export VIVREAL_REPOS="$HOME/repos"`

---

## Two rules that outrank every fact below

**1. Read the deployed line, not a working tree.** Most checkouts on this machine sit on a
feature branch, and a stale one will have you describing code no customer has ever run.
`git fetch origin --prune` first, then quote a ref. Release-train repos deploy from
`origin/stable`; merge-to-deploy repos from `origin/main`; **two repos have no `main` at all**
and answer to `origin/master`. Ask, do not assume: `git ls-remote --symref origin HEAD`.
For the portal in production, read its release JSON endpoint more than once, because one read
can be served stale from an edge POP.

**Name the ref for every cross-repo claim.** "What is live" reads the deployed line. "What
ships together" during an unshipped batch reads the sibling PR's HEAD, by SHA
(`git show <sha>:<path>`), because the deployed line and `main` both lack the batch: a review
pass once read `origin/main` instead of the sibling PR head and reported a stale contract that
the batch had already fixed. Every citation carries the ref and its short SHA.

**2. A negative result is not a finding until a positive control returns non-empty in the same
run, using the same tool, the same pattern style and the same path shape.** This file used to
carry counts and versions precisely because nobody re-measured them. The `verification-discipline`
skill carries the mechanisms: `git grep` defaults to basic regex so escaped parens match
nothing, a bracketed path is a glob, and `git show <ref>:<path>` on a missing path exits 0 with
empty output even through a Python argument list. Use `git cat-file -e` for existence.

**A corollary this file now obeys: no mechanical value is written down here.** Counts,
versions, quotas and rosters are stated as the command that produces them. If you find a bare
number below that a command could have produced, that is a defect in this file. Report it.

**Where the system is described in depth:** `vivreal-hq/docs/dev-docs/README.md` indexes a
reference set (architecture, operations, AWS estate, decision records) and a numbered set of
use-case walkthroughs, each ending in "how this breaks, and the first thing to check".
Navigate it by filename from the index. Do not keyword-search it; the index exists because
three searches returned three different incomplete answers.


---

## Lazy standards reading: trigger map

**Role agents (coordinator, researcher, architect, coder, portal-coder, tester, reviewer, documenter, designer, vuln, growth, sentry):** do NOT eager-read this file. The path-resolution preamble above is the only mandatory read. Read sections of this file ONLY when your task touches one of the trigger areas below.

**System experts (main-api, secure-api, cms-api, event-handler, client-stack, portal):** do NOT load this file at all by default. You may consult a specific section if your findings explicitly need to align with portal-side conventions (rare).

| If the task touches… | Read these sections |
|---|---|
| `src/app/api/proxy/*` (any portal proxy route) | [references/portal.md](references/portal.md): "The three-tier API rule" + "Proxy route factory" |
| `active_ctx`, `dbKey`, `groupID`, multi-tenant routing | "Auth & multi-tenancy" |
| MongoDB queries, indexes, write concerns | "Optimization principles" + read `docs/ecosystem/mongo_queries.md` |
| About to use the Mongo MCP tools (`mcp__plugin_vivreal-db-explorer_mongodb__*` from the vivreal-db-explorer plugin, or `mcp__mongodb__*` where a project `.mcp.json` declares `mongodb`) | Read the `vivreal-db` skill first, it carries the multi-tenant routing + dbKey/group.key/bucketname rules. Prefer `/db-query` over raw `mcp__mongodb__find`. |
| `useAuth()` in app layout, hydration, SSR | [references/portal.md](references/portal.md): "Hydration & SSR rules" |
| Lambda env vars, function names, CloudFormation | "AWS Lambda & Infrastructure Reference" + read `docs/ecosystem/aws-lambda-inventory.md` |
| CSP, cookies, CSRF, security headers | "Security non-negotiables" |
| AWS or Amplify reads (`get-app`, `get-function-configuration`, `get-secret-value`, `ssm get-parameter`), env vars, secrets | "Security non-negotiables" |
| Any test files, e2e, unit, or backend (writing OR editing) | "Testing rules" + "Backend testing conventions" |
| Integration manifests (`src/data/manifests/`), portal component patterns, shared sheet/dialog renderers | [references/portal.md](references/portal.md): "Conventions you'll see" + "Default-renderer fallbacks" |
| Removing cross-repo code (consumer → producer) | "Cross-stack removal ordering" |
| `package-lock.json`, `npm ci` failing in CI but not locally, peer-dep errors | "Dependencies, lockfiles and the CI runner" |
| Dispatching a deploy workflow, or claiming a stack updated | "Reading and verifying a CloudFormation deploy" |
| Backports, cherry-picks, "did this fix reach `release/*`" | "Proving a fix reached a line" |
| Any code diff, in any repo (always, before writing code and before review) | "Anti-pattern catalog", which points to [references/anti-patterns.md](references/anti-patterns.md) |
| Anything not listed above | Skip this file. CLAUDE.md is sufficient. |

If a task obviously spans multiple trigger areas, read each relevant section once. Do not eager-load adjacent sections.

---

# Vivreal Portal: Shared Engineering Standards

This file is read by every bug-fix subagent BEFORE doing any work. It encodes the non-negotiable rules. If anything here conflicts with the project CLAUDE.md, CLAUDE.md wins.

## Tech stack quick ref

Portal-only, moved to [references/portal.md](references/portal.md). Read it there.

## The three-tier API rule (NEVER VIOLATE)

Portal-only, moved to [references/portal.md](references/portal.md). Read it there.

## Proxy route factory

Portal-only, moved to [references/portal.md](references/portal.md). Read it there.

## Auth & multi-tenancy (CRITICAL)
- `active_ctx` JWT contains: `groupID`, `dbKey`, `bucketname`, `exp`
- mainDb queries: ALWAYS use `{ _id: groupID }`. NEVER `groupName`.
- Tenant DB queries: scoped via `dbKey`. **`general_shared` is retired, the live cluster has no such database any more** (confirmed live 2026-09-28, the complete database list is `Vivreal`, `outreach`, `pod_01`, `pod_02`, `admin`, `local`; treat a hardcoded `general_shared` you find in code or a doc as a dead placement, not a working one). `pro_plus` is still a live placement name. **`pro_plus` is a DATABASE name, not a tier**, and it holds real tenant data. Nothing maps a tier to a database
- **Nothing maps a tier to a database.** `dbKey` is a field stored on the group document, set once at creation and read back, never computed from `group.tier`. `VR_Client_Auth`'s authorizer and the portal proxy both resolve it the same way (see below), neither derives it.

### The three key fields: DO NOT CONFUSE (common source of bugs)

| Field | Source | Value example | Used for |
|---|---|---|---|
| `dbKey` | `resolvePlacement(group)` from `@hillbombcreations/tenant-db/placement`, which returns the stored `group.dbKey` | `pro_plus` or a per-pod placement name (`general_shared` is retired, no longer a real database) | **Database routing**: `dynamicDb[dbKey]` selects the tenant MongoDB database. This is the `key` query param passed to CMS API. |
| `group.key` | Stored on the group document in mainDb | `examplecomedyclub` | **S3 bucket naming**, bucket is `vivreal-{group.key}`. Also used for display/URL slugs. NOT the database key. |
| `bucketname` | `${group.type}-${group.key}`, unless the group stores its own `bucket` (25 of 26 do, 2026-10-15); the bucket is `bucketOf(group)`, see `vivreal-db` | `collection-examplecomedyclub` | **S3 object path prefix**, used in media upload/retrieval paths. |

**There is no `deriveDbKey()` any more.** A function by that name used to live separately in six repos (`VR_Secure_API`, `VR_CMS_API`, `VR_Main_API`, `Vivreal_EventHandler`, `VR_Client_Auth`, plus a `databaseDict[group.tier]` variant in `oauthCallback.js`), and four of the six copies had drifted from each other, misrouting real tenant writes. All six are deleted. The only way to get a tenant database name now is:

```js
const { resolvePlacement } = require('@hillbombcreations/tenant-db/placement');
const dbKey = resolvePlacement(group); // throws PlacementMissingError if group.dbKey is absent or unroutable
```

`resolvePlacement` cannot be given a tier and has no fallback. A group projection that drops `dbKey` makes it throw, not silently reroute to a guessed value. If you see `databaseDict[group.tier]`, `deriveDbKey(group)`, or an inline tier-to-database ladder anywhere, that IS the bug (report it, do not treat it as the correct pattern).

**Where `dbKey` is read in `active_ctx`:** `profileSwitch.js` and `updateDefaultProfile.js` (`VR_Secure_API/src/userAndAuth/services/`) both call `resolvePlacement(foundGroup)`. New groups get a placement chosen once, by measurement, via `choosePlacementForNewGroup()` (same package) in `createGroup.js`, never a tier lookup.

### MCP skill usage for database queries
- **`vivreal-db-explorer:db-schema`**, Use to inspect Mongoose schema, indexes, and sample docs for any collection. Invoke during research before reasoning about data shape.
- **`vivreal-db-explorer:db-query`**, Safe MongoDB queries with built-in dbKey routing and multi-tenant safety guards. ALWAYS prefer this over raw `mcp__mongodb__find`. It handles `pro_plus` and per-pod placement routing automatically (`general_shared` is retired).
- When querying via MCP tools directly, remember: `_id` fields require `{"$oid": "..."}` syntax, `groupID` on tenant objects is a string (not ObjectId), `collectionObj.refID` is a string.

## Security non-negotiables (OWASP-aware)
- CSRF: double-submit cookie on all state-changing proxy routes (`src/lib/csrf/`)
- Rate limiting: `src/proxy.ts` on auth endpoints (10 attempts / 15 min / IP) and the public demo-claim routes (`claim/verify` 30 / `claim/complete` 10 per 15 min per IP)
- Visitor IP in public edge routes: read `CloudFront-Viewer-Address` (strip the trailing `:port`), fall back to `X-Forwarded-For` only when absent, **never** `x-real-ip` (CloudFront strips it), see `api/proxy/claim/_shared.ts`, `outreach/book/_forward.ts`, `outreach/studio-demo/visit`
- `src/proxy.ts` short-circuits ALL `/api/proxy/` matcher paths right after rate limiting, the proactive `active_ctx` refresh must never run on a proxy request, because rewriting `active_ctx` mid-flight desyncs the CSRF token (it's `HMAC(CTX_SECRET, 'csrf:' + active_ctx)`). Don't add a proxy POST path to the matcher expecting refresh behavior there, that's the csrf-desync class of bug.
- HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy in `next.config.ts`, don't break them
- Cookies: `secure: true` forced in production
- Never log secrets. Never echo JWT contents in errors.
- **Never read a whole environment map or a whole secret.** Three credential exposures in one
  night came from exactly that: an ordinary `get-secret-value` or a `get-function-configuration`
  prints every key at once, into a transcript, for the sake of one value. Ask for the single key
  (`--query SecretString` piped into a parser that emits one field, `--query
  'Environment.Variables.THE_ONE_KEY'`), and never widen it "just to see what is in there".
- **Never print secrets from a routine AWS read.** `aws amplify get-app` / `get-branch` /
  `list-branches` / `list-apps`, `aws lambda get-function-configuration` / `get-function`,
  `aws secretsmanager get-secret-value` and `aws ssm get-parameter --with-decryption` all print env
  or secret VALUES by default. Never run one without a `--query` naming only the fields you need,
  and never print `environmentVariables` / `Environment.Variables` or Amplify's
  `basicAuthCredentials` (base64 `user:password`); for a key list ask for names only (`keys(Environment.Variables)`,
  `keys(app.environmentVariables)`). Every Bash-capable agent in vivreal-principal, vivreal-workflow, vivreal-infra and vivreal-ops
  carries this as a DON'T.
- **Redact on the VALUE, not on the variable name.** A name-based allowlist missed 8 of 18 real
  leaks here, because the leaking fields were called `to`, `subject`, `admin` and `route`. Also
  **decode before you judge**: an unsubscribe token was base64 of the email address, so the
  address passed a redactor that only looked at plaintext. And check that no test is pinning the
  leak, because one was.
- **Shell default expansion prints the secret.** `${VAR:-something}` prints the VALUE when the
  variable is set, and it leaked a live token that way. Use `${VAR:+set}`, or a length plus a
  short prefix, when you need to know whether a credential is present.
- Validate redirect URLs against an allowlist (open redirect prevention)
- Output escape user data, never `dangerouslySetInnerHTML` user content
- Mongo injection: never pass raw user input as query operator keys
- **A verified signature proves ORIGIN. It says nothing about WHICH CUSTOMER.** This is the
  most expensive shape in a multi-tenant webhook receiver, and it looks completely secure.
  The pattern: one app secret is shared across every installed merchant, the HMAC covers the
  request BODY, and the receiver picks the tenant from a HEADER that sits outside the signed
  material. The signature check passes, and the routing decision it appears to have
  authorised was never signed by anything.

  Ask two separate questions of every signed inbound request:

  1. **Is this really from the provider?** That is what the signature answers.
  2. **Which of our customers is it about, and is THAT field inside the signed bytes?**
     If the tenant selector is a header, a query parameter, or anything the signature does
     not cover, then a (body, signature) pair that is legitimately valid can be replayed
     against a DIFFERENT tenant by changing the selector, and it will verify.

  What makes it worse rather than better: a per-tenant idempotency ledger. If the replay
  ledger is keyed inside the tenant database, the same delivery id re-pointed at another
  tenant finds a fresh ledger and is NOT deduplicated, so the one control that looks like it
  would stop a replay is scoped so that it cannot.

  Prefer, in order: derive the tenant from SIGNED content; or hold a per-tenant secret so
  the signature itself is tenant-specific; or key the idempotency ledger globally so a
  delivery id can be consumed exactly once across the whole fleet. Failing all three, say
  in the file that tenant selection is unauthenticated, so the next reader does not assume
  the signature covered it.

## Code quality non-negotiables
- No `any` (use `unknown` and narrow)
- No `as` casts without an inline comment explaining why
- No silent catches. Always handle or rethrow with context.
- No TODO without ticket reference
- No commented-out code
- No dead code, unused imports, "future use" parameters
- No premature abstraction (rule of three: don't extract until 3 callers exist)
- Functional components only. Named exports preferred (except Next.js pages).
- File naming: `PascalCase` components, `camelCase` fns/vars, `kebab-case` files, `UPPER_SNAKE_CASE` constants

## Performance non-negotiables
- No N+1 queries (use `$in` or aggregate pipelines)
- No unbounded loops on the request path
- Big-O justified for any new loop/sort over user-controlled input
- Heavy libs (recharts, codemirror) lazy-loaded
- React Query usage minimal, prefer existing axios patterns
- No re-render thrash: `useMemo`/`useCallback` only when there's a measurable problem
- Edge runtime is constrained, no Node-only APIs in proxy routes

## Hydration & SSR rules

Portal-only, moved to [references/portal.md](references/portal.md). Read it there.

## Dependencies, lockfiles and the CI runner

- **The runner and your machine do not agree about peer dependencies.** CI runs **node 20
  (npm 10)**; dev machines here run **node 22 (npm 11)**. npm 11 and npm 10 resolve peer
  dependencies differently, so **a lockfile written by npm 11 can be REFUSED by npm 10**.
  The consequence that matters: **`npm ci --dry-run` passing locally proves nothing about
  CI**, because it is npm 11 validating npm 11's own output. Verify against the runner's
  major instead:
  ```bash
  npx -y npm@10 ci --dry-run
  ```
  Treat that, not the local run, as the gate before pushing a lockfile change.
- **`npm install` on Windows writes a lockfile that `npm ci` REFUSES.** It prunes packages
  that other packages still require (the optional-dependency platform pruning is the usual
  trigger), producing a lockfile that is self-inconsistent rather than merely
  platform-specific. `npm install` is happy with it; `npm ci` refuses it outright, so the
  break lands in CI and in any build that uses `npm ci`. This **nearly took down all six
  customer site builds** in one session. After any `npm install` on Windows, check the
  lockfile diff for removed entries, and validate with the `npm@10 ci --dry-run` above before
  it leaves the machine.

## Testing rules
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
- **Red proof, the one rule every agent follows.** A guard, validation or fix is proven by a
  direct REFUSE test (feeds the bad input or bad object, asserts the exact refusal) paired with an
  ALLOW test (valid input, asserts success). Nothing in the working tree is ever reverted, mutated
  or stashed to see red (owner, 2026-10-06). That includes the "mutation check": deleting or
  commenting out a line of the fix, watching the test fail, and putting the line back is the
  banned revert cycle under another name, and agents did it repeatedly on 2026-10-15. The two
  rules were reconciled 2026-10-15 on the owner's delegation (memory
  `one-full-suite-run-per-change`): **the coder owns the red proof and does it at the base
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
- No `.only`, no `sleep()`, use `waitFor()`.
- **Repo lint must stay 0 errors / 0 warnings.** No new `eslint-disable` without a justification comment; `react-hooks/*` is scoped off `e2e/**` only (Playwright's `use(page)` false-positive), don't widen that scope elsewhere.
- **No repository in this fleet has a pull-request test gate.** GitHub Actions does run, in most repos, but only to cut, promote, backport, roll back or deploy. Husky pre-commit (lint-staged plus vitest plus coverage-map) and pre-push (repo eslint 0 errors 0 warnings, both tsc configs, vitest, coverage-map `--strict`, e2e smoke) are the ONLY things that read your code before it lands. Never bypass with `--no-verify`, except inside a NAMED portal-coder mode that authorises it (PARALLEL, or FOLLOWUP on a branch that already passed the full gate) or a dispatch that says so. **A local-only gate is also a gate nobody else runs**, so a hook that silently skips on your machine skips for the whole fleet.
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

## Site media rule
- Site media (logos, etc.) requires signed URLs via `GET /api/proxy/get-media`
- Never use raw `cdnUrl()` for site assets

## Cross-repo CLAUDE.md files (READ FIRST when touching that repo)
Every Vivreal repo has a CLAUDE.md at its root with conventions, patterns, and gotchas. ALWAYS read the relevant one(s) before researching, planning, or coding in that area.

| Repo | Path | Purpose |
|---|---|---|
| Portal (this repo) | `${VIVREAL_REPOS}/Vivreal_Portal_Mobile/CLAUDE.md` | The Next.js portal. **The filesystem is the route count**, always: `route.ts` files under `src/app/api/proxy/` on the DEPLOYED line. CLAUDE.md calls its own route table a partial snapshot, and every count written down here has been wrong within weeks |
| VR_Main_API | `${VIVREAL_REPOS}/VR_Main_API/CLAUDE.md` | Auth and signup, transactional plus lifecycle plus billing-rules email, the web-push notification consumer, Meta callbacks. Function roster: read the SAM template on the deployed line |
| VR_Secure_API | `${VIVREAL_REPOS}/VR_Secure_API/CLAUDE.md` | Group, billing, sites, profile, OAuth, Square refresh, Shopify token refresh, AI agent, analytics, alarm verifier, the template-instantiate worker and its DLQ consumer. Function roster: count `AWS::Serverless::Function` in `cloudYamls/allRoutes.yaml` on the deployed line, never the `.packaged.yaml`, and never the separate websocket stack |
| VR_CMS_API | `${VIVREAL_REPOS}/VR_CMS_API/CLAUDE.md` | Collections, integrations, media and derivatives, webhooks, audit, versioning. Function roster: count `AWS::Serverless::Function` in `cloudformation/` on the deployed line |
| VR_Client_API | `${VIVREAL_REPOS}/VR_Client_API/CLAUDE.md` | Public content delivery + Stripe/Square checkout (publishDate filter) |
| VR_Client_Auth | `${VIVREAL_REPOS}/VR_Client_Auth/CLAUDE.md` | TOKEN authorizer for VR_Client_API (Serverless Framework, not SAM) |
| VR_Outreach_API | `${VIVREAL_REPOS}/VR_Outreach_API/README.md` | Sequences, contacts and companies, booking, SES send and replies. Function roster: `template.yaml` on the deployed line. No CLAUDE.md on main, so README plus `docs/` are truth |
| Vivreal_Templates | `${VIVREAL_REPOS}/Vivreal_Templates/CLAUDE.md` | Universal site template, every site's Amplify app builds the shared **`stable`** channel branch (per-customer branches are DEAD, Phase 2 2026-07-15); releases via the promote-stable workflow (main→stable FF). CLAUDE.md refreshed 2026-08-09 |
| vivreal-site-renderer | `${VIVREAL_REPOS}/vivreal-site-renderer/CLAUDE.md` | `@hillbombcreations/site-renderer`. Publishing hits every live customer site, so the version matters and moves weekly. **This repo has no `main`: its line is `origin/master`.** Read the version from `package.json` there, and read what each consumer actually pins from the consumer lockfile. The CLAUDE.md version header lags on purpose |
| VR-MCP-Server | `${VIVREAL_REPOS}/VR-MCP-Server/CLAUDE.md` | Public CMS MCP server (TypeScript, OAuth 2.1). Tool roster and tier gates: read `src/tools/catalog.ts` on the deployed line. Its own CLAUDE.md has been wrong about the tool and module count, so count, do not quote |
| VR-Outreach-MCP-Server | `${VIVREAL_REPOS}/VR-Outreach-MCP-Server/CLAUDE.md` | Internal outreach MCP server. Tool roster: read `src/tools/` on the deployed line |
| VR_Analytics_API | `${VIVREAL_REPOS}/VR_Analytics_API/README.md` | First-party analytics ingest + rollup (no CLAUDE.md, README is truth) |
| VR_OnCall_Agent | `${VIVREAL_REPOS}/VR_OnCall_Agent/CLAUDE.md` | On-call agent (auto-investigates Sentry incidents via GitHub Actions) |
| VR_OnCall_Webhook | `${VIVREAL_REPOS}/VR_OnCall_Webhook/CLAUDE.md` | Sentry-webhook receiver → triggers VR_OnCall_Agent |
| Vivreal_EventHandler | `${VIVREAL_REPOS}/Vivreal_EventHandler/CLAUDE.md` | Step Functions site deployment pipeline (Serverless Framework, not SAM) |
| Vivreal_Site_Migrator | `${VIVREAL_REPOS}/Vivreal_Site_Migrator/README.md` | Migration (`/migrate`) + template/identity-kit (`/template`) pipelines (no CLAUDE.md, `docs/migration-flow.md` + `docs/template-flow.md` are truth; README stale) |
| vivreal-hq | `${VIVREAL_REPOS}/vivreal-hq/CLAUDE.md` (+ `packages/*/CLAUDE.md`) | **Canonical for brand voice, content and lead generation.** Voice + positioning in `brand/`, planning inputs in `knowledge/` and `content/`, the two toolchains under `packages/leadgen` (CommonJS) and `packages/content-studio` (ESM). **`brand/voice.md` outranks everything for any copy.** Since v7 it also holds the **admin app** (`packages/admin-app`, the only home of staff surfaces including the outreach CRM). **Merging hq `main` deploys nothing:** the admin Amplify app builds only `deploy/admin-app`, so its deploy is a fast-forward of that branch, and its three stacks and every `packages/fleet-ops` stack deploy by hand from a clean worktree at the merge (v7 release runbook, hq row). Its agents and commands live in the `vivreal-skills` marketplace, not in its `.claude/`. |
| vivreal-content | `${VIVREAL_REPOS}/vivreal-content\` | **DEAD SOURCE.** Consolidated into `vivreal-hq` on 2026-08-03 and frozen: its last commit is that same day, while the hq content tree has moved repeatedly since. The checkout still exists and still holds its own agents and commands, which is exactly why it gets read by mistake. Read and edit content work in `vivreal-hq`, never here. |
| Vivreal_SSR_Landing | `${VIVREAL_REPOS}/Vivreal_SSR_Landing/AGENTS.md` (+ `docs/`) | **DEAD SOURCE: this repo does NOT serve vivreal.io.** `vivreal.io` and `www.vivreal.io` are CloudFront `<vivreal-io-distribution-id>` (real id in vivreal-hq `docs/dev-docs/05-reference/aws-estate.md`), whose default origin is the Vivreal_Templates Amplify app `vivreal` (`<vivreal-io-amplify-app-id>`, real id in vivreal-hq `docs/dev-docs/05-reference/aws-estate.md`, branch `stable`), with `/app*` routed to the portal's `stable`. Its pages are CMS content in the Vivreal group's site record plus a few Templates code routes (`/domains`, `/mcp`, `/llms.txt`). No SSR_Landing Amplify app exists in the account (sweep 2026-09-16). Change vivreal.io through the portal or Vivreal_Templates, never here. |
| vivreal-edit-extractor | `${VIVREAL_REPOS}/vivreal-edit-extractor\` | EditDNA extraction tooling (companion to vivreal-content) |
| Vivreal_Docs | `${VIVREAL_REPOS}/Vivreal_Docs\` | **DEAD SOURCE.** `help.vivreal.io` is the Vivreal_Templates app `vivreal-help` (`<vivreal-help-amplify-app-id>`, real id in vivreal-hq `docs/projects/aws-cleanup-inventory.md`) rendering the Vivreal group's CMS; `vivreal.io/help*` and `/docs*` answer 301 to it, and the old Docs Amplify origin (`<old-docs-amplify-app-id>`, real id in vivreal-hq `docs/projects/aws-cleanup-inventory.md`) no longer exists (2026-09-16). |
| Vivreal-Schemas | `${VIVREAL_REPOS}/Vivreal-Schemas` | Shared Mongoose schemas, `@hillbombcreations/schemas`. Read the published version from its `package.json` and each consumer pin from the consumer `package.json`. Consumers do not all sit on the same major, and that disagreement is the interesting fact, not the numbers |
| Vivreal-Tier-Quotas | `${VIVREAL_REPOS}/Vivreal-Tier-Quotas` | Shared `@hillbombcreations/tier-quotas`. Owns every tier quota. Sentinel scheme: `-1` unlimited, `0` no access, `>0` a cap. **Read `src/tierQuotas.ts` for the current ladder before asserting any tier name or any quota value.** The ladder has lost a tier and the package has dropped its alias table, so a remembered tier name now normalises to `free` rather than erroring |

All backends: Express + serverless-express, JavaScript (not TS), Mongoose, Pino, AWS SAM (except VR_Client_Auth + Vivreal_EventHandler = Serverless Framework). X-Ray is retired where touched recently (Client/Secure), Sentry is the telemetry layer.

**Citation rule for docs in this plugin repo:** cite function/route/file names, not line numbers, `src/foo.js:123` rots in weeks. Stamp `Last synced: YYYY-MM-DD` when syncing a doc to source (log in vivreal-skills `docs/SYNC.md`).

## AWS Lambda & Infrastructure Reference

**Full inventory:** `docs/ecosystem/aws-lambda-inventory.md`, READ THIS when debugging Lambda config issues, env var mismatches, deployment failures, or cross-function communication. It maps every Lambda function name → repo → CloudFormation fragment → env vars → stack.

### Function rosters: count them, do not quote them
Do not quote a function count from this file or from any CLAUDE.md. Both go stale between
one release and the next, and a stale roster reads exactly like a current one. Produce the
number when you need it, from the deployed line:

| API | Where the roster lives | Has WebSocket | Deploy trigger |
|---|---|---|---|
| VR_Secure_API | `cloudYamls/allRoutes.yaml` (NOT `allRoutes.packaged.yaml`; the websocket stack is separate and is not part of this count) | Some of them | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_CMS_API | `cloudformation/` | All of them | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_Main_API | `sam-template.yaml` | One of them | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_Outreach_API | `template.yaml` | No | Push to `main`, which IS the deploy for this repo, by design |
| VR_Client_API | `sam-template.yaml`, which also holds the CloudFront edge distribution in front of the API | No | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_Client_Auth | `serverless.yml` (Serverless Framework, not SAM) | No | Push to `main` |
| EventHandler | `serverless.yml`, count `handler:` keys. Three state machines: deploy, purchase saga, transfer saga | No | Push to `main` |
| VR_Analytics_API | `template.yaml`, stack `vr-analytics-api` | No | Push to `main` |
| VR-MCP-Server | its deploy workflow (`deploy.yaml`) | No | Push to `main`, by design; ships after the CMS it calls |
| VR-Outreach-MCP-Server | its deploy workflow | No | Push to `main` |
| VR_Insights_Scan | `deploy.yml` | No | Push to `main`; a manual dispatch needs `-f mode=deploy` |
| vivreal-domain-search | `lambda_api.yml` | No | Merge to `main`, then dispatch `lambda_api.yml --ref main` |
| Vivreal_Templates | n/a (Amplify apps, one per site) | No | Dispatch `promote-stable.yml`; `fleet-build.mjs` builds the `live` tier (see `vivreal-infra:vivreal-site-deploy-pipeline`) |
| vivreal-hq | admin app plus fleet-ops stacks | No | Merge deploys nothing; fast-forward `deploy/admin-app`, stacks by hand |

### Release trains (2026-08-15)

**"Merge to `main` = prod deploy" is DEAD in five repos: Vivreal_Portal_Mobile, VR_Secure_API
VR_CMS_API, VR_Main_API, VR_Client_API.** Production now deploys from the fixed `stable` branch
via a release train. Merging `main` in those repos deploys NOTHING, portal's `main` is an
Amplify build canary with no traffic; the four backends fire zero workflow runs on a `main`
push. Still deploying on push to `main` (unchanged): VR_Outreach_API, VR_Client_Auth, and
everything else.

The train is the same shape in all five repos:
- Friday 5pm PST cron (`0 1 * * 6` UTC), `release-cut.yml` cuts `release/vX.Y` from `main`,
  bumps `package.json` on the line only, and tags `vX.Y.0`. Portal's cut also writes a served
  `public/release.json` marker.
- Monday promote crons are STAGGERED, backends ahead of portal. Read the times from `on.schedule`
  in each repo's `promote.yml`; a copied time here was already wrong once. While a batch waits for
  the owner's GO, a backport onto a line ships at the next cron, so disable `promote.yml` for the
  train or hold the backport. `promote.yml` force-with-lease moves
  `stable` to the newest line's tip, a tagged cut ships as `vX.Y.0`; an untagged tip (backports
  landed after the cut) auto-mints, tags, and ships the next PATCH `vX.Y.Z+1` (since 2026-08-19;
  the cron refuses only when the line's last tag is yanked).
- Incremental release / backport = PATCH, never a new minor (2026-08-19, all five repos).
  `backport.yml` cherry-picks main-merged commits onto a line (`-m 1` for PR merges) and pushes
  - no tag, no bump, no deploy. Ship now: dispatch `promote.yml` with `target=release/vX.Y`
  (tags `vX.Y.Z+1`). Ride Monday: do nothing, the cron mints the patch. Hand-written fixes
  still go local: commit on the line, push (husky gate runs), then dispatch the promote.
  **NEVER dispatch `release-cut.yml` to ship a backport**, a cut forks a NEW minor line off
  ALL of `main` (the 2026-08-19 v2.3.1→v2.4.0 mistake).
- `rollback.yml` (dispatch-only) moves `stable` back to a prior `v*` tag and yanks it
  (`yanked-vX.Y.Z` tags block cron re-deploys of that version).
- Deployed-version check: portal `curl https://vivreal.io/app/release.json`; backends
  `git ls-remote origin refs/heads/stable` + the tag + the deploy run log.
- Each repo's `docs/RELEASE.md` is the full runbook, read it before touching that repo's
  deploy config.

**Two platform gotchas proven in the live drills:**
1. **Amplify autobuild fires only for never-built commits** (portal). A rollback, or a
   re-promote to an already-built commit, repoints `stable` but triggers NO build, prod keeps
   serving the old build. Mandatory after a portal rollback:
   `aws amplify start-job --app-id <portal-amplify-app-id> --branch-name stable --job-type RELEASE`.
2. **GitHub Actions fires NO push run for a force-push that REWINDS a branch to an ancestor**
   (Client drill), which is every backend rollback (forward re-points, even of already-pushed
   commits, DO fire). Mandatory after any backend rollback:
   `gh workflow run lambda_api.yml --ref stable`.

Portal's prod path: CloudFront distribution `<vivreal-io-distribution-id>`'s origin is
`stable.<portal-amplify-app-id>.amplifyapp.com` (swapped from `main.`, the distro is NOT CFN-managed). The real ids live in vivreal-hq `docs/dev-docs/05-reference/aws-estate.md`.

### Proving a fix reached a line: `git cherry`, never `merge-base --is-ancestor`

**A backported fix is patch-equivalent without being an ancestor.** Cherry-picks and squash
merges both rewrite the commit, so `git merge-base --is-ancestor <fix> <ref>` answers "no" for
fixes that are demonstrably present, and a sweep built on it reports healthy branches as
missing the fix. Use patch-equivalence instead:

```bash
git cherry -v <upstream> <branch>   # '-' = already upstream (patch-equivalent), '+' = not
```

Two limits to keep in mind, because `git cherry` is necessary but not sufficient: it will
miss a **reimplementation** (same effect, different patch), and it says nothing about whether
the line still BUILDS. For anything that matters, confirm by behaviour on the line itself.

### Infrastructure stacks (workflow_dispatch: manual trigger from GitHub Actions)
| Stack | Repo Location | Workflow |
|---|---|---|
| `vivreal-websocket` | `VR_Secure_API/websocket/` | `.github/workflows/websocket.yml` |
| `Vivreal-Media-CDN` | `VR_Secure_API/cloudformation/media-cdn.yaml` | `.github/workflows/media-cdn.yml` |

### Secrets Manager (per-service `<secret-prefix>/*`: secrets-audit Phase 2, 2026-07)
**Names are written with a placeholder prefix, because this repository is PUBLIC.** `<secret-prefix>/` is the Secrets Manager prefix, `<ssm-prefix>/` the SSM parameter prefix (it has a leading slash), `<qa-secret-prefix>/` the QA secret prefix; resolve them from the private vivreal-hq repo at `docs/infra/secret-names.md` (read with your local checkout). Never write a real prefix back into this repo: its check-definitions gate fails on one.

The monolithic `hb-api-secrets` is retired. Every backend now resolves secrets at deploy time from per-service secrets (`<secret-prefix>/secure-api`, `<secret-prefix>/cms-api`, `<secret-prefix>/client-api`, `<secret-prefix>/client-auth`, `<secret-prefix>/main-api`, `<secret-prefix>/analytics`, `<secret-prefix>/oncall`, `<secret-prefix>/site-deployment`) plus shared secrets (`<secret-prefix>/{core,stripe,social-oauth,github-app,vapid}`) and non-secret config from SSM `<ssm-prefix>/*` params. Values were copied verbatim, env var names unchanged. Key categories: Database (`CLUSTER_URL`), Auth (`CLIENT_ID`, `USERPOOL_ID`), Stripe, WebSocket (`WS_ENDPOINT`, `WS_TABLE`), OAuth providers, Encryption, CDN/Media signing, Push (VAPID), Agent (Anthropic + GitHub App), Comms (Slack/Discord/SES).

### Reading and verifying a CloudFormation deploy

- **`describe-stack-resources` TRUNCATES SILENTLY.** It returns one page and no error, so a
  resource audit built on it quietly under-reports. Use **`list-stack-resources`**, which
  paginates. Note the second half of the trap: because it paginates, a
  `--query 'length(StackResourceSummaries)'` prints **once per page**, so a stack with three
  pages prints three numbers and a script reading "the" number takes the first one. Sum the
  pages, or page explicitly with `--no-paginate` plus `--starting-token`.
- **A green workflow run is NOT a deploy.** The workflow can succeed while the stack update
  rolls back, and it can succeed having deployed nothing at all. Verify against **stack
  state**, not against the run:
  1. Baseline `StackStatus` and `LastUpdatedTime` from `describe-stacks` BEFORE dispatching.
  2. Wait for `LastUpdatedTime` to MOVE and for `StackStatus` to reach a terminal state.
  3. **Assert the terminal status BY NAME.** "Moved and terminal" is not success:
     `UPDATE_ROLLBACK_COMPLETE` is also moved and terminal. Require
     `CREATE_COMPLETE` or `UPDATE_COMPLETE` explicitly.
  4. Assert the new value of whatever you changed is actually present in the stack.

  Related, and the same class of error: `gh run watch` can return `rc=0` against a run from
  days ago when a dispatch was rejected, because the rejected dispatch never created a new
  run and the old one is still newest.

### When to consult the Lambda inventory
- **Env var mismatch bugs**, check which functions have which vars, verify against CloudFormation fragment
- **"Function not found" errors**, get the exact function name (they have random suffixes)
- **Cross-function invokes**, `CREATE_UPDATE_COL_GROUPS_FUNCTION_NAME`, `GET_COLLECTION_INFO_FUNCTION_NAME`, `UPDATE_SITE_ENV_VARS_LAMBDA` are env vars pointing to other Lambdas
- **WebSocket issues**, 10 functions across 3 APIs have `WS_ENDPOINT` + `WS_TABLE`
- **Deployment failures**, check which stack owns the function and how it deploys

## Ecosystem documentation (`docs/ecosystem/`)
Cross-repo ecosystem docs checked into this repo. Richer than per-repo CLAUDE.md files for ecosystem-wide questions. ALWAYS check the relevant ones during research before grepping blindly.

| File | When to read |
|---|---|
| `docs/ecosystem/ARCHITECTURE.md` | Overall system architecture, service boundaries |
| `docs/ecosystem/FRONTEND_APPLICATION.md` | Portal frontend structure, patterns, conventions |
| `docs/ecosystem/BACKEND_APIS.md` | All backend API surface, endpoint inventory |
| `docs/ecosystem/CLIENT_API_AND_AUTH.md` | Public content delivery API + authorizer |
| `docs/ecosystem/DATABASE.md` | MongoDB schemas, multi-tenant routing, indexes |
| `docs/ecosystem/mongo_queries.md` | Common query patterns, dbKey routing examples |
| `docs/ecosystem/CROSS_API_DEBUGGING_GUIDE.md` | How to trace bugs across the 3 backend services |
| `docs/ecosystem/AI_AGENT_SYSTEM.md` | Agent system vision and design |
| `docs/ecosystem/SITE_CREATION_PIPELINE.md` | EventHandler Step Functions flow |
| `docs/ecosystem/PRICING_AND_COSTS.md` | Tier quotas, pricing, overage rates |
| `docs/ecosystem/aws-ses-email-guide.md` | SES email integration |
| `docs/ecosystem/aws-lambda-inventory.md` | **Full Lambda inventory**, function names, env vars, stacks, CloudFormation fragments, Secrets Manager keys, WebSocket config |
| `docs/ecosystem/insights_architecture.md` | Cross-cutting architecture insights |
| `docs/ecosystem/multi-agent-workflow.md` | CloudWatch log group inventory by Lambda |

**Updating ecosystem docs:** If during a bug fix you discover ecosystem knowledge that is wrong or missing, the documenter is authorized to propose an update via Edit. Cite the bug slug so the change is traceable. Never wholesale rewrite, make targeted edits.

## Industry standards we follow
When justifying technical decisions, reference these public standards. The reviewer will demand evidence-based justification, and "industry best practice" without a citation does not count.

**Security**
- OWASP Top 10 (2021): https://owasp.org/Top10/
- OWASP ASVS (Application Security Verification Standard): https://owasp.org/www-project-application-security-verification-standard/
- OWASP API Security Top 10: https://owasp.org/API-Security/

**AWS**
- AWS Well-Architected Framework, Security, Reliability, Performance, Cost, Operational Excellence, Sustainability pillars
- AWS Lambda best practices: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- API Gateway WebSocket: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html
- Cognito best practices: https://docs.aws.amazon.com/cognito/latest/developerguide/security-best-practices.html
- Use the AWS docs MCP server (`mcp__awslabs_aws-documentation-mcp-server__*`, project-scoped: it exists only where the session's project `.mcp.json` declares it, as the portal and VR-MCP-Server do) to fetch up-to-date docs

**Web platform**
- MDN Web Docs (https://developer.mozilla.org), authoritative source for web platform APIs
- Web.dev (https://web.dev), Google's perf, PWA, a11y, security guides
- WCAG 2.2 AA, accessibility standard for all UI work
- Web Content Accessibility Guidelines: https://www.w3.org/WAI/standards-guidelines/wcag/

**Frameworks**
- Next.js 16 docs: https://nextjs.org/docs (use Context7 MCP for current version-specific patterns)
- React 19 docs: https://react.dev (Server Components, hooks, Suspense patterns)
- TypeScript handbook: https://www.typescriptlang.org/docs/

**Code review and engineering**
- Google Engineering Practices: https://google.github.io/eng-practices/ (code review standards, CL author guide, reviewer guide)
- Google Testing Blog: https://testing.googleblog.com/

**Performance and reliability**
- Core Web Vitals: https://web.dev/vitals/
- Next.js performance docs: https://nextjs.org/docs/app/building-your-application/optimizing
- Big-O complexity must be considered for any user-input-driven loop or sort

**MongoDB**
- MongoDB docs: https://www.mongodb.com/docs/
- Mongoose docs: https://mongoosejs.com/docs/

**OAuth and identity**
- OAuth 2.0 RFC 6749 + 6750
- OAuth 2.1 draft (recommended baseline for new flows)
- Each provider's OAuth docs (Meta, X, LinkedIn, TikTok, Mailchimp, Shopify), use Context7 MCP

When making a non-trivial decision, the architect/coder MUST cite the relevant standard. The reviewer MUST verify citations exist for non-obvious choices.

## Conventions you'll see and must respect

Portal-only, moved to [references/portal.md](references/portal.md). Read it there.

## Bug-fix workflow rules (binding for all phases)
1. Research before planning. Plan before coding. Approve before implementing. Always.
2. Fix the **root cause**, not the symptom.
3. **Zero scope creep.** Diff size matters. Drive-by refactors are forbidden inside a bug fix.
4. Tests must FAIL on the unfixed code, shown by a red proof (a) or (b) from "Testing rules", never by reading.
5. Reviewer is adversarial by design. Accept that. Disagreement is escalated to the user, not negotiated away.
6. Every claim about code behavior cites `file:line`.
7. Documentation outlives the fix, write it for the engineer who finds this in 2027.

## Optimization principles (apply to every change)
- **Time complexity:** Big-O for loops over user-controlled input must be O(n log n) or better unless justified. Document the bound.
- **Space complexity:** No unbounded buffers. Stream where possible.
- **Network:** Minimize round trips. Batch where the API supports it (`$in`, bulk operations).
- **Bundle size:** Lazy-load heavy libs (recharts, codemirror, tiptap). Use dynamic imports.
- **Render perf:** Avoid layout thrash. Reserve heights for async content. Memoize only when measured.
- **Edge runtime:** Cold starts matter, keep edge handler dependencies minimal.
- **Caching:** Respect `force-dynamic` where set. Add cache only with explicit reason.
- **Database:** Index any new query path. Verify with `explain()`. Avoid full collection scans.
- **Lambda:** Stateless. No warm-instance assumptions. Reuse SDK clients across invocations.
- **Reliability:** Retries with exponential backoff for external calls. Idempotency keys for state-changing ops.
- **Security-by-default:** Validate input at every boundary. Escape output. Allowlist over blocklist.

## Anti-pattern catalog (check every diff)

Read [references/anti-patterns.md](references/anti-patterns.md) on every code diff. It carries
the 19 rules in checklist form, then each entry with how to spot it and its guard (source of
truth: `${VIVREAL_REPOS}/vivreal-hq/docs/standards/anti-patterns.md`, which also carries the
evidence and enforcement status). A diff that adds an instance of any rule there is wrong even
when its tests pass.

When you find a new recurring class, add it to the catalog in the same PR as the fix (vivreal-hq
source first, then this plugin copy), with its evidence and its guard.

## Workflow rules: additions to the original 7
8. Read `docs/ecosystem/` docs and the relevant repo CLAUDE.md before forming hypotheses. They contain knowledge that grep cannot surface.
9. Cite an industry standard (OWASP, AWS Well-Architected, Web.dev, MDN, RFC, Google Eng Practices) for any non-obvious technical decision. "Best practice" without a citation is not a justification.

## Backend testing conventions (different from frontend!)

The portal uses **Playwright e2e + e2e/fixtures** (see the spec files in `e2e/` or run `npx playwright test --list` for the current count) plus a Vitest unit layer. Backends are NOT Playwright. Don't confuse them. Every repo now carries ESLint + husky gates, none of this is CI-enforced (no GitHub Actions gate anywhere in this ecosystem); the local hooks are the only thing standing between a bad commit and `main`.

| Layer | Framework | Pattern | Coverage gate |
|---|---|---|---|
| Portal frontend | Playwright plus a Vitest unit layer. **Counts belong to `e2e/BASELINE.md` and the filesystem, not to this file.** `npx playwright test --list` is the count; `ls e2e/*.spec.ts` is the spec count | `e2e/**/*.spec.ts` via `e2e/fixtures`; `tests/unit/**` for pure logic | ESLint 0 errors 0 warnings, coverage-map `--strict`, husky pre-commit and pre-push. No PR gate |
| VR_Main_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | ESLint + coverage-ratchet gate. ⚠️ Tests can send REAL emails, never run the full suite with a prod `.env` |
| VR_Secure_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | ESLint plus a husky gate with a full-coverage threshold. **Read `.nycrc.json` for the actual thresholds and for whether checking is enabled**, because a coverage script can run with checking switched off |
| VR_CMS_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | ESLint plus a husky gate. **Read `.nycrc.json` and the `test:coverage` script**: this repo has shipped a coverage command that passed `--check-coverage=false` |
| VR_Client_API | Mocha + Chai + Sinon | `test/**/*.test.js` | ESLint plus a husky pre-push with a branch-coverage threshold. Read `.nycrc.json` for the number |
| VR_Client_Auth | Mocha + Chai + Sinon (new test harness added 2026-08) | `test/**/*.test.js` | Test harness + husky gate |
| VR_Outreach_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | Husky pre-push gate with a coverage threshold. Read `.nycrc.json` for the number |

**Backend test conventions (read each repo's `test/CLAUDE.md` or `test/claude.md` first):**
- Tests are unit-style with **heavy mocking** via `test/helpers/loadWithMocks.js`
- Mock DB adapters, AWS SDK clients, sockets, service dependencies
- Endpoint-focused: cover route wiring, handlers, controllers, validators, services
- Branch coverage required: success path, validation failure, empty response, error branches
- Run: `npm run test:unit` (no coverage gate, faster) or `npm test` (with NYC 100% gate)
- `test/test.js` is legacy and NOT in the active glob, don't add tests there

**Backend test commands quick ref:**
```bash
# in any backend repo
npm run test:unit          # Mocha only, fast feedback
npm test                   # Mocha + NYC coverage gate (CI parity)
npm test -- --grep "name"  # Run a single test by name
```

## Skills available for the workflow

These skills are available via the Skill tool and SHOULD be invoked when relevant:

| Skill | When to use |
|---|---|
| `vivreal-fullstack:fullstack` | Bug spans portal → proxy → backend → DB. Scaffolds an end-to-end checklist across the stack with all the layers required. Use as a starting checklist for cross-repo bug fixes. |
| `vivreal-fullstack:fullstack-context` | Auto-loads cross-repo context when researching backend endpoints. Researcher should rely on the auto-trigger. |
| `vivreal-db-explorer:db-query` | Safe MongoDB queries with built-in dbKey routing, safety guards, multi-tenant boundaries. ALWAYS prefer this over raw `mcp__mongodb__find` calls. |
| `vivreal-db-explorer:db-schema` | Pulls Mongoose schema, indexes, sample doc for any collection. Use during research to understand data shape before reasoning about queries. |
| `vivreal-proxy-factory:proxy-route` | Generate a new factory-based proxy route. Use when adding a new proxy route is part of the fix. |
| `vivreal-workflow:verification-discipline` | Before a negative result, a PASS or a merge becomes a finding: the false-zero mechanisms and the positive control. |
| `code-review:code-review` | Optional secondary review pass, coordinator may use this in addition to reviewer if a fix is high-risk. |

## Cross-stack removal ordering (consumer → producer)
<!-- learned from bug: remove-social-tier-tracking on 2026-04-10 -->

When a fix REMOVES code that crosses repos (shared package + backend + frontend), plan the work in the REVERSE of addition order. New features ship producer → consumer (shared package first so downstream can import); removals ship consumer → producer (frontend/backend stop importing, THEN the shared package deletes the symbols). Any other order leaves an intermediate commit where a live consumer still imports a deleted symbol, breaking downstream builds.

Researcher and architect default to the addition order out of habit, flag the inversion explicitly when the bug is a removal, not an addition.

## Default-renderer fallbacks for shared UI components

Portal-only, moved to [references/portal.md](references/portal.md). Read it there.

**Skill invocation rule:** When an agent needs functionality covered by a skill, it should invoke the skill via the Skill tool rather than reimplementing. The reviewer will flag any agent that bypassed an applicable skill.

## File writing reliability (critical for all agents)
<!-- learned from observability-logging-audit on 2026-04-14 -->

### Proxy-route guard hook (deterministic)

Portal-only, moved to [references/portal.md](references/portal.md). Read it there.

### Bash heredocs decode backslash escapes, even quoted
The trap that actually bites here is silent, not a syntax error. In the Bash tool a quoted
heredoc (`<<'EOF'`) still collapses a doubled backslash to a single one, and the target
language then runs its own escape processing on what is left. A JS character class written
`[^"'\\s<>)]` arrived as `[^"'\s<>)]` and excluded the LETTER s; a Python `\\b` became a
backspace byte inside a regex, so a guard matched a control character and passed for the wrong
reason. Neither failed loudly.

**Fix:** never write a backslash escape in a heredoc. Use the Write tool (it does not decode),
or build the character in code (`String.fromCharCode(92)`, `chr(92)`), or use bracket forms that
need no backslash (`[.]`, `[?]`, an explicit character set instead of `\s`). Then read the written
bytes back. A heredoc whose body holds an apostrophe or a triple-quoted string can also end in
`unexpected EOF`; the same fix applies.

### Subagent file write verification
Subagents (researcher, architect, etc.) sometimes claim they wrote a file but did NOT actually write it. The coordinator MUST verify every artifact exists after each agent dispatch:
```bash
ls -la "path/to/expected/file.md"
```
If the file is missing, the coordinator should write it from the agent's returned output rather than re-dispatching.
