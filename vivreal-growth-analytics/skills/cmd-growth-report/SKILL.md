---
name: growth-report
description: Pull a unified growth dashboard combining GA4 traffic, PostHog funnels, and MongoDB signup data with week-over-week deltas
allowed-tools: mcp__google-analytics__*, mcp__posthog__*, mcp__mongodb__connect, mcp__mongodb__find, mcp__mongodb__aggregate, mcp__mongodb__count, mcp__mongodb__list-databases, mcp__mongodb__list-collections, WebFetch
user-invocable: true
---

# /growth-report — Unified Growth Dashboard

Pull a comprehensive growth report by combining data from Google Analytics 4, PostHog, and Vivreal's MongoDB.

## Arguments

`/growth-report [period] [--compare] [--focus=area]`

- `[period]`: Time range for the report. Default: `7d` (last 7 days)
  - `1d` — today
  - `7d` — last 7 days (default)
  - `30d` — last 30 days
  - `mtd` — month to date
  - `custom:2026-03-01:2026-03-15` — custom date range
- `--compare`: Include week-over-week or period-over-period comparison (default: on)
- `--focus`: Focus on a specific area instead of the full report
  - `traffic` — GA4 traffic sources and page views only
  - `funnel` — PostHog funnel completion rates only
  - `signups` — MongoDB user/group creation data only
  - `engagement` — session duration, pages/session, return visits

## Data Sources

### 1. Google Analytics 4 (Traffic & Acquisition)
Query GA4 for:
- **Sessions & users** — total, new vs returning
- **Traffic sources** — organic, direct, social, referral, paid (by source/medium)
- **Top landing pages** — which pages drive the most traffic
- **Geography** — top countries/cities
- **Device breakdown** — desktop vs mobile vs tablet
- **Bounce rate & avg session duration**

### 2. PostHog (Product Analytics & Funnels)
Query PostHog for:
- **Key events** — pageview, signup_started, signup_completed, group_created, collection_created, site_deployed, upgrade_initiated
- **Funnel completion rates** — signup → first group → first collection → first site
- **Feature adoption** — which features are being used (integrations, calendar, audit log)
- **Session recordings count** — how many error sessions were captured
- **Active users** — DAU, WAU, MAU

### 3. MongoDB (Business Metrics)
Connect to Vivreal's mainDb and query:
- **New groups created** — `db.groups.count({ createdAt: { $gte: <period_start> } })`
- **New users registered** — `db.users.count({ createdAt: { $gte: <period_start> } })`
- **Tier distribution** — `db.groups.aggregate([{ $group: { _id: "$tier", count: { $sum: 1 } } }])`
- **Sites deployed** — `db.sites.count({ createdAt: { $gte: <period_start> } })`
- **Groups by frozen status** — how many active vs frozen

## Report Procedure

1. **Determine period** — parse the time range argument, calculate start/end dates and comparison period
2. **Query GA4** — use GA4 MCP tools for traffic metrics with the specified date range
3. **Query PostHog** — use PostHog MCP tools for product events and funnels
4. **Query MongoDB** — connect to mainDb, run aggregate queries for business metrics
5. **Calculate deltas** — compare current period to previous period (e.g., this week vs last week)
6. **Format report** — output in the structured format below

## Output Format

```markdown
## Growth Report: <period description>
Generated: <timestamp>

### Headline Metrics
| Metric | Current | Previous | Delta |
|---|---|---|---|
| Total Sessions | X | Y | +Z% |
| New Users (GA4) | X | Y | +Z% |
| Signup Completions | X | Y | +Z% |
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

### Funnel Performance (PostHog)
| Step | Users | Conversion | Drop-off |
|---|---|---|---|
| Landing page visit | X | 100% | — |
| Signup started | X | Y% | Z% |
| Signup completed | X | Y% | Z% |
| First group created | X | Y% | Z% |
| First collection created | X | Y% | Z% |
| First site deployed | X | Y% | Z% |

### Tier Distribution (MongoDB)
| Tier | Count | % | New This Period |
|---|---|---|---|
| Free | X | Y% | Z |
| Basic | X | Y% | Z |
| Pro | X | Y% | Z |
| Pro Plus | X | Y% | Z |

### Top Insights
1. <Actionable insight based on the data>
2. <Actionable insight based on the data>
3. <Actionable insight based on the data>

### Recommendations
- <Specific recommendation tied to data>
- <Specific recommendation tied to data>
```

## Error Handling

- If GA4 MCP is not connected, skip traffic section and note: "GA4 data unavailable — configure google-analytics MCP server"
- If PostHog MCP is not connected, skip funnel section and note: "PostHog data unavailable — configure posthog MCP server"
- MongoDB should always be available (existing MCP). If connection fails, report the error.
- Always produce whatever sections ARE available — never fail entirely because one source is down

## MongoDB Safety Rules

Follow the same safety rules as `/db-query`:
- READ-ONLY — only `find`, `aggregate`, `count`
- Connect to `vivreal` mainDb for cross-tenant metrics
- Never query by `groupName` — always `{ key: dbKey }` or `{ _id: groupID }`
- Limit results to 50 max
- Redact any sensitive fields (credentials, apiKeys)

## Examples

```
/growth-report
→ Default 7-day report with WoW comparison across all sources

/growth-report 30d
→ 30-day report with month-over-month comparison

/growth-report 7d --focus=funnel
→ PostHog funnel analysis only for the last 7 days

/growth-report mtd --focus=signups
→ Month-to-date MongoDB signup and group creation data
```
