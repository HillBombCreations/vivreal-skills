---
name: shared-standards
description: Vivreal Portal shared engineering standards, the non-negotiable conventions every Vivreal bug/feature workflow agent reads before working. Use when an agent or command says to consult "shared-standards" or "_shared-standards", or when a task touches Vivreal proxy routes, multi-tenancy (active_ctx/dbKey/groupID), CSRF, hydration/SSR, Lambda infra, MongoDB queries, testing rules, npm lockfiles and the npm 10 versus npm 11 CI runner skew, verifying a CloudFormation deploy actually landed, or proving a backport reached a release line. Carries the ${VIVREAL_REPOS} path-resolution preamble and the lazy-reading trigger map.
---

> NOTE: This skill is the relocated form of the portal's `.claude/agents/_shared-standards.md`.
> Workflow agents and commands that historically read `.claude/agents/_shared-standards.md`
> now resolve it through this skill, so it works from any repo. Content below is verbatim.

## Path resolution (read FIRST)
### `${VIVREAL_REPOS}`: the folder that holds every Vivreal clone
Every Vivreal repository is cloned side by side directly under one folder, which can be anywhere on any machine. Nobody configures it: it is derived.
1. `VIVREAL_REPOS`, when set, is an OPTIONAL override. It must be absolute and hold `vivreal-hq/.git`; a set but wrong value is REFUSED with the reason, never silently replaced by a derived folder (unset it to derive). The resolver is vivreal-hq's `packages/fleet-ops/lib/repos-root.js`, vendored byte-identical as `repos-root.cjs`.
2. Otherwise derive it from the checkout you are in: `git rev-parse --git-common-dir` names the MAIN checkout's `.git`, even from a worktree under `_wt/`, and the folder above that checkout is the root when it holds `vivreal-hq/.git`. From a folder that is not a checkout (`_ops/`), the root is the first ancestor holding `vivreal-hq/.git`.
3. Otherwise STOP and report "no Vivreal clone root found". Never guess a path and never write a literal drive or home path into a command.

Once the vivreal-workflow plugin is loaded (on a fresh machine, from the second session on), its SessionStart hook exports the derived value to every Bash command of the session, subagents included (measured 2026-11-04), so `$VIVREAL_REPOS` just works in Bash. The PowerShell tool never receives it, so do repo work in Bash. Hooks and the db-explorer MCP server derive it themselves (`repos-root.cjs`). In a first session, or any shell without it, the two lines below derive it the same way:
```bash
: "${VIVREAL_REPOS:=$(cd "$(dirname "$(git rev-parse --git-common-dir)")/.." && pwd)}"
test -e "$VIVREAL_REPOS/vivreal-hq/.git" || { echo "no Vivreal clone root found: open the session inside a Vivreal clone"; exit 1; }
```
Worktrees go under `$VIVREAL_REPOS/_wt/`; one-shot production scripts under `$VIVREAL_REPOS/_ops/`.

