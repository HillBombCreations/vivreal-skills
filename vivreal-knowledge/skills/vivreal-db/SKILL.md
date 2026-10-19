---
name: vivreal-db
description: 'Use when querying or exploring Vivreal''s MongoDB, including any time you are about to use the mcp__mongodb__* MCP tools, choosing which database, which collection, how to scope a query to a tenant, how to LINK collections together (collection_group ↔ collection_objects ↔ integration_objects, groups ↔ everything, sites ↔ versions/media), or debugging "content created in the portal but missing on the site". Teaches the safe multi-tenant query rules, the dbKey vs group.key vs bucketname distinctions, and the string-ref ↔ ObjectId cross-collection join rule that are the #1 source of bugs. Triggers on: mcp__mongodb, query mongo via MCP, mongodb find/aggregate/count, $lookup, join collections, link collection group to objects, list collections, collection schema, which database, which collection, group/tenant data, publishDate, dbKey, groupID.'
---

**This skill states pointers, not values.** Every count, database roster and quota below is
something a query produces in seconds. Where you see a number here that a query could have
produced, treat it as a defect in this file and report it. Read the deployed line, and pair
every zero-row result with a control that returns rows (see `verification-discipline`): a query
against a lowercased collection name returns zero rows against a database that has data.

# Vivreal Multi-Tenant MongoDB: Safe Query & Linking Rules

> **Which database a tenant lives in is a different subject, and it has its own skill.** This file
> is about querying once you are in the right database. For `group.dbKey`, `resolvePlacement`, the
> `pod_01`/`pod_02` placements, the merged `tenant-db` package, or a group whose site is 403 because
> it has no usable placement, use **`vivreal-tenancy`**. **The pod rename is DONE (2026-09-23)**:
> the tenant databases are `pod_01` and `pod_02`, and `general_shared` / `pro_plus` no longer exist
> (`vivreal-hq/docs/projects/tenancy-architecture/migration-run-2026-09-23.md`). A query against
> either old name returns ZERO documents with no error, so a hardcoded `general_shared` in a script
> or a memory note is a false not-found, not missing data.

> **Topology, collection names and the join rules below were re-verified read-only against live Mongo on 2026-10-15; indexes are read from the schemas package.** Read this before touching the `mcp__mongodb__*` tools. For an interactive helper, use the `/db-query` and `/db-schema` commands (`vivreal-db-explorer` plugin), this skill is the passive knowledge those commands assume.

## Getting connected (sourcing the connection string)

The `mcp__mongodb__*` tools need a MongoDB connection string to reach Atlas, it is
NOT hard-coded. Source it, then connect. The string is the Atlas **cluster** URI
(`mongodb+srv://…`) with NO database path; the database is selected per query.

**Where the connection string lives** (priority order):

1. **AWS Secrets Manager**: each backend has its own `vivreal/prod/<service>` secret
   (e.g. `vivreal/prod/cms-api`, `vivreal/prod/main-api`), key `CLUSTER_URL`, no path and
   no query string. **There is no single shared secret anymore.** The old `hb-api-secrets`
   store is fully deleted (2026-09-15, no recovery window). Do not read or resolve it.
   `vivreal-db-explorer`'s launcher (below) reads `vivreal/prod/main-api`, which is a live
   writable services-user secret; retrieve it the same way if you need it directly
   (requires AWS credentials for the account):
   ```bash
   aws secretsmanager get-secret-value --secret-id vivreal/prod/main-api \
     --query SecretString --output text \
     | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).CLUSTER_URL)'
   ```
2. **Local backend `.env`** (dev fallback), any backend repo under `${VIVREAL_REPOS}`
   (e.g. `${VIVREAL_REPOS}/VR_CMS_API/.env`) carries `CLUSTER_URL=mongodb+srv://…`.

**Then connect:** the `vivreal-db-explorer` plugin registers a **read-only** MongoDB
MCP server (`vivreal-db-explorer/.mcp.json` → `mongodb-mcp-server`). Its launcher, not `.mcp.json`, sets `MDB_MCP_READ_ONLY=true` (`scripts/launch-mongo-mcp.cjs`).
Its launcher (`scripts/launch-mongo-mcp.cjs`) sources `vivreal/prod/main-api` itself when
`MDB_MCP_CONNECTION_STRING` isn't already exported, and appends
`maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer` to whichever string it
resolves. Match that if you export the variable by hand:

