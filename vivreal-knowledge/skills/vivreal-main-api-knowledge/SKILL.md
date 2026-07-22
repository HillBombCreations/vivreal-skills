---
name: vivreal-main-api-knowledge
description: Use when working in VR_Main_API — Vivreal's public/unauthenticated backend (NEXT_PUBLIC_MAIN_API) for user auth/signup, login/SSO, password reset, the demo-account claim flow, transactional + lifecycle email (welcome, activation nudges, usage-quota nags), Meta deauthorize/data-deletion callbacks, and unsubscribe. Covers its three-Lambda shape (Express + EmailConsumer + LifecycleScan), the sendTemplatedEmail→SQS→SES spine, the suppressions/emailEvents idempotency model, deriveDbKey at login, the tier-quota gates at login/signup, and the `leads` collection it owns. Triggers on: VR_Main_API, Main API, login, signup, register, password reset, SSO, claim account, claim token, welcome email, activation nudge, lifecycle email, usage nag, sendTemplatedEmail, unsubscribe, suppressions, emailEvents, leads collection, deriveDbKey, tier quotas. Source of truth: C:\repos\VR_Main_API\CLAUDE.md (refreshed 2026-07-21 — current as of this sync).
---

# VR_Main_API — knowledge digest

Last synced: 2026-07-21

The public-facing API: the **only unauthenticated-flow backend** (login, register, password reset, claim, email). Maps to `NEXT_PUBLIC_MAIN_API`. Express + serverless-express on Lambda (Node 20, arm64), JavaScript, MongoDB + DynamoDB (WebSockets), Cognito, SAM. Read `C:\repos\VR_Main_API\CLAUDE.md` for the full route list (CLAUDE.md refreshed 2026-07-21 — current as of this sync).

## Architecture — THREE Lambdas now

`ExpressLambdaFunction` (the monolith app), `EmailConsumerFunction` (SQS consumer that does the actual SES sends), `LifecycleScanFunction` (hourly EventBridge cron). Layout: `app.js` / `lambda.js` / `socket.js`, then `hbcreations/{api,services,models,scripts,config}` + `services/email/`, `emailConsumer/`, `lifecycleScan/`. (`src/stripe/` is long gone — no Stripe product routes here anymore.)

## Routes (highlights)

- Auth: `POST /api/user` (signup), `/api/user/login`, `/api/user/loginSSO`, `/api/user/signUserOut`, `/api/user/verifyEmail`, `/api/user/requestPasswordReset`, `/api/user/resetPassword`, `GET /api/user/checkRegisterValue`.
- Demo-account claim (public — the token IS the auth): `POST /api/claim/verify` + `POST /api/claim/complete` (`services/claim/` — `verifyClaim`, `completeClaim`, `hashToken`, `changeClaimEmail`). Verify is **POST-only, reading `req.body.token`** — the 7-day claim token is an account-takeover credential that leaked into Sentry `request.url`/query_string/fetch-span `http.query` via the old GET `?token=`; GET was removed with NO alias. Claim email-change is rejected when another Cognito user holds that email, and **fails closed** when ListUsers truncates.
- Meta compliance: `POST /api/user/deauthorize/:provider`, `POST /api/user/data-deletion/:provider`, `GET /api/user/data-deletion/status` (bypass `handleHBRoutes`, scoped urlencoded parsers). Deauthorize/data-deletion now purge the tenant's Platform Data, match users by app-scoped user id, and replay requests that previously answered `no_data`.
- Email: `/api/sendContactUsEmail`, `/api/sendSupportEmail`, etc.; `GET/POST /api/unsubscribe` (RFC 8058 one-click, HMAC token via `UNSUBSCRIBE_SECRET`).
- The portal proxies only `user/login` + `user/ssoLogin` here (both manual cookie-setting routes).

## The templated-email spine

