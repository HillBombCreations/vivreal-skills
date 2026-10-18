---
name: vivreal-ads-knowledge
description: Auto-triggers when the user mentions Google Ads, paid ads, ad campaigns, ad spend, PPC, conversion tracking, GA4 key events, ad creative, or geo-targeted advertising for Vivreal. Loads what we've actually learned running the Vivreal Google Ads account, so Claude doesn't re-discover the same gotchas from scratch.
---

# Vivreal Paid Ads Knowledge

This skill is **young and incomplete on purpose** — it started from one $25/mo Google Ads test
(October 2026, India + Philippines geo test) and should grow every time a new campaign teaches us
something. Add to it; don't treat it as finished.

## Account facts (verify before trusting — these can change)

- Google Ads account name: **Vivreal**, `ocid=601418776`.
- Google Ads conversion ID: **AW-472935172**.
- GA4 property: **Vivreal**, property ID `414970959`, linked to the Ads account since 2024-12-05
  with audience import + web metrics on.
- There is a Google Tag Manager container, `GTM-W8PM3Z8M`, for `www.vivreal.io` — **this is the
  marketing-site container and showed "No Recent Data" when checked.** It is NOT in the path of
  the portal's signup event. Don't assume a GTM container you find is the one that matters; check
  which stream an event actually reports under in GA4 before building around it.

## The conversion-tracking trap (read this before spending anything)

**An account can have a dozen "conversion actions" and still not measure anything that matters.**
In October 2026 the account had 10 conversion actions — phone call leads, map clicks, a contact
form, an outbound click to `/pricing` — and **none of them was an actual signup.** The closest
proxy was "outbound click to pricing page," which only means someone clicked toward pricing, not
that they created an account. Don't trust a populated conversion-action list; check what each one
actually measures.

**Before building a campaign, check whether the real conversion event already exists in code.**
For Vivreal, `trackSignUp()` in `Vivreal_Portal_Mobile/src/lib/analytics.ts` fires a GA4-standard
`sign_up` event right after `registerUser()` succeeds (see
`src/components/Register/Client/index.tsx`) — real, already shipped, firing in production. The
gap wasn't the code, it was that **GA4 doesn't export an event to Google Ads just because it
fires.** You have to mark it a **GA4 key event** first: GA4 Admin → Data display → Events →
"Recent events" tab → find the event → click the star. Only then does it become eligible to sync
to Ads as an importable conversion action.

