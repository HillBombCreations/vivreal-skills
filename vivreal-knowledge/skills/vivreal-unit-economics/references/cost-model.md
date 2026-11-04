# Vivreal cost model: bill-reading method, margin math & AI economics

Detail backing the `vivreal-unit-economics` skill. **This file carries the METHOD only, because
this repository is PUBLIC.** The margin floor and the live figures are in the private vivreal-hq
repo at `docs/finance/unit-economics.md` (read with your local checkout): the measured monthly
bill, the line-item series, the Atlas budget, the fixed infra cost, the blended revenue and the
scale ladder. The original source for the 2026-06 model is
`Vivreal_Portal_Mobile/docs/proposals/2026-06-mongo-tier-and-ai-actions.md` (+ the
`vivreal-status-briefing-2026-06-16.html` briefing). Re-verify before quoting in a decision.

## The AWS bill: a decomposition, not a constant

Read it from Cost Explorer (`UnblendedCost`, the prod payer account), monthly, one CLOSED month at
a time. A "fixed monthly constant" model was wrong several times over by 2026-09. The bill has
three structurally different parts, and they must be separated before any rate or trend is
computed:

```
monthly_bill = usage * (1 + tax_rate) + domain_registrations
```

| Record type | Behaviour |
|---|---|
| Usage | the only part that is taxed |
| Tax | a steady percentage of usage, month over month |
| Other (Amazon Registrar) | **UNTAXED** domain pass-through |

Two rules fall out of this decomposition, and both have already produced a wrong answer:

1. **Tax is a percentage of USAGE and of nothing else.** It has held within a narrow band month
   after month, which makes it one of the steadiest numbers in the model. If the rate looks like
   it moved, suspect the composition before the rate: tax divided by the **whole** bill drops in
   any month with domain registrations, while tax divided by **usage** is unchanged.
   **Group by `RECORD_TYPE` first.**
2. **Amazon Registrar is a pass-through, not infrastructure.** It entered the bill in 2026-08
   as a separate, untaxed record type. It is the cost of domains sold to customers, so it
   nets against domain revenue and must be excluded from any infra-per-customer or
   margin-on-infra figure. Including it can overstate infra by more than the entire rest of the
   bill.

### Usage line items, and which way each is moving

| Service | Direction | Driver |
|---|---|---|
| **AWS Amplify** | the dominant line, rising | **build minutes**, see below |
| AWS WAF | **new in 2026-07**, rising | per web ACL and rule, plus requests |
| AmazonCloudWatch | rising | metric alarms and custom metrics, plus log volume |
| AWS Secrets Manager | rising | per secret per month, steps with secret count |
| Amazon Route 53 | rising | hosted zones, steps with domains sold |
| **AmazonWorkMail** | **FALLING** | per mailbox |
| Amazon S3 | small | media |
| AWS KMS | flat | |
| X-Ray / API Gateway / SQS | negligible | |
| **AWS Lambda** | **absent** | free-tier absorbed |
| **Bedrock** | **absent** | still confirms AI is the direct Anthropic API |

- **Amplify is the dominant line and it is BUILD, not hosting.** Split it by usage type: most of
  it is build duration, with hosting compute a minority. **Builds bill per minute, so this line
  tracks DEPLOY activity, not customer count and not traffic.** A fleet-wide redeploy is a
  directly observable cost, and it is the single easiest way to move the AWS bill in either
  direction.
- **WorkMail is no longer the biggest line.** It was in 2026-04. Any text still calling it the
  biggest single AWS line is stale.
- **Lambda sitting at zero is what made "AWS is flat" feel true.** The compute really is
  free-tier absorbed. The growth is in build minutes, WAF, logs and secrets, none of which the
  old model tracked at all.

The Atlas tier step does not change any of this: Atlas is billed directly by MongoDB and never
appears on the AWS invoice.

## MongoDB Atlas tiers (the real infra lever: billed directly by MongoDB)

| Tier | Connections | ~Concurrent users* | Vector search? |
|---|---|---|---|
| M0 Free (history: the tier until 2026-10-17; capped at 10 GB out per rolling 7 days) | 500 | ~150 | not verified |
| Flex (history: chosen 2026-10-14, never switched to; unlimited transfer) | 500 | ~150 | not checked |
| **M10 (current tier since 2026-10-17; 15 new connections per second per node)** | **1,500 per node** | ~500 | Yes |
| M20 | 3,000 | ~1,000 | Yes |
| M30 | higher | higher | Yes |

Each rung costs a step more than the one below it. Price a rung from the MongoDB invoice, and
until the first invoice for a rung is read, budget it from the hourly rate; the current budget
and invoice line are in the private figures file.

