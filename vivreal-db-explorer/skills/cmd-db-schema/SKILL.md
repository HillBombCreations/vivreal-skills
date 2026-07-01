---
name: db-schema
description: Show the Mongoose schema definition, indexes, and a sample document for any Vivreal MongoDB collection
allowed-tools: Bash, mcp__mongodb__connect, mcp__mongodb__find, mcp__mongodb__collection-schema, mcp__mongodb__collection-indexes, mcp__mongodb__list-collections, mcp__mongodb__list-databases, mcp__mongodb__db-stats, Read, Glob, Grep
user-invocable: true
---

# /db-schema — Collection Schema Explorer

Shows the full picture of a MongoDB collection: Mongoose schema definition (from source code), actual indexes, and a sample document.

## Connecting (self-service — NEVER ask the user for the connection string)

The MCP server is normally **already connected** — the `vivreal-db-explorer` plugin launches it via
`scripts/launch-mongo-mcp.cjs`, which sources the Atlas `CLUSTER_URL` from AWS Secrets Manager
(`hb-api-secrets`) at startup. Try your first MCP call directly. If it returns "not connected",
source the string yourself and call `mcp__mongodb__connect` — do **NOT** ask the user to paste one:

```bash
aws secretsmanager get-secret-value --secret-id hb-api-secrets --query SecretString --output text \
  | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).CLUSTER_URL)'
```

It is a secret (embeds the Atlas user + password): pass it only into the connect call, never log or
persist it. Only ask the user as a true last resort, and only if Secrets Manager is genuinely
unreachable — say which step failed first. See the `vivreal-db` skill for the full detail.

## Arguments

`/db-schema <database> <collection> [--source] [--indexes] [--sample] [--stats]`

- `<database>`: Database name — `Vivreal` (mainDb), `general_shared`, or `pro_plus`. If a group name is given, look up its tier to route to the correct tenant DB.
- `<collection>`: Collection name
- `--source`: Show the Mongoose schema definition from source code (searches backend repos)
- `--indexes`: Show all indexes on the collection
- `--sample`: Show a sample document (with sensitive fields redacted)
- `--stats`: Show collection stats (document count, size)

If no flags are specified, all sections are shown.

## Procedure

### 1. Find the Mongoose Schema (--source)

Search these locations for the schema definition:

| Repo | Schema Locations |
|---|---|
| VR_CMS_API | `C:\repos\VR_CMS_API\src\models\` |
| VR_Secure_API | `C:\repos\VR_Secure_API\src\models\` or inline in services |
| VR_Main_API | `C:\repos\VR_Main_API\src\models\` |
| Vivreal-Schemas | `C:\repos\Vivreal-Schemas\` (shared schemas) |

Search strategy:
1. Grep for the collection name (singular form) + `Schema` in the model directories
2. Read the matching file to extract the full schema definition
3. Note: `strict: false` subdocuments, `_id: false` settings, virtual fields, indexes defined in schema

### 2. Get Actual Indexes (--indexes)

Use `mcp__mongodb__collection-indexes` to fetch the real indexes from MongoDB.

Compare with schema-defined indexes and note any discrepancies.

### 3. Get Sample Document (--sample)

Use `mcp__mongodb__find` with `limit: 1` to fetch one document.

**Redaction rules** — replace these field values with `[REDACTED]`:
- `credentials`, `apiKey`, `secretKey`, `accessToken`, `refreshToken`
- Any field containing `password`, `secret`, `token` (case-insensitive)
- `stripeKey`, `integrationKey`

### 4. Get Collection Stats (--stats)

Use `mcp__mongodb__db-stats` or `mcp__mongodb__count` to show:
- Total document count
- Approximate storage size
- Index count and size

## Output Format

```
## Schema: <database>.<collection>

### Mongoose Definition
Source: <file path>
```javascript
// Schema definition from source code
```

### Indexes
| Name | Keys | Unique | Sparse |
|---|---|---|---|
| _id_ | { _id: 1 } | ✓ | |
| ... | ... | ... | ... |

### Sample Document
```json
{
  // sample doc with redacted sensitive fields
}
```

### Stats
- Documents: X
- Storage: X MB
- Indexes: X (X KB)
```

## Common Collection Names

For quick reference, the user might use informal names. Map these:

| User says | Actual collection | Database |
|---|---|---|
| collections, collection groups | `collection_groups` | `general_shared` / `pro_plus` |
| objects, items, content | `collection_objects` | `general_shared` / `pro_plus` |
| integration items, products, posts | `integration_objects` | `general_shared` / `pro_plus` |
| sites | `sites` | `general_shared` / `pro_plus` |
| media, files | `mediafiles` | `general_shared` / `pro_plus` |
| audit, logs | `auditlogs` | `general_shared` / `pro_plus` |
| versions | `contentversions` | `general_shared` / `pro_plus` |
| webhooks | `webhooks` | `general_shared` / `pro_plus` |
| usage tracking | `usagetrackings` | `general_shared` / `pro_plus` |
| groups, orgs, tenants | `groups` | `Vivreal` (mainDb) |
| checkout sessions | `checkoutsessions` | `Vivreal` (mainDb) |

## Database Name Resolution

Same rules as `/db-query`:
- `main` or `Vivreal` → `Vivreal` (control-plane DB with groups, users, checkout sessions)
- `general_shared` → tenant data for free / basic / pro groups
- `pro_plus` → tenant data for pro_plus groups
- If user gives a group name → look up in `Vivreal.groups`, read `tier`, route to correct tenant DB
