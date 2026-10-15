---
name: growth-report
description: Pull a unified growth dashboard combining consented GA4 and Clarity data, the first-party site traffic rollup, and MongoDB signup and paying-group data, with week-over-week deltas
allowed-tools: mcp__mongodb__connect, mcp__mongodb__find, mcp__mongodb__aggregate, mcp__mongodb__count, mcp__mongodb__list-databases, mcp__mongodb__list-collections, WebFetch, mcp__plugin_vivreal-db-explorer_mongodb__connect, mcp__plugin_vivreal-db-explorer_mongodb__find, mcp__plugin_vivreal-db-explorer_mongodb__aggregate, mcp__plugin_vivreal-db-explorer_mongodb__count, mcp__plugin_vivreal-db-explorer_mongodb__list-databases, mcp__plugin_vivreal-db-explorer_mongodb__list-collections
user-invocable: true
---

# /growth-report: Unified Growth Dashboard

Pull a comprehensive growth report by combining GA4 and Clarity (consented portal and vivreal.io visitors), the first-party `site_traffic_dailies` rollup, and Vivreal's MongoDB. The `growth-context` skill carries the source details; there is no PostHog.

## Arguments

`/growth-report [period] [--compare] [--focus=area]`

- `[period]`: Time range for the report. Default: `7d` (last 7 days)
  - `1d`, today
  - `7d`, last 7 days (default)
  - `30d`, last 30 days
  - `mtd`, month to date
  - `custom:2026-03-01:2026-03-15`, custom date range
- `--compare`: Include week-over-week or period-over-period comparison (default: on)
- `--focus`: Focus on a specific area instead of the full report
  - `traffic`, GA4 traffic sources and page views only
  - `funnel`, the GA4 funnel steps only
  - `signups`, MongoDB signup (`leads`) and group creation data only
  - `engagement`, session duration, pages/session, return visits

## Data Sources

### 1. Google Analytics 4 and Microsoft Clarity (portal and vivreal.io visitors)
- Both load ONLY after the visitor accepts the cookie banner: `CookieConsent` in the portal's `src/app/layout.tsx` is the one mount that loads GA and Clarity, so every count is a CONSENTED subset, not total traffic. Say so beside any number.
- Read them through VR_Secure_API's admin-pool routes, the ones the internal admin app (`vivreal-hq/packages/admin-app`) calls: `GET /api/admin/analytics/google-analytics/traffic` (GA4 Data API, sources, landing pages, devices; `?scope=landing|portal|combined` splits vivreal.io from `/app` by page path, and landing plus portal can exceed combined for a session that visited both), `GET /api/admin/analytics/google-analytics/funnel` (the portal-emitted funnel events, `FUNNEL_STEPS` in `getFunnelReport.js`: studio demo viewed, demo CTA, demo signup, register started, register completed, sign up; event names come from the portal's `src/lib/analytics.ts`), and `GET /api/admin/analytics/clarity/engagement`.
- **Clarity is read from `Vivreal.clarity_daily_snapshots`**, which the `analyticsSnapshot` cron writes once a day. Never call the Clarity API directly: it allows about ten requests a day, and a missed day is a gap in the series, not an error.
- There is **no PostHog** anywhere in the fleet (0 references in the portal and Templates on `origin/stable`), and no GA4 or PostHog MCP is part of this plugin. Do not plan a PostHog query.

### 2. First-party site traffic (every customer site, vivreal.io included)
- Templates' cookieless `SiteBeacon` posts to `collect.vivreal.io`, and VR_Analytics_API's daily rollup writes **`Vivreal.site_traffic_dailies`** (one row per `siteId` and `date`: `pageviews`, `uniqueVisitors`, `topPages`, `referrers`, `devices`, `countries`, `groupID`). The code calls it `site_traffic_daily`; the PHYSICAL collection is plural, so the singular name is a false zero. Owners read the same data through `GET /api/analytics/site/traffic`. Detail: `vivreal-analytics-knowledge`.