- ONE send entry point: `sendTemplatedEmail()` → template registry + shared layout → `queueEmail()` (SQS `vivreal-email-queue`) → EmailConsumerFunction sends via SES. LifecycleScan never sends directly — enqueue only. (Bypasses the legacy `sendEmailService.js`, which hardcodes `from` and drops `replyTo`.)
- Two categories: **transactional** (`Vivreal <hello@vivreal.io>`, config set `vivreal-transactional`, always sends — includes the `welcome` email fired on first verify/SSO login) vs **lifecycle** (`"Sam from Vivreal" <sam@mail.vivreal.io>`, replyTo hello@, config set `vivreal-lifecycle`, gated ONLY on the `suppressions` collection — NOT on the dormant `sendUpdates` flag).
- Lifecycle rules: `activation-nudge-24h` live; `what-publish-does` (+3d), `connect-a-channel` (+7d), `checkin-and-help` (+14d) gated behind `LIFECYCLE_ACTIVE_RULES` until SES warmup. Hourly scan, 2h-wide rule windows, dedupe makes overlapping passes no-ops. Deterministic holdout via sha256(email) mod 100 < `LIFECYCLE_HOLDOUT_PERCENT` (default 10).
- NEW **group-scoped quota-nag templates** `usage-near-quota` + `usage-over-quota` (registered in `templates/index.js`), fired by lifecycleScan's `runUsageNagScan` — free-tier only, dedupe on (groupID, level, month), behind `LIFECYCLE_ACTIVE_RULES` (OFF by default). They greet by **groupName, not firstName**. The existing nudges above are untouched.
- Idempotency is claim-first: `emailEvents` row (unique partial index on `dedupeKey` = `templateId:email`) inserted BEFORE enqueue; enqueue failure rolls back the claim.
- **No SNS bounce/complaint fan-out** — it was added then removed to unblock deploys; config sets have reputation metrics only and `emailEvents.sesMessageId` stays null. (Re-add gotcha: each config-set event destination needs a unique CloudFormation name.)

## Patterns

- **Handler → Service → Model.** API layer Joi-validates, calls service, sets `req.resData = {status, response}`. `handleHBRoutes()` connects DB, runs handler, catches errors. 500s never leak stack traces.
- Auth flow: signup → Cognito `SignUpCommand` → verify → login returns JWTs. Login (standard + SSO) mints `ctxPayload.dbKey` via **`deriveDbKey(activeGroup)`**: enterprise → slugified groupName, free/basic/pro → `general_shared`, proplus → `pro_plus`, fallback `group.database`. **Copied VERBATIM from `VR_Secure_API/src/shared/deriveDbKey.js` — the two copies must be kept in sync.**
- Models: `inquiries`, `groups` (now from `@hillbombcreations/schemas` ^1.22.0), `leads`, `emailEvents`, `suppressions`, `dataDeletionRequests`, claim tokens (`claimTokenSchema`).
- **Quota gates (`@hillbombcreations/tier-quotas` ^3.0.0)**: `handleSettingUpGroups` (login bootstrap) serializes entries/seats/apiCalls/cdnBytes from `getTierQuotas(tier)`. `addUserToGroup` + `checkRegisterValue` (signup seat gate) check **package seats with a >0 sentinel guard** — a bare `>=` against enterprise `seats: -1` would block every join. **Stored-value-wins** for seat/entry quotas (grandfathering) with tier-default fallback; api/cdn quotas are package-authoritative. `isUnlimitedQuota` v3 = `value < 0` and needs its `=== 0` guard so free-tier `agentActions: 0` doesn't divide-to-Infinity into a spurious over-quota nag.
- **Owns the `leads` collection** in mainDb `Vivreal`. Lifecycle fields `activated`/`activatedAt` are written CROSS-SERVICE by VR_CMS_API (first content create) and VR_Secure_API (site launch); join key = lowercased email. Beware: Mongoose setters don't apply to query filters — lowercase emails yourself in filters.

## Gotchas

- **CORS is wide open** (`callback(null, true)`) — intentional for the public API.
- `maxPoolSize=10` here vs 3 in Secure/CMS — should be reduced to match.
- **Secrets Phase 2 is done**: all three Lambdas resolve config via CloudFormation dynamic references from `vivreal/prod/main-api` + `vivreal/prod/stripe` + `vivreal/prod/social-oauth` (Secrets Manager) and SSM `/vivreal/prod/*` — **any `hb-api-secrets` reference is now wrong**. The old hardcoded Stripe live key (`createUserService.js`/`checkUserExistsEmail.js`) and repo-root `googleAppJSON.json` are gone.
- `helathCheckFns.js` (sic) — typo filename; don't rename without fixing imports.
- arm64-only Lambda layers (x86_64 extension → `Extension.Crash`).
- Coverage gate: 100% lines/statements/functions, 85% branches.
