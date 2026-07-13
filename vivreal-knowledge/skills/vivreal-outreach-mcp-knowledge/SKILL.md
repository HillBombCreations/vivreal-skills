---
name: vivreal-outreach-mcp-knowledge
description: Use when working in VR-Outreach-MCP-Server — the internal-only remote MCP server (Cognito OAuth 2.1 + PKCE on Lambda) exposing the Vivreal Outreach pipeline (companies, contacts, sequences, enrollments, suppressions, segments, senders, outbound queue) as 50 tools for Claude Desktop. Covers the two-credential model (Cognito Bearer + per-request HMAC x-active-ctx, x-user-ctx for admin gates), the per-target token table, the CMS-fanout tools vs native stop/resume enrollment routes, the ADMIN_EMAILS connect gate, and the JWT-authorizer-audience deploy prerequisite. NOT the CMS MCP server — that is VR-MCP-Server (see vivreal-mcp-server-knowledge). Triggers on: VR-Outreach-MCP-Server, outreach MCP, outreach tools, enroll via MCP, sequence tools, x-active-ctx, x-user-ctx, cms-fanout, stop-enrollment, import-contacts, set-active-group, outreach-mcp.vivreal.io. Source of truth: C:\repos\VR-Outreach-MCP-Server\CLAUDE.md (fresh, 2026-07-07).
---

# VR-Outreach-MCP-Server — knowledge digest

Last synced: 2026-07-13

**Internal-only remote MCP server** exposing the Vivreal **Outreach** pipeline to Claude Desktop so team members can seed and manage leads. Architecturally a clone of **VR-MCP-Server** (Cognito OAuth 2.1 + PKCE, DynamoDB sessions, JSON-RPC dispatch, SAM/Lambda + API Gateway, GitHub Actions) — but VR-MCP-Server is the **CMS** MCP server (~72 CMS-admin tools; `vivreal-mcp-server-knowledge`); this one fronts **VR_Outreach_API** (+ CMS fanout). **DEPLOYED to prod 2026-06-25** at `https://outreach-mcp.vivreal.io`. TypeScript; design/audit artifacts live in `VR-MCP-Server/docs/projects/outreach-mcp-server/`. Read `C:\repos\VR-Outreach-MCP-Server\CLAUDE.md` for depth.

## Tool registry — 50 tools, 9 modules (`src/tools/`)

`session`(3: get/refresh-session-context, set-active-group) · `companies`(10, 2 admin gmail-history) · `contacts`(10, 2 admin gmail-history; `update-contact` is CMS-fanout) · `sequences`(8, 3 CMS-fanout + admin `bulk-enroll-contacts`) · `enrollments`(7, 3 CMS-fanout + 2 **native** stop/resume) · `suppressions`(3) · `segments`(4, 3 admin) · `senders`(4, 3 CMS-fanout) · `queue`(1: get-outbound-queue). 8 tools carry `admin: true` (x-user-ctx minted). Guards/validation in `src/tools/guards.ts` + `validation.ts`; catalog/tier filter in `catalog.ts`.

## The thing that makes this server different: TWO credentials

Every **VR_Outreach_API** call needs the Cognito Bearer **AND** a minted HMAC-SHA256 `x-active-ctx` (VR-MCP-Server needs only the Bearer). Minting in `src/api/ctx.ts`, client in `src/api/outreach-client.ts`:

- `x-active-ctx` payload `{ groupID, dbKey, email, exp }`, `exp = now + 600s`, signed with `CTX_SECRET` from `hb-api-secrets`, minted **per request**. `set-active-group` must run first (session tools) — the ctx carries the tenant routing; no `key`/`groupID` query params are sent.
- `x-user-ctx` (`{ email, exp }`) minted **only for admin-gated tools** (gmail-history, segment writes, bulk-enroll).

**Per-target token selection (do not get this wrong):** VR_Outreach_API → **access token** + ctx headers (JWT authorizer checks `aud`); VR_CMS_API fanout → **ID token** (`createCollectionObject.js` stamps `author` from ID-token claims absent on access tokens); VR_Secure_API bootstrap → id-or-access + **`x-app-source: vivreal`** (without the header the tenant query is `{type: undefined}` → empty).

