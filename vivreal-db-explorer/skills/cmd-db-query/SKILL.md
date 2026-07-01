---
name: db-query
description: Safely query Vivreal's multi-tenant MongoDB via MCP — with built-in dbKey routing, safety guards, and result formatting
allowed-tools: Bash, mcp__mongodb__connect, mcp__mongodb__find, mcp__mongodb__aggregate, mcp__mongodb__count, mcp__mongodb__list-databases, mcp__mongodb__list-collections, mcp__mongodb__collection-schema, mcp__mongodb__collection-indexes, mcp__mongodb__db-stats
user-invocable: true
---

# /db-query — Safe MongoDB Query

Query Vivreal's multi-tenant MongoDB with built-in awareness of the database routing scheme and safety guards.

> **Source of truth:** the `vivreal-db` skill carries the live-verified topology (5 databases),
> the real snake_case collection names, and the cross-collection linking rules (string-ref ↔
> ObjectId joins, `$lookup` recipes). The per-field schemas below are still accurate, but note
> the collection-name + DB-location corrections in "Multi-Tenant Database Routing" below.

## Arguments

`/db-query <database> <collection> [filter] [--limit=10] [--sort=field:asc|desc] [--project=field1,field2] [--count] [--aggregate]`

- `<database>`: Database name. Must be one of:
  - `Vivreal` (or `main`) — the control-plane DB (groups, users, checkout sessions)
  - `general_shared` — tenant data for **free / basic / pro** tier groups
  - `pro_plus` — tenant data for **pro_plus** tier groups
- `<collection>`: MongoDB collection name (see collection map below)
- `[filter]`: JSON filter object (e.g., `{"archived": {"$ne": true}}`)
- `--limit`: Max documents to return (default: 10, max: 50)
- `--sort`: Sort field and direction
- `--project`: Comma-separated fields to include in projection
- `--count`: Return count instead of documents
- `--aggregate`: Treat filter as an aggregation pipeline

## Connecting (self-service — NEVER ask the user for the connection string)

The MCP server is normally **already connected**: the `vivreal-db-explorer` plugin launches it
through `scripts/launch-mongo-mcp.cjs`, which sources the Atlas `CLUSTER_URL` from AWS Secrets
Manager (`hb-api-secrets`) at startup. So your first query usually just works — try it first.

