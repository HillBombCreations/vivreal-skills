---
name: vivreal-cms
description: Use when working with Vivreal CMS through the Vivreal MCP server, managing content collections and items, scheduling social posts across channels, deploying sites, handling Stripe billing, or any task referencing vivreal.io, the Vivreal portal, or the Vivreal API. Teaches the canonical multi-step workflow (set-active-group → discover schema → operate on content) and the gotchas that cause silent failures.
---

# Vivreal CMS

Vivreal is a multi-tenant CMS + distribution platform. Users author content once and fan it out to a website, social channels (LinkedIn, Instagram, Facebook, TikTok), and a Stripe storefront. This skill teaches Claude how to operate against a Vivreal account via the `mcp__vivreal__*` tools and `vivreal://` resources.

## Mental model: read this first

Vivreal has four nested concepts. Confusing them is the #1 source of bugs:

- **Group**, the tenant boundary. A user can belong to multiple groups (e.g. personal + company). Every CMS operation runs in the context of an *active group*. `active_ctx` JWT holds `groupID`, `dbKey`, and `bucketname` for the active group.
- **Content type** ("collection group" internally), a user-defined schema. Examples: "Job Opening", "Product", "Podcast Episode", "Blog Post". Each content type has fields with strict types (text, longText, slug, enum, list, image, etc.).
- **Content item** ("collection object" internally), an instance of a content type. Fields must match the schema exactly.
- **Channel** ("integration" internally), an external platform the user has connected. Channels publish content and (for social) fetch engagement.
- **Site**, a Vivreal-deployed Next.js website that renders the user's content. Has subdomain + optional custom domain.

The MCP tool names use the public terminology (`content-type`, `content`, `channel`). The internal terminology (`collectionGroup`, `collectionObject`, `integration`) shows up in some descriptions and upstream API paths, they refer to the same things.

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
list-content(collectionGroupID)     # list items inside a content type (archived left out)
```

Use the `vivreal://groups/{groupId}/content-types` resource for a structured view that includes counts and metadata.

### Create new content

Use the `create-content-plan` MCP prompt, it walks the full workflow with schema validation. Manual sequence:

```
1. list-content-types                       # find the right type
2. get-content-type(name)                   # read its schema
3. create-content(collectionObj, schema,    # objectValue keys must match schema field names exactly
                  objectValue)
4. list-content                              # confirm
```

For bulk creation use `bulk-create-content` (the same plan gate as every other tool; see "Plan gating" below).

**Whether an item is on the site is `siteStatus`, not `approvalStatus`.** Content output carries `siteStatus` (`live`, `scheduled`, `not_published`, `archived`, `waiting_for_approval`, `sent_back`). `approvalStatus` is the approval WORKFLOW state and reads `draft` on every item never sent for approval, live or not, so never tell an owner an item is a draft or not live from `approvalStatus`.

**Archived items and the calendar.** `list-content` with `archived` false or omitted returns only items that are NOT archived; `archived: true` returns ONLY archived items, so to see everything make one call each way. `list-events` leaves out private lists (mailing-list sign-ups, contact and quote requests, form enquiries) and keeps booking requests; an entry that does not say whether it is archived carries no `siteStatus`, so say you cannot tell.

### Schedule a post across socials

Use the `post-to-all-socials` or `launch-content-everywhere` MCP prompt. Manual sequence:

```
1. list-available-channels                  # which channels are connected
2. get-channel-status(channelType)          # confirm OAuth + credentials valid
3. create-channel-post(channelType...)    # one call per channel
```

**X is no longer a Vivreal channel** (owner decision, 2026-09-28): the CMS API refuses an X post even though the MCP server's channel list and prompts may still name `x` (that list lags the API as of 2026-10-04). Never offer X to an owner and never plan a post to it.

**Who is posting matters.** A post created or scheduled by a group member WITHOUT approval rights (the `base` role) is HELD as `pending_review` and does not send until an owner or admin approves it; the approval then schedules it at its original time, or now if that time has passed. Tell the user their post is waiting for approval rather than reporting it as scheduled. Owners and admins post straight through.

**Synced posts arrive on their own.** Instagram, Facebook and TikTok posts are pulled into the group every hour with no action needed, for every connected and active account; `sync-channel` is only for an immediate refresh. LinkedIn is not synced (the platform scope is not granted), and an account the platform has revoked stays skipped until the owner reconnects it.

**`publishDate` decides what a channel post does, so choose it on purpose:** leave it OUT on an update to change only the content; `publishDate: null` saves a DRAFT that is never sent (and removes any schedule; null never publishes); `publishNow: true` or a date now or earlier publishes now; a future date schedules it.

