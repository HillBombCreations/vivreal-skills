# Vivreal cost model: scale ladder, margin math & AI economics

Detail backing the `vivreal-unit-economics` skill. Figures are 2026-06; the live source is `Vivreal_Portal_Mobile/docs/proposals/2026-06-mongo-tier-and-ai-actions.md` (+ the `vivreal-status-briefing-2026-06-16.html` briefing). Re-verify before quoting in a decision.

## The AWS bill: a decomposition, not a constant

**Measured 2026-09-24** from Cost Explorer (`UnblendedCost`, the prod payer account), monthly,
2026-04 through 2026-09. This file previously taught "a fixed ~$35/mo" and that was wrong by
roughly **4.6x** by 2026-09. The bill has three structurally different parts, and they must be
separated before any rate or trend is computed:

```
monthly_bill = usage * 1.091 + domain_registrations
```

| Record type | 04 | 05 | 06 | 07 | 08 | 09 | Behaviour |
|---|---|---|---|---|---|---|---|
| Usage | 34.35 | 27.76 | 33.53 | 56.96 | 88.39 | 76.42 | the only part that is taxed |
| Tax | 3.11 | 2.51 | 3.05 | 5.17 | 8.06 | 6.95 | **9.05 / 9.04 / 9.10 / 9.08 / 9.12 / 9.09 %** of usage |
| Other (Amazon Registrar) | 0 | 0 | 0 | 0 | **71.00** | **87.00** | **UNTAXED** domain pass-through |
| **Total** | **37.46** | **30.27** | **36.58** | **62.13** | **167.45** | **170.37** | |

Two rules fall out of this table, and both have already produced a wrong answer:

1. **Tax is about 9.1 per cent of USAGE and of nothing else.** Six consecutive months inside
   9.04 to 9.12 per cent makes this one of the steadiest numbers in the model. If the rate
   looks like it moved, suspect the composition before the rate: tax over the **whole**
   2026-08 bill reads 4.8 per cent, tax over **usage** reads 9.12 per cent, unchanged.
   **Group by `RECORD_TYPE` first.**
2. **Amazon Registrar is a pass-through, not infrastructure.** It entered the bill in 2026-08
   as a separate, untaxed record type. It is the cost of domains sold to customers, so it
   nets against domain revenue and must be excluded from any infra-per-customer or
   margin-on-infra figure. Including it overstates infra by more than the entire rest of the
   bill.

### Usage line items, and which way each is moving

| Service | 04 | 09 | Driver |
|---|---|---|---|
| **AWS Amplify** | 11.32 | **42.19** (peak 56.88 in 08) | **build minutes**, see below |
| AWS WAF | 0.00 | 9.94 | **new in 2026-07**, rising every month since |
| AmazonCloudWatch | 2.10 | 7.23 | log volume |
| AWS Secrets Manager | 1.08 | 5.84 | per secret per month, steps with secret count |
| Amazon Route 53 | 2.57 | 4.36 | hosted zones, steps with domains sold |
| **AmazonWorkMail** | 15.39 | **3.09** | per mailbox, and **FALLING** |
| Amazon S3 | 0.36 | 1.21 | media |
| AWS KMS | 0.99 | 0.77 | flat |
| X-Ray / API Gateway / SQS | <1 each | <1 each | negligible |
| **AWS Lambda** | **absent** | **absent** | still $0, free-tier absorbed |
| **Bedrock** | **absent** | **absent** | still confirms AI is the direct Anthropic API |

- **Amplify is the dominant line and it is BUILD, not hosting.** Split by usage type:
  2026-07 build $25.91 of $31.97 (81%), 2026-08 build $45.93 of $56.88 (81%), 2026-09 build
  $28.28 of $42.19 (67%). Hosting compute only moved $5.44 to $8.85 across the same window.
  **Builds bill per minute, so this line tracks DEPLOY activity, not customer count and not
  traffic.** A fleet-wide redeploy is a directly observable cost, and it is the single easiest
  way to move the AWS bill in either direction.
