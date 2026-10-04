---
name: vivreal-social-sync
description: 'Use when a task touches how an owner''s Instagram, Facebook or TikTok posts get INTO Vivreal and onto their site, or what happens when a social channel is disconnected or the Vivreal app is removed on the platform side. Covers the hourly scheduled social sync in VR_CMS_API (the EventBridge schedule, the SQS message, which accounts it picks, why LinkedIn and X are excluded), the per-account sync adapters, picture re-hosting into the group''s storage, fetch health (live, paused, frozen), the expired-account back-off, the member-post approval gate and the per-connection approvals switch, the disconnect purge, the Meta deauthorize callback HAZARD (removing the Vivreal app on Facebook with notify on pulls that identity''s accounts from up to ten Vivreal groups and purges their synced posts), and the log signatures of every failure seen so far. Triggers on: social sync, scheduled sync, hourly sync, integration-sync-sweep, scheduledSocialSync, socials not updating, posts not showing on my site, social band, rehost, fetch health, frozen channel, account expired, markSocialAccountExpired, purgeAccount, disconnect channel, deauthorize, data deletion, remove Vivreal from Facebook, Business Integrations, reel cover, deprecate_post_aggregated_fields, not a storable image type, approval gate, approvalRequired.'
---

# Social sync: how platform posts reach Vivreal, and what removes them

Last synced: 2026-10-04. Sources: VR_CMS_API `origin/main` (v2.14.3 on `stable` that day),
VR_Secure_API v2.20.1, VR_Main_API, VR_Client_API v2.15.0, and the evidence rows in
`vivreal-hq/docs/projects/shipped-ledger.md` (2026-10-04 sections). **No source CLAUDE.md covers
this yet**; every claim below cites the code.

## The pipeline, end to end

1. **Schedule.** `ScheduledSocialSyncSchedule`, an `AWS::Scheduler::Schedule` declared ONCE in
   `VR_CMS_API/cloudformation/create-update-integrations.yaml` (about :464-500): `rate(1 hour)`,
   named `${StackName}-scheduled-social-sync` (live: `VR-CMS-API-scheduled-social-sync`), target the
   shared FIFO queue (`/vivreal/prod/shared/fifo-sqs-arn`), input `{"messageType":"integration-sync-sweep"}`,
   constant `MessageGroupId` so a running sweep never overlaps the next. Deploying it needed
   `scheduler:*Schedule` on `schedule/default/VR-CMS-API-*` for `GitHubActions-Deploy`; without it
   the v2.14.1 deploy rolled back (ledger 03:12Z and 03:59Z).
2. **Routing.** `services/handleSqsEvent.js` checks `body.messageType === 'integration-sync-sweep'`
   BEFORE the event-type guard (the message has no `type`) and calls `runScheduledSocialSync()`.
