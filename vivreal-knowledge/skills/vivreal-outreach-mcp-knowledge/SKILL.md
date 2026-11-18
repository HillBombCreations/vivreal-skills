---
name: vivreal-outreach-mcp-knowledge
description: 'Use when working in VR-Outreach-MCP-Server, the internal-only remote MCP server (Cognito OAuth 2.1 + PKCE on Lambda) exposing the Vivreal Outreach pipeline (companies, contacts, sequences, enrollments, suppressions, segments, senders, outbound queue) as 50 tools for Claude Desktop. Covers the two-credential model (Cognito Bearer + per-request HMAC x-active-ctx, x-user-ctx for admin gates), the per-target token table, the CMS-fanout tools vs native stop/resume enrollment routes, hookless company seeding, the ADMIN_EMAILS connect gate, and the JWT-authorizer-audience deploy prerequisite. NOT the CMS MCP server, that is VR-MCP-Server (see vivreal-mcp-server-knowledge). Triggers on: VR-Outreach-MCP-Server, outreach MCP, x-active-ctx, x-user-ctx, cms-fanout, stop-enrollment, import-contacts, import-companies, set-active-group, outreach-mcp.vivreal.io. Source of truth: `VR-Outreach-MCP-Server` `CLAUDE.md` (and the docs it links) at `origin/main`.'
---

# VR-Outreach-MCP-Server: knowledge digest

**Cross-repo flows, decisions and maps:** the vivreal-hq dev docs under `${VIVREAL_REPOS}/vivreal-hq/docs/dev-docs/`, starting at `03-use-cases/U26-outreach-and-campaigns.md`, `03-use-cases/U7-mcp-servers.md`; `npm run docs:route -- "outreach"` from vivreal-hq names the rest. This skill and the repo's `CLAUDE.md` own the repo's internals.

Source of truth: `VR-Outreach-MCP-Server` `CLAUDE.md` (and the docs it links) at `origin/main`.

