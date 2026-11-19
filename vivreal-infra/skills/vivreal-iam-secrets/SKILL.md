---
name: vivreal-iam-secrets
description: 'Use when reasoning about Vivreal IAM permissions or secrets, which managed policy a Lambda needs, why a deploy is denied (AccessDenied / deploy-role too narrow), least-privilege patterns, where roles are defined (SAM fragments with !Sub AccountId), or anything in the shared hb-api-secrets store (CTX_SECRET, GMAIL_SA_KEY_JSON, STRIPE_PORTAL_CONFIGURATION_ID, CLUSTER_URL, Cognito IDs, CloudFront signing key, FFMPEG_ARN), who reads what and the atomic-rotation traps. Triggers on: IAM policy, AccessDenied, deploy role, least privilege, managed policy, Vivreal-Client-S3-Access, Lambda-Webhook, SESCrudPolicy, Secrets Manager, hb-api-secrets, CTX_SECRET, GMAIL_SA_KEY_JSON, STRIPE_PORTAL_CONFIGURATION_ID, CLUSTER_URL, rotate secret, FromDomain cutover.'
---

# Vivreal IAM & Secrets Manager

How permissions and secrets are organized across the backends. Pairs with `vivreal-lambda` and `vivreal-auth-architecture`.

## IAM: where roles live and the pattern

- Roles/policies are defined **in the SAM fragments** per Lambda (VR_Secure_API `cloudformation/<lambda>.yaml`, VR_CMS_API fragments, etc.). SAM auto-attaches `AWSLambdaBasicExecutionRole` + `AWSXrayWriteOnlyAccess` (not listed in tables). Custom **managed** policies are attached via each function's `Policies:` block.
- **No hardcoded account IDs**, ARNs use `!Sub 'arn:aws:iam::${AWS::AccountId}:policy/...'`. Least-privilege is the intent (per-Lambda policy sets, not one god role).

### The workload permissions boundary (release B, the role safety limit)

- **What it is.** One managed policy, `Vivreal-Deploy-Workload-Boundary`, in its own vivreal-hq stack (template `packages/fleet-ops/deploy-role/cloudformation/workload-boundary.yaml`, live since BR-12, 2026-11-17). It allows everything except identity writes (`iam:Create*`, `Put*`, `Attach*` and the rest), `PassRole` outside the census roles, `AssumeRole` outside the Campaigns roles, and account, audit and key tampering (read the document in the template, never a copy). Its name sits inside `Vivreal-Deploy-*`, which the deploy role may not version, so the deploy role cannot raise its own ceiling.
- **Who carries it.** Every role a deploy-role template creates declares it (SAM `Globals.Function.PermissionsBoundary`, explicit roles, Serverless `provider.iam.role.permissionsBoundary`), each repo through its own release B `PB-<repo>` row; SAM's generated `CodeDeployServiceRole` is not reached by `Globals`, so VR_CMS_API gives CodeDeploy an explicit role. Since 2026-11-19 every repo's roles carry it: the hq roles and the repos whose runtime tier shipped first (`vivreal-infra:vivreal-lambda` lists them), then Secure (its three stacks), CMS (the explicit CodeDeploy role included), Client_Auth, Client and Main on release B's deploy day. Two roles are written outside any template, EventHandler's domain saga roles, and their deploy scripts set the boundary at creation and before every policy write.
- **What it means when you hit it.** An `AccessDenied` whose message names the boundary is a grant the boundary DENIES. Adding the action to the function's policy changes nothing; the action is one no workload should do, so the design changes, not the grant. Every `PB-` test asserts on the EXPANDED template (the SAM translator output, `serverless package` output, or the plain template), and a preview reads the processed template for the boundary ARN on every `AWS::IAM::Role`.
- **The deploy role's grants, now and final.** Since BR-12 (H-PB2) the deploy role may `PutRolePermissionsBoundary` and `DeleteRolePermissionsBoundary` on the nine role-name patterns, each only with `iam:PermissionsBoundary` equal to the boundary's ARN; Delete is what lets CloudFormation roll a `PB-` row back. At BR-36 (H-PB3, not run on 2026-11-19), after a census proves every role carries it (read with `get-account-authorization-details --filter Role`, never `list-roles`), every role-writing statement requires the boundary on `CreateRole`, `PutRolePolicy`, `AttachRolePolicy` and `PutRolePermissionsBoundary`, and `DeleteRolePermissionsBoundary` is removed. **From then on a template without the boundary cannot deploy**, so a rollback target is the prior tag plus its `PB-` commit.

