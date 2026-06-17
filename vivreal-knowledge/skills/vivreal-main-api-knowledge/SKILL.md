---
name: vivreal-main-api-knowledge
description: Use when working in VR_Main_API — Vivreal's public/unauthenticated backend (NEXT_PUBLIC_MAIN_API) for user auth/signup, login/SSO, password reset, transactional + outreach email, Slack/Discord notifications, and Stripe product creation. Covers its single-monolith-Lambda shape, the handler→service→model pattern, Cognito auth flow, and the `leads` collection it owns. Triggers on: VR_Main_API, Main API, login, signup, register, password reset, SSO, sendOutreachEmail, Slack/Discord, Stripe product, leads collection. Source of truth: C:\repos\VR_Main_API\CLAUDE.md.
---

# VR_Main_API — knowledge digest

The public-facing API: the **only unauthenticated-flow backend** (login, register, password reset, email). Maps to `NEXT_PUBLIC_MAIN_API`. Express + serverless-express on Lambda (Node 20, arm64), JavaScript, MongoDB + DynamoDB (WebSockets), Cognito, SAM. Read `C:\repos\VR_Main_API\CLAUDE.md` for the full route list.

## Architecture — single monolith Lambda

Unlike Secure/CMS (multi-Lambda), this is one Express app, all routes in one function. Layout: `app.js` / `lambda.js` / `socket.js`, then `hbcreations/{api,services,models,scripts,config}`, `crypto/` (bcrypt), `stripe/`.

## Routes (highlights)

- Auth: `POST /api/user` (signup), `/api/user/login`, `/api/user/loginSSO`, `/api/user/signUserOut`, `/api/user/verifyEmail`, `/api/user/requestPasswordReset`, `/api/user/resetPassword`, `GET /api/user/checkRegisterValue`.
- Email: `/api/sendOutreachEmail`, `/api/sendContactUsEmail`, `/api/sendSupportEmail`, `/api/sendMeetingInviteEmail`.
- Notifications: `/api/socials/messageSlack`, `/api/socials/messageDiscord`.
- Stripe: `POST|PUT /stripe/product`, `POST /stripe/checkout`.
- The portal proxies only `user/login` + `user/ssoLogin` here (both manual cookie-setting routes).

## Patterns

- **Handler → Service → Model.** API layer Joi-validates, calls service, sets `req.resData = {status, response}`. `handleHBRoutes()` connects DB, runs handler, catches errors. 500s never leak stack traces.
- Auth flow: signup → Cognito `SignUpCommand` (verification email) → verify → login returns JWTs (frontend stores in cookies).
- MongoDB lazy singleton; DynamoDB for WebSocket connection tracking. Models: `inquiries`, `groups`, `leads`.
- **Owns the `leads` collection** in mainDb `Vivreal` (written here; VR_Secure_API reads a read-only mirror for the admin attribution endpoint).

## Gotchas

- **CORS is wide open** (`callback(null, true)`) — intentional for the public API. No per-route auth here (handled by frontend proxy / API Gateway elsewhere).
- `maxPoolSize=10` here vs 3 in Secure/CMS — should be reduced to match.
- Stripe live key hardcoded in `createUserService.js` + `checkUserExistsEmail.js`; `googleAppJSON.json` at repo root — both should move to Secrets Manager.
- `helathCheckFns.js` (sic) — typo filename; don't rename without fixing imports.
- arm64-only Lambda layers (x86_64 extension → `Extension.Crash`).
- Coverage gate: 100% lines/statements/functions, 85% branches.
