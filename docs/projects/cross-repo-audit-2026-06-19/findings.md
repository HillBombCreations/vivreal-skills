# Cross-Repo Audit — Recent Changes (2026-06-19)

Read-only audit of recent branch/commit changes across the Vivreal stack, run
through the new auto-reviewing workflow (one system-expert auditor per repo +
a principal reviewer on the shared schemas). **No source was edited** — this is
a findings report; fixes are follow-up work in each repo.

**Repos audited (recent-change surface):**
| Repo | Ref audited | Headline |
|---|---|---|
| Vivreal-Schemas | `main`, v1.14→v1.18 | Clean; additive-only; version skew benign |
| VR_Client_API | `feat/coupons-validate-checkout` | ⚠️ `Cache-Control: public` on tenant responses |
| VR_CMS_API | `feat/coupons-read-side-gating` | ⚠️ coupon TOCTOU + tenant-conn liveness |
| VR_Outreach_API | `feat/outreach-segmentation` | Mostly clean; migration keeper-order nit |
| VR_Secure_API | `feat/cc9-emailpopup-persist` | ✅ Clean — no High/Critical |
| Vivreal_Portal_Mobile | `feat/building-block-composition` | Low/Medium; untracked-file hygiene |
| VR_Main_API | `main` | ⚠️ Sentry PII; schema bump is fine to ship |

## Severity summary

No **Critical** found. The items below are the ones worth acting on before/around shipping.

### HIGH

1. **VR_Client_API — `Cache-Control: public` on authorizer-scoped tenant responses.**
   `src/api/tenant/getSiteDetails.js:56`, `getCollectionObjects.js:50`, `getIntegrationObjects.js:47`.
   Tenant identity (`groupID`/`database`) comes from the API-key authorizer context, **not**
   the URL — the URL only carries `siteId`/`collectionId`. With no `Vary` on the API-key header
   and no tenant token in the URL, a *shared* cache (the CDN/API-GW cache the comments invite, or
   any intermediary proxy) keyed on URL could serve tenant A's content to tenant B when both
   request the same `collectionId`/`siteId` literal. Combined with wide-open credentialed CORS
   (`enableCors.js:24`). **Not exploitable today** (no shared cache wired; per-tenant hosts mask it),
   so rated High — but becomes **Critical** the moment API-GW/CloudFront caching is enabled.
   **Fix:** `private, max-age=60`, or if a shared cache is intended, `Vary` on the API-key header
   **and** include the tenant key in the cache key.

2. **VR_CMS_API — coupon quota check is non-atomic (TOCTOU).**
   `src/shared/enforceCouponQuota.js:68-87`. `countDocuments` then a separate `create`/`update` —
   concurrent requests at the cap (`maxActiveCoupons`) can both pass and both insert. Monetized gate.
   **Fix:** atomic `findOneAndUpdate` with `$inc` + conditional guard (reservation pattern).

3. **VR_CMS_API — `createTenantDb` missing ping-liveness check.**
   `src/shared/db/createTenantDb.js:89`. Cache-hit path returns on `readyState === 1` with no ping;
   `createMainDb` was hardened with `isCachedConnAlive()` but tenant connections (used far more often)
   were not. A frozen Lambda can hold a dead socket reading `readyState === 1`.
   **Fix:** mirror `isCachedConnAlive()` on the tenant cache-hit path.

### MEDIUM

4. **VR_Main_API — Sentry now ships PII (email) in log bodies.**
   `src/hbcreations/scripts/sentry.js:13` (`sendDefaultPii: true`) + `logger.js:12` (`messageKey:'message'`).
   The pino integration now routes log message bodies to Sentry; multiple info logs carry `email`
   (`createUserService.js:19,52,60,68,125,132`). Previously log bodies were empty in Sentry. GDPR /
   data-minimization exposure, and any future token in a log goes straight to Sentry.
   **Fix:** add a Sentry `beforeSend` scrubber for email/IP/auth headers, or set `sendDefaultPii: false`.

5. **VR_CMS_API — `maxTimeMS: 15000` not excluded for `aggregate`.**
   `src/shared/db/createTenantDb.js` plugin. `getCollectionObjects` builds a faceted `$lookup`/`$facet`
   aggregate; 15s can terminate legitimate large-tenant paginations (→ 500s under load). Bulk-import
   ops are excluded but aggregate isn't. **Fix:** exclude `aggregate` or raise its timeout (~45s).

6. **VR_CMS_API — `incrementCouponRedemption` doesn't require `active: true`.**
   `src/createAndUpdateIntegrations/api/controllers/stripeWebhook.js:191`. A deactivated coupon still
   gets `redeemedCount` bumped. **Fix:** add `'objectValue.active': true` to the update filter.

7. **Coupon redemption replay/race (cross-repo).** VR_Client_API checks `redeemedCount >= max`
   (`_helpers/coupon.js:175`) but defers the increment to the post-payment webhook (VR_CMS_API
   `stripeWebhook.js`). Two concurrent checkouts can both pass the limit check (TOCTOU). **Fix:** ensure
   the webhook does an atomic `$inc` with a guard (`findOneAndUpdate({redeemedCount:{$lt:max}}, {$inc})`)
   — verify the two halves line up.

