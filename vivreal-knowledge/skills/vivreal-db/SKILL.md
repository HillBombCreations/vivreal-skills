---
name: vivreal-db
description: Use when querying or exploring Vivreal's MongoDB — including any time you are about to use the mcp__mongodb__* MCP tools — choosing which database, which collection, how to scope a query to a tenant, how to LINK collections together (collection_group ↔ collection_objects ↔ integration_objects, groups ↔ everything, sites ↔ versions/media), or debugging "content created in the portal but missing on the site". Teaches the safe multi-tenant query rules, the dbKey vs group.key vs bucketname distinctions, and the string-ref ↔ ObjectId cross-collection join rule that are the #1 source of bugs. Triggers on: mcp__mongodb, query mongo via MCP, mongodb find/aggregate/count, $lookup, join collections, link collection group to objects, list collections, collection schema, which database, which collection, group/tenant data, publishDate, dbKey, groupID.
---

Last synced: 2026-07-13

# Vivreal Multi-Tenant MongoDB — Safe Query & Linking Rules

> **Topology, collection names, indexes and the join rules below were verified against live Mongo on 2026-06-19.** Read this before touching the `mcp__mongodb__*` tools. For an interactive helper, use the `/db-query` and `/db-schema` commands (`vivreal-db-explorer` plugin) — this skill is the passive knowledge those commands assume.

## Getting connected (sourcing the connection string)

The `mcp__mongodb__*` tools need a MongoDB connection string to reach Atlas — it is
NOT hard-coded. Source it, then connect. The string is the Atlas **cluster** URI
(`mongodb+srv://…`) with NO database path; the database is selected per query.

**Where the connection string lives** (priority order):

1. **AWS Secrets Manager** — secret `hb-api-secrets`, key `CLUSTER_URL`. Every backend
   Lambda resolves it via `{{resolve:secretsmanager:hb-api-secrets:SecretString:CLUSTER_URL}}`.
   Retrieve it (requires AWS credentials for the account):
   ```bash
   aws secretsmanager get-secret-value --secret-id hb-api-secrets \
     --query SecretString --output text \
     | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).CLUSTER_URL)'
   ```
2. **Local backend `.env`** (dev fallback) — any backend repo under `${VIVREAL_REPOS}`
   (e.g. `${VIVREAL_REPOS}/VR_CMS_API/.env`) carries `CLUSTER_URL=mongodb+srv://…`.

**Then connect:** the `vivreal-db-explorer` plugin registers a **read-only** MongoDB
MCP server (`vivreal-db-explorer/.mcp.json` → `mongodb-mcp-server`, `MDB_MCP_READ_ONLY=true`).
It reads `MDB_MCP_CONNECTION_STRING` from the environment — export it before launching:

```bash
export MDB_MCP_CONNECTION_STRING="$(aws secretsmanager get-secret-value --secret-id hb-api-secrets \
  --query SecretString --output text \
  | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).CLUSTER_URL)')"
```

The server loads at session start (approve it on first use). If it isn't registered or
no connection is live, the `mcp__mongodb__*` tools won't exist — stop and report that;
never fabricate results. No MCP? You can still connect read-only via a backend repo's
driver: `NODE_PATH=${VIVREAL_REPOS}/VR_CMS_API/node_modules node <script using MongoClient>`.

**Security — the connection string IS a secret:**
- It embeds the Atlas username + password. NEVER echo it, write it to a file, paste it into
  a doc/PR/commit, or log it. It goes ONLY into the connect call.
- Use a **read-only** Atlas database user — that DB-level restriction, not the
  `MDB_MCP_READ_ONLY` flag, is the real security boundary (the flag is defense-in-depth).
  A read-only user also protects `groups.apiKey`, `webhooks.secret`, `groups.integrations`.

## Database topology (5 databases — verified live)

There is no single "per-group database" model, but it is ALSO wrong to say there are
exactly three. Live cluster:

