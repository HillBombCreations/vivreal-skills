# Sync 2026-08-15 — verified fact sheet (source: disk measurements + campaign artifacts)

Working notes for this sync only. Delete or keep as SYNC.md supporting doc after the sync.

## Verified counts/versions (measured 2026-08-15)

- Portal proxy routes: **198 total = 167 factory + 31 manual** (classify by `_helpers/createProxyHandler` module path; measured from disk).
  - New manual routes since last sync: `outreach/demo-link/[code]`, `user/delete-account` (both missing from the proxy-route-guard allowlist).
- VR_Secure_API Lambdas: **15** in `cloudYamls/allRoutes.yaml` (was 13; new: `ShopifyTokenRefreshFunction`, `AlarmVerifierFunction`). Websocket stack still separate.
- VR_Main_API Lambdas: 4 (unchanged). VR_Analytics_API: 2, LIVE (unchanged). EventHandler: 27 (unchanged).
- MCP tools: VR-MCP-Server 69, VR-Outreach-MCP-Server 50 (both unchanged).
- Renderer `@hillbombcreations/site-renderer`: **1.50.0** (was 1.42.1). Portal pins `^1.50.0`.
- Schemas 1.29.0 (unchanged), tier-quotas 3.1.0 required/installed (portal package.json still declares ^3.0.0 — unchanged nuance).
- Templates: Next.js **16.3.0** (CVE-clearing bump), renderer adoption tracked to 1.50.0.

## Portal testing/lint campaign (project/portal-frontend-testing-strategy, merged to main as PR #274, 2026-08-15)

Authoritative artifacts in the portal repo — cite these, don't restate their tables:
- `docs/projects/portal-frontend-testing-strategy/` — plan, ledger (`sdd-progress.md`), lint audit (`lint-repair.md`), **`prod-bugs-found.md`** (the consolidated prod-bug punch list, portal + all backends)
- `e2e/TESTING.md` (rewritten — full e2e guide), `e2e/BASELINE.md` (authoritative test inventory)

