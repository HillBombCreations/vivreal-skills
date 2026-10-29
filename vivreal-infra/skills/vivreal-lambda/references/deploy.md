# Vivreal Lambda Packaging & Deploy Conventions

The packaging/build/deploy facet of `vivreal-lambda`. (Concurrency/scaling lives in `references/scaling.md`.)

## IaC + CI/CD per repo (know which tool you're in)

| Repo | IaC | Stack name (main / dogfood) |
|---|---|---|
| VR_CMS_API | AWS SAM | `VR-CMS-API` / `VR-CMS-API-DEV` (**deleted 2026-09-15**, so a `dogfood` push would try to rebuild it from scratch, not redeploy it) |
| VR_Secure_API | AWS SAM (fragments → generated template) | `VR-Secure-API` / `VR-Secure-API-DEV` (**deleted 2026-09-15**, same caveat) |
| VR_Main_API | AWS SAM | `VR-Main-API` / `VR-Main-API-DEV` (**kept for now**, it owns the production email queue with no `DeletionPolicy`; deletion is pending a queue-rescue PR, spec `atlas-connection-fixes-2026-09-15` section 13.3) |
| VR_Client_API | AWS SAM (`sam-template.yaml`; `basic/` + `ecommerce/` are alternate stacks sharing `src/`) | per-template stack names; its own `-DEV` stack was also **deleted 2026-09-15** |
| VR_Client_Auth | **Serverless Framework** (`serverless.yml`), the SAM outlier | No separate DEV stack. `serverless deploy` with no `--stage` landed on stage `dev`, which IS the production authorizer (`VRClientAuthorizer-dev-function1`). A `dogfood` push here redeploys PRODUCTION, not a sandbox. |
| Vivreal_EventHandler | **Serverless Framework + esbuild**, SAM outlier | (state machine pushed separately, see `vivreal-site-deploy-pipeline`) |

**None of the `dogfood` triggers above are removed yet.** That's a separate, still-pending PR per repo (spec `atlas-connection-fixes-2026-09-15` section 13.4, covering CMS, Client API, Secure, Main, Outreach, Client Auth and both MCP server repos). Until each lands, don't push to `dogfood` in any of these repos: for CMS/Secure/Client API it tries to rebuild a deleted stack, and for Client Auth it redeploys production from whatever the stale `dogfood` branch (`c81686c`, 2026-03-12) contains.

**CI/CD = GitHub Actions → CloudFormation.** Workflow is typically `.github/workflows/lambda_api.yml`. VR_Client_Auth and Vivreal_EventHandler still auto-deploy prod on push to `main`, no manual deploy needed, push the branch. **VR_CMS_API, VR_Secure_API, VR_Main_API, and VR_Client_API do NOT**, since 2026-08-15 those four ship via a release train: `lambda_api.yml`'s prod trigger is push to the `stable` branch, which only moves on a staggered Monday `promote.yml` cron or a manual promote dispatch (`target=release/vX.Y`), and since 2026-08-19 the cron auto-mints a patch tag when backports landed on the line, reaching a line via each repo's `backport.yml` (PATCH semantics; never a new cut). A push to `main` in those repos fires zero prod workflow runs; the stack names above still apply, just on the new trigger. Full runbook: each repo's `docs/RELEASE.md`.

## The release train, the one copy every expert and digest points at

The four backends above and `Vivreal_Portal_Mobile` share one model. Experts and knowledge digests carry a one-line
pointer here instead of their own copy (ten copies drifted apart before this section existed).

- **Prod serves `stable`.** `release-cut.yml` cuts `release/vX.Y` from `main` and tags it (Saturday 01:00 UTC, which is
  Friday evening Pacific). `promote.yml` force-with-lease moves `stable` to the newest tag on a Monday cron. The crons
  are staggered and the stagger is a cross-repo contract (CMS first, then Secure, Main, Client API, portal last): read
  the `cron:` line in each repo's `promote.yml` rather than a copied time.
