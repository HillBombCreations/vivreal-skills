---
name: vivreal-client-stack-knowledge
description: Use when working in the Vivreal public content-delivery stack — VR_Client_API (the public backend deployed customer sites call to fetch content + process Stripe checkout) and its front-door VR_Client_Auth (the custom Lambda authorizer that validates per-group API keys and injects tenant context). The ONLY Vivreal backend pair using API-key auth instead of Cognito. Covers the 8 /tenant/* read+checkout routes, the API-key→group lookup + tier→database mapping, CloudFront signed-URL media, the frozenCheck middleware, the publishDate publish gate, and the array-signing latent bug. Triggers on: VR_Client_API, VR_Client_Auth, Client API, client authorizer, content delivery, customer site data, signed URL, CloudFront media, frozenCheck, API key auth, Lambda authorizer, tier database mapping, frozen group, publishDate gate, "content not showing on live site". Source of truth: C:\repos\VR_Client_API\CLAUDE.md + C:\repos\VR_Client_Auth\CLAUDE.md.
---

# VR_Client_API + VR_Client_Auth — knowledge digest

The **public content-delivery stack**: deployed customer sites (Vivreal_Templates) call `VR_Client_API` to fetch content + run Stripe checkout + send emails, and every request first passes `VR_Client_Auth` — a tiny custom Lambda authorizer that validates the group's API key and injects tenant context. **This pair is the only Vivreal backend using API-key auth (not Cognito).** Read `C:\repos\VR_Client_API\CLAUDE.md` and `C:\repos\VR_Client_Auth\CLAUDE.md` for depth.

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

The public content-delivery API. Single monolith Lambda, Express + serverless-express (Node 20, arm64), SAM, `@vivreal/schemas`. **API-key auth (not Cognito)** via VR_Client_Auth above. Reads tenant context from `req.apiGateway.event.requestContext.authorizer` — `database` / `groupID` / `groupName` / `bucketName` / `frozen`.

### Routes — 8, all `/tenant/*`, all behind `frozenCheck`

`GET collectionObjects` (published only), `GET integrationObjects`, `GET siteDetails`, `GET preview` (bypasses publishDate), `POST createCheckoutSession` (customer's OWN Stripe key, passed per-request), `POST definedCollectionObject`, `POST sendContactEmail`, `POST sendOrderPlacedEmail`.

### Publish gate — the "content not showing" cause

`GET /tenant/collectionObjects` returns only `publishDate <= now && !archived`. So missing content = `publishDate` is null (draft), in the future (scheduled), or stored as a **string instead of a Date** (silently dropped by the `$lte: new Date()` filter — type bracketing). Check `publishDate` type + value first. `preview` bypasses this gate. (Full rules: `vivreal-db`; the site-product/authoring angle: `vivreal-sites`.)

### Media — CloudFront signed URLs only

Media served via `media.vivreal.io` with signed URLs (unsigned → 403). `buildMediaUrl.js` builds the URL, `signCloudFrontUrl.js` signs with the CloudFront key pair (private key in Secrets Manager `CLOUDFRONT_SIGNING_PRIVATE_KEY` — must be an RSA **private** key; public key → falls back to unsigned). TTL 300s default. The signed URL lands in `currentFile.source` on each media field — templates use it directly. Never build CDN URLs manually. (Infra view: `vivreal-media-cdn`.)

### frozenCheck

`frozenCheck` middleware reads `frozen` from authorizer context and returns 400 "The group is frozen" on every route for suspended groups.

### Gotchas

- **Array media-signing latent bug (fixed 2026-05-27, commit b3558ab):** the `targetField.name` pattern silently no-op'd on arrays; the bug lived in 5 duplicate copies (3 inline + 2 helpers). Galleries never signed despite appearing to work. Now one shared impl. Watch for regressions in media-signing helpers; `looksLikeMediaItem` requires `mimeType`. (Full bug class: `vivreal-media-cdn`.)
- Responses can be very large (media base64-embedded historically). CORS wide open with credentials (needed for customer sites).
- `basic/` + `ecommerce/` dirs at root are alternate deploy configs sharing `src/`.
- arm64-only. Sentry 100% dev / 20% prod, filters `GET /health`.
- This is the **public unbounded service** — its connection-manager health is critical (gold-standard connection mgmt: dedupe + dead-socket invalidation + rethrow). Saturating Atlas conns here can 500 the whole platform — it's the one capped via reserved concurrency. See `vivreal-atlas-topology` + `vivreal-lambda`.
