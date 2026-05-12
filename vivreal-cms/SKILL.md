---
name: vivreal-cms
description: Use when working with Vivreal CMS through the Vivreal MCP server — managing content collections and items, scheduling social posts across channels, deploying sites, handling Stripe billing, or any task referencing vivreal.io, the Vivreal portal, or the Vivreal API. Teaches the canonical multi-step workflow (set-active-group → discover schema → operate on content) and the gotchas that cause silent failures.
---

# Vivreal CMS

Vivreal is a multi-tenant CMS + distribution platform. Users author content once and fan it out to a website, social channels (X, LinkedIn, Instagram, Facebook, TikTok), and a Stripe storefront. This skill teaches Claude how to operate against a Vivreal account via the `mcp__vivreal__*` tools and `vivreal://` resources.

## Mental model — read this first

Vivreal has four nested concepts. Confusing them is the #1 source of bugs:

- **Group** — the tenant boundary. A user can belong to multiple groups (e.g., personal + company). Every CMS operation runs in the context of an *active group*. `active_ctx` JWT holds `groupID`, `dbKey`, and `bucketname` for the active group.
- **Content type** ("collection group" internally) — a user-defined schema. Examples: "Job Opening", "Product", "Podcast Episode", "Blog Post". Each content type has fields with strict types (text, longText, slug, enum, list, image, etc.).
- **Content item** ("collection object" internally) — an instance of a content type. Fields must match the schema exactly.
- **Channel** ("integration" internally) — an external platform the user has connected. Channels publish content and (for social) fetch engagement.
- **Site** — a Vivreal-deployed Next.js website that renders the user's content. Has subdomain + optional custom domain.

The MCP tool names use the public terminology (`content-type`, `content`, `channel`). The internal terminology (`collectionGroup`, `collectionObject`, `integration`) shows up in some descriptions and upstream API paths — they refer to the same things.

## The one workflow rule that prevents 80% of errors

**Always call `set-active-group` (or confirm via `get-session-context`) before any CMS operation.** Almost every tool needs `groupID` + `dbKey` resolved from the active group context. Calling `list-content` or `create-content` without an active group set returns a context error, not a clear "you forgot to set a group" message.

```
1. get-session-context              # see groups, check if active group is set
2. set-active-group(groupId)        # only if no active group is set
3. <do the actual work>
```

## Common workflows

### Discover what content lives in a group

```
list-content-types                  # list all schemas in the active group
get-content-type(name)              # read one schema in detail
list-content(collectionGroupID)     # list items inside a content type
```

Use the `vivreal://groups/{groupId}/content-types` resource for a structured view that includes counts and metadata.

### Create new content

Use the `create-content-plan` MCP prompt — it walks the full workflow with schema validation. Manual sequence:

```
1. list-content-types                       # find the right type
2. get-content-type(name)                   # read its schema
3. create-content(collectionObj, schema,    # objectValue keys must match schema field names exactly
                  objectValue)
4. list-content                              # confirm
```

For bulk creation use `bulk-create-content` (tier: pro+).

### Schedule a post across socials

Use the `post-to-all-socials` or `launch-content-everywhere` MCP prompt. Manual sequence:

```
1. list-available-channels                  # which channels are connected
2. get-channel-status(channelType)          # confirm OAuth + credentials valid
3. create-channel-post(channelType, ...)    # one call per channel
```

Scheduling: set `publishDate` to a future ISO timestamp. EventBridge handles the actual publish at the scheduled time.

### Build a site

```
1. check-subdomain(slug)                    # availability for vivreal-hosted subdomain
2. create-site(...)                         # triggers EventHandler Step Function (~3-5 min)
3. get-site-deployment-status(siteId)       # poll until "live" or "failed"
```

For a customer's own domain, use `connect-custom-domain` *after* the site is live — returns DNS records for the user to add at their registrar, then poll `check-custom-domain-status`.

### Stripe storefront operations

```
get-stripe-balance                          # platform balance
list-stripe-orders                          # orders for the connected channel
fulfill-order(orderId)                      # mark fulfilled
create-payout(amount)                       # tier: pro_plus only
get-customer-portal(userId)                 # Stripe Customer Portal session
```

## Field type cheat sheet

