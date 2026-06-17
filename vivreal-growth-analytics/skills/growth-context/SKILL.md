---
name: growth-context
description: Auto-triggers when the user mentions growth metrics, conversion, churn, retention, traffic, funnel, signups, acquisition, bounce rate, DAU/WAU/MAU, or analytics. Loads analytics context so Claude can answer with real data instead of guesses.
---

# Vivreal Growth Context Loader

When this skill activates, you have context about a growth or analytics question. Before answering with opinions or guesses, pull real data from available sources.

## Trigger Keywords

This skill activates when the user mentions any of:
- Growth metrics: "conversion", "churn", "retention", "activation", "engagement"
- Traffic: "traffic", "visitors", "sessions", "page views", "bounce rate"
- Funnel: "funnel", "drop-off", "onboarding", "signup rate"
- Users: "signups", "new users", "DAU", "WAU", "MAU", "active users"
- Acquisition: "acquisition", "CAC", "customer acquisition cost", "organic", "paid traffic"
- Revenue: "MRR", "ARR", "upgrade rate", "paid conversion", "tier distribution"
- Analytics: "analytics", "metrics", "dashboard", "KPIs", "how are we doing"

## Available Data Sources

### 1. Google Analytics 4 MCP (`google-analytics`)
- Traffic data, user sessions, acquisition channels, geography, device breakdown
- Use for: traffic volume questions, source attribution, landing page performance
- Tools: `run_report`, `run_realtime_report`, `get_account_summaries`

### 2. PostHog MCP (`posthog`)
- Product events, funnels, feature flags, session recordings, user properties
- Use for: product usage questions, funnel completion, feature adoption
- Tools: Analytics queries, feature flag status, error tracking

### 3. MongoDB MCP (`mongodb`) — already configured
- Business objects: groups, users, sites, collections
- Use for: hard business metrics (signups, groups created, tier distribution, sites deployed)
- Database: `vivreal` (mainDb) for cross-tenant data

### 4. Sentry MCP (`sentry`) — already configured
- Error rates, crash-free session rate, performance data
- Use for: correlating error spikes with drop-offs

## Activation Procedure

1. **Identify what metric the user is asking about** — map their question to a specific data source
2. **Pull real data first** — query the relevant MCP before answering
3. **Cross-reference when possible** — e.g., GA4 traffic + MongoDB signups = signup conversion rate
4. **Provide context** — compare to previous period, note trends
5. **Be honest about gaps** — if an MCP server isn't configured, say so and suggest setup

## Key Vivreal Metrics & Where They Live

| Metric | Source | How to Calculate |
|---|---|---|
| Visitor → Signup rate | GA4 sessions ÷ MongoDB new users | Cross-source |
| Signup → Activation rate | MongoDB users with group created in 24h ÷ total new users | MongoDB |
| Activation → Deployment rate | MongoDB sites deployed ÷ groups created | MongoDB |
| Free → Paid conversion | MongoDB groups with tier != 'free' ÷ total groups | MongoDB |
| Tier distribution | MongoDB groups aggregated by tier | MongoDB |
| Feature adoption | PostHog events per feature | PostHog |
| Error impact on conversion | Sentry error rate vs PostHog funnel drop-off | Cross-source |
| Organic vs Paid quality | GA4 source/medium + MongoDB signup-to-activation by cohort | Cross-source |

## Common Questions & How to Answer

**"How are we doing?"**
→ Run `/growth-report` command. Don't guess.

**"What's our conversion rate?"**
→ Ask: "Which conversion? Visitor→signup, signup→activation, or free→paid?" Then query the right source.

**"Why are signups down?"**
→ Check GA4 traffic first (is traffic down or is conversion down?), then PostHog for signup funnel errors, then Sentry for crashes on the signup page.

**"Should we invest in ads?"**
→ First check organic conversion rate (GA4 + MongoDB). If organic converts well, ads will likely work. If organic doesn't convert, fix the funnel first.

## Rules

- **Never guess metrics** — always query real data. If data isn't available, say "I'd need GA4/PostHog connected to answer that accurately."
- **Always include time context** — "signups are at X" is useless without "up Y% from last week"
- **Recommend the right command** — if the user's question would be better answered by `/growth-report` or `/funnel-analysis`, suggest that instead of doing ad-hoc queries
- **Respect MongoDB safety rules** — read-only, no groupName queries, redact credentials
