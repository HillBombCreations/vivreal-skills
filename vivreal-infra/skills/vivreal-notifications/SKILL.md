---
name: vivreal-notifications
description: Use when working on Vivreal's cross-repo push-notification pipeline — the vivreal-notification-queue SQS queue, VR_Main_API's NotificationConsumerFunction (web-push/VAPID), its producers (EventHandler markSiteLive site-live push, VR_Secure_API deploy-status pushes), and the pushsubscriptions/pushpreferences collections. Triggers on: push notification, web push, notification queue, vivreal-notification-queue, NotificationConsumerFunction, pushsubscriptions, pushpreferences, VAPID, site-live notification, deploy push, "user didn't get the notification". Distinct from the WebSocket realtime channel (vivreal-websocket-realtime) and from email (main-api knowledge).
---

# Vivreal push-notification pipeline — knowledge digest

Last synced: 2026-07-30

Cross-repo web-push, introduced July 2026 (Workstream 3 minimal slice). One queue, one consumer, multiple producers. This is the **offline/push** channel — the WebSocket stack (see `vivreal-infra:vivreal-websocket-realtime`) is the **live in-app** channel; several events send socket-first and fall back to push.

## The pipe

```
producer → vivreal-notification-queue (SQS, batch size 1, + DLQ) → NotificationConsumerFunction (VR_Main_API) → web-push (VAPID) → browser
```

- **Queue**: `vivreal-notification-queue` — **CFN-owned in VR_Main_API's stack** together with its DLQ; the queue URL is exported for the cross-repo SSM handoff (same mechanism as `WEBHOOK_QUEUE_URL`).
- **Consumer**: `NotificationConsumerFunction` (VR_Main_API `notificationConsumer.handler`, 256MB/30s, reserved concurrency 5). Resolves `pushsubscriptions`/`pushpreferences` against the main Vivreal DB via **its own connection** (`src/notificationConsumer/db.js` — deliberately not `hbcreations/scripts/db.js`), then sends via VAPID keys (from the shared `vivreal/prod/vapid` secret). Ported from VR_Secure_API's `sendPushToGroup` **with a fix**: the original's inline `.catch()` made every send report `fulfilled` regardless of real delivery outcome — delivery results are now truthful.

## Producers

- **EventHandler `markSiteLive`** (first producer): enqueues a push on a **template-instantiated** site's FIRST live deploy — gated on `siteInfo.template` + `instantiation` both present via a `.lean()` read (both are strict-bypassed undeclared schema paths). Runs after the critical DB write, 5s-raced, failures logged and swallowed (never fails a deploy). markSiteLive's Lambda timeout went 60s → 75s for this.
- **VR_Secure_API deploy-status pushes**: the offline push fallback is **suppressed for non-terminal `deploymentStatus` events** — only terminal states (live/failed) push; intermediate stage chatter stays socket-only.

## Gotchas

- **Don't confuse the three channels**: WebSocket (live, in-app, `WS_ENDPOINT`/`WS_TABLE`), web-push (this pipeline, offline), email (Main's EmailConsumer/lifecycle templates). A "user wasn't notified" bug needs the channel identified first.
- The consumer's DB connection is separate on purpose — do not "consolidate" it into the shared Main connection helper.
- Producer failures are swallowed by design (notifications must never fail the producing workflow) — a missing push with a green producer log means look at the queue/DLQ and the consumer, not the producer.
- Push delivery requires a live `pushsubscriptions` row for the user AND preferences allowing that event class in `pushpreferences`.

## Companions

- `vivreal-infra:vivreal-websocket-realtime` — the live socket channel this pipeline backstops.
- `vivreal-knowledge:vivreal-main-api-knowledge` — the consumer's home repo (4-Lambda shape).
- `vivreal-infra:vivreal-site-deploy-pipeline` — where the site-live producer sits.
