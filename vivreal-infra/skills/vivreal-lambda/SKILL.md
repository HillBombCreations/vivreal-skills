---
name: vivreal-lambda
description: Use for anything about the Vivreal backend Lambdas at the AWS level — packaging/building/deploying them (failed deploy, "package too large", "template too large", adding a layer, arm64-layer crash, CI/CD, serverless-express/Node/Pino/X-Ray) OR concurrency/scaling/capacity (throttling/429s, "decreases unreserved below 100", reserved-concurrency values, "can we handle N users", the Mongo-connection ceiling). Routes you to references/deploy.md for packaging+deploy and references/scaling.md for concurrency+capacity. Covers all backends — SAM (VR_CMS_API/VR_Secure_API/VR_Main_API/VR_Client_API) and the Serverless-Framework outliers (VR_Client_Auth, Vivreal_EventHandler). Triggers on: deploy lambda, build:deploy, package too large, template too large, --s3-bucket, lambda layer, arm64 layer crash, Extension.Crash, FFmpeg layer, serverless-express, SAM deploy, GitHub Actions deploy, dogfood, Node 20, Pino, X-Ray, reserved concurrency, ReservedConcurrentExecutions, UnreservedConcurrentExecution, lambda throttling, 429, concurrency limit, scaling ceiling, put-function-concurrency, can we handle X users, Little's Law.
---

# Vivreal Backend Lambdas — Deploy & Scaling

Cross-cutting Lambda knowledge shared by all Vivreal backends. For repo-internal route/service details, see the per-repo `*-knowledge` skills (`vivreal-knowledge` plugin). This skill is the AWS plumbing those repos share. It has two facets — read the one your task needs:

- **Packaging, building, deploying** (deploy failures, layers, CI/CD, the runtime conventions) → read **`references/deploy.md`**.
- **Concurrency, scaling, throttling, capacity planning** (reserved concurrency, the "below 100" failure, the real ceiling) → read **`references/scaling.md`**.

## The shared shape (all backends) — quick facts

- **Express.js wrapped in `@codegenie/serverless-express`** (older docs say `serverless-express`), deployed as AWS Lambda behind API Gateway.
- **Node.js 20.x, arm64 (Graviton2)**, 1024 MB, 30s timeout, X-Ray on every function. (Exception: `VR_Client_Auth` is Node 18.x — see `vivreal-client-stack-knowledge`.)
- **Pino structured logging + AWS X-Ray.** Use the two-arg pino form `logger.info(obj, 'event_name')` — single-arg drops the message body (also a Sentry-ingestion regression signal; see `sentry-tracer`).
- **Secrets from AWS Secrets Manager `hb-api-secrets`** injected at deploy/runtime — see `vivreal-iam-secrets`.
- **CI/CD = GitHub Actions → CloudFormation, auto-deploy on push to `main` (prod) or `dogfood` (DEV).** No manual deploy for a normal change — push the branch.

## IaC tool per repo (know which one you're in)

| Repo | IaC |
|---|---|
| VR_CMS_API, VR_Main_API, VR_Client_API | AWS SAM |
| VR_Secure_API | AWS SAM (fragments → generated `cloudYamls/allRoutes.yaml`) |
| VR_Client_Auth | **Serverless Framework** (`serverless.yml`) |
| Vivreal_EventHandler | **Serverless Framework + esbuild** (state machine pushed separately — see `vivreal-site-deploy-pipeline`) |

## Companions

`vivreal-iam-secrets` (deploy-role + secrets), `vivreal-atlas-topology` (the Mongo-connection ceiling that scaling defers to), `vivreal-auth-architecture` (the 403-on-new-route deploy-config miss). Sources of truth: each backend's `C:\repos\<repo>\CLAUDE.md`; memory `project_lambda_concurrency_reallocation.md`, `project_admin_analytics_integration.md`.
