---
name: vivreal-db
description: Use when querying or exploring Vivreal's MongoDB — choosing which database (Vivreal mainDb vs general_shared vs pro_plus), which collection, how to scope a query to a tenant, or debugging "content created in the portal but missing on the site". Teaches the safe multi-tenant query rules and the dbKey vs group.key vs bucketname distinctions that are the #1 source of bugs. Triggers on: query mongo, find documents, which database, which collection, collection schema, group/tenant data, publishDate, dbKey, groupID.
---

# Vivreal Multi-Tenant MongoDB — Safe Query Rules

Vivreal is multi-tenant MongoDB with **three databases** — there is NO per-group database. Confusing the routing keys is the most common bug. Read this before touching the `mcp__mongodb__*` tools. For an interactive, argument-driven query/schema helper, use the `/db-query` and `/db-schema` commands (from the `vivreal-db-explorer` plugin) — this skill is the passive knowledge those commands assume.

## The three databases

| Database | Holds | Which groups |
|---|---|---|
| `Vivreal` (the mainDb) | Control plane: `groups`, `checkoutsessions`, `leads` | All groups — this is the registry |
| `general_shared` | Tenant content: `collection_groups`, `collection_objects`, `integration_objects`, `sites`, `mediafiles`, `auditlogs`, `contentversions`, `webhooks`, `usagetrackings` | `free` / `basic` / `pro` tier groups |
| `pro_plus` | Same tenant collections as `general_shared` | `proplus` tier groups |

Tenants in the same tier **share** a database. Isolation is by the `groupID` field on every tenant document — never by a separate DB.

To find where a group's data lives: look up the group in `Vivreal.groups`, read its `tier`, route to `general_shared` (free/basic/pro) or `pro_plus` (proplus). This is exactly what `VR_Client_Auth` and `deriveDbKey()` do at runtime.

## The three keys you must not confuse

These three values look similar and are routinely swapped by mistake. They come from the `active_ctx` JWT in the portal:

| Field | Example | What it is | Used for |
|---|---|---|---|
| `groupID` | `68f27fec32e7acbb755c087e` | The group's Mongo `_id` in `Vivreal.groups` | The `groupID` filter on EVERY tenant query — tenant scoping |
| `dbKey` | `general_shared` / `pro_plus` | The tier-mapped **database name** (`deriveDbKey()` maps tier → db) | Selecting the tenant database (`dynamicDb[dbKey]`). Passed as the `key` query param to CMS API routes. Equals `group.key` ONLY by coincidence is FALSE — it is the database name, not the slug. |
| `bucketname` / `group.key` | `thecomedycollective` → bucket `vivreal-thecomedycollective` | The group's URL slug | S3 bucket naming (`vivreal-{group.key}`), CDN media paths — NOT database routing |

**Hard rule:** `dbKey` is the database name (`general_shared`/`pro_plus`). `group.key` is the S3 slug. They are different values. Treating `group.key` as a database name (or vice versa) is a classic failure.

## Query safety rules (read-only by default)

1. **Read-only.** Use `find` / `aggregate` / `count` only. No `updateMany` / `deleteMany` / `insertMany` unless the user explicitly asks for a mutation and you confirm scope.
2. **Always scope tenant queries by `groupID`.** Every doc in `general_shared`/`pro_plus` carries `groupID`. A query without it crosses tenant boundaries.
3. **Never query mainDb by `groupName`.** `active_ctx` carries NO `groupName`. Use `{ _id: <groupID> }` or `{ key: <group.key> }`. `groupName` is display-only and was a recurring delete-service bug.
4. **`groupID` and `collectionObj.refID` are stored as STRINGS on tenant docs** — never wrap them in `ObjectId()`. Filtering a string field with an ObjectId silently returns zero rows. (This bit the Outreach contacts work: group refIDs stored as strings meant ObjectId filters matched 0.)
5. **`_id` filters via the MCP tool use `{"$oid": "..."}`** extended-JSON syntax; tenant `groupID`/`refID` filters use plain strings.
6. **Filter `archived`.** Unless asked for archived items, add `{ "archived": { "$ne": true } }` (use `$ne: true` so docs missing the field still match).
7. **Limit results** — default 10, cap ~50. Sample at most ~5 groups for cross-tenant questions.
8. **Redact secrets** in output: `credentials`, `apiKey`, `secretKey`, `accessToken`, `refreshToken`, `stripeKey`, `integrationKey`, anything matching `password|secret|token`. Show `[REDACTED]`.

## The publishDate storefront gate — the #1 "missing content" cause

The public site (VR_Client_API) hides content where `publishDate` is `null` (draft) or in the future. So "I created it in the portal but it's not on the live site" almost always means:

- `publishDate: null` → still a draft. Set a past/now ISO date to publish.
- `publishDate` is a **string instead of a Date** → silently dropped by the date-range filter. Store it as a real `Date`/ISO timestamp, not a bare string.
- Future `publishDate` → scheduled, not yet live (EventBridge publishes at the time).

When debugging a storefront-visibility issue, check `publishDate` type and value FIRST.

## Key collections (tenant DBs)

| Collection | Notes |
|---|---|
| `collection_groups` | Content-type schemas. `_id` is referenced as `collectionObj.refID` (a STRING) on objects. `schema` is `strict:false`. |
| `collection_objects` | Content items. `objectValue` is `strict:false`. `publishDate` gates storefront. `collectionObj.refID` (string) links to the schema. |
| `integration_objects` | Stripe products / social posts. Single collection differentiated by `platform` field (not 6 collections). `strict:false`. |
| `sites` | Deployed sites. `deployment.status` (`pending`/`deploying`/`live`/`failed`), `pages[].format` drives layout. |
| `mediafiles` | S3 metadata only — media bytes live in S3, never Mongo. |
| `auditlogs` | Fire-and-forget audit trail. Indexed `{ groupID, createdAt }`. |
| `contentversions` | Version history; `{ entityId, version }` indexed. |

## Key collections (mainDb `Vivreal`)

| Collection | Notes |
|---|---|
| `groups` | The tenant registry. `tier` → DB routing; `key` → S3 slug; `_id` → `groupID`. Usage counters (`entries`, `mediaUsage`, `apiUsage`, `cdnUsage`, `agentUsage`) can drift from real counts. |
| `checkoutsessions` | Stripe checkout, 90-day TTL. |
| `leads` | Owned/written by VR_Main_API; read-only mirror in VR_Secure_API for the admin attribution endpoint. |

## When NOT to use this skill

- Non-Vivreal MongoDB work (generic Mongo questions).
- Editing Mongoose schema source code (that's a backend repo task — see the per-repo knowledge skills).
