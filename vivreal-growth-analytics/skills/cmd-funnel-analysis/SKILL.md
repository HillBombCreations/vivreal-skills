---
name: funnel-analysis
description: Deep-dive funnel analysis tracing the user journey from landing page to site deployment, identifying the biggest drop-off stages
allowed-tools: mcp__google-analytics__*, mcp__posthog__*, mcp__mongodb__connect, mcp__mongodb__find, mcp__mongodb__aggregate, mcp__mongodb__count, mcp__mongodb__list-databases, mcp__mongodb__list-collections
user-invocable: true
---

# /funnel-analysis — User Journey Funnel Deep-Dive

Trace the complete user journey through Vivreal's activation funnel, identify drop-off points, and recommend fixes.

## Arguments

`/funnel-analysis [period] [--segment=type] [--stage=stage_name]`

- `[period]`: Time range. Default: `30d`
  - Same options as `/growth-report`: `1d`, `7d`, `30d`, `mtd`, `custom:start:end`
- `--segment`: Segment users for comparison
  - `tier` — break down by Free / Basic / Pro / Pro Plus
  - `source` — break down by acquisition source (organic, paid, social, referral)
  - `device` — break down by desktop vs mobile
- `--stage`: Focus on a specific funnel stage for drill-down
  - `signup` — zoom into signup flow only
  - `activation` — first group + first collection
  - `deployment` — first site deployment
  - `upgrade` — free-to-paid conversion

## The Vivreal Activation Funnel

```
Stage 1: AWARENESS
  └─ Landing page visit (GA4 pageview)

Stage 2: SIGNUP
  ├─ Signup page reached (GA4: /app/register pageview)
  ├─ Signup form submitted (PostHog: signup_started)
  └─ Signup completed (PostHog: signup_completed + MongoDB: new user doc)

Stage 3: ACTIVATION
  ├─ First login after signup (PostHog: first_login)
  ├─ First group created (MongoDB: groups.createdAt within 24h of user.createdAt)
  └─ First collection created (MongoDB: collectiongroups created in that group's DB)

Stage 4: VALUE REALIZATION
  ├─ First collection object added (MongoDB: collectionobjects in group DB)
  ├─ First integration connected (MongoDB: integrations in group DB)
  └─ First site deployed (MongoDB: sites with status=live for that groupID)

Stage 5: CONVERSION
  ├─ Upgrade page visited (GA4: /app/tier-select pageview)
  ├─ Checkout initiated (PostHog: upgrade_initiated)
  └─ Paid subscription started (MongoDB: groups where tier != 'free' and recent update)
```

## Analysis Procedure

### Step 1: Build the Funnel Data

For each stage, collect:
- **User count** entering the stage
- **User count** completing the stage
- **Conversion rate** (completed / entered)
- **Drop-off rate** (1 - conversion rate)
- **Median time** between stages (if timestamp data available)

Data source priority:
1. **PostHog** for event-based stages (signup_started, signup_completed, etc.)
2. **MongoDB** for business object stages (group created, collection created, site deployed)
3. **GA4** for page-view stages (landing, signup page, tier-select page)

### Step 2: Identify the Biggest Drop-off

Calculate which stage transition has:
- The **highest absolute drop-off** (most users lost)
- The **highest percentage drop-off** (worst conversion rate)
- The **most worsening trend** (biggest negative delta vs previous period)

### Step 3: Drill into the Drop-off Stage

For the worst stage, investigate:
- **Time-to-complete**: How long do users who succeed take? Are slow users more likely to drop off?
- **Segment differences**: Do mobile users drop off more than desktop? Do organic users convert better than paid?
- **Error correlation**: Check PostHog for error events or Sentry for crashes during this stage
- **Feature blockers**: Is there a specific feature that's confusing? Check if users attempt and fail (PostHog events)

### Step 4: Generate Recommendations

Based on the analysis, provide:
1. **Quick wins** — changes that could improve the worst stage in < 1 week
2. **Medium-term** — features or UX improvements for the next sprint
3. **Experiments** — A/B test ideas to validate hypotheses

## Output Format

```markdown
## Funnel Analysis: <period>
Generated: <timestamp>

### Funnel Overview
| Stage | Users | Conversion | Drop-off | vs Previous |
|---|---|---|---|---|
| Landing page | X | — | — | +Y% |
| Signup started | X | Y% | Z% | +/-delta |
| Signup completed | X | Y% | Z% | +/-delta |
| First group | X | Y% | Z% | +/-delta |
| First collection | X | Y% | Z% | +/-delta |
| First object added | X | Y% | Z% | +/-delta |
| First site deployed | X | Y% | Z% | +/-delta |
| Upgrade initiated | X | Y% | Z% | +/-delta |
| Paid conversion | X | Y% | Z% | +/-delta |

### Critical Drop-off: <stage name>
**<X>% of users drop off at this stage** (Y users lost)

#### Why Users Drop Off Here
- <Finding 1 backed by data>
- <Finding 2 backed by data>

#### Segment Breakdown
| Segment | Conversion | Insight |
|---|---|---|
| Desktop users | X% | <comparison> |
| Mobile users | X% | <comparison> |
| Organic traffic | X% | <comparison> |
| Paid traffic | X% | <comparison> |

### Median Time Between Stages
| Transition | Median Time | Trend |
|---|---|---|
| Signup → First Group | Xh | +/-delta |
| First Group → First Collection | Xh | +/-delta |
| First Collection → First Site | Xd | +/-delta |

### Recommendations
#### Quick Wins (< 1 week)
1. <Specific actionable recommendation>
2. <Specific actionable recommendation>

#### Medium-Term (next sprint)
1. <Feature/UX recommendation>

#### Experiments to Run
1. <A/B test hypothesis>
```

## MongoDB Queries Reference

### New users in period
```javascript
db.users.countDocuments({ createdAt: { $gte: ISODate("<start>") } })
```

### New groups in period
```javascript
db.groups.countDocuments({ createdAt: { $gte: ISODate("<start>") } })
```

### Groups that created a collection within 24h of group creation
```javascript
// Requires cross-DB query: for each new group, check its tenant DB for collectiongroups
// This is approximate — use MongoDB aggregate on mainDb groups, then spot-check tenant DBs
```

### Tier distribution of new groups
```javascript
db.groups.aggregate([
  { $match: { createdAt: { $gte: ISODate("<start>") } } },
  { $group: { _id: "$tier", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```

### Sites deployed in period
```javascript
db.sites.countDocuments({ createdAt: { $gte: ISODate("<start>") }, status: "live" })
```

## Safety Rules

- READ-ONLY queries only
- Never query mainDb by groupName
- Redact credentials
- Limit: 50 docs max per query
- When querying tenant DBs, only sample up to 5 representative groups (not all)

## Examples

```
/funnel-analysis
→ 30-day full funnel analysis with previous-period comparison

/funnel-analysis 7d --segment=source
→ 7-day funnel broken down by traffic source

/funnel-analysis 30d --stage=signup
→ Deep-dive into signup step only: form abandonment, error rates, device differences

/funnel-analysis mtd --segment=tier
→ Month-to-date funnel by tier — do paid users activate faster?
```
