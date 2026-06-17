# Vivreal Lambda Packaging & Deploy Conventions

The packaging/build/deploy facet of `vivreal-lambda`. (Concurrency/scaling lives in `references/scaling.md`.)

## IaC + CI/CD per repo (know which tool you're in)

| Repo | IaC | Stack name (main / dogfood) |
|---|---|---|
| VR_CMS_API | AWS SAM | `VR-CMS-API` / `VR-CMS-API-DEV` |
| VR_Secure_API | AWS SAM (fragments → generated template) | `VR-Secure-API` / `VR-Secure-API-DEV` |
| VR_Main_API | AWS SAM | `VR-Main-API` / `VR-Main-API-DEV` |
| VR_Client_API | AWS SAM (`sam-template.yaml`; `basic/` + `ecommerce/` are alternate stacks sharing `src/`) | per-template stack names |
| VR_Client_Auth | **Serverless Framework** (`serverless.yml`) — the SAM outlier | — |
| Vivreal_EventHandler | **Serverless Framework + esbuild** — SAM outlier | — (state machine pushed separately, see `vivreal-site-deploy-pipeline`) |

**CI/CD = GitHub Actions → CloudFormation, auto-deploy on push to `main` (prod) or `dogfood` (DEV).** Workflow is typically `.github/workflows/lambda_api.yml`. No manual deploy needed for a normal change — push the branch.

## VR_Secure_API template generation (its quirk)

SAM source lives in `cloudformation/` **fragments**; the deployed template `cloudYamls/allRoutes.yaml` is **generated** by `node scripts/merge-template.js` (run by `npm run build` and by CI before deploy). **Never hand-edit `allRoutes.yaml`** — edit the fragment and re-merge. `allRoutes.yaml` IS committed/tracked (CI relies on it).

## Build → package → deploy (SAM repos)

```bash
npm run build           # merge fragments (Secure) + bundle each Lambda → dist/{fn}/
aws cloudformation package --template ./...yaml --s3-bucket <bucket> ...
aws cloudformation deploy ...
```

## The three deploy gotchas (hard-won)

1. **250 MB unzipped Lambda limit.** Bundling **dev-dependencies** into the package blew this on VR_Outreach_API (deploy broke ~2 weeks). Fix: a `build:deploy` step that prunes dev-deps before packaging (`npm prune --production` or equivalent). If a deploy suddenly fails on size after adding tooling, suspect dev-deps in the artifact.
2. **51,200-byte inline CloudFormation template limit.** Once a template grows past this, an inline `aws cloudformation deploy` fails. Fix: stage the template through S3 with **`--s3-bucket <bucket>`** on `aws cloudformation package` (the standard path for the larger backends; hit during the admin-analytics deploy).
3. **arm64 Lambda layers only.** All functions are arm64 — **layers must be arm64-compatible.** An x86_64 **extension** layer (e.g. the old OTEL collector) crashes at init with `Extension.Crash` / `exec format error`. The **FFmpeg layer** (`FFMPEG_ARN` in Secrets Manager) installs no extension so it won't crash at init, but fails at runtime if the arch mismatches. Orphaned OTEL refs (`AWS_LAMBDA_EXEC_WRAPPER: /opt/otel-instrument`) in any fragment should be removed — they cause `Extension.Crash` on deploy.

## Other deploy traps seen in prod

- **A new Express route 403s post-deploy** if you forgot the matching API Gateway event in the SAM fragment — see the CMS/Secure per-repo skills' "add a route" checklists. This is a *deploy-config* miss, not a code bug. (Auth angle: `vivreal-auth-architecture`.)
- **Deploy-role IAM scoping** can block a new resource type (the deploy role's EventBridge policy was `vh-*`-only and blocked an EventBridge rule on another stack). See `vivreal-iam-secrets`.
- **Reserved-concurrency in templates** silently reverts CLI tuning on the next deploy — see `references/scaling.md`.

## Sources of truth

Each backend's `C:\repos\<repo>\CLAUDE.md` under "Deployment" / "IAM" / arm64 sections. Memory: deploy gotchas in `project_admin_analytics_integration.md`, size-limit fix in the outreach deploy entries.
