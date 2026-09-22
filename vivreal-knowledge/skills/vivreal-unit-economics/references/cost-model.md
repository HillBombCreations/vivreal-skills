# Vivreal cost model: scale ladder, margin math & AI economics

Detail backing the `vivreal-unit-economics` skill. Figures are 2026-06; the live source is `Vivreal_Portal_Mobile/docs/proposals/2026-06-mongo-tier-and-ai-actions.md` (+ the `vivreal-status-briefing-2026-06-16.html` briefing). Re-verify before quoting in a decision.

## AWS line items (Cost Explorer, 3-month avg ≈ $35/mo, flat)

| Service | ~Monthly | Note |
|---|---|---|
| WorkMail | $8-16 | per-mailbox; biggest single AWS line |
| Amplify | ~$11 | customer site hosting/builds |
| Route 53 | ~$2.5 | hosted zones |
| CloudWatch | ~$2 | logs/metrics |
| Secrets Manager / KMS | ~$1 each | `vivreal/prod/*` secrets (Phase 2, former `hb-api-secrets` retired) |
| S3 / API Gateway / CloudFront | <$1 each | media / edge |
| **Lambda** | **$0** | free-tier absorbed |
| **Bedrock** | **~$0** | confirms AI is NOT on Bedrock, it's the direct Anthropic API |
| **Total** | **~$32-38** | barely moves with customer count at current scale |

AWS infra is a fixed ~$35/mo. The Atlas upgrade does not change this line.

## MongoDB Atlas tiers (the real infra lever: billed directly by MongoDB)

| Tier | ~Monthly | Connections | ~Concurrent users* | Vector search? |

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
- **AI is gated in two dimensions**: the metered `agentActions` quota AND the binary `TIER_FLAGS` capability flags `aiSiteEditing` and `aiComponentGen` in `src/tierQuotas.ts`. Helpers mirror `canHidePoweredBy`, plus `lowestTierWithFlag()` so consumers derive the required tier rather than hardcoding one. **Read which tier gets which flag from the file**: the ladder has lost a tier, so any per-tier statement written down elsewhere now describes a plan nobody can buy.

### Worst-case AI exposure at full quota utilisation, and how to compute it

Do not read a per-tier exposure table out of this file. The tier ladder has changed and every
row would be stale in two directions at once. **Compute it instead**, which takes a minute:

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





Blended gross margin lands **~84-90%** and improves with scale because fixed infra (~$105-110/mo all-in) amortizes across more customers, covered by just ~2 Pro or ~6 Basic customers; everything above is gross profit.

## Margin levers (in priority order)

1. **Edge / API-Gateway caching on the public Client API**, fewer requests → fewer warm containers → lower peak concurrency → defers the next Atlas tier step. Biggest infra lever because Atlas tier is concurrency-driven.
2. **Reserved-concurrency caps** (see `vivreal-lambda`), make total Mongo connections deterministic and bounded; convert DB-saturation into friendlier 429s and keep the Atlas tier step predictable.
3. **Annual plans**: better cash collection, lower per-transaction Stripe fees, lower churn. Live as real Stripe prices in `TIER_DISPLAY`; read the prices there. Budget the free first-year domain bundle as the sweetener cost, capped and once per group.
4. **Tier and cap review**: quotas have been right-sized once and spending caps are default on, auto-enrolled at roughly twice the base price. **Read `DEFAULT_SPENDING_CAP` for the current values.** The remaining lever is cap tuning plus settling the per-bucket versus total cap design call flagged in the package docstring.
5. **Agent prompt-caching, SHIPPED (July 2026, PR #77)**; the ~40-70% cut is banked, monitor the cache-hit rate.

## What's NOT a cost today

- **Vector search** is an unbuilt dead stub, the M10 upgrade is a prerequisite but ships nothing on its own; treat as a separate scoped roadmap project. Its eventual cost (embedding generation) is single-digit dollars for a one-time backfill of a few thousand objects.