```bash
export MDB_MCP_CONNECTION_STRING="$(aws secretsmanager get-secret-value --secret-id vivreal/prod/main-api \
  --query SecretString --output text \
  | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).CLUSTER_URL)')?maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer"
```

The server loads at session start (approve it on first use). If it isn't registered or
no connection is live, the `mcp__mongodb__*` tools won't exist, stop and report that;
never fabricate results. No MCP? You can still connect read-only via a backend repo's
driver: `NODE_PATH=${VIVREAL_REPOS}/VR_CMS_API/node_modules node <script using MongoClient>`.
Set `maxPoolSize: 1`, an `appName: 'script:<what>'`, and close the client in `finally`
(the same policy every non-Lambda connector follows; see `vivreal-atlas-topology`).

**Known gap:** `vivreal/prod/main-api`'s user can write. A dedicated read-only
`dev-tools-ro` user is proposed for MCP/CLI use but does not exist yet. Treat this
connection as read-only by convention (`MDB_MCP_READ_ONLY=true` and the query-safety rules
below), not by database-level enforcement, until that user lands.

**Security, the connection string IS a secret:**
- It embeds the Atlas username + password. NEVER echo it, write it to a file, paste it into
  a doc/PR/commit, or log it. It goes ONLY into the connect call.
- **Prefer a read-only Atlas database user.** That DB-level restriction, not the
  `MDB_MCP_READ_ONLY` flag, is the real security boundary (the flag is defense-in-depth).
  A read-only user also protects `groups.apiKey`, `webhooks.secret`, `groups.integrations`.
  Today's default path (`vivreal/prod/main-api`) does **not** have one (see "Known gap"
  above), so until `dev-tools-ro` exists, `MDB_MCP_READ_ONLY` plus the query-safety rules
  below are the only boundary in practice. Treat that as a real gap, not a technicality.

## Database topology

**Count the databases, do not quote a count.** `mcp__mongodb__list-databases`, or
`db.adminCommand({listDatabases: 1})`. There is no single "per-group database" model, and it is
equally wrong to say there are exactly three. The shape, which is stable:

| Database | Role | Holds | Which groups |
|---|---|---|---|
| `Vivreal` | **Control plane (mainDb)** | `groups`, `leads` (+ lifecycle `activated`/`activatedAt`), `checkout_sessions`, `media_files`, `usage_trackings`, `domainOrders`, `domains`, `inquiries`, `emailEvents`, `suppressions` (lifecycle-email), `dataDeletionRequests`, `site_traffic_dailies` (first-party analytics rollup; code and docs call it `site_traffic_daily`, but VR_Analytics_API pins `collectionName: 'site_traffic_dailies'`, so a query on the singular name is a false zero), `commerce_dailies`, `product_search_terms`/`product_search_dailies`, analytics caches, push subs, oauth verifiers. List them with `listCollections`; `prospects` is gone (dropped 2026-07-27, absent 2026-10-15) | ALL groups (registry) |
| `pod_01` (was `general_shared` until 2026-09-23) | **Tenant content** | `collection_groups`, `collection_objects` (incl. the SIX Outreach system groups, sequences/enrollments/contacts/senders/companies/segments, with `calls[]` + bookings on senders/companies), `integration_objects`, `sites`, `site_versions`, `content_versions`, `audit_logs`, `webhooks`, `stripe_webhook_events`, `square_webhook_events`, `metaWebhookEvents`, `instagram_comments`/`instagram_conversations`/`instagram_messages` | **Whichever groups carry `dbKey: "pod_01"`**: every customer group and the Vivreal group, across several tiers |
| `pod_02` (was `pro_plus` until 2026-09-23) | **Tenant content**, same shape as `pod_01` (the old `pro_plus` also carried a `stripe_products` collection holding ZERO documents, dead storage nothing reads, CMS CLAUDE.md:228-232) | same shape as `pod_01` | **Only the Vivreal Content group** (`6a68169fe1457c2f3fd04530`), placed there deliberately. NOT keyed on a tier. Census it: `Vivreal.groups` grouped by `dbKey` |
| `outreach` | **Outreach service** | `suppressions` only (global suppression list). NOTE: outreach **contacts/companies/enrollments are NOT here**, see below. | service-global |
| a slugified group name | **Legacy or stranded per-group DB** | usually only `audit_logs`, sometimes `content_versions` | Possibly no group at all. At least one such database has no group pointing at it. Do not rely on this pattern, and do not assume there is only one |

