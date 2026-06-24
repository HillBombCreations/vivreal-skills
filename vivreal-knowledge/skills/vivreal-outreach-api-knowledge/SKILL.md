---
name: vivreal-outreach-api-knowledge
description: Use when working in VR_Outreach_API — Vivreal's email-outreach backend (NEXT_PUBLIC_OUTREACH_URL → outreach.vivreal.io) for sequences, contacts/companies, enrollments, Gmail history, SES send + inbound replies, and the per-minute cron. Covers the 4-Lambda split, the two-token auth (x-active-ctx + optional x-user-ctx for admin gates), the enrollment-snapshot variable freeze + company overlay, the @vivreal.io SES send domain + `+r{code}` reply token, the two Mongo connection roots, and the deploy/CTX_SECRET gotchas. Triggers on: VR_Outreach_API, outreach API, email sequence, sequence didn't send, enrollment, contact/company outreach, Gmail history, x-user-ctx, ADMIN_EMAILS gate, SES reply-to, cronTick, suppressions. NOTE: this repo has NO CLAUDE.md — source of truth is its README.md + template.yaml + the `outreach-api` expert agent + the outreach project memory.
---

# VR_Outreach_API — knowledge digest

The Vivreal Outreach Sequencer backend: drip email sequences, reusable contacts + first-class companies, per-prospect enrollments, Gmail history (admin-only), SES send + inbound-reply routing, suppressions. Maps to `NEXT_PUBLIC_OUTREACH_URL` (custom domain `outreach.vivreal.io`, mapped out of band — NOT in `template.yaml`). Express + serverless-express on Lambda (Node 20, AWS SAM, webpack). Connects **directly** to tenant Mongo (does NOT proxy through VR_CMS_API). Portal reaches it via `src/app/api/proxy/outreach/*`.

**No CLAUDE.md exists for this repo.** Authoritative sources: `C:\repos\VR_Outreach_API\README.md`, `template.yaml`, the `outreach-api` expert agent (vivreal-experts), and memory topic files (sequence schema, contact/company model, Gmail history, send-domain). For deeper read-only analysis with citations, dispatch the `outreach-api` expert agent.

## Architecture — 4 Lambdas (one bundled deploy)

- **`apiHandler`** — Express via API Gateway v2 HttpApi, Cognito JWT default authorizer; `/health` is the only open route.
- **`cronTick`** — EventBridge `rate(1 minute)`, 300s timeout; sends due sequence steps. Overlapping ticks possible → send paths must be **idempotent** (rate limiter + scheduling in `src/cron/`). Skips an EMAIL step when the **sequence's** `fromAddress` is empty (`sendStep.js:347-353`, returns `skipped:'no-sender'`). Per-sender `minutesBetweenSends` overrides the global 5-min floor (`tick.js:69-96`); the send window is 9am–6pm ET **half-open** (`tick.js:24-31`) with per-sequence `sendWindow` overrides (`sendStep.js:66-84`). 0 enrolled = 0 sends.
- **`processBounce`** — SES bounce/complaint via SNS → suppression list.
- **`processInboundReply`** — SES receipt rule → S3 → SNS → parse + forward. Inbound replies are attributed by **threading headers** (In-Reply-To/References → `findEnrollmentByMessageRefs`) with a guarded sole-active-by-email fallback (`src/inbound/processInboundReply.js:97-170`); the legacy `+r{code}` / `reply-{id}@replies.vivreal.io` token is still decoded (`src/inbound/extractEnrollmentId.js:44-64`) for in-flight pre-cutover sends. Raw `.eml` in the inbound bucket expires after 90 days (not an archive).

Deploys on push: `main` → prod stack `VR-Outreach-API`; `dogfood` → dev.

## Auth — TWO tokens (the #1 gotcha)

- **`x-active-ctx`** (required on all routes except `/health`) — the portal-signed `active_ctx`, HMAC-SHA256 with **`CTX_SECRET`** from `hb-api-secrets`. Secret mismatch → 401 "Missing/Invalid active context" on every request; expiry → 419. **`CTX_SECRET` must match the portal's exactly** — rotate both atomically.
- **`x-user-ctx`** (OPTIONAL) — operator identity, same secret. **`active_ctx` has NO email**, so admin gates resolve the operator from `req.userCtx` only. The Gmail-history routes (contact + company) require it; the portal must forward `x-user-ctx` on those 4 gmail proxy routes (Option B fix).
- **Admin gate** (`src/api/requireGlobalAdmin.js`) fails CLOSED on `ADMIN_EMAILS` (Secrets Manager authoritative; empty list → 403). Portal mirrors with `NEXT_PUBLIC_ADMIN_EMAILS`.

## Data model — sequences, contacts, companies, enrollments

