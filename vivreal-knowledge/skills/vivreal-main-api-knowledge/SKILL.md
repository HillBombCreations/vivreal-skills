---
name: vivreal-main-api-knowledge
description: Use when working in VR_Main_API — Vivreal's public/unauthenticated backend (NEXT_PUBLIC_MAIN_API) for user auth/signup, login/SSO, password reset, transactional + lifecycle email (welcome, activation nudges), Meta deauthorize/data-deletion callbacks, and unsubscribe. Covers its three-Lambda shape (Express + EmailConsumer + LifecycleScan), the sendTemplatedEmail→SQS→SES spine, the suppressions/emailEvents idempotency model, deriveDbKey at login, and the `leads` collection it owns. Triggers on: VR_Main_API, Main API, login, signup, register, password reset, SSO, welcome email, activation nudge, lifecycle email, sendTemplatedEmail, unsubscribe, suppressions, emailEvents, leads collection, deriveDbKey. Source of truth: C:\repos\VR_Main_API\CLAUDE.md.
---

# VR_Main_API — knowledge digest

Last synced: 2026-07-13

The public-facing API: the **only unauthenticated-flow backend** (login, register, password reset, email). Maps to `NEXT_PUBLIC_MAIN_API`. Express + serverless-express on Lambda (Node 20, arm64), JavaScript, MongoDB + DynamoDB (WebSockets), Cognito, SAM. Read `C:\repos\VR_Main_API\CLAUDE.md` for the full route list.

## Architecture — THREE Lambdas now

`ExpressLambdaFunction` (the monolith app), `EmailConsumerFunction` (SQS consumer that does the actual SES sends), `LifecycleScanFunction` (hourly EventBridge cron). Layout: `app.js` / `lambda.js` / `socket.js`, then `hbcreations/{api,services,models,scripts,config}` + `services/email/`, `emailConsumer/`, `lifecycleScan/`. (`src/stripe/` is long gone — no Stripe product routes here anymore.)

## Routes (highlights)

- Auth: `POST /api/user` (signup), `/api/user/login`, `/api/user/loginSSO`, `/api/user/signUserOut`, `/api/user/verifyEmail`, `/api/user/requestPasswordReset`, `/api/user/resetPassword`, `GET /api/user/checkRegisterValue`.
- Meta compliance: `POST /api/user/deauthorize/:provider`, `POST /api/user/data-deletion/:provider`, `GET /api/user/data-deletion/status` (bypass `handleHBRoutes`, scoped urlencoded parsers).
- Email: `/api/sendContactUsEmail`, `/api/sendSupportEmail`, etc.; `GET/POST /api/unsubscribe` (RFC 8058 one-click, HMAC token via `UNSUBSCRIBE_SECRET`).
- The portal proxies only `user/login` + `user/ssoLogin` here (both manual cookie-setting routes).

## The templated-email spine

- ONE send entry point: `sendTemplatedEmail()` → template registry + shared layout → `queueEmail()` (SQS `vivreal-email-queue`) → EmailConsumerFunction sends via SES. LifecycleScan never sends directly — enqueue only. (Bypasses the legacy `sendEmailService.js`, which hardcodes `from` and drops `replyTo`.)
- Two categories: **transactional** (`Vivreal <hello@vivreal.io>`, config set `vivreal-transactional`, always sends — includes the `welcome` email fired on first verify/SSO login) vs **lifecycle** (`"Sam from Vivreal" <sam@mail.vivreal.io>`, replyTo hello@, config set `vivreal-lifecycle`, gated ONLY on the `suppressions` collection — NOT on the dormant `sendUpdates` flag).
- Lifecycle rules: `activation-nudge-24h` live; `what-publish-does` (+3d), `connect-a-channel` (+7d), `checkin-and-help` (+14d) gated behind `LIFECYCLE_ACTIVE_RULES` until SES warmup. Hourly scan, 2h-wide rule windows, dedupe makes overlapping passes no-ops. Deterministic holdout via sha256(email) mod 100 < `LIFECYCLE_HOLDOUT_PERCENT` (default 10).
- Idempotency is claim-first: `emailEvents` row (unique partial index on `dedupeKey` = `templateId:email`) inserted BEFORE enqueue; enqueue failure rolls back the claim.
- **No SNS bounce/complaint fan-out** — it was added then removed to unblock deploys; config sets have reputation metrics only and `emailEvents.sesMessageId` stays null. (Re-add gotcha: each config-set event destination needs a unique CloudFormation name.)

## Patterns

- **Handler → Service → Model.** API layer Joi-validates, calls service, sets `req.resData = {status, response}`. `handleHBRoutes()` connects DB, runs handler, catches errors. 500s never leak stack traces.
- Auth flow: signup → Cognito `SignUpCommand` → verify → login returns JWTs. Login (standard + SSO) mints `ctxPayload.dbKey` via **`deriveDbKey(activeGroup)`**: enterprise → slugified groupName, free/basic/pro → `general_shared`, proplus → `pro_plus`, fallback `group.database`. **Copied VERBATIM from `VR_Secure_API/src/shared/deriveDbKey.js` — the two copies must be kept in sync.**
- Models: `inquiries`, `groups` (now from `@hillbombcreations/schemas`), `leads`, `emailEvents`, `suppressions`, `dataDeletionRequests`.
- **Owns the `leads` collection** in mainDb `Vivreal`. Lifecycle fields `activated`/`activatedAt` are written CROSS-SERVICE by VR_CMS_API (first content create) and VR_Secure_API (site launch); join key = lowercased email. Beware: Mongoose setters don't apply to query filters — lowercase emails yourself in filters.

## Gotchas

- **CORS is wide open** (`callback(null, true)`) — intentional for the public API.
- `maxPoolSize=10` here vs 3 in Secure/CMS — should be reduced to match.
- Stripe live key hardcoded in `createUserService.js` + `checkUserExistsEmail.js`; `googleAppJSON.json` at repo root — both should move to Secrets Manager.
- `helathCheckFns.js` (sic) — typo filename; don't rename without fixing imports.
- arm64-only Lambda layers (x86_64 extension → `Extension.Crash`).
- Coverage gate: 100% lines/statements/functions, 85% branches.
