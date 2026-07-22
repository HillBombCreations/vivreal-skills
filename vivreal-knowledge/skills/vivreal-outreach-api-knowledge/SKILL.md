---
name: vivreal-outreach-api-knowledge
description: Use when working in VR_Outreach_API — Vivreal's email-outreach backend (NEXT_PUBLIC_OUTREACH_URL → outreach.vivreal.io) for sequences, contacts/companies, enrollments, the prospects lead-gen store, cold calls + social touches, public booking/scheduling, Gmail history, SES send + inbound replies, and the per-minute cron. Covers the 4-Lambda split, two-token auth (x-active-ctx + optional x-user-ctx for admin gates), sender-owned identity, the enrollment-snapshot variable freeze, the +outreach reply alias + threading-header attribution, bounce/opt-out routing, the daily per-sender send cap, the booking subsystem, web-push notifications, and the per-service vivreal/prod/* secrets. Triggers on: VR_Outreach_API, email sequence, sequence didn't send, enrollment, prospect, seed prospects, cold call, social touch, booking page, Gmail history, x-user-ctx, ADMIN_EMAILS gate, cronTick, suppressions, outbound queue. Source of truth: C:\repos\VR_Outreach_API README.md (full route table) + docs/ (no CLAUDE.md).
---

# VR_Outreach_API — knowledge digest

Last synced: 2026-07-21

The Vivreal Outreach Sequencer backend: drip email sequences, reusable contacts + first-class companies, a prospects lead-gen working store, per-prospect enrollments, cold-call + social-touch logging, public booking/scheduling, Gmail history (admin-only), SES send + inbound-reply routing with bounce/opt-out detection, suppressions, web-push notifications. Maps to `NEXT_PUBLIC_OUTREACH_URL` (custom domain `outreach.vivreal.io`, mapped out of band — NOT in `template.yaml`). Express + serverless-express on Lambda (Node 20, AWS SAM, webpack). Connects **directly** to tenant Mongo (does NOT proxy through VR_CMS_API). Portal reaches it via `src/app/api/proxy/outreach/*`.

Authoritative sources: `C:\repos\VR_Outreach_API\README.md` (full route table) + `docs/` + `template.yaml` — there is NO `CLAUDE.md` in this repo. For deeper read-only analysis with citations, dispatch the `outreach-api` expert agent. For driving outreach via MCP, see `vivreal-outreach-mcp-knowledge`.

## Architecture — 4 Lambdas (one bundled deploy)

- **`apiHandler`** — Express via API Gateway v2 HttpApi, Cognito JWT default authorizer (audience list includes the outreach MCP client). Public (Auth: NONE) routes: `/health`, `GET /book/{slug}`, `GET /book/{slug}/slots`, `POST /book/{slug}`, `GET /demo-link/{code}`, `POST /studio-demo/visit`.
- **`cronTick`** — EventBridge `rate(1 minute)`, 300s timeout; sends due sequence steps. Overlapping ticks possible → send paths must be **idempotent**. Sender identity resolves LIVE from the sender doc at send time (`senderIdentity.js`); no resolvable fromAddress → step skipped `'no-sender'`. Per-sender `minutesBetweenSends` overrides the global 5-min floor; send window default 9am–6pm ET Mon–Fri (half-open) with per-sequence `sendWindow` overrides; `delayHours/24` = business days (DST-safe math in `cron/scheduling.js`). A **daily per-sender send cap** (`cron/scheduling.js` + `tick.js`) applies on top of the spacing — cap-skipped rows are rescheduled into the next send window. Call-due notifications batch into ONE daily per-sequence web-push digest (`tick.js` + `sendStep.js`; `claimCallDueDigest` in `tenantClient.js` claims against the `call_due_digests` unique index) — the schedule stays `rate(1 minute)`, the digest is batching inside the tick.
- **`processBounce`** — SES bounce/complaint via SNS → suppression list. Soft bounces auto-suppress after repeats (`db/schemas/transientBounce.js` + `suppressionsClient.js`); DSN/bounce detection (`inbound/detectBounce.js` → `applyBounceOutcome.js`, raw parsing via `parseRawEmail.js`) stops AND suppresses bounced enrollments.
- **`processInboundReply`** — SES receipt rule → S3 (`vivreal-outreach-inbound-*`, 90-day expiry) → SNS → parse + forward. The same bounce detection is wired here too (DSNs delivered as inbound mail), plus reply **opt-out detection** (`inbound/detectOptOut.js`). Attribution is by **threading headers** (In-Reply-To/References → `findEnrollmentByMessageRefs`) with a guarded sole-active-by-email fallback. Follow-up threading anchors on `<sesId>@email.amazonses.com` (the SES-delivered Message-ID format — empirically pinned). The old `+r{code}` / `reply-{id}@replies.vivreal.io` token is RETIRED (2026-06-18); still decoded only for in-flight pre-cutover sends.