\* Each warm Lambda container's per-client cost is 3 monitor sockets (one per replica-set member) plus up to `maxPoolSize` pooled sockets, so a cap-divided-by-maxPoolSize estimate omits the monitor sockets and understates it; per-container totals run ~3 to 15 depending on service (see `vivreal-atlas-topology` for the per-service table). **This is why DB tier tracks PEAK CONCURRENCY, not signups.** Measured 2026-08-31: the 500-connection shared cap was saturated by **~54 concurrent VR_Client_API containers**, about one episode every 5 days, not daily, even though total volume is light (~4,700 invocations/day).

The cluster has been M10 since 2026-10-17. One M10 cluster holds every tenant database, with no per-database charge. Compute the budget from the hourly rate (backup and transfer are small at current size) until the first MongoDB invoice is read, then replace the budget with the invoice line. Whether MongoDB adds sales tax is not yet known.

## Anthropic / AI agent cost mechanics

- A billed **"action" = one executed tool call**, NOT one model call.
- One user request = an **agentic loop**: `while (tool_use) { messages.create() }` → one request = **N+1 model calls** for N tool rounds.
- Every model call re-sends: system prompt (~800 tok) + 22 tool schemas (~2,500 tok) + **full tenant context JSON** (~3K-15K tok, grows with tenant size) + transcript. **Prompt caching SHIPPED (July 2026)**, the static prefix now cache-hits across loop iterations; watch the hit rate as tool schemas + tenant context grow.
- Pricing basis: the model's published per-token input and output prices, against the action overage rate in `OVERAGE_PRICING`. The shape that matters: a mid-size action costs about what the overage rate charges, so overage actions roughly break even; in-quota actions are absorbed by the platform.
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

The ladder (customers, MRR at the blended figure, likely Atlas tier) is in the private figures
file. Build or refresh it this way:

```
blended_ARPU = sum over paid tiers of (price from TIER_DISPLAY * share of PAYING groups on that tier)
MRR(rung)    = paying_customers(rung) * blended_ARPU
Atlas(rung)  = the tier whose connection cap covers that rung's PEAK CONCURRENCY
```

Count paying groups by `stripeSubscriptionID`, never by `tier`, because comped groups carry a
paid tier and pay nothing.

### Parameterized per-customer margin

Per-customer gross margin ≈ `plan price - Stripe fee (percentage plus a fixed per-charge fee) - AI token cost (if used) - CDN/storage overages - that customer's share of build minutes`.

Per-tier net margin is a calculation over the price from `TIER_DISPLAY`, the Stripe fee for that
price, the optimised AI cost from the quota, and the build minutes that tier's sites typically
burn. **Compute it against the current ladder and compare each tier to the floor** (the floor and
the last margin check are in the private figures file). Per-site rebuilds (Amplify build
minutes) are the largest per-customer cost and payment fees are the other one that matters, so
the cheapest paid tier is where the floor breaks first.

Blended gross margin is never quoted from memory: re-derive it. It improves with scale because
fixed infra amortizes across more customers. **Fixed infra** = AWS usage plus tax for a closed
month + the Atlas invoice line (budgeted from the hourly rate until the first invoice) + GitHub +
non-product domain renewals, excluding the Amazon Registrar pass-through for customer domains.
**Quote closed months only**: a mid-month read once came in far below the close. WorkMail is
already inside the AWS total; do not add it again. Note also that the amortization argument is
weaker than it reads, because the largest usage line (Amplify build minutes) scales with deploy
activity rather than with headcount, so that part does not amortize at all.

## Margin levers (in priority order)

1. **Edge / API-Gateway caching on the public Client API**, fewer requests → fewer warm containers → lower peak concurrency → defers the next Atlas tier step. Biggest infra lever because Atlas tier is concurrency-driven.
2. **Reserved-concurrency caps** (see `vivreal-lambda`), make total Mongo connections deterministic and bounded; convert DB-saturation into friendlier 429s and keep the Atlas tier step predictable.
3. **Annual plans**: better cash collection, lower per-transaction Stripe fees, lower churn. Live as real Stripe prices in `TIER_DISPLAY`; read the prices there. Budget the free first-year domain bundle as the sweetener cost, capped and once per group.
4. **Tier and cap review**: quotas have been right-sized once and spending caps are default on, auto-enrolled at roughly twice the base price. **Read `DEFAULT_SPENDING_CAP` for the current values.** The remaining lever is cap tuning plus settling the per-bucket versus total cap design call flagged in the package docstring.
5. **Agent prompt-caching, SHIPPED (July 2026)**; the cut is banked, monitor the cache-hit rate.

## What's NOT a cost today

- **Vector search** is an unbuilt dead stub, the M10 upgrade is a prerequisite but ships nothing on its own; treat as a separate scoped roadmap project. Its eventual cost (embedding generation) is small for a one-time backfill of a few thousand objects.