## CMS-fanout vs native routes

≈1/3 of tools do NOT hit VR_Outreach_API — sequence CRUD, enrollment list/delete, `get-sequence-enrollees`, sender CRUD, and `update-contact` fan out to VR_CMS_API generic `collectionObjects` endpoints via `src/api/cms-fanout.ts` (domains: sequences, enrollments, senders, contacts; `getGroupRefId` fetches the system collection-group `_id` from `/<domain>/group-info` and caches per `${dbKey}:${domain}`). **Exception: enrollment `stop`/`resume` are native VR_Outreach_API routes** (`POST /enrollments/stop|resume`, body `{enrollmentId}`) — server-side field-path `$set` that preserves cron-managed fields and avoids the BSON-Date→String corruption the old CMS read-modify-write caused.

## Footguns (each one was a real bug class)

- **CMS update is a FULL `$set:{objectValue}` REPLACE**, not a patch — `update-sequence`/`update-sender`/`update-contact` read-modify-write the complete object.
- **Sender identity resolves LIVE at send time, never snapshotted** — sequences store only `senderUserId`. Editing a sender changes in-flight sends immediately; **deleting an in-use sender strands enrollments in a silent `no-sender` backoff**. Sender `signature` free-text is RETIRED (composed from `fromName`+`role`+`signatureImageUrl`); `fromAddress` must end `@vivreal.io` (client-enforced only).
- **`import-contacts` is insert-net-new / skip-existing**, NOT upsert; body must be `{contacts:[...]}` (bare array 400s). **Company must exist first** — unresolved `companyId` soft-skips the row (`droppedInvalid[]`, `unresolved-companyId`); always surface skips. HITL flow: `create-company` → `import-contacts` with the `_id`.
- **`bulk-enroll-contacts` fails the WHOLE batch (502)** on a suppression-lookup failure — deliberate fail-closed for deliverability.
- **`log-call` sends `advance` as an explicit boolean** — the API defaults it to `true` (and 409s with no active call step); omitted means "just log a note."
- gmail-history tools return `{messages:[], reason:'not-configured'}` when `GMAIL_SA_KEY_JSON` is absent — a normal result, not an error.
- Sequences are versioned (each PUT = snapshot); senders are not. CMS object schema is `{}` — **validate in the tool handlers**.

## Auth gate + deploy gotchas

- **Connect allow-list = `ADMIN_EMAILS`** (deny-by-default, `getOrCreateSession()` in `src/server.ts`): secret reachable → enforce (empty list → NO ONE connects, fail-closed); secret unreachable (local dev) → allow. Consequence: every connected user is an admin — split later via `OUTREACH_ALLOWED_EMAILS`.
- **No JWT authorizer at the MCP gateway** — auth is application-level; the `401 + WWW-Authenticate` challenge must reach clients.
- **Audience prerequisite (C1 — RESOLVED):** this server's Cognito client `7efagcmhehkdlnkth5g7vhsd48` must be in **VR_Outreach_API's JWT authorizer audience list** (`VR_Outreach_API/template.yaml` ~line 60) or every Outreach call 401s. If the client ID ever changes, re-add + redeploy VR_Outreach_API. VR_CMS_API/VR_Secure_API need no change.
- Stacks: `VR-Outreach-MCP-Server` (prod, `main`) / `-DEV` (staging, `dogfood`); Sentry project `vivreal-outreach-mcp`. Secrets in `hb-api-secrets`: `CTX_SECRET`, `ADMIN_EMAILS`, `SENTRY_DSN_OUTREACH_MCP`.

## Companions

`vivreal-outreach-api-knowledge` (the backend it fronts), `vivreal-mcp-server-knowledge` (the CMS sibling this clones), `outreach-api` expert agent (deep read-only analysis), `vivreal-iam-secrets` (CTX_SECRET rotation).