| Database | Role | Holds | Which groups |
|---|---|---|---|
| `Vivreal` | **Control plane (mainDb)** | `groups`, `leads` (+ lifecycle `activated`/`activatedAt`), `checkout_sessions`, `media_files`, `usage_trackings`, `domainorders`, `prospects`, `inquiries`, `emailEvents`, `suppressions` (lifecycle-email), `dataDeletionRequests`, `site_traffic_daily` (first-party analytics rollup), analytics caches, push subs, oauth verifiers | ALL groups (registry) |
| `general_shared` | **Tenant content** | `collection_groups`, `collection_objects` (incl. the SIX Outreach system groups — sequences/enrollments/contacts/senders/companies/segments, with `calls[]` + bookings on senders/companies), `integration_objects`, `sites`, `site_versions`, `content_versions`, `audit_logs`, `webhooks`, `stripe_webhook_events`, `square_webhook_events`, `metaWebhookEvents`, `instagram_comments`/`instagram_conversations`/`instagram_messages` | `free` / `basic` / `pro` tiers |
| `pro_plus` | **Tenant content** (same collections as general_shared, plus `stripe_products`, `collection_templates`) | same shape as general_shared | `proplus` tier (currently empty — no group is `proplus` yet) |
| `outreach` | **Outreach service** | `suppressions` only (global suppression list). NOTE: outreach **contacts/companies/enrollments are NOT here** — see below. | service-global |
| `justinceccarelligroup` | **Legacy/anomalous per-group DB** | only `audit_logs` (~4) for one group | a single group — likely stale routing; do not rely on this pattern |

**Routing rule:** look up the group in `Vivreal.groups`, read `tier`, route tenant
content to `general_shared` (free/basic/pro) or `pro_plus` (proplus). This is what
`deriveDbKey()` does. The `justinceccarelligroup` DB is an anomaly (a slugified-groupName
DB containing only audit_logs) — treat it as legacy drift, not the model.

**⚠️ Two collections are NOT where you'd expect:** `media_files` and `usage_trackings`
live in the **`Vivreal` (mainDb)** scoped by `groupID` — NOT in the tenant DB. Query them
against `Vivreal`, not `general_shared`.

## The three keys you must not confuse

From the `active_ctx` JWT in the portal:

| Field | Example | What it is | Used for |
|---|---|---|---|
| `groupID` | `6795c1358b97114840265e65` | The group's Mongo `_id` (string form) | The `groupID` filter on EVERY tenant doc — tenant scoping |
| `dbKey` | `general_shared` / `pro_plus` | Tier-mapped **database name** (`deriveDbKey()`) | Selecting the tenant database; passed as the `key` query param to CMS API |
| `bucketname` / `group.key` | `exodussalescollective` → bucket `vivreal-exodussalescollective` | The group's URL **slug** | S3 bucket naming, CDN media paths — NOT database routing |

`dbKey` is the database name. `group.key` is the S3 slug. They are different values.

## Linking collections together (the ER map)

**THE GOLDEN RULE (verified live):** tenant reference fields are stored as **strings**
that equal the *string form* of a target document's **ObjectId `_id`**.

- Going FROM a string ref → the target `_id` doc: **cast** `new ObjectId(ref)` (or
  `$toObjectId` in aggregation). Matching `{ _id: ref }` with the raw string returns
  **zero rows** (confirmed: `{_id: refID}` → NOT FOUND; `{_id: ObjectId(refID)}` → FOUND).
- Going FROM an `_id` doc → its referencing children: match the child's string field
  against `String(_id)`. Do NOT wrap the child field in `ObjectId()` — it's a string, and
  an ObjectId filter silently matches 0.

| From (string field) | → To collection (`_id` ObjectId) | DB |
|---|---|---|
| `<any tenant doc>.groupID` | `Vivreal.groups._id` | tenant → Vivreal |
| `collection_objects.collectionObj.refID` | `collection_groups._id` | within tenant DB |
| `integration_objects.collectionGroup.refID` | `collection_groups._id` | within tenant DB |
| `media_files.collectionGroup.refID` | `collection_groups._id` | Vivreal → tenant DB |
| `media_files.collectionObjID` | `collection_objects._id` | Vivreal → tenant DB |
| `content_versions.entityId` (when `entityType='collectionObject'`) | `collection_objects._id` | within tenant DB |
| `site_versions.entityId` | `sites._id` | within tenant DB |
| `audit_logs.entityId` (+ `entityType`) | the named entity's `_id` | within tenant DB |
| `sites.collectionGroups[]`, `sites.collectionObjIds[]`, `sites.pages[].collectionId` | embedded id refs | within tenant DB |

`group.key` (slug) → S3 bucket `vivreal-{key}`; it is NOT a join key for Mongo.

## Cross-collection query recipes

**Recipe A — objects WITH their collection group (single $lookup, type-converted).**
A naive `localField/foreignField` lookup fails (string vs ObjectId). Convert in a pipeline:
```js
db.collection_objects.aggregate([
  { $match: { groupID: "<gid>", archived: { $ne: true } } },
  { $lookup: {
      from: "collection_groups",
      let: { gref: { $toObjectId: "$collectionObj.refID" } },   // string -> ObjectId
      pipeline: [
        { $match: { $expr: { $eq: ["$_id", "$$gref"] } } },
        { $project: { name: 1, type: 1 } }
      ],
      as: "group"
  } },
  { $unwind: { path: "$group", preserveNullAndEmptyArrays: true } }
])
```
(Converting the *local* string to ObjectId lets the lookup hit the foreign `_id` index.
Alternatively convert the foreign side with `{ $toString: "$_id" }`, but that scans.)

