# AWS Lambda and infrastructure reference

Moved out of `SKILL.md` ("AWS Lambda & Infrastructure Reference") on 2026-11-18 so that file stays a
map (definition review F476 6). The subsections keep their names, so a citation such as
"shared-standards, Release trains" or "Reading and verifying a CloudFormation deploy" lands here.

Contents: Function rosters (count them, do not quote them); Release trains; Proving a fix reached a
line (`git cherry`); Infrastructure stacks; Secrets Manager; Reading and verifying a CloudFormation
deploy; When to consult the Lambda inventory.


**The estate:** `${VIVREAL_REPOS}/vivreal-hq/docs/dev-docs/05-reference/aws-estate.md` (with `05-reference/resource-to-template-map.md` and `04-operations/standalone-stacks.md`), READ THIS when debugging Lambda config issues, env var mismatches, deployment failures, or cross-function communication. A count or a name there is a pointer to re-derive from the stack, never a value to quote.

## Function rosters: count them, do not quote them
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

## Release trains (2026-08-15)

**"Merge to `main` = prod deploy" is DEAD in five repos: Vivreal_Portal_Mobile, VR_Secure_API
VR_CMS_API, VR_Main_API, VR_Client_API.** Production now deploys from the fixed `stable` branch
via a release train. Merging `main` in those repos deploys NOTHING, portal's `main` is an
Amplify build canary with no traffic; the four backends fire zero workflow runs on a `main`
push. Still deploying on push to `main` (unchanged): VR_Outreach_API, VR_Client_Auth, and
everything else.

The train is the same shape in all five repos. **Nothing ships without a dispatch.** The weekly
crons (a Friday cut, staggered Monday promotes) are retired (owners, 2026-11-04): releases are
owner-approved batches, and `promote.yml` and `release-cut.yml` rest disabled, enabled only for the
one dispatch a release step makes and disabled again in the same step (`vivreal-workflow:release-engineer`
owns that protocol and the lock). The 2026-11 batch deletes their `schedule:` lines (TD-2); until a
repo's change is on its `main`, read `on.schedule` there, because an old cron is live whenever the
workflow is enabled.
- `release-cut.yml`, dispatched, cuts `release/vX.Y` from `main`, bumps `package.json` on the line
  only, and tags `vX.Y.0`. Portal's cut also writes a served `public/release.json` marker.
- `promote.yml`, dispatched, force-with-lease moves `stable` to the newest line's tip (or the
  `target` line), a tagged cut ships as `vX.Y.0`; an untagged tip (backports landed after the cut)
  auto-mints, tags, and ships the next PATCH `vX.Y.Z+1` (since 2026-08-19; it refuses only when
  the line's last tag is yanked). The promote order is a cross-repo contract: backends ahead of
  portal.
- Incremental release / backport = PATCH, never a new minor (2026-08-19, all five repos).
  `backport.yml` cherry-picks main-merged commits onto a line (`-m 1` for PR merges) and pushes
  - no tag, no bump, no deploy. A backport ships only when `promote.yml` is dispatched with
  `target=release/vX.Y` (tags `vX.Y.Z+1`); nothing picks it up on its own. Hand-written fixes
  still go local: commit on the line, push (husky gate runs), then dispatch the promote.
  **NEVER dispatch `release-cut.yml` to ship a backport**, a cut forks a NEW minor line off
  ALL of `main` (the 2026-08-19 v2.3.1→v2.4.0 mistake).
- `rollback.yml` (dispatch-only) moves `stable` back to a prior `v*` tag and yanks it
  (`yanked-vX.Y.Z` tags stop a later promote re-deploying that version).
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

## Proving a fix reached a line: `git cherry`, never `merge-base --is-ancestor`

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

## Infrastructure stacks (workflow_dispatch: manual trigger from GitHub Actions)
| Stack | Repo Location | Workflow |
|---|---|---|
| `vivreal-websocket` | `VR_Secure_API/websocket/` | `.github/workflows/websocket.yml` |
| `Vivreal-Media-CDN` | `VR_Secure_API/cloudformation/media-cdn.yaml` | `.github/workflows/media-cdn.yml` |

## Secrets Manager (per-service `<secret-prefix>/*`: secrets-audit Phase 2, 2026-07)
**Names are written with a placeholder prefix, because this repository is PUBLIC.** Each value is a key of `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json` (names only, never values): `<secret-prefix>/` is the Secrets Manager prefix, key `secretPrefix`; `<ssm-prefix>/` the SSM parameter prefix (it has a leading slash), key `ssmPrefix`; `<qa-secret-prefix>/` the QA secret prefix, key `qaSecretPrefix`; "the QA account bundle" is key `qaAccountBundle`; the db-explorer secret is key `dbSecretId`. Read the file; nothing needs setting. To confirm a name exists, list names only: `aws secretsmanager list-secrets --query 'SecretList[].Name'`. Never write a real prefix back into this repo: its check-definitions gate fails on one.

The monolithic `hb-api-secrets` is retired. Every backend now resolves secrets at deploy time from per-service secrets (`<secret-prefix>/secure-api`, `<secret-prefix>/cms-api`, `<secret-prefix>/client-api`, `<secret-prefix>/client-auth`, `<secret-prefix>/main-api`, `<secret-prefix>/analytics`, `<secret-prefix>/oncall`, `<secret-prefix>/site-deployment`) plus shared secrets (`<secret-prefix>/{core,stripe,social-oauth,github-app,vapid}`) and non-secret config from SSM `<ssm-prefix>/*` params. Values were copied verbatim, env var names unchanged. Key categories: Database (`CLUSTER_URL`), Auth (`CLIENT_ID`, `USERPOOL_ID`), Stripe, WebSocket (`WS_ENDPOINT`, `WS_TABLE`), OAuth providers, Encryption, CDN/Media signing, Push (VAPID), Agent (Anthropic + GitHub App), Comms (Slack/Discord/SES).

## Reading and verifying a CloudFormation deploy

- **The tag read rule (F311, SW-C19): read a stack's tags before every change set, then pass them
  back or refuse.** `aws cloudformation deploy` with no `--tags` sends an empty tag list and
  REMOVES every stack tag, so each taggable resource shows an update and a reviewed preview grows
  rows nobody planned (a permissions preview came back with 7 rows instead of 5, one of three hits
  on 2026-11-14). Every supervised deploy path (a script, a runbook step, a workflow) first reads
  the tag VALUES, `aws cloudformation describe-stacks --stack-name <stack> --query 'Stacks[0].Tags'`,
  never only `length(Stacks[0].Tags)`: a count cannot tell the same keys from different ones. It
  then passes exactly that list back (`--tags Key=Value ...` on `deploy`, `--tags` on
  `create-change-set`) or refuses, printing the list it read. A stack with no tags reads `[]` and
  passes none. Compare by key and value. A tool that builds the command gets an ALLOW test (the
  stack's tags passed back unchanged) and a REFUSE test (a command built with no tags while the
  stack holds some).

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

## When to consult the Lambda inventory
- **Env var mismatch bugs**, check which functions have which vars, verify against CloudFormation fragment
- **"Function not found" errors**, get the exact function name (they have random suffixes)
- **Cross-function invokes**, `CREATE_UPDATE_COL_GROUPS_FUNCTION_NAME`, `GET_COLLECTION_INFO_FUNCTION_NAME`, `UPDATE_SITE_ENV_VARS_LAMBDA` are env vars pointing to other Lambdas
- **WebSocket issues**, 10 functions across 3 APIs have `WS_ENDPOINT` + `WS_TABLE`
- **Deployment failures**, check which stack owns the function and how it deploys
