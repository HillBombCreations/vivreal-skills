---
name: vivreal-client-stack-knowledge
description: Use when working in the Vivreal public content-delivery stack — VR_Client_API (the public backend customer sites call to fetch content + run Stripe/Square checkout) and its front-door VR_Client_Auth (the Lambda authorizer validating per-group API keys); the ONLY backend pair on API-key auth, not Cognito. Covers the TWO CloudFront distributions (media.vivreal.io signed media vs the NEW client.vivreal.io API edge cache), the /tenant/* + /sites/:siteId routes (Site MCP, .ics feed), payments-provider resolution (resolvePaymentsProvider/squareTokenGuard), tier→database mapping, signed srcset derivatives, frozenCheck, and the publishDate gate. Triggers on: VR_Client_API, VR_Client_Auth, client authorizer, signed URL, CloudFront, edge cache, client.vivreal.io, CDN cache, frozenCheck, API key auth, tier database mapping, frozen group, publishDate gate, Square checkout, site MCP, stale or missing content on live site. Source of truth: C:\repos\VR_Client_API\CLAUDE.md + C:\repos\VR_Client_Auth\CLAUDE.md.
---

# VR_Client_API + VR_Client_Auth — knowledge digest

Last synced: 2026-07-21

The **public content-delivery stack**: deployed customer sites (Vivreal_Templates) call `VR_Client_API` to fetch content + run Stripe/Square checkout + send emails, and every request first passes `VR_Client_Auth` — a tiny custom Lambda authorizer that validates the group's API key and injects tenant context. **This pair is the only Vivreal backend using API-key auth (not Cognito).** Read `C:\repos\VR_Client_API\CLAUDE.md` and `C:\repos\VR_Client_Auth\CLAUDE.md` for depth — VR_Client_API's CLAUDE.md was refreshed 2026-07-18 (14 live routes, new env vars) but already predates the CloudFront edge cache, the CDN-402 neutralization, and the tier-quotas ^3.0.0 flip; prefer this digest + source for those.

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
- Domain: `client.vivreal.io` alias + **us-east-1** ACM cert, gated by the optional `AcmCertificateArn` param (`HasCustomDomain` condition). Prod passes the `*.vivreal.io` wildcard ARN; DEV stays on `*.cloudfront.net`. **The Route53 cutover is a separate MANUAL ops step, not yet done — prod traffic still hits the regional API Gateway domain directly.**
- Observability: `ClientApiCloudFrontLogsBucket` (locked-down, SSE, 90-day expiry), a `MonitoringSubscription` (CacheHitRate), a CloudWatch dashboard, and Throttles / ConcurrentExecutions (135) / Duration-p95 alarms behind the optional `AlarmNotificationArn` param.
- Per-tenant CDN byte metering off the edge logs (feeding `group.cdnUsage.totalBytes`) is a W11 TODO.

---

## VR_Client_Auth — the API-key authorizer (the front door)

A tiny, focused **custom Lambda authorizer** in front of VR_Client_API. Its only job: validate the incoming API key and return an IAM Allow/Deny policy + tenant context.

- **Input:** `event.authorizationToken` (raw API key from the `Authorization` header — **no `Bearer` prefix**) + `event.methodArn`.
- **Logic:** no token → Deny. Else connect to mainDb `Vivreal`, `groups.findOne({ apiKey: token })`. Found → Allow + context. Not found / any exception → **Deny (fail closed)**.
- **Allow context injected** downstream into VR_Client_API (read via `req.apiGateway.event.requestContext.authorizer`): `{ database, bucketName, groupID, groupName, frozen }`.

### Tier → database mapping (the routing decision, made at the edge)

| Tier | `database` injected |
|---|---|
| `free`, `basic`, `pro` | `general_shared` |
| `proplus` | `pro_plus` |

This is the same `dbKey` routing the rest of the stack uses (see `vivreal-db`), decided here at the edge for the public API.

### Authorizer oddities / gotchas

- **Serverless Framework, not SAM** — the only Vivreal backend that is. Infra changes go in `serverless.yml`. (See `vivreal-lambda` for the deploy-outlier list.)
- **Node.js 18.x** — all other backends are Node 20. Upgrade when next deploying.
- **Authorizer result TTL = 1 second** (set in VR_Client_API's SAM template) — essentially no caching; every request hits this Lambda.
- **290s timeout** — intentionally long to survive cold-start + slow DB connect without auth failures.
- Fails closed: any DB error → Deny. MongoDB connection pooled (`readyState === 1` check). All logic in `index.js`; `groupSchema.js` mirrors the group doc; `scripts/db.js` is the pooled singleton.
- 2026-07 housekeeping only: `@hillbombcreations/schemas` bumped to ^1.22.0; secrets moved to `vivreal/prod/client-auth` (Secrets Manager + SSM).
- **API Gateway stringifies the authorizer context it injects** — a boolean `frozen: false` reaches VR_Client_API as the string `"false"` (truthy!). Any consumer of context booleans must compare `=== true || === 'true'` (see frozenCheck below).

---

## VR_Client_API — the public content backend

The public content-delivery API. Single monolith Lambda, Express + serverless-express (Node 20, arm64), SAM, `@hillbombcreations/schemas`. **API-key auth (not Cognito)** via VR_Client_Auth above. Reads tenant context from `req.apiGateway.event.requestContext.authorizer` — `database` / `groupID` / `groupName` / `bucketName` / `frozen`. Reserved concurrency **150** (raised from 120 after crawler bursts pegged the cap and throttled 792 requests); API GW throttle 50 rps / 100 burst. Secrets Phase 2: env resolves from `vivreal/prod/client-api` + `vivreal/prod/core` + SSM. (X-Ray is retired — Sentry only.)

### Routes — 9 `/tenant/*` + 4 `/sites/:siteId/*`, all behind `frozenCheck`

Tenant: `GET collectionObjects` (published only), `GET integrationObjects`, `GET siteDetails`, `GET preview` (bypasses publishDate), `POST createCheckoutSession` (dispatches Stripe or Square — see below), `POST validateCoupon`, `POST definedCollectionObject`, `POST sendContactEmail`, `POST sendOrderPlacedEmail`. Sites: the **Site MCP** (descriptor + `llms.txt` + MCP RPC with 7 read-only tools, DynamoDB rate-limited via `SITE_MCP_RATE_LIMIT_TABLE`) + `feeds/schedule.ics`.

> **Known drift (verified 2026-07-21):** `/tenant/validateCoupon` STILL has an Express route but NO API-Gateway `Events:` entry in `sam-template.yaml` (would 403 at the gateway). The orphaned `/tenant/collection` event and the dead keyless `ApiUsagePlan` throttle were removed with the CloudFront work. (The template does carry an OPTIONS-only `/{proxy+}` event for CORS preflight — it does NOT rescue missing per-route events.)

### Payments-provider resolution (Stripe | Square)

`POST /tenant/createCheckoutSession` → `checkoutDispatch.js` → `resolvePaymentsProvider(groupID)` (reads mainDb `groups` `$elemMatch {type ∈ [stripe,square], active:true}`) → `'stripe'`/`null` delegates byte-untouched to the Stripe path (customer's OWN key); `'square'` → `resolveSquareKey(groupID)` → per-line `resolveSquareVariant` (matches `objectValue.variationId` on square `integrationObjects`; out-of-stock → 409 fail-closed) → `createSquareCheckoutSession()` via Square **CreatePaymentLink**, order-level `FIXED_AMOUNT`/`LINE_ITEM` discounts (exact integer subtraction, never per-unit rounding), `deriveIdempotencyKey` = SHA-256 over sorted priced lines.

`resolveSquareKey` gates (fail-closed → null): (1) `group.featureFlags.squareStorefront === true` — **`.lean()` is load-bearing** (strict schema hides featureFlags on hydrated docs); (2) token ONLY from an `accounts[]` entry with `scope:'group' && status:'active'` (never root fields — disconnected-root orphan trap); (3) token decrypted via `decryptSecret`/`ENCRYPTION_KEY`. `squareTokenGuard`: >2 days to expiry → no-op; ≤2 days → fire-and-forget refresh; expired → sync `RequestResponse` invoke (4s abort) of **VR_Secure_API's `squareRefreshOne` Lambda** via `SQUARE_REFRESH_ONE_FUNCTION_ARN` (scoped `lambda:InvokeFunction` IAM).

### Publish gate — the "content not showing" cause

`GET /tenant/collectionObjects` returns only `publishDate <= now && !archived`. So missing content = `publishDate` is null (draft), in the future (scheduled), or stored as a **string instead of a Date** (silently dropped by the `$lte: new Date()` filter — type bracketing). Check `publishDate` type + value first. `preview` bypasses this gate. (Full rules: `vivreal-db`; the site-product/authoring angle: `vivreal-sites`.)

### Media — the media CDN (distribution 1): signed URLs only

Media served via `media.vivreal.io` with signed URLs (unsigned → 403) — this is the **media** distribution, not the `client.vivreal.io` API edge cache. `buildMediaUrl.js` builds the URL, `signCloudFrontUrl.js` signs with the CloudFront key pair (`CLOUDFRONT_SIGNING_KEY_PAIR_ID` from SSM; `CLOUDFRONT_SIGNING_PRIVATE_KEY` from Secrets Manager `vivreal/prod/client-api` — must be an RSA **private** key; public key → falls back to unsigned). `SignedUrlTtlSeconds` now defaults to **86400 (~24h)**, matching the live CI override — the old 300s default silently made non-CI deploys inert; wired to `CLOUDFRONT_SIGNED_URL_TTL_SECONDS`, decoupling signed-link TTL from cache length. The signed URL lands in `currentFile.source` on each media field — templates use it directly. Never build CDN URLs manually. **Signed srcset:** `resolveMediaUrl.js` returns `{name, source, srcset?}` — `buildSrcset` signs `${key}.${w}.${ext}` for widths `[320, 640, 1280]` (must match VR_CMS_API's `generateImageDerivatives.js`, which also writes a clamped source-resolution top rung for sources between ladder widths), emitted on collectionObjects/integrationObjects/preview/siteDetails read paths; files without derivatives degrade to `source` only. **Descriptor signing extended (2026-07):** `processSiteDetails.js` now signs previously-unsigned slots — `cta.{backgroundImage,backgroundVideo}`, media descriptors nested anywhere in `blocks[].config` (depth-bounded, cycle-safe walk), and navigation `menuItems` + footer chrome media; these rendered as "no media" before because renderer consumers read only the inlined `currentFile.source`. (Infra view: `vivreal-media-cdn`.)

### frozenCheck

`frozenCheck` middleware reads `frozen` from authorizer context and returns 400 (`GroupFrozen`, "The group is frozen") on every route for suspended groups. **P0 fix (2026-07):** API Gateway stringifies authorizer context, so `frozen: false` arrived as the truthy string `"false"` and threw GroupFrozen on 18 non-frozen groups fleet-wide (triggered by the schemas 1.15.1→1.22.0 redeploy). `frozenCheck.js` now compares `=== true || === 'true'`.

### CDN quota gate — neutralized (W4)

`checkCdnUsageLimit` in `trackApiUsage.js` **no longer hard-402s** groups over their CDN cap — it falls through to `allowed: true`. Vivreal absorbs the overage and meters it via `cdnUsage.totalBytes`; customer sites never go down for CDN usage, and availability is bounded by the infra kill-switch, not this gate. API-quota exhaustion can still 402 (templates render `<QuotaExceeded />`). Quota reads are package-authoritative (W6, tier-quotas ^3.0.0): `getApiQuota`/`getCdnQuota`/agent spending-cap read `getTierQuotas(tier)` — the doc-first arms and six self-heal/mirror writes (with their redundant socket broadcasts) are gone.

### Adding a route — the per-route SAM-event rule

VR_Client_API is **SAM** (`sam-template.yaml`) with **one explicit API Gateway event per route** — there is **no catch-all `{proxy+}` integration** (the only greedy event is OPTIONS-only, for CORS preflight). Adding the Express route is not enough: if the gateway has no event for the path, the request never reaches Express and is rejected at the edge (it falls through to the default IAM-protected resource). **Always add the matching per-route event to the SAM template when you add a route.** `VR_Client_Auth` (the API-key authorizer) is **Serverless Framework** (`serverless.yml`) and only changes when the *authorizer* logic does — not for new content routes. (Same rule bites CMS as a 403 and Secure as a 502: `vivreal-lambda` deploy reference + `vivreal-auth-architecture`.)

### Gotchas

- **Array media-signing latent bug (fixed 2026-05-27, commit b3558ab):** the `targetField.name` pattern silently no-op'd on arrays; the bug lived in 5 duplicate copies (3 inline + 2 helpers). Galleries never signed despite appearing to work. Now one shared impl. Watch for regressions in media-signing helpers; `looksLikeMediaItem` requires `mimeType`. (Full bug class: `vivreal-media-cdn`.)
- Responses can be very large. CORS wide open with credentials (needed for customer sites). API-quota exhaustion → 402 (templates render `<QuotaExceeded />`) — but CDN over-cap no longer 402s (see "CDN quota gate — neutralized").
- The old `basic/` + `ecommerce/` alternate-deploy dirs are DELETED — one deploy config now.
- arm64-only. Sentry 100% dev / 20% prod, filters `GET /health`. (`aws-xray-sdk` in package.json is vestigial — zero code refs.)
- This is the **public unbounded service** — its connection-manager health is critical (gold-standard connection mgmt: dedupe + dead-socket invalidation + rethrow). Saturating Atlas conns here can 500 the whole platform — it's the one capped via reserved concurrency. See `vivreal-atlas-topology` + `vivreal-lambda`.