Scheduling: set `publishDate` to a future ISO timestamp. EventBridge handles the actual publish at the scheduled time. This is now genuinely true for CONTENT items too, not just channel posts: a future `publishDate` on content registers a one-shot EventBridge schedule (`reconcileContentGolive` → `EventQueue.fifo` → a `content.updated` webhook → each site's `/api/revalidate` subscription), so the live site updates itself at that moment rather than waiting on the 24h cache TTL.

### Build a site

```
1. check-subdomain(slug)                    # availability for vivreal-hosted subdomain
2. create-site(...)                         # triggers EventHandler Step Function (~3-5 min)
3. get-site-deployment-status(siteId)       # poll until "live" or "failed"
```

For a customer's own domain, use `connect-custom-domain` *after* the site is live, returns DNS records for the user to add at their registrar, then poll `check-custom-domain-status`.

### Stripe storefront operations

```
get-stripe-balance                          # platform balance
list-stripe-orders                          # orders for the connected channel
get-subscription-info                       # subscription state for the group
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
| `date`, `dateTime`, `time` | ISO 8601 string | e.g. `"2026-05-11T10:00:00Z"` |
| `image`, `file`, `video` | upload separately | use `get-upload-url` then `add-content-media` |

Call `get-content-field-types` if you need the full validator-recognized list.

## Plan gating and what a connection may do

There is ONE gate, and it is the whole server: MCP access itself is a plan flag (`canUseMcp` from `@hillbombcreations/tier-quotas`, checked in the MCP server's `src/tools/session.ts`). A group on a plan without it cannot call ANY tool, and gets `TIER_NOT_ENTITLED` with the upgrade sentence. A group with it can call every tool, so `tools/list` and `tools/call` agree. The old per-tool `TOOL_MIN_TIER` list (bulk tools and `sync-channel` marked Pro) was deleted on 2026-09-23 as a second, invented gate; do not reason from it. Read which plans carry MCP access from the tier-quotas package, never from memory.

If a call comes back `TIER_NOT_ENTITLED`, relay the server's own upgrade sentence plainly rather than naming a plan from memory; plan names and their flags move. Tool calls are metered against the plan's `mcpToolCalls` allowance, a hard stop with no overage.

Two more refusals come from the CONNECTION, not the plan:
- **`ACCESS_NOT_GRANTED` with an area.** The owner chose, per connection, which areas this AI agent may use (content types, content items, media, calendar, website, channels, billing, team; each off, read or write). A tool outside that grant is refused whatever the user's role. Tell the owner they can widen it in Connected apps in Vivreal, and do not retry another way.
- **Team and billing-page tools are off by default.** The team tools and `get-customer-portal` are refused for every connection unless the server operator has turned them on. Ask the owner to make that change in Vivreal itself.

**Which business the agent starts in** is the owner's pick on the Allow access screen (only businesses whose plan includes AI agents are offered). Use `set-active-group` to move between the businesses the user belongs to.

## Media: never construct URLs yourself

Media files (logos, images, video) are stored in S3 behind CloudFront. **Never assume a raw CDN URL works**, site rendering uses signed URLs. The flow is:

```
1. get-upload-url(filename, mimeType)       # returns presigned PUT URL
2. <client uploads bytes directly to S3>
3. add-content-media(contentItemId, mediaKey)   # registers the media on the content item
```

When reading media back, the content item's media array contains signed URLs that expire, don't cache them client-side beyond their TTL.

## Resources for structured reads

Prefer `vivreal://` MCP resources over the equivalent list tools when you want a structured, well-formatted view. The most useful:

- `vivreal://field-types`, supported schema field types (static)
- `vivreal://groups/{groupId}/dashboard`, usage, quotas, recent activity
- `vivreal://groups/{groupId}/audit?start=&end=`, audit log (retention by tier)
- `vivreal://groups/{groupId}/content-types/{contentTypeId}/items`, paginated items with `?search`, `?page`, `?limit`, `?sort=field:dir`; archived items are left out, `?archived=true` returns ONLY archived ones
- `vivreal://groups/{groupId}/content-types/{contentTypeId}/items/{itemId}/versions`, version history

Full list: see `references/resources.md`.

## MCP prompts available

Eight workflow prompts ship with the server. Use them for multi-step tasks instead of orchestrating manually:

- `audit-group-setup`, verify a group is correctly configured
- `create-content-plan`, guided content creation with schema validation
- `diagnose-failed-post`, debug a failed channel post
- `import-data-wizard`, bulk import from CSV/JSON
- `launch-content-everywhere`, publish to website + socials in one scheduled action (it sends NO email; Vivreal's own email goes out only through Create's Email row or a campaign, never by publishing, per `brand/voice.md`'s Email entry; Mailchimp remains an optional integration)
- `post-to-all-socials`, multi-channel social post
- `setup-integration-checklist`, connect a new channel correctly
- `site-builder-guide`, guided site creation

## Gotchas

- **`dbKey` is not `group.key`.** `dbKey` is the MongoDB database name STORED on the group document (a pod such as `pod_01`; the older `general_shared` and `pro_plus` databases no longer exist). It is not derived from the plan, and no database name tells you a plan. `group.key` is the group's URL slug used for S3 paths. They look similar but are different values. The MCP tools handle this internally, just don't confuse them when reading raw API responses.
- **`set-active-group` is sticky for the session.** Once set, subsequent tool calls use it implicitly. If a user switches context mid-conversation, call `refresh-session-context` to re-sync.
- **Failed channel posts are async.** `create-channel-post` returns success when the post is *queued*, not when the platform accepts it. Use `diagnose-failed-post` to investigate later failures.
- **Site deployments take 3 to 5 minutes.** Don't expect `create-site` to return a live URL, poll `get-site-deployment-status` (statuses: `pending`, `deploying`, `live`, `failed`).
- **Custom domains are two-phase.** `connect-custom-domain` returns DNS records the user must add at their registrar. The site only goes live on the custom domain after `check-custom-domain-status` returns `verified`.

## When NOT to use this skill

- General Next.js, React, or Tailwind questions unrelated to a Vivreal account
- Debugging a customer's deployed Vivreal site code (that's a site-renderer / Next.js task)
- Working with Stripe outside the Vivreal channel context (use the official Stripe MCP)