Facts:
- **E2E infra**: logged-in specs now use REAL signed-ctx auth — `e2e/fixtures/ctx.ts` mints HMAC-SHA256 `active_ctx`/`user_ctx`/`csrf_token` with a test `CTX_SECRET` injected via `playwright.config.ts` `webServer.env` into a dedicated test dev server on port **3100** (`NEXT_DIST_DIR=.next-test` isolation). All upstream env vars point at a **mock upstream on port 4600** (`e2e/mock-upstream/`, `"METHOD /path"`-keyed handlers returning RAW backend shapes — the proxy applies the envelope; `/__hits` endpoint proves env injection). The old `'mock-active-ctx-token'` literal (which 401'd every logged-in spec) is dead. An infra-canary spec + a fixture↔src crypto parity test pin the setup.
- **Suite size**: 619 e2e tests / 96 specs (471 pass, 144 honest annotated skips, 0 unresolved — `e2e/BASELINE.md` is the inventory; re-measure, never quote from memory). Vitest unit layer is now first-class: ~257 test files under `tests/unit/**`.
- **Coverage map**: `e2e/coverage-map.json` (58 routes) + `scripts/check-coverage-map.mjs` (`--strict` in pre-push) — mechanical route→spec evidence gate (comment-stripped goto-evidence check).
- **Lint**: repo-wide ESLint is **0 errors / 0 warnings**. Flat config (`eslint.config.mjs`): `react-hooks/*` family scoped OFF `e2e/**` only (Playwright's `use(page)` false-positive); generated artifacts ignored (`intg_dist/`, `public/sw.js`, `playwright-report/`, `test-results/`, `.browser-coverage/`) — flat config does NOT read .gitignore. Every surviving eslint-disable is justified + audited in `lint-repair.md`.
- **Gates (NO GitHub Actions CI — deliberate)**: husky pre-commit (lint-staged + vitest + coverage-map, ~44s) and pre-push (repo eslint 0/0 + both tsc configs + vitest + coverage-map --strict + e2e smoke with retries=1, ~6min). Full e2e runs are manual cadence.
- **CSP test seam**: `next.config.ts` appends `http://localhost:4600` to connect-src ONLY when `NEXT_DIST_DIR === '.next-test'` — prod header proven byte-identical.

## Portal prod-bug fixes that changed conventions (all merged 2026-08-15)

- **Upstream error unwrap consolidated**: `extractUpstreamError()` / `extractUpstreamDetail()` are now exported from `src/app/api/proxy/_helpers/` and used by manual routes too. VR_Main_API sends bare-JSON-string error bodies; the manual `user/login` route now unwraps them (login error branches — badUsername/incorrectPassword etc. — were DEAD in prod before this).
- **Proxy short-circuit (csrf-desync class fix)**: in `src/proxy.ts`, ALL `/api/proxy/` matcher paths short-circuit after rate limiting — the proactive ctx refresh can no longer rewrite `active_ctx` mid-flight on a proxy request (which desynced the CSRF token, e.g. on `agent/execute`).
- **Punch list**: `docs/projects/portal-frontend-testing-strategy/prod-bugs-found.md` is the single consolidated list (portal A/B/C series + backend E series). 19 fixed and deployed; still open: E7 (page-level reference counting — needs design), E11 (Sentry project setup), B4 root cause (usePermissions undefined-override).

## Backend fixes deployed 2026-08-15 (merge = prod deploy; all 5 PRs merged + deploys verified)

- **VR_Secure_API**: cross-tenant IDOR class fixed — tenant-scoped `{_id, groupID}` filters at the service layer AND validated-group precedence at the controller layer (query/body divergence no longer bypasses). CancelFlow retention offers now live (errorHandler forwards `err.code`). featureFlags route allowlist flip, last-admin guard, idempotency allowlist. Also new this window: account self-serve deletion, video-transcode bounding. **Test suite now 100/100/100/100 coverage with husky gate.**
- **VR_Client_API**: public content route no longer silently drops filters (>50 items / sparse-field bug); filter fan-out bounded (validator max 12 keys, existence checks sliced to 5). Media-signing completeness sweep. **ESLint + 100%-branch coverage gate + husky pre-push.**
- **VR_Main_API**: errorHandler forwards `err.code` upstream. Test-audit campaign fixed: quota seat-gate 0-seat bypass, callback-auth prototype-key bypass. **ESLint + husky coverage-ratchet gate.** ⚠️ Main API tests can send REAL emails — never run the full suite with a prod .env.
- **VR_Client_Auth**: deployed bundle now excludes non-runtime scripts/test/docs (seed script was shipping in the Lambda zip); authorizer Mongo-timeout hardening + new test harness (3 fail-closed defects closed).
- **VR_Outreach_API**: sender maps are now tenant-scoped (per-group); SNS replay guard; CSV error classification; Sentry header redaction. Coverage 71%→98% with husky pre-push gate.
- **Cross-repo**: coordinated 2026-08-11→14 testing campaign gave VR_Analytics_API, VR-MCP-Server, Vivreal_EventHandler, VR_CMS_API the same treatment (test suites + ESLint + husky + coverage gates). Several repos also share an Atlas half-open-connection teardown fix and a shared-SNS-alarm-topic repoint.

## Other drift themes (non-campaign, since 08-06)

- **VR_CMS_API**: new dashboard-insights aggregate endpoint (stock thresholds, signup dedup, cadence windows) + supporting index; Atlas teardown fix.
- **vivreal-site-renderer** 1.46→1.50.0: section-photo/hero.meta/full-bleed layouts, wrinsy parity kits, CTA band variants, RESALE-1/"Marlowe & Kept" kit, coordinated-products fix. CLAUDE.md stale (2026-07-27).
- **Vivreal_Site_Migrator**: RESALE-1 template kit + site-loader 0.3.5→0.3.9 schema/capability manifests; wrinsy migration cutover; verify-live gate hardening.
- **Vivreal_EventHandler**: site registration at creation (analytics ingest phase 0), subdomainCleanup Mongo pool-leak fix, Sentry env tagging.
- **VR-MCP-Server**: dbKey-routing/tier-gating fixes (bucket-slug routing, Pro Plus misreport), help-center docs tools.
- **Portal (non-campaign)**: dash simplification merged 08-11 (PR #271); dash-insights phase 1 ("Your week" sentences, dashboard-insights proxy route → CMS).
