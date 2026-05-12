# Vivreal MCP Resources

The Vivreal MCP server exposes 16 resources for structured reads. Prefer these over the equivalent list tools when you want pre-formatted data with metadata included.

## Static resources

Discoverable via `resources/list`:

| URI | What it returns |
|---|---|
| `vivreal://field-types` | All supported schema field types with their constraints |
| `vivreal://content-types` | Active group's content types (uses session-active group) |
| `vivreal://channels` | Channel manifests for all platforms Vivreal supports |

## Templated resources

Discoverable via `resources/templates/list`. Substitute `{placeholders}` with real IDs:

### Group-scoped

- `vivreal://groups/{groupId}` — group settings + metadata
- `vivreal://groups/{groupId}/dashboard` — usage, quotas, recent activity
- `vivreal://groups/{groupId}/audit?start=&end=` — audit log; ISO date params; retention varies by tier

### Content

- `vivreal://groups/{groupId}/content-types` — all schemas in this group
- `vivreal://groups/{groupId}/content-types/{contentTypeId}` — one schema in detail
- `vivreal://groups/{groupId}/content-types/{contentTypeId}/items?search=&page=&limit=&sort=` — paginated items
- `vivreal://groups/{groupId}/content-types/{contentTypeId}/items/{itemId}` — one item
- `vivreal://groups/{groupId}/content-types/{contentTypeId}/items/{itemId}/versions` — version history (count limit by tier)

### Sites

- `vivreal://groups/{groupId}/sites` — all sites in this group
- `vivreal://groups/{groupId}/sites/{siteId}` — one site

### Channels

- `vivreal://groups/{groupId}/channels` — group's connected channels with status
- `vivreal://groups/{groupId}/channels/{channelType}/posts` — channel post history
- `vivreal://channels/{channelType}` — channel manifest (capabilities, auth requirements)

## When to use a resource vs. a tool

- **Resource** — when you want to *read* structured state for display or analysis
- **Tool** — when you want to *mutate* state, or when you need specific filtering/pagination not exposed by the resource

Some resources also bundle related data (e.g., the dashboard resource includes quota usage that would require 3+ tool calls to assemble manually).