8. **VR_Outreach_API — migration keeper election relies on undocumented pipeline order.**
   `src/migrations/ensureEnrollmentUniqueIndex.js:107-113`. `$sort`→`$group.$push` member order isn't a
   documented contract; a reorder could keep a newer dup and delete the oldest. No data-loss in the
   "safe" path (all members `active, sentCount:0`). **Fix:** sort `members` by `id` in `classifyDupGroups`
   before picking `members[0]`.

### LOW / hygiene

9. **Vivreal_Portal_Mobile — untracked files that must NOT land in a bulk `git add .`.**
   `.claude/worktrees/` (agent worktree copy), `e2e/parity/` (parity harness — commit deliberately or
   gitignore), `scripts/add-comedy-reviews-nav.mjs` (one-shot, tenant-specific hardcoded data — delete
   or gitignore). **Action:** add `.claude/worktrees/` to `.gitignore`; decide on the other two explicitly.

10. **VR_Outreach_API — commit the uncommitted `createSystemGroups.js` fix.** `type:'text'`→`type:'list'`
    for `tags` is correct and *blocks CMS PUT writes on `tags` from failing Joi validation* — stage and
    push before the next provision run. (`src/provision/createSystemGroups.js:99,157`.)

11. **Vivreal_Portal_Mobile — small proxy/route nits.** `get-media` route forwards caller-supplied
    `name` unsanitized (map-key collision, no S3 traversal) — `get-media/route.ts:64`; `outreach/segments`
    builds `/segments/<id>` without rejecting empty `id` — add `validateBody`; `use-permissions.tsx:49`
    re-splits `NEXT_PUBLIC_ADMIN_EMAILS` every render (cache it); `mediaInjection.ts:241` `signBatch` relies
    on an informal non-throwing contract — add a defensive `try/catch`.

12. **VR_Main_API — `leadsSchema.attribution` sub-docs are plain objects, not `new Schema()`.**
    `leadsSchema.js:8`. Mongoose strict mode doesn't strip unknown keys on plain-object subdocs; the service
    sanitizer (`buildLeadAttribution.js`) does, so it's a defense-in-depth gap, not an active hole.
    Also `userLoginSSO.js:67` uses `jwt.decode()` (no signature verify) — safe today because the token comes
    server-to-server from Cognito's `/oauth2/token`, but a documented footgun.

13. **Vivreal-Schemas — `siteRole` lacks an `enum`.** `collectionGroupSchema.js:77`. A typo writes silently;
    consider an enum guard. (It is a plain nullable String, **not** a Mongoose discriminator — the safe,
    backward-compatible choice.)

## Cross-cutting verdicts

- **Schema version skew is benign.** Both the schemas reviewer and the main-api expert agree: every
  v1.16→v1.18 change is **additive and non-required**, so `VR_Main_API` pinned at `^1.15.1` is **not a
  correctness problem** (its `leads` schema is locally defined anyway). The uncommitted `package.json`
  in Main already bumps it to `^1.18.0` for consistency — ship it. *Caveat:* confirm Main never writes
  `group.frozen`/`siteRole`/site-chrome under 1.15.1 (it doesn't) — those would strict-drop.

- **Clean areas worth noting (no High/Critical):**
  - **VR_Secure_API** — entirely clean. `emailPopup` Joi-allowed (no strip), no mass-assignment;
    `mongoose.trusted()` correctly scoped to **server-built** filters so **NoSQL injection is NOT reopened**;
    webhook emission is fire-and-forget, tenant-scoped, no secret in the SQS body; Lambda concurrency
    right-sizing **removes** caps (more headroom, no auth/billing starvation); claude-sonnet-4 migration
    complete (zero stale refs).
  - **VR_Client_API** — `publishDate` storefront gate preserved verbatim; new reviews double-excluded
    (null publishDate + `pending_review`); all new queries tenant-scoped as strings; media (hero/background/
    chrome-logo) signing correct, no double-signing; Stripe idempotent.
  - **VR_CMS_API** — the **dotted-query-key** change is **safe**: the consuming validator restricts to
    `/^objectValue\.[a-zA-Z0-9_.]+$/` primitives, so the NoSQL-injection path is closed; `decideApproval`
    publishDate uses `?? new Date()` (real Date, preserves existing future dates, approve-only) — clean.
  - **VR_Outreach_API** — the false-success/false-report seams are correctly closed in `bulkInsertEnrollments`
    (insert-only, never resets existing enrollments); both migrations guard against unique-index-build-on-dups.

## Recommended next actions

1. **Triage HIGH #1 (Client API cache header)** before any API-GW/CloudFront cache is enabled — it's the one
   that flips to Critical on an infra toggle.
2. **Fix the two coupon TOCTOU races** (#2 CMS quota, #7 redemption increment) together — they're the same
   atomic-counter pattern and both gate money.
3. **Add the CMS tenant-conn liveness + aggregate-timeout fixes** (#3, #5) — both are connection-factory
   hardening in the same files.
4. **Scrub Sentry PII** (#4) — low effort, real compliance exposure.
5. **Commit the Outreach `createSystemGroups.js` fix** (#10) and **clean up the portal untracked files** (#9)
   before those branches merge.

Each of these can be driven through `/plan <fix>` (research → plan → auto-review) in its own repo.
