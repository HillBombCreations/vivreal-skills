---
name: vivreal-unit-economics
description: Use when reasoning about Vivreal's COST, MARGIN, PRICING, or UNIT ECONOMICS — gross margin per customer, the cost stack (AWS, MongoDB Atlas, Anthropic/AI), infra cost as you scale, runway, or whether a proposed change dents the ~80% margin floor. Teaches the real numbers: pricing $19/$59/$119 (~$45 blended/customer), gross margin ~84-90%, AWS ~$35/mo flat, Atlas tiers ($0 free → ~$60 M10 → ~$150 M20 → ~$400+ M30), Anthropic ~$4/customer blended WITH prompt caching, AI quotas (Pro Plus now 500 actions), that DB tier tracks PEAK CONCURRENCY not signups, and the scale ladder. Triggers on: unit economics, gross margin, cost per customer, blended margin, pricing, AWS cost, MongoDB Atlas cost, M10/M20/M30, Anthropic cost, AI token cost, prompt caching, AI quota, infra cost at scale, runway, margin floor, scale ladder, peak concurrency, CAC payback. The `finance-auditor` agent grounds in this skill. This is INTERNAL cost/margin — for GTM/funnel/retention economics use the growth agents instead.
---

Last synced: 2026-07-13

# Vivreal Unit Economics — cost, margin & pricing model

The internal cost/margin/profitability model for Vivreal. This is the source-of-truth digest for any margin or pricing reasoning, and the grounding for the **`finance-auditor`** agent. Lean body; the scale ladder + AI-optimization detail live in `references/cost-model.md`.

> **Sources of truth (read for the live numbers):** `C:\repos\Vivreal_Portal_Mobile\docs\proposals\2026-06-mongo-tier-and-ai-actions.md` and `docs\proposals\vivreal-status-briefing-2026-06-16.html`. Pricing/quota constants: `@hillbombcreations/tier-quotas`. These figures are 2026-06; re-verify against the docs before quoting hard numbers in a decision.

## Pricing & blended revenue

| Tier | Price | Rough mix | Monthly AI action quota |
|---|---|---|---|
| Basic | **$19/mo** | ~50% | 50 |
| Pro | **$59/mo** | ~35% | 500 |
| Pro Plus | **$119/mo** | ~15% | **500** (reduced from 5,000 in tier-quotas v2.3.0, July 2026 — per-group `agentUsage.quota` override can raise it) |

- Blended ≈ **~$45/customer/mo** at the ~50/35/15 mix.
- **Gross margin ~84-90%** today and it *improves with scale* — fixed infra is tiny and amortizes; the dominant cost is per-customer payment + AI, both small.

## The cost stack (three bills, two off the AWS invoice)

1. **AWS ≈ $35/mo, essentially FLAT** at current scale (WorkMail + Amplify + Route53 dominate; Lambda is $0 free-tier-absorbed). Customer count barely moves this line. The M10 Mongo upgrade does NOT change it.
2. **MongoDB Atlas — billed directly by MongoDB, NOT on the AWS bill.** This is a real lever and it tracks **PEAK CONCURRENCY, not signup count** (see below). $0 free → **~$60 M10** → **~$150 M20** → **~$400+ M30**. One cluster holds all tenant DBs — you don't pay per database.
3. **Anthropic — the AI agent calls the Claude API directly (not Bedrock), billed directly.** ≈ **~$4/customer blended WITH prompt caching** (caching cuts ~45%, and a leaner model for routine actions cuts more). The old tail risk (a maxed Pro Plus at 5,000 actions costing ~$50-80/mo optimized against a $119 plan) was **closed in July 2026 by cutting the Pro Plus quota to 500** — the worst case is now an order of magnitude smaller; per-group overrides reopen it deliberately, case by case.

## The non-obvious rule: DB tier tracks PEAK CONCURRENCY, not signups

The Atlas cost lever is driven by **simultaneous in-flight backend requests**, not how many customers exist. Each warm Lambda container holds ~6-15 Mongo connections, so the connection cap converts into a ceiling on concurrent requests:

- **Free/shared cap = 500 connections → ~150 concurrent casual users** before saturation (×3-per-container rule of thumb).
- **M10 = 1,500 connections → ~500 concurrent.** M20 = 3,000. M30 higher.
- Today's spikes (~105 concurrent, daily, from the public Client API) already blow the 500 cap — which is *why* M10 is recommended despite light total volume (~4,700 invocations/day).
- **Implication for forecasting:** model the DB-tier step from a peak-concurrency projection, not a signup count. A traffic burst forces the upgrade long before raw customer count would.

## The scale ladder (revenue at the ~$45 blended)

| Customers | MRR (~$45 blended) | Likely Atlas tier |
|---|---|---|
| 50 | **~$2.25k/mo** | M10 (~$60) |
| 500 | **~$22.5k/mo** | M10→M20 |
| 1,000 | **~$45k/mo** | M20 |
| 5,000 | **~$225k/mo** | M20→M30 |

Fixed infra (~$105-110/mo all-in: AWS ~$35 + Atlas M10 ~$60 + WorkMail ~$8-16) is covered by **~2 Pro or ~6 Basic customers**. Everything above that is gross profit — which is why margin *improves* with scale.

## Margin levers (when margin is under pressure, reach for these)

1. **Edge / API-Gateway caching** — cuts Client-API request volume → fewer Lambda containers → lower peak concurrency → defers the next Atlas tier step (the single biggest infra lever).
2. **Annual plans** — improve cash collection + reduce per-transaction Stripe fees + reduce churn.
3. **Tier review** — right-size quotas (esp. the Pro Plus AI action quota) so the worst-case AI cost can't go margin-negative.
4. **Standing action item: ship agent prompt-caching before the AI pilot goes GA** — it is a ~40-70% AI-cost cut for ~1 day of work and is the difference between Pro Plus being margin-positive vs underwater at max use.

## Read the reference for

- The full **scale ladder** with per-tier margin math, the parameterized margin model, and the AWS line-item breakdown → `references/cost-model.md`.
- The **AI cost mechanics** (action = one tool call; agentic loop = N+1 model calls; the uncached vs cached vs Haiku-for-routine exposure table) → `references/cost-model.md`.

## Boundary (do not confuse with growth)

This skill is **internal cost / margin / profitability**. It is NOT go-to-market. For funnel/conversion economics, churn (NRR/GRR), CAC, positioning, and retention, use the `growth` / `principal-growth-auditor` / `growth-advisor` agents — they own the revenue-side levers; this skill owns the cost-side levers. Companions: `vivreal-atlas-topology` (the connection-cap mechanics behind the Atlas tier lever), `vivreal-lambda` (reserved-concurrency, which bounds the peak-concurrency cost driver).