**Recipe B — manual two-step (use this via the MCP `find` tool, no aggregation needed):**
1. `find` the schema: `collection_groups` where `{ groupID: gid, name: "Blogs" }` → take its `_id`.
2. `find` the items: `collection_objects` where `{ "collectionObj.refID": "<that _id as a STRING>", archived: { $ne: true } }`.
   (refID is a string, so pass the string form — do NOT wrap in `$oid`.)

**Recipe C — a group's whole content footprint (counts per collection):**
```js
db.collection_objects.aggregate([
  { $match: { groupID: gid, archived: { $ne: true } } },
  { $group: { _id: "$collectionObj.name", count: { $sum: 1 } } }
])
```

**Recipe D — an object's version history:** `content_versions` where
`{ entityId: "<object _id as string>", entityType: "collectionObject" }`, sort `{ version: -1 }`.

**Recipe E — media for an object (note the DB!):** `Vivreal.media_files` where
`{ collectionObjID: "<object _id as string>", groupID: gid }`.

**Recipe F — group → everything (cross-DB):** there is no cross-database `$lookup`. To go
from `Vivreal.groups` to tenant content you must issue separate queries against the
tenant DB resolved from `tier`. Resolve `tier` first, then query `general_shared`/`pro_plus`.

**MCP note:** the `mcp__mongodb__find` `_id` filter uses extended JSON `{"$oid":"..."}`;
tenant string refs (`groupID`, `collectionObj.refID`, `collectionObjID`, `entityId`) use
plain strings. For `$lookup` recipes use `mcp__mongodb__aggregate`.

## Collection field shapes (verified live, tenant DB)

- **`collection_groups`** — `_id`, `name`, `type`, `groupID`(str), `archived`, `linked`,
  `tags[]`, `schema`(strict:false), `widget`, `tableConfig`, `label`, `author{name,email}`,
  `hasMedia`, `useAsTemplate`, `system`, `skipAudit`, `skipVersioning`, `siteRole`,
  `variantKeys`, `approvalRequired`, timestamps. **Indexes: none declared** — the schema
  defines only the default `_id` index (no `groupID` or `groupID+type` secondary index).
  `siteRole` is a constrained enum (`subscribers|reviews|reservations|quote-requests|contact|testimonials|null`)
  — the stable discriminator for built-in site forms, orthogonal to both `type` and `system`
  (three orthogonal discriminators). `_id` is referenced as a **string**
  `collectionObj.refID` on objects.
- **`collection_objects`** — `collectionObj{name, refID(str)}`, `groupID`(str),
  `objectValue`(strict:false), `integrationInfo`, `archived`, `publishDate`(**Date**|null),
  `approvalStatus`(enum: draft/pending_review/approved/rejected), `approvalRequestedAt`/`approvalRequestedBy`,
  `approvalDecidedAt`/`approvalDecidedBy`, `approvalNote`, `usingVariant`, `author`,
  `embedding`/`embeddingModel` (both `select:false`). Schema indexes: `collectionObj.refID`,
  `publishDate`, `approvalStatus` (collectionObjectSchema.js:96-98). The only genuinely missing
  index is `groupID`.
- **`integration_objects`** — `id`(str), `platform`(str, e.g. `stripe`), `collectionGroup{name,refID(str)}`,
  `groupID`(str), `author`, `usingVariant`, `accountId`(**ObjectId**), `accountHandle`,
  `publishDate`, `scheduledTaskId`, `sourceRef{objectID,collectionName,collectionID}`,
  `embedding`/`embeddingModel`, `objectValue`(strict:false). Schema is `strict:false`, so social
  docs also persist `accountType`/`status`/`errorMessage`. Indexes: single-field `platform` and
  `accountHandle` only (integrationSchema.js:57,64) — there is **no** `groupID+platform` compound index.
- **`sites`** — `groupID`(str), `key`(site slug), `collectionGroups[]`, `collectionObjIds[]`,
  `integrationIds[]`, `pages[]`, `navigation{}`, `footer{}`, `deployment{status,...}`,
  `siteDetails{schema,values}`, `domainInformation`. Index: `groupID`.
- **`content_versions` / `site_versions`** — `entityId`(str), `entityType`, `version`(num),
  `snapshot`, `changeSummary{changedFields, changeType}`, `groupID`. Index: `entityId+version`.
