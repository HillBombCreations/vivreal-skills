---
name: vivreal-analytics-knowledge
description: Use when working on Vivreal's first-party analytics — VR_Analytics_API (the collect→store→rollup pipeline), the Templates SiteBeacon, or the per-site traffic dashboard (VR_Secure_API read route + portal AnalyticsPanel). Covers the CloudFront+WAF → Lambda Function URL ingest chain (X-Origin-Verify, bot filter, Joi, per-IP rate limit, daily-salt visitor hash), the analytics_rollup DynamoDB design, the daily rollup cron into mainDb.site_traffic_daily, the LIVE auto-deploy status (GitHub Actions → CloudFormation) plus the still-gated W4 CDN egress meter, and where increment 2 lives. Triggers on: analytics, site traffic, beacon, SiteBeacon, visitor stats, page views, unique visitors, analytics_rollup, site_traffic_daily, first-party analytics, per-site dashboard, collect.vivreal.io, visitor hash, rollup cron, CDN egress meter, VR_Analytics_API. NOTE: this repo has NO CLAUDE.md, and README.md still self-describes as DEPLOY-GATED — STALE; the CI workflow + template.yaml are the truth.
---

# VR_Analytics_API — knowledge digest

Last synced: 2026-07-21

Vivreal's **first-party, privacy-first web-analytics pipeline**. Increment 1 (this repo) is **collect → store → rollup only**; increment 2 (the read API + dashboard) lives in `VR_Secure_API` + the portal. Node 20, AWS SAM, webpack — same conventions as the other backends. **No CLAUDE.md**; `C:\repos\VR_Analytics_API\README.md` is the deepest reference but its status header is **stale** (still self-describes as DEPLOY-GATED, internally contradicting the repo's own CI workflow) — trust this digest + `template.yaml`. The full design is `Vivreal_Portal_Mobile/docs/projects/vivreal-first-party-analytics/design.md` + `cost-analysis.md`.

**Status: LIVE (base pipeline).** `.github/workflows/lambda_api.yml` auto-deploys every push to `main` (and `workflow_dispatch`) via `aws cloudformation package`/`deploy` to stack `vr-analytics-api` (us-east-1). Secrets are per-service **`vivreal/prod/analytics`** resolved as CloudFormation dynamic references (`ORIGIN_VERIFY_SECRET`, `VISITOR_SALT_SECRET`, `CLUSTER_URL` — a missing key fails the deploy itself; no separate secrets preflight) plus SSM `/vivreal/prod/shared/*`. `@hillbombcreations/schemas` is pinned `^1.19.0` — published, the old `file:../Vivreal-Schemas` ref is gone — alongside `@aws-sdk/client-cloudwatch`. Deployed shape: 2 Lambdas, both nodejs20.x/arm64 — `IngestFunction` (`ingest.handler`, public Function URL `AuthType: NONE`, reserved-concurrency capped) + `RollupCronFunction` (`rollupCron.handler`, EventBridge `cron(0 6 * * ? *)`, reserved concurrency 1).

**⚠ STILL GATED: the W4 CDN egress meter.** `src/rollupCron/cdnRollup.js` + `src/shared/cloudwatchClient.js` `$inc` `cdnUsage.totalBytes` per group from `AWS/AmplifyHosting` `BytesDownloaded` (guarded sibling call in `rollupCron/main.js`). It must **co-release with VR_Client_API's CDN-402 neutralization** — enabling it alone reactivates a site-down gate. Keep it off until that ships.

## Pipeline (end to end)

