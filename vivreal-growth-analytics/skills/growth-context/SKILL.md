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

## Activation Procedure

1. **Identify what metric the user is asking about**, map their question to a specific data source
2. **Pull real data first**, query the relevant MCP before answering
3. **Cross-reference when possible**, e.g. GA4 consented traffic + `Vivreal.leads` signups = a consented-visitor signup rate (label it so)
4. **Provide context**, compare to previous period, note trends
5. **Be honest about gaps**, if an MCP server isn't configured, say so and suggest setup

## Key Vivreal Metrics & Where They Live

| Metric | Source | How to Calculate |
|---|---|---|
| Visitor → Signup rate | GA4 sessions (consented only) vs `Vivreal.leads` created | Cross-source, label as consented |
| Demo → Signup funnel | The GA4 funnel route (`FUNNEL_STEPS`) | Secure admin route |
| Signup → Activation rate | `Vivreal.leads` with `activated: true` ÷ leads in the period | MongoDB |
| Activation → Deployment rate | Live sites per pod ÷ groups created | MongoDB (per pod) |
| Free → Paid conversion | Groups with a non-empty `stripeSubscriptionID` ÷ all groups | MongoDB, never by tier |
| Tier distribution | `Vivreal.groups` grouped by `tier`, beside the paying count | MongoDB |
| Engagement | `Vivreal.clarity_daily_snapshots` (consented portal sessions) | Clarity snapshot |
| Customer-site traffic | `Vivreal.site_traffic_dailies` | First-party rollup |
| Error impact on conversion | Sentry error rate vs the GA4 funnel drop-off | Cross-source |

## Common Questions & How to Answer

**"How are we doing?"**
→ Run `/growth-report` command. Don't guess.

**"What's our conversion rate?"**
→ Ask: "Which conversion? Visitor→signup, signup→activation, or free→paid?" Then query the right source.

**"Why are signups down?"**
→ Check GA4 traffic first (is traffic down or is conversion down?), then the GA4 funnel route for where the register steps drop, then Sentry for crashes on the signup page.

**"Should we invest in ads?"**
→ First check organic conversion rate (GA4 + MongoDB). If organic converts well, ads will likely work. If organic doesn't convert, fix the funnel first.

## Marketing measurement, end to end

Each link cited at its deploy line, read 2026-10-28. Read them in this order when GA4, Ads and sign-ups disagree.
1. **Consent, customer sites and vivreal.io** (Vivreal_Templates `origin/stable` `d484a89`): `src/components/SiteConsent/` sends `gtag('consent','default',...)` from the stored choice before `config`, and `consent update` on a choice; `ad_personalization` is always `denied`. `AttributionCapture` writes the `vr_attr` touch only within that choice. A visitor who never accepts is invisible to GA4 and Ads by design.
2. **Consent, the portal** (Vivreal_Portal_Mobile v0.37.6): accepting grants `ad_storage` and `ad_user_data`, so a Google Ads click can attribute to a later sign-up.
3. **The sign-up record** (VR_Main_API `origin/stable` `6572479`, `src/hbcreations/models/leadsSchema.js`): `leads.attribution` holds first and last touch (`utm_*`, `gclid`) from the consented cookie; `leads.signupContext` (`country` from the time zone, `countrySource`, `device`) is written for EVERY sign-up without consent. Count with `signupContext`, attribute with `attribution`, and never read a missing `attribution` as "direct".
4. **Ads conversion upload** (VR_Secure_API `origin/stable` `0d955d82`): `AdsConversionExportFunction`, `cron(5 14 * * ? *)`, stages the day's offline click conversions (`ads_conversion_export_batches`, `ads_conversion_uploads`) before Google's 09:00 Los Angeles fetch. A sign-up lands in Ads a day later, not live.
5. **The nightly rollup** (same SHA): `MarketingRollupFunction`, `cron(35 9 * * ? *)`, copies GA4, Ads cost and Search Console numbers into mainDb `marketing_dailies` (runs in `marketing_rollup_runs`, notes in `marketing_annotations`).
6. **The admin Marketing page** (vivreal-hq `origin/deploy/admin-app` `08f2d444`, `/marketing`): one read, Secure `GET /api/admin/marketing/funnel`, global admins only.

## Rules

- **Never guess metrics**, always query real data. If a source isn't reachable from this session (the admin routes need an admin-pool token), say which one and what it would answer.
- **Every GA4 and Clarity number is a consented subset.** Say so.
- **Always include time context**, "signups are at X" is useless without "up Y% from last week"
- **Recommend the right command**, if the user's question would be better answered by `/growth-report` or `/funnel-analysis`, suggest that instead of doing ad-hoc queries
- **Respect MongoDB safety rules**, read-only, no groupName queries, redact credentials