3. **Target selection** (`services/core/scheduledSocialSync.js:56-108`), re-run fresh every tick, no
   per-account schedules to leak: groups with `frozen != true` holding an integration of type
   `facebook`, `instagram` or `tiktok`; placement from `resolvePlacement(group)` (a group with none
   is logged `social.scheduledSync.no_placement` and skipped); every account whose `status` is absent
   or `'active'`. **An expired account is never dialed again until the owner reconnects**, which is
   the back-off. It must `await mainDb.connect()` first: SQS-invoked code never passes the Express
   middleware that connects it (#228).
4. **Sync, one account at a time.** Each target calls `syncIntegrationData({accounts:[account], type, groupID}, dbKey)`,
   the SAME function the owner's manual "Bring your posts across" button runs, so the two are
   idempotent (upsert by external id). A failed account logs `social.scheduledSync.account_failed`
   and the sweep continues; the sweep NEVER throws and never retries through the DLQ.
5. **Adapters** (`services/sync/{instagram,facebook,tiktok}.js`) decrypt the stored token first
   (#226: they used to send the ciphertext, every call failed, and the account was marked expired
   while the request returned 200), fetch posts, and map them. Facebook reads
   `fields=id,message,created_time,full_picture,permalink_url,status_type,attachments{media_type,media,url,unshimmed_url,subattachments}`
   (`FEED_FIELDS`, exported so a test pins it). Instagram stores a reel's COVER (`thumbnail_url`),
   never the MP4, and an empty string when there is none (#229).
6. **Re-hosting.** Platform CDN picture links rotate, so every synced picture is copied into the
   group's own storage: `src/shared/rehostSyncedMedia.js` PUTs the bytes at a `preupload-*` key and
   hands them to `processMediaFields`, which promotes, builds derivatives, writes `mediaFiles` rows
   and meters `mediaUsage`. Pictures only: a video is refused as "not a storable image type".
7. **Fetch health** (`services/social/fetchHealth.js`), written on the `integrations[].accounts[]`
   entry only (`lastFetchAt`, `lastDurableFetchFailureAt`, `lastDurableFetchFailureReason`,
   `lastTransientFetchErrorAt`), never on the integration root. States: `live` (a recent SUCCESSFUL
   fetch, whether or not it returned posts), `paused` (transient failures: rate limit, timeout, 5xx;
   the owner sees nothing), `frozen` (a durable failure, or no successful fetch for 7 days). The
   classifier fails safe toward transient. The portal's Socials screen reads these states;
   VR_Main_API's opt-in weekly digest mails only `frozen` channels with its own copy of the resolver.
8. **Display.** VR_Client_API's integration-object read applies the approvals filter (`1d48496`), and
   Vivreal_Templates maps posts to renderer items for the social band (see `vivreal-templates-knowledge`).

**Which platforms:** Instagram, Facebook, TikTok only. **LinkedIn is excluded on purpose**: its
adapter still calls `GET /v2/ugcPosts`, which needs `r_member_social`, a scope Vivreal does not hold,
so it can never return posts (the portal hides its sync button too). **X is not swept** and is no
longer a postable platform at all.

## Token freshness comes from elsewhere

- **VR_Secure_API renews an Instagram long-lived token inside its last 7 days** in `syncIntegration`
  and, since v2.20.0 (#320), hands CMS the RENEWED token; it used to forward the old one.
- **`socialGrantProbe`** (Secure, daily cron) asks Facebook and X whether a stored grant is good and
  marks dead ones expired, through the same one-field contract as CMS's
  `src/shared/markSocialAccountExpired.js`, the only CMS writer of `accounts[].status = 'expired'`.
  It writes only on a TERMINAL auth error and never writes `'active'`; only a reconnect does.

## Approvals

- **A `base` member's post is held `pending_review`** until an owner or admin approves it (#223,
  `services/social/publishApprovedSocialPost.js`; `processSocialPost` refuses a pending post).
- **The per-connection approvals switch** (`group.integrations[].approvalRequired`) is written by
  VR_Secure_API's dedicated path (`63bc6641`; the general update route would have deactivated the
  channel) and read by VR_Client_API, which hides unapproved synced posts from the site.

## What REMOVES synced posts (read before disconnecting anything)

- **Disconnect in Vivreal** (Secure, 2026-10-01): removing an account invokes CMS
  `POST /tenant/integrations/purgeAccount` (invoke-only, no gateway event;
  `src/createAndUpdateIntegrations/api/index.js:94`), which deletes that account's synced posts AND
  the pictures re-hosted from them, with usage counters moved. Alarms: `synced-post-purge-incomplete`,
  `synced-post-sweep-failed`, `synced-post-vanished-volume` (`cloudformation/alarms.yaml:580-763`).
- **THE HAZARD: removing the Vivreal app on the platform side.** When someone removes the Vivreal
  app from a Facebook account (Settings, Business Integrations, Remove) with Meta's "Send
  notification to Vivreal" option ON, Meta POSTs a signed request to VR_Main_API
  `POST /api/user/deauthorize/facebook` (Instagram has its own app and callback). The handler
  (`src/hbcreations/api/users/metaCallbacks.js:137-242`) finds every group holding an account that
  matches that Meta identity, **up to `MAX_GROUPS_PER_CALLBACK` = 10 groups**, `$pull`s those
  accounts, and has CMS purge their synced posts and re-hosted pictures. It acts on the IDENTITY,
  not on one group: the same person connected to the Vivreal group (`pod_01`) and the Vivreal
  Content group (`pod_02`) loses the connection in BOTH. It records a `dataDeletionRequests` row
  (`requestType: 'deauthorize'`) that `scripts/replay-meta-nodata-deletions.js` can re-drive.
  **Before removing the app on Facebook for any reason (filming, cleanup, testing), untick the
  notify option unless losing every Vivreal connection for that identity is the intent.** On
  2026-10-04 the Vivreal Business Integration was removed with notify UNticked, and the `pod_01` Facebook token still died with the app removal (ledger 16:30Z).
- **A data-deletion request** (`/api/user/data-deletion/:provider`) does the same purge and owes Meta
  a confirmation code and a public status page.

## Failure signatures seen in production

Read the CMS integrations function's log streams directly (`VR-CMS-API-CreateAndUpdateIntegrations-*`;
list streams, then `get-log-events` per stream with paging). `filter-log-events` paginates and can
return a false zero. **There is no alarm on the sweep's own `failed` count**: a healthy run logs
`social.scheduledSync.completed` with `targetCount`, `synced`, `failed` and `byType`, and the only way
to see a failing account is to read that line.

| Signature | Cause | State |
|---|---|---|
| Every account `expired` right after a sync that returned 200 | adapters sent the ENCRYPTED token (#226) | fixed in v2.12.3 |
| `Cannot read properties of null (reading 'find')` on cold start | sweep queried `mainDb.DB.groups` before connecting (#228) | fixed 2026-10-04 05:29Z |
| `SQS message missing event type` and audit `actor.email` errors before 05:29Z | seen with the #228 crash; absent after (ledger) | gone after #228 |
| Graph `(#12) deprecate_post_aggregated_fields_for_attachement`, one Facebook account `failed: 1` every hour | top-level `link` field requested on a Page whose feed has attachments (#229) | fixed 2026-10-04 14:25Z, proven on the 15:09Z run |
| `not a storable image type (video/mp4)` for the same reel every hour | Instagram adapter stored a reel's MP4 as its picture (#229) | fixed, NOT yet proven live (no reel processed since) |
| `user has not authorized application 975876768563719`, account marked expired | the Instagram token was revoked (app removed on the platform side) | needs an owner reconnect |
| TikTok `401 access_token_invalid` | token revoked or expired | needs an owner reconnect |
| LinkedIn "missing permission" | `r_member_social` not held | by design until LinkedIn grants it |

## Companions

- `vivreal-cms-api-knowledge` (the Lambda this runs in), `vivreal-main-api-knowledge` (the Meta
  callbacks), `vivreal-secure-api-knowledge` (token renewal, grant probe, disconnect),
  `vivreal-client-stack-knowledge` and `vivreal-templates-knowledge` (display),
  `vivreal-portal-knowledge` (the Channels and Socials screens).
- Channel status for COPY (Instagram approved 2026-09-28, TikTok audited 2026-10-04, X retired):
  `vivreal-brand-voice`.