- **`audit_logs`** — `action`, `entityType`, `entityId`(str), `groupID`, `actor{email,name}`.
  Indexes: `{groupID:1, createdAt:-1}`, `{groupID:1, entityType:1, entityId:1, createdAt:-1}`
  (auditLogSchema.js:35,37).

Control-plane (`Vivreal`): **`groups`** (`_id` ObjectId, `key` unique slug, `tier`,
`owner`, usage counters), **`leads`** (`email` unique, `attribution.first/last`),
**`media_files`** (groupID-scoped), **`usage_trackings`** (`groupID+docKey` unique),
**`domainorders`** (active; `dbKey`, `siteId`, stripe/route53/amplify state),
**`prospects`** (outreach prospecting pool, `domain` unique), **`inquiries`** (contact forms).

## Query safety rules (read-only by default)

1. **Read-only.** `find`/`aggregate`/`count` only. No `updateMany`/`deleteMany`/`insertMany`
   unless the user explicitly asks AND you confirm scope.
2. **Always scope tenant queries by `groupID`.** Every doc in `general_shared`/`pro_plus`
   (and `media_files`/`usage_trackings` in Vivreal) carries `groupID`. Omitting it crosses tenants.
3. **Never query mainDb by `groupName`.** `active_ctx` carries no `groupName`. Use
   `{ _id: <ObjectId(groupID)> }` or `{ key: <group.key> }`. `groupName` is display-only.
4. **String refs vs ObjectId** — `groupID`, `collectionObj.refID`,
   `collectionObjID`, `entityId` are **strings** on tenant docs. To filter them, pass strings.
   To JOIN them to an `_id`, cast `ObjectId(ref)` (see the linking section). Mixing these up
   silently returns zero rows.
5. **`_id` filters via the MCP tool use `{"$oid": "..."}`** extended JSON; string refs use plain strings.
6. **Filter `archived`** with `{ "archived": { "$ne": true } }` (so docs missing the field still match).
7. **Limit** — default 10, cap ~50. Sample ≤5 groups for cross-tenant questions.
8. **Redact secrets** in output: `apiKey`, `credentials`, `secret`, `accessToken`, `refreshToken`,
   `stripeKey`, `integrationKey`, anything matching `password|secret|token`. Show `[REDACTED]`.

## The publishDate storefront gate — the #1 "missing content" cause

The public site (VR_Client_API) hides content where `publishDate` is `null` (draft) or in the
future. "I created it in the portal but it's not on the live site" almost always means:
- `publishDate: null` → still a draft. Set a past/now Date to publish.
- `publishDate` stored as a **string** instead of a `Date` → silently dropped by the date filter.
- Future `publishDate` → scheduled, not yet live.
Check `publishDate` type and value FIRST. (Verified live: it is a `Date` on healthy docs.)

## Outreach data lives in `collection_objects`

Outreach **contacts, companies, and enrollments are `collection_objects`** in the tenant DB
(`general_shared`), under system `collection_groups`, differentiated by `collectionObj.refID`.
The dedicated `outreach_*` partial/unique indexes on `collection_objects` (e.g.
`outreach_contacts_email_unique`, `outreach_enrollments_seq_contact_unique`) are **not in the
shared Vivreal-Schemas `collectionObjectSchema` nor in VR_CMS_API** — they are created by
VR_Outreach_API / applied directly to live Mongo, so treat them as live-DB/outreach-service
artifacts, not schema-backed. The `outreach` database holds only the global `suppressions` list.
So to find a tenant's outreach contacts: resolve the Contacts system `collection_group` `_id`,
then query `collection_objects` by `collectionObj.refID` (string) — same pattern as any content.

## Known drift / data bugs (as of 2026-06-19)

- **`Vivreal.domainOrders` (camelCase) is an orphan duplicate** of `Vivreal.domainorders`
  (lowercase, the active one). The camelCase collection has 0 docs and non-partial unique
  indexes; the lowercase has the real data. Likely a Mongoose model-name mismatch — flag to
  the domain-orders owner; query `domainorders` (lowercase).
- **`media_files` / `usage_trackings` are in `Vivreal`, not the tenant DB** (older docs/skills
  said tenant DB — they were wrong).
- **`justinceccarelligroup`** is a stray per-group DB containing only `audit_logs`; don't
  generalize a per-group-DB model from it.

## When NOT to use this skill

- Non-Vivreal MongoDB work (generic Mongo questions).
- Editing Mongoose schema source code (a backend repo task — see the per-repo knowledge skills).