### Key shared managed policies

| Policy | Grants | Attached to |
|---|---|---|
| `Lambda-Webhook` | `execute-api:ManageConnections` (WebSocket post-to-connection) + DynamoDB CRUD | CMS all several Lambdas; Secure createSites |
| `Vivreal-Client-S3-Access` | S3 get/put/list/create/delete on `arn:aws:s3:::vivreal-*` | CMS (ColObjects, HandleMedia, Integrations); Secure (createSites, getGroupInformation, updateGroup) |
| `Vivreal-Route53-Policies`, `Vivreal-Amplify-Access`, `Create-Site-State-Machine` | Route53 / Amplify / Step Functions for the deploy pipeline | Secure createSites |
| `Vivreal-Common-Cognito-Policy`, `Vivreal-Admin-Cognito-Policy` | Cognito user-pool admin ops | Secure userAndAuth, updateGroup |
| `Vivreal-Invoke-GetCollectionInfo-Policy` | `lambda:InvokeFunction` on specific GetCollectionInfo ARNs | CMS ColGroups/Integrations; Secure updateGroup |

### IAM gotchas (hard-won)

- **`Vivreal-Invoke-GetCollectionInfo-Policy` has HARDCODED Lambda ARNs** (current DEV + PROD function names). A fresh stack with new function names breaks cross-invoke until you manually update this managed policy. It also must cover the integrations-sync invoke target.
- **The deploy ROLE can be too narrow.** A deploy failed because the deploy role's EventBridge policy was scoped `vh-*` only and couldn't create an EventBridge rule on another stack (admin-analytics). When a deploy gets `AccessDenied` on a resource type, check the **deploy role's** policy, not the function role.
- **`SESCrudPolicy` is a HARD cutover on `FromDomain`.** The SES send policy is keyed to a specific from-domain; changing the outreach send domain (e.g. `send.vivreal.io` → `vivreal.io`) is a one-shot cutover, the new domain must be in the policy or sends `AccessDenied`.
- **An IAM simulation is not proof of a grant; the first real call is.** A simulation evaluates only the resource ARN and context keys you hand it. In v7 it passed twice on grants that failed for real. (1) 2026-10-17: Amplify `ListJobs` is checked against `apps/<id>/branches/<b>/jobs/*`, not the branch ARN the service reference lists; grant both. (2) 2026-10-20: ECR Public authorises `sts:GetServiceBearerToken` inside its own `GetAuthorizationToken` call without a matching `sts:AWSServiceName`, so a grant conditioned on that key simulated `allowed` and was denied at the first real login. The deploy role now grants it unconditioned, as AWS's own ECR Public managed policies do (vivreal-hq `packages/fleet-ops/deploy-role/cloudformation/deploy-role-permissions.yaml`, Sid `EcrPublicPullBearerToken`, whose comment says what bounds it instead).
- **New S3 buckets** are created locked down: `BlockPublicAcls/IgnorePublicAcls/BlockPublicPolicy/RestrictPublicBuckets: true` + a CloudFront OAC bucket policy (public read only via the CDN). See `vivreal-media-cdn`.

## Reading a secret: ask for one key, never the map

**Three credential exposures in one night came from ordinary, well-intentioned reads.** A plain
`get-secret-value`, or a `get-function-configuration` on a Lambda, prints **every** key it holds
into the transcript for the sake of the one value you wanted. Two live credentials sat in plain text
in a Lambda environment here, and a single routine read exposed both.

- Project to the single key you need. `--query 'Environment.Variables.THE_ONE_KEY'` on a function;
  for a secret, pipe `SecretString` into a parser that emits one field and nothing else.
