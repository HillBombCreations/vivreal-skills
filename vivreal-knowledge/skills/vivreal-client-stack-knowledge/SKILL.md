---
name: vivreal-client-stack-knowledge
description: Use when working in the Vivreal public content-delivery stack — VR_Client_API (the public backend customer sites call to fetch content + run Stripe/Square checkout) and its front-door VR_Client_Auth (the Lambda authorizer validating per-group API keys); the ONLY backend pair on API-key auth, not Cognito. Covers the TWO CloudFront distributions (media.vivreal.io signed media vs the client.vivreal.io API edge cache — LIVE, Route53 cutover done 2026-07-21), the /tenant/* + /sites/:siteId routes (Site MCP, .ics feed), payments-provider resolution (resolvePaymentsProvider/squareTokenGuard), tier→database mapping, signed srcset derivatives, frozenCheck, and the publishDate gate. Triggers on: VR_Client_API, VR_Client_Auth, client authorizer, signed URL, CloudFront, edge cache, client.vivreal.io, CDN cache, frozenCheck, API key auth, tier database mapping, frozen group, publishDate gate, Square checkout, site MCP, stale or missing content on live site. Source of truth: C:\repos\VR_Client_API\CLAUDE.md + C:\repos\VR_Client_Auth\CLAUDE.md.
---

# VR_Client_API + VR_Client_Auth — knowledge digest

Last synced: 2026-08-15

The **public content-delivery stack**: deployed customer sites (Vivreal_Templates) call `VR_Client_API` to fetch content + run Stripe/Square checkout + send emails, and every request first passes `VR_Client_Auth` — a tiny custom Lambda authorizer that validates the group's API key and injects tenant context. **This pair is the only Vivreal backend using API-key auth (not Cognito).** Read `C:\repos\VR_Client_API\CLAUDE.md` and `C:\repos\VR_Client_Auth\CLAUDE.md` for depth — VR_Client_API's CLAUDE.md refreshed 2026-07-21 — current as of this sync (now documents both CloudFront distributions incl. client.vivreal.io).

## TWO CloudFront distributions — never conflate them

1. **Media CDN — `media.vivreal.io`** (existing). Serves **signed media URLs** for S3 media (images/video). Everything in the "Media" section below. `CDN_BASE_URL` env unchanged.
2. **API edge cache — `client.vivreal.io`** (NEW, W10). An `AWS::CloudFront::Distribution` in `sam-template.yaml` **in front of the API itself** (regional API Gateway origin), caching the deterministic published-content GETs for 60s. It caches API *responses*; it signs nothing.

"CDN behavior" questions must first establish WHICH distribution: blurry/missing/403 media → media CDN; stale-after-publish content, cache-hit-rate, or edge-TTL questions → API edge cache.

### The API edge cache (`client.vivreal.io`) in detail

- **Cache behaviors ONLY on the 3 content GETs** — `getCollectionObjects`, `getIntegrationObjects`, `getSiteDetails` — plus `/sites/*/feeds/schedule.ics`. The **default behavior is Managed-CachingDisabled**, so `/tenant/preview`, all POSTs (checkout, coupons, emails), and the MCP descriptors always reach origin.
- Custom `ContentCachePolicy`: cache key = **Authorization + Origin headers** (the per-tenant API key in the key prevents cross-tenant bleed), ALL query strings, no cookies; TTL Min 0 / Default 60 / Max 60; gzip + brotli.
- Custom `ContentOriginRequestPolicy`: forwards Authorization + Origin + the two CORS-preflight headers + all query strings. **Host is deliberately NOT forwarded** — CloudFront must send the execute-api hostname; tenancy resolves from Authorization, not Host.
- The three content GET controllers now send `Cache-Control: public, s-maxage=60, max-age=0` (was `private, max-age=60`) so the shared cache may store responses while browsers still revalidate.
- `CustomErrorResponses` set error-caching min TTL 0 for 4xx/5xx — transient errors are never cached-and-replayed; 402 is not a CloudFront-cacheable status anyway.
- Domain: `client.vivreal.io` alias + **us-east-1** ACM cert, gated by the optional `AcmCertificateArn` param (`HasCustomDomain` condition). Prod passes the `*.vivreal.io` wildcard ARN; DEV stays on `*.cloudfront.net`. **Route53 cutover DONE 2026-07-21** — `client.vivreal.io`'s A-alias points at the distribution and live traffic serves through CloudFront (verify with `Via`/`X-Cache` headers).
- Observability: `ClientApiCloudFrontLogsBucket` (locked-down, SSE, 90-day expiry), a `MonitoringSubscription` (CacheHitRate), a CloudWatch dashboard, and Throttles / ConcurrentExecutions (135) / Duration-p95 alarms behind the optional `AlarmNotificationArn` param.
- Per-tenant CDN byte metering off the edge logs (feeding `group.cdnUsage.totalBytes`) is a W11 TODO.

---

## VR_Client_Auth — the API-key authorizer (the front door)

A tiny, focused **custom Lambda authorizer** in front of VR_Client_API. Its only job: validate the incoming API key and return an IAM Allow/Deny policy + tenant context.

- **Input:** `event.authorizationToken` (raw API key from the `Authorization` header — **no `Bearer` prefix**) + `event.methodArn`.
- **Logic:** no token → Deny. Else connect to mainDb `Vivreal`, `groups.findOne({ apiKey: token })`. Found → Allow + context. Not found / any exception → **Deny (fail closed)**.
- **Allow context injected** downstream into VR_Client_API (read via `req.apiGateway.event.requestContext.authorizer`): `{ database, bucketName, groupID, groupName, frozen }`.

### Database routing (the decision, made at the edge — sticky dbKey Phase 5)

The authorizer now does `let database = foundGroup.dbKey || null` — the **persisted `group.dbKey` wins**; the tier branches are fallback for un-backfilled docs:

| Tier (fallback only) | `database` injected |
|---|---|
| `free`, `basic`, `pro` | `general_shared` |
| `proplus` | `pro_plus` |

This retired the latent divergence where the enterprise branch returned the literal `'enterprise'` while every other `deriveDbKey` returns `slugify(groupName)`. It matters more than it looks: **VR_Client_API derives nothing** (`src/scripts/tenantDb.js` takes the key as a parameter) — this authorizer IS the whole public read path. Same `dbKey` routing as the rest of the stack (see `vivreal-db`).

### Authorizer oddities / gotchas

- **Serverless Framework, not SAM** — the only Vivreal backend that is. Infra changes go in `serverless.yml`. (See `vivreal-lambda` for the deploy-outlier list.)
- **Node.js 18.x** — all other backends are Node 20. Upgrade when next deploying.
- **Authorizer result TTL = 1 second** (set in VR_Client_API's SAM template) — essentially no caching; every request hits this Lambda.
- **290s timeout** — intentionally long to survive cold-start + slow DB connect without auth failures.
- Fails closed: any DB error → Deny. MongoDB connection pooled (`readyState === 1` check). All logic in `index.js`; `groupSchema.js` mirrors the group doc; `scripts/db.js` is the pooled singleton.
- 2026-07: `@hillbombcreations/schemas` bumped to ^1.27.0; secrets moved to `vivreal/prod/client-auth` (Secrets Manager + SSM). NOT housekeeping-only — the sticky-dbKey authorizer change above shipped this cycle.
- **API Gateway stringifies the authorizer context it injects** — a boolean `frozen: false` reaches VR_Client_API as the string `"false"` (truthy!). Any consumer of context booleans must compare `=== true || === 'true'` (see frozenCheck below).

---

## VR_Client_API — the public content backend

The public content-delivery API. Single monolith Lambda, Express + serverless-express (Node 20, arm64), SAM, `@hillbombcreations/schemas` ^1.29.0. **API-key auth (not Cognito)** via VR_Client_Auth above. Reads tenant context from `req.apiGateway.event.requestContext.authorizer` — `database` / `groupID` / `groupName` / `bucketName` / `frozen`. Reserved concurrency **150** (raised from 120 after crawler bursts pegged the cap and throttled 792 requests); API GW throttle 50 rps / 100 burst. Secrets Phase 2: env resolves from `vivreal/prod/client-api` + `vivreal/prod/core` + SSM. (X-Ray is retired — Sentry only.)

### Routes — 9 `/tenant/*` + 4 `/sites/:siteId/*`, all behind `frozenCheck`

Tenant: `GET collectionObjects` (published only), `GET integrationObjects`, `GET siteDetails`, `GET preview` (bypasses publishDate), `POST createCheckoutSession` (dispatches Stripe or Square — see below), `POST validateCoupon`, `POST definedCollectionObject`, `POST sendContactEmail`, `POST sendOrderPlacedEmail`. Sites: the **Site MCP** (descriptor + `llms.txt` + MCP RPC with 7 read-only tools, DynamoDB rate-limited via `SITE_MCP_RATE_LIMIT_TABLE`) + `feeds/schedule.ics`.

> **Known drift (verified 2026-07-30, STILL live):** `/tenant/validateCoupon` STILL has an Express route but NO API-Gateway `Events:` entry in `sam-template.yaml` (would 403 at the gateway). The orphaned `/tenant/collection` event and the dead keyless `ApiUsagePlan` throttle were removed with the CloudFront work. (The template does carry an OPTIONS-only `/{proxy+}` event for CORS preflight — it does NOT rescue missing per-route events.)

### Payments-provider resolution (Stripe | Square)

`POST /tenant/createCheckoutSession` → `checkoutDispatch.js` → `resolvePaymentsProvider(groupID)` (reads mainDb `groups` `$elemMatch {type ∈ [stripe,square], active:true}`) → `'stripe'`/`null` delegates byte-untouched to the Stripe path (customer's OWN key); `'square'` → `resolveSquareKey(groupID)` → per-line `resolveSquareVariant` (matches `objectValue.variationId` on square `integrationObjects`; out-of-stock → 409 fail-closed) → `createSquareCheckoutSession()` via Square **CreatePaymentLink**, order-level `FIXED_AMOUNT`/`LINE_ITEM` discounts (exact integer subtraction, never per-unit rounding), `deriveIdempotencyKey` = SHA-256 over sorted priced lines.

`resolveSquareKey` gates (fail-closed → null): (1) token ONLY from an `accounts[]` entry with `scope:'group' && status:'active'` (never root fields — disconnected-root orphan trap); (2) token decrypted via `decryptSecret`/`ENCRYPTION_KEY`. The **Square kill switch is RETIRED**: the `featureFlags.squareStorefront` gate was removed from `resolveSquareKey` and `featureFlags` dropped from its projection; `.lean()` stays as a perf choice, no longer load-bearing. WARNING preserved: the flag's polarity was INVERTED (absent = ON; only an explicit `false` disabled checkout) — verified no prod group sat at `false` before removal. `squareTokenGuard`: >2 days to expiry → no-op; ≤2 days → fire-and-forget refresh; expired → sync `RequestResponse` invoke (4s abort) of **VR_Secure_API's `squareRefreshOne` Lambda** via `SQUARE_REFRESH_ONE_FUNCTION_ARN` (scoped `lambda:InvokeFunction` IAM).

### Publish gate — the "content not showing" cause

`GET /tenant/collectionObjects` returns only `publishDate <= now && !archived`. So missing content = `publishDate` is null (draft), in the future (scheduled), or stored as a **string instead of a Date** (silently dropped by the `$lte: new Date()` filter — type bracketing). Check `publishDate` type + value first. `preview` bypasses this gate. (Full rules: `vivreal-db`; the site-product/authoring angle: `vivreal-sites`.)

### Media — the media CDN (distribution 1): signed URLs only

Media served via `media.vivreal.io` with signed URLs (unsigned → 403) — this is the **media** distribution, not the `client.vivreal.io` API edge cache. `buildMediaUrl.js` builds the URL, `signCloudFrontUrl.js` signs with the CloudFront key pair (`CLOUDFRONT_SIGNING_KEY_PAIR_ID` from SSM; `CLOUDFRONT_SIGNING_PRIVATE_KEY` from Secrets Manager `vivreal/prod/client-api` — must be an RSA **private** key; public key → falls back to unsigned). `SignedUrlTtlSeconds` now defaults to **86400 (~24h)**, matching the live CI override — the old 300s default silently made non-CI deploys inert; wired to `CLOUDFRONT_SIGNED_URL_TTL_SECONDS`, decoupling signed-link TTL from cache length. The signed URL lands in `currentFile.source` on each media field — templates use it directly. Never build CDN URLs manually. **Signed srcset:** `resolveMediaUrl.js` returns `{name, source, srcset?}` — `buildSrcset` signs `${key}.${w}.${ext}` for widths `[320, 640, 1280]` (must match VR_CMS_API's `generateImageDerivatives.js`, which also writes a clamped source-resolution top rung for sources between ladder widths), emitted on collectionObjects/integrationObjects/preview/siteDetails read paths; files without derivatives degrade to `source` only. **Descriptor signing extended (2026-07):** `processSiteDetails.js` now signs previously-unsigned slots — `cta.{backgroundImage,backgroundVideo}`, media descriptors nested anywhere in `blocks[].config` (depth-bounded, cycle-safe walk), navigation `menuItems` + footer chrome media, `hero.background.slides[].{image,video,poster}` (carousel masthead — slide images stored as bare `{key,name,type}` descriptors never got `currentFile.source`, so live mastheads rendered words-only while local preview looked fine), and the top-level `emailPopup` image (its own pass, deliberately BEFORE the `mediaFields` early-return, writing `src` as well as `currentFile`); the earlier slots rendered as "no media" before because renderer consumers read only the inlined `currentFile.source`. (Infra view: `vivreal-media-cdn`.)

### frozenCheck

`frozenCheck` middleware reads `frozen` from authorizer context and returns 400 (`GroupFrozen`, "The group is frozen") on every route for suspended groups. **P0 fix (2026-07):** API Gateway stringifies authorizer context, so `frozen: false` arrived as the truthy string `"false"` and threw GroupFrozen on 18 non-frozen groups fleet-wide (triggered by the schemas 1.15.1→1.22.0 redeploy). `frozenCheck.js` now compares `=== true || === 'true'`.

### Quota gates — BOTH neutralized (CDN W4, API W12): over-cap never 402s

`checkCdnUsageLimit` in `trackApiUsage.js` **no longer hard-402s** groups over their CDN cap — it falls through to `allowed: true`. Vivreal absorbs the overage and meters it via `cdnUsage.totalBytes`; customer sites never go down for CDN usage, and availability is bounded by the infra kill-switch, not this gate. **API-quota exhaustion no longer 402s either (W12 step-3, resolved 2026-07):** over-quota without overage enrollment falls through to `allowed: true` in `src/scripts/trackApiUsage.js`, still metered via `apiUsage.totalCalls`. Driver: the W6 package-authoritative flip dropped two free-tier groups' effective quota below accumulated usage and both customer sites served empty pages for days. The only remaining tenant-path blocks are `frozenCheck` and the spending-cap 402s (overage-enrolled groups only); `src/api/handlers.js` logs `usageCheck.reason` on the surviving 402. Quota reads are package-authoritative (W6, tier-quotas ^3.0.0): `getApiQuota`/`getCdnQuota`/agent spending-cap read `getTierQuotas(tier)` — the doc-first arms and six self-heal/mirror writes (with their redundant socket broadcasts) are gone.

### Adding a route — the per-route SAM-event rule

VR_Client_API is **SAM** (`sam-template.yaml`) with **one explicit API Gateway event per route** — there is **no catch-all `{proxy+}` integration** (the only greedy event is OPTIONS-only, for CORS preflight). Adding the Express route is not enough: if the gateway has no event for the path, the request never reaches Express and is rejected at the edge (it falls through to the default IAM-protected resource). **Always add the matching per-route event to the SAM template when you add a route.** `VR_Client_Auth` (the API-key authorizer) is **Serverless Framework** (`serverless.yml`) and only changes when the *authorizer* logic does — not for new content routes. (Same rule bites CMS as a 403 and Secure as a 502: `vivreal-lambda` deploy reference + `vivreal-auth-architecture`.)

### Gotchas

- **Array media-signing latent bug (fixed 2026-05-27, commit b3558ab):** the `targetField.name` pattern silently no-op'd on arrays; the bug lived in 5 duplicate copies (3 inline + 2 helpers). Galleries never signed despite appearing to work. Now one shared impl. Watch for regressions in media-signing helpers; `looksLikeMediaItem` requires `mimeType`. (Full bug class: `vivreal-media-cdn`.)
- Responses can be very large. CORS wide open with credentials (needed for customer sites). Over-cap NEVER 402s — both the CDN (W4) and API (W12) quota gates are neutralized (see "Quota gates — BOTH neutralized"); only `frozenCheck` and the overage spending-cap 402s remain on the tenant path.
- The old `basic/` + `ecommerce/` alternate-deploy dirs are DELETED — one deploy config now.
- arm64-only. Sentry 100% dev / 20% prod, filters `GET /health`. (`aws-xray-sdk` in package.json is vestigial — zero code refs.)
- This is the **public unbounded service** — its connection-manager health is critical (gold-standard connection mgmt: dedupe + dead-socket invalidation + rethrow). Saturating Atlas conns here can 500 the whole platform — it's the one capped via reserved concurrency. See `vivreal-atlas-topology` + `vivreal-lambda`.
- **Public content GET filter-drop fix (2026-08)**: `getCollectionObjects` was silently dropping requested filter keys when a collection had >50 items or a sparse field — sampling now falls back correctly. Filter fan-out is bounded server-side: validator caps `filters` at 12 keys, existence checks sliced to 5.
- **Media-signing completeness sweep (2026-08)**: sites with no `mediaFields` registry now get page/hero/cta/chrome media signed too — closed gaps in the cta subtree (band-variant `art[]`), the two wordmark seats (`hero.wordmark.image`, `footer.wordmark.imageKey`), `hero.collage[]`/`hero.overlays[]`, and per-binding `sectionConfig` media.
- **VR_Client_API now has ESLint + a 100%-branch-coverage gate + husky pre-push** (measures `src/**`, not a hand-enumerated allowlist).
- **VR_Client_Auth**: Mongo timeouts are now bounded throughout the authorizer, with a new test harness that closed 3 fail-closed defects; the deployed Lambda bundle now EXCLUDES non-runtime scripts/tests/docs (a seed script used to ship inside the authorizer zip).
- The consolidated prod-bug punch list (portal + all backends, fixed vs still-open) lives at `Vivreal_Portal_Mobile/docs/projects/portal-frontend-testing-strategy/prod-bugs-found.md`.

## Deploy model — release train (2026-08-15) — VR_Client_API only, NOT VR_Client_Auth

Merging VR_Client_API's `main` no longer deploys prod. Prod serves from the fixed `stable`
branch. Friday 5pm PST `release-cut.yml` cuts `release/vX.Y` from `main` and tags it; Monday
**15:45 UTC** `promote.yml` force-with-lease moves `stable` to the newest tag — Secure/CMS/Main
promote first, then Client, then portal last (16:00). Hotfix = commit on `release/vX.Y`, push
(husky gate runs), then dispatch `promote.yml` with `target=release/vX.Y` — tags `vX.Y.Z+1` and
ships it. Rollback (`rollback.yml`, dispatch-only) moves `stable` back to a prior tag and yanks
it — **but a force-push that REWINDS `stable` to an ancestor fires NO GitHub Actions push run**
(forward re-points do fire), so rollback must ALSO manually dispatch
`gh workflow run lambda_api.yml --ref stable` or the old build keeps serving. Full runbook:
`VR_Client_API/docs/RELEASE.md`. **VR_Client_Auth is UNCHANGED** — it still deploys straight off
a push to `main`, same as before.
