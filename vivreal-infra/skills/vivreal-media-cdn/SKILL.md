---
name: vivreal-media-cdn
description: Use when working with Vivreal media / images / file uploads at the infra level — S3 bucket naming, presigned upload URLs, the CloudFront CDN (media.vivreal.io) and signed-URL generation, the media-router Lambda, the SignedUrlTtlSeconds cache-invalidation lever, or the array-signing latent-bug class where galleries silently come back unsigned. Use when an image 403s, a signed URL expired, media isn't loading on a customer site, or you need to know which bucket a group's media lives in. Triggers on: media, image not loading, S3 bucket, presigned URL, presignUpload, CloudFront, signed URL, media.vivreal.io, signCloudFrontUrl, buildMediaUrl, SignedUrlTtlSeconds, CDN, bucketname, vivreal- bucket, gallery not signed, MediaRouter, FFmpeg.
---

# Vivreal Media / CDN / S3

How media is stored, uploaded, and delivered across the stack. Bytes live in **S3**, metadata in Mongo, delivery via **CloudFront signed URLs**.

## S3 bucket naming

- Per-group bucket slug = **`vivreal-{group.key}`** (e.g. group key `thecomedycollective` → bucket `vivreal-thecomedycollective`). `group.key` is the URL slug — **NOT** `dbKey` (which is the database name `general_shared`/`pro_plus`). Confusing them is a classic bug (see `vivreal-db`).
- Some contexts use `${group.type}-${group.key}` as the S3 path prefix / `bucketname` (e.g. `collection-thecomedycollective`).
- S3 IAM is scoped `arn:aws:s3:::vivreal-*` via `Vivreal-Client-S3-Access`. New buckets are created fully locked (`BlockPublicAcls`/`IgnorePublicAcls`/`BlockPublicPolicy`/`RestrictPublicBuckets: true`) + a **CloudFront OAC** bucket policy — public read ONLY through the CDN, never direct S3.
- **Media is NEVER stored in MongoDB** — only S3 paths/metadata (the `mediafiles` collection). Deleting a doc deletes the S3 objects + decrements `mainDb.groups.mediaUsage`.

## Upload path (presigned, client-direct)

1. Client requests a presigned S3 URL from VR_CMS_API **`POST /tenant/presignUpload`** (`handleMedia` Lambda). The portal proxies this via `/api/proxy/uploadFiles` → `/tenant/presignedUploadUrl`.
2. Client uploads **directly to S3** (native `fetch`, never through a Lambda — keeps bytes off the 30s/6MB Lambda path).
3. Image/video processing uses the **FFmpeg Lambda layer** (`FFMPEG_ARN` in `hb-api-secrets`, must be **arm64** — see `vivreal-lambda`).

## Delivery path (CloudFront signed URLs) — VR_Client_API

- Customer sites get media via the **CloudFront CDN `media.vivreal.io`** with **signed URLs**.
- VR_Client_API: `buildMediaUrl.js` constructs the CDN URL → `signCloudFrontUrl.js` signs it with the CloudFront key pair. `resolveMediaUrl.js` is the entry point.
- Key pair: public key in CloudFront key group `vivreal-cdn-kg`; **private key** in Secrets Manager (`CLOUDFRONT_SIGNING_PRIVATE_KEY` + `CLOUDFRONT_SIGNING_KEY_PAIR_ID`).
- `signCloudFrontUrl.js` **gracefully falls back to unsigned** if signing fails (wrong key type / missing config) — so "media loads but isn't signed" can hide a signing-config error. Check the signing key pair if URLs come back unsigned.
- The deployed media-routing function (`Vivreal_Media_CDN_*` / MediaRouterFn) fronts CDN media routing in AWS.

## SignedUrlTtlSeconds — the cache-invalidation lever

The signed-URL / CloudFront TTL is parameterized (`CLOUDFRONT_SIGNED_URL_TTL_SECONDS` / `SignedUrlTtlSeconds`, default 300 = inert). Raising it (live value **86400** = 24h) is "cache-invalidation step A" — longer TTL = better cache hit rate / fewer re-signs. It must be passed in the deploy `--parameter-overrides` (the default is intentionally short so deploys don't accidentally lengthen it).

## The array-signing latent-bug class (watch for it)

A media-signing pattern keyed on `targetField.name` **silently no-ops on ARRAY fields** — galleries (arrays of media) come back **unsigned** even though single-media fields work. This bug lived in **5 duplicate copies** (3 inline + 2 helpers) in VR_Client_API before a shared-helper refactor (fixed 2026-05-27). Paired hazard: a `mimeType`-required `looksLikeMediaItem` check that drops items missing `mimeType`. When media in a **gallery/array** isn't signed but single images are, suspect this class. (For the array-signing analog in the portal renderer, see `vivreal-renderer-knowledge`.)

## Debugging media issues

- **Image 403 on a site** → expired/unsigned URL, or the bucket OAC policy. Check `signCloudFrontUrl` config + the key pair in Secrets Manager.
- **Gallery images broken but single images fine** → the array-signing latent bug above.
- **Upload fails** → presigned URL expired (they're short-lived; request fresh) or the client hit S3 with wrong headers/method.
- **"Which bucket?"** → `vivreal-{group.key}` (look up `group.key` in mainDb `groups`, NOT `dbKey`).

## Sources of truth

`VR_Client_API/CLAUDE.md` (Media URLs / CloudFront sections), `VR_CMS_API/CLAUDE.md` (handleMedia / presignUpload / S3). Memory: `insight_client_api_array_signing_5_copies.md`, `project_lambda_concurrency_reallocation.md` (SignedUrlTtlSeconds step A).