- **A backport is a PATCH, never a new minor.** `backport.yml` cherry-picks a main-merged commit onto the line (no tag,
  no bump, no deploy). Ship it now by dispatching `promote.yml` with `target=release/vX.Y`, or the Monday cron mints the
  patch and ships it (it refuses only when the line's last tag is yanked). Never dispatch `release-cut.yml` for a
  backport: a cut forks a new minor off ALL of `main`.
- **Before an owner's GO, a backport or a merge to `main` is a scheduled deploy**, because the Monday cron ships
  whatever is on the line (the batch-release rule lives in `vivreal-workflow:release-engineer`).
- **Rollback** (`rollback.yml`, dispatch only) moves `stable` back and yanks the tag, but a force-push that REWINDS
  `stable` fires no push-triggered run, so also run `gh workflow run lambda_api.yml --ref stable` or the old build keeps
  serving. The portal has its own `rollback.yml`; read it before using it.
- **Not on the train:** Vivreal_EventHandler, VR_Client_Auth, VR_Outreach_API and VR-MCP-Server deploy on push to
  `main`, and Vivreal_Templates promotes with its own `promote-stable` workflow (see `vivreal-site-deploy-pipeline`).

## VR_Secure_API template generation (its quirk)

SAM source lives in `cloudformation/` **fragments**; the deployed template `cloudYamls/allRoutes.yaml` is **generated** by `node scripts/merge-template.js` (run by `npm run build` and by CI before deploy). **Never hand-edit `allRoutes.yaml`**, edit the fragment and re-merge. Since 2026-10-13 the merge also generates the API body and one Lambda permission per function (see the resource-policy cap below), so the fragments keep their `Events:` but the deployed template has no per-route permissions. `allRoutes.yaml` IS committed/tracked (CI relies on it).

## Build → package → deploy (SAM repos)

```bash
npm run build           # merge fragments (Secure) + bundle each Lambda → dist/{fn}/
aws cloudformation package --template ./...yaml --s3-bucket <bucket> ...
aws cloudformation deploy ...
```

## The three deploy gotchas (hard-won)

1. **250 MB unzipped Lambda limit.** Bundling **dev-dependencies** into the package blew this on VR_Outreach_API (deploy broke ~2 weeks). Fix: a `build:deploy` step that prunes dev-deps before packaging (`npm prune --production` or equivalent). If a deploy suddenly fails on size after adding tooling, suspect dev-deps in the artifact.
2. **51,200-byte inline CloudFormation template limit.** Once a template grows past this, an inline `aws cloudformation deploy` fails. Fix: stage the template through S3 with **`--s3-bucket <bucket>`** on `aws cloudformation package` (the standard path for the larger backends; hit during the admin-analytics deploy).
3. **arm64 Lambda layers only.** All functions are arm64, **layers must be arm64-compatible.** An x86_64 **extension** layer (e.g. the old OTEL collector) crashes at init with `Extension.Crash` / `exec format error`. The **FFmpeg layer** (`FFMPEG_ARN` in Secrets Manager) installs no extension so it won't crash at init, but fails at runtime if the arch mismatches. Orphaned OTEL refs (`AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-instrument`) in any fragment should be removed, they cause `Extension.Crash` on deploy.

## Other deploy traps seen in prod

- **A new Express route fails post-deploy if you forgot its API Gateway event.** CMS, Secure, and Client API all wire **one explicit per-route event, there is no catch-all `{proxy+}` integration**, so an Express route with no matching event in the SAM fragment is unreachable at the gateway and falls through to the default IAM-protected resource. Symptom varies by repo: **CMS → 403** (SigV4/IAM; the Cognito authorizer never fires), **Secure → 502**, **Client → edge reject**. Add the event in the `cloudformation/` fragment (Client: `sam-template.yaml`); never hand-edit the generated `allRoutes.yaml`. ***Main API is exempt***, its routes are public flows with no gateway authorizer, so there's no auth gate to fall through to. This is a *deploy-config* miss, not a code bug, see the CMS/Secure/Client per-repo skills' "add a route" checklists. (Auth angle: `vivreal-auth-architecture`.)
- **The per-function resource-policy cap (20,480 bytes) fills one route at a time.** SAM emits one `AWS::Lambda::Permission` per `Api` event (no setting merges them; overriding the logical id raises `DuplicateLogicalIdException`), so a function behind many routes adds a statement per route until a deploy fails "The final policy size (N) is bigger than the limit (20480)" and rolls back. VR_Secure_API's UpdateGroupFunction hit it on the v5 release's first Secure deploy (#343, 2026-10-13); `scripts/merge-template.js` now generates one API-wide permission per function at build time. CloudFormation adds the new permission before it removes the old ones, so the cutover peak is old plus new (UpdateGroup's projected peak was about 11 bytes under the cap), and Lambda counts more bytes than the compact JSON shows. Read the alias policy before adding routes: `aws lambda get-policy --function-name <fn> --qualifier live --query Policy --output text`.
- **A metric filter on a log group created in the same deploy needs `DependsOn`.** `LogGroupName: !Sub '/aws/lambda/${Fn}'` makes the filter depend on the function, not on the `AWS::Logs::LogGroup`, so CloudFormation may create the filter first: "The specified log group does not exist", then rollback (Secure v2.21.2). Add `DependsOn: <LogGroup>` and sweep for any new resource that names a same-deploy resource by a constructed string rather than `!Ref`/`!GetAtt`. Secure holds this with `test/unit/templateLogGroupDependencies.test.js`.
- **Deploy-role IAM scoping** can block a new resource type (the deploy role's EventBridge policy was `vh-*`-only and blocked an EventBridge rule on another stack). See `vivreal-iam-secrets`.
- **Reserved-concurrency in templates** silently reverts CLI tuning on the next deploy, see `references/scaling.md`.

## Sources of truth

Each backend's `${VIVREAL_REPOS}/<repo>/CLAUDE.md` under "Deployment" / "IAM" / arm64 sections. Memory: deploy gotchas in `project_admin_analytics_integration.md`, size-limit fix in the outreach deploy entries.