**The cluster is Atlas M10 (since 2026-10-17), and query work still shares it with production.**
The M0 Free tier before it capped data out at 10 GB per rolling 7 days (over it, every read slowed
to about 90 KB/s with no error); M10 has no such quota, but it is one small primary with 2 GB of RAM
and a limit of 15 new connections per second per node. Project your reads (`find` with a projection,
never whole site documents in a loop), because a heavy exploration session competes with the
production sites for the same node. Limits and the live tier: `vivreal-atlas-topology`.
Slow reads with ~0 ms server time are the data-out throttle, not your query. Diagnosis, levers and
the pending tier change (Flex chosen 2026-10-14, switch held): `vivreal-atlas-topology`.

**Routing rule: read the stored placement. NEVER compute one from the tier.**

```js
const { resolvePlacement } = require('@hillbombcreations/tenant-db/placement');
const dbKey = resolvePlacement(group); // throws if group.dbKey is absent or unroutable
```

A tenant database is a **placement**, assigned by measured weight. It is not a plan and it
never will be again, so no database name can tell you a tier and no tier can tell you a
database. `deriveDbKey()` and the `databaseDict[group.tier]` ladder are **deleted from every
repository**; if you see either, or an inline tier-to-database ladder, that IS the bug. Report
it, do not copy it. `pod_01` holds tenants of several tiers, and the retired `general_shared`
did too, so a database name was never capable of telling plans apart even when the ladder existed.

**A slugified-groupName database holding only `audit_logs` is legacy drift, not the model.**
More than one exists. A database no group points at is stranded, not a pattern to follow, and
the count of databases in the cluster is something to measure rather than remember.

**⚠️ Two collections are NOT where you'd expect:** `media_files` and `usage_trackings`
live in the **`Vivreal` (mainDb)** scoped by `groupID`, NOT in the tenant DB. Query them
against `Vivreal`, not a pod (`pod_01.media_files` was measured EMPTY on 2026-10-04; `Vivreal.media_files` is the store, and its `size` is a STRING, so coerce it with `$convert` before summing).

## The three keys you must not confuse

From the `active_ctx` JWT in the portal:

| Field | Example | What it is | Used for |
|---|---|---|---|
| `groupID` | `6795c1358b97114840265e65` | The group's Mongo `_id` (string form) | The `groupID` filter on EVERY tenant doc, tenant scoping |
| `dbKey` | `pod_01`, `pod_02`, or another placement name (`general_shared`/`pro_plus` are retired and refused) | The **stored** tenant database name, read back by `resolvePlacement(group)`. Never computed | Selecting the tenant database; passed as the `key` query param to CMS API |
| `group.key` (`bucketname` in `active_ctx`) | `exodussalescollective` | The group's URL **slug** | Half of the S3 bucket formula, CDN media paths, NOT database routing |

`dbKey` is the database name. `group.key` is the slug. They are different values.

**The S3 bucket is `bucketOf(group)`** (VR_Secure_API `src/shared/groupBucket.js`, VR_CMS_API `@shared/bucketOf`): the stored `group.bucket` wins, else `${group.type}-${group.key}`. Never build it from a `vivreal-` prefix by hand: the type half is not guaranteed, and a group with neither field must throw rather than touch `undefined-undefined`. Measured 2026-10-15: 25 of 26 groups store `bucket`.

## Linking collections together (the ER map)

**THE GOLDEN RULE (verified live):** tenant reference fields are stored as **strings**
that equal the *string form* of a target document's **ObjectId `_id`**.

- Going FROM a string ref → the target `_id` doc: **cast** `new ObjectId(ref)` (or
  `$toObjectId` in aggregation). Matching `{ _id: ref }` with the raw string returns
  **zero rows** (confirmed: `{_id: refID}` → NOT FOUND; `{_id: ObjectId(refID)}` → FOUND).
