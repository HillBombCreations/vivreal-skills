---
name: vivreal-auth-architecture
description: 'Use when reasoning about how requests are authenticated across the Vivreal stack, API Gateway authorizers, AWS Cognito JWT verification, the API-key Lambda authorizer (VR_Client_Auth) on the public content API, or the portal''s own active_ctx / token cookie model and the CTX_SECRET HMAC. Clarifies the BOUNDARY between portal-side context signing and API-Gateway-side authorization (two different auth systems people conflate). Use when debugging 401/403s, "Invalid active context", authorizer context fields (database/groupID/bucketName), or where claims come from. Triggers on: Cognito, aws-jwt-verify, API Gateway authorizer, Lambda authorizer, VR_Client_Auth, API key auth, active_ctx, user_ctx, CTX_SECRET, token cookie, Invalid active context, 401, 403, authorizer context, requestContext.authorizer, JWT claims.'
---

# Vivreal Auth Architecture (cross-stack)

There are **two distinct auth systems** in Vivreal. Conflating them is the #1 auth confusion. This skill draws the boundary. For the multi-tenant key fields themselves see `vivreal-db` / `vivreal-atlas-topology`.

## System 1: API Gateway authorization (server-to-server: at the edge)

Each backend's API Gateway authorizes EVERY request before the Lambda runs. Two flavors:

| Backend(s) | Authorizer | How |
|---|---|---|
| VR_Main_API, VR_Secure_API, VR_CMS_API | **AWS Cognito JWT** via API Gateway authorizer | Caller sends the Cognito JWT (`token`). API Gateway validates it. Claims land at `req?.apiGateway?.event?.requestContext?.authorizer?.claims`. Some routes are `Auth: NONE` (Stripe webhooks validate a signature instead; a few token-based group routes). |
| VR_Client_API (public site delivery) | **API-key custom Lambda authorizer = `VR_Client_Auth`** (NO Cognito) | Caller sends the group's API key in the `Authorization` header. `VR_Client_Auth` does `groups.findOne({ apiKey: token })` against mainDb, returns an Allow/Deny IAM policy + **injected tenant context**. |

`aws-jwt-verify` is the library used for Cognito JWT verification. Cognito config (`CLIENT_ID`, `USERPOOL_ID`) comes from SSM (`<ssm-prefix>/shared/cognito-client-id`, `<ssm-prefix>/shared/cognito-userpool-id`), not from the retired `hb-api-secrets`.

**An HTTP API JWT authorizer names ONE issuer and cannot be widened;** a REST
`COGNITO_USER_POOLS` authorizer takes a list of pools. Two user pools behind one HTTP API need two
authorizers, or a REST API.

### VR_Client_Auth injected context (read on every Client API request)

On Allow, the authorizer injects context the downstream Lambda reads via `req.apiGateway.event.requestContext.authorizer`:
`database` (the STORED placement on the group, resolved by `resolvePlacement(group)` from `@hillbombcreations/tenant-db/placement`, which throws rather than guessing. The old tier ladder is deleted, and it was dangerous rather than untidy: a tier CHANGE silently re-pointed a live group at a different database, and two services disagreeing about one tier could route one group two ways), `bucketName` (S3 slug), `groupID` (`_id`), plus `frozen` (read by `frozenCheck` middleware to block over-quota/cancelled groups). VR_Client_Auth is the **only** backend on Serverless Framework + Node 18; it reads only the main `Vivreal` DB.

## System 2: the portal's signed-context cookies (browser ↔ portal)

Separate from API Gateway. The portal (Next.js) issues two cookies:

| Cookie | What | Verified by |
|---|---|---|
| `token` | The Cognito JWT | Forwarded to backends; checked for presence by `src/proxy.ts` (redirect to `/login` if absent). |
| `active_ctx` | A **portal-signed** JWT carrying `{ groupID, dbKey, bucketname... }` (the active group/profile) | `verifyCtxEdge()` (HMAC-SHA256) in the portal's edge proxy routes, using `CTX_SECRET`. |

The portal also signs a `user_ctx`; for the outreach API the gmail/email routes forward `user_ctx` as the `x-user-ctx` header because `active_ctx` carries no email.

## THE BOUNDARY (don't conflate)

- **API Gateway authorizers** (Cognito / API-key) gate access to the **backend Lambdas**. They produce `requestContext.authorizer` context.
- **`active_ctx`/`CTX_SECRET`** is a **portal-internal** mechanism for "which group is active". **Since 2026-09-27 (H6006/H6007) ctx tokens are audience-bound and the cookie never leaves the portal.** Each audience (`portal`, `secure`, `cms`, `outreach`, `main`, `mcp`, `client`) has a key DERIVED from the root, `HMAC(CTX_SECRET, 'vivreal/ctx/v2/<audience>')`; the cookie is minted for `portal`, and the portal's proxy mints a fresh short-lived token for the one upstream it is calling (audience resolved from the route's `baseUrl`). VR_Outreach_API and VR_Secure_API's admin gate verify with their OWN derived key and require `aud` (and `exp`). The root still lives in Secrets Manager `<secret-prefix>/core`, not the deleted `hb-api-secrets`. A derived key does not defend against a compromised root; it means a token for one service is not a token for another.
- The backends behind Cognito do NOT verify `active_ctx`; they read Cognito claims + the `key`/`groupID` query params the portal passes. VR_Client_API uses neither, purely the API key.