- Stored as **collection objects in tenant DBs** under **SIX** provisioned system collection groups (`provision/createSystemGroups.js:294`): the four core — `Outreach Sequences` (audited+versioned), `Outreach Enrollments` (high-volume, audit+versioning skipped), `Outreach Contacts`, `Outreach Senders` (seeded with three founders) — **PLUS** `Outreach Companies` (`:121-162`, first-class persisted entity, linked from contacts via `companyId`) and `Outreach Segments` (`:170-185`, saved named filters). `provision()` additively backfills missing schema keys on re-run (`:315-336`) — not just the label.
- **Contacts are NOT a thin model:** ~25 promoted **native** enrichment fields (`website`, `domain`, `industry`, `techStack`, `personalizationHook`, `seasonalHook`, `phone`, `dmTitle`, …) PLUS segmentation fields `tags` (string[]), `angle`, `suggestedAngle`, `angleStatus`, and `quarantined`/`quarantineReason` (`createSystemGroups.js:46-111`). Companies carry the same enrichment set plus `dedupKey` and company-scoped `tags` (`:134-160`). Provision is idempotent; legacy `__outreach_*` group names migrate via `renameSystemGroups.js` (LEGACY_NAME fallback bridges deploy→migration).
- **Sequence step:** `{ idx, delayHours (relative; /24 = business days), kind:'email'|'call', subject, body }`. `subject:null` is NOT auto-"Re:". Since the 2026-06-08 Group B promotion the 21 enrichment fields resolve as **bare** tokens (`{{website}}`/`{{industry}}`/`{{personalizationHook}}`) off the snapshot (`sendStep.js:102-140`); `{{customField.<key>}}` is now reserved for genuinely ad-hoc keys only (`createSystemGroups.js:41-45`).
- **Variable freeze:** sequence variables freeze at **enrollment-snapshot** time (`db/contactSnapshot.js`); company fields **overlay** at enroll/import. The cron renders the snapshot, NOT live contact data. Enroll is manual `POST /sequences/enroll` OR `POST /sequences/enroll-by-filter` (admin-gated, batched, suppression-gated, paginated over saved-segment filters/id-lists, cap 500 — `sequences.js:665-830`); `kind:'call'` steps are auto-advanced by cron (`sendStep.js:309-337`) or operator-advanced via `POST /enrollments/log-call` (`enrollments.js:85-180`).
- **Segmentation / audience surface (Spec B):** `Outreach Segments` saved filters + `/segments` CRUD; contact `tags`/`angle`/`angleStatus`; server-side `/contacts/search|count|tags` and `/companies/search|count|tags`; `enroll-by-filter`; companies as a full entity (import, `dedupKey`, fan-out on edit, company Gmail history); `/queue/upcoming` 7-day projection; call steps + log-call; UTM link tagging on body + signature (`sendStep.js:218-229`).

## SES send + reply routing

- Sends **From `@vivreal.io`** (`OUTREACH_FROM_DOMAIN`; `SESCrudPolicy` is a HARD cutover on that domain).
- Reply-To is a **fixed per-sender `+outreach` alias** (e.g. `justin+outreach@vivreal.io`) set in `src/cron/sendStep.js:391-395` via `src/email/outreachReplyAlias.js:18-28` — registered as a Gmail "Send mail as" so Reply-All omits it (no tracking-address loop). The alias rides on `@vivreal.io`; inbound replies are attributed by **threading headers** (legacy `+r{code}` / `reply-{id}@replies.vivreal.io` still decoded for in-flight pre-cutover sends — `replies.vivreal.io` is legacy-only). Cc is opt-in (when the sequence sets `ccAddress`); Workspace dual-delivery copies replies to SES.
- The SES receipt rule for `replies.vivreal.io` is NOT in CloudFormation — it lives in the account's single active `INBOUND_MAIL` rule set (WorkMail-owned; a separate rule set would deactivate WorkMail).
- **Gmail Sent-folder copies** via `email/gmailSentCopy.js` (`gmail.insert`, fire-and-forget, `GMAIL_SENT_COPY_ENABLED` kill switch). **Gmail reads** via `email/gmailRead.js` (`gmail.readonly`, fan-out across ADMIN_EMAILS mailboxes, dedupe by Message-ID). Both use the domain-wide-delegated SA in base64 `GMAIL_SA_KEY_JSON` (absent → feature inert).

## MongoDB

- **TWO connection roots:** `MONGO_OUTREACH_URI` → dedicated `outreach` DB (suppressions only, unique compound index `(scope, email)`, `db/suppressionsClient.js`); `MONGO_TENANT_BASE_URI` → per-`dbKey` tenant DBs (`db/tenantClient.js`, `scripts/dynamicDb.js`) — same routing convention as the other backends.
- **Mongoose 8 strict-upsert trap:** `bulkWrite` upserts filtered on `objectValue.*` silently insert nothing unless `{ strict: false }` — bit CSV import and company-create.
- Gold-standard connection manager (dedupe, dead-socket invalidation, rethrow) in place post the 2026-06-09 Atlas saturation incident — don't regress to swallowed connect errors. (See the `vivreal-atlas-topology` infra skill.)

## Deploy + ops gotchas

- **250MB Lambda limit:** `build:deploy` runs `npm ci --omit=dev` before copying `node_modules` into `dist/`. A prior `npm prune` approach dropped transitive deps (`bson`) — don't reintroduce.
- Tests in `tests/` (jest + mongodb-memory-server). The deploy workflow does NOT run them — run `npm test` before pushing.
- Config module-cached (`utils/config.js`) from the shared `hb-api-secrets` bundle: `CTX_SECRET`, `ADMIN_EMAILS`, `GMAIL_SA_KEY_JSON`, `WS_ENDPOINT`/`WS_TABLE`, `SENTRY_DSN_OUTREACH`.
- Sentry: `@sentry/aws-serverless` manual init (`utils/sentry.js`); tenant tags set per request. (See the `sentry-tracer` skill / `sentry` agent for cross-stack tracing.)

## Companions

- **`outreach-api` expert agent** (vivreal-experts) — read-only deep analysis with file:line citations.
- **`vivreal-db`** — Mongo query rules. **`vivreal-atlas-topology`** — connection/ops. **`vivreal-iam-secrets`** — CTX_SECRET rotation + secrets. **`vivreal-portal-knowledge`** — the outreach proxy routes on the portal side.