Deploys on push: `main` → prod stack `VR-Outreach-API`; `dogfood` → dev.

## Auth — TWO tokens (the #1 gotcha)

- **`x-active-ctx`** (required on all authenticated routes) — the portal-signed `active_ctx`, HMAC-SHA256 with **`CTX_SECRET`** from `vivreal/prod/core`. Secret mismatch → 401 on every request; expiry → 419; a ctx missing tenant fields → 401 (tenant-scoping hardening, 2026-07). **`CTX_SECRET` must match the portal's exactly** — rotate both atomically.
- **`x-user-ctx`** (OPTIONAL) — operator identity, same secret. **`active_ctx` has NO email**, so admin gates resolve the operator from `req.userCtx` only.
- **Admin gate** (`requireGlobalAdmin`) fails CLOSED on `ADMIN_EMAILS` (now an SSM-resolved env var, `/vivreal/prod/shared/admin-emails`; empty list → 403). 18 admin-gated routes: contact/company gmail-history + gmail-message (×4), `POST /sequences/enroll-by-filter` (cap 500/call), `GET /sequences/stats` + `/sequences/step-stats`, segments POST/PUT/DELETE, `GET /studio-demo/visits`, `POST /test-thread-send`, `GET /hot-leads`, and all 5 prospect writes.

## Route surface (summary — full table in the repo README)

