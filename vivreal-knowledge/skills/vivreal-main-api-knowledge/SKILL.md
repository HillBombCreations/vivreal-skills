---
name: vivreal-main-api-knowledge
description: Use when working in VR_Main_API — Vivreal's public/unauthenticated backend (NEXT_PUBLIC_MAIN_API) for user auth/signup, login/SSO, password reset, the demo-account claim flow, transactional + lifecycle email (welcome, activation nudges, usage-quota nags), Meta deauthorize/data-deletion callbacks, and unsubscribe. Covers its four-Lambda shape (Express + EmailConsumer + LifecycleScan + NotificationConsumer), the sendTemplatedEmail→SQS→SES spine, the suppressions/emailEvents idempotency model, deriveDbKey at login, the tier-quota gates at login/signup, and the `leads` collection it owns. Triggers on: VR_Main_API, Main API, login, signup, register, password reset, SSO, claim account, claim token, welcome email, activation nudge, lifecycle email, usage nag, sendTemplatedEmail, unsubscribe, suppressions, emailEvents, leads collection, deriveDbKey, tier quotas. Source of truth: C:\repos\VR_Main_API\CLAUDE.md (refreshed 2026-07-21 — current as of this sync).
---

# VR_Main_API — knowledge digest

Last synced: 2026-08-15

The public-facing API: the **only unauthenticated-flow backend** (login, register, password reset, claim, email). Maps to `NEXT_PUBLIC_MAIN_API`. Express + serverless-express on Lambda (Node 20, arm64), JavaScript, MongoDB + DynamoDB (WebSockets), Cognito, SAM. Read `C:\repos\VR_Main_API\CLAUDE.md` for the full route list (CLAUDE.md refreshed 2026-07-21 — current as of this sync).

## Architecture — FOUR Lambdas now

