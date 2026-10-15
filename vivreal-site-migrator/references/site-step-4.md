# site agent, Step 4: integration provider normalization (I4) and the kit-device catalog

Moved verbatim out of the `site` agent body on 2026-10-14 (skills audit batch 5): it was about 60% of a 239 KB file
that the skill copy loaded into the main thread whole. It is still a REQUIRED step of every `site` run.

## Step 4, Integration provider normalization (I4)

**Meta to granular provider split MUST happen BEFORE `normalizeProvider()`.**

If the source integration uses a unified `meta` identity (representing Facebook-business
or Meta ecosystem), the AGENT must FIRST decide which granular platform(s) apply:
- `facebook` (if the integration covers Facebook Pages/Communities)
- `instagram` (if the integration covers Instagram Business)
- Both as separate bindings (if both are in scope)

Then call `normalizeProvider()` on the already-granular string:

```js
const { normalizeProvider } = require('./src/util/providers');
// Agent decides: split 'meta' → 'facebook' or 'instagram' first
normalizeProvider('Facebook')  → 'facebook'   (lowercases the granular decision)
normalizeProvider('Instagram') → 'instagram'  (lowercases the granular decision)
// Never pass 'meta' to normalizeProvider(), the string 'meta' must never appear in output
```

**Facebook and Instagram are ALWAYS SEPARATE providers.** Never emit `provider: 'meta'`
or `provider: 'Meta'`. The agent makes the split decision first; `normalizeProvider()`
only canonicalizes the granular result (lowercasing, fixing camelCase defects).

Canonical set: `facebook`, `instagram`, `linkedin`, `x`, `tiktok`, `stripe`.

The `provider` value in your binding MUST match a key in `integrations.part.json` OR
the binding is dangling, the assembler will reject it.

