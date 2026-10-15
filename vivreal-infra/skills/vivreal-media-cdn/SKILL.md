---
name: vivreal-media-cdn
description: 'Use when working with Vivreal media / images / file uploads at the infra level, S3 bucket naming, presigned upload URLs, the CloudFront CDN (media.vivreal.io) and signed-URL generation, the media-router Lambda, the SignedUrlTtlSeconds cache-invalidation lever, or the array-signing latent-bug class where galleries silently come back unsigned. Use when an image 403s, a signed URL expired, media isn''t loading on a customer site, or you need to know which bucket a group''s media lives in. Triggers on: media, image not loading, S3 bucket, presigned URL, presignUpload, CloudFront, signed URL, media.vivreal.io, signCloudFrontUrl, buildMediaUrl, SignedUrlTtlSeconds, CDN, bucketname, vivreal- bucket, gallery not signed, MediaRouter, FFmpeg.'
---

# Vivreal Media / CDN / S3

How media is stored, uploaded, and delivered across the stack. Bytes live in **S3**, metadata in Mongo, delivery via **CloudFront signed URLs**.

## S3 bucket naming

- Per-group bucket slug = **`vivreal-{group.key}`** (e.g. group key `thecomedycollective` → bucket `vivreal-thecomedycollective`). `group.key` is the URL slug, **NOT** `dbKey` (which is the tenant database name, a pod such as `pod_01`). Confusing them is a classic bug (see `vivreal-db`).
- Some contexts use `${group.type}-${group.key}` as the S3 path prefix / `bucketname` (e.g. `collection-thecomedycollective`), unless the group stores its own `bucket` (25 of 26 do, 2026-10-15). The bucket is `bucketOf(group)` (stored `bucket`, else that formula); see `vivreal-db`.
- S3 IAM is scoped `arn:aws:s3:::vivreal-*` via `Vivreal-Client-S3-Access`. New buckets are created fully locked (`BlockPublicAcls`/`IgnorePublicAcls`/`BlockPublicPolicy`/`RestrictPublicBuckets: true`) + a **CloudFront OAC** bucket policy, public read ONLY through the CDN, never direct S3.
- **Media is NEVER stored in MongoDB**, only S3 paths/metadata (the `mediafiles` collection). Deleting a doc deletes the S3 objects + decrements `mainDb.groups.mediaUsage`.

## Upload path (presigned, client-direct)

1. Client requests a presigned S3 URL from VR_CMS_API **`POST /tenant/presignUpload`** (`handleMedia` Lambda). The portal proxies this via `/api/proxy/uploadFiles` → `/tenant/presignedUploadUrl`.
2. Client uploads **directly to S3** (native `fetch`, never through a Lambda, keeps bytes off the 30s/6MB Lambda path).
3. Image/video processing uses the **FFmpeg Lambda layer** (its ARN resolves from SSM `/vivreal/prod/shared/ffmpeg-arn` on the CreateSites function; it must be **arm64**, see `vivreal-lambda`).

## Delivery path (CloudFront signed URLs): VR_Client_API

- Customer sites get media via the **CloudFront CDN `media.vivreal.io`** with **signed URLs**.
- **Signed at REQUEST time since 2026-09-28.** VR_Client_API's `buildMediaUrl.js` no longer returns a pre-signed URL; it returns a stable link to the Client API's own unauthenticated `GET /media` route (`client.vivreal.io/media`, `src/shared/mediaRedirect.js`), which signs fresh on every request and 302-redirects to the signed `media.vivreal.io` object. A cached ISR page can therefore never outlive its signature. **Exception:** rich-text INLINE images (`richTextImageUrls.js`) are still signed immediately, because the renderer's sanitiser drops an inline `<img>` whose src is not on the media host; those links do expire inside cached HTML. The redirect route validates `bucket` with a character allowlist and `key` structurally, because both reach a signer.
- `signCloudFrontUrl.js` signs with the CloudFront key pair; `resolveMediaUrl.js` is the entry point.
- Key pair: public key in CloudFront key group `vivreal-cdn-kg`; **private key** in Secrets Manager (`CLOUDFRONT_SIGNING_PRIVATE_KEY` + `CLOUDFRONT_SIGNING_KEY_PAIR_ID`).
- `signCloudFrontUrl.js` **gracefully falls back to unsigned** if signing fails (wrong key type / missing config), so "media loads but isn't signed" can hide a signing-config error. Check the signing key pair if URLs come back unsigned.
- The deployed media-routing function (`Vivreal_Media_CDN_*` / MediaRouterFn) fronts CDN media routing in AWS.

