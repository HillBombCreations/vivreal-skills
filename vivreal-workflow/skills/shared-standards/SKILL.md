---
name: shared-standards
description: Vivreal Portal shared engineering standards — the non-negotiable conventions every Vivreal bug/feature workflow agent reads before working. Use when an agent or command says to consult "shared-standards" or "_shared-standards", or when a task touches Vivreal proxy routes, multi-tenancy (active_ctx/dbKey/groupID), CSRF, hydration/SSR, Lambda infra, MongoDB queries, or testing rules. Carries the ${VIVREAL_REPOS} path-resolution preamble and the lazy-reading trigger map.
---

> NOTE: This skill is the relocated form of the portal's `.claude/agents/_shared-standards.md`.
> Workflow agents and commands that historically read `.claude/agents/_shared-standards.md`
> now resolve it through this skill, so it works from any repo. Content below is verbatim.

## Path resolution (read FIRST)

This workflow uses two placeholder env vars that every agent must resolve before reading cross-repo or ecosystem files. They are NOT shell expansions you literally execute — they are placeholders this section tells you how to resolve.

### `${VIVREAL_REPOS}` — root containing all Vivreal repos
**Default convention:** all Vivreal repos are sibling directories under one parent. From the project root (where this repo lives), the parent is `..`.

**Resolution rule:**
1. If env var `VIVREAL_REPOS` is set, use it
2. Otherwise, use the parent of this repo: `$(cd .. && pwd)`
3. Verify by checking that `${VIVREAL_REPOS}/Vivreal_Portal_Mobile/CLAUDE.md` exists

**Example resolution in Bash (use this in agent commands):**
```bash
VIVREAL_REPOS="${VIVREAL_REPOS:-$(cd .. && pwd)}"
cat "$VIVREAL_REPOS/VR_CMS_API/CLAUDE.md"
```

### Ecosystem docs — `docs/ecosystem/`
Cross-repo ecosystem docs (architecture, debugging guides, Lambda inventory, etc.) live in the portal repo at `${VIVREAL_REPOS}/Vivreal_Portal_Mobile/docs/ecosystem/`. They're version-controlled and always available.

### When you see `${VIVREAL_REPOS}/...` in this doc or any agent prompt
Resolve it before reading. Never paste the literal placeholder into a Read or Bash command — substitute the actual path. Ecosystem docs are at `docs/ecosystem/` (no resolution needed).

### Cross-platform note
- **Windows:** use Git Bash or WSL — backslashes in paths are NOT cross-platform; always use forward slashes when invoking the Bash tool
- **macOS / Linux:** native bash works as-is
- **Setting env vars:** add to `~/.bashrc`, `~/.zshrc`, or your shell profile. Example: `export VIVREAL_REPOS="$HOME/repos"`

---

## Lazy standards reading — trigger map

**Role agents (coordinator, researcher, architect, coder, tester, reviewer, documenter, designer, vuln, growth, sentry):** do NOT eager-read this file. The path-resolution preamble above is the only mandatory read. Read sections of this file ONLY when your task touches one of the trigger areas below.

**System experts (main-api, secure-api, cms-api, event-handler, client-stack, portal):** do NOT load this file at all by default. You may consult a specific section if your findings explicitly need to align with portal-side conventions (rare).

| If the task touches… | Read these sections |
|---|---|
| `src/app/api/proxy/*` (any portal proxy route) | "The three-tier API rule" + "Proxy route factory" |
| `active_ctx`, `dbKey`, `groupID`, multi-tenant routing | "Auth & multi-tenancy" |
| MongoDB queries, indexes, write concerns | "Optimization principles" + read `docs/ecosystem/mongo_queries.md` |
| About to use the `mcp__mongodb__*` tools (query Mongo via MCP) | Read the `vivreal-db` skill first — it carries the multi-tenant routing + dbKey/group.key/bucketname rules. Prefer `/db-query` over raw `mcp__mongodb__find`. |
| `useAuth()` in app layout, hydration, SSR | "Hydration & SSR rules" |
| Lambda env vars, function names, CloudFormation | "AWS Lambda & Infrastructure Reference" + read `docs/ecosystem/aws-lambda-inventory.md` |
| CSP, cookies, CSRF, security headers | "Security non-negotiables" |
| Any test files — e2e, unit, or backend (writing OR editing) | "Testing rules" + "Backend testing conventions" |
| Integration manifests (`src/data/manifests/`) | "Conventions you'll see" |
| Removing cross-repo code (consumer → producer) | "Cross-stack removal ordering" |
| Anything not listed above | Skip this file. CLAUDE.md is sufficient. |

If a task obviously spans multiple trigger areas, read each relevant section once. Do not eager-load adjacent sections.

---

# Vivreal Portal — Shared Engineering Standards

This file is read by every bug-fix subagent BEFORE doing any work. It encodes the non-negotiable rules. If anything here conflicts with the project CLAUDE.md, CLAUDE.md wins.

## Tech stack quick ref
- Next.js 16 App Router, React 19, TypeScript 5 strict
- Four proxied backends: VR_Main_API (auth), VR_Secure_API (group/site/billing), VR_CMS_API (collections/integrations/media), VR_Outreach_API (sequences/contacts/booking — the `outreach/*` proxy routes, `NEXT_PUBLIC_OUTREACH_URL`)
- Public content delivery: VR_Client_API (read-only, applies publishDate/archived filters)
- All proxy routes at `src/app/api/proxy/*` run on edge runtime
- MongoDB multi-tenant — each group has its own DB identified by `dbKey`