**Social feed presentation, `sectionConfig.variant: 'grid'` (opt-in).** An integration
binding with `displayAs: 'feed'` renders a single-column vertical feed by default. When the
SOURCE site presents the band as a compact photo grid (the typical embedded-Instagram
treatment, e.g. Smash Balloon's 4-column square-thumb wall), author
`sectionConfig: { variant: 'grid', ... }` on the feed binding: 2/3/4-column square tiles,
caption on hover, post permalinks open in a new tab. `sort` + `itemLimit` apply to either
presentation. Match the source: grid for embedded photo walls, default feed for actual
chronological feed pages.

**Integration section headers are AUTHORABLE, never ship a raw provider key as a
heading.** Integration bindings accept `title` + `subtitle` (same pair as collection
bindings). Without them the rendered section header falls back to the provider key
(lowercase "instagram"), always author a real heading (e.g. `title: "Follow Along"`,
`subtitle` from the source band's copy). Additionally, a `feed` binding accepts a social
identity header via `sectionConfig`: `profileUrl` (http/https, required to render) +
`handle` (+ optional `followLabel`) → provider glyph, @handle, and a Follow button above
the feed. Author it whenever the source band shows the account identity/follow affordance.

**Universal section-styling knobs (Gate-2 CC round 2, all opt-in, Studio-editable
`sectionConfig` JSON; absent ⇒ legacy rendering byte-identical):**
- **`link-cards` → `sectionConfig.variant: 'tiles'`**, image-backed link tiles (4/3,
  display-font title over a scrim, arrow, hover zoom; image-less items get a tonal
  panel). Use for menu indexes / category hubs where the plain text cards undersell.
  Give tile objects an `image` field when the source (or the demo) warrants it.
- **`gallery` → `sectionConfig.columns: 'auto' | 2 | 3`**, masonry density. `'auto'`
  tracks item count (a 2-image gallery renders two LARGE images, not two thumbnails in a
  4-col masonry). Author `'auto'` on any gallery bound with ≤4 items.
  **`sectionConfig.lightbox: true`**, tiles open an accessible in-page viewer
  (arrows/Esc/captions). Only active when the section has NO detail pages
  (`detailEligible:false`), detail routes always win.
  **`sectionConfig.uniformTiles: true`**, swaps the masonry for a real grid of
  SQUARE-cropped tiles at the same `columns` density. Author it whenever the bound
  items are near-uniform PRODUCT SHOTS (bakery/menu/merch photography): in the
  masonry one odd-aspect image reads as a broken grid (ragged tile heights, the
  A Bakeshop events finding). Keep the masonry (omit the knob) for genuinely
  mixed-aspect editorial galleries (weddings, venues) where ragged is the look.
- **`cards` → `sectionConfig.variant: 'showcase'`**, editorial feature tiles (16/10
  image, display-font name, icon rows for `address`/`phone`, bordered `hours` block,
  "Visit →"). THE treatment for a multi-location band or any small set of rich cards.
- **`cards` → `sectionConfig.variant: 'info-banner'`**, single-item identity band
  (accent rule, display-font name, maps-linked address, tel: phone, hours). When the item
  carries an image the band renders SPLIT, photo beside the info,
  `sectionConfig.imagePosition: 'left' | 'right'` picking the side (default left); an
  image-less item renders the centered text band. Author it with `itemLimit: 1` +
  `showHeader: false` directly under a location page's masthead so the info reads as part
  of the header; >1 item falls through to `showcase`.
- **`editorial-split` rows**, per-item `secondaryCtaLabel`/`secondaryCtaLink` (ghost
  arrow-link beside the outlined primary CTA; use for paired links like two location
  Instagram profiles, never leave bare `<a>`s in the body copy for these) and
  `bodyColumns: 2` (two-column flow for a long bio-length body so the row doesn't tower
  over its image; prefer trimming copy first).
- **`form` → `sectionConfig.contact`**, business-contact panel replacing the scaffold
  badges ("Direct support / Fast replies / Real humans") beside the form:
  `{ heading, intro, address, phone, email, hours, mapEmbedUrl, socials: [{platform,url}] }`.
  On a contact/form page, ALWAYS author this from `businessInfo`/the locations collection
 , the scaffold badges are placeholder copy, not site content.
  **MUST (A Bakeshop round): every `format:'form'` page carries BOTH a
  `displayAs:'form'` binding (default field set name/email required + message; reuse the
  site's `siteRole:'contact'` collection when one exists) AND this `sectionConfig.contact`
  panel.** A form page authored with `collections: []` renders a bare hero, that exact
  defect shipped on abakeshop.com `/pages/contact-us`. A deterministic assemble backstop
  (`backfillFormPages`) now synthesizes the missing pieces and prints a warning naming
  your page, treat that warning as a review finding against this agent's output.
  **MUST (A Bakeshop feedback round): a careers/positions page whose SOURCE embedded an
  application form (`InventorySection.formEmbed`, Shopify formbuilder, POWR, a native
  `<form>`) or invites applications binds the `application-form` collection
  (`displayAs:'form'`, `role:'secondary'`) BELOW the positions list**, schema
  name/email required + phone + `role:select` (options = the captured position titles) +
  message, key `application-form`, `siteRole:'contact'` (distinct key so the contact page
  never reuses it; the Collections agent owns the schema, see collections.md). The
  page's trailing CTA must NOT point at `/contact` as a form stand-in, the A Bakeshop
  defect was the source's `{formbuilder:59486}` application form silently degraded to an
  "Apply Now" → contact-page button. Backstop: `synthesizeApplicationForms` (same
  warning-as-review-finding contract as above).
- **CTA background, `cta.backgroundImage`** (existing vehicle): author a media-backed
  CTA band whenever the source CTA sits on photography, and prefer it on hospitality
  verticals (venue/brewery/bakery) even when the source band is flat, Gate-2 standard.
- **`pricing` → `sectionConfig.billingToggle: false`**, the pricing layout ships a
  Monthly/Annual billing toggle (annual derived at,20% when not authored). For
  ONE-TIME price lists (venue packages, cake tiers, class fees, anything that is not
  a subscription) ALWAYS author `billingToggle: false`: the toggle hides and the base
  price renders untouched. Tiers without a `ctaLabel` render no per-tier button.
- **`cards` → `sectionConfig.filterField: '<rawField>'`**, client-side filter chips
  derived from the DISTINCT values of one object field (first-appearance order,
  "All" leads, label via `filterAllLabel`). Author it whenever the source filters a
  grouped set in place (a team by location/department, products by line, projects by
  year). Fewer than two distinct values renders no chips.
- **`carousel` → `sectionConfig.variant: 'promo'`**, full-band editorial promo
  slides (display title + description + pill CTA left, image right), one at a time
  with auto-advance (`interval` ms, default 7000) and dot indicators. Per-item
  `background` (any CSS color) themes each slide's band; text/CTA colors derive via
  the contrast guards. THE treatment for a rotating promo band (seasonal features,
  book launches, collab announcements), prefer it over the scroll carousel when the
  source shows one full-width promo at a time. Items may carry `eyebrow`,
  `ctaLabel`/`ctaLink`.
- **`promo` carrier collections (1-row, from `intent:'promo'` sections) bind a
  STYLED BAND, never prose.** The Collections agent emits a single-row carrier
  (`promo-<page>-<subject>`, canonical fields `eyebrow`+`kicker` mirror, `title`,
  `body`, `image`, `linkLabel`/`linkHref`) for every single-subject promotional
  band (event/product spotlight, image+text "visit us" location band). Flattening
  that content into `labels.content` is a DEFECT (the A Bakeshop "Cake Canvas &
  Coffee" regression). Pick the band: `kit.layoutPreferences.promo` wins when set;
  else default `story-panel`; `spotlight-panel` when the image is a product
  cut-out on clean ground; `feature-split` when the source band uses the ghost
  display-headline announcement grammar; `carousel` (variant `'promo'`, above)
  ONLY for a rotating multi-promo. Keep the binding `title` empty when the band's
  own heading lives in the carrier row (story-panel rows are self-headed);
  surface the eyebrow via `sectionConfig.kicker` where the layout supports it.
  Placement mirrors the source order (a promo band after the hero stays after
  the hero; a "visit us" band after a logo-wall stays there).
- **`schedule` format, stop photography + spotlight.** The schedule collection
  SHOULD declare `image: {type:'image'}` (gotcha: media conversion is schema-driven)
 , the Up-Next spotlight then renders the next stop's photo as its media panel.
  Page `labels` carry the config: `defaultView` ('agenda' default, prefer agenda for
  sparse schedules; a 1-2-event month grid reads empty), `timezone` (IANA),
  `showMap`, `icalFeedUrl`, `emptyStateMsg`, `badgeStyle` (`'sticker'` = the identity
  kit's seal-chip status badges, author it whenever the template ships the seal-chip
  device; absent keeps the glyph pills). Author a page-header hero (`statement` /
  `split-statement` / …) on the schedule page like any other page, the hero replaces
  the format's section-header outright (events-cluster walk rule above), and the
  storefront's own internal header stays gated by `showHeader`. The storefront's
  utility text follows the site's `--font-body` (declare `--font-mono` on the theme
  to get the typewriter look, no theme does by default).

**Events → `displayAs: 'calendar'` (preferred over `timeline` for event collections).**
Renders a real month grid (event chips, day-detail panel, prev/next month) with a
day-grouped agenda on mobile. Event objects SHOULD carry machine dates, `startDate`
(ISO 8601, `endDate` optional) alongside the display `date` string; the layout falls back
to `Date.parse(date)` ONLY when the string carries a 4-digit year, else it degrades to a
styled agenda list. `sectionConfig.initialMonth: 'YYYY-MM'` pins the opening month
(deterministic screenshots/demos); default = month of the first upcoming event, else the
latest event's month. `timeline` remains for genuine chronology narratives (history pages).

**Bookable sessions → `displayAs: 'agenda'` (bakery net-new kit #3, pick by the SOURCE's
metaphor).** Classes / workshops / tastings / tours that the source renders as a dated
LIST with per-item price or registration state bind `agenda`, NOT `calendar`, reserve
`calendar` for sources that themselves show a month grid. One object per session:
`title` + `startDate` (ISO, noon-anchored `T12:00:00` for date-only sources, the UTC
date-only parse renders chips a day early in negative-offset timezones) + optional
`endDate`/`price` (text, verbatim)/`status` (free text, "Sold out" et al. render as a
badge AND suppress the CTA)/`description`/`location`/`image`/`link`/`linkLabel`
(default "Register"). Undated sessions are DROPPED by the layout, never bind an
undated collection to `agenda`. `sectionConfig`: `groupBy:'month'|'none'` (default
month headers), `upcomingOnly` (default false, demos show the full authored list),
`emptyStateMsg`.

**Tour/itinerary lists → `agenda` + `sectionConfig.variant:'itinerary'` (musician kit
#1, device #7).** When the source renders TOUR DATES, date · venue · city · a dim
support-act note ("with …"), with per-row ticket links, author the events binding
`displayAs:'agenda'` with `variant:'itinerary'`. Row anatomy: bold local date ·
`venue` · `location` (city) · dim `supportNote`; the ticket CTA is an outlined
SQUARE button (2px border, 0 radius, 134×36, uppercase 12px, the measured Djo
geometry) reading `ticketUrl` (fallback `link`), label `linkLabel` (default
"Tickets"). Status `'Sold Out'` + a `waitlistUrl` on the object SWAPS the CTA to
"Join Waitlist"; other closed states (cancelled/closed/full) suppress the CTA
(base rule). Object fields (must be in the collection `schema{}`): `title`, `date`
(date-only `YYYY-MM-DD` is safe, the variant re-anchors it to local midnight; other
agenda uses still need the noon-anchored ISO), `venue`, `location`, `supportNote`,
`status`, `ticketUrl`, `waitlistUrl`. Under the `encore` motion preset the CTA
hover-inverts black ↔ white (the preset's `invert-fill` language, automatic, no
knob). Default-absent: no `variant` ⇒ the session list, fleet byte-identical.

**Multi-location businesses → `displayAs: 'locations'` (bakery net-new kit #2).** A
structured location directory, do NOT flatten hours into rich text and bind generic
`cards`. One object per location: `title` + `address` + `phone` + `hours` as a **`list`
field of canonical "Days: open-close" strings** ("Mon-Fri: 7:00am-7:00pm",
"Sat-Sun: 8am-6pm", "Mon: Closed", day ranges/lists/"Daily", 12h or 24h times; the
renderer re-parses these for the aligned hours table + client-side open-now pill, and
renders unparseable strings verbatim) + optional `hoursNote`/`image`/`link`/`linkLabel`
(default "Order"). Serialize structured source hours (BentoBox `location.hours[]`,
Google Business, schema.org `openingHoursSpecification`) into that canonical shape.
`sectionConfig`: `timezone` (IANA, set it when all locations share one; open-now is
computed in it), `showOpenNow` (default true), `groupBy` (raw field, e.g. `city` →
group subheads), `columns` ('auto'|2|3).

**Large categorized catalogs → `format: 'catalog'` (bakery net-new kit #1, a PAGE
FORMAT, not a layout).** When a crawled shop/index has a REAL category taxonomy at
scale (≳6 categories, checkout off-site), author the page `format:'catalog'` instead
of `collection-list`: binding 0 = the items collection (`title`/`price` text/
`description`/`image`/`category`/`status` free text, "Available" is suppressed as the
neutral default/`link` external order URL), binding 1 (optional) = the authored
categories collection (`name`/`count`/`image`, counts may evidence a larger source
catalog than the sampled items). The renderer sections the grid per category behind a
sticky category rail (chip strip on mobile). `collection-list` remains correct for
flat or lightly-categorized catalogs (its chips filter one flat grid).
`sectionConfig` (binding 0): `railPosition:'left'|'top'`, `showCounts`, `searchable`,
`initialCategory`, `allLabel`, `emptyStateMsg`.

**Catalog facets + hard per-category scope (A Bakeshop feedback round, renderer
≥1.34.0).** Two MUSTs on every catalog/collection-list binding:
1. **Facets**, when the collection's schema carries facet-shaped fields (2-12 distinct
   values across the objects, the commerce-enriched `size`/`availability`, a `color`,
   any real variant dimension), author `sectionConfig.facets: [{field, label}, …]`
   (Category first on `collection-list`; NEVER include `category` on `catalog` format,
   the rail owns that dimension) plus `filterUi:'sheet'` (the bottom-sheet mobile filter:
   a "Filters (n)" trigger opens grouped facets with Apply/Clear, horizontal-scrolling
   chip rows on mobile are the defect this fixes). The source's own filter sidebar tells
   you which dimensions matter, mirror it, never invent a dimension the data can't back.
2. **Hard scope**, a PER-CATEGORY page (`/collections/<x>`) authors
   `sectionConfig.scope: {field:'category', value:'<exact category value>'}` and NO
   `initialCategory`. `scope` filters server-side and hides that dimension's UI: a
   "Signature Cakes" page shows ONLY signature cakes, ever. `initialCategory` remains
   ONLY for the all-up `/shop` page as a soft default view (rail still exposes every
   category there, that's correct on the all-products page and wrong everywhere else).
   Use YOUR judgment to map slug → category value ("collections/cakes" → "Signature
   Cakes"); the assemble backstop (applyCatalogFacets) only converts exact
   slug↔category matches.

**`scope` beyond the catalog arm (renderer ≥1.45.0, check the capability manifest).**
`shapeItems` honours `sectionConfig.scope:{field,value}` on EVERY collection-bound
layout, not just catalog/collection-list, this is the vehicle for PER-ENTITY pages
over a shared collection: a location page's identity band is
`cards variant:'info-banner' + itemLimit:1 + scope:{field:'slug',value:'<location>'}`
selecting THAT location from the locations collection (med-spa findings §1.2, the
unscoped version selects globally and renders the same entity on all N pages; it
only *looked* right at 2 locations). If the fleet manifest predates 1.45.0, the
workaround stands: carry per-entity identity in each page's hero and leave the
structured band unbound. **Verification rule for every hand-authored scope value
(med-spa §9):** the assemble backstop only auto-converts exact slug↔value matches,
so any scope whose `value` does NOT literally equal the page slug
(`injectables-fillers` → `"Injectables & Fillers"`) is hand-mapped and UNPROVEN
until rendered, list every such binding in your report for a render-time eyeball.

**Color-blocked one-pagers → `format: 'panorama'` (poster-pop kit, musician template
#1, a PAGE FORMAT, not a layout).** When the source home is a ONE-PAGER whose
sections are full-viewport saturated color panels with rotated vertical section
labels and in-page anchor nav (the Woozy home grammar), author the page
`format:'panorama'`. The bindings stay ordinary layout bindings (spotlight-carousel /
media-carousel / product-tiles / agenda / anything); the format's grammar rides each
binding's `sectionConfig`:
- `panelColor` (hex), the panel's full-bleed background. The renderer paints a
  `min-h-svh` accent panel and RESCOPES the text/border tokens per panel (WCAG pick
  against the hex), so author the source's real saturated cycle verbatim.
- `edgeLabel`, the panel's section name, rendered as the panel's `h2`: a rotated
  vertical-rl 36px display-face rail on ALTERNATING edges at desktop (even labeled
  panel = left, author panels in source order and the alternation is automatic) and
  a horizontal centered display heading on mobile. When present, the binding's inline
  generic head is suppressed automatically, do NOT also expect the `title` to render
  (still author `title` for Studio naming).
- `anchor`, the panel's in-page id (`music`/`videos`/…): author it to MATCH the nav's
  hash links (`/#music`). The nav authors the hashes; the format lands them.
The closing capture band = `page.cta` with `emailCapture: true` + `panelColor` (the
band's own full-bleed paint, CTASection renders the square kit-geometry form) +
`anchor` (e.g. `'mailing-list'` for a `/#mailing-list` nav entry). The page hero is
authored normally (the `poster` variant pairs naturally). Detect: hash-anchor navs +
full-viewport color-block sections, any vertical's landing one-pager.

**Cover-first index pages → `format: 'discography'` (poster-pop kit, musician template
#1, a PAGE FORMAT).** When the source's index page is an ART-ONLY edge-tight cover
grid, square covers, tight gutters, NO visible titles, NO hover overlay, each cover
linking straight out (the Woozy /music grammar), author the page
`format:'discography'` with ONE primary binding to the covers collection, NOT
`collection-list` (chip-filtered cards with visible titles). Object fields (must be in
the collection `schema{}`): `title` (req, renders as the cover's img alt, never as
visible text), `coverImage` (media; a missing/data:-URI cover degrades to a
token-toned placeholder square carrying the title), plus the platform URL set
`listenUrl`/`spotifyUrl`/`appleMusicUrl`/`youtubeUrl`. The cover links out via the
chain `listenUrl` → `spotifyUrl` → `appleMusicUrl` → `youtubeUrl` → `link`; beneath
each cover the renderer shows the platform LISTEN-ROW facet with EVERY present link
(no CTA dedup on this format, the row is the explicit per-platform affordance).
Grid: 2-up mobile / 3-up sm / 4-up desktop, ~8px gutters. The page `labels.title`
renders as an sr-only h1 (single-h1 + a11y hold; the visible page is art-only, like
the exemplar). `detailPage: {enabled:false}`, covers link OUT, never to detail
routes. Detect: release/portfolio/archive indexes whose grammar is covers-only, any
vertical's cover wall (book covers, poster archive, label catalog).

**Overlapping photo spreads → `displayAs: 'photo-cluster'` (Coastal Estate kit).** When a
body band pairs prose with 2-3 photos of DIFFERENT sizes that overlap each other, bind
`photo-cluster`, NOT `gallery` (an even grid), `collage-strip` (a drifting band of equal
tilted cards) or `captioned-media` (two-up captioned cards). None of those overlap, and none
pair the media with a text panel. Object fields: `image` (req), `title` (alt text). **Max
THREE photos render**, the offsets are hand-tuned per count, and extras are dropped rather
than stacked. The panel is SECTION-level, not per-item: `sectionConfig.panelTitle` /
`panelBody` / `panelLinkLabel` + `panelLinkHref` (a PAIR) / `mediaSide:'left'|'right'`
(default 'right') / `panelColor`. With no panel copy it renders as a standalone asymmetric
photo band, so it doubles as a media-only device.

**Figures that deserve ceremony → `displayAs: 'pattern-band'` (Coastal Estate kit).** Bind
this rather than `stats` when the numbers are a brand statement on a patterned ground
("40 MAGICAL ACRES · .5 MILES OF COASTLINE"). `stats` renders figures on a FLAT ground and
has no pattern vehicle. Object fields: `value` (req) + `label` (req) + `note`. **Author
`value` VERBATIM**, ".5", "1,200+", it is never coerced to a number, and a figure missing
EITHER value or label is dropped ("40" alone says nothing). `sectionConfig`:
`pattern:'scallop'|'grid'|'wave'` (unknown/absent ⇒ scallop), `patternColor`, `bandColor`.
Motifs are DRAWN as inline SVG data-URIs tinted from theme tokens, asset-free, so there is
no image to source. FULL_BLEED.

**Awards / accreditations → `displayAs: 'accolade-row'` (Coastal Estate kit).** A strip of
awards, certifications, ratings or press honours binds `accolade-row`, NOT `logo-wall`.
`logo-wall` is a PARTNER/press grid, image-first, every mark linked. An accolade is a
CREDENTIAL: it carries an awarding body and a year, frequently has NO artwork, and usually
links nowhere. Object fields: `title` (req, the award), `body` (awarding body), `year`
(text or number), `image` (OPTIONAL, an artwork-less accolade renders a typographic ruled
cartouche, never a broken image), `link`. `sectionConfig`: `align:'left'`, `tone:'quiet'`
(a muted footer strip rather than a feature).

**Virtual-tour pages → `format: 'tour'` (Coastal Estate kit, a PAGE FORMAT).** 54% of pure
wedding venues ship a 360 / walkthrough / Matterport page (`venue-page-taxonomy.md` §2) and
the renderer had no vehicle for one, **`panorama` is the poster-pop kit's colour-blocked
one-pager, not a tour**; do not reach for it. Topology: masthead → an `embed`/`video`
carrier for the tour itself → supporting photo bands. Renders byte-identically to `standard`
(parity contract). Detect: property tours, campus walkthroughs, showroom 360s.

**Word-ladder mastheads → `hero.variant: 'word-ladder'` (Coastal Estate kit).** When the
masthead IS the primary menu, oversized destination words stacked over full-bleed media,
each a link (STAY / DINE / CELEBRATE), author `word-ladder`. Rungs ride
`hero.ladder: [{label, href}]`; **each rung needs BOTH fields**, `'#'` is dead-link guarded,
and a max of 6 render. With no valid rungs the hero DEGRADES to its default treatment rather
than rendering an empty band. `hero.title` still renders as the h1 but SR-ONLY (the ladder is
the visible page), the single-h1 contract holds, so do not also author a section header.

**A MEDIA hero on a non-home page MUST wear a composed variant.** The renderer only composes
a hero block when `hero.variant` is in its `PAGE_HEADER_VARIANTS` (deliberate fleet-safety,
legacy `page.hero` data must never suddenly render). A variantless hero carrying
`background.image`/`heroImage` renders NOWHERE, and the page double-h1s instead: Templates'
transitional title band AND composePage's sr-only page h1 both fire (16 of venue-3's 19 pages
failed single-h1 exactly this way). For a plain full-bleed photo masthead on an interior page,
author a RUNGLESS `word-ladder`, its documented no-rungs degrade IS the classic image
masthead, and the variant keeps the section-header suppression correct.

**Author (or disable) EVERY page's `cta` explicitly on a SIBLING-mode template.** A page the
author script never touches keeps the base capture's CTA, the source venue's photo under
token-mangled rebrand copy (venue-3's gallery shipped "our beautifully restored the Newport
cliff line event venue" over the Phoenix capture's party photo, through a green first pass).
The kit lib's `assertNoInheritedMedia` guard (arm with the picker's `inherited` set) catches
this class mechanically.

**Bottom-docked conversion bars → `utilityDock` (Coastal Estate kit, SITE-LEVEL chrome).**
When the source pins phone / address / a booking CTA to the BOTTOM of the viewport, author
`utilityDock` (top-level, beside `utilityStrip` / `fulfillmentStrip`). Distinct from
`utilityStrip` (rides ABOVE the nav and scrolls with the header) and `fulfillmentStrip` (a
floating pill of ordering channels): this is a full-width fixed bottom BAR of contact facts
plus one action. Fields: `phone` / `address` / `action` (each `{label, href}`), `note`,
`background`. **The action needs an href to render at all**, a label-only action is dropped
rather than shipping a dead CTA, and an hrefless fact renders as plain text. Nothing
authored ⇒ nothing renders.

**Multi-location menus → `navigation.dropdownStyle: 'grouped'` (House & Garden kit).**
When a nav arm opens onto entries organised BY GROUP, cities, regions, departments,
seasons, author `dropdownStyle:'grouped'`. Children become the GROUP HEADINGS and
grandchildren the members, rendered as a static multi-column list with everything visible
at once. Use it INSTEAD of `'panel'` whenever the reader is scanning for their own group:
`panel` is a hover-reveal three-zone editorial panel that only shows the *hovered* child's
grandchildren, so a visitor looking for their city has to hunt. A group heading with no
`path` renders as plain TEXT (never a dead anchor), and a child with no grandchildren
renders as its own one-line group, so mixed data degrades cleanly.
**NOTE, dropdown groups themselves are NOT net-new**: `children`/`grandchildren`,
`dropdownStyle:'cards'|'panel'`, the rich icon+description mega-menu and full a11y have
shipped for a while. Only the `grouped` static-list rendering is new.

**Garden bar → `navigation.layout: 'garden'` (House & Garden kit).** Display-face uppercase
nav arms on generous letterspacing, centred. Pair with the EXISTING knobs rather than
asking for new ones: the squared outlined action is `cta.shape:'square'` +
`cta.style:'outline'`, the top strip is `announcement`, and grouped menus are
`dropdownStyle:'grouped'`. Distinct from `editorial` (sans small-caps arms hugging the
brand) and `boutique` (stacked lockup + centre label + utility note).

**Offset framed-plate body rows → `displayAs: 'plate-rows'` (House & Garden kit).** When
the source's body sections are photos on a WHITE MAT offset over a tinted panel that bleeds
off one page edge, bind `plate-rows`, NOT `feature-split`, `editorial-split` or
`story-panel`. Those are flush image-beside-text rows on a FLAT ground; here the panel
bleeds and the matted plate OVERLAPS it, and that offset is the device. Flattening it to a
split row is exactly how the venues Gate-2 round lost Pippin's photo bands. Object fields:
`title` (req), `body`, `image` (OPTIONAL, an imageless row degrades to a coloured
statement band rather than an empty frame), `linkLabel` + `link` (a PAIR), `panelColor`
(per-row tint). `sectionConfig`: `mediaSide:'left'|'right'` (the FIRST row's plate side,
rows alternate from there; default 'right'), `panelColor` (section default), `matColor`.
FULL_BLEED.

**"Pick a space" choosers → `displayAs: 'capacity-directory'` (House & Garden kit).** When
the source has a row of spaces/rooms/venues whose cards read *photo → locality eyebrow →
underlined name → a capacity line*, bind `capacity-directory`. NOT `locations` (an
operational directory: parsed hours tables, open-now pill, tel: links, wrong job) and NOT
`category-directory` (label INSIDE the photo on a scrim; here the type sits BELOW the photo
so the capacity reads as data, not caption). Object fields: `title` (req, the space name),
`eyebrow` (locality), `capacity`, `image`, `link`. **Author `capacity` VERBATIM**,
"Capacity up to 110 guests", "Seats 110 · stands 160", never as a bare number; the layout
must never guess units or seating mode. `sectionConfig`: `carousel:true` (scroll-snap band
with peeking neighbours; there is deliberately NO autoplay, a chooser must not move under
the reader), `columns`, `align:'left'`.

**Single flanked testimonial bands → `displayAs: 'pressed-quote'` (House & Garden kit).**
One oversized serif quote on a tinted ground held between two bleeding matted plates. NOT
`quote-carousel` (rotating, quote-mark-framed, photo chips), NOT `reviews` (rating cards),
NOT `manifesto` (one landscape photo above a statement). **Only the FIRST bound item
renders**, this is a single-quote device; bind `quote-carousel` if you want rotation.
Object fields: `quote` (req; falls back to the item description), `attribution`.
`sectionConfig`: `flankImages[]` (up to 2, two ⇒ one each side, one ⇒ `flankSide`),
`overlays[]` (decorative botanical illustrations over the plate corners), `groundColor`,
`matColor`. Flanks and overlays are DESKTOP-ONLY and aria-hidden, never put information in
them. FULL_BLEED.

**Venue/space pages → `format: 'spaces'` (House & Garden kit, a PAGE FORMAT).** 54% of
pure wedding venues ship a venue-spaces page (`venue-page-taxonomy.md` §2) and it is where
the booking decision is actually made. Author `format:'spaces'` for a page whose job is
"here are our rooms and what they hold": a `capacity-directory` primary binding + optional
`plate-rows` per-space stories + gallery. Renders byte-identically to `standard` (parity
contract); the format carries the "Spaces / Our Venues" page-type semantics.

**Framed-plate mastheads → `hero.variant: 'framed-plate'` (House & Garden kit).** The page
header form of `plate-rows`: the lockup rides a bleeding tinted panel with a white-matted
photo plate offset over it. Use when the exemplar's masthead is a split of tinted paper +
framed photography (NOT `split-statement`, which is a flat ground with a flush portrait,
and NOT `framed`, which borders the whole hero). Knobs ride `hero`: `plateSide`
('left'|'right', default 'right'), `panelColor`, `matColor`. It joins PAGE_HEADER_VARIANTS,
so the hero OWNS the page header, do not also author a section header, and follow gotcha
J/O on `labels.title`.

**Document / brochure rows → `displayAs: 'brochure-columns'` (venue kit).** A "here are
our documents" band, brochures, spec sheets, price lists, prospectuses, care guides,
binds `brochure-columns`, NOT `feature-list` or `cards`. Those enclose each entry in a
card/panel; this device is deliberately containerless, with columns held apart by a single
hairline vertical rule so the block reads as one printed page. Object fields:
`title` (req), `body`, `linkLabel` + `link`. **`linkLabel` and `link` are a PAIR**, the
layout renders an anchor only when BOTH are present, so a label with no href never ships
as a dead affordance and an href with no label is never invisible. `sectionConfig`:
`columns` (2|3|4, default = item count clamped to 3, the Pippin three-up), `ruleColor`.
Rules are suppressed at mobile width where the columns stack.

**Numbered photo tours → `displayAs: 'photo-band-pager'` (venue kit).** When the source
shows ONE large photo at a time with an explicit numbered index beneath it (01 02 03 …,
active darker + underlined), bind `photo-band-pager`, NOT `slideshow` or `carousel`.
Those are SCROLL devices: a snap strip with partial neighbours visible, navigated by drag
or arrows. This is a one-at-a-time PLATE device navigated by clicking a numeral, and the
numerals are what make a 10-photo estate tour read as a catalogue rather than a reel. Bind
`slideshow` only when the source itself scrolls. Object fields: `image` (req, a plate
with no resolvable photo is DROPPED, and numbering stays contiguous so no phantom numeral
survives), `title` (caption over the plate), `caption` (sub-line). `sectionConfig`:
`height:'tall'|'short'`, `numbered:false` to fall back to dots (use past ~12 plates, where
01-99 becomes noise). FULL_BLEED. Detect: property tours, room types, portfolio plates,
lookbooks, case-study galleries.

**Vendor / project credit lists → `displayAs: 'credit-roll'` (venue kit).** When a page
closes with a ROLE → NAME roll, Photography / Florals / Catering / Planning, or build
team, film crew, issue contributors, product suppliers, bind `credit-roll`, NOT `cards`
or `link-cards`. Both of those are TITLE-first and box each entry: the role (the field a
reader actually scans) gets buried in an eyebrow, and ~8 one-line credits inflate into a
heavy grid. `credit-roll` is role-first, boxless and reads as one typographic block.
Object fields (must be in the collection `schema{}`): `role` (req), `name` (req, falls
back to the item title), `link` (vendor site/IG; '#' dead-link guarded, external links
hardened), `location` (optional quiet third line). **Both `role` and `name` are required
, a credit missing either is DROPPED**, because a dangling role with no vendor reads as a
rendering bug on a live site; author complete pairs or omit the credit.
`sectionConfig`: `columns` (2|3|4, default 3), `align:'left'` to opt out of the centred
film-credits default, `note` for a closing line. On a wedding-venue template this is the
referral engine, venues and vendors trade credit links, so keep the `link` populated.

**Per-event / seasonal rate sheets → `displayAs: 'rate-tiers'`, NEVER `pricing` (venue
kit).** Bind `rate-tiers` whenever the rates vary by SEASON or DAY rather than by a
BILLING PERIOD. `pricing` models a recurring subscription: it hardcodes a Monthly/Annual
segmented toggle, derives an 80% annual rate and badges "-20%", all meaningless on a
rate sheet, and binding it is exactly how the venues Gate-2 round shipped a nonsense
billing toggle on season tiers. The tell: if the source lists several prices per tier
(Saturday / Friday & Sunday / weekday) instead of one price per period, it is a rate card.
Object fields (must be in the collection `schema{}`): `name` (req, the season/package),
`period` (the span, "May, October"), `rates` (LIST, one entry per rate line, authored
`"Label | Value"`; the layout also accepts em-dash / en-dash / colon and renders a
separator-less entry full-width, so partial data degrades rather than breaks), `minimum`
("120 guest minimum"), `note` (per-tier fine print), `highlighted` (boolean).
**Inclusions are SHARED, not per-tier**, put the "every rate includes" list on
`sectionConfig.inclusions[]` (+ `inclusionsTitle`), never duplicated onto each tier; that
shared-vs-repeated distinction is the structural difference from `pricing`'s per-tier
`features`. `sectionConfig.policyNote` carries the fine-print line (the shared slot from
template-identity-kits.md §5.6, do not invent a second one). No per-tier CTA fields: a
rate card's call to action is the page's inquiry CTA. Detect: venue/studio/charter/
workshop-space/equipment-hire/seasonal-lodging rate sheets.

**Lead-capture / "request a date" pages → `format: 'inquiry'` (venue kit, wedding-venue
template #1, a PAGE FORMAT).** When a page's whole job is CAPTURING AN ENQUIRY, a form
is the primary element, the prose exists only to frame it, and the page is reached from a
persistent header CTA ("Inquire", "Request a Date", "Check Availability", "Plan Your
Event"), author `format:'inquiry'`, NOT `form` and NOT `standard`. The distinction from
`format:'form'` is intent, and it has teeth: `TYPE_SPECIFIC.inquiry` is deliberately `[]`
(vs `form: ['form']`), so changing an inquiry page's type NEVER strips the form binding,
on a lead-gen site that binding is the only revenue path. The distinction from `contact`
is audience: 46% of pure wedding venues ship BOTH (`venue-page-taxonomy.md` §2), contact
is "reach a human", inquiry is "start a booking". Topology: masthead hero → optional prose
intro (`labels.content`) → ONE primary form binding carrying
`sectionConfig.formStyle:'inquiry'` → optional secondary media. The look is AUTHORED, not
synthesized, an inquiry page emits blocks byte-identically to the same page typed
`standard` (renderer parity contract, test-pinned). `formStyle:'inquiry'` knobs, all
default-absent: `flankImages[]` (1-2 photo URLs, two ⇒ a flank each side, one ⇒ a single
flank on `flankSide:'left'|'right'`; flanks are DESKTOP-ONLY and decorative, so never put
information in them), `trustLine` (the small-caps reassurance line under the panel, "Typical
reply within two business days"), `panelColor`. Detect: any vertical's booking-intent page,
venue enquiries, studio bookings, catering requests, consultation forms.

**Partner/press/sponsor logo strips → `displayAs: 'logo-wall'` (bakery identity kit).**
A "friends of / as seen in / our partners" strip of linked marks binds `logo-wall`, NOT
generic `cards`. One object per mark: `title` (req, the name; doubles as img alt AND
the typographic-wordmark fallback when no artwork exists) + optional `logo` (image) +
`url` (outbound; a literal '#' is treated as no link). `sectionConfig`:
`monochrome:true` for the grayscale press-wall treatment (color restores on hover).
Detect: inventory `logo-wall` intent; rows of small linked images in a band.

**App-download bands → `displayAs: 'app-band'` (bakery identity kit).** A "get the
app" interstitial with store badges binds `app-band`, the renderer DRAWS the badges
(asset-free), so never model store-badge artwork as images. One object per band
(usually a 1-object collection): `title` (req) + optional `body` (longText) +
`appStoreUrl` + `playStoreUrl` + `image` (product/device art). A band with no store
links still renders the copy. Bands are usually authored headerless
(`showHeader:false`). Detect: repeated App Store / Google Play badge pairs.

**Statement-led home headers → `hero.variant: 'split-statement'` (bakery identity
kit).** When the source home hero is a brand STATEMENT beside a founder/product
portrait with one link (no full-bleed media, no scrim), author
`hero: { variant:'split-statement', title: <the statement>, heroImage: <portrait>,
buttonLabel/buttonLink: <the single link>, eyebrow?/subtitle? }`, NOT `masthead`
(full-bleed carousel) and NOT `minimal`. Degrades: no portrait → full-width
statement; no link fields → no link row.

**Seasonal-product home headers → `hero.variant: 'split-product'` (bakery identity
kit, Levain round).** When the source home hero is a bordered PRODUCT photo card
(often with a corner promo sticker) beside a centered seasonal statement + ONE solid
CTA, with a scrolling trust ticker underneath, author `hero: { variant:
'split-product', title, subtitle?, heroImage: <the product shot>, sticker?: <chip
text>, buttonLabel/buttonLink, trustIndicators: [{icon:'', text}, …] }`, NOT
`masthead` (no full-bleed media/scrim) and NOT `split-statement` (that one is the
brand-statement + portrait treatment with an arrow link). trustIndicators become the
MOVING ticker band (marquee, reduced-motion static); the sticker chip slowly rotates.
Degrades: no image → full-width statement; no sticker/ticker/CTA → each simply
absent.

**Persistent header info bars → site-level `utilityStrip` (bakery identity kit).**
When the source (or the vertical's convention, design-gate approved) runs a slim
persistent INFO bar over the nav, hours + location links + one order/book action,
author site-level `utilityStrip: { text, links:[{label,href}], ctaLabel, ctaHref,
background?, textColor? }`. Distinct from `announcement` (centered rotating PROMO):
utility = static/structured/informational; both may coexist (announcement stacks
above). At least one slot must carry content. Never invent one for a source with no
such bar unless a design gate said to.

**Featured-product shelves → `displayAs: 'product-tiles'` (bakery identity kit, Levain
round).** A "fan favorites / shop our picks" row of product tiles with hand-placed
sticker badges binds `product-tiles`, NOT `cards`/`showcase`. One object per tile:
`title` (req) + `image` + `badge` (the sticker text, e.g. "Best Seller") + `link`
('#' = no anchor) + optional `background` (turns the tile into an ACCENT color panel
w/ WCAG-derived ink, the "order same-day" card) + `linkLabel` (accent-tile action
line, default "Shop Now"). SELF-HEADED: the binding `title` renders INSIDE the layout
as the shelf bar's left label; `sectionConfig.headerLinkLabel`/`headerLinkHref` render
the right-side "Shop All →" link (both required; '#' guarded). Detect: a featured
grid whose source tiles carry badge stickers or a trailing view-all link.

**Press pull-quote bands → `displayAs: 'quote-carousel'` (bakery identity kit, Levain
round).** ONE oversized quote at a time on a tonal panel with round prev/next arrows
and floating photo chips binds `quote-carousel`, NOT `reviews` (the ratings grid) and
NOT `carousel`. One object per quote: `quote` (longText req; falls back to
description/title) + `attribution` + `image` (decor chip; up to three render across
items, desktop-only, aria-hidden). Author the band HEADERLESS (`showHeader:false` /
no title), the quote IS the section. A single-quote collection renders w/o arrows.
Detect: editorial press quotes set in display type; "as seen in" quote rotators.

**Tinted brand-story panels → `displayAs: 'story-panel'` (bakery identity kit, Levain
round).** A single color panel carrying alternating photo+text story rows (tilted
bordered photos, display-type headings) with ONE trailing button binds `story-panel`,
NOT `editorial-split` (un-tinted staggered rows) and NOT `cards`. One object per row:
`title` (req) + `body` (longText; HTML stripped) + `image` + optional `linkLabel`/
`linkHref` (weddings-walk round: a per-row uppercase ARROW link under the body, the
Levain "GET IN TOUCH →"; BOTH required, '#' guarded). Rows alternate photo-left/
photo-right automatically. `sectionConfig`: `background` (the panel color; ink + CTA
derive via WCAG) + `ctaLabel`/`ctaHref` (BOTH required; '#' guarded) +
`panelStyle: 'outlined'` (weddings-walk round: instead of ONE tinted panel, EACH ROW
renders as its own hairline-bordered TRANSPARENT panel riding the page canvas, border
+ type + links all carry the brand ink; `background` is ignored). Author HEADERLESS,
the rows carry their own headings. Detect tinted: a full-color editorial band whose
photos sit rotated/bordered over the tint. Detect outlined: hairline-bordered feature
panels sitting directly on a tinted page canvas (pair with `page.palette` +
`page.background:'surface'` so the rebased surface actually PAINTS the canvas, the
Levain weddings blush).

**Centered-wordmark headers → site-level `navigation.layout: 'logo-center'` +
photographic dropdowns → `navigation.dropdownStyle: 'cards'` (bakery identity kit,
Levain round).** When the source bar runs tabs LEFT / wordmark CENTER / actions RIGHT,
author `navigation.layout:'logo-center'` (absent = the default brand-left bar; never
default it). The left tab row fits **≤5 compact arms** before it reaches the centered
wordmark, fold overflow arms into a related arm's dropdown children instead.
**Logo-center fit guard (governs KIT ADOPTION too).** Even when the kit's `nav.layout`
is `'logo-center'`, adopt it ONLY when the SOURCE bar is genuinely centered-wordmark AND
has ≤5 arms. When the source is brand-LEFT (the common case) or carries >5 arms, KEEP the
default brand-left bar (`navigation.layout: null`), a wide centered wordmark over 6+ left
arms overlaps the tabs. The kit sets the grammar; the client's real nav (source alignment
+ arm count + wordmark width) governs whether logo-center is physically safe. The other
kit nav knobs (`menuStyle`/`dropdownStyle`/`navLinkColor`/`cta`) are unaffected by this
guard. When its dropdown panels are photographic category cards, author
`navigation.dropdownStyle:'cards'` and give the arm's `children` media-descriptor
`image`s (pre-signed contract; imageless children render tinted tiles), the panel
docks full-width under the bar and appends "All <label> →" to the parent's own path.
Both knobs are independent and opt-in.

**Solid color-band headers with per-item accent links → site-level
`navigation.layout: 'band'` (poster-pop kit, musician template #1).** When the source
chrome is a full-width SOLID color band (typically black) whose inline nav items each
carry their OWN accent color, with the wordmark centered and a social-icon row riding
the bar's right side, author `navigation.layout:'band'` +
`navigation.bandColor:'<measured band hex>'` (absent = the dark-chrome `--surface-alt`
token) + `navigation.linkColorCycle:[<the MEASURED per-item accents, in nav order>]`
(arm i renders `cycle[i % length]`; absent = white base ink, never invent a cycle the
source doesn't run). The rail renders the site's AUTHORED socials only, author
`site.footer.socialLinks` (`{platform,url}`; the loader/preview surface them as
top-level `siteData.socialLinks`) and never fabricate platforms the capture didn't
carry. Band shares logo-center's geometry (arms LEFT, brand absolutely CENTERED, the
≤5-arm fit guard above applies identically) and FORCES the dark-chrome bar ink, so it
pairs naturally with `theme.chrome:'dark'`. Band is motion-QUIET by design: arms render
no hover underline/recolor (author it only for band-chrome sources, which are). Mobile
= centered brand + hamburger drawer (fleet convention). Never default any of the three
knobs; all are inert unless `layout` is exactly `'band'`.

**Deep-color centered footers → site-level `footer.variant: 'centerpiece'` (bakery
identity kit, Levain round).** When the source footer is a solid brand-color block
with the mark + newsletter signup + social icons CENTERED between flanking link
columns, author `footer: { variant:'centerpiece', background:<theme hex> }` (+
`footerNewsletter.enabled` for the signup; columns split even/odd into the flanks).
It owns the newsletter/social placements, do not also author
`socialStyle`/`newsletterPlacement`. Text renders inverse: author a background dark
enough to carry it. Absent = today's 3-column grid.

**Image-panel newsletter modals → `emailPopup.variant: 'split-image'` (bakery identity
kit, Levain round).** When the source's email popup pairs a full-height photo panel
with the copy/form column, author `emailPopup: { variant:'split-image', image:{src,
alt} }` alongside the existing copy/trigger/frequency/pages fields. `image.src` is a
READY URL (preview hotlinks the pool; the live loader uploads + inlines a signed URL).
Without a resolvable src the renderer falls back to the centered card, never author
the variant without the image.

**Inner-page headers → `hero.variant: 'statement'` / `'split-statement'` +
`ctaStyle:'button'` / `'billboard'` (Levain inner-page round).** Content pages get a
LIGHT page header, not a photo masthead, reserve `variant:'masthead'` for pages whose
source genuinely runs a full-bleed media hero. Pick by the source's inner-header
shape: a centered display title (often over a small label chip) →
`variant:'statement'` (`eyebrow` renders as the SEAL CHIP, the kit's flat capsule w/ ink ring + soft halo, deliberately NOT a tilted pill; optional
`buttonLabel`/`buttonLink` solid CTA; `trustIndicators` render as the ticker
marquee); a text-beside-photo page hero with a SOLID button →
`variant:'split-statement'` + `ctaStyle:'button'` (+ `heroImage`, optional
`trustIndicators` ticker; default `ctaStyle` keeps the arrow link); a membership/app
billboard (rounded brand-color panel, up to two CTAs, flanking product photos, a
perks row docked below) → `variant:'billboard'` (`secondaryButtonLabel`/`Link` for
the second button; `heroImage` composes both flanks; `trustIndicators` = the STATIC
perks band). All three are PAGE_HEADER_VARIANTS members, composed pages prepend them
automatically.

**Inner-page closers → `cta.variant: 'crossroads'` (Levain inner-page round).** When
the source closes an inner page with a "where next" band (2-4 question columns, each
a heading + arrow link), or when you would otherwise reach for a photo-backed CTA on
an INNER page, author `cta: { enabled:true, variant:'crossroads', background?:<theme
hex>, items:[{heading, label, linkTo} ×2-4] }`. Absent `background` = a light accent
tint; ink follows the light-carries-brand-ink rule. Items need all three fields; the
renderer drops malformed/'#' items and falls back to the flat band when none survive.
Keep `backgroundImage` CTAs for genuinely photographic source bands on landing-style
pages.

**Framed photo collages → `displayAs: 'collage-strip'` (Levain inner-page round).** A
horizontal band of framed, gently tilted photo cards (press clippings, team photos,
awards) that drifts sideways binds `collage-strip`, NOT `gallery` (the grid) and NOT
`logo-wall` (logos). One object per card: `image` (REQ, imageless items are dropped)
+ `title` (optional caption chip) + `link` (optional; '#' guarded). `sectionConfig`:
`drift:false` for a static row, `speed` (px/s, default 24). FULL_BLEED; author
HEADERLESS. Reduced-motion renders the static row automatically. Detect: the
our-story press marquee pattern; scattered framed photos in a scrolling band.

**Thin boutique bars → `navigation.layout: 'editorial'` + `cta.shape:'square'`
(heritage-editorial kit, Poilâne round).** When the source chrome is a THIN light
header, wordmark left, small UPPERCASE letter-spaced tabs, a persistent hairline
under the bar, quiet square buttons, author `navigation.layout:'editorial'` (absent
= the default bar; never default it). REV-2: the editorial bar renders tabs IN FLOW
beside the wordmark with the right cluster hard-right, ONE thin row. When the
source's right cluster is QUIET UPPERCASE TEXT links (the Poilâne OUR ADDRESSES ·
SEARCH · MY ACCOUNT language), author `navigation.actions: [{label, href}, …]` and
set `cta: null`, do NOT box an ORDER button the source doesn't run, and do NOT
author a `utilityStrip` (the exemplar-exact editorial bar has no second row; fold
essential utility links into `actions` instead). A source that DOES box a header
button keeps `cta: { …, shape:'square' }`, label uppercase.

**Editorial statement headers → `hero.variant: 'editorial'` (heritage-editorial kit,
Poilâne round).** When the source's headers are the LEFT-aligned editorial grammar,
a small-caps letter-spaced kicker over a GIANT condensed UPPERCASE display headline,
quiet square outline CTA, asymmetric whitespace, author `hero: { variant:
'editorial', eyebrow: <the kicker>, title, subtitle?, buttonLabel/buttonLink? }`.
With `background.image`/`background.video` it becomes the moody full-bleed masthead
with the lockup pinned BOTTOM-LEFT over a bottom-weighted scrim (the savoir-faire
masthead); without media it sits flat on the surface (the home statement). NOT
`statement` (centered, seal-chip eyebrow, Levain) and NOT `split-statement` (the
statement+portrait split). PAGE_HEADER_VARIANTS member, composed pages prepend it.
Degrades: every line independently optional; a secondary CTA needs the primary.

**Giant-wordmark light footers → `footer.variant: 'wordmark'` (+ `stamp`, `ticker`)
(heritage-editorial kit, Poilâne round).** When the source footer is a LIGHT
multi-column grid closed by a GIANT display-face wordmark across the bottom (often
with a circular seal/stamp beside it, and a repeating service-claims strip docked
above the footer), author `footer: { variant:'wordmark', background?:<light tint>,
stamp?: { text:<ring inscription>, label:<center mark, e.g. "Est. 1948"> },
ticker?: [<service claims the source actually makes>] }`. Text stays DARK (unlike
`centerpiece`); columns/social/newsletter behave exactly as the default grid. The
stamp ring slowly rotates (reduced-motion freezes); the ticker is a marquee
(reduced-motion static). Never invent ticker claims or an est. year, both must be
grounded in the source/persona facts.

**Slim legal-strip footers → `footer.variant: 'band'` (poster-pop kit, musician
round B).** When the source closes on a SLIM single-strip legal band (~50-70px),
social icons one side, small legal cluster (copyright · privacy/terms) the other,
NO brand logo/wordmark, NO link columns, NO visible newsletter (the Woozy periwinkle
band), author `footer: { variant:'band', background:<theme/brand hex, the source
strip color, never hard-coded in the renderer> }`. The strip renders SocialIconRail
(from `site.footer.socialLinks`) left + copyright/privacy/terms/powered-by right;
ink is the WCAG normal-text pick for the authored background (white over an absent/
unparseable background, which falls back to `surface-alt`). It REPLACES the whole
grid, `columns`/`brand`/newsletter are ignored under it. Mobile stacks centered.
Default-off; every other footer arrangement byte-identical.

**Photo category directories → `displayAs: 'category-directory'` (heritage-editorial
kit, Poilâne round).** A grid of full-cell MOODY photo tiles whose job is NAVIGATION
, category/section labels set small-caps bottom-left over the photo, each tile a
link to a page or catalog anchor, binds `category-directory`, NOT `link-cards`
(text-first tiles w/ scrims + display type) and NOT `product-tiles` (a product
shelf). One object per tile: `title` (req, the label) + `image` + `link` ('#'
guarded) + optional `meta` sub-line. SELF-HEADED with the kit's LEFT-aligned
editorial header: the binding `title` renders as the condensed uppercase heading,
`sectionConfig.kicker` as the small-caps line above it; `sectionConfig.columns:
2|3|4` (default 3, the Poilâne 2×3). Detect: "our products / explore" photo grids
that route to category pages or shop anchors.

**Craft/process editorial splits → `displayAs: 'craft-split'` (heritage-editorial
kit, Poilâne round).** Alternating rows of an OVERSIZED condensed-uppercase headline
(+ small-caps kicker) with a NARROW JUSTIFIED prose column beside moody photography,
staggered with asymmetric offsets, bind `craft-split`, NOT `editorial-split`
(venues: sentence-case, wide relaxed prose, symmetric) and NOT `story-panel` (one
tinted panel, tilted photos). One object per row: `title` (req) + `kicker` + `body`
(longText; HTML stripped; renders justified at ~42ch) + `image` + optional
`linkLabel`/`linkHref` quiet arrow link (BOTH required; '#' guarded). Author
HEADERLESS, rows self-head. Detect: savoir-faire/process/method pages; heritage
narratives set in uppercase display type with justified prose columns.

**Ruled editorial indexes → `displayAs: 'index-list'` (heritage-editorial kit,
Poilâne round).** A stack of hairline-ruled rows whose titles are GIANT uppercase
display words (each row a destination, the Poilâne COOK/EXPLORE/GROW/ENGAGE index)
binds `index-list`, NOT `link-cards` (cards) and NOT `jump-links` (the dark anchor
strip). One object per row: `title` (req) + `description` (muted line) + `link`
('#' guarded → static row) + `meta` (small-caps right annotation, "Recipes · 24").
`sectionConfig.numbered:true` renders 01/02/… indexes. Author HEADERLESS or with a
short label. Detect: editorial content-pillar indexes, chaptered nav lists.

**Price anchors + cut-out shelves → `product-tiles` `price` field +
`sectionConfig.tileStyle:'cutout'` (heritage-editorial kit, Poilâne round).** When a
featured shelf shows "From $X" price anchors, author each tile's `price` verbatim
("From $12", never compute). When the source presents products as CUT-OUT shots
floating on flat square-cornered tonal tiles with small-caps names (the Poilâne
"out of the oven" row), author the binding's `sectionConfig.tileStyle:'cutout'`.
Both default-off; the Levain tile is unchanged without them.

**Chromeless floating merch cut-outs → `product-tiles`
`sectionConfig.tileStyle:'float'` (poster-pop kit, musician template #1).** When the
source presents products as CHROMELESS cut-out shots floating directly on the
panel/page background, NO tile base, NO card chrome, NO shadow, with a centered
bold name under the image and a solid order button per item (the Woozy store panel /
Djo shelf grammar), author the binding's `tileStyle:'float'`. NOT `'cutout'`, that
is the Poilâne Polaroid-on-TONAL-tile grammar (a white inset photo panel on a square
tile base); 'float' has no tile at all. Anatomy: object-contain cut-out ·
centered bold body-font name · brand-fill CTA (3px radius, 2px theme-border-token
border, 18px bold, min 89x49) · optional per-item `secondaryLinks:[{label,url}]`
rendered as a pipe-separated link row (dual region stores). The item link reads
link/url then `orderUrl` (float mode only). `sectionConfig.linkLabel` sets the
section-level CTA default ("Order"); per-item `linkLabel` wins. Default-off; every
other tile style is byte-identical without it.

**Product-tile column pin → `sectionConfig.columns` (poster-pop round B).** When the
source's product grid rides a SPECIFIC desktop column count that the tile-count
heuristic would miss (e.g. 11 generous ~370px cut-outs in 3 columns, where ≥4 items
defaults to 4-up), author `columns: 2|3|4` on the `product-tiles` binding
(exact-literal; number or numeric string). Absent ⇒ the count heuristic,
byte-identical. Mobile stays 1-col (2-col only under the pinned 4).

**Catalog Levain re-tone → `sectionConfig.tileStyle:'tinted'` + `badgeStyle:'sticker'`
+ `railPosition:'top'` (Levain inner-page round).** When the source shop presents
category pill tabs across the top and product tiles on tinted card bases with tilted
sticker badges, author the catalog binding's sectionConfig with `railPosition:'top'`
(the pill strip, exists since the net-new kit), `tileStyle:'tinted'` (surface-alt
tile bases) and `badgeStyle:'sticker'` (the tilted brand-ink status chip). The same
`badgeStyle:'sticker'` knob applies to `agenda` session rows. All default-off.

**Catalog Poilâne re-tone → `sectionConfig.tileStyle:'cutout'` (heritage-editorial
kit, Poilâne round B).** When the source shop presents products as CUT-OUT shots
floating on flat SQUARE tonal tiles with small-caps letter-spaced names (the Poilâne
shop tile), author the catalog binding's `tileStyle:'cutout'`. REV-2 anatomy (corrected
against the 1440px exemplar captures): a WHITE inset "Polaroid" photo panel on the
square tonal tile, LEFT-aligned small-caps ink name with a small-caps price line
stacked BENEATH ("FROM $6.19"), and an optional red-outline TAG chip top-left from
the item's `tag` field ("Best Seller" / "Click & Collect", author only what the
source claims). With `badgeStyle:'stamp'`, the stamp CENTERS on the photo panel in
ink. Same value as the `product-tiles` cutout knob (same anatomy there); the menu
tile follows it too. Default-off; `tinted` stays the Levain look.

**Stamp status badges → `sectionConfig.badgeStyle:'stamp'` (heritage-editorial kit,
Poilâne round B).** When the source marks sold-out/limited items with a SQUARE
double-ruled rubber-stamp chip laid opaque over the photo (the Poilâne SOLD OUT
stamp), author `badgeStyle:'stamp'` on the `catalog` or `agenda` binding. Free-text
status renders verbatim inside the stamp, no color map, no tilt. Default-off;
`sticker` stays the Levain tilted chip.

**Panel tab menus → `navigation.dropdownStyle:'panel'` + grandchildren +
`panelLinks` (REV-2, heritage-editorial kit).** When the source's tab menu is a
FULL-WIDTH light panel, the arm's categories as LARGE display links left, the
hovered category's OWN links in a middle column, a photo right (the Poilâne
ESHOP panel), author `dropdownStyle:'panel'`, give the arm's children a
`children` array of their own (the GRANDCHILD tier: `{id,label,href}`, e.g.
"All Breads / Rye / …", rendered ONLY by the panel style), per-child `image`
(the right-zone photo; media/pool URL), and the arm's `panelLinks:
[{label,href}]` for the small utility row beneath the big list (Contact / FAQ).
Editorial-bar sites only; the mobile drawer ignores grandchildren (flagged
adaptation, don't fight it).

**Editorial index heading + side photo → `index-list`
`sectionConfig.heading`/`sideImage` (REV-2).** When the source's index section
carries a display heading block and a FULL-HEIGHT photo beside the rows (the
Poilâne NOURRIR anatomy: title + serif byline + short prose top-left, hairline
rows bottom-left, B&W photo right), author `sectionConfig.heading: { title,
subtitle?, body? }` + `sectionConfig.sideImage: <url>`. Rows confine to the
left column; the photo fills the right. Both absent ⇒ the bare ruled rows.

**Directory header beside the grid → `category-directory`
`sectionConfig.headerPosition:'aside'` + `ctaLabel`/`ctaHref` (REV-2).** When
the source sets the section heading in a LEFT COLUMN beside the photo grid
(Poilâne's OUR PRODUCTS and BEST SELLERS anatomies) rather than above it,
author `headerPosition:'aside'`; `ctaLabel`+`ctaHref` (both required, '#'
guarded) render the square-outline SEE ALL button under the heading block.
A best-sellers mosaic is the SAME binding grammar: portrait photo tiles
linking into the shop, aside header, `columns:3`.

**Combined social CTA → `displayAs: 'social-panel'` (REV-2, net-new).** When the
source closes with a two-zone social band, an ACCENT panel carrying FOLLOW US +
social icons and NEWSLETTER + an underline email capture, beside a labeled
Instagram feed grid (the Poilâne red panel), bind the feed (typically the
Instagram integration binding, one item per photo) as `social-panel`, NOT a
separate story-panel + feed pair. `sectionConfig`: `panelColor` (default site
primary), `socialLinks: [{platform, href}]` (author from the site's real
socials), `followLabel?`, `newsletterLabel?`, `newsletterLead?`,
`newsletterBody?`, `feedLabel` ("Instagram @handle"), `emailPlaceholder?`/
`submitLabel?` (default E-MAIL / OK). Up to 6 photos; EXACTLY 5 staggers the
bottom-middle cell empty (the Poilâne rhythm). The capture posts through the
site's one subscribers list. Author with `sectionConfig.showHeader:false`
(the binding `title` stays non-empty per schema, the panel self-heads).

**Utility headers + card menus → `navigation.layout:'boutique'` +
`menuStyle:'card'` (Ansel kit, bakery template #3).** When the source chrome is
the patisserie utility header, a STACKED brand lockup left (small spaced-caps
line over a large airy display wordmark), a wide-tracked caps city/label line
CENTERED, an address+hours info block right, and ALL nav hidden behind a
hamburger whose menu is a floating white CARD (not a full drawer), author
`navigation.layout:'boutique'` + `menuStyle:'card'` + `brandKicker` (the small
line; the kicker carries the NAME when the lockup is name-over-descriptor:
"BUTTER & BLOOM" over "PATISSERIE") + `centerLabel` (the city line, renders
only when the inline nav row is suppressed, i.e. with card/overlay menu) +
`utilityNote: [<address line>, <hours line>]` (max two). CTA shape stays the
default `'pill'` (the kit's geometry, never author 'square' here). The card
drawer renders bold parents with bullet-dot children, ONE nesting level
(grandchildren ignored, flagged adaptation).

**Gallery scatter heroes → `hero.variant:'collage'` + `hero.collage[]` (Ansel
kit, bakery template #3).** When the source home scatters floating product
CUT-OUTS (with soft drop shadows) around a giant airy light extended-uppercase
wordmark lockup on a white canvas, with pastel offset blocks behind the photos,
author `hero: { variant:'collage', eyebrow?, title, subtitle?, buttonLabel/
buttonLink?, collage: [{ image:<url|descriptor>, tint?:<pastel hex>, alt? }] }`
(≤5 entries, order maps onto the renderer's deterministic scatter slots; dead
images are dropped, so lead with the strongest cut-outs). CTAs render as PILLS
(solid accent primary + quiet outline secondary). No collage entries ⇒ the
lockup renders alone, still valid for airy inner statements. NOT `statement`
(seal-chip, centered, Levain) and NOT `editorial` (left-aligned condensed,
Poilâne). PAGE_HEADER_VARIANTS member, composed pages prepend it.

**Product spotlight monoliths → `displayAs:'spotlight-panel'` (Ansel kit,
net-new).** When the source devotes a FULL-BLEED tinted panel to ONE giant
floating product cut-out with white pill CTA chips floating on/around it (the
dominiqueanselny Cronut block), bind `spotlight-panel`, NOT `banner` (message
band) and NOT `product-tiles` (a shelf). The FIRST imaged object is the
spotlight: `image` (REQ, a true cut-out reads best) + `title` (alt) +
`linkLabel`/`linkHref` (primary chip; BOTH required, '#' guarded) +
`secondaryLabel`/`secondaryHref` (second chip, same contract). `sectionConfig`:
`panelColor` (default a soft primary wash, author the exemplar's pastel when
observed), `minHeight` (default '60vh'). FULL_BLEED; author HEADERLESS, the
panel IS the statement. The cut-out floats (reduced-motion stills it).

**Ghost-headline narrative rows → `displayAs:'feature-split'` (Ansel kit,
net-new).** Alternating rows pairing a GIANT light extended-uppercase headline
at LOW CONTRAST (the ghost display grammar) + uppercase letter-spaced prose +
a pill CTA with photography opposite, bind `feature-split`, NOT `craft-split`
(#2's justified-prose editorial rows) and NOT `editorial-split` (venues'
sentence-case). One object per row: `title` (req) + `kicker` + `body` (longText,
HTML stripped) + `image` + `image2` (staggers a second photo, the gift-box
collage) + `linkLabel`/`linkHref` ('#' guarded) + `panel:'accent'` (opts THAT
row into the solid accent-panel announcement mode, the PAPA D'AMOUR block:
panel-painted text zone, readable ink, cream pill). `sectionConfig`:
`ghostColor?`, `proseStyle:'plain'` (drops the caps prose for long-form),
`panelColor?`. Author HEADERLESS, rows self-head.

**Pinned ordering-channel strips → `site.fulfillmentStrip` (Ansel kit,
net-new chrome).** When the source pins a translucent PILL of ordering-channel
links to the viewport bottom on EVERY page ("PREORDER FOR PICK UP | NATIONWIDE
SHIPPING | …"), author the top-level `fulfillmentStrip: { links: [{label,
href}] }` (+ optional `background`/`textColor`). Author ONLY channels the
source actually offers, never invent fulfillment promises. Distinct from
`utilityStrip` (header info bar) and `floatingCta` (one corner action); do NOT
author both fulfillmentStrip and floatingCta (bottom-edge collision). Deliberate
adaptation: ours stays fixed (the exemplar's docks into the footer), flag it.

**Pastel product cards → `product-tiles` `sectionConfig.tileStyle:'pastel'`
(+ `tileTint`) (Ansel kit).** When the source's product cards are bright photos
on soft pastel tiles with sentence-case names and a full-width PILL "BUY"
button, author the binding's `tileStyle:'pastel'` (+ `tileTint:<hex>` to pin
the tile fill; default a soft primary wash). Per-item `background` becomes that
tile's own pastel (NOT the Levain accent-panel mode); `linkLabel` renames the
pill (default "Buy"). NOT `'cutout'` (Poilâne's square Polaroid tile, small
caps, no button). Default-off; the Levain tile is unchanged without it.

**Ghost inner-page mastheads → `hero.variant:'editorial'` +
`hero.titleStyle:'ghost'` (Ansel kit Round B).** When the source's inner pages
open with a giant LIGHT wide-tracked uppercase display headline at deliberate
LOW CONTRAST flat on the white canvas ("MEET THE CHEF" / "CORPORATE GIFTING",
the ghost-gray page title, content following immediately), author `hero:
{ variant:'editorial', titleStyle:'ghost', title, subtitle?, buttonLabel/
buttonLink? }` and DELETE the page's background media (ghost is flat-only,
titleStyle is ignored over media). The h1 rides the theme's ghost
(`text-secondary`) token; hero CTAs render as FILLED accent pills with the
inversion hover (accent/white ⇄ white/accent, the probed exemplar pill
grammar), so a PDF/order pill can live on the masthead. NOT the Poilâne
editorial masthead (ink title, square outline CTA, that's `titleStyle`
absent). Default-off.

**Studio gallery shop grids → catalog `sectionConfig.tileStyle:'gallery'` +
`titleStyle:'ghost'` + `rail:false` (Ansel kit Round B).** When the source's
shop page is ONE flat editorial grid of studio photos, PORTRAIT product shots
on their own white/pastel grounds (the photo IS the tile: no card base, no
radius, no shadow), a name-left/price-right caption row (name sentence-case
regular ink, price BOLD ink at the same size), NO category rail/tabs, NO
search, NO buy button on the card, and cards that do NOTHING on hover, author
on the catalog binding: `tileStyle:'gallery'` (portrait 4:5 hover-static
card), `rail:false` + `flatAll:true` + `searchable:false` (the flat
unfiltered browse), `columns:4`, and `titleStyle:'ghost'` (the catalog H1 as
the left ghost display masthead; `labels.subtitle` renders as the ink intro
prose; never author `labels.eyebrow` with it, the seal chip is Levain's).
NOT `'tinted'` (Levain card) / NOT `'cutout'` (Poilâne Polaroid). All
default-off; existing catalogs byte-identical.

**Collection-page grammar → catalog `sectionConfig.masthead`/`titleCell`/
`railStyle:'text'`/`flatAll`/`columns:4` + menu `labels.masthead` (REV-2).**
When the source's shop/collection pages run the Poilâne grammar, a PHOTO
masthead strip with only a corner tag on it, a plain text TAB BAR (active tab
underlined in the accent), the page title + intro INSIDE the grid as the first
cells, and a flat continuous product grid in the all view, author on the
catalog binding: `masthead: { image, tagLabel?, tagHref? }` (the strip; the
top-of-page H1 masthead is replaced), `titleCell: true` (H1 + subtitle move
into the grid, span 2, single-H1 preserved), `railStyle:'text'` (with
`railPosition:'top'`), `flatAll: true` (the unfiltered view drops per-category
section headings), `columns: 4` (the 4-up grid). MENU pages take the same read
via `labels.masthead: { image, tagLabel?, tagHref? }`, DELETE the page hero
when authoring it (the strip replaces it; the H1 becomes the display title
block below the rail automatically); menu category sections keep their
headings (flagged adaptation, our menu is one page, their categories are
pages). Breadcrumbs + pagination are skipped adaptations, flag, don't build.

**Editorial split contact → form `sectionConfig.formStyle:'editorial-split'`
(REV-2).** When the source's contact page is HERO-LESS, a display CONTACT US
title + intro + flat editorial form on the left (labels above square fields,
2-col short rows, full-width dark square SEND) and a full-height TONAL aside
pointing at the FAQ on the right, DELETE the page hero and author the form
binding's `sectionConfig`: `formStyle:'editorial-split'`, `heading: { title
(renders as the page H1, author ONLY on hero-less pages), body?, formLabel? }`,
`aside: { title, body, linkLabel?/linkHref? ('#' guarded) }`, plus
`showHeader:false` so the generic section heading yields to the split's own H1.
Drop contact-info/map columns the source doesn't run there (addresses live on
the locations page).

**Boutique contact forms → form `sectionConfig.formStyle:'boutique'` (Ansel
kit Round B).** When the source's contact page runs the boutique anatomy, a
ghost page masthead, quiet inquiry-info columns on the left (GENERAL /
PRESS / JOBS heads + email/phone lines), and the form on a warm CREAM panel
with UNDERLINE-only fields, bold ghost labels, and an accent PILL submit,
author the form binding's `sectionConfig`: `formStyle:'boutique'`,
`info: [{heading, lines:[{text, href?}]}]` (the left columns; omit for a
single-column panel), `panelColor?` (default the theme's surface-alt), plus
`showHeader:false`. The submit hover is the probed BORDER flip (accent →
ink), not the pill inversion. Page hero stays the ghost editorial masthead
(this mode renders no H1 of its own, unlike `'editorial-split'`, which
carries one for hero-less pages). A bottom map binds separately
(`displayAs:'embed'` on a maps-URL collection).

**In-grid editorial promo tile → catalog `sectionConfig.promoTile` (heritage-
editorial kit, Poilâne round B).** When the source shop merchandises INSIDE the
product grid, a photo tile occupying a grid cell ("RECIPE OF THE MOMENT" /
"PRODUCT OF THE MOMENT" with an underlined DISCOVER), author
`promoTile: { section: <category name | 1-based index, default 1>, cell: <1-based
cell position, default 3>, eyebrow?, title (req), image?, linkLabel? + linkHref?
(BOTH required; '#' guarded), span?: 1|2 }`, or an ARRAY of those objects when
the source runs several (Poilâne's all-products view carries BOTH "RECIPE OF THE
MOMENT" and "PRODUCT OF THE MOMENT"). REV-2 anatomy: white display title TOP-LEFT
+ an OUTLINED button (linkLabel) under it over a lightly-veiled photo, no bottom
scrim, no underline link. Imageless ⇒ accent panel with derived ink. Shows ONLY in
the unfiltered+unsearched view; malformed entries drop.
Distinct from `interstitial` (the full-width BAND between category sections,
Levain grammar): a Poilâne-grammar shop merchandises IN the grid, so prefer
`promoTile` there and reserve `interstitial` for band-led shops. `span:2` gives
the one wide cell of a broken editorial grid.

**Catalog page header + mid-catalog banner (corporate-cluster walk).** The catalog
masthead is the page H1 (the format has no hero); `labels.eyebrow` renders above the
title as the kit's seal chip, author it when the source shop leads with a kicker
("Our Cookies"). When the source interleaves a slim promo band BETWEEN category
sections (the Levain shop's sky Cookie-Club banner: copy left, two buttons right,
hairline border), author the catalog binding's
`sectionConfig.interstitial: { after, title, text?, background?, ctas:[{label,href,style?}] }`,
`after` = the category name the band follows (or a 1-based section index; clamps
into range). First CTA renders solid, the rest outline (`style` overrides). The band
only shows in the unfiltered/unsearched view. Malformed/absent ⇒ no band. Category
SECTION ORDER on the page = the authored categories binding's object order, reorder
that collection to merchandise the page (appetizing lead, Merch last, the Levain
order).

**Full-width section band → `sectionConfig.bandColor` (corporate-cluster walk).**
When a composed section must sit on a flat authored color band spanning the full
section, heading INCLUDED (the Levain careers "values cards on the sky band"),
author `bandColor: '<css color>'` on the binding. Distinct from `background` on
purpose: shell `background` stays token-only (`surface`/`surface-alt`/`muted`/
`dark`), and hex `background` still belongs to self-painting panel layouts
(story-panel, quote-carousel `panelColor`), `bandColor` at the shell would
double-paint those, so never author both on one binding. Works with any layout;
cards on `bandColor` = the white-cards-on-color-band device.

**Lead placement on about pages → `sectionConfig.placement:'lead'` (corporate-cluster
walk).** The about format is story-first (prose before bindings). When the analog
LEADS with a visual band before the statement (the Levain careers/our-story photo
strip), author `placement:'lead'` on that binding, it hoists directly under the
page header, above the prose. About-format only; absent = story-first order
unchanged.

**Billboard perks band knobs → `hero.perksBackground`/`perksLabel`/`perksSublabel`
(corporate-cluster walk).** When the analog's membership band is a flat brand color
with a heading lockup (the Levain Cookie-Club sky "Membership Perks / Each month…"
band), author `perksBackground` (hex; absent = the derived ink tint) and the
optional `perksLabel` + `perksSublabel` pair (docked left; perks row flows beside
it). Give each perk a lucide `icon`, same icon contract as the ticker. billboard
variant only.

**Menu chip re-tone → `labels.chipStyle:'brand'` (Levain inner-page round).** Menu
pages on a themed brand (non-neutral palette) should author `labels.chipStyle:
'brand'` so dietary chips + inactive category pills ride the brand tokens instead of
the storefront's hardcoded emerald/gray. Absent = today's palette.

**Menu presentation → `labels.itemStyle:'tiles'` (Levain menu-tiles round).** When the
business SHOWS its food (bakery, patisserie, ice cream, donuts, product photography is
the sales device, the Levain /pages/our-cookies pattern), author `labels.itemStyle:
'tiles'`: each category renders a photo-tile grid (tan `--surface-alt` tile, product
shot, brand-ink title + price, dietary chips) instead of the dotted-leader list. The
item collection carries `image` (base tile shot, REQUIRED for the grid to earn its
keep; do not author tiles when items have no photography) and optionally `images`
(hover gallery: ≥2 urls CYCLE while hovered, exactly 1 swaps full-bleed; ABSENT falls
back to the base shot going full-bleed, so EVERY imaged tile shares the same hover,
only a truly imageless tile stays static; reduced-motion never cycles). A tiles menu
is a CURATED showcase, not an inventory dump, keep it Levain-scale (≤10 per
category); the full list belongs in a menu PDF or the list style. Keep the LIST
(absent knob) for service menus where the text IS the menu, restaurant dinner
menus, catering trays, drink lists.

**Menu tile restyle → `labels.tileStyle:'cutout'` (Poilâne round B, live-extracted
from poilane.com collection cards).** When the kit's grammar is heritage-editorial
(square corners, cut-out product shots on tonal bases, small-caps letter-spaced
names, the Poilâne shop card), author `labels.tileStyle:'cutout'` WITH
`itemStyle:'tiles'`: tiles go square with an object-contain cut-out photo inset,
names render small-caps centered in the INK (the accent stays reserved), the
category rail + dietary chips square up, and the hover becomes the Poilâne photo
SWAP, the photo box crossfades to the alternate `images` shot (no scrim, no
inverse caption, no zoom; items without an authored gallery stay static, because
swapping to the same shot reads as flicker). Same knob vocabulary as the catalog/
product-tiles cutout, pick per page from the source's tile grammar. Absent ⇒ the
Levain tile, byte-identical.

**Menu item detail pages (Levain PDP round).** Tiles link to `/menu/<itemId>`
detail pages by the H1 default (absent `detailPage` = ON; author
`detailPage.enabled:false` to keep tiles inert). For the Levain buy-column
treatment author the menu page's `detailPage`: `sections:['hero','related','cta']`
(drops the generic full-width content section, the description belongs in the
column), `fields.show:['tags','description']` (dietary seal chips + in-column
description), `relatedItems:{enabled,label,limit}` (the "Try Our Other Recipes"
shelf, same-category items). Give items `link` + `ctaLabel` for the solid order
CTA in the buy column (BOTH required, the label is the opt-in). The item's
`images` hover gallery doubles as the detail gallery (thumbnail strip).

**Double perks ticker → `hero.tickerStyle:'double'` (Levain catering round).** When
the source/analog runs a standalone service-perks marquee band under the page hero
(the Levain catering "Baked to Order · Local Delivery · $100 Minimum" double
marquee), author `tickerStyle:'double'` on a `statement`/`split-statement` hero: the
trustIndicators render as TWO stacked rows scrolling opposite directions, second row
rotated. Give each indicator a named lucide `icon` (`'clock'`, `'bike'`, `'store'`,
`'box'`, `'cookie'`, `'utensils'`, `'truck'`, `'bag'`, `'calendar'`, `'gift'`,
`'wheat'`, `'cake'`, `'chef-hat'`, …), unknown strings render as raw text, so emoji
still work. Absent = the single-row marquee. Ticker copy is SERVICE FACTS (delivery,
notice, minimums), never marketing slogans.

**Curated package tiles → `product-tiles` + per-item `eyebrow`/`meta` (Levain
catering round).** When the source curates a handful of occasion-led offers above a
service menu (the Levain catering "Morning Meeting / Lunch Time / Go All Out"
packages), bind a small curated collection (≈4 items, REAL items pulled from the
menu, never invented offers) as `product-tiles` with the package extras: `eyebrow`
(the occasion heading, floats ABOVE the tile), `meta` (the mono serving line,
"Serves 15", lift it from the item's own serves note), `link` + `linkLabel:'Order
Now'` (the tonal-tile action line is linkLabel-gated). The full menu stays below as
the list, the tiles are a shelf, not a replacement.

**Full-bleed photo reel → `slideshow` displayAs (Levain catering round, net-new).**
An edge-to-edge strip of large photos (partial neighbors visible, round brand
arrows, native drag, NO autoplay) for atmosphere/offerings photo bands, the Levain
catering offerings slideshow. One item = one slide; `image` REQUIRED (imageless
items are skipped), `title` = alt text only (never a rendered caption). Author it
headerless (no label). 3-6 photos; don't bind a collection that exists for another
band, give the reel its own small collection.

**FAQ card rows + trailing order CTA → `faq` `sectionConfig.itemStyle:'boxed'` +
`ctaLabel`/`ctaHref` (Levain catering round).** On a themed brand, service-page FAQs
may author `itemStyle:'boxed'` (rounded brand-ink-bordered card rows, the Levain
FAQ look) and a trailing centered solid CTA (`ctaLabel` + `ctaHref`, BOTH required,
'#' guarded) when the page's conversion action should close the FAQ (the Levain
"ORDER NOW" under their catering FAQ). Absent = the flat list, no button.

**FAQ page, author one when the source (or its analog) carries site-wide
Q&As (bakery page-taxonomy round; Levain analog `/pages/faq`).** Shape:
`format:'standard'` + `statement` hero with the title ONLY ('FAQs', the
analog runs no eyebrow/subtitle) + the `faq` binding as primary with
`sectionConfig: { groupBy:'category', defaultOpen:'first' }`, the CATEGORY
accordion (uppercase toggle rows; an open group shows all its Q&As; the
Levain default is all-collapsed, first-open keeps demo stills legible). FAQ
objects carry `category`; answers are longText HTML and SHOULD cross-link the
site's own pages (locations/catering/contact) like the analog does. Every
answer grounds in ALREADY-AUTHORED site facts (hours, notice windows, rails)
, never invent policy. Topic FAQs stay on their pages (catering keeps its
own); the general page cross-points instead of absorbing them. Ends at the
footer (`cta:{enabled:false}`); footer company column carries the link.

**Locations page, author one for any multi-location business (bakery
page-taxonomy round).** A dedicated `/locations` is a must-have for
multi-location sources (bakery-site-standard §2; Levain analog
`/pages/bakeries`), the home band alone buries the directory. Shape:
`format:'standard'` + `statement` hero (eyebrow 'Our Bakeries'/equivalent,
an invitation title) + the `locations` binding as primary with
`sectionConfig: { groupBy:'city', groupFilter:true, timezone:<IANA> }`, the
chip strip (All · <city>…) only renders past one group. Per-location objects
carry `city` (the grouping truth, derive from the ADDRESS, and fix address/
title mismatches rather than shipping a lying group), `link`+`linkLabel`
('Order Now' → the order rail), and the flagship gets `badge` ('The Original ·
Est. <year>', the Levain "Est. 1995" device). End at the footer
(`cta:{enabled:false}`) like the analog. Cross-links: utility-strip +
footer-explore gain the Locations link; the contact page's panel SLIMS to a
pointer once this page exists (never duplicate the 11-entry hours list).

**Contact page, author one (bakery page-taxonomy round).** A dedicated
`/contact` is the single most common page real SMB sites carry (59% of the
91-site bakery ICP survey, `bakery-page-taxonomy.md`) and the #1 template
gap: never leave the contact form buried on another page. Shape: `format:
'standard'` + `statement` hero (eyebrow 'Contact', a response-time promise as
the subtitle) + the `form` binding with its `sectionConfig.contact` panel
(locations/map/socials) as primary, `cta: {enabled:false}` (the Levain
get-in-touch analog ends at the footer, no crossroads). Contact-INTENT
crossroads items on other pages ("Contact Our Team", "Get in Touch") point at
`/contact`, and the footer's company column carries the link (main nav only if
it has arm budget). A form-only page has ZERO collection items by design,
Templates' emptiness guard exempts form-carrying pages (buildPageContext).

**Multi-dimension pricing → `options: [{label, price}]` (Levain catering round,
Justin's variants directive).** NEVER cram a size/price matrix into one price
string (`6” - $42 | 8” - $57 | …`). The platform's variant contract for
collection items is the JL-enrichment shape: `options` carries the tiers
(`[{label:'6”', price:'$42'}, …]`), the scalar `price` becomes the display
`From $42`, and the generic detail hero renders the tiers as the divided
price-list in the buy column. Single-price items stay scalar, no options. Give
the item `link` + `ctaLabel` for the order CTA and keep the binding
detail-eligible so cards route to the item's detail page. (Stripe-backed
products use `usingVariant` + variant-keyed price maps instead, that machinery
is integration-side, not collection-side.)

**Quote band panel color → `sectionConfig.panelColor` on `quote-carousel` (Levain
inner-page round).** When the source's pull-quote band is a DEEP brand-color panel
(white type), author `panelColor:<theme hex>`, the quote/attribution/arrows flip to
white on a dark panel automatically. Absent = the tonal surface-alt panel.

**Per-page mood tint → `page.palette` (existing #7c vehicle, REMEMBER IT for themed
inner pages).** When ONE page carries its own background mood on the source (e.g. a
blush-pink weddings page on a cream site), author the page's `palette: { surface:
<hex>, 'surface-alt': <hex> }` rather than restyling sections individually. The
renderer rebases the tokens for that page's subtree with a WCAG guard.

**Per-location pages → `format: 'location-hub'` (taproom net-new page type).** When a
multi-location source has a dedicated page per location (a taproom, a branch, a clinic,
a shop), type it `location-hub`, NOT `standard`. It renders byte-identically to
`standard` for the same bindings (renderer parity contract), but carries the page-type
semantics (Studio "Location" page type; type-change classification). Author the
canonical binding recipe in this order: the `locations` collection scoped to THE one
location (`itemLimit:1` + a sort/filter that selects it, `cards` +
`variant:'info-banner'`, `showHeader:false`) → menu/link tiles (`link-cards` +
`variant:'tiles'`) → `gallery` → map `embed` → social `feed`. Detect: source pages
whose path or nav labels them as a single named location and whose body composes
identity + menus + media for that location.

**Craft/story pages → `format: 'craft'` (Poilâne-kit net-new page type, bakery
template #2).** When the source has a dedicated craft/process/method/heritage page,
a savoir-faire page, a "how we make it" narrative, an atelier/workshop story, type
it `craft`, NOT `standard` and NOT `about`. It renders byte-identically to
`standard` for the same bindings (renderer parity contract), but carries the
page-type semantics (Studio "Craft / Our Story" page type; type-change
classification). Compose the canonical recipe: an editorial media hero
(`hero.variant:'editorial'` + a moody `background` image) → alternating
`craft-split` rows (kicker + oversized headline + narrow justified prose beside
craft-documentary photography). Detect: pages narrating process steps (milling,
fermentation, firing, shaping), maker/atelier stories, "our craft"/"savoir-faire"
nav labels.

**Person-led bio pages → `format: 'profile'` (Ansel-kit net-new page type,
bakery template #3).** When the source has a dedicated page ABOUT A PERSON,
"meet the chef", a founder/owner biography, a maker profile, type it
`profile`, NOT `about` (which is the company story) and NOT `team` (a grid of
many people). It renders byte-identically to `standard` for the same bindings
(renderer parity contract), but carries the page-type semantics (Studio
"Profile / Meet the Maker" page type; type-change classification). Compose the
canonical recipe: a ghost editorial masthead (`hero.variant:'editorial'` +
`titleStyle:'ghost'`) → an editorial portrait band (a ONE-slide `slideshow`) →
the two-column `longform` bio (one collection item = one prose passage;
sentence case, the one place the brand's caps voice drops to reading text) →
a featured-work row (`cards` press/awards). Detect: "meet the chef/maker/
founder" nav labels, single-person biography pages, chef-led brand stories.

**Two-price product cards → `displayAs: 'offer-tiles'` (Marlowe & Kept kit, resale
template #1).** When the source's product card states BOTH what it costs and what it
cost NEW, an asking price beside a struck reference retail, with a saving chip, bind
`offer-tiles`, NOT `cards` or `product-grid`. Object fields: `price` is the ASKING
price and `referencePrice` the retail; the saving is COMPUTED inside the card from the
two. ⚠ **Never author `salePercent`/`saleAmount` for this.** They are the platform's
checkout-authoritative discount and mean the OPPOSITE thing, `computeSalePrice` reads
an unwindowed `salePercent` as a live markdown off the listed price, so a "60% off
retail" ledger renders as a permanent 60% markdown that a real storefront would also
CHARGE. Both fields are inert here and pinned inert by test. Degrades: an item with no
`referencePrice` renders one clean price line (no struck row, no chip); a sold item
(`availability:'Sold'` / `stock:0`) keeps its grid slot in a desaturated ruled-band
state with the chip suppressed. Detect: resale/consignment/outlet cards, "was/now"
pricing, compare-at prices.

**Per-kit storefront shell → `sectionConfig.shell: 'vitrine-storefront'` on
`format:'products'` (Marlowe & Kept kit).** The fleet standard from brief §6.11, each
kit ships its OWN storefront shell composed over the SHARED `ProductsProvider`, rather
than re-toning one common vehicle with knobs (which is a design smell on the
commercially most important page). KEEP from the provider and never reimplement: cart
wiring, variant selection, stock/sold resolution, sale-field display, pagination,
search/sort state, detail routing. OWN in the kit shell: masthead, toolbar, filter
treatment, grid rhythm and the card. ⚠ The shell needs a `role:'primary'` collection
binding as its ITEM SOURCE, `role:'secondary'` is the shape every Stripe/Square fleet
products page has and renders byte-identically to before. `facets[].optionLabels` is a
default-absent map whose stored value stays the JOIN KEY (filter, query string and any
shelf join all still match on it) and only the visible label changes; **derive it at
authoring time from the release collection's `label`** so a release is named in exactly
one place, never duplicated onto every product row.

**Dated batch releases → `displayAs: 'release-shelf'` (Marlowe & Kept kit).** When the
source releases inventory in BATCH DROPS rather than a continuous feed, a dated group
presented as an event, with earlier groups receding rather than vanishing, bind
`release-shelf`. No fleet shelf carries a dated batch header or a receding-history
state. ⚠ **THE TWO-BINDING CONTRACT:** header data and item data live in two
collections, so the layout binds TWICE and the halves cooperate over one window
CustomEvent channel (`sectionConfig.shelfChannel`, default `'release-shelf'`) via a
symmetric three-message handshake (`hello` / `select` / `tally`) so mount ORDER cannot
matter. Nothing in the handshake runs during render, server HTML and first client
render are identical and the messages only REFINE what is already on screen. EITHER
half renders correctly alone (the header falls back to `itemCount`; the shelf picks the
bucket with the most recent item date). Mark the header binding `shelfRole:'batches'`
and the item binding `joinAbove: true`, **both are EXACT-LITERAL** (`'Batches'`,
`'batch'`, truthy values all fall through to the item shelf). ⚠ **Limit the shelf with
`batchLimit`, NEVER `itemLimit`**, `itemLimit` is a universal `shapeItems` knob applied
BEFORE the layout, so it hands the shelf the first N of all rows and makes every earlier
drop unreachable. Anyone re-authoring this binding must not put it back. Dates are
date-only by regex + static tables (never a local `Date` from a `YYYY-MM-DD` string), so
SSR and browser emit byte-identical text and the React #418 hydration class is
structurally impossible.

**Sparse A-Z indexes → `displayAs: 'alpha-index'` (Marlowe & Kept kit).** When the
source has an alphabetical index page, designers, makers, brands, artists, bind
`alpha-index`, not `cards`. ⚠ **The SPARSE case is the SPEC, not a degraded render**
(owner ruling): it is designed to read as a DELIBERATE index when most letters are
absent (~20 entries across ~14 of 26 initials, the rest suppressed), because a small or
churning roster never fills an alphabet. Empty-letter suppression is the intended
behaviour, do not pad the roster to make the rail look full, and do not treat a
half-empty index as a fidelity miss.

**Ornamented uneven media tiles → `displayAs: 'framed-tiles'` (Marlowe & Kept kit).**
When the source's tiles wear a DECORATIVE FRAME drawn over the photograph, inset from
the plate edge, riding on top of the image, over a centred caption stack, bind
`framed-tiles`, NOT `cards` or `gallery`. Knobs: `frameStyle` ∈ `scallop` | `weave` |
`notch` | `rule` (anything else ⇒ `scallop`), `frameSize`, `frameColor`
(`resolveColor`-validated), `offset: true` (EXACT-LITERAL), `align: 'left'`
(EXACT-LITERAL), `columns`. Every ornament derives from ONE authored number
(`frameSize` → `--vr-frame-lobe`); stroke, inset and band are all `calc()`ed off it, so
`frameSize` rescales the WHOLE ornament rather than one part of it. The plate ratio
follows the COLUMN COUNT (2-up `6/5`, 3-up `1/1`, 4-up `4/5`), this was measured, not
chosen; one fixed portrait ratio made a 2-up row 866px tall. `offset:true` is THREE
asymmetries at once (unequal tracks, alternate-tile stagger, a second plate ratio),
any one alone reads as a grid that went wrong. The ornament is CSS gradients ONLY (no
SVG, raster, `border-image` or `mask`, pinned by a test that greps for them), which is
what makes it token-recolourable and resolution-independent.

**Bleeding split mastheads → `hero.variant: 'split-bleed'` (Marlowe & Kept kit).** When
the exemplar's masthead is ONE ground across a full-bleed band, split into a centred
TYPE half and a MEDIA half whose photograph bleeds off the OUTER viewport edge with the
ground bleeding above and below it, author `split-bleed`. Distinct from
`split-statement` (flat ground, contained portrait), `arc-panel` (tints only one half)
and `framed-plate` (mats a plate OVER a panel). ⚠ The letterboxing above and below the
photo is PART OF THE LOOK, not a crop artefact. Two net-new knobs only:
`mediaSide: 'left'|'right'` (absent ⇒ right) and `glyph: {text, color}`; the ground
REUSES `panelColor` and the tagline row REUSES `partnerTagline`. **Place the glyph with
a `{glyph}` token inside `hero.title`** (e.g. `'Kept well {glyph} passed on.'`), that
token is what puts the mark INSIDE the headline line rather than beside it. Both
half-authored cases are defined: a glyph with no token TRAILS the headline (visible,
never silently dropped); a token with no glyph is STRIPPED (an h1 can never paint
`{glyph}`). The mark renders `aria-hidden`, so the h1's accessible name stays the copy.
⚠ `trustIndicators` is INERT on this variant (it renders a tagline row, not a
ticker/perks band), author that content on a `proof-band` binding instead. Single
composition by design: no slides, no autoplay, no dots, no arrows (Gate-1 §6.8);
carousels stay with `masthead`/`poster`.

**Header search → `navigation.search` (Marlowe & Kept kit, `SearchBand` chrome).** When
the exemplar's header carries a real search affordance, an arm that opens a full-width
band with a field, a heading and suggestion links, author `navigation.search`. The
`Navigation` object was `.strict()` with NO `search` key until this kit widened it, so a
site authored against an older loader will be REJECTED rather than silently dropping the
key. Distinct from a decorative magnifier icon: this is a band with a scrim and a real
focus trap. Detect: a search arm in the header nav, a site-wide search route, a
type-ahead affordance in the masthead.

**Tint-swap motion → `theme.motionPreset: 'vitrine'` (Marlowe & Kept kit).** When the
exemplar's hover and reveal language is a COLOUR/FILL swap with NO transform, ink and
ground exchanging rather than anything moving, author the `vitrine` preset. ⚠ A preset
id authored but ABSENT from `composition.motionPresets` resolves SILENTLY to the default
fade-up and every test stays green, so the site ships with no motion identity at all;
verify the id is registered, do not assume it. Pairs naturally with `framed-tiles` and
`split-bleed`, both of which are built on the same no-transform language and assert
`transform: none` by test.

**Sell-in / intake funnels → `format: 'intake'` (Marlowe & Kept kit net-new page type).**
When the source's intake is not one form but a HUB over N CHANNELS, consign in store /
from home / through the mail; ship it, drop it off, book a pickup, type the page set
`intake`. ⚠ **It is a page SET, not a page:** the hub AND every channel page carry
`format:'intake'`. The channel choice is the first decision a submitter makes and it
changes what the form asks. Two render-time grammars, both `sectionConfig`-driven (so
NO schema change): (1) a section declaring `intakeRole: 'channels'` (rail + body band,
the hub) or `'channel-rail'` (rail only, the channel pages) is hoisted into a page-level
`<nav>` rendered once on EVERY page of the funnel, with the current cell marked
`aria-current="page"`, the current cell is DERIVED from the page's own slug (query and
hash dropped), never authored; the rail renders only at **≥2 cells**, so "hub + ONE
channel" falls out as the simple case rather than a special case. Optional `hubLabel` /
`hubHref` / `railLabelField`. (2) `intakeRole: 'criteria'` splits one band in two on an
item boolean (`splitField`, default `accepted`), ⚠ **BOTH labels must be authored or
the section is left entirely alone**; the renderer must never invent the copy for a
rejection band, and a one-sided list is an ordinary feature list, not a pair. Bind each
channel's own content through the universal `sectionConfig.scope` knob so a channel is
described in exactly ONE place. Do NOT re-bind the FAQ on channel pages, `genericBlocks`
appends `labels.content` LAST, so it would strand the page's own closing note under
somebody else's accordion. ⚠ **Registration has THREE points** (loader enum, renderer
switch, Templates `COMPOSE_FORMATS`) and the third fails INVISIBLY: a missing
`COMPOSE_FORMATS` entry serves **HTTP 200 with a soft-404 body** (`h1 = "404"`), which
no status check can see, only a real page-CONTENT gate catches it. And depth-2 pages
never consult `COMPOSE_FORMATS` at all (the nested arm calls `renderComposedPage`
directly), so the CHANNELS render fine while the HUB soft-404s, a failure that reads
like "the parent route is broken" rather than "the format is unregistered". Test the hub.

---