- **WorkMail is no longer the biggest line.** It was, at $15.39 in 2026-04. It is now fifth at
  $3.09. Any text still calling it the biggest single AWS line is stale.
- **Lambda sitting at $0 is what made "AWS is flat" feel true.** The compute really is
  free-tier absorbed. The growth is in build minutes, WAF, logs and secrets, none of which the
  old model tracked at all.

The Atlas tier step does not change any of this: Atlas is billed directly by MongoDB and never
appears on the AWS invoice.

## MongoDB Atlas tiers (the real infra lever: billed directly by MongoDB)

| Tier | ~Monthly | Connections | ~Concurrent users* | Vector search? |
|---|---|---|---|---|
| **M0 free / M2 / M5 shared (current tier; owner decision 2026-09-15: staying here)** | **$0 / ~$9 / ~$25** | **500** | ~150 | No |
| M10 (modelled upgrade only, not the plan) | ~$60 | 1,500 | ~500 | Yes |
| M20 | ~$150 | 3,000 | ~1,000 | Yes |
| M30 | ~$400+ | higher | higher | Yes |

\* Each warm Lambda container's per-client cost is 3 monitor sockets (one per replica-set member) plus up to `maxPoolSize` pooled sockets, so a cap-divided-by-maxPoolSize estimate omits the monitor sockets and understates it; per-container totals run ~3 to 15 depending on service (see `vivreal-atlas-topology` for the per-service table). **This is why DB tier tracks PEAK CONCURRENCY, not signups.** Measured 2026-08-31: the 500-connection shared cap was saturated by **~54 concurrent VR_Client_API containers**, about one episode every 5 days, not daily, even though total volume is light (~4,700 invocations/day).

Current spend is the shared tier (owner decision, 2026-09-15: stay here rather than take M10). If M10 is taken later, one M10 cluster would hold all tenant DBs (`general_shared`, `pro_plus`, etc.), no per-database charge; budget ~$60/mo all-in then (backup + transfer negligible at current size).

## Anthropic / AI agent cost mechanics