- **A sibling repo you need is missing:** clone it, `gh repo clone HillBombCreations/<repo> "$VIVREAL_REPOS/<repo>"`, rather than reporting a hole.
- **A repo has `.env.example` and no `.env.local`:** run `node "$VIVREAL_REPOS/vivreal-hq/packages/fleet-ops/onboarding/fetch-env-local.js" <key> "$VIVREAL_REPOS/<repo>"` (the key is the repo's `envLocal` in `onboarding/repos.json`). It prints names, never values, and lists the personal keys still to fill.
- **`npm` in Bash needs no token setup, and only installs get a token:** the same hook runs `npm` and `npx` through a wrapper. Install and read commands (`ci`, `install`, `i`, `add`, `update`, `view`, `info`, `outdated`, and `npx` or `npm exec` naming `@hillbombcreations/`) get the shared READ-ONLY packages token; `npm publish` alone gets the WRITE token, and only for its upload: its lifecycle scripts and its `npm pack` run first with no token, then the packed tarball is published with `--ignore-scripts`; every other command (`npm run build`, `npm test`, `npx next build` and the rest) gets NONE, and a `NODE_AUTH_TOKEN` you set is stripped from it too, because a Next.js build cache writes environment values to disk (owners, 2026-11-04). Each token is read from AWS Secrets Manager with your own AWS sign-in at the moment npm runs (the secret names are keys `packagesTokenSecret` and `packagesWriteTokenSecret` of `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json`), never from `gh auth token`, and the wrapper never prints it or writes it to a file; the npm child that receives it, and that child's install scripts, can read their own environment. When a part is missing (the key, the secret, or your AWS sign-in) it says which, and npm runs without a token.

### Cross-repo docs: the hq dev docs
Cross-repo flows, decisions, dependency maps, the AWS estate and operations are described in the vivreal-hq dev docs, `${VIVREAL_REPOS}/vivreal-hq/docs/dev-docs/README.md` (a symptom table, then use cases and references). Each repo's `CLAUDE.md` owns that repo's internals; the dev docs own what crosses repos (owners, 2026-11-04). Two hq tools, run from `${VIVREAL_REPOS}/vivreal-hq`, find the right page before you change code: `npm run docs:route -- "<symptom or component>"` names the document to open, and `npm run docs:impact -- <repo>:<path>` lists the documents, maps and pinning tests that cover a file you are about to change. If either script is missing on that checkout, open the README's symptom table by hand. **The portal's `docs/ecosystem/` is frozen** (owners, 2026-11-04, a banner on each page points here): never cite it as current and never edit it.

### When you see `${VIVREAL_REPOS}/...` in this doc or any agent prompt
Resolve it before reading. Never paste the literal placeholder into a Read or Bash command, substitute the actual path.

### Cross-platform note
- **Windows:** use Git Bash or WSL, backslashes in paths are NOT cross-platform; always use forward slashes when invoking the Bash tool
- **WSL steps: read [references/wsl.md](references/wsl.md) first.** One quoted `wsl.exe -e bash -lc`
  command that changes folder first (`-e`, so no outer shell expands a `$` before your `cd`); Linux
  node proven first (the vivreal-skills `SETUP.md` WSL step); a long step in a script file;
  `setsid -f`; installs and tests on WSL's own disk (a `git bundle` clone when WSL git cannot read
  the worktree), never on Windows instead.
- **MSYS path mangling reaches further than the AWS CLI.** The known cases are an `aws` argument
  that starts with `/` coming back as a bogus `AccessDenied`, and a log group name (`/aws/lambda/...`,
  `/aws/amplify/...`) turned into a Windows path, so a log read answers "does not exist" or reads
  nothing (it bit a release B design review and a reviewer again on 2026-11-18). The case that is missed: **MSYS
  also rewrites a `/` INSIDE a `jq` expression**, and inside a `git show ref:path` argument, so
  `jq '.a/.b'` and `git show origin/main:file.md` both silently operate on a mangled string.
  A `git show` mangled this way fails loudly, but a mangled `jq` filter can simply select
  nothing and print `null`, which reads as "no such value" rather than as an error.
  **Export `MSYS_NO_PATHCONV=1` for the whole block**, not just for the `aws` line.
- **`core.autocrlf=true` makes content checks lie.** Git stores LF and checks out CRLF, so a
  raw-byte hash of a text file never equals its blob, a committed `dist` rebuilds as modified with
  no content change, and Python text mode rewrites paths on their way into git. Hash the output of
  `git show <ref>:<path>`, or normalise line ends first; pack from an `autocrlf=false` checkout.
- **The AWS CLI on Windows** reads a `file://` input as cp1252 unless `AWS_CLI_FILE_ENCODING=UTF-8`
  is set, and truncated JSON can still parse, so compare an item count with the pagination token
  before trusting a list.
- **PowerShell splits an unquoted comma argument.** `--flag=1,2,3` reaches the script as an array,
  not a string (a hold list once held nothing that way). Quote every argument that carries a comma.
- **Python on Windows under Git Bash** cannot open a Git Bash `/c/...` path (write the drive form,
  a letter and a colon, then forward slashes), and `python -` with no stdin waits at a prompt.
  Always feed it a file or a heredoc.
- **macOS / Linux:** native bash works as-is
- **Setting env vars:** add to `~/.bashrc`, `~/.zshrc`, or your shell profile. Example: `export VIVREAL_REPOS="$HOME/repos"`

### Browser tool output stays outside every repo
Anyone who drives the browser tool (the Playwright MCP) reads [references/browser-tool-output.md](references/browser-tool-output.md) first: set `PLAYWRIGHT_MCP_OUTPUT_DIR` outside every repo, name saved files with absolute scratchpad paths, and run its folder check, with its control, before and after the run.

---