- **Sequences**: group-info, list, upload-preview/commit (CSV), enroll. **Sequence/sender CRUD + enrollment list/delete are DELEGATED to VR_CMS_API** generic collectionObject endpoints, keyed on the group-info `refID`.
- **Enrollments**: group-info, log-call, **stop**, **resume** (native routes — server-side, part of the nextSendAt fix).
- **Contacts / Companies**: group-info, search, count, tags/distinct, upload-preview/commit, import, `:id` get/update, company create; contacts also enrollments-summary. The email channel is reconciled onto `GET /contacts/search`, and both filter builders support `hasLinkedin` + `socialTouches[]`-aware statuses (`buildCompanyFilter.js` / `buildContactFilter.js`) — cross-channel "replied-anywhere" is honored across call + email branches.
- **Prospects**: `POST /prospects/import`, `GET /prospects/search`, `GET /prospects/stats`, `POST /prospects/confirm-angles`, `POST /prospects/seed`, `GET /prospects/:domain`, `PUT /prospects/:domain/profile`, `PATCH /prospects/:domain` — every write admin-gated (see the lead-gen store section below).
- **Cold call**: `POST /cold-call/log` — appends to `calls[]` on a Company OR Contact (`kind`-discriminated, channel-aware targets); `DELETE /cold-call/note` removes a logged note.
- **Social touch**: `POST /social-touch/log` — logs LinkedIn/social touches into `socialTouches[]` on the target (the unified multi-channel queue's third channel).
- **Queue**: `GET /queue/upcoming` — 7-day projection with server-side filters (`sequenceIds`, `senderUserId`, `kind=email|call`, `status=active|paused`, paging); `GET /queue/summary` — per-sequence roll-up (scheduled count + soonest fire time) with the IDENTICAL scope/horizon as `/upcoming` so collapsed headers reconcile with expanded rows; backed by a queue index in `migrations/ensureOutreachIndexes.js`.
- **Hot leads**: admin `GET /hot-leads` — per-contact FACTS (booleans/counts/timestamps) for the portal's Hot-Lead board; the portal's `hotScore.ts` owns weights and policy.
- **Booking (public)**: `GET/POST /book/{slug}` + `/slots` — see below.
- **Demo tracking**: `GET /demo-link/{code}` (short studio-demo redirect), `POST /studio-demo/visit`, admin `GET /studio-demo/visits` + `/visits/summary`.
- **Test sends**: `POST /test-send` (per-step, prod-safe), admin `POST /test-thread-send` (staggered thread), `POST /_test/fire-step` (non-prod only).
- **Suppressions**: list/add/remove. **Segments**: group-info, list (+ admin CRUD).

## Prospects — the lead-gen working store (leads-migration, July 2026)

- Prospects live in the **control-plane mainDb** (`Vivreal.prospects`, `db/schemas/prospect.js`), NOT tenant collections. `domain` is the unique natural key; no-website leads get synthetic `maps:<slug>` domains (never treat those as real domains — the maps-only invariant sets `status:'maps-only'` + `mapsOnly:true` + a `maps-only` tag together).
- Store logic in `api/prospectStore.js`; the prospect → Company/Contact **seed gate** in `api/prospectSeedGate.js` is a direct port of the C:\Leads CLI gate — the CLI copy stays AUTHORITATIVE during the hybrid period; change both in lockstep (golden-fixture parity tests).
- **Hookless seeding**: the company gate is structural — name + website/domain + computable dedup key (`api/companyImportValidation.js`, relaxed); hooks are NOT required. Listing-only leads seed a company-only doc with a blank website. Caveat: `{{personalizationHook}}` renders as an empty string for hookless companies — pair hookless batches with hook-independent sequences.

## Sender-owned identity (the model since June 2026)

The **sender doc** (Outreach Senders) owns `fromAddress`/`fromName`/`replyToAddress`/`role`/`signatureImageUrl` + booking config; sequences store only `senderUserId` + `ccAddress`. Identity resolves live at send time — NEVER snapshotted. Signatures are structural (composed fields); the freeform `signature` blob is retired, legacy-fallback only. Booking link lives on the sender (rendered into the signature).

## Booking / scheduling subsystem

`api/routes/book.js` (public routes, rightmost-XFF IP) → `calendar/slots.js` (`generateSlots` = availability template − Google FreeBusy) → `calendar/googleCalendar.js` (domain-wide-delegated SA REST: freeBusy + insertEventWithMeet, @vivreal.io guard; inert without `GMAIL_SA_KEY_JSON`) → `db/bookingClient.js` (`findSenderBySlug` — the slug is a GLOBAL key, no groupID filter; lock helpers; persistBooking). Concurrency lock key = **`fromAddress:startMs`** (mailbox-keyed, NOT slug-keyed), unique index + 2h-after-start TTL. Rate limiting: DynamoDB fixed-window per-IP+per-slug (`shared/rateLimit.js`) — read-only pre-check, `recordBookingSuccess` on commit. Booking web-push notifications use a `scopeFor` override + `ownerEmails[]` attribution (`book.js`, `utils/pushNotification.js`, `db/schemas/pushPreference.js`); push is fail-closed inert without the VAPID private key (`OUTREACH_PUSH_ENABLED` flag).

## Data model — sequences, contacts, companies, enrollments

- Stored as **collection objects in tenant DBs** under **SIX** provisioned system collection groups (`provision/createSystemGroups.js`): `Outreach Sequences` (audited+versioned), `Outreach Enrollments` (high-volume, audit+versioning skipped), `Outreach Contacts`, `Outreach Senders`, `Outreach Companies` (first-class entity, linked from contacts via `companyId`), `Outreach Segments` (saved named filters). `provision()` additively backfills missing schema keys on re-run and idempotently ensures the `booking_locks`, `stale_call_digests`, and `call_due_digests` index collections. (Prospects are the exception — mainDb, see above.)
- **Contacts are NOT a thin model:** ~25 promoted **native** enrichment fields (`website`, `domain`, `industry`, `techStack`, `personalizationHook`, `phone`, `dmTitle`, …) plus `tags`, `angle`, `angleStatus`, `quarantined`. Companies carry the same enrichment set plus `phone`, `dedupKey`, company-scoped `tags`, and `calls[]`.
- **Sequence step:** `{ idx, delayHours (relative; /24 = business days), kind:'email'|'call', subject, body }`. `subject:null` is NOT auto-"Re:" (and the initial send is never "Re:"-prefixed). Enrichment fields resolve as **bare** tokens (`{{website}}`) off the snapshot; `{{customField.<key>}}` for ad-hoc keys only.
- **Variable freeze:** sequence variables freeze at **enrollment-snapshot** time (`db/contactSnapshot.js` — 25 PROMOTED_NATIVE_KEYS + 16 COMPANY_FIELD_KEYS overlay, must mirror the portal's `contactFields.ts`). The cron renders the snapshot, NOT live contact data (sender identity is the exception — live). `kind:'call'` steps auto-advance via cron or `POST /enrollments/log-call`.
- **nextSendAt string-strand fix:** legacy string values stranded enrollments; fixed via server-side stop/resume routes + cron self-heal + 409/404 split (`migrateStringNextSendAt.js`).

## SES send + reply routing

- Sends **From `@vivreal.io`** (`OUTREACH_FROM_DOMAIN`; `SESCrudPolicy` is a HARD cutover on that domain).
- Reply-To is a **fixed per-sender `+outreach` alias** (e.g. `justin+outreach@vivreal.io`, `email/outreachReplyAlias.js`) — registered as a Gmail "Send mail as" so Reply-All omits it. Cc is opt-in (sequence `ccAddress`); Workspace dual-delivery copies replies to SES.
- The SES receipt rule for the legacy `replies.vivreal.io` domain is NOT in CloudFormation — it lives in the account's single active `INBOUND_MAIL` rule set (WorkMail-owned).
- **Gmail Sent-folder copies** via `email/gmailSentCopy.js` (fire-and-forget, `GMAIL_SENT_COPY_ENABLED` kill switch). **Gmail reads** via `email/gmailRead.js` (fan-out across ADMIN_EMAILS mailboxes, dedupe by Message-ID). Both use the domain-wide-delegated SA in base64 `GMAIL_SA_KEY_JSON` (absent → feature inert).

## MongoDB

- **TWO connection roots:** `MONGO_OUTREACH_URI` → dedicated `outreach` DB (suppressions, unique compound index `(scope, email)`); `MONGO_TENANT_BASE_URI` → per-`dbKey` tenant DBs (`scripts/dynamicDb.js`). Both resolved from the `vivreal/prod/outreach` secret at cold start, not env. Prospects use the control-plane mainDb — a third root shared with the C:\Leads CLI.
- **Tenant-scoping hardening (2026-07):** contact/company search+count, by-id finders, import upserts, and sequence/test-thread lookups are all scoped to the tenant `groupID`; the unique email index is tenant-keyed; duplicate-keyed companies sort specs were dropped (they failed every prod migration run). `@hillbombcreations/schemas` → ^1.22.0.
- **Mongoose 8 strict-upsert trap:** `bulkWrite` upserts filtered on `objectValue.*` silently insert nothing unless `{ strict: false }` — bit CSV import and company-create.
- Gold-standard connection manager (dedupe, dead-socket invalidation, rethrow) post the 2026-06-09 Atlas incident — don't regress to swallowed connect errors. (See `vivreal-atlas-topology`.)

## Deploy + ops gotchas

- **250MB Lambda limit:** `build:deploy` runs `npm ci --omit=dev` before copying `node_modules` into `dist/`. A prior `npm prune` approach dropped transitive deps (`bson`) — don't reintroduce.
- Tests in `tests/` (jest + mongodb-memory-server). The deploy workflow does NOT run them — run `npm test` before pushing.
- Config module-cached (`utils/config.js`) from **per-service secrets** (`hb-api-secrets` retired, fetched in parallel): `vivreal/prod/outreach` (`MONGO_OUTREACH_URI`, `MONGO_TENANT_BASE_URI`, `GMAIL_SA_KEY_JSON`), `vivreal/prod/core` (`CTX_SECRET`), `vivreal/prod/vapid` (VAPID private key). Config-not-credential values resolve from SSM at deploy in `template.yaml`: `WS_ENDPOINT`/`WS_TABLE`, `ADMIN_EMAILS`, Cognito client ID, VAPID public key/subject under `/vivreal/prod/shared/*`; Sentry DSN from `/vivreal/prod/outreach/sentry-dsn`.
- Sentry: `@sentry/aws-serverless` manual init; tenant tags per request. (See `sentry-tracer` / the `sentry` agent.)

## Companions

- **`outreach-api` expert agent** (vivreal-experts) — read-only deep analysis with citations.
- **`vivreal-outreach-mcp-knowledge`** — the 58-tool MCP server fronting this API. **`vivreal-db`** — Mongo query rules. **`vivreal-atlas-topology`** — connection/ops. **`vivreal-iam-secrets`** — CTX_SECRET rotation. **`vivreal-portal-knowledge`** — the portal-side outreach proxy routes.
