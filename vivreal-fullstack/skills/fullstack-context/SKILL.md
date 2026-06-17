---
name: fullstack-context
description: Auto-triggers when the user mentions a backend endpoint, API route, cross-repo feature, or any Vivreal backend service (VR_Main_API, VR_Secure_API, VR_CMS_API, VR_Client_API, EventHandler). Loads relevant cross-repo context so Claude can reason about the full stack.
version: 1.1.0
---

# Vivreal Fullstack Context Loader

When this skill activates, you have context about a cross-repo concern. Before answering, load the relevant CLAUDE.md files and code from the affected repos.

## Repo Map

| Repo | Path | CLAUDE.md | Purpose |
|---|---|---|---|
| Vivreal Portal (frontend) | `C:\repos\Vivreal_Portal_Mobile` | `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` | Next.js 16 portal — proxy routes, components, auth |
| VR_Main_API | `C:\repos\VR_Main_API` | `C:\repos\VR_Main_API\CLAUDE.md` | Auth, signup, email, Slack/Discord, Stripe products |
| VR_Secure_API | `C:\repos\VR_Secure_API` | `C:\repos\VR_Secure_API\CLAUDE.md` | Group mgmt, site creation, billing, profile switching |
| VR_CMS_API | `C:\repos\VR_CMS_API` | `C:\repos\VR_CMS_API\CLAUDE.md` | Collections, objects, integrations, media, audit, versioning |
| VR_Client_API | `C:\repos\VR_Client_API` | `C:\repos\VR_Client_API\CLAUDE.md` | Public content delivery API for end-user sites |
| VR_Client_Auth | `C:\repos\VR_Client_Auth` | `C:\repos\VR_Client_Auth\CLAUDE.md` | Lambda authorizer for Client API |
| Vivreal_EventHandler | `C:\repos\Vivreal_EventHandler` | `C:\repos\Vivreal_EventHandler\CLAUDE.md` | Step Functions site deployment pipeline |
| Vivreal_Templates | `C:\repos\Vivreal_Templates` | `C:\repos\Vivreal_Templates\CLAUDE.md` | Site templates (each branch = one template) |
| VR-MCP-Server | `C:\repos\VR-MCP-Server` | `C:\repos\VR-MCP-Server\CLAUDE.md` | OAuth 2.1 MCP server (~40 CMS tools) |
| Vivreal-Schemas | `C:\repos\Vivreal-Schemas` | N/A | Shared Mongoose schemas (12 schemas, npm package `@hillbombcreations/schemas`) |

## Upstream URL Mapping

| Env Var | Backend | Route prefix in backend | dbKey param name | Proxy routes that use it |
|---|---|---|---|---|
| `NEXT_PUBLIC_MAIN_API` | VR_Main_API | `/api/*`, `/stripe/*` | N/A (no tenant routing) | `user/*`, `push/*` |
| `NEXT_PUBLIC_SECURE_URL` | VR_Secure_API | `/api/*` | `dbKey` | `group/*`, `sites/*`, `dash/*`, `webhooks/*`, `agent/*` |
| `NEXT_PUBLIC_CMS_URL` | VR_CMS_API | `/tenant/*` | `key` | `collections/*`, `collectionObjects/*`, `integrations/*`, `get-media`, `uploadFiles`, `calendar/*`, `audit`, `versions/*`, `activity`, `search/*` |

## Portal Proxy Layer (76 routes total)

- **57 factory routes** use `createProxyHandler()` — handles auth, CSRF, body parsing, upstream fetch, response envelope
- **19 manual routes** — cookie-setting routes, complex transforms, custom validation
- All routes: `export const runtime = 'edge'` + `export const dynamic = 'force-dynamic'`
- Response envelope: `{ success: true, data, error: null }` or `{ success: false, data: null, error: "msg" }`
- `createAuthAxios()` on the client automatically unwraps this envelope — components receive `res.data` = inner `data`
- `injectCtxParams(params, ctx)` sets `key` and `groupID` on query params (designed for CMS API)
- For Secure API routes, also manually add `p.set('dbKey', ctx.dbKey)` since Secure reads `dbKey` not `key`

