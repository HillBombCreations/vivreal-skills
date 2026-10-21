# footage-recorder: dated shooting history

Moved out of the `footage-recorder` agent body on 2026-10-14 (skills audit batch 5) so the agent and its skill copy stop
loading every dated measurement on every run. **Newest dated section wins.** Sections are kept in the
order they were written, so read from the bottom up: a later `MEASURED <date>` section supersedes any earlier row
it contradicts. Treat every dated "do not film" as a question to re-probe on the day, never as an answer.

**Do not plan navigation from this file.** It records the portal nav of the day each walk ran. Read the current
nav from the product (see the agent's "Read the nav from the product" rule).

## Contents (line numbers in this file)

- 32: The portal itself, measured (walks 2 to 10, 2026-09-04 to 2026-09-08)
- 47: What the 2026-09-08 release changed for a shoot
- 70: The nav map that used to sit here was removed (2026-10-14)
- 78: Inside the Studio
- 130: What films well, and what cannot, with the reason
- 217: Timings, because they set shot length
- 247: What the 2026-09-10 release changed for a shoot
- 286: RE-WALKED 2026-09-29 against deployed `stable` v0.29.1 (P4-T0). SUPERSEDED by the 2026-10-02 section
- 333: MEASURED 2026-09-29, second walk, during the P6 shoot. Newer than the re-walk above
- 376: The share beat, and why the scripts are wrong about it
- 399: MEASURED 2026-09-29, third pass: re-taking the published-site proof shots
- 479: MEASURED 2026-09-30, filming a LIVE CUSTOMER SITE (P6-T0, comedyclub.example)
- 560: MEASURED 2026-10-02, after the release train. READ THIS FIRST, it is the newest
- 689: MEASURED 2026-10-02, shooting the twelve-site P6 round. Newest of all
- 802: The 2026-09-08 list, SUPERSEDED. Kept for history, not for planning
- 845: Sheets, scrims, and the Save bar
- 882: Session and state, before the first frame
- 913: Console and network noise that is not a fault

## The portal itself, measured (walks 2 to 10, 2026-09-04 to 2026-09-08)

Ten read-only walks drove the whole product, mostly on a 390x844 phone, in the first week
of September, and wrote down what is where, what it is called, how long it takes, and what
breaks. This section is that record, kept in the shape a shoot needs. **Read it before
writing a shot list**: several of these facts decide whether a planned shot is possible at
all, not just how it is framed.

Sources, so any line can be checked: `docs/projects/domains-hub-and-portal-nav/walk-2-report.md`
(the nav) and `docs/projects/walk-fixes-and-recipes-release/walk-3..walk-10*.md` plus
`preview-parity-audit.md`, `release-2-runbook.md` and `one-release-per-repo.md`. Walk 8 is the
owner pass and is the closest thing to a filming run: it moves through the product task by task
with tap counts and waits. **Walk 9 is campaigns, walk 10 is the post-release pass**, and walk 10
is the freshest thing here: where it disagrees with an earlier walk, it wins.

### What the 2026-09-08 release changed for a shoot

Eighteen pull requests across six repos shipped overnight, 2026-09-07 into 09-08
(`release-2-runbook.md`, the "Executed" section). Live now, read off the npm registry and the
Amplify jobs rather than off a green workflow: **portal v0.18.0**, **renderer 1.68.0**, Templates
`stable` `07bd687`, **CMS v2.7.2**, **Client v2.8.1**, **Secure v2.10.1** (walk 10, section 1).

**Three screens the old list told you not to film are now safe**, one whole product area became
reachable for the first time, nineteen new block types and a new page type are addable, and there
are new refusals to film in their place. All of that is in the unsafe table below, re-dated.
**Do not plan off a shot list written before 2026-09-08.**

**Two caveats that apply to every number below.**

1. **The walks ran as Justin on the Vivreal group. We film `vivreal-content-demo` (Cobalt
   Crumb).** Product behaviour carries across: sheet geometry, timings, broken screens, the
   words on the buttons. Tenant content does not. The 30 pages, the 157 lists, the four
   social links and the "one site" dashboard all belong to the Vivreal group. Never caption
   a demo-tenant shot with a Vivreal-group number, and expect different counts on screen.
2. **Fixes are in flight, and they land fast.** Everything called broken here is dated. Three
   of walk 8's blockers were closed inside 24 hours by one release. Re-check anything you plan
   to film before you plan a shot around it, and re-date the line when you do.

### The nav map that used to sit here was removed (2026-10-14)

It described the 2026-09 nav (a five-slot Home, Sales, People, Addresses, Socials bar, an avatar
menu holding Content, Calendar and Channels) and was wrong by v0.33. Read the nav from the product,
as the agent body says. Two non-nav facts it carried still hold: the Studio route is
`/app/sites/studio?site=<siteId>` (the tile on Home links there; `?siteId=` silently falls back to
the first site), and the never-in-frame routes are `FILMING_BLOCKED_URLS` in `src/denylist.ts`.

### Inside the Studio

Entry: **tap the site tile on the dashboard**. It links to
`/app/sites/studio?site=<siteId>` (walk 4, step 9). The `?site=` spelling is the one the
Studio reads; the tiles used to hand-build `?siteId=`, which silently fell back to the first
site in the group and could only ever be caught on a multi-site account (walk-2-fixes). One
tenant, one site, so a clean result there proves nothing.

The screen is a preview canvas with a header (Save, Discard all), a bottom bar, and the
assistant FAB. **"Edit page"** opens a bottom sheet holding, in order:

- the page picker,
- a **"Finish this site" checklist** (a 4/7 ring plus three suggestions) sitting between the
  page picker and the sections, so a scroll to the real content passes a to-do list every
  time (walk 8, section 5),
- the **SECTIONS** list, each row a name with the subtitle **"Collection"**, plus PAGE TOP
  and PAGE BOTTOM badges,
- **"Add block"**, a palette of **143 cards** grouped by goal with a search box
  ("Search blocks…"), every data-backed card labelled "Needs data". It was roughly 120 before
  the release: **nineteen new block and section types landed in v0.18.0**, ten layouts and nine
  home-sections, and walk 10 found all nineteen present by name (take 2 #4),
- **"Site-wide settings"**, thirteen rows. Named on the walks: Design ("Colors, fonts &
  mood"), Header, Footer ("Links & info at the bottom"), Social links ("Instagram, Facebook
  & more"), Info bar ("Hours, phone & quick links"), Floating button ("Follows visitors as
  they scroll"), Business info ("Name, contact details & address"), Email popup,
  Announcement bar, Order bar, Contact bar, Side buttons,
- **Page settings**, which carries the SEO panel and a live search-result preview.

Other things worth knowing before planning around them:

- **Add Page offers 24 page types in a centred modal**, the only Studio surface that is not
  a bottom sheet, with no search (walk 7 check 6, walk 3 P1). It now includes **"One location:
  A page for a single location: address, hours, and what is on there."**, the `location-hub`
  format that had no Studio door at all before the release (walk 10 take 2 #4).
- **The Content source picker is 157 options** with a search box ("Search your lists") and
  **no way to make a new list from inside it** (walk 7, walk 8 task 6). A block with no list
  picked now offers **"Add a step"** inside its own editor, so the picker is no longer the only
  door out of an empty section (walk 10, 4.1).
- **Block settings are in owner language now, and there are far more of them.** Renderer 1.68.0
  declares 625 config keys over 321 names, and the portal ships a written control for **161 of
  the 191 keys that reach the generated panel**, with the other 30 printing the reason they have
  no box rather than showing nothing (portal commit `1f5787ed`, shipped in v0.18.0). On screen
  that reads as **"SMALL LINE ABOVE THE TITLE"** where the developer key is `eyebrow`, plus
  CONTENT SOURCE, DISPLAY AS, SORT ITEMS, MAX ITEMS SHOWN, SECTION BAND, BAND COLOR, and a
  **"More settings: 10 more things you can change here"** expander. Walk 10 opened three editors
  and found **not one raw config key on screen** (take 2 #5). This is some of the best copy in
  the product and it films as a slow scroll down a panel.
- **Device frames:** the Studio's own Mobile frame is **363 CSS px inside**, not 390, at a
  390 window and at a 1280 window alike; the Desktop frame is 1440 inside (walk 7 N6).
- **The bottom bar** carries a share-looking glyph that is a direct shortcut to Social
  links, the fastest route in the product and unlabelled, plus "Addresses" (walk 8).

### What films well, and what cannot, with the reason

**At 390 there is no "watch it change as you type" shot inside the Studio.** Measured in
walk 8, section 5: with an edit sheet open the sheet is **743 px tall starting at y = 101**,
88 percent of the screen, while the preview iframe starts at **y = 135**. **Zero pixels of
the site are visible while the sheet is open.** The sheet says so itself: "Tap a section to
edit it. Close this to see your changes." So the beat is **type, close, reveal**, three
moves, and a caption promising live preview over that footage would be false. Whether a
desktop width turns the sheet into a side panel that keeps the canvas visible is **not
measured**; probe it before planning that shot.

Everything else that changes a shot:

- **The preview frame is 281 px wide inside a 390 px phone** (walk 8). Anything filmed off
  the preview is at roughly three-quarter size. For a "here is the finished site" shot, film
  the **published URL** as its own segment (absolute URL in `goto`; see the note under the
  restorative-write section) rather than zooming the preview.
- **Tapping a section scrolls the preview to it** (scroll position moved 3150 to 1211,
  walk 8 task 7). Real cause and effect, and a good cut, but only visible once the sheet is
  closed.
- **Panel edits reach the preview immediately.** Walk 8 saw the floating button's label
  change and the email popup's title appear "at once" on typing. Combined with the sheet
  geometry above, plan it as type, close, reveal, and hold the reveal long enough to read.
- **The home hero is the worst thing to open on.** In the preview it paints a plain gradient
  with zero images first and swaps in the carousel later (walk 7, section 3.3), and in
  walk 8 it never rendered at all: 38 seconds with no unsaved changes and the hero was a
  flat blue panel, while the panel above it read "6 showcase slides" and the live page
  rendered all six. Open on a section that is not collection-backed.
- **Site tiles show initials, not screenshots.** `data-testid="site-tile-initials"`, letters
  on a blue gradient, zero `<img>`, with no caption explaining why (walk 7 check 7, walk 2).
  A screenshot only appears after the daily sweep, which runs at **07:00 UTC**. A dashboard
  hero shot therefore reads as an unfinished account unless the sweep has run since the site
  last changed.
- **The assistant FAB is in almost every frame**, sits flush on the tab bar with zero gap
  centred over one tab, covers one Settings toggle at any scroll position, and paints above
  the open menu (walk 2, Polish). Frame around it or accept it; it is not a fault.
- **Text truncation at 390 is systemic**: "Search orders (n", "Userna…", "Managed by your
  identity pr…", "Where you land when you open t…". Avoid lingering close-ups on those rows.
- **Content rows carry raw scope strings** such as `site:vivreal-relaunch-20260...` plus a
  grey "Collection" badge on every row (walk 2 C6). That is the most jargon-dense screen in
  the app; film it wide and moving, never as a held frame.
- **The delivery checker answers for real inside the preview** and its copy is honest: "Yes,
  we deliver to 37659. About 14 miles away. Contact us for a quote. This is an estimate. We
  confirm the cost when we take your order." (walk 7 check 5). One of the best ten-second
  shots available that needs no save.
- **The floating-button panel is the best panel in the product** (walk 8 task 4): button
  text, link, icon, position, and tapping the button in the preview opens the real form
  carrying "Messages sent from this panel in the preview are not delivered." Honest small
  print in frame is a feature, not a blemish.
- Also strong on camera and proven by walk 8, section 7: the thirteen-row site-wide settings
  list, the Looks presets ("Warm & Welcoming: Soft, rounded, inviting. Great fit for
  bakeries, cafes, and florists."), the search-result preview in Page settings with live
  counts, the photo panel with its reorder arrows, and the unsaved-changes bar that names
  the surface ("Unsaved changes in Footer").

**Newly true since the 2026-09-08 release, and each one worth a beat.**

- **"Reorder it and watch the page change" is honest now, and it would have lied a week ago.**
  Until this release the same four items came out in three different orders in the editor list,
  the preview and the published page (walk 8, 4.5; walk 7, section 4). The fix sorts on
  `objectValue.order` then `_id` in the public API, the CMS and the preview together, and the
  two surfaces were confirmed on the production cluster to return an identical sequence
  (`one-release-per-repo.md`, the ordering fix). Live proof: the Migrate page went from
  `2, 0, 3, 1` to `0, 1, 2, 3`, so a visitor is no longer told the site gets built before they
  send their address (`release-2-runbook.md`, "Verified live"). **The control is still an Order
  number per item plus SORT ITEMS, not a drag handle**, and SORT ITEMS now says so in its own
  words: "Original order leaves your items as they come back, which is not an order you set.
  Give each item an Order number and this list gains an option to use it." (walk 10, 4.1). Film
  the number and the result. Never film a drag.
- **The showcase images on `/product/websites` resolve.** Every slide used to be a broken image
  and the page fired an `[object Object]` request every 2.6 seconds. Live now: zero of those,
  zero `127.0.0.1` references, and all five photos serving on valid signed addresses
  (`release-2-runbook.md`, "Verified live"). The page was unfilmable and is now only slow, and
  walk 7's "never settled inside 30 s" has not been re-measured, so probe the settle.
- **Version history is a real beat.** It opens on "Site Version History (49 versions)", v49
  reads "No differences detected", v48 reads "SocialLinks Changed" and carries a working "View
  raw JSON diff", each version fetched on demand as you open it (walk 10 take 2 #2). Never press
  Revert.
- **The footer social panel survives being used.** Its summary now reads "Social & newsletter:
  4 social, newsletter off" over the four real URLs, and walk 8's exact destroying tap took the
  preview footer from 30 links to 31 with all four socials intact (walk 10 take 2 #1). See the
  save caveat under the unsafe table.
- **Campaigns renders**: the People/Campaigns switcher on the Subscribers screen, then "Where
  your emails come from / Vivreal <vivreal@campaigns.vivreal.io>", Drafts, Sent, and "No
  campaigns yet" (walk 10 take 2 #3). Good for one establishing shot of a product area that did
  not exist for any user a day ago. **The send flow is not filmable. See the unsafe table.**

### Timings, because they set shot length

Publishing is not instant and it is not consistent. **Plan for the slow end and cut to
length; never plan a beat around the fast case.**

| What | Measured | Source |
|---|---|---|
| Tile tap to a usable Studio | about 1 second, warm | walk 5 P22 |
| **Direct `goto` of the Studio URL** | **hung over 30 minutes** in one browser while the tile path worked | walk 5 P22 |
| Preview first paint after a tile tap | 2.1 s once, **blank for over 2 minutes** once (an aborted `preview-shell` request, never retried; a reload filled it in 10 s) | walk 4 P13 |
| Launch splash | 328 ms to `/app/launch`, 2719 ms on to `/app/dash` warm, about 5 s cold | walk 2 C20 |
| Preview page settle | most pages stable within 5 s; `/product/websites` **never settled inside 30 s** | walk 7, 3.1 and 5.1 |
| Save to live page, small edit | **18 s**, 21 s, 47 s, 49 s, **162 s** | walks 4, 5, 6 |
| Save to live, the footer socials panel | **47 s** to both `next.vivreal.io` and `vivreal.io` | walk 10 take 2 #1 |
| Save to live page, new block | **3 min 32 s** | walk 4 C20 |
| New content item to its live detail page | 78 s and 79 s, with a 404 still served at 48 s | walk 4 |
| Page delete to a live 404 | 11 s, 23 s, 33 s | walks 4, 5 |
| A saved change reaching **all** pages | not uniform: one page carried it while the home page still did not, **more than 10 minutes later** | walk 8, section 8 |

The cause is structural, not a bug to wait out: customer sites revalidate on a 300 second
window behind a CDN (preview-parity-audit E1). **Nothing on screen tells the owner a change
is on its way**, so a shot cutting straight from "Saved" to the live page is a lie about
timing unless the cut hides a real wait. Two honest options: shoot the save and the live
page as separate segments and let the edit carry the gap, or hold on the confirmation toast
and cut away.

**Reliability:** the dashboard tile is the reliable route into the Studio. A direct URL is
not. Click the tile inside a recorded segment, which is what "shoot like a user" wants
anyway.

### What the 2026-09-10 release changed for a shoot

The help centre shipped: **renderer 1.71.1**, portal **v0.20.0**, Templates `stable`
`a7d8104`. `help.vivreal.io` is now a 71-page site with a working search, and three
contrast defects were fixed across the fleet. Walk 11 (2026-09-10) is the pass that
measured it. **Where walk 11 disagrees with walk 10, walk 11 wins.**

**New and worth a beat**

- **help.vivreal.io is filmable end to end.** Dark search hero, typeahead firing at
  character 3 over all 60 articles, a real `/search` results page, a derived contents rail
  on every article, and an A to Z index at `/all-articles` that finally shows all 60.
  Verified live at 71/71 pages: no non-200, no page without a hero, no dead contents link.
- **The Home site tile for a brand-new site gets a real preview within a day.** Vivreal
  Help had one. Still never caption a tile as a picture of the site: **the capture includes
  the site's own cookie banner** (walk 11 #2).

**New refusals**

| Surface | What happens | Filmable? |
|---|---|---|
| **Sales, on the Vivreal group** | "We could not load your numbers. Nothing has changed with your shop. Tap Refresh in a moment to try again." Measured: the page makes **no commerce request at all**, and the Refresh it points at fires **zero** fetches and leaves the same message. Square IS connected on this group, so it is not a tidy empty state either. The screen is wrong about what happened and offers a control that does nothing (walk 11 #3) | **No, on this group.** Probe the demo tenant before planning any Sales beat |
| **Content, on the Vivreal group** | **222 lists**, 19 of the first 20 being `<Article> Sections` from the help centre. Our own plumbing (walk 11 #6) | **Film Content on the demo tenant only** |
| **Addresses, on the Vivreal group** | Empty state only, on a group serving two live hostnames (walk 11 #5) | As "how you add one", never "here are your addresses" |
| **The Studio preview's colour, on the page being EDITED** | A dark hero renders **light** in the preview of the selected page: `#eeeff0` with dark type instead of `#0b1220` with white. The same hero on an unselected page is correct, and live is correct. Cause is a type-mirror drift the renderer's CLAUDE.md forbids: `HeroBackground.tone` and `.color` exist in the renderer and **not** in the portal's `src/types/Sites/pageBuilder.ts` (walk 11 #7) | **Film a dark hero on the live site**, or from a page that is not the selected one. Never colour-match off the Studio preview |

**Two things that are noise, not breakage, and will waste your time if nobody says so**

1. **Every portal page logs 8+ console errors**, all Google Ads / DoubleClick blocked by
   the portal's own CSP, and they **re-fire on every route change**. Four tab clicks took
   one console from 7 errors to 61. Expected. Never open devtools on camera without knowing
   this. (It is also a live business problem: Google Ads conversion tracking is silently
   dead while GA4 works.)
2. **The Studio preview and the published page both stream.** Raw HTML and an early
   screenshot show `ComposedPageSkeleton`, not content: a title placeholder and grey
   boxes that read exactly like a broken page. **Wait for the real node before you shoot or
   measure.** This fooled the walk three times in one day. Poll for a content selector,
   then wait again, then capture.

### RE-WALKED 2026-09-29 against deployed `stable` v0.29.1 (P4-T0). SUPERSEDED by the 2026-10-02 section.

**Everything below the next heading is the 2026-09-08 list and it PRE-DATES the restyle.** It was
written before the portal restyle, before the six-tab manage shell was deleted (2026-09-23),
before the floating AI assistant was removed (2026-09-24), and before X and Google Analytics were
removed from the product entirely. **Treat any 2026-09-08 "do not film" as a question, not an
answer**, which is that list's own stated principle.

Walked signed in as the demo tenant (`vivreal-content-demo`, group Vivreal Content) at **both 1440
and 390**, on the deployed `stable` line, not `main`. Every surface settled before it was read.

**Confirmed GONE from the live portal, at both widths, on all eleven surfaces:** any X or
X (Twitter) channel, Google Analytics, the internal **Feature flags** entry, the deleted six-tab
manage shell, and every "coming soon" label. Instagram is present and carries no caveat. The
Channels page shows **Your AI**, which is the surface selling the MCP product.

**Settle times, worst case per surface**, so a held shot is planned rather than hoped for.
Slowest at 1440 is **Addresses at 11.0s**; at 390 the slowest is **Content at 10.5s**. Everything
else lands between 2.2s and 8.9s. **Nothing is instant. Do not plan a held frame inside 11s
without probing that surface again on the day.**

**ONE NEW REFUSAL, and it is visible in any Channels shot.**

| Surface | What happens | Filmable? |
|---|---|---|
| **Channels, the connected-account avatars** | A connected **Facebook** account's avatar is a **broken image** at both widths, every load. Its `scontent-*.xx.fbcdn.net` URL has expired, and `avatarSelfHeal.ts:81` (line at portal `origin/stable` b38d5a57; the file still exists) sets `SELF_HEAL_ENABLED_PROVIDERS` to `['tiktok','linkedIn','instagram']` only, so **Facebook and Meta avatars never refresh** and this cannot heal itself. The file's own comment says the fix is one line here plus a matching Secure-side allowlist. | **Not as a held or close shot** until fixed. A wide pass is survivable; a push-in on the account row is not. |

**A defect found during the walk that is NOT a filming issue**, recorded so it is not lost: a
Google Ads conversion tag (`AW-472935172`) fires on every portal page and is **100% blocked by
CSP**. The policy allows `googletagmanager.com` and `google-analytics.com` but not
`googleads.g.doubleclick.net` or `www.google.com`, so `/rmkt/collect` and `/ccm/collect` are both
refused. Five console errors on every page load, and if Google Ads is running, conversions are
not being recorded. Nothing to do with footage; it needs its own ticket.

**ROWS I DID NOT INDIVIDUALLY VERIFY, and they are NOT cleared.** Stated plainly rather than
carried silently, because a row nobody re-checked is exactly how the last map went stale:
- **The campaigns send flow.** Deliberately not opened. The audience picker reportedly shipped and
  a real campaign reached a real inbox on 2026-09-20, so the old "there is no audience picker"
  row is almost certainly stale, but **the demo tenant's channels are Vivreal's own real
  accounts** and I was not going to press anything that could send. Probe it with someone who can
  safely abort.
- **"Your tabs" at desktop width**, the **Design panel** (recorded as unverified in both
  directions since walk 8), the **Content source picker** (157 options), **Site Version History**,
  and the **site-tile preview images**. Each needs its own probe before a beat is built on it.

---

### MEASURED 2026-09-29, second walk, during the P6 shoot. Newer than the re-walk above.

**Why this section exists at all.** The run that measured these finished, reported, and was then
cancelled before the findings were folded anywhere. Everything below survived only because it
happened to still be in the dispatching session's context, and it had to be hand-copied into the
next brief. **That is the failure this section prevents: a finding is not kept until it is
written here.** See "Keeping what each run learns" at the end of this file.

**The cookie banner has MOVED.** There are zero consent controls on the published demo hosts, but **three of them open their own email popup instead, and it blurs the whole page**: see the third-pass section below. It
now renders **inside the Studio preview iframe**, mid-frame, carrying "we may contact you about
Vivreal". Dismiss it with:
`iframe >> internal:control=enter-frame >> button[aria-label="Close cookie consent"]`

**Studio settle is 16 to 20 seconds** of late re-navigation AFTER the URL changes, plus 7 to 10
seconds to get there. The older map's figure of about a second is wrong by an order of
magnitude. The dashboard tile remains the reliable route in.

**The edit sheet leaves 332px of live preview visible** (sheet at y=384, h=576) and the copy
"The page above changes as you type" is accurate, it does. This RETIRES the older claim that
zero pixels of the site are visible while the sheet is open.

**The announcement bar rotates every 6 seconds.** On a site carrying N messages, an edited line
is on screen for 6s in every 6N, so a held shot needs planning or extra rotation stills. Cobalt
& Crumb, Fernbrook and Marlowe & Kept already ship messages.

**Site-tile preview images are real screenshots from S3**, not generated initials. That was an
unverified row in the re-walk above; it is now cleared.

**Studio verbs, current:** `button[aria-label="Edit page structure"]`, the row
"Your look, your menu and your footer", per-section `Edit <Name>` / `Hide <Name>` /
`Remove <Name>` aria-labels, and the sheet scroller `.flex-1.min-h-0.overflow-y-auto`.

**The announcement bar is the practical edit surface for every kit**, because most per-script
surfaces do not exist as written. Prefer it unless a script's own surface is verified to exist.

**Product surfaces that do NOT exist, so no beat can rest on them:**
- **No single-tap sold-out or mark-as-sold control.** Sold-out is derived renderer-side from a
  content item's status, availability or stock. Two scripts assume a one-tap version.
- **On a site using the stacked-words hero, the hero Subtitle is a DEAD control.** Typing into it renders nothing, in the
  preview or live, because the stacked-words hero treatment never draws a subtitle.
- **The "connected-channels checklist ticking after Save" does not exist.** A Studio Save
  publishes the site and ticks nothing. See the share beat below.

### The share beat, and why the scripts are wrong about it

> **2026-10-14:** `ShareUpdateLauncher.tsx` no longer exists at portal `origin/stable`
> (`src/lib/sites/shareUpdateDraft.ts`, `Studio/LeftRail/ShareCardPreview.tsx` and
> `Universal/SocialSharePicker` remain). Re-probe the share beat before building on this section.

Eight P6 scripts end on a channel checklist that does not exist. **The real screen is
`Vivreal_Portal_Mobile/src/components/Sites/Studio/ShareUpdateLauncher.tsx`, "Share this
update", opened from the Save-All toast.** It lists the group's CONNECTED platforms, and
choosing one opens that platform's real composer pre-filled with the page's share copy.

**STOP AT THE DIALOG. Do not press a destination row.** The 2026-09-29 Fernbrook take pressed the
Facebook row and its manifest records that **the real Facebook composer opened, pre-filled, on a
live Page**. That is one control away from posting to Vivreal's own public account, and nobody
decided it should happen. The dialog itself already shows every destination and what each one
requires, which is the whole content of the beat. **Open it, let it be read, close it.** There is
also `Studio/LeftRail/ShareCardPreview.tsx` and a `Universal/SocialSharePicker`.

Two constraints from that component's own docblock: **Instagram requires media on every post
type and TikTok requires a video**, so neither can be scheduled from a seeded caption alone. A
Facebook `post` has no media requirement and is the only one that can. With no connected
accounts the dialog never opens and the toast hides its action.

### MEASURED 2026-09-29, third pass: re-taking the published-site proof shots.

Five `p6b-*` sessions had their `published-after` clip and stills re-taken after the publish
path was fixed. Everything below was measured during that run, at 540x960, on the deployed
demo sites. Where it contradicts a line above, this wins.

**1. The publish lag is FIXED, and the old reading is SUPERSEDED.** The 2026-09-29 first-pass
note that "a save reaches the portal instantly and the published site not at all, for at least
two hours" was true when written and is not true now: `VR_Client_API` v2.11.5 shipped and all
five origins served their saved announcement on a cache-busted request. **Do not treat this as
permanently settled.** Before any shoot whose payoff is a published page, `curl` the host with
a cache-buster and grep for the exact string. That check costs one second and it is the only
thing that makes a proof shot honest.

**2. A published demo site opens its OWN email popup on a delay, and it CSS-blurs the entire
page behind it.** This is NOT the cookie banner (that one moved inside the Studio preview
iframe; see the second-walk section above). Measured, at 14s after load: cobalt-crumb YES,
fernbrook-gardens YES, marlowe-kept YES, meridian-aesthetics NO, motel-saturn NO. Dismiss it
before the first `startRecord` with `[role=dialog] button[aria-label="Close"]`, scoped to the
dialog. **The failure mode is the reason this is worth a paragraph:** the whole frame comes out
soft, which reads as a bad capture or a scaling bug, and the true cause (a modal you did not
know had opened) is nowhere near where you will look. If a published-site frame is blurry,
open the full still before touching anything else.

**3. `cursor: true` leaves the pointer dot resting wherever it last clicked, for the whole run.**
The overlay starts off screen and only moves on a real pointer event, so a sequence with no
clicks is clean. But one pre-roll click parks a blue dot at that spot, and it sits there through
every recorded segment that follows. **Set `cursor: false` on any sequence whose recorded
segments contain no click**, even when the pre-roll does.

**4. `mergeManifest` DROPS every top-level field the schema does not declare.** It returns
`{...fresh, ...}`, and a fresh split has no `mutated`, no `restored`, no `touchedFields` and no
`note`, so all four are gone the moment you re-split a session. Copy the manifest aside first
and re-apply them. Per entry the rules differ and matter: **`visible` and `pageKey` SURVIVE** (
merge falls back to the prior entry when the fresh one lacks them), **`action` and any
hand-added field do NOT**. So a supersession warning has to live as the FIRST STRING IN
`visible`, not only in `action` or a custom `superseded` key, or the next re-split erases it.

**5. The announcement strip sits inside the site's fixed header**, so it stays pinned at the top
of frame through a scroll. A published-site proof shot can move and keep its evidence on screen
the whole time, which is what lets one clip be both the proof and the B-roll.

**6. The strip rotates every 6.0s and its phase at capture is NOT controllable.** Sampled once a
second for 22s on cobalt-crumb: exactly 6s per message. A fresh `goto` does not give a
predictable phase, because hydration time varies by several seconds. So for an N-message site,
plan **N+1 stills spaced 4000ms**, not 6000ms: a 6s spacing can lock onto the same phase and
return the same line every time, while 4s is coprime enough with the cycle to sweep it. Then
read the strips back off the PNGs and write `visible` from what is actually there, per still.
Cheap way to read them: `ffmpeg` crop the top band of each still and `vstack` them into one
contact sheet, which is one image to look at instead of twenty.

**7. Announcement message counts on the demo sites, 2026-09-29:** motel-saturn 1,
cobalt-crumb 2, fernbrook-gardens 2, meridian-aesthetics 3, marlowe-kept 3 (at
`MAX_ANNOUNCEMENT_MESSAGES`). A one-message site is the easiest proof shot in the set, because
the line never rotates away.

**8. A second recording pass into an existing session folder is the right shape for a targeted
re-take**, and this is how to leave it. New sequence as `sequence-pass2-<what>.json`; the new
pass's offsets end up in `markers.json`, so move them to `markers-pass2.json` and put the
original markers back as `markers.json`, which keeps a plain `footage-split` of the folder
re-cutting the main session and leaving the re-take alone. **Rename the re-take clip**:
`footage-split` numbers clips from 1 within each split, so a one-segment pass produces
`clip-01-...` sitting next to the real `clip-01-` from pass one. Rename it to its true position
and fix `file` in the manifest. Delete the orphan webms from any abandoned attempt; they are
LFS-committed and invisible once `markers.json` stops pointing at them.

**9. A still can be right at 1.5s and wrong about the page.** Meridian Aesthetics' top still
shows a broken-image glyph below the hero that is simply a lazy image which has not painted
yet; the same clip's last frame has it filled in. Check a late frame before calling a missing
image a defect, and say which frame you checked.

**10. `npx tsx -e "<code>"` runs and prints NOTHING in this repo.** It exits 0 with no output,
so it reads as a silent pass. Write the probe to a real `.mts` file and run that instead.

**ROWS THIS RUN DID NOT VERIFY.** No fresh Studio save was made, so the fix is confirmed only
for changes saved earlier on 2026-09-29 and now serving; **whether a save made right now reaches
the origin promptly is still unmeasured**. Nothing in the portal was opened at all: no Studio,
no Channels, no campaigns, no inbox. The renderer contrast regression that would take MOTEL
SATURN's bar to 1.11:1 was UNPUBLISHED at the time of the shoot and is not re-checked here.

### MEASURED 2026-09-30, filming a LIVE CUSTOMER SITE (P6-T0, comedyclub.example).

**Why this one is different from everything above it.** Every other section in this file is about
the portal or about a Vivreal demo site. This run filmed a real customer's published site, signed
out, with no portal auth loaded at all. That shape is going to recur (before-and-after videos), so
the rules it produced are written down rather than rediscovered.

**1. Omit `storageStatePath` entirely for a customer site.** `portal-capture.ts:437` only loads it
when the key is present, so leaving it out gives a genuinely signed-out context. Do not point it at
the demo auth file "just in case": a customer site has no reason to see a Vivreal session, and three
customer groups are sole-admin with restricted keys where any write is a 403 today.

**2. A custom domain has NO Vivreal cookie banner.** Confirmed at both widths, both pages:
`button[aria-label="Close cookie consent"]` is absent. `SiteConsent` is gated to the vivreal.io apex
and its subdomains, so a customer on their own domain never renders it. That is the opposite of the
`*.vivreal.io` rule higher up this file, and it is correct in both places.

**3. The site can open its OWN newsletter modal, and the timing is a few seconds, not fourteen.**
comedyclub.example opens a "Stay Updated" dialog **3.7s** after a home page load. It does
**not** reopen within 100s of being dismissed and it does **not** appear on `/shows`. Dismiss it in
the pre-roll with `[role=dialog] button[aria-label="Close"]`. **It does not blur the page here**
(`getComputedStyle(document.body).filter` is `none`), which is a different shape from the demo
sites' popup recorded in the third-pass section above, so do not assume either behaviour: measure it.
A steady count of 2 blurred elements on both pages is decorative background, not a scrim.

**4. Distinguish a DEAD image from a LAZY one before reporting either.** Both read as
`naturalWidth === 0`. The test that separates them is `img.complete`:
- `complete === true` and `naturalWidth === 0` means the browser fetched it and the decode failed.
  **That tile will be blank on camera no matter how long you wait.**
- `complete === false` means it has not been fetched yet. It fills in once scrolled into view.

On this site 9 tiles read blank on a first pass and only **3** were dead. Reporting all 9 would have
been wrong in the expensive direction.

**5. A pre-scroll of the whole page and back to the top, before the first `startRecord`, is what
makes lazy images safe.** Instant `scroll` steps down the page at roughly one screen each with a
900ms wait, then `y: 0`, then a 4000ms settle. After that only the genuinely dead tiles are blank.
Both P6-T0 sequences do this on every page and it worked at both widths.

**6. `client.vivreal.io/media` answers `400 {"success":false,"data":null,"error":"invalid bucket or
key"}` for any media key containing a parenthesis.** Controlled both directions on 2026-09-30: a key
that certainly does not exist **without** parentheses gets a `302` on to `media.vivreal.io`, and the
**same** nonexistent key **with** parentheses gets the 400. So it is the character, not a missing
object and not an expired signature. `/_next/image` wrapping it returns "Error loading source image".
Filming consequence: a customer whose poster filename carries `(1)` or `(11x17in)` has permanently
blank tiles on camera and there is nothing a capture can do about it. The defect itself belongs to
the dispatcher, not to this file.

**7. Two recording passes into one folder, one per viewport, is the right shape for a both-widths
shoot.** Run pass one, split it, copy `markers.json` aside as `markers-<width>.json`, run pass two,
split again, then **renumber pass two's clips**: `footage-split` numbers from 1 within each split,
so a two-segment second pass lands as `clip-01-` and `clip-02-` beside the real ones. Rename to the
true position and fix `file` in the manifest. Leave `markers.json` as pass one so a plain re-split
of the folder still works.

**8. Settle to `networkidle`, measured 2026-09-30 on this site:** home 9.4s at 1440 and 3.3s at 390,
shows 4.8s at 1440 and 1.5s at 390. The **first** page load of a browser session is the slow one;
the same page is much faster later in the run. Plan the pre-roll for the slow case.

**9. Node cannot `import` a Windows absolute path.** `import { chromium } from 'C:/repos/...'` throws
`ERR_UNSUPPORTED_ESM_URL_SCHEME`. This compounds the `npx tsx -e` trap in the third-pass section
above: write the probe as a `.cjs` file using `require('C:/...')`, or put a `.mts` inside the package
whose `node_modules` you need and run `npx tsx` from there. Two probes were lost to this.

**10. A customer site's own page copy can contain an em dash, and a state record must keep it.**
Two page subtitles here do. The zero-dash rule governs copy this fleet authors; a verbatim record of
someone else's content is data, and silently correcting it would make the before-and-after lie. Say
which file the dashes are in and why they were left.

**11. Content item counts: the link field on `pod_01.collection_objects` is the embedded
`collectionObj {name, refID}`, NOT `collectionGroupId`.** A query on `collectionGroupId` returns a
clean zero for every collection, which reads as an empty site. Control it against
`countDocuments({ groupID })` for the tenant before believing any zero, and against a number the
page prints on screen (here the shows page prints "THE ARCHIVE - 14 PAST SHOWS", matching 14).

**ROWS THIS RUN DID NOT VERIFY.** Nothing in the portal was opened: no Studio, no Channels, no
campaigns. Nothing on any `*.vivreal.io` host was loaded, so the cookie-banner and email-popup
behaviour recorded in the second-walk and third-pass sections above is **not** re-checked by this
run and still stands as written. Only two of this site's six pages were filmed (`home` and `shows`);
`team`, `review`, `privacy` and `terms` were never opened at either width.

### MEASURED 2026-10-02, after the release train. READ THIS FIRST, it is the newest.

Deployed now: portal **v0.30.0**, renderer **1.78.0**, CMS **v2.12.1**, Secure **v2.16.0**, Main
**v2.11.0**, Templates `stable` with all 17 customer sites rebuilt. Several things below
contradict older sections in this file; this one wins.

#### The seventy minutes is GONE, and it was never a cache

A September take recorded a change that **still had not appeared seventy minutes later**, and the
shoot was redone. **There was no wait that would ever have ended.** The site document held every
chrome field twice, the Studio save wrote only the top-level copy, and the client API never
emitted it, so the site fell back to the stale nested mirror permanently. `VR_Client_API` v2.12.0
now emits `TOP_LEVEL_CHROME_FIELDS`, ten fields including `announcement`.

**The real number is seconds, with a ceiling of about 60.** Measured read-only across five hosts,
24 reads: every one `cache-control: private, no-cache, no-store`, `x-cache: Miss from cloudfront`,
no `age`, and `x-nextjs-cache` absent on all 24. Customer sites are fully dynamic, so the CDN
contributes nothing and none of the multi-generation trouble that bites vivreal.io applies here.

**A portal save fires the revalidate webhook. A direct database write does not.**
`updateSiteValues.js` emits `site.updated` onto SQS and Templates' `/api/revalidate` hard
invalidates that site's tag. So a Studio save clears immediately; anything written behind the
product waits out the full data cache. (2026-10-14: that is the app's own `SITE_CACHE_TTL_SECONDS`,
code default 60 in Templates `src/lib/api/client.ts`, and 300 on the four Amplify apps read that day.)

**Do NOT put a stopwatch graphic on screen.** A tag invalidation clears only the instance that
received the webhook, and these run as frozen Lambdas, so a second warm instance can serve the old
copy until its own TTL lapses. Real elapsed time varies run to run, plausibly 5 seconds on one
take and 50 on the next. Shoot Save through the reload as **one unbroken take** and let the
footage carry the real number.

#### What you CANNOT film right now, and it is not an availability problem

**Disconnect, Reconnect, Move posts and Use a different account are unreachable in the portal UI
for everyone.** `ProviderWrapper` computes `currentUserId = authUser?.sub ?? authUser?.username`
and compares it against a Cognito `sub`, but **the login payload never writes `sub`**, so the
owner check can never match. Measured: zero "Account actions" controls on any channel card,
against a positive control proving the cards were on screen.

**Signing out and back in does not fix it.** A brand new UI sign-in still produces a session with
no `sub`. Do not spend a run trying. It is recorded as backlog item 30 and needs a source fix.

The per-connection **approvals switch** is blocked by the same chain (`canSetApprovals: false`,
`currentUserRole` falling to its `member` default). It is shipped and correct; it just does not
render on any session this machine can produce.

#### New surfaces worth shooting, with their preconditions

- **Feed health lines** on the Socials screen. Healthy states film straight away.
- **A frozen channel CAN be manufactured**, and any older note saying it cannot is wrong. Three
  independent arms produce `frozen` in `lib/integrations/fetchHealth.ts`: a durable failure after
  the last success, a stored `status` of `expired` or `revoked`, or no successful fetch for 7
  days. Faking a date field gives **frozen WITH a date**, which is the richer frame; faking
  `status` gives frozen with no date. These are our own bookkeeping fields, so nothing is revoked
  at the platform and no outbound call is made. Record the prior value, use dotted keys with
  `arrayFilters`, revert in the same run, and prove the revert **from a fresh process**.
- **A live social band is NOT manufacturable today.** The fleet holds **zero** synced posts, the
  only social-bound section has no content source selected, and its `displayAs` is `feed`, which
  the social predicate refuses. Staging it needs four writes including a site-config change and a
  publish, putting invented posts on a customer-facing page. Do not.

#### What renderer 1.78.0 changed inside the frame

- **An integration-bound section with zero items now renders NOTHING.** No section element, no
  heading. Any older still showing an empty-state section heading is **impossible to reproduce**.
  This is the least obvious staleness class in the library.
- **The social layout picker offers five options**, not the ten before it or the seven in the
  retired hand-written list: `media-mosaic`, `photo-cluster`, `slideshow`, `social-panel`,
  `spotlight-panel`. It renders **six** when the current binding holds an ineligible value,
  because the picker always re-offers what is already set. The same picker on a **non-social**
  section offers 18 or 19, so confirm which picker you are photographing.
- **Missing-image fallbacks changed.** `ShowsPage` and `TeamPage` dropped the `/logo.png` fallback
  for `MediaPlaceholder` and `PersonAvatar`. Every show with no poster and every team member with
  no photo looks different from any older still.
- **The broken-logo defect is FIXED.** Sites whose business name contains an ampersand served an
  invalid-XML SVG and photographed as a broken image icon. Verified 2026-10-02: all three parse as
  valid XML. **Older stills still show the break**, so a reviewer looking at them will report a
  live bug that is not live.

#### Announcement bar constraints, measured across all twelve demo sites

- **`MAX_ANNOUNCEMENT_MESSAGES = 3`.** The Add button only renders below that, so a site already
  at three has no Add button and the beat must edit a message **in place** instead.
- **Save is disabled while a sheet is open.** Close the sheet before the Save beat.
- **The message text input has no `aria-label`**, only a placeholder, so it must be selected
  positionally inside the Messages group. The link picker and the delete control do have labels
  (`Message N link`, `Remove message N`).
- **Four sites open an email popup that blurs the whole page** on first load. It is exactly
  `emailPopup.enabled`, so read it rather than remembering which sites did it last time.

#### Read hostnames, never derive them

**An Amplify app name is not its hostname.** `butter-bloom` serves `sunrise-bakery.vivreal.io`.
An agent reported three live demo sites as NXDOMAIN because it built hostnames from business names
and dropped the hyphens, and its control (a different site returning 200) proved the probe worked
while the derivation was the broken step. Read `ListDomainAssociations`.

**A control has to exercise the step you are unsure of**, not the step you are already confident
in, because the confident step is the one you can most easily build a control for.

#### Dashes: sweep the CLASS, not two codepoints

The brand rule names em and en dashes. Its intent is that nothing renders as a horizontal line
where a comma or a period belongs, so sweep the **class**: U+2014, U+2013, U+2212, U+2010,
U+2011, U+2015 and the fullwidth forms, plus each as a named, decimal and hex entity. Prove the
sweep with a control containing **one of each**; a control carrying only an em dash certifies a
sweep that finds only em dashes.

**But a UI glyph is not a dash, and a widened sweep WILL report one.** A U+2212 found in what
looked like a headline turned out to be the accordion's expand and collapse glyph, `isOpen ?
minus : plus`, inside an `aria-hidden` span. The renderer's own `voice-dash-guard.test.ts`
already includes U+2212 in its DASH class and already names the exception: *"Standalone glyph
placeholders... Typography, not copy."* **Tag-stripping is what created the false sentence**, by
concatenating a heading, a button icon and a question into one line. The tell was that the same
`label <dash> text` shape appeared across **four unrelated kits**, which is a component signature,
not authored copy. Before reporting a dash, exclude `aria-hidden` glyphs and check whether the
owning repo already has a guard naming an excluded class.

Also: the "7 dash baseline" in served HTML is **not a constant**. Eleven pages served 7 and one
served 20, all inside renderer CSS comments. **Strip style and script blocks, expect zero**, and
prove the strip both ways: a planted visible dash must survive it, a planted CSS one must not.

#### Prove every revert, from a separate read

A September manifest recorded `"restored": false` and nobody read it, so a line typed for a video
sat on a public demo site for **two days**. A revert recorded as not done is worse than one never
attempted, because the record looks complete. Re-read from a fresh query, never trust
`modifiedCount`, and state the revert in the manifest as a measured fact.

### MEASURED 2026-10-02, shooting the twelve-site P6 round. Newest of all.

Twelve sessions, 108 clips, 272 stills, against deployed portal **v0.30.0** (`origin/stable`,
tip `7bda7c2e`). Every line below cost something to learn.

#### The PWA install modal is BACK, and its stored dismissal expires

The older note said walks 5, 6 and 8 recorded it never appearing, because
`dev/refresh-auth-state.ts` bakes the dismissal in. **It appeared on every run today.**
`localStorage.viv_pwa_prompt_dismissed_at` was present and set to 2026-09-28, and the modal
rendered anyway, so the dismissal has a lifetime of a few days rather than being permanent.

It is a full-screen `z-[9999]` overlay that **eats every click on the dashboard**, which is how it
announces itself: not as a visible modal in your frame but as a tile click that retries for 30
seconds and times out. It appears somewhere between 8 and 19 seconds after the dash load, so a
fixed `wait ms` races it. Put `{"action":"wait","selector":"button:has-text(\"Not now\")"}` then a
click in EVERY pre-roll.

#### Studio selectors and state, v0.30.0

- **The Save button's aria-label is state-dependent, and this is the one that will catch you.**
  Clean, it is `Save. Everything here is already on your site.`; dirty, it is
  `Save, and put these changes on your site`. A sequence that waits on the dirty label before
  making an edit hangs forever.
- **The header Save is NOT disabled while the edit sheet is open** in v0.30.0, which retires the
  older note. Close the sheet anyway: with the sheet open there are TWO buttons carrying the same
  label (header and sheet footer) and the selector is ambiguous; with it closed there is exactly one.
- Announcement route: `button[aria-label="Edit page structure"]`, then
  `[role=dialog] >> text="Your look, your menu and your footer"`, then
  `[role=dialog] button` filtered on **`A rotating message at the top`**.
- The switch is `[role=dialog] button[role=switch][aria-label="Announcement bar"]`, with
  `aria-checked`. The message input is still `input[placeholder="Free delivery over $40"]` and
  still has no `aria-label`. `Message N link` and `Remove message N` do have labels.
- **On a bar-off site, turning the switch on does NOT create a message row.** The panel says
  "The bar is on. Add a message below and it shows up, here and on your site." and you must press
  **Add message** before any input exists. That is one more tap than the obvious plan.
- The announcement panel's scroller is `[role=dialog] .flex-1.min-h-0.overflow-y-auto`
  (`px-4 py-4` variant, ch 313 / sh ~730). A second `max-h-44` scroller inside it is the
  "Hide on these pages" list, not the panel.
- Sheet geometry confirmed: dialog at y=384 h=576, iframe at y=52, so **332px of live preview
  stays visible** and "The page above changes as you type" is accurate. The preview strip updates
  on every keystroke. The preview is DIMMED by a scrim while the sheet is open.

#### The Saved toast lives 3000ms, and hovering it pauses the timer

`Universal/Snackbar/index.tsx` sets `DURATION = 3000` and `StudioApp.tsx:2160` passes no override,
so **the protected sentence is on screen for three seconds**, which is not long enough to read 23
words. The same codebase already knows this: `Snackbar/apiError.ts:56` sets `duration: 12000` with
the comment "sonner's 3000ms default is too short to notice + click".

For filming, **sonner pauses the dismiss timer while the pointer is over the toast**. Measured: the
action was still present 9.7s after the save. So `hover` the toast action, `wait`, take the still,
then click. Without that hover there is no way to hold the sentence.

#### The Share dialog, and a close selector that cannot misfire

`ShareUpdateLauncher` renders four destination rows (Instagram, Facebook, LinkedIn, TikTok) plus
the shadcn close control. **Close with `[role=dialog] button.absolute.right-2.top-2`**: it matches
exactly 1, and no destination row carries `absolute`, so the selector cannot resolve to one.
Never use a text or index selector here.

#### NEVER `wait selector` on anything whose existence depends on propagation

This cost a whole take. Segment 09 waited on `[data-announcement-strip]` after the live `goto`. On
a site whose bar was OFF the element does not exist until the save propagates, the wait threw at
its 30s default **after the save had already happened**, and a throw anywhere loses `markers.json`
for the entire run. Use timed waits in any post-save segment. Nothing after a mutation may throw.

#### Save to live is seconds to about a minute, and two loads can DISAGREE

Measured across 18 saves: **as fast as under 16s, as slow as 60 to 80s.** Plan for the slow end.

More important, and visible on camera: on `halo-blow-dry-bar` the published page showed the change
on the FIRST load and **not on the next two**. That is the documented frozen-Lambda behaviour, a
tag invalidation clears only the instance that received the webhook, and it means a single
unbroken take can show the change appearing and then seeming to vanish. **Dwell about 75 seconds
before the first live load**, then load two or three times. A 32s dwell failed on 3 of 12 sites; a
75s dwell with three loads landed all three re-takes.

#### The announcement strip's rotation phase on load is NOT controllable

Sampled once a second: the period is 6.0s, but a fresh `goto` can start on message 2. So on a
multi-message site the "payoff" still may legitimately not contain the typed line. **Read the
strips back off the PNGs instead of assuming**: `ffmpeg` crop the top ~150px of each live still and
`vstack` them into one contact sheet, then write `visible` from what is actually there. That sweep
is what found the three failed payoffs above; the manifests would otherwise have claimed all twelve.

#### The email popup: four sites, 6 to 14s, and the dismissal persists

`emailPopup.enabled` is true on exactly one live site plus the demos `cobalt-crumb`, `fernbrook-gardens` and
`marlowe-kept`. Measured appearance: 6.0s, 8.1s, 11.0s, 13.6s after load, **not the 14s recorded
earlier**. Only `marlowe-kept` blurs the page now; the other three do not, which also supersedes
the earlier blanket claim. Dismissing writes `localStorage.vivreal_popup_dismissed_at` and it does
**not** reappear on a reload in the same context, so one pre-roll dismissal covers the whole
session including a post-save reload.

#### The selector denylist only matches QUOTED attribute values

Controlled both directions: `isBlockedSelector('[data-testid="delete-site-button"]')` is **true**
and `isBlockedSelector('[data-testid=delete-site-button]')` is **false**. Playwright accepts both
spellings and the sequences in this repo use the unquoted one throughout, so every one of the 30+
patterns can be bypassed by omitting quotes. Reported to the dispatcher; do not rely on that gate
alone, and write your own dry-run check to catch the destination rows and routes you care about.

#### Two gotchas in the tooling around a shoot

- **A heredoc eats one level of backslashes**, so a `.cjs` written with `<<'EOF'` containing
  `replace(/\\\\/g, '\\')` arrives as a syntax error. Write such files with Python's `open().write()`
  on a raw string, or build the backslash with `String.fromCharCode(92)`.
- **Python cannot open an MSYS path** like `/c/Users/...`. A status check that did so printed
  nothing, and the runner read that as a failed capture when all twelve had in fact succeeded.
  Check statuses with `grep` on the file, or pass a Windows path.

### The 2026-09-08 list, SUPERSEDED. Kept for history, not for planning.

| Surface | What happens | Filmable? |
|---|---|---|
| **The campaigns send flow** | There is **no audience picker at all**. The composer takes its recipients as a prop it cannot change, the control that actually sets them is labelled **"Which site is this from"** and does not render for a single-site group, the confirm dialog shows a count and **never names the list**, an unknown count does not stop the send, and there is no test send and no send to yourself. Four taps from the tab to a real send (walk 9, section 5). The work is deliberately unshipped and the release's standing instruction is "Do not enable the send flow" (`release-2-runbook.md`, "Still open") | **No.** Film the empty state and stop. Do not open the composer, do not press Send |
| **"Your tabs" at desktop width** | The panel renders at 1280, accepts every tap, and **the sidebar ignores it**: Subscribers stayed listed in the sidebar with its own switch off (walk 10 take 1 #3). The panel's own line, "Everything you leave off is still one tap away in the menu behind your business name.", points a desktop viewer at the wrong place | **Phone width only**, until it is fixed. At 390 the same panel is one of the best beats in the product |
| **"Where you land when you open the app"** | The first row of the tab picker reads like an offer and is not one. `launch/page.tsx` hardcodes `router.replace("/dash")`, and a grep of the portal for every plausible setting name returns **zero** while the same grep shape returns 40 for `navFavorites`, so the zero is evidence (walk 10 take 1 #5). Switching Home off still opens on Home, now with no Home tab to get back with | **Do not build a beat around it**, and never caption that row as a setting she can change |
| **Design, fonts and colours** | No font and no palette is marked as the current one (all six cards `aria-checked="false"`), and picking one left the preview unchanged after 6 seconds and after a reload (walk 8 task 2). **Not re-walked since**: walk 10 lists the Design panel by name under "not touched" | **No**, and unverified in either direction. Probe before planning |
| **The Content source picker** | 157 options. Correct, searchable, and unwatchable | Only as fast motion, never held |
| **Site tiles** | Initials on a gradient until the 07:00 UTC sweep runs. The sweep does run: walk 10 saw `deployment.previewImageKey` written onto the walked site between two versions | Yes, but never captioned as a picture of the site |
| Preview of `/showcase` | A section reads "No steps to display yet." because one request answered **500** (walk 7, 5.1). Tenant-specific, and not re-walked at walk 10 | Probe any collection-backed section first |
| `/product/websites` | The broken images and the `[object Object]` storm are **fixed** (`release-2-runbook.md`, "Verified live"). Walk 7's "never settled inside 30 s" has not been re-measured | Probe the settle before planning a held shot |
| The six `compare/*` pages | One extra, heading-less section in the preview versus live (walk 7, 5.2). The ordering fix touched 24 of their bindings, all scoped to one item by title, so a reader sees no change there | Low risk |
| The published site itself | `next.vivreal.io` and `vivreal.io` each returned **500** twice during walk 8. Walk 10 fetched five customer sites one at a time and **all five answered 200** with the right titles | Retry rather than reshoot |

**Fixed on 2026-09-08 and now safe. Named here because the previous list told you not to film
them, and a stale "do not film" costs more than a stale "film".**

| Surface | What it does now | Filmable? |
|---|---|---|
| **Footer, then Social & newsletter** | Read "No social profiles yet." and "0 social" over four live links, and one tap on "+ Add social link" wiped all four out of the preview footer (walk 8, 4.1). Now the summary reads "4 social, newsletter off", the four real URLs are listed inside, and walk 8's exact trigger took the preview footer **30 links to 31 with all four socials intact**. Removing the row returned exactly 30 links and 4 socials, and a save reached both hosts 47 seconds later (walk 10 take 2 #1) | **Yes.** One caveat below |
| **Site Version History** | Opened on "Internal server error" with `sites/versions` answering **502** twice (walk 8 task 8). Now opens on "Site Version History (49 versions)", shows the count, and the comparison works: the list is fetched once, then each version's detail on demand as you open it (walk 10 take 2 #2) | **Yes.** Never press Revert |
| **A section with no list** | Rendered **nothing at all** in the preview, no heading, no placeholder, no warning: walk 8's give-up moment. The editor now says **"Nothing here yet, so this band will not show on the page. Add your first step."** and offers an **"Add a step"** button, and the preview correctly renders nothing, which now matches what the panel said it would do (walk 10, 4.1) | **Yes**, and it is a better beat than the old one: the product explains itself on camera |
| **The order a list comes out in** | Was "No": the same four items came out in **three different orders** in the editor list, the preview and the published page, and the only control was a "Sort items" offering alphabetical or by date (walk 8, 4.5; walk 7, section 4). The three surfaces now agree, the live Migrate page went from `2, 0, 3, 1` to `0, 1, 2, 3`, and SORT ITEMS explains in copy that an Order number on each item is what sets it (`release-2-runbook.md`, "Verified live"; walk 10, 4.1) | **Yes**, as "set the Order number, watch the page change". **There is still no drag handle**, so never film a drag |
| **Campaigns** | The word "Campaigns" did not appear anywhere in the product, for any user, until v0.18.0, because every campaigns call read one level too deep past the axios envelope so the switcher never mounted (walk 9, W9-B1). It now renders on `/app/subscribers` **with zero subscribers**, the exact condition that broke it, showing "Where your emails come from / Vivreal <vivreal@campaigns.vivreal.io>", Drafts, Sent and "No campaigns yet". The Subscribers empty state is honest and its button now reads "Open Studio" (walk 9, walk 10 take 2 #3) | **The empty state, yes. The send flow, no**, see above |
| **Nineteen new block and section types, and a Locations page type** | Ten layouts and nine home-sections joined the picker, which now holds 143 cards; adding "Step medallions" took SECTIONS from 15 to 16. Add Page now offers "One location" (walk 10 take 2 #4) | **Yes** |
| **Richer block settings** | 161 of the 191 keys reaching the generated panel now carry a written control and the other 30 print the reason they have none. Three editors, not one raw config key on screen, and "SMALL LINE ABOVE THE TITLE" where the key is `eyebrow` (walk 10 take 2 #5) | **Yes** |

**One caveat on the footer panel, for the manifest and for nothing on camera.** Saving that
panel makes the footer keep **its own copy** of the social links instead of following the
site-wide list, and it does that even when the save changed nothing. The sentence that warns
about it disappears at the moment it becomes true, and there is no control to reattach it
(walk 10, N1 and section 6). **Nothing looks different on screen, before or after**, so it
changes no shot. It is filed for a fix, and it is a good reason not to save that panel on the
demo tenant just to get a take.

**And one measurement hazard that is not a product fault:** a rapid loop of page fetches
makes healthy pages answer **404** (request throttling). Seven pages 404'd during a fast
sweep and every one returned 200 when asked singly (walk 7, section 1). The same trap runs the
other way too: a cold apex under a fast sweep read as a 504 on a site that was healthy
(`one-release-per-repo.md`, "A scare that was not one"). Pace navigation or you will file a
phantom outage mid-shoot.

### Sheets, scrims, and the Save bar

- **The header Save and Discard are deliberately disabled while an edit sheet is open**, and
  that is correct behaviour, not a bug to shoot around. Measured: `disabled=true`, opacity
  0.5, `pointer-events: none`, while the sheet's own "Save all" is live (walk 4 step 8).
  They sit inside an `aria-hidden` region behind the sheet (walk 6). **A shot showing a
  greyed Save beside an open panel will read as broken unless that is the point.** Film the
  save with the sheet closed, or film the sheet's own Save all.
- This was worse before: walk 3 B5 recorded a Save that looked enabled and could not be
  tapped because the scrim ate the press. Fixed in v0.16.1. Seeing that again is a
  regression, not a technique problem.
- **Measure a dialog after its animation settles.** A screenshot or a `boundingBox` taken
  mid-open on a scale transform reads as clipped when the settled layout is exact. Put a
  `wait` after opening any sheet, before the `still`.
- **The unsaved-changes bar names its surface**: "Unsaved changes in Footer", "in Social
  Links", "in Email popup", "in Branding". Good on camera, and a useful probe assertion.
- **"Discard all changes" reliably restores everything.** Walk 8 discarded eight separate
  unsaved edits and every one came back. That is what makes an unsaved edit filmable at all:
  **typing into a panel without saving is not a server mutation**, and the site document's
  `updatedAt` proves it (walks 7 and 8 both verified it unchanged). This does **not** widen
  the authorized-write rule below, which governs saved writes only. Nothing gets saved.
- **That exception is gone as of 2026-09-08.** The footer social panel used to destroy four live
  links on first touch, with only Discard undoing it; it now reads them and survives (walk 10
  take 2 #1). What replaced the hazard is smaller and invisible: a **save** of that panel forks
  the footer's socials off the site-wide list for good (walk 10, N1). Unsaved typing is still
  not a mutation. A save in that one panel now is.
- **A warning bar can be clipped off the top of the screen.** "Save or discard your current
  changes before viewing history" renders at the very top of the page and was cut off at
  390; all the owner saw was a flash of pink (walk 8, section 5). If an action appears to do
  nothing, scroll up before concluding it failed.
- **The assistant sheet has no visible close control**, only a drag handle; a scrim tap
  closes it (walk 2, Polish).
- **Two cookie banners exist and they are different things.** The site's own consent banner
  renders inside the Studio preview and on every `*.vivreal.io` page (see the gotcha above,
  and dismiss with the X, never Reject). The published site does not show it once this
  browser has answered.

### Session and state, before the first frame

- **Tenant: `vivreal-content-demo` only.** Never `justin@vivreal.io`, which resolves to 20
  groups including real customers. filming-hygiene.md is the rule; this is the reminder.
  (2026-10-14: superseded by the agent's "Accounts and owner-approved writes".)
- **Demo tenant site slots are scarce** (9 of 10 used on 2026-08-30; read `get-group-usage`
  on the day rather than this number). Filming a site
  creation end to end burns one permanently. Do not plan a shoot that creates a site without
  asking first.
- **`/app/launch` is a splash that reads as signed out.** It shows a progress state and a
  line about checking your session before routing on to `/app/dash`. Capturing during it
  produces a frame that looks like a login screen. Land on `/app/dash`, wait for the
  greeting line ("Good afternoon, ..."), and only then `startRecord`. That greeting is also
  the cheapest live-session check there is: the walks used it exactly that way.
- **The PWA "Install Vivreal" prompt covers the whole dashboard at mobile widths on first
  load.** `dev/refresh-auth-state.ts` bakes the dismissal into the saved state, and every
  walk since is consistent with that (walks 5, 6 and 8 all recorded that it never appeared).
  A fresh localStorage re-arms it, so after any re-login run the refresh script and keep the
  "Not now" click in the pre-roll anyway.
- **Recent lists and the list cache live in localStorage** (walk 4 B7). What the capture context
  shows is what the saved state carries, not what a human's phone shows, and never purge that
  cache to "fix" a shot: `auth_collections_by_profile` drift is a product finding, not a capture
  problem. **Nav favorites no longer belong on that list.** Walk 2's C9 called them per-browser;
  walk 10 proved they live on the account and are only cached in a cookie the server rewrites
  (take 1 #7). The tab bar therefore follows the filming account between contexts, and clearing
  storage will not reset it. Use "Use the standard tabs".
- **The assistant costs a counted action.** Its header reads "0 / 500 actions" and ticks up
  per question (walk 8). Asking it something on camera is a real, if cheap, tenant write.
  Its one-tap suggestions include write-capable ones ("Add a new product for me"); whether
  they confirm first is **still unverified**. Do not tap them.

### Console and network noise that is not a fault

If a shoot ever films the developer tools, or a probe reads the console, this is the
baseline. None of it is caused by the recording.

- **The Google Ads pixel, blocked by the portal's own CSP, on every page.** Roughly 5 to 20
  errors per page load: `connect-src` blocks plus matching "Fetch API cannot load" for
  `google.com/rmkt/collect`, `google.com/ccm/collect` and `pagead/form-data`, and a
  `script-src` block of `googleads.g.doubleclick.net/pagead/viewthroughconversion`. Present
  in every walk from 2 to 8.
- **`429` from `/app/monitoring`**, the error-reporting tunnel, on most page loads.
- **`401` from `/app/api/proxy/group/get/info`** on `/app/dash`, in walks 4, 5 and 6.
- **CSP `img-src` blocks of `http://127.0.0.1:8798/showcase/backgrounds/*.jpg`**, 257 lines
  in one Studio session through walk 8. **Gone from the live marketing site since the release**:
  the served page now carries zero `127.0.0.1` references and zero `[object Object]` requests
  (`release-2-runbook.md`, "Verified live"), and walk 10's console had neither. If they turn up
  in a Studio session again, that is tenant site data, not a portal defect.
- **74 x `404` on `/app/sites/studio/[object%20Object]`**, new in walk 7: a URL built from an
  object. Harmless on screen, and not seen in walk 10's console.
- **React #418 on `/app/content` and #419 on `/app/sales`**, intermittent (walk 10 saw #418 six
  times and the `group/get/info` 401 once, both unchanged), plus a
  `TypeError: Cannot read properties of undefined (reading 'v')` thrown from inside Microsoft
  Clarity's own tag on the Studio route. Third party, not Vivreal code.
- **A `500` on `collectionObjects/get`** for one collection, which is what empties a real
  section in the preview (walk 7, 5.1). That one **is** visible on screen, so it is a filming
  problem, not just noise.