**If a query returns "you need to connect first" / "not connected":** the launcher could not
reach Secrets Manager (e.g. AWS creds weren't present at launch). Source the string yourself and
connect — do **NOT** ask the user to paste a connection string. It is the Atlas **cluster** URI
(`mongodb+srv://…`, no database path; the DB is chosen per query):

```bash
aws secretsmanager get-secret-value --secret-id hb-api-secrets --query SecretString --output text \
  | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).CLUSTER_URL)'
```

Pass that value to `mcp__mongodb__connect`, then re-run the query. The `vivreal-db` knowledge skill
(vivreal-knowledge plugin) carries the full sourcing detail and a no-MCP driver fallback.

**The connection string is a secret** — it embeds the Atlas user + password. Pass it ONLY into the
connect call. Never echo it, write it to a file, or paste it into a doc/PR/commit. Only ask the user
for it as a true last resort, and only if AWS Secrets Manager is genuinely unreachable (no creds, no
network) — say *which* step failed before asking.

## Multi-Tenant Database Routing

Vivreal uses multi-tenant MongoDB. Tenant **content** lives in two shared databases by tier,
but the live cluster has **5 databases** (verified 2026-06-19):

| Database | Contents | Which groups? |
|---|---|---|
| `Vivreal` | Control plane: `groups`, `leads`, `checkout_sessions`, **`media_files`**, **`usage_trackings`**, `domainorders`, `prospects`, `inquiries` | All (mainDb) |
| `general_shared` | Tenant content: `collection_groups`, `collection_objects`, `integration_objects`, `sites`, `site_versions`, `content_versions`, `audit_logs`, `webhooks` | free / basic / pro |
| `pro_plus` | Tenant content (same shape + `stripe_products`, `collection_templates`) | proplus (currently empty) |
| `outreach` | `suppressions` only (global) | service-global |
| `justinceccarelligroup` | only `audit_logs` (~4) — legacy/anomalous per-group DB | one group (do not rely) |

**Collection-name corrections (live names are snake_case):** `checkoutsessions`→`checkout_sessions`,
`mediafiles`→`media_files`, `auditlogs`→`audit_logs`, `contentversions`→`content_versions`,
`usagetrackings`→`usage_trackings`. **`media_files` and `usage_trackings` live in `Vivreal`,
NOT the tenant DB.** New collections not listed in the per-field schemas below: `site_versions`,
`stripe_webhook_events`, `stripe_products`, `collection_templates`, `prospects`, `inquiries`.

Tenant isolation is via the `groupID` field on every document. To find which DB holds a group's
content: look up the group in `Vivreal.groups`, read `tier`, route to `general_shared` (free/basic/pro)
or `pro_plus` (proplus). The `key` field is **S3 bucket naming**, NOT database routing.

## Collections & Schemas

### Main DB (`Vivreal`)

#### `groups` — Tenant organizations
| Field | Type | Purpose |
|---|---|---|
| `_id` | ObjectId | Primary key — referenced as `groupID` on all tenant objects |
| `owner` | String | Owner's Cognito sub or email |
| `groupName` | String | Display name |
| `key` | String | Used for S3 bucket naming (NOT DB routing) |
| `tier` | String | `"free"`, `"basic"`, `"pro"`, or `"proplus"` — determines tenant DB |
| `type` | String | Group type identifier |
| `joinCode` | String | Invite code for joining |
| `apiKey` | String | API key for VR_Client_API access |
| `users` | Array | `[{ family_name, given_name, username, email, role }]` |
| `integrations` | Array | `[{ type, accounts: [IntegrationAccount] }]` — embedded integration configs |
| `entries` | Object | `{ totalSize: Number, quota: Number }` — content object count & limit |
| `userSeats` | Object | `{ totalSize: Number, quota: Number }` |
| `integrationUsage` | Object | `{ totalSize: Number, quota: Number }` |
| `mediaUsage` | Object | `{ totalSize: Decimal128, quota: Number }` — bytes, default 500MB |
| `dataUsage` | Object | `{ totalSize: Decimal128 }` |
| `sites` | Object | `{ totalSize: Number, quota: Number }` |
| `apiUsage` | Object | `{ month, quota, totalCalls, totalBytes, lifetimeCalls, lifetimeBytes, updatedAt }` |
| `cdnUsage` | Object | `{ month, quota, totalBytes, lifetimeBytes, updatedAt }` |
| `agentUsage` | Object | `{ totalActions, quota, periodStart, history: [{ date, actions }] }` |
| `companyInfo` | Object | `{ companyName, companySize, industry, jobTitle, website, goals }` |
| `media` | Object | `{ logo: {name,key}, profilePicture: {name,key}, footer: {name,key} }` |
| `profilePicture` | Object | `{ type, value, color: {text, background} }` — avatar config |
| `createdAt` / `updatedAt` | Date | Timestamps |

**Indexes:** `{ type: 1, 'users.email': 1 }`, `{ type: 1, key: 1 }`, `{ groupName: 1 }`, `{ stripeSubscriptionID: 1 }` (sparse)

**IntegrationAccount subdocument** (embedded in `groups.integrations[].accounts[]`):
`{ scope, label, handle, connectedBy, connectedAt, status, tokenExpiry, socialProfile }` — `strict: false` so extra fields (tokens, credentials) stored dynamically

#### `checkoutsessions` — Stripe checkout sessions (90-day TTL)
| Field | Type | Purpose |
|---|---|---|
| `sessionID` | String | Internal session ID (indexed) |
| `stripeID` | String | Stripe's session ID |
| `stripeSessionObject` | Object | `{ customer, payment_method_types, line_items, mode, metadata, success_url, cancel_url }` |
| `createdAt` | Date | Auto-expires after 90 days (TTL index) |

---

### Tenant DBs (`general_shared` / `pro_plus`)

#### `collection_groups` — Collection definitions (schemas)
| Field | Type | Purpose |
|---|---|---|
| `_id` | ObjectId | Primary key — referenced as `collectionObj.refID` in objects |
| `name` | String | Collection name (e.g., "Shows", "Products") |
| `type` | String | Collection type identifier |
| `groupID` | String | Owner group's `_id` |
| `linked` | Boolean | Whether linked to another collection |
| `hasMedia` | Boolean | Whether objects support media uploads |
| `archived` | Boolean | Soft delete flag |
| `tags` | Array | `[{ name, background, color }]` |
| `useAsTemplate` | Boolean | Can be used as template for other groups |
| `approvalRequired` | Boolean | Whether objects need approval before publishing |
| `variantKeys` | Object | Variant configuration (`strict: false` — dynamic keys) |
| `schema` | Object | Dynamic field definitions (`strict: false`) |
| `author` | Object | `{ name, email }` |
| `label` | String | Display label |
| `widget` | Object | `{ color, letters }` — UI widget config |
| `tableConfig` | Object | `{ headers: { columnOne..columnFour: { label, key, meta } } }` |
| `createdAt` / `updatedAt` | Date | Timestamps |

#### `collection_objects` — Content items
| Field | Type | Purpose |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `collectionObj` | Object | `{ name: String, refID: String }` — **refID is a string**, not ObjectId |
| `groupID` | String | Owner group's `_id` |
| `publishDate` | Date | When content goes live (null = draft) |
| `archived` | Boolean | Soft delete flag |
| `author` | Object | `{ name, email }` |
| `usingVariant` | Object | `{ name, values: [] }` — which variant is active |
| `objectValue` | Object | Dynamic content data (`strict: false`). Media objects also have `objectValue.mediaFields` mapping `{ "filename.jpg": "fieldPath" }` |
| `integrationInfo` | Object | Integration-related metadata (`strict: false`) |
| `approvalStatus` | String | `'draft'`, `'pending_review'`, `'approved'`, `'rejected'` |
| `approvalRequestedAt` / `approvalRequestedBy` | Date/Object | Approval request details |
| `approvalDecidedAt` / `approvalDecidedBy` | Date/Object | Approval decision details |
| `approvalNote` | String | Reviewer's note |
| `embedding` | [Number] | Vector embedding (select: false — hidden by default) |
| `embeddingModel` | String | Model used for embedding |

**Indexes:** `{ 'collectionObj.refID': 1 }`, `{ publishDate: 1 }`, `{ approvalStatus: 1 }`

#### `integration_objects` — Integration items (Stripe products, social posts)
| Field | Type | Purpose |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `id` | String | External platform ID (e.g., Stripe product ID) |
| `collectionGroup` | Object | `{ name, refID }` — linked collection group |
| `groupID` | String | Owner group's `_id` (required) |
| `platform` | String | Integration platform (required, indexed) — e.g., `"stripe"`, `"instagram"` |
| `accountId` | ObjectId | Reference to integration account |
| `accountHandle` | String | Platform handle (indexed) |
| `publishDate` | Date | Scheduled publish date |
| `scheduledTaskId` | String | Async task ID for scheduled publishing |
| `sourceRef` | Object | `{ objectID, collectionName, collectionID }` — source content reference |
| `author` | Object | `{ name, email }` |
| `usingVariant` | Object | `{ name, values: [] }` |
| `objectValue` | Object | Dynamic content data (`strict: false`) |
| `embedding` / `embeddingModel` | [Number] / String | Vector embedding (select: false) |

**Note:** This schema is `strict: false` at the top level — extra fields may be stored.

#### `sites` — Deployed websites
| Field | Type | Purpose |
|---|---|---|
| `_id` | ObjectId | Primary key |
| `name` | String | Site name |
| `groupID` | String | Owner group's `_id` |
| `key` | String | Site key identifier |
| `deployment` | Object | `{ status, message, errorMessage, updatedAt, appId }` — Amplify deployment state |
| `siteInfo` | Object | `{ templateType, mode }` |
| `domainInformation` | Object | `{ domain, subdomain, live_url }` |
| `siteDetails` | Object | `{ schema, values }` — both `strict: false` |
| `pages` | Array | `[{ name, slug, format, collectionId, displayOnHeader, displayOnFooter, labels }]` |
| `homeSections` | Array | DEPRECATED — `[{ type, order, enabled, config }]` |
| `socialLinks` | Array | `[{ type, link }]` |
| `businessInfo` | Object | `{ name, description, address: {street1,street2,city,state,zip}, contactInfo: {email,phoneNumber}, shipping }` |
| `integrationsUsed` | Array | List of integration IDs used by the site |
| `archived` | Boolean | Soft delete flag |

#### `mediafiles` — Uploaded media file records
| Field | Type | Purpose |
|---|---|---|
| `groupID` | String | Owner group's `_id` (required) |
| `key` | String | S3 object key |
| `collectionObjID` | String | Associated collection object |
| `objectName` | String | Object display name |
| `objectType` | String | Object type identifier |
| `objectKey` | String | Object key |
| `fileName` | String | Original file name (required) |
| `type` | String | MIME type |
| `size` | String | File size |
| `collectionGroup` | Object | `{ name, refID }` |
| `author` | Object | `{ name, email }` |

**Indexes:** `{ groupID: 1 }`, `{ groupID: 1, fileName: 1 }`

#### `auditlogs` — Audit trail
| Field | Type | Purpose |
|---|---|---|
| `action` | String | e.g., `'content.created'`, `'collection.deleted'`, `'group.roleChanged'` (required, indexed) |
| `entityType` | String | `'collectionObject'`, `'collectionGroup'`, `'integration'`, `'site'`, `'group'`, `'user'` (required, indexed) |
| `entityId` | String | ID of the affected entity (required, indexed) |
| `groupID` | String | Owner group's `_id` (required, indexed) |
| `actor` | Object | `{ email (required), name, role }` |
| `metadata` | Mixed | Action-specific data (changed fields, old/new values, version number) |
| `ipAddress` | String | Request IP |
| `requestId` | String | Trace ID |

**Indexes:** `{ groupID: 1, createdAt: -1 }`, `{ groupID: 1, entityType: 1, entityId: 1, createdAt: -1 }`

#### `contentversions` — Content version history
| Field | Type | Purpose |
|---|---|---|
| `entityId` | String | ID of the versioned object (required, indexed) |
| `entityType` | String | Default `'collectionObject'` |
| `version` | Number | Auto-incrementing version number (required) |
| `snapshot` | Mixed | Full deep copy of objectValue + publishDate + author at that point (required) |
| `changeSummary` | Object | `{ changedFields: [String], changeType: 'create'|'update'|'delete'|'revert'|'approval' }` |
| `author` | Object | `{ name, email }` |
| `groupID` | String | Owner group's `_id` (required, indexed) |

**Indexes:** `{ entityId: 1, version: -1 }`, `{ groupID: 1, createdAt: -1 }`

#### `webhooks` — Webhook configurations
| Field | Type | Purpose |
|---|---|---|
| `url` | String | Delivery URL (required) |
| `events` | [String] | Subscribed events (required) |
| `secret` | String | HMAC signing secret (required) |
| `active` | Boolean | Whether webhook is enabled |
| `description` | String | Human-readable description |
| `groupID` | String | Owner group's `_id` (required, indexed) |
| `lastDeliveryAt` | Date | Last delivery attempt |
| `lastDeliveryStatus` | Number | HTTP status of last delivery |
| `consecutiveFailures` | Number | Failure count for auto-disable |
| `disabledAt` | Date | When auto-disabled due to failures |

**Indexes:** `{ groupID: 1, active: 1, events: 1 }`

#### `usagetrackings` — Data usage tracking
| Field | Type | Purpose |
|---|---|---|
| `groupID` | String | Owner group's `_id` (required) |
| `docKey` | String | Document key (required) |
| `type` | String | Usage type (required) |
| `size` | String | Size value |
| `collectionGroup` | Mixed | Associated collection group |
| `author` | Object | `{ name, email }` |

**Indexes:** `{ groupID: 1, docKey: 1 }` (unique)

## Safety Rules

1. **READ-ONLY by default** — this command only uses `find`, `aggregate`, `count`. No `updateMany`, `deleteMany`, `insertMany`.
2. **Always filter `archived`** — unless the user explicitly asks for archived items, add `{"archived": {"$ne": true}}` to the filter. Use `$ne: true` (not `false`) to handle documents where the `archived` field is missing.
3. **Limit enforcement** — never return more than 50 documents. Default to 10.
4. **Never query mainDb by `groupName` alone** — prefer `{ key: dbKey }` or `{ _id: groupID }`. `groupName` is for display only.
5. **Redact credentials** — if results contain `credentials`, `apiKey`, `secretKey`, `accessToken`, `refreshToken`, `stripeKey`, `integrationKey`, or similar fields, show `[REDACTED]` instead.
6. **`collectionObj.refID` is a string** — never wrap it in `ObjectId()`. Same for `groupID` on tenant objects.
7. **`_id` fields require `{"$oid": "..."}` syntax** when querying via the MCP MongoDB tool.

## Procedure

1. **Connect** — try the query first (the launcher usually has the server connected). If it reports "not connected", follow the **Connecting** section above: source `CLUSTER_URL` from `hb-api-secrets` yourself and call `mcp__mongodb__connect`. Never ask the user for the string.
2. **Resolve database name**:
   - `main` or `Vivreal` → use `Vivreal` (control plane)
   - If user gives a group name → look up the group in `Vivreal.groups` to find its `tier`, then route to `general_shared` or `pro_plus`
   - If user says `general_shared` or `pro_plus` directly → use as-is
3. **Build the filter** — merge user filter with safety defaults (archived filter, groupID scoping)
4. **Execute the query** via MCP tools
5. **Format results** — show as a clean table or JSON, redacting sensitive fields
6. **Report**: database, collection, filter used, count of results, whether more exist

## Examples

```
/db-query Vivreal groups {"key": "mygroup"}
→ Looks up a group in the mainDb by group key

/db-query general_shared collection_groups {"groupID": "68f27fec..."}
→ Finds all non-archived collection groups for a free/basic/pro group, limit 10

/db-query general_shared collection_objects {"collectionObj.refID": "68f94f0a..."} --limit=5 --sort=createdAt:desc
→ Finds latest 5 objects in a specific collection

/db-query pro_plus sites {"groupID": "68f27fec..."}
→ All sites for a pro_plus tier group

/db-query general_shared auditlogs {"groupID": "68f27fec..."} --limit=20 --sort=createdAt:desc
→ Latest 20 audit log entries for a group
```
