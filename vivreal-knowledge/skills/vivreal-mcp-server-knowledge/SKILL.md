---
name: vivreal-mcp-server-knowledge
description: Use when working in VR-MCP-Server — Vivreal's remote MCP server (Cognito OAuth 2.1 + PKCE on Lambda) exposing 69 CMS-admin tools across collections, objects, media, sites, integrations, Stripe, and group management. Covers the OAuth/session model, the tool modules and per-tier tool gating, the X-App-Source header requirement, the email-from-ID-token gotcha, and how it differs from the read-only Site MCP on VR_Client_API. Triggers on: VR-MCP-Server, Vivreal MCP server, MCP tools, OAuth 2.1 PKCE, set-active-group, tools/list, TOOL_MIN_TIER, X-App-Source, Site MCP. Source of truth: C:\repos\VR-MCP-Server\CLAUDE.md.
---

# VR-MCP-Server — knowledge digest

Remote MCP server for the Vivreal CMS. Cognito **OAuth 2.1 + PKCE** (bearer token), deployed on Lambda (Node 20, arm64) + HTTP API Gateway + DynamoDB sessions. All ops are group-scoped. v1.0.0, deployed. Read `C:\repos\VR-MCP-Server\CLAUDE.md` for depth.

## Two MCP surfaces — don't confuse them

| | **VR-MCP-Server** (this) | Site MCP (on VR_Client_API) |
|---|---|---|
| Audience | Portal owner / Vivreal customer | Site-visitor agents (ChatGPT/Claude/Perplexity) |
| Auth | Cognito OAuth 2.1 + PKCE (Bearer) | Per-site API key (raw header, no `Bearer`) |
| Scope | Full CMS admin (69 tools) | Read-only content + Stripe purchase intent on ONE site |

## Tools — exactly 69 across 11 modules

Per `toolRegistry` in `src/resource/manifests.ts`: Session (3) · Collections (9) · Objects (12) · Media (5) · Calendar (1) · Dashboard (1) · Sites (14) · Integrations (10) · Stripe (4) · Group Mgmt (7) · Docs (3). Also 8 guided **prompts** (`create-content-plan`, `launch-content-everywhere`, etc.) and 3 `vivreal://` **resources**.

**Per-tier gating** — `TOOL_MIN_TIER` in `src/tools/catalog.ts`: `bulk-create-content`, `bulk-update-content-publish-date`, `sync-channel` require **pro**; `redeploy-site`, `deploy-site` require **pro_plus**. `tools/list` is filtered per tier, so a basic-tier client sees fewer than 69.

## Session model — set-active-group is the linchpin

Most tools need `groupID` + `dbKey` from the active group. `set-active-group` is sticky for the session; on cache miss it transparently re-fetches the user's groups once then retries. `get-session-context` is a pure read; `refresh-session-context` re-fetches (use after the user creates a group mid-session). Sessions persist to DynamoDB after each tool call. Bootstrap loads groups from Secure API `/api/allUsersGroups`.

## Critical implementation gotchas

- **`X-App-Source: vivreal` header is required** on every CMS + Secure API call. Without it, group lookups query `{ type: undefined }` → null → 500. Set in `src/api/cms-client.ts`.
- **Email comes from the ID token, not the access token** — Cognito access tokens don't include `email`. Existing-session refresh must read refreshed ID-token claims, NOT `principal.email` (always undefined).
- **CMS requires `page` + `limit`** on many endpoints — tools default `page:"1"`, `limit:"20"`. `cmsRequest()` auto-adds `key` (dbKey) + `groupID`.
- Calendar has 1 tool (`list-events` → `/tenant/events`); Vivreal has NO `event` entity — scheduling is a `publishDate` on content/channel objects.
- Field types live in `src/constants/fieldTypes.ts`; CI parity test guards drift vs `VR_CMS_API/src/shared/validateObjectValue.js`.
- Endpoint specifics: `/api/groupInfoV1` (groupID + email) vs `/api/groupInfo` (email only); `/tenant/presignedUploadUrl` (not `s3PutUrl`); `/tenant/dashboardInfo` (not `dashboard`).

## Runtime

`src/index.ts` (local HTTP) + `src/lambda.ts` (API Gateway v2 adapter). SAM CloudFormation, GitHub Actions on `main`/`dogfood` (CI token scoped `packages: read`). Required env: `AWS_REGION`, `USERPOOL_ID`, `MCP_CLIENT_ID`, `COGNITO_DOMAIN`; Sentry config is resolved from SSM.
