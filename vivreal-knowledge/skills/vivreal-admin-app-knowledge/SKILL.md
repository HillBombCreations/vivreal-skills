---
name: vivreal-admin-app-knowledge
description: 'Use when working on, walking, deploying or reasoning about the internal admin app (vivreal-hq packages/admin-app), the invite-only, sign-in-only staff hub that holds every staff surface since v7 (outreach CRM, sign-ups, monitoring, errors, tickets, flags, audit, usage, economics, deployed sites, team, staff push), covering where it lives, its own identity pool and session, how it calls the fleet with no active_ctx, the deploy by fast-forwarding deploy/admin-app, its two ops Lambdas, what each page reads, and the restyle, Releases and Database pages that are planned but not shipped.'
---

# The internal admin app

Last synced: 2026-10-20 (vivreal-hq `origin/main` `28bb8b4a`; `deploy/admin-app` at `482b746a`, an
ancestor of `main` with no `packages/admin-app` commits between them)

Source of truth, read in this order: `packages/admin-app/CLAUDE.md`, the code under
`packages/admin-app/src/`, then `docs/dev-docs/02-architecture/the-admin-app.md` (written 2026-10-04;
its page list and its "501 at the deployed ref" status box are older than v7, so trust the code where
they differ). Per page detail: `references/pages.md`.

## What it is, and who it is for

- **The one home of every staff-only surface.** From v7 the customer portal keeps no admin-only
  piece (owner, 2026-10-16). The outreach CRM, sign-up alerts, the feature-flag console, staff
  alarm pushes and anything gated by the admin email list live here. Campaigns and every customer
  feature stay in the portal. Never add a staff-only feature to the portal; build it here.
- **Invite-only for exactly three people, and sign-in only.** There is no sign-up and no
  account-creation flow, and none may be designed. The pool is `AllowAdminCreateUserOnly`
  (`cloudformation/admin-identity.yaml`), and the Team page's roster is a fixed list of three
  addresses (`src/lib/team/operatorState.ts`, `TEAM_ROSTER`). Do not copy those addresses anywhere.
- **Not the portal.** No tenant, no `active_ctx`, no `dbKey` switch. Every upstream call names its
  target `groupID` in the request.
- **Not a second collector.** `packages/fleet-ops` publishes the numbers; this app reads what it
  published. A page that starts polling a health endpoint or the database directly is rebuilding a
  producer. Every fleet-ops collector still runs from a terminal without this app.

## Outreach lives here, and is fixed forward

The outreach CRM moved out of the portal in v7 (pages under `src/app/outreach/`, routes under
`src/app/api/outreach/`). **A production problem with admin outreach is fixed forward here (and in
VR_Outreach_API), never by restoring the old portal CRM** (owner, 2026-10-20). Only the three
operators use it, so it does not gate a portal release. Admin outreach sequences carry no opt-out
wording by owner decision; portal campaigns keep theirs (see `vivreal-knowledge:vivreal-product-rules`).

## Identity and session