## The three-tier API rule (NEVER VIOLATE)
| Context | Tool |
|---|---|
| Authenticated proxy routes (`/app/api/proxy/*`) | `createAuthAxios()` from `@/lib/api/axiosInstance` |
| Public main API (`NEXT_PUBLIC_MAIN_API`) | `publicAxios` from `@/lib/api/axiosInstance` |
| S3 presigned, service worker, AuthContext login | Native `fetch()` |

NEVER use native `fetch()` for proxy routes. Any 401/419 from a proxy route MUST redirect to login — only `createAuthAxios` does this automatically.

Errors from axios calls: use `getApiError(err, fallback)` from `@/lib/api/auth/helpers` — extracts the backend's `error.response.data.error` before falling back.

## Proxy route factory
- Most proxy routes use the `createProxyHandler()` factory in `src/app/api/proxy/_helpers/` — the **filesystem is the count reference** (CLAUDE.md's route table is a self-described "core snapshot — not exhaustive"). Classify factory-vs-manual by the `_helpers/createProxyHandler` **module path**, never a string grep — manual routes may import a single helper (e.g. `extractUpstreamError`) from that same module path without using the `createProxyHandler()` factory itself.
- Manual routes only justified for: cookie-setting, httpOnly cookie reads, heavy body transforms, complex param handling, **public no-`active_ctx` routes** (the factory 401s without `active_ctx` — `outreach/book/[slug]` ×3, `outreach/studio-demo/visit`, `outreach/demo-link/[code]`, `marketing/sandbox-lead`, `claim/verify`, `claim/complete`), **raw-header/idempotency forwarding** (`sites/instantiateTemplate` — `ProxyContext` exposes no raw request), **body-preserving error responses** (`user/delete-account` — a 409's body carries the blocker list the UI renders, and the factory collapses any non-2xx into a bare `apiError(message, status)`, same reason `user/update-email` is manual), and **non-envelope responses** (`media/share-image` streams bytes; the factory always terminates in `apiSuccess()`)
- Manual routes should unwrap upstream errors via the exported `extractUpstreamError()`/`extractUpstreamDetail()` from `_helpers/createProxyHandler` rather than a hand-rolled `data?.error` read — VR_Main_API sends bare-JSON-string error bodies, and a hand-rolled read against a string silently returns `undefined`. That was the exact bug that killed the login error branches in prod.
- All authenticated proxy routes MUST verify `active_ctx` via `verifyCtxEdge()`
- Helpers: `injectCtxParams()`, `filterParams()`, `cleanSearchParam()`. `injectCtxParams()` sets **`key`** (CMS convention) + `groupID`; Secure endpoints whose Joi validator names the tenant key `dbKey` reject `key` as unknown — set `dbKey`/`groupID` manually **instead** for those
- New portal surfaces ship "live but dark" behind `group.featureFlags.<flag>`, written only by operators at `/admin/flags`; the only live flag is `aiActionsEnabled` (`templatePicker` + `squareStorefront` retired 2026-07-29, both GA). Gated entry points **hide, never disable** (`useAgentAccess()` is the single gate). Absence of AI in a group's UI is the expected default, not a bug
- The portal is **light-only** — a bare `dark:` Tailwind utility is a regression (no `@custom-variant dark`; it resolves against the OS scheme)

## Auth & multi-tenancy (CRITICAL)
- `active_ctx` JWT contains: `groupID`, `dbKey`, `bucketname`, `exp`
- mainDb queries: ALWAYS use `{ _id: groupID }`. NEVER `groupName`.
- Tenant DB queries: scoped via `dbKey`, served from `general_shared` (free/basic/pro) or `pro_plus`
- Tier → DB routing handled by VR_Client_Auth authorizer for client API; portal proxy uses `dbKey` from active_ctx directly

### The three key fields — DO NOT CONFUSE (common source of bugs)

| Field | Source | Value example | Used for |
|---|---|---|---|
| `dbKey` | `deriveDbKey(group)` in `contextCookieFns.js` | `general_shared`, `pro_plus`, or slugified groupName (enterprise) | **Database routing** — `dynamicDb[dbKey]` selects the tenant MongoDB database. This is the `key` query param passed to CMS API. |
| `group.key` | Stored on the group document in mainDb | `thecomedycollective` | **S3 bucket naming** — bucket is `vivreal-{group.key}`. Also used for display/URL slugs. NOT the database key. |
| `bucketname` | `${group.type}-${group.key}` | `collection-thecomedycollective` | **S3 object path prefix** — used in media upload/retrieval paths. |

**`deriveDbKey()` logic** (defined in `VR_Secure_API/src/userAndAuth/services/contextCookieFns.js`):
```
free/basic/pro  → 'general_shared'
proplus         → 'pro_plus'
enterprise      → slugify(group.groupName)
fallback        → group.database (legacy)
```

**Where `dbKey` is set in `active_ctx`:**
- `profileSwitch.js` — `const dbKey = deriveDbKey(foundGroup)`
- `updateDefaultProfile.js` — same
- `createGroup.js` / `joinGroup.js` — same mapping inline

**The `databaseDict` pattern you'll see in backend code** (e.g., `oauthCallback.js`) is the SAME tier→DB mapping as `deriveDbKey()`. When you see `databaseDict[group.tier]`, that IS the correct `dbKey` — do NOT "fix" it to `group.key`.

### MCP skill usage for database queries
- **`vivreal-db-explorer:db-schema`** — Use to inspect Mongoose schema, indexes, and sample docs for any collection. Invoke during research before reasoning about data shape.
- **`vivreal-db-explorer:db-query`** — Safe MongoDB queries with built-in dbKey routing and multi-tenant safety guards. ALWAYS prefer this over raw `mcp__mongodb__find`. It handles `general_shared`/`pro_plus` routing automatically.
- When querying via MCP tools directly, remember: `_id` fields require `{"$oid": "..."}` syntax, `groupID` on tenant objects is a string (not ObjectId), `collectionObj.refID` is a string.

## Security non-negotiables (OWASP-aware)
- CSRF: double-submit cookie on all state-changing proxy routes (`src/lib/csrf/`)
- Rate limiting: `src/proxy.ts` on auth endpoints (10 attempts / 15 min / IP) and the public demo-claim routes (`claim/verify` 30 / `claim/complete` 10 per 15 min per IP)
- Visitor IP in public edge routes: read `CloudFront-Viewer-Address` (strip the trailing `:port`), fall back to `X-Forwarded-For` only when absent, **never** `x-real-ip` (CloudFront strips it) — see `api/proxy/claim/_shared.ts`, `outreach/book/_forward.ts`, `outreach/studio-demo/visit`
- `src/proxy.ts` short-circuits ALL `/api/proxy/` matcher paths right after rate limiting — the proactive `active_ctx` refresh must never run on a proxy request, because rewriting `active_ctx` mid-flight desyncs the CSRF token (it's `HMAC(CTX_SECRET, 'csrf:' + active_ctx)`). Don't add a proxy POST path to the matcher expecting refresh behavior there — that's the csrf-desync class of bug.
- HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy in `next.config.ts` — don't break them
- Cookies: `secure: true` forced in production
- Never log secrets. Never echo JWT contents in errors.
- Validate redirect URLs against an allowlist (open redirect prevention)
- Output escape user data — never `dangerouslySetInnerHTML` user content
- Mongo injection: never pass raw user input as query operator keys

## Code quality non-negotiables
- No `any` (use `unknown` and narrow)
- No `as` casts without an inline comment explaining why
- No silent catches. Always handle or rethrow with context.
- No TODO without ticket reference
- No commented-out code
- No dead code, unused imports, "future use" parameters
- No premature abstraction (rule of three: don't extract until 3 callers exist)
- Functional components only. Named exports preferred (except Next.js pages).
- File naming: `PascalCase` components, `camelCase` fns/vars, `kebab-case` files, `UPPER_SNAKE_CASE` constants

## Performance non-negotiables
- No N+1 queries (use `$in` or aggregate pipelines)
- No unbounded loops on the request path
- Big-O justified for any new loop/sort over user-controlled input
- Heavy libs (recharts, codemirror) lazy-loaded
- React Query usage minimal — prefer existing axios patterns
- No re-render thrash: `useMemo`/`useCallback` only when there's a measurable problem
- Edge runtime is constrained — no Node-only APIs in proxy routes

## Hydration & SSR rules
- Any `useAuth()` in app layout MUST use `useHydrated()` guard
- No `Date.now()` / `Math.random()` in initial render path
- `force-dynamic` preserved on dashboard routes
- Server vs client: default to Server Components, mark `'use client'` only for interactivity

## Testing rules
- All E2E tests in `e2e/`. Import from `e2e/fixtures/global-setup` or `e2e/fixtures/auth-setup`. NEVER import from `@playwright/test` directly.
- **Logged-in specs authenticate with REAL signed ctx cookies** — `e2e/fixtures/ctx.ts` mints HMAC-SHA256 `active_ctx`/`user_ctx`/`csrf_token` with a test `CTX_SECRET`, run against a dedicated test dev server on port **3100** (`NEXT_DIST_DIR=.next-test` isolation) with all backend env vars pointed at a **mock upstream on port 4600** (`e2e/mock-upstream/`). Because the signature is genuinely valid, `verifyCtxEdge()` and CSRF pass with zero source bypasses — `serverFetchDirect()` calls from server components now genuinely reach the mock upstream too, not just browser-side `page.route()` intercepts.
- **Mock-upstream handlers return RAW upstream shapes**, not the portal's `{success,data,error}` envelope — the proxy route applies the envelope on top, same as it does against the real backends.
- Reuse the api-mock functions in `e2e/fixtures/api-mocks.ts` before adding (don't trust any hardcoded count — check the file).
- React 19: wait for `__reactProps` on elements before clicking. Use `pressSequentially()` for stubborn controlled inputs.
- **Coverage map**: `e2e/coverage-map.json` + `scripts/check-coverage-map.mjs --strict` (run in pre-push) is a mechanical route→spec evidence gate. A new or changed proxy route needs a coverage-map entry or the gate fails.
- **`e2e/BASELINE.md` is the authoritative test inventory** — total/pass/annotated-skip counts, with each skip's reason. Re-measure before quoting a number; never trust a remembered one.
- Sites/integrations pages serialized under parallel workers — don't break that.
- Tests must FAIL on the unfixed code. Verify by reading test logic vs original buggy code.
- **Assert CORRECT behavior, never current behavior.** Expected values come from the spec/intent — NEVER from pasting whatever the code currently emits. Snapshotting output freezes the bug into a "requirement."
- **A failing test means the CODE is wrong until proven otherwise.** Fix the code. Change a test ONLY to correct a genuinely-wrong expectation, with a one-line reason in a comment. NEVER weaken an assertion (`toBe`→`toContain`, exact→`anything()`, deleting a check) or align new code to a buggy expectation just to go green — the reviewer treats that as test-tampering and FAILs the pass.
- No `.only`, no `sleep()`, use `waitFor()`.
- **Repo lint must stay 0 errors / 0 warnings.** No new `eslint-disable` without a justification comment; `react-hooks/*` is scoped off `e2e/**` only (Playwright's `use(page)` false-positive) — don't widen that scope elsewhere.
- **There is no CI.** Husky pre-commit (lint-staged + vitest + coverage-map) and pre-push (repo eslint 0/0 + both tsc configs + vitest + coverage-map --strict + e2e smoke) are the ONLY gates. Never bypass with `--no-verify`.

## Site media rule
- Site media (logos, etc.) requires signed URLs via `GET /api/proxy/get-media`
- Never use raw `cdnUrl()` for site assets

## Cross-repo CLAUDE.md files (READ FIRST when touching that repo)
Every Vivreal repo has a CLAUDE.md at its root with conventions, patterns, and gotchas. ALWAYS read the relevant one(s) before researching, planning, or coding in that area.

| Repo | Path | Purpose |
|---|---|---|
| Portal (this repo) | `${VIVREAL_REPOS}/Vivreal_Portal_Mobile/CLAUDE.md` | Frontend Next.js portal (198 proxy routes: 167 factory + 31 manual, as of 2026-08-15 — filesystem is the count reference) |
| VR_Main_API | `${VIVREAL_REPOS}/VR_Main_API/CLAUDE.md` | 4 Lambdas — auth/signup, transactional + lifecycle + billing-rules email, web-push notification consumer, Meta callbacks |
| VR_Secure_API | `${VIVREAL_REPOS}/VR_Secure_API/CLAUDE.md` | 15 Lambdas — group, billing, sites, profile, OAuth, Square refresh, Shopify token refresh, AI agent, analytics, alarm verifier, template-instantiate worker + its DLQ consumer |
| VR_CMS_API | `${VIVREAL_REPOS}/VR_CMS_API/CLAUDE.md` | 5 Lambdas — collections, integrations, media/derivatives, webhooks, audit, versioning |
| VR_Client_API | `${VIVREAL_REPOS}/VR_Client_API/CLAUDE.md` | Public content delivery + Stripe/Square checkout (publishDate filter) |
| VR_Client_Auth | `${VIVREAL_REPOS}/VR_Client_Auth/CLAUDE.md` | TOKEN authorizer for VR_Client_API (Serverless Framework, not SAM) |
| VR_Outreach_API | `${VIVREAL_REPOS}/VR_Outreach_API/README.md` | 4 Lambdas — sequences, contacts/companies, booking, SES send/replies (`/prospects` retired 2026-07-27; no CLAUDE.md on main — README + docs/ are truth) |
| Vivreal_Templates | `${VIVREAL_REPOS}/Vivreal_Templates/CLAUDE.md` | Universal site template — every site's Amplify app builds the shared **`stable`** channel branch (per-customer branches are DEAD, Phase 2 2026-07-15); releases via the promote-stable workflow (main→stable FF). CLAUDE.md refreshed 2026-08-09 |
| vivreal-site-renderer | `${VIVREAL_REPOS}/vivreal-site-renderer/CLAUDE.md` | `@hillbombcreations/site-renderer` **1.50.0** — publishing hits every live customer site. CLAUDE.md stale at 2026-07-27 — trust `package.json` for the version |
| VR-MCP-Server | `${VIVREAL_REPOS}/VR-MCP-Server/CLAUDE.md` | MCP server with 69 CMS tools (TypeScript, OAuth 2.1; tier-gated via TOOL_MIN_TIER) |
| VR-Outreach-MCP-Server | `${VIVREAL_REPOS}/VR-Outreach-MCP-Server/CLAUDE.md` | Internal outreach MCP server (50 tools, 9 modules, 0 prompts — prospects tools retired 2026-07-27) |
| VR_Analytics_API | `${VIVREAL_REPOS}/VR_Analytics_API/README.md` | First-party analytics ingest + rollup (no CLAUDE.md — README is truth) |
| VR_OnCall_Agent | `${VIVREAL_REPOS}/VR_OnCall_Agent/CLAUDE.md` | On-call agent (auto-investigates Sentry incidents via GitHub Actions) |
| VR_OnCall_Webhook | `${VIVREAL_REPOS}/VR_OnCall_Webhook/CLAUDE.md` | Sentry-webhook receiver → triggers VR_OnCall_Agent |
| Vivreal_EventHandler | `${VIVREAL_REPOS}/Vivreal_EventHandler/CLAUDE.md` | Step Functions site deployment pipeline (Serverless Framework, not SAM) |
| Vivreal_Site_Migrator | `${VIVREAL_REPOS}/Vivreal_Site_Migrator/README.md` | Migration (`/migrate`) + template/identity-kit (`/template`) pipelines (no CLAUDE.md — `docs/migration-flow.md` + `docs/template-flow.md` are truth; README stale) |
| vivreal-content | `${VIVREAL_REPOS}/vivreal-content/knowledge/README.md` (+ `content/README.md`; repo-root CLAUDE.md lags at 2026-06-25) | Content studio — voice/strategy knowledge base + social **video production pipeline** (footage library → edit brief → draft render; 6 agents, 5 slash commands). Canonical brand voice = `knowledge/01-voice-and-rules.md` |
| Vivreal_SSR_Landing | `${VIVREAL_REPOS}/Vivreal_SSR_Landing/AGENTS.md` (+ `docs/`) | vivreal.io marketing/landing site — blog runs on **live CMS data** (server-only `API_KEY` → `/tenant/collectionObjects`, ISR `revalidate = 120`; never `NEXT_PUBLIC_` the key). Deploy gotchas: `amplify.yml` bakes `API_KEY` + `NEXT_PUBLIC_*` into `.env.production` for SSR; `next.config.ts` bypasses the broken Amplify image optimizer (covers from `public/blog-covers/`) |
| vivreal-edit-extractor | `${VIVREAL_REPOS}/vivreal-edit-extractor\` | EditDNA extraction tooling (companion to vivreal-content) |
| Vivreal_Docs | `${VIVREAL_REPOS}/Vivreal_Docs\` | Public docs site (Next.js, content under `content/`) |
| Vivreal-Schemas | `${VIVREAL_REPOS}/Vivreal-Schemas\` | Shared Mongoose schemas package — **v1.29.0** (1.26 site-chrome fields, 1.27 Stripe billing block + dbKey, 1.28 webhook `system`, 1.29 `featureFlags`); consumers on ^1.29.0 except VR_Client_Auth at ^1.27.0 |
| Vivreal-Tier-Quotas | `${VIVREAL_REPOS}/Vivreal-Tier-Quotas\` | Shared `@hillbombcreations/tier-quotas` package v3.1.0 (owns all tier quotas; sentinel scheme: -1 unlimited, 0 no access; 3.1.0 adds `aiSiteEditing`/`aiComponentGen` capability flags) |

All backends: Express + serverless-express, JavaScript (not TS), Mongoose, Pino, AWS SAM (except VR_Client_Auth + Vivreal_EventHandler = Serverless Framework). X-Ray is retired where touched recently (Client/Secure) — Sentry is the telemetry layer.

**Citation rule for docs in this plugin repo:** cite function/route/file names, not line numbers — `src/foo.js:123` rots in weeks. Stamp `Last synced: YYYY-MM-DD` when syncing a doc to source (log in vivreal-skills `docs/SYNC.md`).

## AWS Lambda & Infrastructure Reference

**Full inventory:** `docs/ecosystem/aws-lambda-inventory.md` — READ THIS when debugging Lambda config issues, env var mismatches, deployment failures, or cross-function communication. It maps every Lambda function name → repo → CloudFormation fragment → env vars → stack.

### Quick reference — function counts per API (verified 2026-08-15)
| API | Prod Lambdas | Has WebSocket | Deploy Trigger |
|---|---|---|---|
| VR_Secure_API | 15 (7 request + analyticsSnapshot + squareTokenRefresh + squareRefreshOne + shopifyTokenRefresh + webhookDelivery + alarmVerifier + instantiateTemplateWorker [direct-invoke] + instantiateTemplateWorkerDlqConsumer; websocket stack is separate) | 4 of 15 | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_CMS_API | 5 | All 5 | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_Main_API | 4 (express + email consumer + notification consumer + lifecycle scan) | 1 of 4 | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_Outreach_API | 4 (apiHandler + cronTick + processBounce + processInboundReply) | No | Push to main/dogfood |
| VR_Client_API | 1 (+ CloudFront edge distribution `client.vivreal.io` in the same SAM stack) | No | Release train: push to `stable`; see repo `docs/RELEASE.md` |
| VR_Client_Auth | 1 (Node 18, Serverless Framework) | No | Push to main |
| EventHandler | 27 (12 site-deploy incl. updateSiteEnvVars + subdomainCleanup + 9 domainPurchase incl. reconciliation cron + 6 domainTransfer — 3 state machines: deploy + purchase saga + transfer saga) | No | Push to main |
| VR_Analytics_API | 2 (ingest [public Function URL] + rollupCron) — LIVE, stack `vr-analytics-api` | No | Push to main |

### Release trains (2026-08-15)

**"Merge to `main` = prod deploy" is DEAD in five repos: Vivreal_Portal_Mobile, VR_Secure_API,
VR_CMS_API, VR_Main_API, VR_Client_API.** Production now deploys from the fixed `stable` branch
via a release train. Merging `main` in those repos deploys NOTHING — portal's `main` is an
Amplify build canary with no traffic; the four backends fire zero workflow runs on a `main`
push. Still deploying on push to `main` (unchanged): VR_Outreach_API, VR_Client_Auth, and
everything else.

The train is the same shape in all five repos:
- Friday 5pm PST cron (`0 1 * * 6` UTC) — `release-cut.yml` cuts `release/vX.Y` from `main`,
  bumps `package.json` on the line only, and tags `vX.Y.0`. Portal's cut also writes a served
  `public/release.json` marker.
- Monday promote crons are STAGGERED, backends ahead of portal: Secure 15:00 UTC, CMS 15:15,
  Main 15:30, Client 15:45, portal 16:00 (≈7–8am PST). `promote.yml` force-with-lease moves
  `stable` to the newest line's tip — a tagged cut ships as `vX.Y.0`; an untagged tip (backports
  landed after the cut) auto-mints, tags, and ships the next PATCH `vX.Y.Z+1` (since 2026-08-19;
  the cron refuses only when the line's last tag is yanked).
- Incremental release / backport = PATCH, never a new minor (2026-08-19, all five repos).
  `backport.yml` cherry-picks main-merged commits onto a line (`-m 1` for PR merges) and pushes
  — no tag, no bump, no deploy. Ship now: dispatch `promote.yml` with `target=release/vX.Y`
  (tags `vX.Y.Z+1`). Ride Monday: do nothing — the cron mints the patch. Hand-written fixes
  still go local: commit on the line, push (husky gate runs), then dispatch the promote.
  **NEVER dispatch `release-cut.yml` to ship a backport** — a cut forks a NEW minor line off
  ALL of `main` (the 2026-08-19 v2.3.1→v2.4.0 mistake).
- `rollback.yml` (dispatch-only) moves `stable` back to a prior `v*` tag and yanks it
  (`yanked-vX.Y.Z` tags block cron re-deploys of that version).
- Deployed-version check: portal `curl https://vivreal.io/app/release.json`; backends
  `git ls-remote origin refs/heads/stable` + the tag + the deploy run log.
- Each repo's `docs/RELEASE.md` is the full runbook — read it before touching that repo's
  deploy config.

**Two platform gotchas proven in the live drills:**
1. **Amplify autobuild fires only for never-built commits** (portal). A rollback, or a
   re-promote to an already-built commit, repoints `stable` but triggers NO build — prod keeps
   serving the old build. Mandatory after a portal rollback:
   `aws amplify start-job --app-id d2e6e3kdfrrxak --branch-name stable --job-type RELEASE`.
2. **GitHub Actions fires NO push run for a force-push that REWINDS a branch to an ancestor**
   (Client drill) — which is every backend rollback (forward re-points, even of already-pushed
   commits, DO fire). Mandatory after any backend rollback:
   `gh workflow run lambda_api.yml --ref stable`.

Portal's prod path: CloudFront distribution E39DUKXYGXCX8Q's origin is
`stable.d2e6e3kdfrrxak.amplifyapp.com` (swapped from `main.` — the distro is NOT CFN-managed).

### Infrastructure stacks (workflow_dispatch — manual trigger from GitHub Actions)
| Stack | Repo Location | Workflow |
|---|---|---|
| `vivreal-websocket` | `VR_Secure_API/websocket/` | `.github/workflows/websocket.yml` |
| `Vivreal-Media-CDN` | `VR_Secure_API/cloudformation/media-cdn.yaml` | `.github/workflows/media-cdn.yml` |

### Secrets Manager (per-service `vivreal/prod/*` — secrets-audit Phase 2, 2026-07)
The monolithic `hb-api-secrets` is retired. Every backend now resolves secrets at deploy time from per-service secrets (`vivreal/prod/secure-api`, `vivreal/prod/cms-api`, `vivreal/prod/client-api`, `vivreal/prod/client-auth`, `vivreal/prod/main-api`, `vivreal/prod/analytics`, `vivreal/prod/oncall`, `vivreal/prod/site-deployment`) plus shared secrets (`vivreal/prod/{core,stripe,social-oauth,github-app,vapid}`) and non-secret config from SSM `/vivreal/prod/*` params. Values were copied verbatim — env var names unchanged. Key categories: Database (`CLUSTER_URL`), Auth (`CLIENT_ID`, `USERPOOL_ID`), Stripe, WebSocket (`WS_ENDPOINT`, `WS_TABLE`), OAuth providers, Encryption, CDN/Media signing, Push (VAPID), Agent (Anthropic + GitHub App), Comms (Slack/Discord/SES).

### When to consult the Lambda inventory
- **Env var mismatch bugs** — check which functions have which vars, verify against CloudFormation fragment
- **"Function not found" errors** — get the exact function name (they have random suffixes)
- **Cross-function invokes** — `CREATE_UPDATE_COL_GROUPS_FUNCTION_NAME`, `GET_COLLECTION_INFO_FUNCTION_NAME`, `UPDATE_SITE_ENV_VARS_LAMBDA` are env vars pointing to other Lambdas
- **WebSocket issues** — 10 functions across 3 APIs have `WS_ENDPOINT` + `WS_TABLE`
- **Deployment failures** — check which stack owns the function and how it deploys

## Ecosystem documentation (`docs/ecosystem/`)
Cross-repo ecosystem docs checked into this repo. Richer than per-repo CLAUDE.md files for ecosystem-wide questions. ALWAYS check the relevant ones during research before grepping blindly.

| File | When to read |
|---|---|
| `docs/ecosystem/ARCHITECTURE.md` | Overall system architecture, service boundaries |
| `docs/ecosystem/FRONTEND_APPLICATION.md` | Portal frontend structure, patterns, conventions |
| `docs/ecosystem/BACKEND_APIS.md` | All backend API surface, endpoint inventory |
| `docs/ecosystem/CLIENT_API_AND_AUTH.md` | Public content delivery API + authorizer |
| `docs/ecosystem/DATABASE.md` | MongoDB schemas, multi-tenant routing, indexes |
| `docs/ecosystem/mongo_queries.md` | Common query patterns, dbKey routing examples |
| `docs/ecosystem/CROSS_API_DEBUGGING_GUIDE.md` | How to trace bugs across the 3 backend services |
| `docs/ecosystem/AI_AGENT_SYSTEM.md` | Agent system vision and design |
| `docs/ecosystem/SITE_CREATION_PIPELINE.md` | EventHandler Step Functions flow |
| `docs/ecosystem/PRICING_AND_COSTS.md` | Tier quotas, pricing, overage rates |
| `docs/ecosystem/aws-ses-email-guide.md` | SES email integration |
| `docs/ecosystem/aws-lambda-inventory.md` | **Full Lambda inventory** — function names, env vars, stacks, CloudFormation fragments, Secrets Manager keys, WebSocket config |
| `docs/ecosystem/insights_architecture.md` | Cross-cutting architecture insights |
| `docs/ecosystem/multi-agent-workflow.md` | CloudWatch log group inventory by Lambda |

**Updating ecosystem docs:** If during a bug fix you discover ecosystem knowledge that is wrong or missing, the documenter is authorized to propose an update via Edit. Cite the bug slug so the change is traceable. Never wholesale rewrite — make targeted edits.

## Industry standards we follow
When justifying technical decisions, reference these public standards. The reviewer will demand evidence-based justification, and "industry best practice" without a citation does not count.

**Security**
- OWASP Top 10 (2021): https://owasp.org/Top10/
- OWASP ASVS (Application Security Verification Standard): https://owasp.org/www-project-application-security-verification-standard/
- OWASP API Security Top 10: https://owasp.org/API-Security/

**AWS**
- AWS Well-Architected Framework — Security, Reliability, Performance, Cost, Operational Excellence, Sustainability pillars
- AWS Lambda best practices: https://docs.aws.amazon.com/lambda/latest/dg/best-practices.html
- API Gateway WebSocket: https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-websocket-api.html
- Cognito best practices: https://docs.aws.amazon.com/cognito/latest/developerguide/security-best-practices.html
- Use the AWS docs MCP server (`mcp__awslabs_aws-documentation-mcp-server__*`) to fetch up-to-date docs

**Web platform**
- MDN Web Docs (https://developer.mozilla.org) — authoritative source for web platform APIs
- Web.dev (https://web.dev) — Google's perf, PWA, a11y, security guides
- WCAG 2.2 AA — accessibility standard for all UI work
- Web Content Accessibility Guidelines: https://www.w3.org/WAI/standards-guidelines/wcag/

**Frameworks**
- Next.js 16 docs: https://nextjs.org/docs (use Context7 MCP for current version-specific patterns)
- React 19 docs: https://react.dev (Server Components, hooks, Suspense patterns)
- TypeScript handbook: https://www.typescriptlang.org/docs/

**Code review and engineering**
- Google Engineering Practices: https://google.github.io/eng-practices/ (code review standards, CL author guide, reviewer guide)
- Google Testing Blog: https://testing.googleblog.com/

**Performance and reliability**
- Core Web Vitals: https://web.dev/vitals/
- Next.js performance docs: https://nextjs.org/docs/app/building-your-application/optimizing
- Big-O complexity must be considered for any user-input-driven loop or sort

**MongoDB**
- MongoDB docs: https://www.mongodb.com/docs/
- Mongoose docs: https://mongoosejs.com/docs/

**OAuth and identity**
- OAuth 2.0 RFC 6749 + 6750
- OAuth 2.1 draft (recommended baseline for new flows)
- Each provider's OAuth docs (Meta, X, LinkedIn, TikTok, Mailchimp, Shopify) — use Context7 MCP

When making a non-trivial decision, the architect/coder MUST cite the relevant standard. The reviewer MUST verify citations exist for non-obvious choices.

## Conventions you'll see and must respect
- Component pattern per feature: `Client.tsx` (interactive) / `Loader.tsx` (skeleton) / `Dialog.tsx` (modals)
- Route groups: `(app)` protected, `(public)` unauthenticated
- Base path `/app` set in `next.config.ts` — affects links and API routes
- Theme CSS vars injected at runtime in `Providers/index.tsx` `useEffect` from `siteData`
- Onboarding state in cookies (`src/lib/cookies/onboarding.ts`)
- Integration manifests in `src/data/manifests/` drive the integration UI — never hardcode integration logic

## Bug-fix workflow rules (binding for all phases)
1. Research before planning. Plan before coding. Approve before implementing. Always.
2. Fix the **root cause**, not the symptom.
3. **Zero scope creep.** Diff size matters. Drive-by refactors are forbidden inside a bug fix.
4. Tests must FAIL on the unfixed code (verifiable, not asserted).
5. Reviewer is adversarial by design. Accept that. Disagreement is escalated to the user, not negotiated away.
6. Every claim about code behavior cites `file:line`.
7. Documentation outlives the fix — write it for the engineer who finds this in 2027.

## Optimization principles (apply to every change)
- **Time complexity:** Big-O for loops over user-controlled input must be O(n log n) or better unless justified. Document the bound.
- **Space complexity:** No unbounded buffers. Stream where possible.
- **Network:** Minimize round trips. Batch where the API supports it (`$in`, bulk operations).
- **Bundle size:** Lazy-load heavy libs (recharts, codemirror, tiptap). Use dynamic imports.
- **Render perf:** Avoid layout thrash. Reserve heights for async content. Memoize only when measured.
- **Edge runtime:** Cold starts matter — keep edge handler dependencies minimal.
- **Caching:** Respect `force-dynamic` where set. Add cache only with explicit reason.
- **Database:** Index any new query path. Verify with `explain()`. Avoid full collection scans.
- **Lambda:** Stateless. No warm-instance assumptions. Reuse SDK clients across invocations.
- **Reliability:** Retries with exponential backoff for external calls. Idempotency keys for state-changing ops.
- **Security-by-default:** Validate input at every boundary. Escape output. Allowlist over blocklist.

## Workflow rules — additions to the original 7
8. Read `docs/ecosystem/` docs and the relevant repo CLAUDE.md before forming hypotheses. They contain knowledge that grep cannot surface.
9. Cite an industry standard (OWASP, AWS Well-Architected, Web.dev, MDN, RFC, Google Eng Practices) for any non-obvious technical decision. "Best practice" without a citation is not a justification.

## Backend testing conventions (different from frontend!)

The portal uses **Playwright e2e + e2e/fixtures** (see the spec files in `e2e/` or run `npx playwright test --list` for the current count) plus a Vitest unit layer. Backends are NOT Playwright. Don't confuse them. Every repo now carries ESLint + husky gates — none of this is CI-enforced (no GitHub Actions gate anywhere in this ecosystem); the local hooks are the only thing standing between a bad commit and `main`.

| Layer | Framework | Pattern | Coverage gate |
|---|---|---|---|
| Portal frontend | Playwright (619 tests / 96 specs per `e2e/BASELINE.md` — re-measure, don't trust this number) + Vitest unit (~257 files, `tests/unit/**`) | `e2e/**/*.spec.ts` via `e2e/fixtures`; `tests/unit/**` for pure logic | ESLint 0/0 + coverage-map --strict + husky pre-commit/pre-push, no CI |
| VR_Main_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | ESLint + coverage-ratchet gate. ⚠️ Tests can send REAL emails — never run the full suite with a prod `.env` |
| VR_Secure_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | ESLint + husky gate, 100%/100%/100%/100% coverage |
| VR_CMS_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | ESLint + husky gate, 100% coverage |
| VR_Client_API | Mocha + Chai + Sinon | `test/**/*.test.js` | ESLint + husky pre-push, 100% branch coverage |
| VR_Client_Auth | Mocha + Chai + Sinon (new test harness added 2026-08) | `test/**/*.test.js` | Test harness + husky gate |
| VR_Outreach_API | Mocha + Chai + Sinon + NYC | `test/**/*.test.js` | Husky pre-push gate, 98% coverage |

**Backend test conventions (read each repo's `test/CLAUDE.md` or `test/claude.md` first):**
- Tests are unit-style with **heavy mocking** via `test/helpers/loadWithMocks.js`
- Mock DB adapters, AWS SDK clients, sockets, service dependencies
- Endpoint-focused: cover route wiring, handlers, controllers, validators, services
- Branch coverage required: success path, validation failure, empty response, error branches
- Run: `npm run test:unit` (no coverage gate, faster) or `npm test` (with NYC 100% gate)
- `test/test.js` is legacy and NOT in the active glob — don't add tests there

**Backend test commands quick ref:**
```bash
# in any backend repo
npm run test:unit          # Mocha only, fast feedback
npm test                   # Mocha + NYC coverage gate (CI parity)
npm test -- --grep "name"  # Run a single test by name
```

## Skills available for the workflow

These skills are available via the Skill tool and SHOULD be invoked when relevant:

| Skill | When to use |
|---|---|
| `vivreal-fullstack:fullstack` | Bug spans portal → proxy → backend → DB. Scaffolds an end-to-end checklist across the stack with all the layers required. Use as a starting checklist for cross-repo bug fixes. |
| `vivreal-fullstack:fullstack-context` | Auto-loads cross-repo context when researching backend endpoints. Researcher should rely on the auto-trigger. |
| `vivreal-db-explorer:db-query` | Safe MongoDB queries with built-in dbKey routing, safety guards, multi-tenant boundaries. ALWAYS prefer this over raw `mcp__mongodb__find` calls. |
| `vivreal-db-explorer:db-schema` | Pulls Mongoose schema, indexes, sample doc for any collection. Use during research to understand data shape before reasoning about queries. |
| `vivreal-proxy-factory:proxy-route` | Generate a new factory-based proxy route. Use when adding a new proxy route is part of the fix. |
| `superpowers:systematic-debugging` | Use when the bug's root cause is unclear after initial research. |
| `superpowers:test-driven-development` | Use when writing the test FIRST is the right move (e.g. fix has multiple possible implementations and the test pins behavior). |
| `code-review:code-review` | Optional secondary review pass — coordinator may use this in addition to reviewer if a fix is high-risk. |

## Cross-stack removal ordering (consumer → producer)
<!-- learned from bug: remove-social-tier-tracking on 2026-04-10 -->

When a fix REMOVES code that crosses repos (shared package + backend + frontend), plan the work in the REVERSE of addition order. New features ship producer → consumer (shared package first so downstream can import); removals ship consumer → producer (frontend/backend stop importing, THEN the shared package deletes the symbols). Any other order leaves an intermediate commit where a live consumer still imports a deleted symbol, breaking downstream builds.

Researcher and architect default to the addition order out of habit — flag the inversion explicitly when the bug is a removal, not an addition.

## Default-renderer fallbacks for shared UI components
<!-- learned from bug: collection-object-initial-view-polish on 2026-04-10 -->

Shared sheet, dialog, drawer, and card components MUST NOT fall back to `JSON.stringify(obj)` (or any raw object dump) as developer-facing UI when a render-prop is omitted. These dev-only fallbacks ship to production the moment a new caller forgets the prop, and they look like a bug to users.

Pick one:
- Make the renderer prop **required** in TypeScript so the compiler forces every caller to either pass a renderer or explicitly opt out via a default re-export.
- Or supply a **real** default renderer that produces a label/value layout, narrows types via `typeof`/`instanceof` (never `as`), and hides internal metadata keys (`_id`, `__v`, timestamps) into a footer block.

The architect should flag any review that introduces an `Optional` render-prop with a `JSON.stringify` fallback.

**Skill invocation rule:** When an agent needs functionality covered by a skill, it should invoke the skill via the Skill tool rather than reimplementing. The reviewer will flag any agent that bypassed an applicable skill.

## File writing reliability (critical for all agents)
<!-- learned from observability-logging-audit on 2026-04-14 -->

### Proxy-route guard hook (deterministic)
The old prompt-based PreToolUse Write hook (which sometimes mis-fired on non-proxy files) was replaced by the deterministic `vivreal-proxy-factory/hooks/proxy-route-guard.cjs` — it exits 0 immediately for any path outside `src/app/api/proxy/**/route.ts` and never interferes with other writes. If it blocks a legitimate manual proxy route, add the route to its allowlist; do NOT route around the Write tool with heredocs or temp scripts.

### Bash heredoc quoting failures on Windows Git Bash
Bash heredocs (`<< 'EOF'`) break when the content contains:
- **Unmatched single quotes** (e.g., contractions like "doesn't", possessives, or code with apostrophes)
- **Triple-quoted strings** (Python `"""..."""` inside a heredoc)
- The shell tries to match quotes across the entire heredoc, causing `unexpected EOF` errors

**Fix:** For large multi-line content with potential quote issues, write a Python script to a temp file first, then execute it. Or use the Write tool after a Read.

### Subagent file write verification
Subagents (researcher, architect, etc.) sometimes claim they wrote a file but did NOT actually write it. The coordinator MUST verify every artifact exists after each agent dispatch:
```bash
ls -la "path/to/expected/file.md"
```
If the file is missing, the coordinator should write it from the agent's returned output rather than re-dispatching.