- **Amplify reads print env values too.** `aws amplify get-app`, `get-branch`, `list-branches` and
  `list-apps` return `environmentVariables` (app and branch level) with every value in it, plus
  `basicAuthCredentials` (base64 `user:password`), and Amplify app env vars here carry tokens. Always
  pass a `--query` naming only the fields you need (`--query 'keys(app.environmentVariables)'` for
  the key list), and never print `environmentVariables` or `basicAuthCredentials`. The same holds
  for `aws lambda get-function` (`Configuration.Environment.Variables`) and `aws ssm get-parameter
  --with-decryption`.
- **Never widen it "just to see what is in there."** If you genuinely need the key list, ask for the
  keys without the values.
- **`${VAR:-default}` prints the VALUE when the variable is set**, and leaked a live token exactly
  that way. Use `${VAR:+set}`, or a length plus a short prefix, to test presence.
- A connection string is a credential. It embeds a username and password, so it goes into the
  connect call and nowhere else: not a file, not a log, not a PR.

**Two IAM ceilings this fleet has actually hit**, both of which fail a deploy rather than degrading:

- **An inline role policy has a hard size ceiling.** One deploy role reached within a couple of
  hundred bytes of it, meaning the next function anyone added was always going to fail, whoever
  added it. Most of the budget was per-function log-group ARNs. Move grants to a managed policy.
- **Managed policies attached per role are capped at 20.** One role here carries most of that
  budget, none of it in any template.

**A resource CloudFormation names for you is one the deploy role may refuse.** A grant scoped to a
capitalised name prefix failed when CloudFormation generated a lower-case auto-name. Name the
resource explicitly rather than trusting a prefix grant. This is the same trap as the queue-name
prefix grant that once killed a release.

## Secrets Manager: `hb-api-secrets` is RETIRED and DELETED, per-service stores are current
**Names are written with a placeholder prefix, because this repository is PUBLIC.** Each value is a key of `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json` (names only, never values): `<secret-prefix>/` is the Secrets Manager prefix, key `secretPrefix`; `<ssm-prefix>/` the SSM parameter prefix (it has a leading slash), key `ssmPrefix`; `<qa-secret-prefix>/` the QA secret prefix, key `qaSecretPrefix`; "the QA account bundle" is key `qaAccountBundle`; the db-explorer secret is key `dbSecretId`. Read the file; nothing needs setting. To confirm a name exists, list names only: `aws secretsmanager list-secrets --query 'SecretList[].Name'`. Never write a real prefix back into this repo: its check-definitions gate fails on one.


**`hb-api-secrets` no longer exists.** Secrets Phase 2 (2026-07) moved every key below out of that one shared secret into per-service secrets (`<secret-prefix>/cms-api`, `<secret-prefix>/client-api`, `<secret-prefix>/secure-api`, `<secret-prefix>/main-api`, `<secret-prefix>/client-auth`, `<secret-prefix>/analytics`, `<secret-prefix>/oncall`, `<secret-prefix>/site-deployment`, `<secret-prefix>/outreach`) plus shared secrets (`<secret-prefix>/{core,stripe,social-oauth,github-app,vapid}`) and non-secret SSM config under `<ssm-prefix>/*`; env var names were kept unchanged. `hb-api-secrets` itself was briefly recreated with 56 placeholder-only values on 2026-09-15 to unblock a DEV-stack CloudFormation deletion, then deleted again immediately with no recovery window. It is gone, not just unused. The table below names which **category** of secret holds each key today; read the per-repo `*-knowledge` skill for the exact secret id.

