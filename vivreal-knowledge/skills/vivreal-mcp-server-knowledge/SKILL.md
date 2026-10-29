---
name: vivreal-mcp-server-knowledge
description: 'Use when working in VR-MCP-Server, Vivreal''s remote MCP server (Cognito OAuth 2.1 + PKCE on Lambda) exposing CMS-admin tools across collections, objects, media, sites, integrations, Stripe, and group management. Covers the OAuth/session model and its 2026-10-09 hardening, the single canUseMcp plan gate and mcpToolCalls metering, per-area connection grants (ACCESS_NOT_GRANTED), the team and billing-portal tools that are off by default, the v6 Allow access business picker and siteStatus, the X-App-Source header requirement, the email-from-ID-token gotcha, and how it differs from the read-only Site MCP on VR_Client_API. Triggers on: VR-MCP-Server, Vivreal MCP server, MCP tools, OAuth 2.1 PKCE, set-active-group, tools/list, canUseMcp, mcpToolCalls, ACCESS_NOT_GRANTED, connection grants, Allow access, siteStatus, X-App-Source, Site MCP. Source of truth: `VR-MCP-Server` `CLAUDE.md` (and the docs it links) at `origin/main`. Not this: for USING the Vivreal MCP tools to manage content, use vivreal-cms:vivreal-cms.'
---

# VR-MCP-Server: knowledge digest

Source of truth: `VR-MCP-Server` `CLAUDE.md` (and the docs it links) at `origin/main`.