**The GA4 → Ads sync is not instant.** After marking a key event, it can take several hours (up
to ~24h isn't unusual) before it shows up in Google Ads under Goals → Conversions → All
conversions as a new row sourced from "Google Analytics (GA4)". There is no button that forces
this faster. Budget for that wait in any same-day test — don't promise a same-session fully-wired
campaign.

**The GTM "fast path" only works if the event actually flows through GTM.** We checked whether
adding an Ads conversion trigger in Google Tag Manager (instant publish, no code deploy) could
skip the GA4 import wait. It can — but only for events GTM itself fires. Vivreal's portal loads
GA4 directly via Next.js's `<GoogleAnalytics>` component (`next/third-parties/google`), not
through the `GTM-W8PM3Z8M` container, so `sign_up` never touches GTM at all. Adding a trigger
there would have done nothing. **Check which mechanism actually fires the event you care about
before assuming a shortcut applies.**

**The "ship a direct gtag conversion call in code" path exists but is usually not actually
faster.** You could add a second `gtag('event', 'conversion', {send_to: 'AW-XXX/LABEL'})` call
right next to `trackSignUp()`, live the moment it ships, no GA4 wait. But Vivreal's portal deploys
on a **weekly release train** (Friday cut, Monday promote — merging to `main` deploys nothing by
itself; see the portal's `docs/RELEASE.md`), so for a one-off ad test this is slower than just
waiting for the GA4 import, not faster. Reach for it only if the campaign is big enough, or
permanent enough, to be worth riding the normal release cycle rather than waiting a few hours.

## Account hygiene

**Audit before building.** The account had 4 paused campaigns sitting in it before this test,
with budgets from $45/mo to **$325/mo** (a Performance Max campaign), two of them flagged
"conversion tracking setup is incomplete" by Google's own UI. None of those budgets had anything
to do with the new test. Always look at what's already in the account — paused campaigns still
represent decisions (or mistakes) someone made — before adding something new. Confirm with the
user whether to leave them, investigate them, or remove them; don't assume either way.

## Creative conventions

**Image generation: Google Flow** (`labs.google/fx` redirects to `flow.google.com`), using the
**Nano Banana** model (2.1 as of October 2026). Workflow: new project → type a prompt in the
chat-style composer → it generates 2 variations by default → open an image → download menu offers
1K/2K/4K, use 2K for ad quality. No API key needed, it runs through the logged-in Google account
already connected to Chrome in this environment.

**Representation must match the actual targeted geography, not default to a Western-presenting
subject.** The first pass of "small business owner" prompts came back Western-presenting by
default even though the campaign targets India and the Philippines. Fix: name the nationality or
region explicitly in the prompt (e.g. "a smiling Indian small business owner," "a Filipino small
business owner running a boutique cafe"). This is a basic relatability principle in advertising,
not a deep cultural-insider claim — don't overclaim specific market knowledge you don't have, but
do get the obvious representation right.

**Never let AI-generated imagery pretend to show the actual product.** A prompt like "phone
showing a website builder app interface" will generate a *plausible-looking but completely fake*
UI — it is not Vivreal's real interface and never will be, because an image model can't reproduce
a specific real app's screens. Using that in an ad would misrepresent the product (and likely
violate Google Ads policy on misleading creative). Split the job: AI-generated photos carry the
*emotional/lifestyle* appeal (person, setting, mobile-first moment) with phone screens blurred,
angled away, or out of frame; **real screenshots** of the actual product carry the *product-is-real*
proof. Don't blend the two into one fake "product in use" shot.

## Building a campaign in the new-campaign wizard — two traps that don't show until Review

**A new campaign inherits ALL account-default conversion goals, including ones you never
touched.** Early in the wizard there's a "Use these conversion goals to improve Leads" screen
listing account-default goals (in this account: Contacts, Outbound clicks, Phone call leads) —
continuing past it attaches all of them to the new campaign's bidding, regardless of what you
pick later on the "ways you'd like to reach your goal" checkboxes (that screen only tailors ad-copy
suggestions, it does **not** set the campaign's actual conversion goals). The only way we found to
see this had happened was the **Review step's "Goal" line** — it showed `Contacts (Call from Ads,
Website), Outbound clicks, Phone call leads` even though we'd only checked "Website visits" earlier.
**Fix (post-creation only — there is no in-wizard control for this):** after the campaign exists,
open the live campaign's **Settings → Budget and bidding optimization → Conversion goals**, switch
the dropdown from "Account-default" to **"Campaign-specific,"** then "Choose campaign goals" and
pick only what actually matters. Until the real goal (e.g. a freshly-synced `sign_up` import) is
available in that picker, pick the least-bad existing option as a placeholder rather than leaving
the strong account-default set attached — a phone-call/contact-form-optimized bid strategy will
actively steer traffic toward the wrong behavior.

**"Publish campaign" does not mean paused, even if every one of your settings says otherwise.**
A campaign created with a real (if tiny) budget publishes **Enabled** and goes live immediately —
nothing in the wizard asks "paused or live?" The Overview page's status pill is the only place to
check, and it must be flipped to **Paused** by hand right after publish if the intent was a
reviewed draft, not a live spend. In this session the campaign ran live for a few minutes with an
inherited phone-call-optimized bid strategy before this was caught and fixed — low-cost at
$0.82/day, but the mistake scales with budget.

**Also worth doing before Review, not after:** "AI Max for Search campaigns" defaults ON for new
campaigns, bundling broad-match keyword expansion, AI-rewritten ad text, and Final URL expansion
(sending clicks to Google's choice of landing page instead of yours) into one toggle. For a
controlled test with hand-written copy and phrase-match keywords, turn the whole "Optimize your
campaign with AI Max" switch off — the sub-toggles (Text customization, Final URL expansion) can
drift back on independently otherwise. Also skip the "Keyword and asset generation" AI step
(Google will prefill headline/description fields with auto-generated copy like "AI Assistant API -
Vivreal" that looks like real content and is easy to miss replacing — check every headline/
description field for prefilled text before trusting what you typed is actually what's live).

## Test structure used (October 2026, India + Philippines)

- Single Search-only campaign (no Display/PMax/Performance Max at this budget — too wasteful
  on $25/mo, roughly $0.80-0.82/day).
- 2 countries at a time, not a whole region — at this budget you won't get enough volume per
  country to read anything if you spread across more.
- Language: English (no translation needed — these are real English-speaking markets for an
  English-language SaaS product).
- Success metric: **cost per real signup**, not CTR/impressions/clicks. Low-cost-geo campaigns
  can look great on vanity metrics and convert zero paying customers.
- Tight negative keyword list from day one (free, template, wordpress, jobs, careers) — cheap-geo
  traffic attracts more junk clicks than a US campaign at the same spend.

## Open questions / not yet learned

- Whether cost-per-signup from this test is actually competitive with other channels — no data
  yet, campaign hadn't launched as of this skill's creation.
- Whether USD-only pricing is a real conversion blocker in these markets — flagged as a risk, not
  measured.
- Whether a direct-code Ads conversion tag is ever worth the release-train wait for a bigger
  campaign — no case study yet.