`ExpressLambdaFunction` (the monolith app), `EmailConsumerFunction` (SQS consumer that does the actual SES sends), `LifecycleScanFunction` (hourly EventBridge cron — now THREE independent guarded passes: the lead-age RULES drips, `runUsageNagScan`, and the billing-rules scanner), and `NotificationConsumerFunction` (NEW — `notificationConsumer.handler`, 256MB/30s, reserved concurrency 5; consumes `vivreal-notification-queue`, SQS batch-size-1, CFN-owned in THIS repo with its DLQ, queue URL exported for the cross-repo SSM handoff; resolves `pushsubscriptions`/`pushpreferences` against the main Vivreal DB via its own connection `src/notificationConsumer/db.js` — deliberately not `hbcreations/scripts/db.js`; sends web-push via VAPID. Ported from VR_Secure_API's `sendPushToGroup` with a fix: the original's inline `.catch()` made every send report fulfilled regardless of outcome. First producer: EventHandler's `markSiteLive`). Layout: `app.js` / `lambda.js` / `socket.js`, then `hbcreations/{api,services,models,scripts,config}` + `services/email/`, `emailConsumer/`, `lifecycleScan/`. (`src/stripe/` is long gone — no Stripe product routes here anymore.)

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
- **Billing-rules scanner (Phase 1)** — a THIRD engine in `LifecycleScanFunction`, because the leads RULES loop selects by `createdAt` age and dedupes on `templateId:email` permanently while billing events recur. Each billing rule supplies `episodeKey(group)`; dedupe key = `templateId:groupID:episodeKey`, so a new episode re-arms with no cron-side reset. **NO Stripe SDK in this Lambda by design** — every field read (`subscriptionStatus`, `subscriptionCadence`, `currentPeriodEnd`, `cancellation.*`) is written onto the group doc by VR_Secure_API's webhook handlers; if those stop firing, the rules go quiet rather than sending something wrong.
- **Phase 3 billing rules**: `cancel-confirmed` (in-app cancellations, sent BEFORE access lapses, carries the access-until date + undo; mutually exclusive with `subscription-cancelled-confirm` by construction; episode = `cancellation.requestedAt`, which `reactivateSubscription` nulls, so cancel→reactivate→cancel re-arms); `win-back-30d` (ONE email 30–60 days after access ended, free tier only, body matched to the exit-survey reason, the 60-day upper bound doubles as a first-run blast guard; `cancellation.feedback` is deliberately never merged into an email — only the survey KEY reaches the template); `annual-renewal-reminder` (CA ARL advance notice, 30-day lead, excludes already-cancelled plans, never held out — legal obligation; the renewal amount is wired into the notice). **Holdout policy:** account-state + legally-required emails opt out of holdout; only win-back permits a holdout arm.
- Idempotency is claim-first: `emailEvents` row (unique partial index on `dedupeKey` = `templateId:email`) inserted BEFORE enqueue; enqueue failure rolls back the claim.
- **No SNS bounce/complaint fan-out** — it was added then removed to unblock deploys; config sets have reputation metrics only and `emailEvents.sesMessageId` stays null. (Re-add gotcha: each config-set event destination needs a unique CloudFormation name.)

## Patterns

- **Handler → Service → Model.** API layer Joi-validates, calls service, sets `req.resData = {status, response}`. `handleHBRoutes()` connects DB, runs handler, catches errors. 500s never leak stack traces.
- Auth flow: signup → Cognito `SignUpCommand` → verify → login returns JWTs. Login (standard + SSO) mints `ctxPayload.dbKey` via **`deriveDbKey(activeGroup)`** — sticky dbKey Phase 5: it PREFERS the persisted `group.dbKey`; the tier mapping (enterprise → slugified groupName, free/basic/pro → `general_shared`, proplus → `pro_plus`, fallback `group.database`) is only for un-backfilled docs. The login group projection AND the Meta deletion projection now carry `dbKey` (a projection missing it silently falls through to the tier mapping). **Copied VERBATIM from `VR_Secure_API/src/shared/deriveDbKey.js` — the two copies must be kept in sync.**
- **featureFlags now returned in the login group payload** — it was missing from `handleSettingUpGroups`' per-group whitelist, so `AuthContext.groups` arrived with `featureFlags` undefined on every login and every client-side gate evaluated false (`useAgentAccess` — the AI assistant was invisible to EVERY group, including Mongo-enabled ones; the Group-page toggle only appeared to work because it patched AuthContext in-session). Both projections fixed (`userLoginService` + `userLoginSSO`).
- Models: `inquiries`, `groups` (now from `@hillbombcreations/schemas` ^1.29.0), `leads`, `emailEvents`, `suppressions`, `dataDeletionRequests`, claim tokens (`claimTokenSchema`).
- **Quota gates (`@hillbombcreations/tier-quotas` ^3.0.0)**: `handleSettingUpGroups` (login bootstrap) serializes entries/seats/apiCalls/cdnBytes from `getTierQuotas(tier)`. `addUserToGroup` + `checkRegisterValue` (signup seat gate) check **package seats with a >0 sentinel guard** — a bare `>=` against enterprise `seats: -1` would block every join. **Stored-value-wins** for seat/entry quotas (grandfathering) with tier-default fallback; api/cdn quotas are package-authoritative. `isUnlimitedQuota` v3 = `value < 0` and needs its `=== 0` guard so free-tier `agentActions: 0` doesn't divide-to-Infinity into a spurious over-quota nag.
- **Owns the `leads` collection** in mainDb `Vivreal`. Lifecycle fields `activated`/`activatedAt` are written CROSS-SERVICE by VR_CMS_API (first content create) and VR_Secure_API (site launch); join key = lowercased email. Beware: Mongoose setters don't apply to query filters — lowercase emails yourself in filters.

## Gotchas

- **CORS is wide open** (`callback(null, true)`) — intentional for the public API.
- `maxPoolSize=10` here vs 3 in Secure/CMS — should be reduced to match.
- **Secrets Phase 2 is done**: all four Lambdas resolve config via CloudFormation dynamic references from `vivreal/prod/main-api` + `vivreal/prod/stripe` + `vivreal/prod/social-oauth` (Secrets Manager) and SSM `/vivreal/prod/*` — **any `hb-api-secrets` reference is now wrong**. The old hardcoded Stripe live key (`createUserService.js`/`checkUserExistsEmail.js`) and repo-root `googleAppJSON.json` are gone.
- `helathCheckFns.js` (sic) — typo filename; don't rename without fixing imports.
- arm64-only Lambda layers (x86_64 extension → `Extension.Crash`).
- Coverage gate: 100% lines/statements/functions, 85% branches.
- **errorHandler forwards `err.code`** as `errorCode` on non-5xx responses. Error bodies here are **bare JSON strings**, not the standard `{success,data}` envelope — the portal's manual `user/login` route now unwraps them via `extractUpstreamError()`/`extractUpstreamDetail()` (login error branches like badUsername/incorrectPassword were DEAD in prod before this).
- **Two auth bypasses closed**: quota seat gates now DENY on a 0-seat quota instead of admitting everyone (was fail-open); the Meta callback auth gate's prototype-key bypass is closed (`provider='toString'` used to resolve to `Object.prototype.toString`).
- ESLint adopted + a husky pre-push gate with a coverage ratchet — no GitHub Actions test workflow exists here, so the hook is the only automated gate before merge.
- ⚠️ **Tests can send REAL emails** — `queueEmail` is not stubbed in the test suite; never run the full suite against a prod `.env` (this has fired ~140 real sends before). Never copy a prod `.env` into a backend test worktree.
- The consolidated prod-bug punch list (portal + all backends, fixed vs still-open) lives at `Vivreal_Portal_Mobile/docs/projects/portal-frontend-testing-strategy/prod-bugs-found.md`.

## Deploy model — release train (2026-08-15)

Merging to `main` no longer deploys prod. Prod serves from the fixed `stable` branch. Friday
5pm PST `release-cut.yml` cuts `release/vX.Y` from `main` and tags it; Monday **15:30 UTC**
`promote.yml` force-with-lease moves `stable` to the newest tag — Secure (15:00) and CMS (15:15)
promote first, then Main, then Client (15:45) and portal (16:00). Incremental
release (2026-08-19): a backport mints a PATCH of the line's last tag, never a new minor.
`backport.yml` cherry-picks main-merged commits onto the line — no tag, no bump, no deploy; ship
now by dispatching `promote.yml` with `target=release/vX.Y` (tags `vX.Y.Z+1`), or do nothing and
Monday's cron auto-mints the patch and ships it (the cron refuses only when the line's last tag
is yanked). Never dispatch `release-cut.yml` for a backport — a cut forks a new minor off ALL of
`main`. Rollback (`rollback.yml`, dispatch-only)
moves `stable` back to a prior tag and yanks it — **but a force-push that REWINDS `stable` to an
ancestor fires NO GitHub Actions push run** (forward re-points do fire), so rollback must ALSO
manually dispatch `gh workflow run lambda_api.yml --ref stable` or the old build keeps serving.
Full runbook: this repo's `docs/RELEASE.md`.