## Who "an owner" is
An owner means either co-owner, Justin or Hunter. Either one may give any GO, any QA-walk sign-off and any owner decision, for any change. Nobody else may. Never wait for one particular owner, and never treat one owner's GO as needing the other's.

## Owner rules every agent follows

The owners' rules live in vivreal-hq: `docs/standards/process.md` (each rule with its date and
detail) and its one-line index `docs/standards/INDEX.md`, which the vivreal-workflow session-rules
hook prints into every session and subagent outside a current hq checkout. These are the ones an
agent acts on itself, by ID:
- **P-no-secrets:** never print a secret (a token, password, connection string or env value) in a transcript, a commit or a PR body; an AWS read that can return env or secret values names only the fields it needs with `--query`.
- **P-no-personal-files:** never use an owner's personal files (photos, documents, personal synced folders) as test data, even into a throwaway resource; ask an owner for a test file, or use a public or generated sample.
- **P-no-new-qa-users:** no new QA users or businesses; prove a live flow read-only on real traffic since the deploy (counts and shape, no personal data), or with the existing accounts in the QA account bundle.
- **P-mute-audio:** every Chromium a test, walk or script launches gets `--mute-audio`; headless still plays sound on the machine.
- **P-sentry-warn:** a new Sentry issue, even a deliberate test event, pages the owners, and so does a test or probe call that can trip a paging alarm (one with actions on at a threshold of 1), even a read-only one; prefer a control that creates no issue, warn in chat before sending either, and if one slips out say so at once and resolve it with a note.
- **P-content-through-ui:** content adds (a new help page, a blog post, a collection item) go through the product's own screens, Studio or the portal's content editor, done by an agent acting as an owner would; a one-off database script (`vivreal-workflow:ops-one-shot`) only for a step those screens cannot do.
- **P-no-waf-cost:** no new web ACL, WAF logging, Bot Control or other managed rule group as a fix; fix abuse in code, existing access logs or Cognito's own protections, and price and ask before adding a rule to an existing ACL.
- **P-skills-push-after-review:** vivreal-skills changes are committed to a LOCAL branch, reviewed there by `vivreal-agent-review:definition-reviewer`, fixed and re-reviewed locally, and pushed with ONE PR per batch only when that batch is ready to merge (reviewed, gates green, merge GO in hand), because CI runs on every push and every PR; later work for the same batch folds into that PR, never a second stacked PR.
- **P-shared-checkout:** agents share one checkout's stash and scratchpad; never `git stash`, `reset --hard`, `checkout --` or `restore` a file you did not write.
- **Scripts and logs in shared folders** (release B, L-B-44, in P-shared-checkout's spirit): run only scripts you wrote, from your own work folder (the ops folder your brief names, or your own `<task-slug>/` folder, `vivreal-workflow:fleet-concurrency`). The scratchpad's top level belongs to the main thread and your own `scratchpad/<task-slug>/` folder is yours; a script at the top level, or in another agent's folder, is never yours to run, even when its name fits your task (one started another agent's old red proof). Write a log once, under a name stamped with the UTC time, and never overwrite or delete it; a rerun writes a new one.
- **P-allow-refuse:** pair every ALLOW test with a REFUSE test on the same mechanism; a one-sided gate test passes when the gate never engages.
- **Every WSL step starts by changing into the worktree,** inside one quoted login-shell command (`wsl.exe -e bash -lc 'cd /mnt/<drive>/<clones>/_wt/<worktree> && <command>'`); a bare `wsl` call runs in whatever folder the shell is in, often an owner's own checkout, a plain `bash -c` runs the Windows npm, and without `-e` an outer shell expands every `$` in the calling folder first ([references/wsl.md](references/wsl.md)).

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