Last synced: 2026-10-20 against `origin/main` at `3285303` (#52, the v7 release; this repo deploys on every merge to `main`)

Remote MCP server for the Vivreal CMS. Cognito **OAuth 2.1 + PKCE** (bearer token), deployed on Lambda (Node 22 since 2026-10-02, `c8cd658`; arm64) + HTTP API Gateway + DynamoDB sessions. All ops are group-scoped. Deploys on every push to `main` (`.github/workflows/deploy.yaml`, no `workflow_dispatch`; the `dogfood` trigger was removed), so a merge IS a production deploy. Read `CLAUDE.md` at `origin/main` for depth. **The AI offering is this server, and only this server** (owner 2026-10-07): the in-app agent is retired, and in owner copy it is "an AI agent", never "assistant" or a model name.

## Two MCP surfaces: don't confuse them

| | **VR-MCP-Server** (this) | Site MCP (on VR_Client_API) |
|---|---|---|
| Audience | Portal owner / Vivreal customer | Site-visitor agents (ChatGPT/Claude/Perplexity) |
| Auth | Cognito OAuth 2.1 + PKCE (Bearer) | Per-site API key (raw header, no `Bearer`) |
| Scope | Full CMS admin (count them from `toolRegistry`) | Read-only content + Stripe purchase intent on ONE site |

## Tools: count them from the registry, never quote a number

**`toolRegistry` in `src/resource/manifests.ts` is the only answer.** The repository now derives
its own published count from that registry rather than typing one, precisely because the typed
copy went stale: a whole module was deleted outright and every written-down total, here included,
kept asserting the old figure for weeks afterwards. If you need the number, read the registry on
the deployed line and say when you read it.

The module names are stable enough to be useful: Session, Collections, Objects, Media, Calendar,
Dashboard, Sites, Integrations, Stripe, Group Management (the files under `src/tools/`). **Their per-module counts are not**, and
neither is the module list itself. Alongside the tools there are guided **prompts**, static
`vivreal://` **resources**, and URI **templates** in `src/resources/templates.ts`
(`vivreal://groups/{groupId}` and descendants); count each from its own source.

**One plan gate: `canUseMcp`** (`@hillbombcreations/tier-quotas`, the `mcpAccess` flag), applied in `src/tools/session.ts` and again per call, so a business whose plan lacks it is refused whatever tool it names (`TIER_NOT_ENTITLED`). `TOOL_MIN_TIER` and its per-tool ladder are **deleted** (`src/tools/catalog.ts` records why: it could never refuse a call the first gate allowed, and it answered three tools with a different error code). What remains there is `entitlementTier`, which resolves a stored plan string into the tier-quotas vocabulary and is not a gate. `tierForDbKey` is deleted too: a tenant database name cannot tell a plan. **Metering is `mcpToolCalls`** (`src/middleware/usage-quota.ts`, the limit from `getTierQuotas(tier).mcpToolCalls`): a hard stop with no overage rate. `agentActions` is the retired in-app agent's allowance and is `0` on every tier.

## What a connection may do (2026-10-09 hardening, v5 grants)

- **OAuth.** `POST /oauth/register` is real dynamic client registration (one client id per app, stored as `client:<id>` in `VR-MCP-Server-connections`, every redirect checked against the allowlist in `config.ts`, rate limited per IP). `/oauth/authorize` requires an EXACT match against the client's registered redirects (loopback: any port); every refusal is a plain page that never redirects. `__Host-vr_oauth_req` binds authorize to callback in one browser, and `redirect_uri` is required at `/oauth/token`. No token passthrough: with no cached ID token, `/mcp` answers 401 and calls nothing downstream.
- **Per-area grants** (`src/auth/grants.ts`): each connection row carries `areas` (`content_types`, `content_items`, `media`, `calendar`, `website`, `channels`, `billing`, `team`, each `off | read | write`) and a derived preset. The grant is NEVER in a token: it is read consistently on every request, so a change in Connected apps applies to the next call and a refresh cannot widen it. A grant only NARROWS: it runs before the group-role gate and never replaces it. A tool outside the grant answers `ACCESS_NOT_GRANTED` with the area; `tools/call`, `resources/read` and `tools/list` all ask the same module.
- **Off by default** (`src/auth/tool-gates.ts`): every team tool (derived from `requiredGroupRole: "admin"` or `cms.admin`, so a future admin tool is off by construction) and `get-customer-portal` (a read by annotation whose URL can cancel the plan) are refused for EVERY token unless `ADMIN_TOOLS_ENABLED` / `BILLING_PORTAL_TOOL_ENABLED` is exactly `true`.
- **Allow access (v6, #50).** `GET /api/connect/request` adds `account.email`, `businesses [{ groupId, name, canUseAi }]` (only groups the caller is a member of; `null`, never `[]`, when the Secure read fails, so a failed read cannot make the screen refuse a paying owner) and `startGroupId`. `POST /api/connect/approve` takes an optional `groupId`, which must match EXACTLY a business the caller belongs to whose plan includes AI agents, checked against a fresh read before the request is marked used; anything else is 400 `invalid_business` and writes nothing. An accepted pick is the `pref:<sub>` row every new session starts from; absent keeps the old behaviour.


## Session model: set-active-group is the linchpin

Most tools need `groupID` + `dbKey` from the active group. `set-active-group` is sticky for the session; on cache miss it transparently re-fetches the user's groups once then retries. `get-session-context` is a pure read; `refresh-session-context` re-fetches (use after the user creates a group mid-session). Sessions persist to DynamoDB after each tool call. Bootstrap loads groups from Secure API `/api/groupInfo` (the `config.ts` default when `VR_SECURE_GROUPS_PATH` is unset; no template sets it, but the live Lambda env was not read, so treat "unset in production" as unverified). **Not `/api/allUsersGroups`**: that path is declared in VR_Secure_API's gateway template but has no Express handler, so pointing the server at it would 404 every bootstrap.

## Critical implementation gotchas

- **`X-App-Source: vivreal` is the TENANT PARTITION PREDICATE**, built in exactly one place, `src/api/app-source.ts` (`vivrealApiHeaders()`), for all three outbound calls (`fetchUserGroups`, `cmsRequest`, `secureApiRequest`); `test/unit/app-source-header.test.js` fails if one stops sending it. VR_Secure_API now refuses a missing or unknown value with **400** "Missing or unrecognised X-App-Source header" (`src/shared/appSource.js`, allowlist `['vivreal']`, case-sensitive). Before 2026-09-25 a missing header returned 200 with ZERO groups, silently; the old "null then 500" story was wrong too (MCP CLAUDE.md:189-215).
- **Email comes from the ID token, not the access token**, Cognito access tokens don't include `email`. Existing-session refresh must read refreshed ID-token claims, NOT `principal.email` (always undefined).
- **CMS requires `page` + `limit`** on many endpoints, tools default `page:"1"`, `limit:"20"`. `cmsRequest()` auto-adds `key` (dbKey) + `groupID`.
- Calendar has 1 tool (`list-events` → `/tenant/events`); Vivreal has NO `event` entity, scheduling is a `publishDate` on content/channel objects. **Since v7 it always sends `excludePrivateLists`** (`src/tools/calendar.ts`), so mailing-list sign-ups, contact and quote requests and form enquiries are left out while booking requests stay, and an entry with no `archived` boolean of its own gets NO `siteStatus` (say you cannot tell).
- **`list-content` `archived` (v7, #52):** `false` or omitted returns only items that are NOT archived (`$ne: true`, so rows with no `archived` key count), `true` returns ONLY archived items. To see everything, make one call each way (`src/tools/objects.ts`).
- **Sort is sent as the CMS's `sort[field]`/`sort[direction]`** (`src/tools/sortParam.ts`); resources take `?sort=field:dir`, refused with a sentence naming the fix before any call (`src/resources/router.ts`). The items resource defaults to `archived=false`. Before #52 the items and channel-posts resources answered 400 on every read.
- **`siteStatus` says whether an item is on the site (v6).** Content item output (`list-content`, the create/update/archive tools, the item resources) and `list-events` CONTENT entries carry `siteStatus`: `live`, `scheduled`, `not_published`, `archived`, `waiting_for_approval` or `sent_back`, derived the way the portal decides it (`src/tools/siteStatus.ts`). `approvalStatus` is the approval WORKFLOW state and says `draft` on every item never sent for approval, live or not; an AI agent once told an owner "every item is still marked draft" for live items. `list-events` needs VR_CMS_API's `getEvents` to project `archived`; channel posts carry no `siteStatus`.
- **Before a caller sends a new param, read the DEPLOYED validator.** VR_Secure_API validates with `Joi.object().keys({...})`, whose default rejects unknown keys, so a param sent "ahead of" a backend release 400s in production, and this repo deploys on merge, so the break is live at once (MCP #42, reverted in #43). Ship the key optional on the backend first.
- Field types live in `src/constants/fieldTypes.ts`; CI parity test guards drift vs `VR_CMS_API/src/shared/validateObjectValue.js`.
- Endpoint specifics: `/api/groupInfoV1` (groupID + email) vs `/api/groupInfo` (email only); `/tenant/presignedUploadUrl` (not `s3PutUrl`); `/tenant/dashboardInfo` (not `dashboard`).
- **dbKey-routing/tier-gating fixes**: a bucket-slug routing bug and a Pro Plus tier misreport are both fixed, and a plan is never read from a database name (`tierForDbKey` deleted, TEN-9a/9b). Verify current behavior against source rather than assuming the old symptoms still apply.
- **The write tools were repaired on 2026-09-29** after an audit found many could not work: `update-site` was uncallable because the server sent `key` where VR_Secure_API's Joi `.keys()` validator wants `dbKey` (`990c4b6`); the three remaining update tools now MERGE instead of replacing the stored object (`76ba2dd`); a route that does not exist no longer reads as a permissions problem (`b9b9e81`); phantom tools and prompts that pointed at a dead tool were removed (`60b4d6d`). Re-test a write tool against a scratch object before relying on it.
- Repo gained ESLint + a husky gate with a coverage baseline.

## Runtime

`src/index.ts` (local HTTP) + `src/lambda.ts` (API Gateway v2 adapter). SAM CloudFormation, GitHub Actions on `main` only (CI token scoped `packages: read`). Required env: `AWS_REGION`, `USERPOOL_ID`, `MCP_CLIENT_ID`, `COGNITO_DOMAIN`; Sentry config is resolved from SSM.