- A billed **"action" = one executed tool call**, NOT one model call.
- One user request = an **agentic loop**: `while (tool_use) { messages.create() }` → one request = **N+1 model calls** for N tool rounds.
- Every model call re-sends: system prompt (~800 tok) + 22 tool schemas (~2,500 tok) + **full tenant context JSON** (~3K-15K tok, grows with tenant size) + transcript. **Prompt caching SHIPPED (July 2026, VR_Secure_API PR #77)**, the static prefix now cache-hits across loop iterations (~45% cut); watch the hit rate as tool schemas + tenant context grow.
- Pricing basis: Sonnet **$3/M input, $15/M output**. ~$0.05/mid action ≈ the $0.05/action overage rate, so overage actions roughly break even; in-quota actions are absorbed by the platform.
- **RETIRED 2026-09-18: `agentActions` is `0` on every tier**, so the metered dimension below
  is history, not a live model. The surrounding AI cost mechanics are kept only because they
  still describe **Vivreal's own internal agent spend**, which is an operating cost rather than
  a per-customer one. **Do not compute a per-customer inference cost from them, and do not
  answer a question that presupposes a customer AI quota exists.**
- Historically, **AI was gated in two dimensions**: the (now zero) metered `agentActions` quota AND the binary `TIER_FLAGS` capability flags `aiSiteEditing` and `aiComponentGen` in `src/tierQuotas.ts`. Helpers mirror `canHidePoweredBy`, plus `lowestTierWithFlag()` so consumers derive the required tier rather than hardcoding one. **Read which tier gets which flag from the file**: the ladder has lost a tier, so any per-tier statement written down elsewhere now describes a plan nobody can buy.

### Worst-case AI exposure at full quota utilisation, and how to compute it

**This whole subsection is now historical.** With `agentActions` at `0` on every tier the
computation below evaluates to **zero on every row**, so running it is not a useful answer and
quoting a non-zero result from it is a wrong one. It is retained to explain how the exposure
used to be derived, not as a live procedure.

Do not read a per-tier exposure table out of this file. The tier ladder has changed and every
row would be stale in two directions at once. If you genuinely need the historical shape:

```
exposure_per_customer_per_month
  = agentActions_quota(tier)        # from TIER_QUOTAS in the package
  * cost_per_action                 # from the model pricing below, after caching
```

Then compare that against the plan price from `TIER_DISPLAY`. The shape to remember rather
than the numbers: **the top paid plan is where a generous AI quota goes margin negative**, and
it is the only place worth checking first.

**The historical tail risk is closed.** The top plan quota was cut hard in the tier-quotas
package, with prompt caching as the shipping prerequisite, so a maxed customer now costs a
small fraction of the plan price rather than a multiple of it. The free per-group
`agentUsage.quota` override was removed at the same time, so past-quota use is billed overage
and hard-stops at the spending cap. **The plan that exposure belonged to has since been
retired and folded into the one below it**, so re-derive the exposure against the current
ladder before citing this as closed for a specific tier.

## Scale ladder + margin

| Customers | MRR (~$45 blended) | Atlas tier likely |
|---|---|---|
| 50 | ~$2.25k/mo | M10 |
| 500 | ~$22.5k/mo | M10→M20 |
| 1,000 | ~$45k/mo | M20 |
| 5,000 | ~$225k/mo | M20→M30 |

### Parameterized per-customer margin (typical use ≈ 20% of AI quota, optimized)

Per-customer gross margin ≈ `plan price - Stripe fee (~2.9% + $0.30) - AI token cost (if used) - CDN/storage overages`.

Per-tier net margin is a three-input calculation: the price from `TIER_DISPLAY`, the Stripe fee
for that price, and the optimised AI cost from the quota. **Compute it against the current
ladder.** The durable conclusions, which do not depend on the numbers: every paid tier clears
the margin floor comfortably at typical use, the top paid tier is the thinnest at maximum use
and payment fees plus AI are the only two per-customer costs that matter at all.

Blended gross margin lands **~84-90%** and improves with scale because fixed infra amortizes
across more customers. **Fixed infra is ~$83/mo all-in as of 2026-09** (AWS usage $76.42 plus
tax $6.95, plus Atlas $0 on the shared tier), excluding the Amazon Registrar domain
pass-through. The older **~$105-110** figure was wrong in two independent ways: it priced in an
M10 that the 2026-09-15 owner decision declined to take, and it added WorkMail on top of an AWS
total that **already contained WorkMail**. Note also that the amortization argument is weaker
than it reads, because the largest usage line (Amplify build minutes) scales with deploy
activity rather than with headcount, so that part does not amortize at all.

## Margin levers (in priority order)

1. **Edge / API-Gateway caching on the public Client API**, fewer requests → fewer warm containers → lower peak concurrency → defers the next Atlas tier step. Biggest infra lever because Atlas tier is concurrency-driven.
2. **Reserved-concurrency caps** (see `vivreal-lambda`), make total Mongo connections deterministic and bounded; convert DB-saturation into friendlier 429s and keep the Atlas tier step predictable.
3. **Annual plans**: better cash collection, lower per-transaction Stripe fees, lower churn. Live as real Stripe prices in `TIER_DISPLAY`; read the prices there. Budget the free first-year domain bundle as the sweetener cost, capped and once per group.
4. **Tier and cap review**: quotas have been right-sized once and spending caps are default on, auto-enrolled at roughly twice the base price. **Read `DEFAULT_SPENDING_CAP` for the current values.** The remaining lever is cap tuning plus settling the per-bucket versus total cap design call flagged in the package docstring.
5. **Agent prompt-caching, SHIPPED (July 2026, PR #77)**; the ~40-70% cut is banked, monitor the cache-hit rate.

## What's NOT a cost today

- **Vector search** is an unbuilt dead stub, the M10 upgrade is a prerequisite but ships nothing on its own; treat as a separate scoped roadmap project. Its eventual cost (embedding generation) is single-digit dollars for a one-time backfill of a few thousand objects.
