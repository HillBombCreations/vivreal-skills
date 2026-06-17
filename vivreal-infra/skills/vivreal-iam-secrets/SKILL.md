---
name: vivreal-iam-secrets
description: Use when reasoning about Vivreal IAM permissions or secrets — which managed policy a Lambda needs, why a deploy is denied (AccessDenied / deploy-role too narrow), least-privilege patterns, where roles are defined (SAM fragments with !Sub AccountId), or anything in the shared hb-api-secrets store (CTX_SECRET, GMAIL_SA_KEY_JSON, STRIPE_PORTAL_CONFIGURATION_ID, CLUSTER_URL, Cognito IDs, CloudFront signing key, FFMPEG_ARN) — who reads what and the atomic-rotation traps. Triggers on: IAM policy, AccessDenied, deploy role, least privilege, managed policy, Vivreal-Client-S3-Access, Lambda-Webhook, SESCrudPolicy, Secrets Manager, hb-api-secrets, CTX_SECRET, GMAIL_SA_KEY_JSON, STRIPE_PORTAL_CONFIGURATION_ID, CLUSTER_URL, rotate secret, FromDomain cutover.
---

# Vivreal IAM & Secrets Manager

How permissions and secrets are organized across the backends. Pairs with `vivreal-lambda` and `vivreal-auth-architecture`.

## IAM — where roles live and the pattern

- Roles/policies are defined **in the SAM fragments** per Lambda (VR_Secure_API `cloudformation/<lambda>.yaml`, VR_CMS_API fragments, etc.). SAM auto-attaches `AWSLambdaBasicExecutionRole` + `AWSXrayWriteOnlyAccess` (not listed in tables). Custom **managed** policies are attached via each function's `Policies:` block.
- **No hardcoded account IDs** — ARNs use `!Sub 'arn:aws:iam::${AWS::AccountId}:policy/...'`. Least-privilege is the intent (per-Lambda policy sets, not one god role).

### Key shared managed policies

| Policy | Grants | Attached to |
|---|---|---|
| `Lambda-Webhook` | `execute-api:ManageConnections` (WebSocket post-to-connection) + DynamoDB CRUD | CMS all 5 Lambdas; Secure createSites |
| `Vivreal-Client-S3-Access` | S3 get/put/list/create/delete on `arn:aws:s3:::vivreal-*` | CMS (ColObjects, HandleMedia, Integrations); Secure (createSites, getGroupInformation, updateGroup) |
| `Vivreal-Route53-Policies`, `Vivreal-Amplify-Access`, `Create-Site-State-Machine` | Route53 / Amplify / Step Functions for the deploy pipeline | Secure createSites |
| `Vivreal-Common-Cognito-Policy`, `Vivreal-Admin-Cognito-Policy` | Cognito user-pool admin ops | Secure userAndAuth, updateGroup |
| `Vivreal-Invoke-GetCollectionInfo-Policy` | `lambda:InvokeFunction` on specific GetCollectionInfo ARNs | CMS ColGroups/Integrations; Secure updateGroup |

### IAM gotchas (hard-won)

- **`Vivreal-Invoke-GetCollectionInfo-Policy` has HARDCODED Lambda ARNs** (current DEV + PROD function names). A fresh stack with new function names breaks cross-invoke until you manually update this managed policy. It also must cover the integrations-sync invoke target.
- **The deploy ROLE can be too narrow.** A deploy failed because the deploy role's EventBridge policy was scoped `vh-*` only and couldn't create an EventBridge rule on another stack (admin-analytics). When a deploy gets `AccessDenied` on a resource type, check the **deploy role's** policy, not the function role.
- **`SESCrudPolicy` is a HARD cutover on `FromDomain`.** The SES send policy is keyed to a specific from-domain; changing the outreach send domain (e.g. `send.vivreal.io` → `vivreal.io`) is a one-shot cutover — the new domain must be in the policy or sends `AccessDenied`.
- **New S3 buckets** are created locked down: `BlockPublicAcls/IgnorePublicAcls/BlockPublicPolicy/RestrictPublicBuckets: true` + a CloudFront OAC bucket policy (public read only via the CDN). See `vivreal-media-cdn`.

## Secrets Manager — `hb-api-secrets` (the shared store)

**One secret, `hb-api-secrets`, holds the cross-backend config.** Injected into Lambdas at deploy/runtime; portal reads its own subset via env. Key entries and who reads them:

| Secret | Read by | Notes / trap |
|---|---|---|
| `CTX_SECRET` | **Portal (sign)** + VR_Outreach_API (verify) + VR_Secure_API getGroupInformation (admin gate) | **ATOMIC ROTATION** — mismatch → 401 "Invalid active context" everywhere. Rotate all consumers together. See `vivreal-auth-architecture`. |
| `CLUSTER_URL` | ALL backends | The shared MongoDB Atlas mongodb+srv string (user `justinceccarelli`). Rotating = coordinated (update secret → all backends re-read). See `vivreal-atlas-topology`. |
| `CLIENT_ID`, `USERPOOL_ID` | Cognito backends | Cognito app client + user pool. |
| `GMAIL_SA_KEY_JSON` | VR_Outreach_API | Domain-wide-delegated service-account key for the Gmail send-copy (`outreach-sent-copy@…`, `gmail.insert` + `gmail.readonly`). |
| `STRIPE_PORTAL_CONFIGURATION_ID` | VR_Secure_API BillingAndSubscription | Optional `bpc_...` ID that disables Stripe portal plan-switching (forces tier changes through the preflight). Absent → Stripe default config. Bootstrap is a manual one-time script. |
| `GITHUB_TOKEN`, `STATE_MACHINE_ID`, `WS_ENDPOINT`, `WS_TABLE`, `FFMPEG_ARN` | Secure createSites / CMS / media Lambdas | Deploy-pipeline + WebSocket + FFmpeg-layer wiring. |
| `CLOUDFRONT_SIGNING_KEY_PAIR_ID`, `CLOUDFRONT_SIGNING_PRIVATE_KEY` | VR_Client_API | CloudFront signed-URL key pair. See `vivreal-media-cdn`. |
| `ADMIN_EMAILS` | Secure getGroupInformation; Outreach | Global-admin allowlist for admin bypass + attribution/email gates. |

### Known secrets tech debt
- **Stripe live API key is hardcoded** in 4 VR_Secure_API billing files — should move to Secrets Manager.

## Sources of truth

The "IAM Policies" + "Environment Variables" sections of each backend `CLAUDE.md`. Memory: `project_admin_analytics_integration.md` (deploy-role gotcha), the outreach send-domain entries (SESCrudPolicy + GMAIL_SA_KEY_JSON), `project_db_connection_gold_standard.md` (CLUSTER_URL rotation).
