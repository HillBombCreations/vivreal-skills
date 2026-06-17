# Vivreal cost model — scale ladder, margin math & AI economics

Detail backing the `vivreal-unit-economics` skill. Figures are 2026-06; the live source is `Vivreal_Portal_Mobile/docs/proposals/2026-06-mongo-tier-and-ai-actions.md` (+ the `vivreal-status-briefing-2026-06-16.html` briefing). Re-verify before quoting in a decision.

## AWS line items (Cost Explorer, 3-month avg ≈ $35/mo, flat)

| Service | ~Monthly | Note |
|---|---|---|
| WorkMail | $8-16 | per-mailbox; biggest single AWS line |
| Amplify | ~$11 | customer site hosting/builds |
| Route 53 | ~$2.5 | hosted zones |
| CloudWatch | ~$2 | logs/metrics |
| Secrets Manager / KMS | ~$1 each | `hb-api-secrets` |
| S3 / API Gateway / CloudFront | <$1 each | media / edge |
| **Lambda** | **$0** | free-tier absorbed |
| **Bedrock** | **~$0** | confirms AI is NOT on Bedrock — it's the direct Anthropic API |
| **Total** | **~$32-38** | barely moves with customer count at current scale |

AWS infra is a fixed ~$35/mo. The Atlas upgrade does not change this line.

## MongoDB Atlas tiers (the real infra lever — billed directly by MongoDB)

| Tier | ~Monthly | Connections | ~Concurrent users* | Vector search? |
|---|---|---|---|---|
| M0 free / M2 / M5 shared | $0 / ~$9 / ~$25 | **500** | ~150 | No |
| **M10 (recommended)** | **~$60** | **1,500** | ~500 | Yes |
| M20 | ~$150 | 3,000 | ~1,000 | Yes |
| M30 | ~$400+ | higher | higher | Yes |

\* Rule of thumb: each warm Lambda container holds ~3-15 Mongo connections; ~3-per-container is a reasonable casual-load average, 15 is the pathological worst case. Cap ÷ per-container = the concurrency ceiling. **This is why DB tier tracks PEAK CONCURRENCY, not signups** — a ~105-concurrency spike (observed daily, from the public Client API) already blows the 500 shared cap even though total volume is light (~4,700 invocations/day).

One M10 cluster holds all tenant DBs (`general_shared`, `pro_plus`, etc.) — no per-database charge. Budget ~$60/mo all-in (backup + transfer negligible at current size).

## Anthropic / AI agent cost mechanics

- A billed **"action" = one executed tool call**, NOT one model call.
- One user request = an **agentic loop**: `while (tool_use) { messages.create() }` → one request = **N+1 model calls** for N tool rounds.
- Every model call re-sends: system prompt (~800 tok) + 22 tool schemas (~2,500 tok) + **full tenant context JSON** (~3K-15K tok, grows with tenant size) + transcript. **No prompt caching today** — the static prefix is re-billed every loop iteration. This is the standing fix-before-GA item.
- Pricing basis: Sonnet **$3/M input, $15/M output**. ~$0.05/mid action ≈ the $0.05/action overage rate, so overage actions roughly break even; in-quota actions are absorbed by the platform.

### Pro Plus worst-case exposure (full-quota utilization)

| Tier | Plan | Quota | Uncached @max | With caching (~−45%) | + context trim + Haiku-for-routine |
|---|---|---|---|---|---|
| Basic | $19 | 50 | ~$2.50 | ~$1.40 | — |
| Pro | $59 | 500 | ~$25 | ~$14 | — |
| **Pro Plus** | **$119** | **5,000** | **~$250 (underwater)** | **~$140** | **~$50-80 (margin-positive)** |

The core margin tail-risk: an uncached, maxed Pro Plus customer costs more in tokens than the plan charges. Optimized (caching + trimmed resent context + a leaner model like Haiku 4.5 for routine actions, Sonnet for complex), every tier is comfortably margin-positive even at max utilization.

## Scale ladder + margin

| Customers | MRR (~$45 blended) | Atlas tier likely |
|---|---|---|
| 50 | ~$2.25k/mo | M10 |
| 500 | ~$22.5k/mo | M10→M20 |
| 1,000 | ~$45k/mo | M20 |
| 5,000 | ~$225k/mo | M20→M30 |

### Parameterized per-customer margin (typical use ≈ 20% of AI quota, optimized)

Per-customer gross margin ≈ `plan price − Stripe fee (~2.9% + $0.30) − AI token cost (if used) − CDN/storage overages`.

| Tier | Price | Stripe fee | AI (optimized, typical) | ≈ Net margin |
|---|---|---|---|---|
| Basic | $19 | ~$0.85 | ~$0.30 | **~$17.85 (~94%)** |
| Pro | $59 | ~$2.01 | ~$3 | **~$54 (~92%)** |
| Pro Plus | $119 | ~$3.75 | ~$28 | **~$87 (~73% typical, less at max)** |

Blended gross margin lands **~84-90%** and improves with scale because fixed infra (~$105-110/mo all-in) amortizes across more customers — covered by just ~2 Pro or ~6 Basic customers; everything above is gross profit.

## Margin levers (in priority order)

1. **Edge / API-Gateway caching on the public Client API** — fewer requests → fewer warm containers → lower peak concurrency → defers the next Atlas tier step. Biggest infra lever because Atlas tier is concurrency-driven.
2. **Reserved-concurrency caps** (see `vivreal-lambda`) — make total Mongo connections deterministic and bounded; convert DB-saturation into friendlier 429s and keep the Atlas tier step predictable.
3. **Annual plans** — better cash collection, lower per-transaction Stripe fees, lower churn.
4. **Tier review** — right-size the Pro Plus AI action quota (and/or enable the existing spending cap) so worst-case AI can't go margin-negative.
5. **Ship agent prompt-caching before AI GA** — ~40-70% AI cost cut for ~1 day of work.

## What's NOT a cost today

- **Vector search** is an unbuilt dead stub — the M10 upgrade is a prerequisite but ships nothing on its own; treat as a separate scoped roadmap project. Its eventual cost (embedding generation) is single-digit dollars for a one-time backfill of a few thousand objects.