## CTX_SECRET: the shared HMAC (atomic-rotation trap)

The ROOT `CTX_SECRET` MUST be **identical** between the portal (env) and every service that verifies portal-minted tokens (VR_Outreach_API; VR_Secure_API's admin gate), because each derives its key from it, via Secrets Manager `<secret-prefix>/core` (the old shared `hb-api-secrets` store is retired and fully deleted, see `vivreal-iam-secrets`). **Rotating one without the others → 401 "Invalid active context" on every request** to that service. Rotate atomically across all consumers. See `vivreal-iam-secrets`.

## System 3: how a person signs in, and the emailed sign-in code (release B)

Every product sign-in goes through VR_Main_API: the portal's password form, Google and LinkedIn
through the portal's own SSO routes, and, since VR-MCP-Server `0fd5ae6` (2026-10-10), the Vivreal AI
connection, whose `/oauth/authorize` sends a person to the portal's `/login`. Since release B (Main
v2.20.0) Main can hold a risky password sign-in for an emailed code (`202 { challenge: 'EMAIL_CODE',
challengeId }`, finished by `POST /api/user/login/code`); the mechanism and its mode lever are
`vivreal-knowledge:vivreal-main-api-knowledge`, "Release B".

**The code covers only the sign-ins Main sees.** Secure and CMS accept an ID token from any app
client in the user pool, so any other way into the pool that accepts a password yields a session
that never met the code. Before saying which ways in are open, read the live app client with a
names-only query, for example
`aws cognito-idp describe-user-pool-client --user-pool-id <id> --client-id <id> --query 'UserPoolClient.{Flows:ExplicitAuthFlows,Providers:SupportedIdentityProviders}'`;
never run it without `--query`, because its default answer carries the client secret. The current
state of each way in, and when each closes, lives in the private vivreal-hq release plan, never in
this public repository.

## Release C: PKCE and state on sign-in, and Client Auth's error rule (read at the release C approved heads, not yet deployed)

- **Google and LinkedIn sign-in carry a trip** (portal F494, Main F191): the portal's `/api/sso/[provider]` keeps a
  fresh `state` and a PKCE verifier in an httpOnly `__Host-vr_sso_<state>` cookie; its `user/ssoLogin` route refuses
  400 `ssoStateMismatch` before calling Main when the trip is missing or differs, so the code is never spent, and
  sends `codeVerifier`, which Main forwards to Cognito. Main holds a brand new Register trip for its business name
  (202 `BUSINESS_NAME`) only when `codeVerifier` is present. **Rollback order: the portal before Main.** The AI
  connection's and the Outreach MCP's Cognito app clients offer Google and LinkedIn only (F502).
- **Client Auth: a database error is thrown, never a Deny** (CA-1, CA-2): one retry of a transient error, then a
  throw, so API Gateway answers 500 and caches nothing for the 60 s result TTL; a missing token, an unknown key and an
  unroutable placement still Deny, and no error returns an Allow. A 403 on a valid key during Atlas maintenance was a
  cached Deny before this (`vivreal-knowledge:vivreal-client-stack-knowledge`).

## Debugging 401/403

- **403 (CMS) / 502 (Secure) on a brand-new route** → API Gateway does not know the route. None of CMS, Secure or Client has a catch-all `{proxy+}`, so an unknown path never reaches Express, it falls through to the default IAM-protected resource and the Cognito authorizer never fires. The CMS 403 is SigV4/IAM on that fall-through resource, *not* an auth bug. Fix, CMS (since CMS #266): declare the path and method in the API's route list, `cloudformation/base.yaml` `ExpressApi.DefinitionBody.paths`, with an explicit `security`; never a SAM `Type: Api` event and never a new permission (each function has ONE, scoped to the API's prod stage, so console Test Invoke is refused). Fix, Secure and Client: add the per-route event in the `cloudformation/` fragment or `sam-template.yaml`. Never hand-edit a generated `allRoutes.yaml`. Deploy-config miss; the full CMS checklist is in `vivreal-cms-api-knowledge`. (Main API is exempt, public routes, no gateway authorizer.) See `vivreal-lambda`.
- **401 "Invalid active context"** → root `CTX_SECRET` mismatch between portal and the verifying service, OR a token minted for the wrong audience (a raw portal cookie forwarded by a hand-written route, or a hand-minted test token without the service's `aud`), OR a token with no `exp`.
- **401 to a backend** in the portal → a proxy route used native `fetch()` instead of `createAuthAxios()` (only the latter redirects on 401), portal concern, see `vivreal-portal-knowledge`.
- **Client API Deny** → API key not found in `groups.apiKey`, or key regenerated. Check mainDb `groups`.

## Sources of truth

`VR_Client_Auth/CLAUDE.md`, the Auth sections of `VR_Main_API` / `VR_Secure_API` / `VR_CMS_API` / `VR_Client_API` CLAUDE.md, and the portal CLAUDE.md "Auth Flow" + "Key Fields in active_ctx" sections.