## SignedUrlTtlSeconds: the cache-invalidation lever

The signed-URL TTL is parameterized (`CLOUDFRONT_SIGNED_URL_TTL_SECONDS` / `SignedUrlTtlSeconds` in `VR_Client_API/sam-template.yaml`). Its DEFAULT is now the long value; it used to be short, which silently made any deploy that did not pass `--parameter-overrides` shorten every signature. Read the parameter's `Default` and the deployed env var rather than a number from here. With request-time signing (above) the TTL only bounds one redirect's validity, not a cached page's.

## The array-signing latent-bug class (watch for it)

A media-signing pattern keyed on `targetField.name` **silently no-ops on ARRAY fields**, galleries (arrays of media) come back **unsigned** even though single-media fields work. This bug lived in **5 duplicate copies** (3 inline + 2 helpers) in VR_Client_API before a shared-helper refactor (fixed 2026-05-27). Paired hazard: a `mimeType`-required `looksLikeMediaItem` check that drops items missing `mimeType`. When media in a **gallery/array** isn't signed but single images are, suspect this class. (For the array-signing analog in the portal renderer, see `vivreal-renderer-knowledge`.)

## Purging an edge cache: `cdn-purge`, never `/api/revalidate`

- **The sanctioned tool is `vivreal-hq/packages/fleet-ops/cdn-purge`** (the admin app's "Purge a CDN path" uses the same planner). It maps the fleet's distributions by target (`media`, `client-edge`, `portal` and others; `--list` prints them), resolves the alias live on every run, plans by default, refuses `/*` without `--everything`, and writes only with `--execute`.
- **vivreal.io (target `portal`):** prove the Amplify origin healthy first, read directly and bypassing the distribution. Then plan, `MSYS_NO_PATHCONV=1 node packages/fleet-ops/cdn-purge/cli.js portal "/*" --everything`, then run the same with `--execute --wait` and confirm the invalidation reached `Completed`; record its id and verify through the apex. `/*` is right there because every query string is a separate cache key, and it cannot touch `/app*`, `/api/*` or `/help*` (those behaviours cache nothing).
- **A vivreal.io purge reaches only the apex tier, so freshness arrives slowly and unevenly**
  (measured 2026-10-15, copy pass 2 and media pass 3). Behind our distribution sits Amplify's
  own CloudFront, which caches per edge location and per content encoding for 300 s
  plus 3300 s stale, and each Amplify server instance keeps its own ISR and data cache. After a
  purge, one read can be new and the next old. So a freshness gate samples many reads, across
  edge locations and encodings, and a proof is time-boxed rather than one read: it
  converged in about 20 minutes that day. If the origin itself still serves old content, the
  fix is an Amplify RELEASE on the same commit, not another purge.
- **Never POST `/api/revalidate` by hand.** On 2026-09-06 it made `robots.txt` answer 500 at the origin and CloudFront cached the error, so the whole host looked dead. The `/*` invalidation that ran alongside was not the cause. When site data is stale too, the client API edge goes first, then the page cache.
- **Customer sites have no distribution in our account** (Amplify owns it); their only edge purge is a new deployment.
- Evidence: `vivreal-hq/docs/projects/next-release-2026-10/research-cloudfront-invalidation-method-2026-10-14.md`.

## Deleting a group's bucket

Only through `VR_Secure_API/scripts/purge-closed-group.js` (dry run by default), on owner approval, using the snapshot, conditional-delete, dry-run-twice, read-back-with-controls pattern in the `infra-engineer` agent: diff two identical dry runs before `--apply`, then prove the bucket gone with `head-bucket` 404 beside a 200 on a bucket that exists. A 404 alone also reads that way for a bucket name that never existed.

## Debugging media issues

- **Image 403 on a site** → expired/unsigned URL, or the bucket OAC policy. Check `signCloudFrontUrl` config + the key pair in Secrets Manager.
- **Gallery images broken but single images fine** → the array-signing latent bug above.
- **Upload fails** → presigned URL expired (they're short-lived; request fresh) or the client hit S3 with wrong headers/method.
- **"Which bucket?"** → `vivreal-{group.key}` (look up `group.key` in mainDb `groups`, NOT `dbKey`).

## Sources of truth

`VR_Client_API/CLAUDE.md` (Media URLs / CloudFront sections), `VR_CMS_API/CLAUDE.md` (handleMedia / presignUpload / S3). Memory: `insight_client_api_array_signing_5_copies.md`, `project_lambda_concurrency_reallocation.md` (SignedUrlTtlSeconds step A).