1. **Beacon** — `Vivreal_Templates/src/components/SiteBeacon/index.tsx`, mounted in `layout.tsx`. Fires only on real deployed sites (`SITE_ID` set and ≠ `'preview'`); **on by default for every site**. Sends `{ s, h, p, r, w }` (siteId, hostname, path, referrer, screen width) as `text/plain` via `sendBeacon` (keepalive-fetch fallback) to `POST https://collect.vivreal.io/e` — no custom headers, no `application/json` (would trigger a CORS preflight). Do NOT confuse with `<SiteAnalytics>`, which reads `siteData.analytics` and emits the customer's own third-party tag (GA/Plausible/Fathom).
2. **CloudFront** — custom domain, `CachingDisabled`, optional WAFv2 WebACL (`EnableWaf`, default on: 3000 req/5min per-IP rate rule + AWS IP-reputation group). Injects the **`X-Origin-Verify` shared-secret header** via `OriginCustomHeaders`. Chosen over API Gateway purely on cost (~$150/mo saved at scale — README "Endpoint choice").
3. **Ingest Lambda** — Function URL, `AuthType: NONE`, reserved concurrency cap (`src/ingest/main.js`). Order: origin-verify check → 4KB body cap → UA bot filter → Joi validate → per-IP rate limit (120/min default, atomic DDB) → siteId→groupID resolve → daily-salt visitor hash → atomic DynamoDB writes. **Every application-level outcome returns 204** (bot, invalid, rate-limited, unknown site, error) — no prober can distinguish "processed" from "dropped"; only infra-layer checks return 403/404/405/413.
4. **DynamoDB `AnalyticsRollupTable`** — `PK=bucket`/`SK=sk`, PAY_PER_REQUEST, TTL'd. Atomic `ADD` counters per pv/page/ref/device/country; uniques via conditional-put dedup marker (2-day TTL) + total; an `active#{date}` site index so the cron Queries active sites instead of Scanning. ~7-8 writes/pageview.
5. **Rollup cron** — EventBridge `cron(0 6 * * ? *)` daily (`src/rollupCron/main.js`): Query the active-site index, cap top-20 pages/referrers + fold overflow into `(other)`, write **one bounded doc per (siteId, date)** to `mainDb.site_traffic_daily`. Concurrency capped at 5 (mainDb `maxPoolSize: 3`).

## Privacy — the uniques algorithm

`visitorHash = HMAC-SHA256(dailySalt, ip|ua|siteId)` where `dailySalt = HMAC-SHA256(VISITOR_SALT_SECRET, <UTC date>)` — Plausible's method. **Raw IP is never stored** (in-memory HMAC input only; Sentry `sendDefaultPii: false`). Salt rotates every UTC day → cross-day correlation impossible. Cookieless, no client storage. **Owner action before pitching EU customers:** a privacy-policy/DPA line describing the pseudonymization (flagged in `design.md` §9 + `visitorHash.js` header).

## Gotchas

- **siteId→groupID probes `ANALYTICS_TENANT_DB_KEYS`** (default `general_shared,pro_plus`), not a global index. A future enterprise tenant's dedicated DB must be added to that env list or its beacons are **silently dropped** (logged `info` only).
- **Origin-verify secret rotation requires a stack redeploy** — the value is baked into both the Lambda env and the CloudFront origin config via `{{resolve:...}}` at deploy time.
- Origin verify is a shared-secret header, NOT CloudFront OAC — OAC would force SigV4 payload hashes `sendBeacon` cannot send. Direct-to-Function-URL callers bypass WAF but still hit every Lambda-side defense.
- Cardinality capping happens at **cron time**, not ingest (race-free; ingest path stays write-only). Paths length-capped ≤300 chars at validation.
- `nodejs20.x` is EOL per cfn-lint — deliberately unfixed to match the fleet; needs a coordinated 5-backend bump, not a one-repo fix.

## Increment 2 — the read side (built, in other repos)

- **`VR_Secure_API`**: `GET /analytics/site/traffic` (`src/getGroupInformation/api/index.js`) — **tenant-gated, not admin-gated**: active_ctx groupID + a site-ownership check scoping `{_id, groupID}` so a foreign siteId 404s identically to a missing one (`services/getSiteTrafficReport.js`). Reads `site_traffic_daily`, top-10, cached via `siteAnalyticsCache`. Distinct from the `/admin/analytics/google-analytics/*` GA4 admin routes.
- **Portal**: proxy `src/app/api/proxy/analytics/site-traffic/route.ts`; dashboard `src/components/Sites/SiteDetail/AnalyticsPanel.tsx` (`AnalyticsEditor.tsx` alongside it edits the *third-party* tag, not this pipeline).

## Companions

`vivreal-templates-knowledge` (beacon host), `vivreal-secure-api-knowledge` (read route), `vivreal-portal-knowledge` (proxy + panel), `vivreal-db` (mainDb rules), `vivreal-iam-secrets` (`vivreal/prod/*` secrets layout).