| Secret | Read by | Notes / trap |
|---|---|---|
| `CTX_SECRET` | **Portal (sign)** + VR_Outreach_API (verify) + VR_Secure_API getGroupInformation (admin gate), from `<secret-prefix>/core` | **ATOMIC ROTATION**, mismatch → 401 "Invalid active context" everywhere. Rotate all consumers together. See `vivreal-auth-architecture`. |
| `CLUSTER_URL` | ALL backends, each from its OWN `<secret-prefix>/<service>` secret (no path, no query string) | Nine service secrets, plus Outreach's second URI, still share ONE Atlas services user (unnamed here, not verified); domain-search has its own read-only user. Per-service database users are a proposed, unstarted owner decision. Rotating the shared user is coordinated across all nine. See `vivreal-atlas-topology`. |
| `CLIENT_ID`, `USERPOOL_ID` | Cognito backends | Cognito app client + user pool. |
| `GMAIL_SA_KEY_JSON` | VR_Outreach_API | Domain-wide-delegated service-account key for the Gmail send-copy (`outreach-sent-copy@…`, `gmail.insert` + `gmail.readonly`). |
| `STRIPE_PORTAL_CONFIGURATION_ID` | VR_Secure_API BillingAndSubscription | Optional `bpc_...` ID that disables Stripe portal plan-switching (forces tier changes through the preflight). Absent → Stripe default config. Bootstrap is a manual one-time script. |
| `GITHUB_TOKEN`, `STATE_MACHINE_ID`, `WS_ENDPOINT`, `WS_TABLE`, `FFMPEG_ARN` | Secure createSites / CMS / media Lambdas | Deploy-pipeline + WebSocket + FFmpeg-layer wiring. |
| `CLOUDFRONT_SIGNING_KEY_PAIR_ID`, `CLOUDFRONT_SIGNING_PRIVATE_KEY` | VR_Client_API | CloudFront signed-URL key pair. See `vivreal-media-cdn`. |
| `ADMIN_EMAILS` | Secure getGroupInformation; Outreach | Global-admin allowlist for admin bypass + attribution/email gates. |

### Known secrets tech debt
- **Stripe live API key is hardcoded** in 4 VR_Secure_API billing files, should move to Secrets Manager.

## Traps around secrets, keys and accounts

- **The Atlas "Add New Database User" dialog shows the password in a plain textbox,** so an
  accessibility snapshot or a screenshot of it prints the secret. Never snapshot that dialog.
- **The Campaigns AWS account is an Organizations member.** Inspect it by assuming the
  organization access role from the main account. Its account id is key `campaignsAccountId` of
  `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json`, never written here.
- **Some resources are deliberately outside CloudFormation:** the per-service secrets above and the
  Route 53 hosted zones are never adopted into a stack, and one SES setting has no CloudFormation
  form at all, so a change there changes the mechanism rather than adopting the resource.
- **Rotating `ENCRYPTION_KEY` is a migration, not a config change.** There is no keyring and no
  re-encryption path, so every encrypted credential becomes unreadable at once.
- **A `GetSecretValue` right after `PutSecretValue` can return the PREVIOUS version.** A failed
  read-back is not a failed write: read by the `VersionId` the put returned.
- **SESv2 `SendBulkEmail` authorizes against the legacy action `ses:SendBulkTemplatedEmail`.**
  Granting `ses:SendBulkEmail` alone answers 403 naming an action you never wrote.
- **A Stripe TEST secret key for the platform billing account exists,** as key
  `STRIPE_PLATFORM_SECRET_KEY_TEST` of `<secret-prefix>/stripe-connect-oauth` (a key name, never
  its value). The agents' own Stripe test keys are restricted merchant keys that cannot read the
  platform account.
- **A test-mode tool refuses to run unless its key IS a test key** (release B review, NEW CLASS).
  A secret can hold the live key and the test key side by side (`<secret-prefix>/stripe-connect-oauth`
  does), so one wrong field name, a `|| <live key>` fallback, or a reuse of a service's
  mode-switching loader turns a test script into a write on the live account, whose events then
  reach the production webhook. The tool reads exactly the one field it names, never prints or logs
  it, and makes no provider call unless the value carries the test prefix (`sk_test_` for Stripe,
  the check VR_Secure_API's `stripeConnectConfig.js` makes). Pair a REFUSE test (a live-shaped
  value, zero provider calls) with an ALLOW test, and have every object it creates read back
  `livemode: false`.
- **The Dependabot alert reads use their own token,** `<secret-prefix>/github-dependabot-read`: a
  fine-grained, read-only GitHub token for the whole org (Dependabot alerts, Contents for lockfile
  reads, Metadata). Editing a fine-grained token's permissions keeps its value, and GitHub asks
  for a "Confirm access" step first. It expires: check the date before a long-lived job leans on it.

## Sources of truth

The "IAM Policies" + "Environment Variables" sections of each backend `CLAUDE.md`.