## Backend Architecture Comparison

| Aspect | VR_CMS_API | VR_Secure_API | VR_Main_API |
|---|---|---|---|
| Lambdas | 5 (getCollectionInfo, createAndUpdateColObjects, createAndUpdateColGroups, handleMedia, createAndUpdateIntegrations) | 6+ (userAndAuth, billingAndSubscription, createAndJoinGroup, createSites, getGroupInformation, updateGroup, agent, webhookDelivery) | 1 monolithic |
| Handler wrapper | `handleTenantRoutes` | `handleHBRoutes` | `handleHBRoutes` |
| dbKey from | `req.query.key` | `req.query.dbKey` | N/A |
| API Gateway auth | Cognito authorizer | Cognito authorizer (some routes Authorizer: NONE) | None (unauthenticated API) |
| Response pattern | `req.resData = { status, response }` | `req.resData = { status, response }` | `req.resData = { status, response }` |
| Schemas | `@hillbombcreations/schemas` | Inline models | Inline models |
| IaC | SAM + YAML fragments (merge-template.js) | SAM + YAML fragments | SAM single template |

## MongoDB Architecture

- **`Vivreal`** (mainDb) — control plane: `groups`, `checkoutsessions`
- **`general_shared`** — tenant data for free/basic/pro tier groups
- **`pro_plus`** — tenant data for pro_plus tier groups
- **No per-group database** — tenants share a DB, isolated by `groupID` field on every document
- Tier determines which tenant DB: look up `groups.tier` in mainDb → route to `general_shared` or `pro_plus`
- The `key` field on groups is for S3 bucket naming, NOT database routing

## Activation Procedure

1. **Read the CLAUDE.md** of every repo the user's question touches. Use the Read tool — don't guess from memory.
2. **Identify the request path**: frontend component → proxy route → backend controller → service → MongoDB collection
3. **Load the specific files** at each layer before proposing changes
4. If the change spans repos, list ALL files that need modification across ALL repos

## Cross-Repo Conventions

- All backend APIs are **Express.js + serverless-express**, AWS Lambda, **JavaScript** (not TypeScript)
- Shared schemas in `@hillbombcreations/schemas` (npm): `groupSchema`, `collectionGroupSchema`, `collectionObjectSchema`, `integrationSchema`, `integrationAccountSchema`, `siteSchema`, `mediaFileSchema`, `auditLogSchema`, `contentVersionSchema`, `webhookSchema`, `usageTrackingSchema`, `checkoutSessionSchema`
- Auth flow: Cognito JWT (`token` cookie) + signed context JWT (`active_ctx` cookie)
- The `active_ctx` contains: `groupID`, `dbKey`, `bucketname`, `exp` — NOT `groupName`
- **Never use `groupName` for mainDb queries** — always `{ key: dbKey }` or `{ _id: groupID }`
- Portal proxy routes run on **edge runtime** — no Node.js APIs available
- Cognito claims available in backend via `req.apiGateway.event.requestContext.authorizer.claims` (email, given_name, family_name, sub)
- Audit logging and content versioning are fire-and-forget — if they fail, the main operation still succeeds

## When You Need to Trace a Feature

Start from the user's entry point and trace through each layer:

```
1. Frontend component (src/components/ or src/app/)
   └── What state does it manage? What API calls? (createAuthAxios / serverFetchDirect / publicAxios / fetch)
2. Proxy route (src/app/api/proxy/)
   └── Factory or manual? What params injected? Which baseUrl? CSRF?
3. Backend controller (src/<lambda>/api/controllers/ in the target API)
   └── What Joi validation? Which service function? Which Lambda handles it?
4. Backend service (src/<lambda>/services/ in the target API)
   └── What MongoDB ops? Side effects? (audit log, content version, S3, Lambda invoke, WebSocket)
5. MongoDB (Vivreal-Schemas or inline models)
   └── Which database? (Vivreal / general_shared / pro_plus) Which collection? Indexes?
```

Always report your findings at each layer before suggesting changes.
