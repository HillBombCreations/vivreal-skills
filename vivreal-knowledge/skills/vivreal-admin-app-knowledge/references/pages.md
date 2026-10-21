# Admin app pages, and what each reads

Read at vivreal-hq `origin/main` `28bb8b4a` (2026-10-20). Paths are under `packages/admin-app/`. The
nav is `src/components/AppShell/ShellNav.tsx` and the home cards are `src/lib/hub/cards.ts`; re-read
both before quoting this list, since pages get added.

Every page is a Server Component that verifies `admin_session` first and redirects to `/` without
it. "Secure" means VR_Secure_API through `src/lib/upstream` (admin pool bearer plus `x-user-ctx`).
"Ops-read" means the VR-Ops-Read Lambda through `src/lib/opsRead/client.ts`.

| Page | Reads | Writes (route) |
|---|---|---|
| `/` Home | the session; then Secure `GET /api/admin/groups` as the roster check (`src/lib/adminSession/rosterCheck.ts`) | sign-in and sign-out (`api/auth/*`) |
| `/signups` Sign-ups | Secure `GET /api/admin/attribution` (`src/lib/upstream/analytics.ts`) | none |
| `/outreach` Outreach workspace | VR_Outreach_API people, views and sequences (`src/lib/upstream/outreach/audience.ts`) | `api/outreach/audience`, `api/outreach/queue`, `api/outreach/timeline` (read only), `api/outreach/migration` |
| `/outreach/pipeline` | stage counts and columns | `api/outreach/stage` (a move names `expected`; 409 means reload) |
| `/outreach/sequences` | sequences and one sequence's people | `api/outreach/sequences` (a test always goes to the signed-in operator) |
| `/outreach/review` | the preview review queue | `api/outreach/preview` (a review code is a ten-minute link to the portal's public review page) |
| `/outreach/import` Import leads | the leadgen `--emit` seed file, parsed in the page and again on the server | `api/outreach/import` (businesses, then people; a non-seed file is refused) |
| `/suppressions` | Outreach suppressions | `api/outreach/suppressions` (add is `manual` only; remove needs `confirm: true`) |
| `/monitoring` | Ops-read `overview` (alarms, stuck alarms, metrics, subscriptions, budgets) and `featureSignals`; the CDN target list | `api/opsWrite/runAuditor`, `sendTestAlert`, `purgeCdn` (VR-Ops-Write); `api/writeLog` reads its audit back |
| `/errors` | Ops-read `sentryIssues` | none |
| `/tickets` Tickets and bugs | Ops-read `clickupTasks` (two lists, GET only) | none |
| `/flags` Feature flags | Secure `GET /api/admin/groups`, `GET /api/admin/stripe-connect/readiness` | `api/flags` to Secure `PUT /api/group/featureFlags` (known flags only); `api/billing-source` to Secure `PUT /api/admin/groups/:groupID/billing-source` (comped needs a reason) |
| `/audit` | Secure `GET /api/admin/groups`; then `api/audit` re-resolves the group's database server side and reads VR_CMS_API `GET /tenant/auditLog` | none |
| `/usage` | Secure `GET /api/admin/groups`, `/api/admin/groups/:groupID/usage` and `/usage-by-person` | none |
| `/economics` | Ops-read `costSnapshotRead` (daily snapshot) plus Secure groups for the per-business split | none |
| `/deployed` Deployed sites | Ops-read `deployedSha` (from the health watcher's own log line) and `searchCheckRead` | none |
| `/admin-analytics` | Secure `/api/admin/analytics/google-analytics/traffic`, `/funnel`, `/clarity/engagement`, `/api/admin/attribution` | none |
| `/team` | the admin pool's user state for the three roster addresses (`src/lib/adminSession/cognito.ts`) | `api/admin/invite-resend` (only a not-yet-enrolled roster member), `api/admin/mfa-reset` (caller must be on the admin email list) |
| `/notifications` | Secure admin push preferences (`src/lib/upstream/adminPush.ts`) | `api/push` (subscribe, unsubscribe, the six staff preference keys; a customer key is refused) |

Notes that recur in walks and reviews:
- `/outreach` is also the active nav item on its "Set up" pages (`also` in `ShellNav.tsx`).
- The old `outreach-mail` page named in the 2026-10-04 dev doc is gone; the timeline route reads a
  Gmail message body instead (`api/outreach/timeline`, mailbox must be one plain company address).