| If the task touches… | Read these sections |
|---|---|
| `src/app/api/proxy/*` (any portal proxy route) | [references/portal.md](references/portal.md): "The three-tier API rule" + "Proxy route factory" |
| `active_ctx`, `dbKey`, `groupID`, multi-tenant routing | "Auth & multi-tenancy" |
| MongoDB queries, indexes, write concerns | "Optimization principles" + the `vivreal-db` skill + dev docs `02-architecture/data-and-tenancy.md` |
| About to use the Mongo MCP tools (`mcp__plugin_vivreal-db-explorer_mongodb__*` from the vivreal-db-explorer plugin, or `mcp__mongodb__*` where a project `.mcp.json` declares `mongodb`) | Read the `vivreal-db` skill first, it carries the multi-tenant routing + dbKey/group.key/bucketname rules. Prefer `/db-query` over raw `mcp__mongodb__find`. |
| `useAuth()` in app layout, hydration, SSR | [references/portal.md](references/portal.md): "Hydration & SSR rules" |
| Lambda env vars, function names, CloudFormation | [references/aws-infra.md](references/aws-infra.md) + dev docs `05-reference/aws-estate.md` |
| CSP, cookies, CSRF, security headers | "Security non-negotiables" |
| Any AWS CLI command (its `--profile`), AWS or Amplify reads (`get-app`, `get-function-configuration`, `get-secret-value`, `ssm get-parameter`), env vars, secrets | "Security non-negotiables" |
| Any test files, e2e, unit, or backend (writing OR editing) | [references/testing.md](references/testing.md) + "Backend testing conventions" |
| Integration manifests (`src/data/manifests/`), portal component patterns, shared sheet/dialog renderers | [references/portal.md](references/portal.md): "Conventions you'll see" + "Default-renderer fallbacks" |
| Removing cross-repo code (consumer → producer) | "Cross-stack removal ordering" |
| `package-lock.json`, `npm ci` failing in CI but not locally, peer-dep errors | "Dependencies, lockfiles and the CI runner" |
| A `wsl` or `wsl.exe` step: a Linux install, test, gate or pack on a Windows machine | [references/wsl.md](references/wsl.md) |
| Dispatching a deploy workflow, or claiming a stack updated | [references/aws-infra.md](references/aws-infra.md): "Reading and verifying a CloudFormation deploy" |
| Backports, cherry-picks, "did this fix reach `release/*`" | [references/aws-infra.md](references/aws-infra.md): "Proving a fix reached a line" |
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
- **Never print any part of a secret's value, not even in a format or shape check** (release B,
  L-B-16). A check that classed an `@` in a password as an email address printed the rest of the
  password (2026-11-17). A shape check prints only key names and booleans: `typeof`, a length band
  (`length > 20`), a `startsWith` result, a count; never a slice, a mask with real characters, a
  regex match group or an error message that quotes the value. The same holds for a page that lists
  customers or credentials: read it by locator and named fields, never as whole-page text.
- **AWS commands name the agent profile.** When `VIVREAL_AGENT_PROFILES` is set (`printenv
  VIVREAL_AGENT_PROFILES` lists profile names, which are not secrets), the agent roles are live:
  every AWS CLI command names one of those profiles with `--profile <name>`, spelled out, the
  read-only one (its name ends `-ro`) unless the task writes infrastructure, and never any other
  profile. Never set, export or unset `AWS_PROFILE` or `AWS_DEFAULT_PROFILE` in a command, and never
  put credentials in one: each reaches the operator's own administrator access, and the
  vivreal-infra env guard hook refuses only a `--profile` outside the list, so for those forms this
  rule is the only net. An `AccessDenied` under an agent profile is the boundary working (it denies
  the secret-value reads above on purpose): report it, never retry under another profile. While the
  variable is unset (the roles not yet proven live), commands run as they did before.
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
- **A local Turbopack `next build` writes env values, tokens included, into
  `.next/cache/turbopack/*.sst`.** Never grep or print that cache, and delete it before sharing a
  tree.
- **URL guards have two traps.** A host pattern built by joining strings into `new RegExp` loses
  its backslashes, so a dot matches any character; and `URL.hostname` keeps an IPv6 host's
  brackets, so a bare `::1` comparison never matches. Escape each joined part, and compare
  against the bracketed form.
- **Never string-replace a caller's value into an OAuth URL.** A caller-supplied `{shop}` replaced
  into an authorize URL once sent `client_id` and `client_secret` to an attacker's host. Validate
  the host against an allowlist and build the URL with the `URL` API.

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
- Backends: the shared `errorHandler` (in the backends whose handlers call `next()`) fails open
  when it is used from router-level middleware. Use it only in controller position.

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