### 3. MongoDB (business facts; read-only, pool 1, project every read)
- `Vivreal.groups`: `createdAt`, `tier`, `stripeSubscriptionID`, `subscriptionStatus`, `frozen`, `overageBilling`. `Vivreal.leads`: one row per signup (`signedUp`, `userId`, `createdAt`, `activated`/`activatedAt`, the lifecycle activation signal). There is **no `users` collection**: people are Cognito users plus `groups.users[]`.
- **Sites are in the tenant databases, not `Vivreal`.** Count deployed sites per pod (`<dbKey>.sites`, `deployment.status: "live"`), resolving the pod from each group's stored `dbKey`.
- **Paid conversion counts groups with a non-empty `stripeSubscriptionID`, never `tier != 'free'`.** Several paid-tier groups are comped by hand and pay nothing (measured 2026-10-15: 5 groups on `pro`, 0 with a Stripe subscription), so a tier count reports revenue that does not exist. Report the tier distribution and the paying count side by side.
- Commerce for owners: `Vivreal.commerce_dailies`.

### 4. Sentry
- Error rates by runtime, to correlate an error spike with a drop. Sentry ingestion was dark from about 2026-08-24 to 2026-09-17 (quota), so silence in that window is not health.

## Report Procedure

1. **Determine period**, parse the time range argument, calculate start/end dates and comparison period
2. **Read GA4 and Clarity** through the admin analytics routes (traffic, funnel, engagement) for the date range; if no admin-pool token is available in this session, skip and say so
3. **Read `site_traffic_dailies`** for the period
4. **Query MongoDB**, mainDb for `leads` and `groups`, each pod's `sites` for live deployments
5. **Calculate deltas**, compare current period to previous period (e.g. this week vs last week)
6. **Format report**, output in the structured format below

## Output Format

```markdown
## Growth Report: <period description>
Generated: <timestamp>

### Headline Metrics
| Metric | Current | Previous | Delta |
|---|---|---|---|
| Total Sessions | X | Y | +Z% |
| New Users (GA4, consented) | X | Y | +Z% |
| Signups (`leads`) | X | Y | +Z% |
| Paying groups (Stripe subscription) | X | Y | +Z |
| New Groups (MongoDB) | X | Y | +Z% |
| Sites Deployed | X | Y | +Z% |
| Funnel Completion Rate | X% | Y% | +Z pp |

### Traffic Sources
| Source | Sessions | % of Total | Trend |
|---|---|---|---|
| Organic Search | X | Y% | arrow |
| Direct | X | Y% | arrow |
| Social | X | Y% | arrow |
| Referral | X | Y% | arrow |
| Paid | X | Y% | arrow |

### Funnel Performance (GA4 funnel steps, consented)
| Step | Users | Conversion | Drop-off |
|---|---|---|---|
| Studio demo viewed | X | 100% | |
| Demo CTA clicked | X | Y% | Z% |
| Register started | X | Y% | Z% |
| Register completed | X | Y% | Z% |
| Activated (`leads.activated`) | X | Y% | Z% |

### Tier Distribution (MongoDB)
| Tier | Count | Paying (Stripe subscription) | New This Period |
|---|---|---|---|
| Free | X | Y% | Z |
| Basic | X | Y% | Z |
| Pro | X | Y% | Z |
| ...one row per tier in the CURRENT ladder, plus one row for any raw stored value that is not in it | X | Y% | Z |

### Top Insights
1. <Actionable insight based on the data>
2. <Actionable insight based on the data>
3. <Actionable insight based on the data>

### Recommendations
- <Specific recommendation tied to data>
- <Specific recommendation tied to data>
```

## Error Handling

- If the admin analytics routes are not reachable from this session, skip the GA4 and Clarity sections and say which route would have answered them
- Never report a PostHog section: Vivreal does not run PostHog
- MongoDB should always be available (existing MCP). If connection fails, report the error.
- Always produce whatever sections ARE available, never fail entirely because one source is down

## MongoDB Safety Rules

Follow the same safety rules as `/db-query`:
- READ-ONLY, only `find`, `aggregate`, `count`
- Connect to `vivreal` mainDb for cross-tenant metrics
- Never query by `groupName`, always `{ _id: ObjectId(groupID) }` (shell form; in Node write `new ObjectId(groupID)`, bson 6 throws without `new`). `{ key }` takes the group's slug, never `dbKey`: `dbKey` is the tenant database name (`pod_01`, `pod_02`), no group's `key` equals it, so `{ key: dbKey }` returns null
- Limit results to 50 max
- Redact any sensitive fields (credentials, apiKeys)

## Examples

```
/growth-report
→ Default 7-day report with WoW comparison across all sources

/growth-report 30d
→ 30-day report with month-over-month comparison

/growth-report 7d --focus=funnel
→ The GA4 funnel steps only, for the last 7 days

/growth-report mtd --focus=signups
→ Month-to-date MongoDB signup and group creation data
```
