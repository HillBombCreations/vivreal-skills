---
name: vivreal-mcp-server-knowledge
description: 'Use when working in VR-MCP-Server, Vivreal''s remote MCP server (Cognito OAuth 2.1 + PKCE on Lambda) exposing CMS-admin tools across collections, objects, media, sites, integrations, Stripe, and group management. Covers the OAuth/session model, the tool modules and per-tier tool gating, the X-App-Source header requirement, the email-from-ID-token gotcha, and how it differs from the read-only Site MCP on VR_Client_API. Triggers on: VR-MCP-Server, Vivreal MCP server, MCP tools, OAuth 2.1 PKCE, set-active-group, tools/list, TOOL_MIN_TIER, X-App-Source, Site MCP. Source of truth: C:\repos\VR-MCP-Server\CLAUDE.md.'
---

# VR-MCP-Server: knowledge digest

Last synced: 2026-08-15

Remote MCP server for the Vivreal CMS. Cognito **OAuth 2.1 + PKCE** (bearer token), deployed on Lambda (Node 20, arm64) + HTTP API Gateway + DynamoDB sessions. All ops are group-scoped. v1.0.0, deployed. Read `C:\repos\VR-MCP-Server\CLAUDE.md` for depth.

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
Dashboard, Sites, Integrations, Stripe, Group Mgmt, Docs. **Their per-module counts are not**, and
neither is the module list itself. Alongside the tools there are guided **prompts**, static
`vivreal://` **resources**, and URI **templates** in `src/resources/templates.ts`
(`vivreal://groups/{groupId}` and descendants); count each from its own source.

**Per-tier gating** lives in `TOOL_MIN_TIER` in `src/tools/catalog.ts`. **Read it. Do not quote a remembered ladder.** Three things a stale copy gets wrong: the gate has only two rungs, because two is all the catalog distinguishes; the tool-to-tier map has shrunk; and `tierForDbKey`, which graded a plan from a tenant DATABASE name, is deleted, because one shared placement holds several plans and the key was structurally incapable of telling them apart. An unreadable plan is `null`, and every gate fails OPEN on `null` and logs, because telling a paying customer to upgrade to a plan they already exceed is the worse error.

## Session model: set-active-group is the linchpin

Most tools need `groupID` + `dbKey` from the active group. `set-active-group` is sticky for the session; on cache miss it transparently re-fetches the user's groups once then retries. `get-session-context` is a pure read; `refresh-session-context` re-fetches (use after the user creates a group mid-session). Sessions persist to DynamoDB after each tool call. Bootstrap loads groups from Secure API `/api/allUsersGroups`.

## Critical implementation gotchas

- **`X-App-Source: vivreal` header is required** on every CMS + Secure API call. Without it, group lookups query `{ type: undefined }` → null → 500. Set in `src/api/cms-client.ts`.
- **Email comes from the ID token, not the access token**, Cognito access tokens don't include `email`. Existing-session refresh must read refreshed ID-token claims, NOT `principal.email` (always undefined).
- **CMS requires `page` + `limit`** on many endpoints, tools default `page:"1"`, `limit:"20"`. `cmsRequest()` auto-adds `key` (dbKey) + `groupID`.
- Calendar has 1 tool (`list-events` → `/tenant/events`); Vivreal has NO `event` entity, scheduling is a `publishDate` on content/channel objects.
- Field types live in `src/constants/fieldTypes.ts`; CI parity test guards drift vs `VR_CMS_API/src/shared/validateObjectValue.js`.
- Endpoint specifics: `/api/groupInfoV1` (groupID + email) vs `/api/groupInfo` (email only); `/tenant/presignedUploadUrl` (not `s3PutUrl`); `/tenant/dashboardInfo` (not `dashboard`).
- **dbKey-routing/tier-gating fixes (this window)**: a bucket-slug routing bug and a Pro Plus tier misreport are both fixed, verify current behavior against source rather than assuming the old symptoms still apply.
- **Docs module scope expanded** (help-center docs tools): the Docs module's existing tools cover more help-center content without new tools being added. The overall total has since moved for an unrelated reason (a module was removed), so do not infer a total from this line.
- Repo gained ESLint + a husky gate with a coverage baseline.

## Runtime

`src/index.ts` (local HTTP) + `src/lambda.ts` (API Gateway v2 adapter). SAM CloudFormation, GitHub Actions on `main`/`dogfood` (CI token scoped `packages: read`). Required env: `AWS_REGION`, `USERPOOL_ID`, `MCP_CLIENT_ID`, `COGNITO_DOMAIN`; Sentry config is resolved from SSM.