- **The runner and your machine do not agree about peer dependencies.** CI runs the
  `node-version` in each repo's own workflow on its deployed line: **node 20 or 22 (npm 10)**
  until that repo's runtime row ships, then **node 24 (npm 11)** (the nodejs24.x move, plan
  vivreal-hq `docs/projects/runtime-nodejs24/plan.md` on branch `docs/runtime-nodejs24-plan`);
  dev machines here run **node 22 (npm 11)**. npm 11 and npm 10 resolve peer
  dependencies differently, so **a lockfile written by npm 11 can be REFUSED by npm 10**.
  The consequence that matters: **`npm ci --dry-run` passing locally proves nothing about
  CI**, because it is npm 11 validating npm 11's own output. Verify against both runner
  majors instead, because until the runtime close the fleet's CI runs both:
  ```bash
  npx -y npm@10 ci --dry-run --ignore-scripts && npx -y npm@11 ci --dry-run --ignore-scripts
  ```
  `--ignore-scripts` is required, not optional: `npm ci --dry-run` installs nothing but still runs the root package's `prepare` script (`husky`, or a `tsc` build), which exits 127 on a clean checkout, so without the flag the gate fails for a reason that has nothing to do with the lockfile. The flag does not weaken the check: a `package.json` and lockfile out of sync still exits 1 (`EUSAGE`) under both npm 10 and npm 11.
  Treat that, not the local run, as the gate before pushing a lockfile change.
- **`npm install` on Windows writes a lockfile that `npm ci` REFUSES.** It prunes packages
  that other packages still require (the optional-dependency platform pruning is the usual
  trigger), producing a lockfile that is self-inconsistent rather than merely
  platform-specific. `npm install` is happy with it; `npm ci` refuses it outright, so the
  break lands in CI and in any build that uses `npm ci`. This **nearly took down all six
  customer site builds** in one session. After any `npm install` on Windows, check the
  lockfile diff for removed entries, and validate with the dry-run gate above before
  it leaves the machine.