- Going FROM an `_id` doc → its referencing children: match the child's string field
  against `String(_id)`. Do NOT wrap the child field in `ObjectId()`, it's a string, and
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

`group.key` (slug) is NOT a join key for Mongo; the bucket comes from `bucketOf(group)` (above).

## Cross-collection query recipes

**Recipe A, objects WITH their collection group (single $lookup, type-converted).**
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

**Recipe B, manual two-step (use this via the MCP `find` tool, no aggregation needed):**
1. `find` the schema: `collection_groups` where `{ groupID: gid, name: "Blogs" }` → take its `_id`.
2. `find` the items: `collection_objects` where `{ "collectionObj.refID": "<that _id as a STRING>", archived: { $ne: true } }`.
   (refID is a string, so pass the string form, do NOT wrap in `$oid`.)

**Recipe C, a group's whole content footprint (counts per collection):**
```js
db.collection_objects.aggregate([
  { $match: { groupID: gid, archived: { $ne: true } } },
  { $group: { _id: "$collectionObj.name", count: { $sum: 1 } } }
])
```

**Recipe D, an object's version history:** `content_versions` where
`{ entityId: "<object _id as string>", entityType: "collectionObject" }`, sort `{ version: -1 }`.

**Recipe E, media for an object (note the DB!):** `Vivreal.media_files` where
`{ collectionObjID: "<object _id as string>", groupID: gid }`.

**Recipe F, group → everything (cross-DB):** there is no cross-database `$lookup`. To go
from `Vivreal.groups` to tenant content you must issue separate queries against the
tenant DB resolved from the group document. **Read `group.dbKey` first**, then query that
database with `groupID` in every filter. `media_files` and `usage_trackings` stay in `Vivreal`.

**MCP note:** the `mcp__mongodb__find` `_id` filter uses extended JSON `{"$oid":"..."}`;
tenant string refs (`groupID`, `collectionObj.refID`, `collectionObjID`, `entityId`) use
plain strings. For `$lookup` recipes use `mcp__mongodb__aggregate`.

## Collection field shapes (verified live, tenant DB)

