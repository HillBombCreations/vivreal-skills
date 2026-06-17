---
name: vivreal-websocket-realtime
description: Use when working with Vivreal's real-time / WebSocket infrastructure — the API Gateway WebSocket API and its VR_ws_* connect/disconnect/default/sendmessage Lambdas, the DynamoDB connection table, how backends push messages (execute-api:ManageConnections / postToConnection), and how the portal consumes socket events (e.g. live site-deploy progress, seeding collection rows in tests). Use when a real-time update isn't arriving, a connection drops, you're adding a push event, or reasoning about WS_ENDPOINT / WS_TABLE wiring. Triggers on: websocket, WebSocket, real-time, VR_ws, sendmessage, postToConnection, ManageConnections, WS_TABLE, WS_ENDPOINT, socket event, live deploy progress, connection table, $connect, $disconnect, push update not arriving.
---

# Vivreal WebSocket / Real-Time Infrastructure

How live updates flow from the backends to the portal. Used for site-deploy progress and other server-pushed events.

## Architecture — API Gateway WebSocket API + Lambdas

- An **API Gateway WebSocket API** with the standard route Lambdas (deployed as `VR_ws_*`): **`$connect`**, **`$disconnect`**, **`$default`**, and **`sendmessage`**.
- Active connections are tracked in a **DynamoDB table** (`WS_TABLE` in `hb-api-secrets`). `$connect` writes the `connectionId`; `$disconnect` removes it.
- The endpoint backends post to is **`WS_ENDPOINT`** (the API Gateway Management API endpoint, in `hb-api-secrets`).

## How backends push a message

- A backend posts to a connection via the **API Gateway Management API** (`postToConnection`), which requires the **`execute-api:ManageConnections`** IAM permission — granted by the **`Lambda-Webhook`** managed policy (attached to all 5 CMS Lambdas + Secure createSites; it also grants DynamoDB CRUD for the connection table). See `vivreal-iam-secrets`.
- VR_Secure_API has a `socket.js` push helper. The primary live use is **real-time site-deployment progress** during the Step Functions pipeline (`createSites` → states emit progress; see `vivreal-site-deploy-pipeline`).
- A `postToConnection` to a **stale `connectionId` returns 410 Gone** — the standard pattern is to delete that entry from the DynamoDB table on 410.

## How the portal consumes socket events

- The portal subscribes to the WebSocket API for server-pushed updates. Example: live deploy progress on the sites flow; and the e2e tests note that collection rows can be seeded **via the WebSocket socket-event path** (`CollectionsScreen` can receive rows over the socket rather than only from the server fetch).
- WebSocket / real-time infrastructure is listed as an **in-progress** area in the portal — expect partial coverage; not every screen is wired to live events yet.

## Debugging a missing real-time update

1. **Connection alive?** Check the DynamoDB connection table for the `connectionId`. A dropped/idle socket won't receive pushes.
2. **Push permission?** The pushing Lambda needs `Lambda-Webhook` (`execute-api:ManageConnections`). Missing it → push fails silently / `AccessDenied`.
3. **Stale connection?** A 410 Gone on `postToConnection` means the client disconnected — the entry should be purged.
4. **Right endpoint?** `WS_ENDPOINT` must be the API Gateway Management endpoint for the deployed WS API stage.
5. **Deploy-progress specifically** → trace the Step Functions execution (the states emit the progress); if the state machine is fine but the UI is silent, it's the socket layer, not the pipeline.

## Sources of truth

`VR_Secure_API/CLAUDE.md` (`socket.js`, WS_ENDPOINT/WS_TABLE env, createSites WebSocket progress), the `Lambda-Webhook` policy in the CMS/Secure IAM tables, the portal `CLAUDE.md` (WebSocket in-progress + the CollectionsScreen socket-seed note). Deployed functions: `VR_ws_*` in the AWS account.