- **Its own Cognito pool**, `Vivreal-Admin-Identity` (`cloudformation/admin-identity.yaml`): MFA
  `ON` with software TOTP the only factor, admin-created users only, ID and access tokens an hour.
  Verify MFA with `get-user-pool-mfa-config`; `describe-user-pool` reads its MFA fields back as
  null (the template's own comment).
- **Sign-in** is a server-side challenge chain, password, new password, TOTP enrolment, TOTP
  (`src/app/api/auth/signin/route.ts`). Every failure at the password step answers one generic
  401, so nobody can probe which addresses exist. Outcomes go to the `/vivreal/admin-auth` log group.
  A sign-in form never submits credentials by GET; a stray credential query is redirected to the
  clean URL unread (`src/proxy.ts`, `src/app/api/auth/form-fallback/route.ts`).
- **Its own session**, `admin_session`, audience `vivreal-admin`, keyed from `ADMIN_CTX_SECRET`,
  60-minute idle window, 12-hour absolute cap (`src/lib/adminSession/`). `src/proxy.ts` (Next 16's
  replacement for `middleware.ts`, Node runtime) re-mints it on every request and refreshes the
  Cognito ID token near expiry. Cookies set no `Domain`.
- **Standing is checked on arrival.** The pool lets an operator in; the admin email list
  (`ADMIN_EMAILS`, which every backend gate reads) is what grants. The landing page makes one gated
  read and turns a 403 into a named refusal (`src/lib/adminSession/rosterCheck.ts`). Adding an
  operator means the pool AND the list.
- **Secrets are read at run time, never from env in production.** `src/lib/secrets` reads
  `CTX_SECRET` from `<secret-prefix>/ctx` and the session key plus the pool client secret from
  `<secret-prefix>/admin-app` through the compute role, and logs only a VersionId. Outside production
  (vitest, `next dev`) the environment is the only source.

## Calling the fleet: four rules in `src/lib/upstream`

`src/lib/upstream/index.ts` is the only code that calls another service.

1. **No `active_ctx`.** The target `groupID` goes in the body.
2. **`X-App-Source: vivreal`, always, literally.** It is a tenant partition, not a client name. Any
   other value answers a clean, wrong, empty list instead of an error.
3. **Whole fields, never dotted body keys.** VR_Secure_API strips a dotted key before the handler.
4. **CSRF is this app's own**, derived from its session (`src/lib/upstream/csrf.ts`), because the
   portal's derives from `active_ctx`.

Two credentials ride each call: the admin pool's ID token as a bearer, and an `x-user-ctx` minted
for exactly the audience called, from a leaf of `CTX_SECRET`, living 60 seconds. Holding
`CTX_SECRET` means this app can speak for any group, which is why the pool's MFA is load bearing.
The one exception that also mints `x-active-ctx` is VR_Outreach_API, which requires one on every
request; it is only ever pointed at the fixed internal cohort group (`src/lib/upstream/outreach.ts`),
never a customer's.

Secure's admin routes bind to the admin pool's authorizer, and every handler still runs
`requireGlobalAdmin` against `ADMIN_EMAILS`. Count `Path: /api/admin` events in Secure's
`cloudformation/` for the current set; never quote a number.

## The admin app's own routes follow one shape

Read before adding a route under `src/app/api/`:
- **GET reads, POST writes, by `op`**, each op looked up in its own table by own key only
  (`Object.hasOwn`), so a write is never reachable by GET and `op=constructor` is unknown.
- **Each write op has an exact key list.** A key the upstream would refuse, or a tenant key, never
  leaves the app. Ids are checked as 24 lowercase hex before any call.
- **Session, then the CSRF double submit, then validation**, each failing closed. The operator is
  `claims.email` from the verified session, never a body field.
- **Compare-and-set where state moves.** A stage move or a migration step names the state the
  operator saw (`expected`); Outreach writes only while it still holds and answers 409, which the
  page turns into "this changed, reload".
- **Every write leaves an audit line** naming the operator and the outcome (`admin.outreach.change`,
  `admin.suppression.change`, `admin.push.change`): done, refused or failed. A write that landed but
  could not be logged says both.
- **No upstream error text reaches a response body.** The app says it in its own words.
- **Success only after the upstream confirmed.** A queued send says "due at", never "sent".

## The two ops Lambdas

The compute role can invoke exactly two functions; everything an operator does to AWS goes through
them (`cloudformation/ops-read.yaml`, `ops-write.yaml`; code under `lambda/`).
- **VR-Ops-Read**: read-only, behind explicit denies on every write action. Actions: `overview`,
  `writeAuditLog`, `deployedSha`, `costSnapshot` and `costSnapshotRead`, `siteHosts`,
  `featureSignals`, `searchCheckRead`, `sentryIssues`, `clickupTasks` (`lambda/ops-read/src/index.js`;
  read the dispatch for the current list). Its third-party read tokens live in `<secret-prefix>/ops-read`
  with a rotation table in the package CLAUDE.md. Its log group keeps 400 days on purpose.
- **VR-Ops-Write**: three named actions on named resources, `runAuditor`, `sendTestAlert`,
  `purgeCdn`, each written to `/vivreal/ops-write-audit`. `purgeCdn` plans by default and writes
  only on an explicit confirm, rebuilding the plan server side.

## Deploy: fast-forward `deploy/admin-app`

- **Merging to vivreal-hq `main` deploys nothing to this app.** An Amplify app builds the
  `deploy/admin-app` branch as production; moving that branch is the deploy. The release step is a
  fast-forward of `deploy/admin-app` to the reviewed `main` commit, then the build, then a read of
  the served app. Never write "merge deploys" in a PR body (v7 runbook U15 did).
- **The build spec is the repository-root `amplify.yml`**, scoped with
  `appRoot: packages/admin-app` and a workspace-scoped `npm ci`. Amplify reads `amplify.yml` only
  from the root; a copy in the package is ignored. `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is load
  bearing (Next 16 pulls `playwright` as a peer).
- **The artifact gate.** `scripts/assert-artifact-clean.mjs` is an allowlist: the build fails if any
  output file resolves outside the package. It also runs against `scripts/fixtures/dirty-artifact/`,
  which must fail, or the build fails. This is what keeps `packages/leadgen/Data/` and the tracked
  media out of every artifact. Re-read it before changing what this package builds.
- **A build-time public value needs its own `amplify.yml` line.** An Amplify console variable is
  invisible to `next build` unless the spec copies it into `.env.production` (#59 did this for the
  VAPID public key, without which notifications could not turn on).
- **The three stacks are deployed by hand**: `scripts/deploy-admin-identity.sh` and
  `scripts/deploy-ops-stacks.sh`. Prove a stack deploy from stack state, not from the script's exit.

## Working in it

- `npm run test:admin` from the repo root (vitest plus the Lambdas' `node --test`); `npm run
  typecheck` in the package. Node 22.
- **Tailwind 4 scans test files unless told not to.** A class-like string in a test once broke
  `next dev` with a 500 while `next build` passed (the minifier dropped the rule). The four
  `@source not` lines in `src/styles/globals.css` and `src/styles/tailwindSourceScan.test.ts` keep
  that fixed; do not remove them.
- **UI primitives are ported from the portal by value** and retokened (`src/components/UI/`);
  `retoken.test.ts` fails on portal-only classes. Adding a dependency on Windows: diff the lockfile
  package keys before and after (`npm install` drops Linux `@emnapi/*` entries) and prove with `npm ci`.
- **Shell-safe copy lines.** A page that prints a command for an operator to paste (the migration
  estimate and hand-off lines) must be safe in PowerShell 5.1, Git Bash and cmd.exe: build it only
  from an allowlisted character set (no `&` or `%`, which cmd.exe interprets), escape every
  typographic single quote, and test the refusals.
- **Walking it**: dispatch `vivreal-product:qa-walker`, whose "Walking the admin app" section covers
  the operator sign-in, the head to name in the matrix, and the fix-forward rule.

## Planned, not shipped (as of 2026-10-20)

- **Restyle to portal quality, dark navy** (vivreal-hq `docs/projects/admin-restyle/`, draft PR #61,
  twelve review units landing as one release PR and one deploy). Tokens on the portal's own names,
  the portal shell darkened, five-tab phone bar.
- **Releases page** (restyle plan, R14, owner ask): extend Deployed into per-service live version,
  release line, stable SHA, when it went live, whether `main` is ahead, and when the next cut and
  promote run (a disabled workflow reads as paused). Read-only.
- **Database page** (restyle plan, R15, owner ask): open connections by service against the cluster
  cap, slowest operations, sizes and index use, Atlas tier, recent alarms. Needs a research step
  first on which read-only role or Atlas API it may use; nothing on it may write.

Do not describe these as live. Check `git log origin/main -- packages/admin-app` and the deploy
branch before saying any of them shipped.

## Related

`vivreal-workflow:shared-standards` (the vivreal-hq repo row and deploy table),
`vivreal-infra:vivreal-notifications` (the admin push surface: devices subscribe with
`surface: 'admin'`, staff types go only to admin devices), `vivreal-infra:vivreal-observability`
(the alarm estate the Monitoring page reads), `vivreal-knowledge:vivreal-outreach-api-knowledge`
(the routes the outreach pages call).