- **`collection_groups`**, `_id`, `name`, `type`, `groupID`(str), `archived`, `linked`,
  `tags[]`, `schema`(strict:false), `widget`, `tableConfig`, `label`, `author{name,email}`,
  `hasMedia`, `useAsTemplate`, `system`, `skipAudit`, `skipVersioning`, `siteRole`,
  `scope`, `commerce`, `variantKeys`, `approvalRequired`, timestamps. **Indexes: none declared**
  beyond `_id`. `siteRole` is a plain String (not an enum), documented as `subscribers |
  reviews | reservations | quote-requests | contact | testimonials | bookings | group-subscribers | null`;
  measured 2026-10-15 both pods carry every value except `group-subscribers`. It is the stable
  discriminator for built-in site forms, orthogonal to `type` and `system`. `bookings` is not
  `reservations` (a booking is a committed appointment with a top-level `bookingStart`; a
  reservation is a request with free-text time), and `group-subscribers` is deliberately not
  `subscribers` (the portal's site resolver falls back to the first `subscribers` collection, so
  the group-wide store would hijack every site). `scope: 'group'` marks a collection owned by the
  group and bound to no site (the parked-domain subscriber store); absent means site-scoped, and a
  `scope: 'group'` collection must never be resolved as one site's. `commerce { state: selling |
  paused | moving, provider, moveId, movedAt }` is on product lists only, NO default, absent means
  selling (the payments move, `vivreal-cms-api-knowledge`). `_id` is referenced as a **string**
  `collectionObj.refID` on objects.
- **`collection_objects`**, `collectionObj{name, refID(str)}`, `groupID`(str),
  `objectValue`(strict:false), `integrationInfo`, `archived`, `publishDate`(**Date**|null),
  `approvalStatus`(enum: draft/pending_review/approved/rejected), `approvalRequestedAt`/`approvalRequestedBy`,
  `approvalDecidedAt`/`approvalDecidedBy`, `approvalNote`, `usingVariant`, `author`,
  `embedding`/`embeddingModel` (both `select:false`), plus the subscriber fields
  (`subscriberEmail` and friends, on subscriber rows only) and the booking fields
  (`bookingStart`, `bookingStatus`, on booking rows only). Read `collectionObjectSchema.js` for
  the full list. **Declared indexes:** `collectionObj_refID_1`, `publishDate_1`, `approvalStatus_1`,
  `collectionObj_refID_subscriberEmail_1` (sparse on a COMPOUND, which is a no-op: every row has
  `refID`, so every row is indexed), `collectionObj_refID_bookingStart_1` (compound +
  `partialFilterExpression`, the option that actually restricts it), and
  `groupID_objectValue_mediaKeys_1`. Read the `.index(` calls, not this list.
- **`integration_objects`**, `id`(str), `platform`(str, e.g. `stripe`), `collectionGroup{name,refID(str)}`,
  `groupID`(str), `author`, `usingVariant`, `accountId`(**ObjectId**), `accountHandle`
  `publishDate`, `scheduledTaskId`, `sourceRef{objectID,collectionName,collectionID}`
  `embedding`/`embeddingModel`, `objectValue`(strict:false). Schema is `strict:false`, so social
  docs also persist `accountType`/`status`/`errorMessage`. Indexes: read `integrationSchema.js`;
  it declares `groupID_platform_1` (`{ groupID: 1, platform: 1 }`).
- **`sites`**, `groupID`(str), `key`(site slug), `collectionGroups[]`, `collectionObjIds[]`,
  `integrationIds[]`, `pages[]`, `navigation{}`, `footer{}`, `deployment{status...}`
  `siteDetails{schema,values}`, `domainInformation`. Index: `groupID`.
- **`content_versions` / `site_versions`**, `entityId`(str), `entityType`, `version`(num),
  `snapshot`, `changeSummary{changedFields, changeType}`, `groupID`. Index: `entityId+version`.
- **`audit_logs`**, `action`, `entityType`, `entityId`(str), `groupID`, `actor{email,name}`.
  Indexes: `{groupID:1, createdAt:-1}`, `{groupID:1, entityType:1, entityId:1, createdAt:-1}`
  (auditLogSchema.js).

Control-plane (`Vivreal`): **`groups`** (`_id` ObjectId, `key` unique slug, `tier`,
`owner`, `dbKey`, `bucket`, usage counters), **`leads`** (`email` unique, `attribution.first/last`),
**`media_files`** (groupID-scoped; `size` is a STRING), **`usage_trackings`** (`groupID+docKey` unique),
**`domainOrders`** (active; `dbKey`, `siteId`, stripe/route53/amplify state), **`inquiries`** (contact forms).

## Query safety rules (read-only by default)

1. **Read-only.** `find`/`aggregate`/`count` only. No `updateMany`/`deleteMany`/`insertMany`
   unless the user explicitly asks AND you confirm scope.
2. **Always scope tenant queries by `groupID`.** Every doc in any tenant database
   (and `media_files`/`usage_trackings` in Vivreal) carries `groupID`. Omitting it crosses tenants.
3. **Never query mainDb by `groupName`.** `active_ctx` carries no `groupName`. Use
   `{ _id: <ObjectId(groupID)> }` (shell form; in Node write `new ObjectId(groupID)`, bson 6
   throws without `new`) or `{ key: <group.key> }`. `groupName` is display-only.
4. **String refs vs ObjectId**, `groupID`, `collectionObj.refID`,
   `collectionObjID`, `entityId` are **strings** on tenant docs. To filter them, pass strings.
   To JOIN them to an `_id`, cast `ObjectId(ref)` (see the linking section). Mixing these up
   silently returns zero rows.
5. **`_id` filters via the MCP tool use `{"$oid": "..."}`** extended JSON; string refs use plain strings.
6. **Filter `archived`** with `{ "archived": { "$ne": true } }` (so docs missing the field still match).
7. **Limit**, default 10, cap ~50. Sample ≤5 groups for cross-tenant questions.
8. **Redact secrets** in output: `apiKey`, `credentials`, `secret`, `accessToken`, `refreshToken`
   `stripeKey`, `integrationKey`, anything matching `password|secret|token`. Show `[REDACTED]`.

## Write and schema traps (read before any script that writes)

- **Strict schemas drop undeclared fields silently.** A field the Mongoose schema does not declare is discarded on write with no error (a webhook claim's `state` was never stored until the schema declared it). And `strict` resolves three ways: a `strict: false` SUB-schema lets a path through only while the QUERY leaves `strict` unset; a query that sets `strict: true` drops the ENTIRE update. Assert a new field survives a round trip through the real schema, with a control proving an undeclared one vanishes.
- **A native-driver write skips Mongoose.** `timestamps: true`, defaults, setters, validators and strict stripping are all Mongoose, so an ops-script correction through the driver does not move `updatedAt` (a sort on it cannot find the corrected rows) and can store a field the schema would drop. Set `updatedAt` explicitly if you need it, and record the correction outside the document.
- **`sparse` on a compound index is a no-op here, and a built index cannot be re-optioned.** MongoDB indexes a document under a compound sparse index if it carries ANY indexed key, and every `collection_objects` row carries `refID`. Use `partialFilterExpression`. Re-declaring a built index name with different options fails `IndexKeySpecsConflict` on every cold start (tenant DBs run `autoIndex`), silently; so measure a new index's key count against a single-field control BEFORE the schemas package publishes.
- **The same site `_id` can exist in more than one database.** The live site renders the copy in the group's placement (`<group.dbKey>.sites`). During the pod migration the help site existed under one `_id` in two databases and two writes went to the copy nothing reads. Before any site write, check for the `_id` elsewhere, say which copy you chose, and verify against the RENDERED page, never the document you wrote.
- **A collection-object update that omits `publishDate` UNPUBLISHES the item.** The portal proxy sends `publishDate: body?.publishDate ?? null`, CMS writes the null, and the public read gates on `publishDate <= now`. A scripted edit sends the item's existing `publishDate` (and `__v`, for the optimistic-concurrency check) every time.
- **Heavy reads compete with production.** A prod walk or an unprojected exploration loop competes with live sites for the same primary (on the old M0 tier it also spent the weekly 10 GB data-out budget), and connection-hungry runs eat the connection-creation rate. Project every read, keep `maxPoolSize: 1`, and close the client.

## The publishDate storefront gate: the #1 "missing content" cause

The public site (VR_Client_API) hides content where `publishDate` is `null` (draft) or in the
future. "I created it in the portal but it's not on the live site" almost always means:
- `publishDate: null` → still a draft. Set a past/now Date to publish.
- `publishDate` stored as a **string** instead of a `Date` → silently dropped by the date filter.
- Future `publishDate` → scheduled, not yet live.
Check `publishDate` type and value FIRST. (Verified live: it is a `Date` on healthy docs.)

## Outreach data lives in `collection_objects`

Outreach **contacts, companies, and enrollments are `collection_objects`** in the tenant DB
(the Vivreal group's placement, `pod_01`; it was `general_shared` before 2026-09-23), under system `collection_groups`, differentiated by `collectionObj.refID`. The owner decided on 2026-09-28 to move the outreach CRM into the internal admin app, so re-check where this data is served from before relying on the portal routes.
The dedicated `outreach_*` partial/unique indexes on `collection_objects` (e.g.
`outreach_contacts_email_unique`, `outreach_enrollments_seq_contact_unique`) are **not in the
shared Vivreal-Schemas `collectionObjectSchema` nor in VR_CMS_API**, they are created by
VR_Outreach_API / applied directly to live Mongo, so treat them as live-DB/outreach-service
artifacts, not schema-backed. The `outreach` database holds only the global `suppressions` list.
So to find a tenant's outreach contacts: resolve the Contacts system `collection_group` `_id`
then query `collection_objects` by `collectionObj.refID` (string), same pattern as any content.

## Known drift (measured 2026-10-15; re-measure before relying on it)

- **The domain orders live in `Vivreal.domainOrders` (camelCase).** The lowercase `domainorders` the old model name produced is gone after VR_Secure_API #231 and its data migration. This is the mongoose collection-name lowercasing trap: always pass `collectionName`, and suspect it whenever a query returns zero rows against a database you believe has data.
- **`media_files` / `usage_trackings` are in `Vivreal`, not the tenant DB.**
- **A slugified per-group database holding only `audit_logs`** is legacy drift; don't generalize a per-group-DB model from it.

## When NOT to use this skill

- Non-Vivreal MongoDB work (generic Mongo questions).
- Editing Mongoose schema source code (a backend repo task, see the per-repo knowledge skills).
