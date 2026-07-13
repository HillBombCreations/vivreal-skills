---
name: vivreal-brand-voice
description: Use when writing, reviewing, or critiquing Vivreal marketing copy, messaging, or brand content — landing pages, pricing copy, social posts, cold email, ad copy, onboarding/in-app copy, taglines, or any customer-facing words. Teaches the Vivreal voice (the "Approachable Guide" for non-technical SMB founders), the promise ("Create once. Publish everywhere." + easy, phone-first), the hard-banned words/patterns, the framing rules + honesty floor, the competitive frame, an on-voice audit rubric, channel best-practices, and AI prompt scaffolding. Triggers on: brand voice, tone, copy, messaging, marketing content, landing page copy, pricing copy, cold email, social post, ad copy, tagline, headline, value prop, positioning, on-voice, jargon, CTA, social proof, founder-led. The `marketing-auditor` agent grounds in this skill; the content agents in vivreal-content PRODUCE to this voice. Canonical source: C:\repos\vivreal-content\knowledge\01-voice-and-rules.md.
---

# Vivreal Brand Voice — definition, rubric & channel playbook

The defined Vivreal voice and the rules for keeping every customer-facing word on-brand. This is the grounding for the **`marketing-auditor`** agent and the voice anchor that `content-planner`/`content-creator` write to (those agents live in `C:\repos\vivreal-content\.claude\agents\` — content tooling moved out of the portal 2026-06-25).

> **Canonical voice source: `C:\repos\vivreal-content\knowledge\01-voice-and-rules.md`.** If that file and this skill diverge, that file wins — read it when it's available. This skill encodes the same voice so it works on any machine.

Last synced: 2026-07-13

## The promise behind every word

**Create once. Publish everywhere.** We sell bigger reach with less effort, in plain language a baker or a plumber would use — never "a better CMS." The second half carries equal weight: **it's genuinely easy, and you run the whole thing from your phone or tablet like an app.** Lead with ease and mobile as often as the one-click pitch.

## Who we write for

**Non-technical SMB founders / cofounders** — restaurant owners, comedy venues, boutique retail, service businesses, creators. They currently pay an outsourced developer or agency to change basic things on their site. They are not buying a CMS; they're buying *"I can run my own site without calling Jake the freelancer every time."* The non-technical-cofounder wedge is the single most important asset — competitors (Webflow/Wix/Shopify/headless CMSes) market to developers and technical founders; nobody else speaks to this buyer as the primary one. It must show up in every touchpoint.

## The voice: "The Approachable Guide"

Defined on four dimensions ([Technotize](https://technotize.io/insights/brand-voice-b2b-saas), [Bigeye](https://www.bigeyeagency.com/insights/ultimate-brand-voice-frameworks-guide)):

| Dimension | Vivreal setting |
|---|---|
| **Pace** | Terse. Short sentences. Active voice. |
| **Register** | Casual-but-credible. Talks *to* the owner, not down to them. |
| **Posture** | **Peer/guide** (Approachable Guide), never corporate, never condescending. |
| **Vocabulary** | Plain, jargon-free, founder-friendly. The words an SMB owner would actually say. |

**Voice is constant; tone flexes by context** — an error message and a celebration share the voice but differ in tone.

### Positive voice rules

- **Direct.** Short sentences. Active voice.
- **Confident.** No hedges ("helps you," "enables you to"). Just: "Publish to Instagram. One button."
- **Practical.** Describe what features DO, not what they ARE.
- **Plain-spoken.** No word a non-technical owner wouldn't use. "Update your site in a minute, not a call to a web guy."
- **Honest.** If a feature isn't shipped, don't pitch it. Owners spot a fake instantly and trust tools that don't bluff.
- **Show, don't tell.** Scenes over abstractions.

### Framing rules (how any piece is framed)

- **Gain frame, not loss frame.** "Would look sharper on phones" beats "you're losing mobile customers." Encourage, don't alarm.
- **One observation, not a list.** Mention one thing. A second turns a helpful person into an auditor.
- **Respect the competitor.** Name what they're genuinely good at, then win on product. Never punch down — their user is reading.
- **Honesty floor.** Every claim must be one an owner would confirm is true. When in doubt, leave it out.

## Hard bans (any hit = rewrite)

| Banned | Why | Use instead |
|---|---|---|
| Em dashes (`—`) or en dashes (`–`) | Strong AI-generated tell; damages credibility with SMB audiences | Periods, commas, semicolons, parentheses, line breaks |
| "Leverage," "synergize," "empower," "revolutionize," "unleash," "unlock," "solutions," "robust," "seamless," "optimize," "utilize" | Corporate fluff | Verbs that describe what happens: "publish," "replace," "send" |
| "AI-powered ___ engine/platform/solution" | Tells what it IS, not what it DOES | "Write a caption. AI turns it into IG + LinkedIn + an email subject." |
| "Game-changer," "best-in-class," "next-gen," "world-class" | Hype words cofounders distrust on sight | Specific outcomes with numbers |
| "Are you struggling with…?" / "Tired of…?" openers | Infomercial cadence | A specific scene |
| "Thoughts?" / "Agree?" closers | Engagement-bait cliché; LinkedIn downranks | A real question, or none |
| Developer jargon: API, API-first, headless, schema, manifest, webhook, OAuth, JWT, edge runtime, multi-tenant, composable, omnichannel, "content at scale" | ICP is non-technical | Plain English: "connection," "template," "behind the scenes" |
| Any non-owner-visible term: "404," "structured data," "render," "meta description," "PWA" | **Owner-visible language only** — reference what an owner can SEE or DO | What the owner experiences: "that page is missing," "how it looks in Google," "installs on your phone" |
| Excessive emoji (>5 IG, >2 LinkedIn/X/TikTok) | Reads as bot/spam | One anchor emoji max |
| Empty hashtags (`#business`, `#marketing`, `#content`) | Pure noise | Niche tags + branded `#Vivreal #PublishOnce` |
| Naming real customers / quoting real prospects | Privacy | Anonymized scenes |
| Citing metrics ("3x reach," "saves 2 hours") not in the brand guide / not user-provided | Unverifiable claims | Omit, or flag for verification |

## The competitive frame

Lead against the tools owners actually know (plus the niche industry CMS a trade gets locked into), never enterprise-CMS jargon. Grant the strength, then win on product.

| What they use | Their pain | Our opening |
|---|---|---|
| **WordPress** | Monolithic, slow, needs a developer to touch | A modern site they edit themselves, no dev |
| **Squarespace / Wix** | Editing is a guessing game; nothing for social or email | True live-preview plus one-button publish everywhere |
| **Shopify** | Store is fine; blog, social, email are separate tools | One portal for store, content, social, and email |
| **Buffer / Mailchimp / Hootsuite** | Five tools that don't talk to each other | Replace the stack; create once, publish everywhere |
| **Webflow** | Powerful, but built for designers | A professional site the owner can run, no designer |
| **Niche / industry-specific CMS** | Clunky, dated, built for one trade; locked in, thin support | One easy system for site, social, and email together, on any device |

The through-line that beats all of them: **it's easy, and it runs from your phone like an app.** An owner can update the site, post to social, and send an email between customers. Nothing else does that.

## Honesty floor — claims to verify before publishing

These recur in proof points. Confirm each is true and current before asserting it; if it isn't shipped, soften or cut.

- **"Installs on your phone/tablet like an app"** (the PWA install prompt) — if install isn't live, say "works great on your phone" instead.
- **Real AI checkout through a Stripe-connected store.**
- **The plain-English AI assistant making site edits.**
- **Live-preview parity in Site Studio** (what you see is what publishes).
- **Any pricing number** — always swap in real current pricing, never placeholder ranges.

## The shared page standard (web pages / comparison briefs)

- Respect the competitor: name what they're good at, then win on product.
- Structure for AI search: open with a one-paragraph direct answer, then a comparison table, then the detail.
- Meta description 150–160 characters, benefit first, plain words, soft action.
- One clear call to action, top and bottom. Default: start free, no credit card, setup in two minutes.
- No em dashes, no jargon.

## On-voice audit rubric (score each 0-2)

1. **Pace** matches the voice doc (terse, active)?
2. **Register** on target (casual-but-credible)?
3. **Posture** = Approachable Guide (peer/helpful, not corporate or condescending)?
4. **Vocabulary** plain, jargon-free, founder-friendly?
5. **Tone** appropriate to context (error vs celebration) while voice stays constant?
6. **Blind-test pass**: recognizable as Vivreal with the logo removed?

A passing asset scores ≥10/12 with no hard-ban hits.

## Marketing best-practices checklist (10 points)

1. Value prop is a **pain → outcome** statement, not a feature list ("update your menu without calling Jake" beats "composable headless CMS").
2. **One** primary CTA per page/asset (extra offers can cut conversion ~266%; personalized CTAs convert ~202% better than generic).
3. Copy is **benefit-led**, features as proof.
4. **Quantified, named** social proof near decision points (testimonials can lift conversion ~34%; from non-technical cofounders > feature lists).
5. Forms minimized — each extra field costs ~10-15% completion.
6. Message structured as core value prop + **3-5 pillars**, each backed by a feature AND a proof point.
7. **Founder-led** presence on LinkedIn — personal profiles get ~8x the engagement of company pages; ~80% of B2B social leads come via LinkedIn.
8. Channels **orchestrated in sequence**, not run in isolation (connect on LinkedIn → engage 2-3x → personalized request → email + DM gets ~3.5x more responses than email alone).
9. A **short-form video** motion for demos (41% of B2B marketers say it delivers highest ROI; "show, don't tell").
10. Language matches **SMB / non-technical-founder** vocabulary — no insider jargon.

## Channel notes (circa 2026, SMB / non-technical founders)

- **LinkedIn = the spine.** Founder-led, not just a brand page. Buyers are cynical of polished brand accounts.
- **Email**: nurture organically-built lists; cold outreach tightly personalized, one ask + one CTA. (Vivreal's own outreach product reinforces sequenced, personalized sends.)
- **X**: real-time industry commentary, product announcements, responsive public support.
- **TikTok / Instagram**: founder-led educational short video + behind-the-build; top-of-funnel awareness, not direct response.
- **Landing pages**: one goal, one primary CTA, benefit-led copy that names the pain, trimmed forms.

## AI prompt scaffolding (stay on-voice when generating with AI)

~87% of teams use AI for content but only ~23% updated guidelines for it — consistency at scale needs the voice doc encoded into the prompt. Prepend this to any content-generation prompt:

```
You are writing as Vivreal — the "Approachable Guide" voice for non-technical SMB
founders (restaurant owners, venues, boutiques, creators).
RULES:
- Direct, short sentences, active voice. Confident, no hedges. Practical: say what
  the feature DOES, not what it IS. Show, don't tell — scenes over abstractions.
- NO em or en dashes. NO corporate fluff (leverage/empower/revolutionize/unlock/
  synergize/solutions/robust/seamless/optimize/utilize).
- NO hype (game-changer/best-in-class/next-gen). NO infomercial openers
  ("Tired of…?") or engagement-bait closers ("Thoughts?").
- NO developer jargon (API/headless/schema/manifest/multi-tenant/composable/
  omnichannel/"content at scale") and owner-visible language ONLY (no "404,"
  "structured data," "render," "meta description," "PWA") — use plain English
  ("connection," "template," "behind the scenes").
- Gain frame, not loss frame. One observation per piece, not a list. Respect the
  competitor: grant their strength, then win on product.
- One primary CTA. Benefit-led. Don't invent unshipped features. Don't cite metrics
  you weren't given. Don't name real customers.
- The non-technical-cofounder wedge shows up: "run your own site without calling a
  developer."
Then self-check against the 6-point on-voice rubric before returning.
```

## Boundaries / companions

- **`marketing-auditor`** agent — CRITIQUES copy/assets against this skill (read-only).
- **`content-planner` / `content-creator`** agents — PRODUCE social content to this voice.
- **`principal-growth-auditor`** — owns funnel/conversion ECONOMICS, positioning strategy, churn; this skill owns the *voice/copy craft*. They overlap on messaging but the auditor judges the *business* lever, this judges the *words*.
- **`vivreal-unit-economics`** — for the cost/margin numbers behind pricing copy.

Sources: `C:\repos\vivreal-content\knowledge\01-voice-and-rules.md` (canonical: promise, five traits, ban list, competitive frame, honesty floor), `vivreal-content\.claude\agents\content-planner.md` + `content-creator.md` (hard bans, per-platform limits, self-check), `principal-growth-auditor` (ICP/wedge). For the wider content system (strategy/ICP, content library, posting playbook, earned media, niche verticals) see the `vivreal-content-knowledge` skill.
