---
name: vivreal-unit-economics
description: 'Use when reasoning about Vivreal''s COST, MARGIN, PRICING, or UNIT ECONOMICS, gross margin per customer, the cost stack (AWS, MongoDB Atlas, Anthropic/AI), overage revenue, infra cost as you scale, runway, or whether a proposed change dents the ~80% margin floor. Teaches where the real numbers live and which axes still exist: pricing and quotas read from the tier-quotas package, gross margin, AWS roughly flat at this scale, Atlas rising by cluster rung, overage rates and spending caps, capability flags (aiSiteEditing/aiComponentGen), that DB tier tracks PEAK CONCURRENCY not signups, and the scale ladder. **Customer inference is RETIRED as a cost axis**: agentActions is 0 on every tier, so there is no per-customer model-token spend to model. Triggers on: unit economics, gross margin, pricing, overage, spending cap, AWS cost, Atlas cost, M10/M20/M30, Anthropic cost, prompt caching, AI quota, runway, margin floor, scale ladder, peak concurrency, CAC payback. The `finance-auditor` agent grounds in this skill. This is INTERNAL cost/margin, for GTM/funnel/retention economics use the growth agents instead.'
---

Last synced: 2026-09-23. **A stamp only means anything if every hand-patch moves it.** This one
sat at 2026-07-30 while facts were edited in underneath it, so it stopped meaning "everything
before this date, nothing after" and became decoration. Bump it whenever you touch a fact here,
or delete the line rather than leaving a date nobody can rely on.

# Vivreal Unit Economics: cost, margin & pricing model

The internal cost/margin/profitability model for Vivreal. This is the source-of-truth digest for any margin or pricing reasoning, and the grounding for the **`finance-auditor`** agent. Lean body; the scale ladder + AI-optimization detail live in `references/cost-model.md`.

> **Sources of truth, and the order to trust them in.** Pricing and quota constants:
> `@hillbombcreations/tier-quotas` `src/tierQuotas.ts`, which is authoritative and which also
> holds the Stripe price ids. Live customer mix and counts: query `Vivreal.groups`. Live Atlas
> headroom: `db.adminCommand({serverStatus: 1})`, which is permitted on the shared tier and
> returns `connections.current` and `connections.available` directly. Infrastructure spend: the
> AWS bill and the MongoDB invoice, which are two separate bills. **Everything below is
> reasoning and magnitude. Where a number is pinnable, this file points at the pin rather than
> copying it, because a copy is wrong in two places at once the moment it moves.**

## Pricing & blended revenue

**Prices, tier names and AI allowances are NOT written down here, deliberately.** They live in
`TIER_DISPLAY` and `TIER_QUOTAS` in `Vivreal-Tier-Quotas` `src/tierQuotas.ts`, which is the
pricing-constant source of truth including the Stripe price ids. Read them there before quoting
a single figure to anyone, internally or in copy.

Three specific traps this table used to walk into:

1. **A tier has been retired and folded into another.** Reasoning about margin per tier from a
   remembered ladder now models a plan nobody can buy.
2. **The AI action allowance moved by an order of magnitude, then again, and then to zero.**
   The historical tail risk this file existed to track was a maxed-out AI quota on the top plan.
   That exposure is now closed by construction: `agentActions` is `0` on every tier, retired
   2026-09-18 as an owner decision to stop paying for customer inference. **There is no AI quota
   to model, raise, or trade off.** A question premised on one has no valid answer, and saying so
   is the correct response.
3. **A price in a doc and a price in Stripe are two different facts.** The package holds the
   Stripe price ids; the live prices are what those ids resolve to. A pricing page that
   disagrees with either is a third, separately wrong, copy.

- The blended figure and the tier mix are estimates that move with the customer base. **Recompute the mix from `Vivreal.groups` before using it in an argument**, and take the prices from the package. Annual plans exist as real Stripe prices in `TIER_DISPLAY`.
- **AI capability flags.** AI was gated in two dimensions. The metered `agentActions` quota is now `0` everywhere, so what remains live is the binary capability flags. `TIER_FLAGS` in `src/tierQuotas.ts` carries `aiSiteEditing` and `aiComponentGen`. **Read which tier gets which from the file.** Helpers mirror `canHidePoweredBy`, plus `lowestTierWithFlag()` so consumers derive the required tier rather than hardcoding one. `ENFORCEMENT_MANIFEST` entries are mandatory: it is a total Record over the flags, so omitting one fails the build and the tests. **A manifest row is only true if the path the product actually calls runs the gate**, so check the caller before believing a row.
- **Gross margin ~84-90%** today and it *improves with scale*, fixed infra is tiny and amortizes; the dominant per-customer cost is payment processing. Model inference is no longer a per-customer cost at all.

## The cost stack (three bills, two off the AWS invoice)