- **A bare `npm view @hillbombcreations/<pkg>` against public npm answers a misleading E404.**
  The packages live on GitHub Packages; query through the scope registry with the token (in an
  agent's Bash the npm wrapper does this for `view`).
- **Switching a worktree's branch updates `package.json` and the lockfile, never `node_modules`.**
  Run `npm ci` after a checkout before trusting any version-mirror test.
- **A GitHub Actions billing refusal** is a completed, failed job with ZERO steps, whose logs
  expire. A job that has steps and fails is something else, and no runs at all is evidence of
  neither.

## Testing rules
Read [references/testing.md](references/testing.md) before writing or editing any test. It carries the e2e
harness rules, the red proof every agent follows (forms (a), (b) and (c), and the `Red:` line), real
code paths and real layers over fakes, fixtures recorded from real answers, mocks in the deployed
shape, inert fixes, honest assertions, the build-is-not-the-suite rule, vacuous controls, the
hook-is-the-one-full-run rule, and the specs that touch your files, each under a timeout.

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
| Vivreal_Site_Migrator | `${VIVREAL_REPOS}/Vivreal_Site_Migrator/CLAUDE.md` at `origin/master` | Migration (`/migrate`) + template/identity-kit (`/template`) pipelines (`CLAUDE.md` at `origin/master`, plus `docs/migration-flow.md` and `docs/template-flow.md`) |
| vivreal-hq | `${VIVREAL_REPOS}/vivreal-hq/CLAUDE.md` (+ `packages/*/CLAUDE.md`) | **Canonical for brand voice, content and lead generation.** Voice + positioning in `brand/`, planning inputs in `knowledge/` and `content/`, the two toolchains under `packages/leadgen` (CommonJS) and `packages/content-studio` (ESM). **`brand/voice.md` outranks everything for any copy.** Since v7 it also holds the **admin app** (`packages/admin-app`, the only home of staff surfaces including the outreach CRM). **Merging hq `main` deploys nothing:** the admin Amplify app builds only `deploy/admin-app`, so its deploy is a fast-forward of that branch, and its three stacks and every `packages/fleet-ops` stack deploy by hand from a clean worktree at the merge (v7 release runbook, hq row). Its agents and commands live in the `vivreal-skills` marketplace, not in its `.claude/`. |
| vivreal-content | `${VIVREAL_REPOS}/vivreal-content\` | **DEAD SOURCE.** Consolidated into `vivreal-hq` on 2026-08-03 and frozen: its last commit is that same day, while the hq content tree has moved repeatedly since. The checkout still exists and still holds its own agents and commands, which is exactly why it gets read by mistake. Read and edit content work in `vivreal-hq`, never here. |
| Vivreal_SSR_Landing | `${VIVREAL_REPOS}/Vivreal_SSR_Landing/AGENTS.md` (+ `docs/`) | **DEAD SOURCE: this repo does NOT serve vivreal.io.** `vivreal.io` and `www.vivreal.io` are CloudFront `<vivreal-io-distribution-id>` (real id in vivreal-hq `docs/dev-docs/05-reference/aws-estate.md`), whose default origin is the Vivreal_Templates Amplify app `vivreal` (`<vivreal-io-amplify-app-id>`, real id in vivreal-hq `docs/dev-docs/05-reference/aws-estate.md`, branch `stable`), with `/app*` routed to the portal's `stable`. Its pages are CMS content in the Vivreal group's site record plus a few Templates code routes (`/domains`, `/mcp`, `/llms.txt`). No SSR_Landing Amplify app exists in the account (sweep 2026-09-16). Change vivreal.io through the portal or Vivreal_Templates, never here. |
| vivreal-edit-extractor | `${VIVREAL_REPOS}/vivreal-edit-extractor\` | EditDNA extraction tooling (companion to vivreal-content) |
| Vivreal_Docs | `${VIVREAL_REPOS}/Vivreal_Docs\` | **DEAD SOURCE.** The help centre, `https://vivreal.io/help`, is the Vivreal_Templates app `vivreal-help-path` rendering the Vivreal group's CMS behind vivreal.io's `/help*` behaviour (release B, **not live until the help move (FIN-A11)**: until then the old help host serves it and `vivreal.io/help` redirects there); `vivreal.io/docs*` answer 301 to it, and, after the move, the old help host forwards to it by a domain rule on the old app `vivreal-help` (`<vivreal-help-amplify-app-id>`, real id in vivreal-hq `docs/projects/aws-cleanup-inventory.md`), and the old Docs Amplify origin (`<old-docs-amplify-app-id>`, real id in vivreal-hq `docs/projects/aws-cleanup-inventory.md`) no longer exists (2026-09-16). |
| Vivreal-Schemas | `${VIVREAL_REPOS}/Vivreal-Schemas` | Shared Mongoose schemas, `@hillbombcreations/schemas`. Read the published version from its `package.json` and each consumer pin from the consumer `package.json`. Consumers do not all sit on the same major, and that disagreement is the interesting fact, not the numbers |
| Vivreal-Tier-Quotas | `${VIVREAL_REPOS}/Vivreal-Tier-Quotas` | Shared `@hillbombcreations/tier-quotas`. Owns every tier quota. Sentinel scheme: `-1` unlimited, `0` no access, `>0` a cap. **Read `src/tierQuotas.ts` for the current ladder before asserting any tier name or any quota value.** The ladder has lost a tier and the package has dropped its alias table, so a remembered tier name now normalises to `free` rather than erroring |

All backends: Express + serverless-express, JavaScript (not TS), Mongoose, Pino, AWS SAM (except VR_Client_Auth + Vivreal_EventHandler = Serverless Framework). X-Ray is retired where touched recently (Client/Secure), Sentry is the telemetry layer.

**Citation rule for docs in this plugin repo:** cite function/route/file names, not line numbers, `src/foo.js:123` rots in weeks. Stamp `Last synced: YYYY-MM-DD` when syncing a doc to source (log in vivreal-skills `docs/SYNC.md`).

## AWS Lambda & Infrastructure Reference
Read [references/aws-infra.md](references/aws-infra.md) for Lambda config, deploys and release lines. Its
sections: Function rosters (count them, do not quote them), Release trains, Proving a fix reached a line
(`git cherry`), Infrastructure stacks, Secrets Manager, Reading and verifying a CloudFormation deploy,
and When to consult the Lambda inventory. The estate itself is vivreal-hq
`docs/dev-docs/05-reference/aws-estate.md`.

## Cross-repo documentation (the hq dev docs)
The standing description of how the system works across repos lives in vivreal-hq, `${VIVREAL_REPOS}/vivreal-hq/docs/dev-docs/README.md`, and is
maintained by `vivreal-workflow:system-doc-writer`. Check it during research before grepping blindly.

| You need | Open (under `docs/dev-docs/`) |
|---|---|
| Where to start, by symptom | `README.md`, or `npm run docs:route -- "<symptom>"` from vivreal-hq |
| What a file you are changing feeds | `npm run docs:impact -- <repo>:<path>` from vivreal-hq |
| Services, boundaries, the portal | `02-architecture/platform-and-services.md`, `02-architecture/the-portal.md` |
| Data, tenancy, `dbKey` routing | `02-architecture/data-and-tenancy.md` |
| Decisions and why | `02-architecture/decisions.md` |
| A request's path through the system | `03-use-cases/U<n>-*.md` (the README lists each with its symptom) |
| Site creation and the EventHandler flow | `03-use-cases/U5-site-creation-to-live.md` |
| Tiers, quotas and pricing | `03-use-cases/U2-quota-enforcement.md`, `03-use-cases/U11-pricing-structure.md` |
| Email and SES | `05-reference/email.md` |
| Functions, stacks, alarms, IAM | `05-reference/aws-estate.md`, `05-reference/alarms-and-monitoring.md`, `05-reference/iam-roles.md` |
| Releases and deploys | `04-operations/release-and-deploy.md` |

**The portal's `docs/ecosystem/` is frozen** (owners, 2026-11-04): a banner on each page points to
the dev docs. Never cite it as current, never edit it, and never send a reader there. A fact you find
wrong or missing in the dev docs goes in your report for `vivreal-workflow:system-doc-writer`, with
the document and the deployed ref that disproves it.

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
every rule in checklist form, then each entry with how to spot it and its guard (source of
truth: `${VIVREAL_REPOS}/vivreal-hq/docs/standards/anti-patterns.md`, which also carries the
evidence and enforcement status). A diff that adds an instance of any rule there is wrong even
when its tests pass.

When you find a new recurring class, add it to the catalog in the same PR as the fix (vivreal-hq
source first, then this plugin copy), with its evidence and its guard.

## Workflow rules: additions to the original 7
8. Read the hq dev docs (the README's symptom table, `npm run docs:route`, and `npm run docs:impact` on the files in play) and the relevant repo CLAUDE.md before forming hypotheses. They contain knowledge that grep cannot surface.
9. Cite an industry standard (OWASP, AWS Well-Architected, Web.dev, MDN, RFC, Google Eng Practices) for any non-obvious technical decision. "Best practice" without a citation is not a justification.
10. **Wait on a log only after proving the log and its writer exist, and always with a bound** (release B, L-B-37). Before any wait on a background run's log, check that the file exists and that the process writing it is still running, or has already written its end marker. Then wait with a timeout and one end-marker match, for example `timeout 170 tail -n +1 -f <log> | grep -m1 '<end marker>'`, never an open `tail -f` or a loop with no cap. If the file is missing or its writer is gone, re-run the generator with its output to a fresh log rather than wait. An unbounded wait on a log nobody was writing held a run for a long while; the same wait, bounded, ended in about a minute.

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
- **An unstubbed AWS SDK client runs with the machine's real credentials** and can write
  production. Stub every client, and make a test that reaches the network fail.
- Endpoint-focused: cover route wiring, handlers, controllers, validators, services
- Branch coverage required: success path, validation failure, empty response, error branches
- Run: `npm run test:unit` (no coverage gate, faster) or `npm test` (with NYC 100% gate)
- `test/test.js` is legacy and NOT in the active glob, don't add tests there
- **An in-memory MongoDB helper retries a port Windows refuses** (`listen EACCES` inside a reserved port range): [references/in-memory-mongo-ports.md](references/in-memory-mongo-ports.md).

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

### JS `String.replace` expands `$` patterns in the new text
In an edit script, `text.replace(old, next)` with a string `next` turns `$&` into the match,
`` $` `` into all the text before it, `$'` into all the text after it and `$$` into one `$` (measured
on node, 2026-11-17; `replaceAll` too, and a regex `old` adds `$1` and `$<name>`). New text holding a
`$` (a shell line, a price) can duplicate half the file, and the script still exits 0 (release B,
L-B-13). **Fix:** `text.replace(old, () => next)`, whose return goes in as is, or slice on an
`indexOf` checked to occur exactly once; then read the bytes back. Python's `re.sub` has the same
trap with a backslash in its replacement (`\1`, `\g<name>`): pass it a function too.

### Subagent file write verification
Subagents (researcher, architect, etc.) sometimes claim they wrote a file but did NOT actually write it. The coordinator MUST verify every artifact exists after each agent dispatch:
```bash
ls -la "path/to/expected/file.md"
```
If the file is missing, the coordinator should write it from the agent's returned output rather than re-dispatching.
