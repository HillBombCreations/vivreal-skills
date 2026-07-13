---
name: vivreal-client-stack-knowledge
description: Use when working in the Vivreal public content-delivery stack — VR_Client_API (the public backend deployed customer sites call to fetch content + process Stripe or Square checkout) and its front-door VR_Client_Auth (the Lambda authorizer validating per-group API keys). The ONLY Vivreal backend pair using API-key auth instead of Cognito. Covers the /tenant/* + /sites/:siteId routes (Site MCP, .ics feed), payments-provider resolution (resolvePaymentsProvider/resolveSquareKey/squareTokenGuard), tier→database mapping, CloudFront signed-URL media + signed srcset derivatives, frozenCheck, and the publishDate gate. Triggers on: VR_Client_API, VR_Client_Auth, Client API, client authorizer, content delivery, signed URL, CloudFront media, frozenCheck, API key auth, tier database mapping, frozen group, publishDate gate, Square checkout, payment link, site MCP, "content not showing on live site". Source of truth: C:\repos\VR_Client_API\CLAUDE.md + C:\repos\VR_Client_Auth\CLAUDE.md.
---

# VR_Client_API + VR_Client_Auth — knowledge digest

Last synced: 2026-07-13

The **public content-delivery stack**: deployed customer sites (Vivreal_Templates) call `VR_Client_API` to fetch content + run Stripe/Square checkout + send emails, and every request first passes `VR_Client_Auth` — a tiny custom Lambda authorizer that validates the group's API key and injects tenant context. **This pair is the only Vivreal backend using API-key auth (not Cognito).** Read `C:\repos\VR_Client_API\CLAUDE.md` and `C:\repos\VR_Client_Auth\CLAUDE.md` for depth.

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

---

## VR_Client_API — the public content backend

The public content-delivery API. Single monolith Lambda, Express + serverless-express (Node 20, arm64), SAM, `@hillbombcreations/schemas`. **API-key auth (not Cognito)** via VR_Client_Auth above. Reads tenant context from `req.apiGateway.event.requestContext.authorizer` — `database` / `groupID` / `groupName` / `bucketName` / `frozen`. Reserved concurrency 120; API GW throttle 50 rps / 100 burst. (X-Ray is retired — Sentry only.)

### Routes — 9 `/tenant/*` + 4 `/sites/:siteId/*`, all behind `frozenCheck`

Tenant: `GET collectionObjects` (published only), `GET integrationObjects`, `GET siteDetails`, `GET preview` (bypasses publishDate), `POST createCheckoutSession` (dispatches Stripe or Square — see below), `POST validateCoupon`, `POST definedCollectionObject`, `POST sendContactEmail`, `POST sendOrderPlacedEmail`. Sites: the **Site MCP** (descriptor + `llms.txt` + MCP RPC with 7 read-only tools, DynamoDB rate-limited via `SITE_MCP_RATE_LIMIT_TABLE`) + `feeds/schedule.ics`.

> **Known drift (verified 2026-07-13):** `/tenant/validateCoupon` has an Express route but NO API-Gateway `Events:` entry in `sam-template.yaml` (would 403 at the gateway), while `/tenant/collection` has a CFN event but no Express route. Flagged as a possible live bug.

### Payments-provider resolution (Stripe | Square)

`POST /tenant/createCheckoutSession` → `checkoutDispatch.js` → `resolvePaymentsProvider(groupID)` (reads mainDb `groups` `$elemMatch {type ∈ [stripe,square], active:true}`) → `'stripe'`/`null` delegates byte-untouched to the Stripe path (customer's OWN key); `'square'` → `resolveSquareKey(groupID)` → per-line `resolveSquareVariant` (matches `objectValue.variationId` on square `integrationObjects`; out-of-stock → 409 fail-closed) → `createSquareCheckoutSession()` via Square **CreatePaymentLink**, order-level `FIXED_AMOUNT`/`LINE_ITEM` discounts (exact integer subtraction, never per-unit rounding), `deriveIdempotencyKey` = SHA-256 over sorted priced lines.

`resolveSquareKey` gates (fail-closed → null): (1) `group.featureFlags.squareStorefront === true` — **`.lean()` is load-bearing** (strict schema hides featureFlags on hydrated docs); (2) token ONLY from an `accounts[]` entry with `scope:'group' && status:'active'` (never root fields — disconnected-root orphan trap); (3) token decrypted via `decryptSecret`/`ENCRYPTION_KEY`. `squareTokenGuard`: >2 days to expiry → no-op; ≤2 days → fire-and-forget refresh; expired → sync `RequestResponse` invoke (4s abort) of **VR_Secure_API's `squareRefreshOne` Lambda** via `SQUARE_REFRESH_ONE_FUNCTION_ARN` (scoped `lambda:InvokeFunction` IAM).

### Publish gate — the "content not showing" cause

`GET /tenant/collectionObjects` returns only `publishDate <= now && !archived`. So missing content = `publishDate` is null (draft), in the future (scheduled), or stored as a **string instead of a Date** (silently dropped by the `$lte: new Date()` filter — type bracketing). Check `publishDate` type + value first. `preview` bypasses this gate. (Full rules: `vivreal-db`; the site-product/authoring angle: `vivreal-sites`.)

### Media — CloudFront signed URLs only

Media served via `media.vivreal.io` with signed URLs (unsigned → 403). `buildMediaUrl.js` builds the URL, `signCloudFrontUrl.js` signs with the CloudFront key pair (private key in Secrets Manager `CLOUDFRONT_SIGNING_PRIVATE_KEY` — must be an RSA **private** key; public key → falls back to unsigned). TTL 300s default (CI overrides `SignedUrlTtlSeconds=86400`). The signed URL lands in `currentFile.source` on each media field — templates use it directly. Never build CDN URLs manually. **Signed srcset:** `resolveMediaUrl.js` returns `{name, source, srcset?}` — `buildSrcset` signs `${key}.${w}.${ext}` for widths `[320, 640, 1280]` (must match VR_CMS_API's `generateImageDerivatives.js`), emitted on collectionObjects/integrationObjects/preview/siteDetails read paths; files without derivatives degrade to `source` only. (Infra view: `vivreal-media-cdn`.)

### frozenCheck

`frozenCheck` middleware reads `frozen` from authorizer context and returns 400 "The group is frozen" on every route for suspended groups.

### Adding a route — the per-route SAM-event rule

VR_Client_API is **SAM** (`sam-template.yaml`) with **one explicit API Gateway event per route** — there is **no catch-all `{proxy+}` integration**. Adding the Express route is not enough: if the gateway has no event for the path, the request never reaches Express and is rejected at the edge (it falls through to the default IAM-protected resource). **Always add the matching per-route event to the SAM template when you add a route.** `VR_Client_Auth` (the API-key authorizer) is **Serverless Framework** (`serverless.yml`) and only changes when the *authorizer* logic does — not for new content routes. (Same rule bites CMS as a 403 and Secure as a 502: `vivreal-lambda` deploy reference + `vivreal-auth-architecture`.)

### Gotchas

- **Array media-signing latent bug (fixed 2026-05-27, commit b3558ab):** the `targetField.name` pattern silently no-op'd on arrays; the bug lived in 5 duplicate copies (3 inline + 2 helpers). Galleries never signed despite appearing to work. Now one shared impl. Watch for regressions in media-signing helpers; `looksLikeMediaItem` requires `mimeType`. (Full bug class: `vivreal-media-cdn`.)
- Responses can be very large. CORS wide open with credentials (needed for customer sites). Quota exhaustion → 402 (templates render `<QuotaExceeded />`).
- The old `basic/` + `ecommerce/` alternate-deploy dirs are DELETED — one deploy config now.
- arm64-only. Sentry 100% dev / 20% prod, filters `GET /health`. (`aws-xray-sdk` in package.json is vestigial — zero code refs.)
- This is the **public unbounded service** — its connection-manager health is critical (gold-standard connection mgmt: dedupe + dead-socket invalidation + rethrow). Saturating Atlas conns here can 500 the whole platform — it's the one capped via reserved concurrency. See `vivreal-atlas-topology` + `vivreal-lambda`.