1. **AWS ≈ $35/mo, essentially FLAT** at current scale (WorkMail + Amplify + Route53 dominate; Lambda is $0 free-tier-absorbed). Customer count barely moves this line. The M10 Mongo upgrade does NOT change it.
2. **MongoDB Atlas, billed directly by MongoDB, NOT on the AWS bill.** This is a real lever and it tracks **PEAK CONCURRENCY, not signup count** (see below). $0 free → **~$60 M10** → **~$150 M20** → **~$400+ M30**. One cluster holds all tenant DBs, you don't pay per database.
3. **Customer inference: RETIRED as a cost axis, 2026-09-18.** `agentActions` is `0` on every
   tier including enterprise, so no group can enter the agent loop and there is no per-customer
   Claude API spend. This was a deliberate owner decision to stop paying for customer inference,
   not a quota tuned down, and it removes the whole line from the cost stack rather than shrinking
   it. **Do not model it, and do not answer a question that presupposes an AI quota exists.**
   What survives is `mcpToolCalls`, which meters something else entirely: Vivreal's own Lambda and
   Mongo work. It is a HARD STOP with no overage rate, so treat it as a capacity bound, not
   revenue. Verify both against `src/tierQuotas.ts` on the deployed line before quoting either.

### Overage billing: priced quota headroom

- **Read the rates from `OVERAGE_PRICING` in the tier-quotas package.** The shape that matters: CDN and API overage are strongly margin positive, and agent overage roughly breaks even against uncached token cost and is positive with caching. The eligible-tier list is in the package too, and it changed when a tier was retired.
- New paid subs **auto-enroll** with the tier default spending cap, which is set at roughly twice the base price. Free and the top plan are excluded. **Read `DEFAULT_SPENDING_CAP` for the numbers.** The cap is what bounds worst-case AI cost, so it is the lever, not the quota.
- **Open design call** (flagged in the package docstring): defaults enable per-bucket AND total caps, the owner must pick one primary before prod.
- **The free first-year domain bundle is a COST item, not revenue**: a bounded, capped acquisition cost on an annual contract, once per group. Read the cap and the eligible plans from the package.

## The non-obvious rule: DB tier tracks PEAK CONCURRENCY, not signups

The Atlas cost lever is driven by **simultaneous in-flight backend requests**, not how many customers exist. Each warm Lambda container holds ~6-15 Mongo connections, so the connection cap converts into a ceiling on concurrent requests:

- **The shared tier has a hard connection cap, and a production walk has hit it.** Read the live headroom with `serverStatus` before reasoning about it; do not quote a remembered ceiling. The conversion that matters: each warm Lambda container holds a handful of Mongo connections, so the cap becomes a ceiling on concurrent in-flight requests, and a rule of thumb of about three connections per concurrent user is close enough for planning.
- **Each Atlas tier step raises the cap by roughly a factor of three.** Read the current tier and its cap from the Atlas console or `serverStatus`, and price the step from the MongoDB invoice, which does not appear on the AWS bill.
- Daily spikes from the public Client API already push against the shared cap, which is why an upgrade is on the table despite light total volume. **Re-measure before citing a spike figure**: this one has been quoted three-times wrong in this repo before.
- **Implication for forecasting:** model the DB-tier step from a peak-concurrency projection, not a signup count. A traffic burst forces the upgrade long before raw customer count would.

## The scale ladder (revenue at the ~$45 blended)

| Customers | MRR (~$45 blended) | Likely Atlas tier |
|---|---|---|
| 50 | **~$2.25k/mo** | M10 (~$60) |
| 500 | **~$22.5k/mo** | M10→M20 |
| 1,000 | **~$45k/mo** | M20 |
| 5,000 | **~$225k/mo** | M20→M30 |

Fixed infra (~$105-110/mo all-in: AWS ~$35 + Atlas M10 ~$60 + WorkMail ~$8-16) is covered by **~2 Pro or ~6 Basic customers**. Everything above that is gross profit, which is why margin *improves* with scale.

## Margin levers (when margin is under pressure, reach for these)

1. **Edge / API-Gateway caching**, cuts Client-API request volume → fewer Lambda containers → lower peak concurrency → defers the next Atlas tier step (the single biggest infra lever).
2. **Annual plans** improve cash collection, reduce per-transaction Stripe fees and reduce churn. They are live as real Stripe prices in `TIER_DISPLAY`; read the prices there. The free-domain bundle is the sweetener cost.
3. **Tier and cap review.** Spending caps are default on. With customer inference retired, the
   worst-case-AI-cost argument this lever existed for is gone; what remains is cap tuning on the
   quotas that are still metered, plus settling the per-bucket versus total cap design call.
   **Re-read the current quotas from the package before proposing a change to any of them.**
4. **Prompt caching is shipped, and is now beside the point for unit economics.** It still
   matters for Vivreal's own internal agent spend, which is an operating cost rather than a
   per-customer one. It no longer defends a customer-facing margin.

## Read the reference for

- The full **scale ladder** with per-tier margin math, the parameterized margin model, and the AWS line-item breakdown → `references/cost-model.md`.
- The **AI cost mechanics** (action = one tool call; agentic loop = N+1 model calls; the uncached vs cached vs Haiku-for-routine exposure table) → `references/cost-model.md`.

## Boundary (do not confuse with growth)

This skill is **internal cost / margin / profitability**. It is NOT go-to-market. For funnel/conversion economics, churn (NRR/GRR), CAC, positioning, and retention, use the `growth` / `principal-growth-auditor` / `growth-advisor` agents, they own the revenue-side levers; this skill owns the cost-side levers. Companions: `vivreal-atlas-topology` (the connection-cap mechanics behind the Atlas tier lever), `vivreal-lambda` (reserved-concurrency, which bounds the peak-concurrency cost driver).
