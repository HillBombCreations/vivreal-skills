---
name: vivreal-cms-api-knowledge
description: Use when working in VR_CMS_API — Vivreal's Content Management System backend (NEXT_PUBLIC_CMS_URL). Covers its 5-Lambda split, the /tenant/* routes, dbKey-via-`key`-query-param multi-tenant routing, the 8-step add-a-route checklist (the CloudFormation YAML step that causes 403 if missed), the inbound webhook receivers (Square, Meta/Instagram, Stripe, Shopify), Instagram DMs/comments, the jimp image-derivative pipeline, audit logging + content versioning, the integration sync adapter pattern, and the arm64 Lambda-layer gotcha. Triggers on: VR_CMS_API, CMS API, collection objects, collection groups, /tenant route, integration sync, content versioning, audit log, presignUpload, dbKey key param, Square webhook, Meta webhook, Instagram DM, instagram comments, image derivatives, media usage metering, tier quota gating, GroupFrozen, order fulfillment. Source of truth: C:\repos\VR_CMS_API\CLAUDE.md (stale as of 2026-07-21 — see freshness note).
---

# VR_CMS_API — knowledge digest

Last synced: 2026-07-21

The CMS backend: collections, collection objects, integrations, media uploads, inbound platform webhooks, audit logging, content versioning. Maps to `NEXT_PUBLIC_CMS_URL`. Express + serverless-express on Lambda (Node 20, arm64), JavaScript, MongoDB/Mongoose, Cognito JWT via API Gateway, SAM. Read `C:\repos\VR_CMS_API\CLAUDE.md` for full route lists and depth — **freshness note:** CLAUDE.md was last refreshed 2026-06-22 (~29 days behind HEAD); it predates the tier-quotas ^3.0.0 gating sweep, the derivative clamp/metering fixes, and Secrets Phase 2 — prefer this digest + source for those areas.

## Architecture — 5 Lambdas

`getCollectionInfo` (read-only + dashboard + audit + versions reads), `createAndUpdateColObjects` (object CRUD + revert + bulk; **2048 MB / 120s**), `createAndUpdateColGroups` (schema CRUD), `handleMedia` (S3 presign + derivatives), `createAndUpdateIntegrations` (integration CRUD + sync + payouts + inbound webhooks; **1024 MB / 300s**; dual-mode: also handles SQS events for scheduled social posts). FFmpeg layer on 3 Lambdas (ColGroups, HandleMedia, Integrations) — removed from ColObjects.

Per-Lambda layout: `lambda.js` → `app.js` → `api/{index,handlers,controllers}` → `services/` → `models/`. Shared logic in `src/shared/` via the `@shared` webpack alias (`auditLog.js`, `contentVersion.js`, `generateImageDerivatives.js`, `createApp/createHandler`, quota middleware).

## Multi-tenant routing — `dbKey` via the `key` param