When creating or updating content, `objectValue` keys must match the schema's field names. Field types map as:

| Schema type | `objectValue` value type | Notes |
|---|---|---|
| `text`, `longText`, `slug` | string | `longText` accepts HTML or markdown |
| `enum` | string | must be one of the schema's allowed options |
| `list` | JSON array | elements typed per the list's item schema |
| `integer`, `decimal` | number | not a numeric string |
| `boolean` | boolean | not "true"/"false" |
| `date`, `dateTime`, `time` | ISO 8601 string | e.g., `"2026-05-11T10:00:00Z"` |
| `image`, `file`, `video` | upload separately | use `get-upload-url` then `add-content-media` |

Call `get-content-field-types` if you need the full validator-recognized list.

## Tier gating — invisible until you hit it

The MCP server filters its `tools/list` response by the user's subscription tier. Tools NOT visible on the free tier:

- `bulk-create-content`, `bulk-update-content-publish-date`, `sync-channel` — require `pro` or higher
- `create-payout` — requires `pro_plus`

If a workflow needs one of these and the user is on a lower tier, surface that clearly ("This requires the Pro tier — upgrade at vivreal.io/app/tier-select").

## Media — never construct URLs yourself

Media files (logos, images, video) are stored in S3 behind CloudFront. **Never assume a raw CDN URL works** — site rendering uses signed URLs. The flow is:

```
1. get-upload-url(filename, mimeType)       # returns presigned PUT URL
2. <client uploads bytes directly to S3>
3. add-content-media(contentItemId, mediaKey)   # registers the media on the content item
```

When reading media back, the content item's media array contains signed URLs that expire — don't cache them client-side beyond their TTL.

## Resources for structured reads

Prefer `vivreal://` MCP resources over the equivalent list tools when you want a structured, well-formatted view. The most useful:

- `vivreal://field-types` — supported schema field types (static)
- `vivreal://groups/{groupId}/dashboard` — usage, quotas, recent activity
- `vivreal://groups/{groupId}/audit?start=&end=` — audit log (retention by tier)
- `vivreal://groups/{groupId}/content-types/{contentTypeId}/items` — paginated items with `?search`, `?page`, `?limit`, `?sort`
- `vivreal://groups/{groupId}/content-types/{contentTypeId}/items/{itemId}/versions` — version history

Full list: see `references/resources.md`.

## MCP prompts available

Eight workflow prompts ship with the server. Use them for multi-step tasks instead of orchestrating manually:

- `audit-group-setup` — verify a group is correctly configured
- `create-content-plan` — guided content creation with schema validation
- `diagnose-failed-post` — debug a failed channel post
- `import-data-wizard` — bulk import from CSV/JSON
- `launch-content-everywhere` — publish to website + socials + email in one flow
- `post-to-all-socials` — multi-channel social post
- `setup-integration-checklist` — connect a new channel correctly
- `site-builder-guide` — guided site creation

## Gotchas

- **`dbKey` is not `group.key`.** `dbKey` is the tier-mapped MongoDB database name (e.g., `general_shared`, `pro_plus`). `group.key` is the group's URL slug used for S3 paths. They look similar but are different values. The MCP tools handle this internally — just don't confuse them when reading raw API responses.
- **`set-active-group` is sticky for the session.** Once set, subsequent tool calls use it implicitly. If a user switches context mid-conversation, call `refresh-session-context` to re-sync.
- **Failed channel posts are async.** `create-channel-post` returns success when the post is *queued*, not when the platform accepts it. Use `diagnose-failed-post` to investigate later failures.
- **Site deployments take 3–5 minutes.** Don't expect `create-site` to return a live URL — poll `get-site-deployment-status` (statuses: `pending`, `deploying`, `live`, `failed`).
- **Custom domains are two-phase.** `connect-custom-domain` returns DNS records the user must add at their registrar. The site only goes live on the custom domain after `check-custom-domain-status` returns `verified`.

## When NOT to use this skill

- General Next.js, React, or Tailwind questions unrelated to a Vivreal account
- Debugging a customer's deployed Vivreal site code (that's a site-renderer / Next.js task)
- Working with Stripe outside the Vivreal channel context (use the official Stripe MCP)