Last synced: 2026-10-20 against `origin/main` at `066d0b2` (#11, live since 2026-10-19; Node 22 since 2026-10-02)

**Internal-only remote MCP server** exposing the Vivreal **Outreach** pipeline to Claude Desktop so team members can seed and manage leads. Architecturally a clone of **VR-MCP-Server** (Cognito OAuth 2.1 + PKCE, DynamoDB sessions, JSON-RPC dispatch, SAM/Lambda + API Gateway, GitHub Actions), but VR-MCP-Server is the **CMS** MCP server (69 CMS-admin tools; `vivreal-mcp-server-knowledge`); this one fronts **VR_Outreach_API** (+ CMS fanout). **DEPLOYED to prod 2026-06-25** at `https://outreach-mcp.vivreal.io`. TypeScript; design/audit artifacts live in `VR-MCP-Server/docs/projects/outreach-mcp-server/`. Read `${VIVREAL_REPOS}/VR-Outreach-MCP-Server/CLAUDE.md` for depth; re-read its header and `src/tools/` at `origin/main` for the current tool count before quoting one.

## Since the last sync: release A and release B (read at `origin/main` `b04a5a3`)

- **Runtime and role (release B, live 2026-11-17, #19 and #20):** `McpServerFunction` runs `nodejs24.x` and its role carries the fleet's workload permissions boundary (`Globals.Function`, pinned by `test/unit/template-permissions-boundary.test.js`); an `AccessDenied` naming the boundary is a grant the boundary denies, not a missing policy (`vivreal-infra:vivreal-iam-secrets`). The "Node 22" in the sync line above is history.
- **The deploy ships the runtime only** (#20): `scripts/prune-to-runtime.js` keeps an allowlist (the build, `node_modules`, `package.json`, `cloudformation`) and the workflow checks the unzipped size before CloudFormation does, because the first Node 24 deploy failed on Lambda's unzipped size cap with the whole checkout, coverage output and `.git` included.
- **The client holds only this server's opaque tokens** (release A, OM-6 to OM-8): Cognito's tokens stay sealed in the connection row and `/mcp` resolves the opaque bearer to them, so a Cognito JWT sent as the bearer is `401 invalid_token`. Wherever this skill says "the Cognito Bearer", read the Cognito token the server holds for the connection, never one the client sends. Consent, browser binding and the five-address registration cap: CLAUDE.md "Tokens, consent and browser binding".
- **One linear address matcher** (release A OM-1 and OM-10, release B OM-318): both log doors filter an address whole, domain included, through `src/shared/addressMatcher.ts`, a port of VR-MCP-Server #62's separator-jumping matcher that is fast on long inputs; `src/redact.ts` and `src/logger.ts` stay deliberate copies of VR-MCP-Server's, so change both repos in one sweep.
- **The start-up line reaches Sentry** (OM-322): `service.started` is flushed before init ends, so a cold start that dies early still leaves it.
- **No loopback socket is reused across a freeze** (F438, #21, deployed 2026-11-18): every call from the Lambda adapter to its own local server sends `connection: close`, because the local server's idle timer closed a pooled keep-alive socket while the function was frozen and the next warm call failed with `fetch failed` (a 500 on `/health` that paged the owners). A failure logs its cause; nothing retries. The class is `vivreal-infra:vivreal-lambda`'s freeze rule; VR-MCP-Server fixed the same bug in `f61f46e`.

## Tool registry: 50 tools: 9 modules (`src/tools/`)

`session`(3: get/refresh-session-context, set-active-group) · `companies`(10, 2 admin gmail-history) · `contacts`(10, 2 admin gmail-history; `update-contact` is CMS-fanout) · `sequences`(8, 3 CMS-fanout + admin `bulk-enroll-contacts`) · `enrollments`(7, 3 CMS-fanout + 2 **native** stop/resume) · `segments`(4, 3 admin) · `senders`(4, 3 CMS-fanout) · `suppressions`(3) · `queue`(1: get-outbound-queue). 8 tools carry `admin: true` (x-user-ctx minted): companies 2, contacts 2, segments 3, sequences 1. Guards/validation in `src/tools/guards.ts` + `validation.ts`. The `catalog.ts` "tier" system is an explicit **no-op** (single `"basic"` tier), all 50 tools are exposed to every connected operator; the only gate is the ADMIN_EMAILS connect allow-list. **0 prompts**, the `seed-leads` prompt was retired with the prospects module; `promptRegistry` in `src/resource/manifests.ts` is an empty array.

The prospects module is GONE (2026-07-27): `src/tools/prospects.ts` and its 8 tools were deleted when VR_Outreach_API retired `/prospects` (leads now live in `vivreal-hq/packages/leadgen/Data/prospects.jsonl`, gitignored). What survived: **hookless seeding** lives on in `create-company`/`import-companies`, hooks are not required, name + website/domain is the seed bar, and `companies.ts` + `contacts.ts` keep full pipeline-field pass-through (reachEmail, phone, address, socials, …).

## list-suppressions fix (the shape trap)

`GET /suppressions` answers a **top-level bare array** (unlike `/tags`, `/sequences`, `/segments`, which wrap). The handler passed `result.data` straight through, but MCP requires `structuredContent` to be an object, so every real call failed client-side schema validation ("expected record, received array") and the tool was unusable. Now wrapped `{suppressions:[...]}`. Deliberate: a non-array is NOT coerced to an empty list (an empty suppression list reads as "nothing is proven bad" and would hand the seed gate a false all-clear), it fails loudly with `UPSTREAM_ERROR`. Tests stayed green throughout because they stubbed `okResponse({})`. This was the only remaining authenticated read path to proven-bad addresses after the OUTREACH_BEARER browser login was retired 2026-07-16.

## The thing that makes this server different: TWO credentials

Every **VR_Outreach_API** call needs the Cognito Bearer **AND** a minted HMAC-SHA256 `x-active-ctx` (VR-MCP-Server needs only the Bearer). Minting in `src/api/ctx.ts`, client in `src/api/outreach-client.ts`:

- `x-active-ctx` payload `{ groupID, dbKey, email, exp }`, `exp = now + 600s`, signed with `CTX_SECRET` from `<secret-prefix>/core`, minted **per request**. `set-active-group` must run first (session tools), the ctx carries the tenant routing; no `key`/`groupID` query params are sent.
- `x-user-ctx` (`{ email, exp }`) minted **only for admin-gated tools** (gmail-history, segment writes, bulk-enroll).

**Per-target token selection (do not get this wrong):** VR_Outreach_API → **access token** + ctx headers (JWT authorizer checks `aud`); VR_CMS_API fanout → **ID token** (`createCollectionObject.js` stamps `author` from ID-token claims absent on access tokens); VR_Secure_API bootstrap → id-or-access + **`x-app-source: vivreal`** (without the header the tenant query is `{type: undefined}` → empty).

## CMS-fanout vs native routes

≈1/3 of tools do NOT hit VR_Outreach_API, sequence CRUD, enrollment list/delete, `get-sequence-enrollees`, sender CRUD, and `update-contact` fan out to VR_CMS_API generic `collectionObjects` endpoints via `src/api/cms-fanout.ts` (domains: sequences, enrollments, senders, contacts; `getGroupRefId` fetches the system collection-group `_id` from `/<domain>/group-info` and caches per `${dbKey}:${domain}`). **Exception: enrollment `stop`/`resume` are native VR_Outreach_API routes** (`POST /enrollments/stop|resume`, body `{enrollmentId}`), server-side field-path `$set` that preserves cron-managed fields and avoids the BSON-Date→String corruption the old CMS read-modify-write caused.

## Footguns (each one was a real bug class)

- **CMS update is a FULL `$set:{objectValue}` REPLACE**, not a patch, `update-sequence`/`update-sender`/`update-contact` read-modify-write the complete object.
- **Sender identity resolves LIVE at send time, never snapshotted**, sequences store only `senderUserId`. Editing a sender changes in-flight sends immediately; **deleting an in-use sender strands enrollments in a silent `no-sender` backoff**. Sender `signature` free-text is RETIRED (composed from `fromName`+`role`+`signatureImageUrl`); `fromAddress` must end `@vivreal.io` (client-enforced only).
- **`import-contacts` is insert-net-new / skip-existing**, NOT upsert; body must be `{contacts:[...]}` (bare array 400s). **Company must exist first**, unresolved `companyId` soft-skips the row (`droppedInvalid[]`, `unresolved-companyId`); always surface skips. HITL flow: `create-company` → `import-contacts` with the `_id`.
- **`bulk-enroll-contacts` fails the WHOLE batch (502)** on a suppression-lookup failure, deliberate fail-closed for deliverability.
- **The enrol tools report the real result (v7).** `enroll-contacts`, `import-sequence-csv` and `bulk-enroll-contacts` say "nobody was enrolled" ONLY on Outreach's exact suppression-failure 502 (`SUPPRESSION_LOOKUP_FAILED_ERROR` in `src/tools/sequences.ts`, a hand copy of Outreach's message that vivreal-hq contract-drift `enrol-suppression-502` pins); any other 502, and any 504, is an UNKNOWN outcome. Skips carry Outreach's reasons, including `company-excluded`.
- **`update-contact` refuses `_system` and `companyId` (v7).** `_system` holds server-written values (the exclude mark, the CMS web address) that the CMS would discard anyway, so the edit is refused rather than reported as landed; `companyId` links a person to a company and is not edited here (`src/tools/contacts.ts`).
- **`log-call` sends `advance` as an explicit boolean**, the API defaults it to `true` (and 409s with no active call step); omitted means "just log a note." It now also accepts an optional `disposition` (`no-answer` | `left-voicemail` | `reached`), `reached` COMPLETES the enrollment rather than advancing it; the other two advance.
- gmail-history tools return `{messages:[], reason:'not-configured'}` when `GMAIL_SA_KEY_JSON` is absent, a normal result, not an error.
- Sequences are versioned (each PUT = snapshot); senders are not. CMS object schema is `{}`, **validate in the tool handlers**.

## Auth gate + deploy gotchas

- **Connect allow-list = `ADMIN_EMAILS`** (deny-by-default, `getOrCreateSession()` in `src/server.ts`): secret reachable → enforce (empty list → NO ONE connects, fail-closed); secret unreachable (local dev) → allow. Consequence: every connected user is an admin, split later via `OUTREACH_ALLOWED_EMAILS`.
- **No JWT authorizer at the MCP gateway**, auth is application-level; the `401 + WWW-Authenticate` challenge must reach clients.
- **Audience prerequisite (C1, RESOLVED):** this server's Cognito app client (created by this repo's `cloudformation/template.yaml`; read its id from the stack, never copy it here) must be in **VR_Outreach_API's JWT authorizer audience list** (the HttpApi default authorizer in `VR_Outreach_API/template.yaml`) or every Outreach call 401s. If the client ID ever changes, re-add + redeploy VR_Outreach_API. VR_CMS_API/VR_Secure_API need no change.
- **Ctx tokens use the Outreach-derived key and `aud: 'outreach'`** since 2026-09-27 (`e019eb0`, matching VR_Outreach_API H6006); a token minted with the raw `CTX_SECRET` is refused. `CTX_SECRET` and `ADMIN_EMAILS` default to `<secret-prefix>/core`, not `hb-api-secrets` (`9df37e7`).
- Stacks: `VR-Outreach-MCP-Server` (prod, `main`); the `dogfood` DEV path is retired fleet-wide, check the workflow before assuming one; Sentry project `vivreal-outreach-mcp`. Secrets (secrets-audit Phase 2, config-only): `CTX_SECRET` + `ADMIN_EMAILS` read from `<secret-prefix>/core` (`cloudformation/template.yaml`); Sentry DSN from SSM `<ssm-prefix>/outreach-mcp/sentry-dsn`, environment from SSM `<ssm-prefix>/shared/sentry-environment`. `hb-api-secrets` is retired here.
- Repointed (single-commit window) to the shared cross-repo SNS alarm topic. Tool count is unchanged: still 50.

## Companions

`vivreal-outreach-api-knowledge` (the backend it fronts), `vivreal-mcp-server-knowledge` (the CMS sibling this clones), `vivreal-iam-secrets` (CTX_SECRET rotation).
