---
name: vivreal-auth-architecture
description: Use when reasoning about how requests are authenticated across the Vivreal stack — API Gateway authorizers, AWS Cognito JWT verification, the API-key Lambda authorizer (VR_Client_Auth) on the public content API, or the portal's own active_ctx / token cookie model and the CTX_SECRET HMAC. Clarifies the BOUNDARY between portal-side context signing and API-Gateway-side authorization (two different auth systems people conflate). Use when debugging 401/403s, "Invalid active context", authorizer context fields (database/groupID/bucketName), or where claims come from. Triggers on: Cognito, aws-jwt-verify, API Gateway authorizer, Lambda authorizer, VR_Client_Auth, API key auth, active_ctx, user_ctx, CTX_SECRET, token cookie, Invalid active context, 401, 403, authorizer context, requestContext.authorizer, JWT claims.
---

# Vivreal Auth Architecture (cross-stack)

There are **two distinct auth systems** in Vivreal. Conflating them is the #1 auth confusion. This skill draws the boundary. For the multi-tenant key fields themselves see `vivreal-db` / `vivreal-atlas-topology`.

## System 1 — API Gateway authorization (server-to-server, at the edge)

Each backend's API Gateway authorizes EVERY request before the Lambda runs. Two flavors:

| Backend(s) | Authorizer | How |
|---|---|---|
| VR_Main_API, VR_Secure_API, VR_CMS_API | **AWS Cognito JWT** via API Gateway authorizer | Caller sends the Cognito JWT (`token`). API Gateway validates it. Claims land at `req?.apiGateway?.event?.requestContext?.authorizer?.claims`. Some routes are `Auth: NONE` (Stripe webhooks validate a signature instead; a few token-based group routes). |
| VR_Client_API (public site delivery) | **API-key custom Lambda authorizer = `VR_Client_Auth`** (NO Cognito) | Caller sends the group's API key in the `Authorization` header. `VR_Client_Auth` does `groups.findOne({ apiKey: token })` against mainDb, returns an Allow/Deny IAM policy + **injected tenant context**. |

`aws-jwt-verify` is the library used for Cognito JWT verification. Cognito config (`CLIENT_ID`, `USERPOOL_ID`) comes from `hb-api-secrets`.

### VR_Client_Auth injected context (read on every Client API request)

On Allow, the authorizer injects context the downstream Lambda reads via `req.apiGateway.event.requestContext.authorizer`:
`database` (`general_shared` | `pro_plus` — tier-based DB routing), `bucketName` (S3 slug), `groupID` (`_id`), plus `frozen` (read by `frozenCheck` middleware to block over-quota/cancelled groups). VR_Client_Auth is the **only** backend on Serverless Framework + Node 18; it reads only the main `Vivreal` DB.

## System 2 — the portal's signed-context cookies (browser ↔ portal)

Separate from API Gateway. The portal (Next.js) issues two cookies:

| Cookie | What | Verified by |
|---|---|---|
| `token` | The Cognito JWT | Forwarded to backends; checked for presence by `src/proxy.ts` (redirect to `/login` if absent). |
| `active_ctx` | A **portal-signed** JWT carrying `{ groupID, dbKey, bucketname, ... }` (the active group/profile) | `verifyCtxEdge()` (HMAC-SHA256) in the portal's edge proxy routes, using `CTX_SECRET`. |

The portal also signs a `user_ctx`; for the outreach API the gmail/email routes forward `user_ctx` as the `x-user-ctx` header because `active_ctx` carries no email.

## THE BOUNDARY (don't conflate)

- **API Gateway authorizers** (Cognito / API-key) gate access to the **backend Lambdas**. They produce `requestContext.authorizer` context.
- **`active_ctx`/`CTX_SECRET`** is a **portal-internal** mechanism for "which group is active" — it is signed and verified by the **portal** (and re-verified by VR_Outreach_API and VR_Secure_API's admin attribution gate, which read the SAME `CTX_SECRET` from `hb-api-secrets`).
- The backends behind Cognito do NOT verify `active_ctx`; they read Cognito claims + the `key`/`groupID` query params the portal passes. VR_Client_API uses neither — purely the API key.

## CTX_SECRET — the shared HMAC (atomic-rotation trap)

`CTX_SECRET` MUST be **identical** between the portal (env) and every service that verifies portal-signed tokens (VR_Outreach_API; VR_Secure_API `getGroupInformation` admin gate), via `hb-api-secrets`. **Rotating one without the others → 401 "Invalid active context" on every request** to that service. Rotate atomically across all consumers. See `vivreal-iam-secrets`.

## Debugging 401/403

- **403 on a brand-new route** → API Gateway has no event for it (missing SAM fragment), so the authorizer never fires. Deploy-config miss, not auth. See `vivreal-lambda`.
- **401 "Invalid active context"** → `CTX_SECRET` mismatch between portal and the verifying service.
- **401 to a backend** in the portal → a proxy route used native `fetch()` instead of `createAuthAxios()` (only the latter redirects on 401) — portal concern, see `vivreal-portal-knowledge`.
- **Client API Deny** → API key not found in `groups.apiKey`, or key regenerated. Check mainDb `groups`.

## Sources of truth

`VR_Client_Auth/CLAUDE.md`, the Auth sections of `VR_Main_API` / `VR_Secure_API` / `VR_CMS_API` / `VR_Client_API` CLAUDE.md, and the portal CLAUDE.md "Auth Flow" + "Key Fields in active_ctx" sections.