All routes are under `/tenant/`. **CMS reads the tenant DB key from `req.query.key`** (Secure API uses `dbKey` — don't confuse). `await dynamicDb.connect(dbKey)` selects the group's database. Always pass it.

**mainDb lookups: never `{ groupName }`.** `active_ctx` has only `groupID` + `dbKey`. Use `{ _id: groupID }` or `{ key: dbKey }` (here `dbKey === group.key`). **Webhook paths have no `key` param** — they tenant-route by verified identifier (e.g. `merchant_id`) and derive the db via `deriveDbKey(group)`, never `group.key`.

## Adding a route — 8 steps (step 7 = the 403 trap)

1. `scripts/validators.js` (Joi) → 2. `services/myFeature.js` → 3. `services/index.js` → 4. `api/controllers/myFeature.js` (set `req.resData = {status, response}`) → 5. `api/controllers/index.js` → 6. `api/index.js` (`router.{method}` via `handleTenantRoutes`) → **7. `cloudformation/<lambda-fragment>.yaml` (API Gateway event)** → 8. tests (100% coverage gate).

**Step 7 is the most-missed — and it's a hard rule.** CMS API (like Secure + Client) wires **one explicit API Gateway event per route** — no catch-all `{proxy+}`. Missing event → the request never reaches Express → **403** (gateway IAM default, not your Cognito authorizer). **Never hand-edit `allRoutes.yaml`** — CI regenerates it via `scripts/merge-template.js`. Known live drift (2026-07-21): `POST /tenant/syncProductFilterField` still exists in Express with NO CFN event → 403 in deployed envs (`GET /tenant/accountInsights` got its event and is fixed). (Cross-repo rule: `vivreal-lambda` + `vivreal-auth-architecture`.)

## Inbound webhook receivers (Square, Meta, Stripe, Shopify)

All on the integrations Lambda, `Auth: NONE`, signature-verified: `POST /tenant/webhooks/square`, `GET+POST /tenant/webhooks/meta`, `POST /tenant/webhooks/stripe/{token}`, `POST /tenant/webhooks/shopify`. Shared 5-step receiver pattern: rawBody (createApp verify hook) → verify-first + ack-then-process → tenant-route by verified identifier with an **active-account** orphan guard → `deriveDbKey(group)` → per-tenant idempotency ledger (30d TTL: `square_webhook_events`, `metaWebhookEvents` twin).

- **Square P2**: `squareWebhook.js` → RetrieveOrder → `normalizeCompletionEvent.js` (pure mapper) → oversell-safe stock decrement (`$gte` guard, `inventory.oversell` Sentry flag, never auto-refunds). Fulfillment: `services/square/updateFulfillSquareOrder.js` + `PUT /tenant/updateFulfillSquareOrder`. `square_webhook_merchant_lookup` index + backstop script. Stage-suffixed `SQUARE_*`/`META_WEBHOOK_VERIFY_TOKEN` env — deploy FAILS if unprovisioned.
- **Instagram DMs & comments (A0–A3)**: comments read LIVE from Graph API; DMs are DB-backed (`instagram_comments`/`instagram_conversations`/`instagram_messages` tenant collections; webhook/send/sync writers). Messaging-window states incl. `HUMAN_AGENT` (7 days). 8 authenticated `/tenant/instagram/*` routes + 2 `/tenant/tiktok/*` routes.

## Media — image derivatives (jimp, NOT WebP)

`processMediaFields` → `@shared/generateImageDerivatives.js` using **jimp ^1.6.0 (pure JS, arm64-safe)**: widths 320/640/1280, downscale-only, output **JPEG q80 or PNG (alpha)** at sibling keys `{originalKey}.{width}.{jpg|png}`, persisted as `meta.derivatives` + `meta.derivativeFormat` — consumed by VR_Client_API's signed `srcset`. Best-effort (failure never blocks the upload). A WebP/ffmpeg approach was tried and reverted (x86_64 layer + no jimp webp codec).

Two 2026-07 fixes: (1) **clamped top rung** — a source between ladder rungs (e.g. 600px) used to ship only `derivatives:[320]`, so large layout boxes upscaled the 320w (blurry); now the source's full resolution is also written under the smallest ladder width above it. (2) **Derivative metering** — `generateImageDerivatives` returns total bytes PUT, and `processMediaFields` counts the 320/640/1280w derivatives into `mediaUsage.totalSize` (previously original-only, ran ~1.5x low) and stores the full footprint as the `mediaFiles` row size, symmetric with delete decrements.

## Patterns

- Handler wrapper is `handleTenantRoutes` (older docs say `handleHBRoutes`). Controller sets `req.resData`.
- **Audit logging** (`@shared/auditLog.js`) — fire-and-forget, lazy model registration. If it fails the main op still succeeds.
- **Content versioning** (`@shared/contentVersion.js`) — `createVersion` (auto-increment + tier-based pruning) hooked into create/update/delete; revert via `PUT /tenant/collectionObject/revert`. Versioning lives ONLY here, not Secure API. Callers now thread `getTierQuotas(tier).maxVersionsPerObject` into `createVersion` (package-authoritative).
- **Tier gating (W2–W6, tier-quotas ^3.0.0)** — quota reads are package-authoritative via `getTierQuotas(tier)`: `getDashboardInfo.js` flipped all six quota fields to the package and deleted its hardcoded TIER_API_QUOTAS/TIER_CDN_QUOTAS tables; `enforceCouponQuota.js` resolves the coupon cap via `getEffectiveLimit`; `checkGroupDataUsage.js` adds a billing-frozen write guard (`frozen === true || === 'true'` — authorizer context stringifies booleans) and exempts PUT from the entries cap; `getAuditLog.js` clamps reads by `auditRetentionDays`. All three function `customError.js` maps gained `GroupFrozen` (403).
- **Integration sync** (`services/sync/` + `services/core/`) — provider adapter pattern (`collectionName`, `fetchExternalItems`, `mapToDocument`, `getExternalId`). `bulkWrite` upsert keyed on external ID. Providers: Stripe, **Square, Shopify, Mailchimp** + social (Facebook posts use JSON `attached_media` + Reels; FB Reel analytics now uses validated per-metric Graph calls; TikTok is full posting; Medium removed). IG publish race + DM/FB delete propagation fixed. Called by VR_Secure_API, not the portal directly.
- **Lifecycle activation signal**: `markActivated` awaited in `createCollectionObject` (2s time-box, idempotent `leads` updateMany in mainDb) — feeds VR_Main_API's activation-nudge cohort.
- `publishDate: null` = draft. Scheduling is a **per-post EventBridge Scheduler one-shot** (`scheduleExpression: at(...)`, `actionAfterCompletion: DELETE`) → SQS (`EventQueue.fifo`, now dead-lettered) → `processSocialPost` — not a standing FIFO pipe.
- **Global mongoose `sanitizeFilter` is REMOVED** — query-operator writes (e.g. the publish-claim CAS in `processSocialPost`) wrap operators in `mongoose.trusted()`. Don't reintroduce the global setting; it silently rewrote `$nin`/`$lt` filters.

## Gotchas

- **arm64 Lambda layers only.** An x86_64 layer extension binary crashes at init (`Extension.Crash`). OTEL collector caused this; removed March 2026. FFmpeg layer must also be arm64 (and jimp exists precisely to avoid layer-arch pain for images).
- Nearly zero custom indexes — missing on `collectionObjects.refID`, `.publishDate`, `sites.groupID` (webhook ledger indexes are the exception).
- CI wires the `Stage` CFN param per branch (`''` prod / `'_DEV'` dev) via `--parameter-overrides`.
- Secrets Phase 2 (CFN-only): env now resolves from `vivreal/prod/cms-api` (CLUSTER_URL, CLOUDFRONT_SIGNING_PRIVATE_KEY, SQUARE_WEBHOOK_SIGNATURE_KEY, META_WEBHOOK_VERIFY_TOKEN), `vivreal/prod/core` (ENCRYPTION_KEY, PREVIEW_SECRET), `vivreal/prod/social-oauth` (7 `*_SECRET`), and 13 SSM params — off the old hb-api-secrets. `CDN_BASE_URL` + `MEDIA_BUCKET_PREFIX` are hardcoded now.
