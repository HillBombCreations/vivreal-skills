# Detail pages: item addresses, who links where, and what 404s on purpose

How a customer site gives each item its own page (`/<page slug>/<item>`), which page a card links to,
and why some addresses answer 404 by design. (Reference of `vivreal-sites`.)

Read at: portal `origin/stable` (v0.37.1), Templates `origin/stable` `12a96d5`, renderer
`origin/master` (the version Templates pins in its `package.json`; read it there, never from here).
The renderer, Templates and the portal each mirror one rule; a change to it moves all three, and the
parity tests below move with it. Function and file names are the stable handles; re-read them.

## Contents

1. The model in one paragraph
2. The portal's "Detail pages" switch
3. The renderer: which page an item links to
4. Templates: which item an address resolves to
5. The item page itself
6. What 404s by design (not a defect)
7. Changing any of this

---

## 1. The model

A page serves item pages for ONE collection. Formats with an item route of their own (`shows`, `team`,
`menu`, `products`) serve their own list. Any other page serves item pages when it opts in, through
`detailPage.itemCollectionId` (or, for a page that draws one list, the list it draws). The page's
`detailPage.itemKeyField` names the field used as the address word; without it the item's `_id` is the
address. `detailPage.enabled: false` turns a page's item pages off. A binding can opt a section out with
`sectionConfig.detailEligible: false`, so its cards link nowhere (that is how a list shown on several
category pages avoids duplicate addresses). The home page never serves item pages.

## 2. The portal's "Detail pages" switch

`detailPageSwitchPatch` in the portal's `src/lib/sites/detailPageSwitch.ts`:
- **Off** writes `detailPage.enabled: false` and keeps the rest of `detailPage`, so an off and on round
  trip loses nothing. Off writes no blocks.
- **On, for a page that already serves item pages** (an own-route format, or a layout that serves
  them) only sets `enabled: true`. Its section opt-outs stay.
- **On, for any other page** also names the page's own list as `detailPage.itemCollectionId` (never
  replacing an authored one), and deletes `sectionConfig.detailEligible` on every binding on THIS page
  that draws that list, group children included, plus the legacy `collections` mirror entry. Pressing
  the switch is the owner asking for item pages; a kit's opt-out would otherwise make it inert, and every
  item would still 404 (walk F1).
- **`itemKeyField` is hidden in the section panel wherever a layout declares it**
  (`HIDDEN_SECTION_CONFIG_KEYS` in `src/lib/sites/sectionConfigControls.ts`), by one rule on the key,
  not a list of layouts. Templates resolves an item only by the PAGE's `detailPage.itemKeyField`, so a
  value typed into a section drew links that all 404. Storage is untouched: a stored value round trips.

## 3. The renderer: which page an item links to

- **`resolveServingDetailRouteSlug`** (`src/composition/detailRouteOwnership.ts`) is the rule. A page
  links an item to its own item route only when that route serves the item's collection
  (`pageServesCollectionDetail`). Otherwise the link goes to the first OTHER page, in `pages` order, that
  serves the collection; otherwise there is no link, never a dead one. It is used by `mapLayout` (every
  collection layout, cards included), the `shows` page-template arm and the hero "Last up" link. It
  mirrors Templates' lookup exactly.
- **`detailHrefBuilder`** (`src/lib/itemDetailHref.ts`) gives alpha-index, positions, product-tiles and
  case-cards the same `/<slug>/<itemSegment>` address cards use, when detail is on. With detail off it
  returns `undefined` and the layout renders byte-identically to before.
- **Detail wins (owner decision, 2026-10-19).** With Detail pages on, an item links to its own page even
  when it has an authored link of its own. A positions card on a detail link says "View role", never
  "Apply" ("Apply" only when the authored apply link is the one used). On a product-tiles float tile the
  item page takes the image and title link; the Order button still renders from the authored `url` or
  `orderUrl` alone (`DetailLinkReviewFixes.test.tsx` pins all three).
- **Dropping a section.** The renderer drops a section only when it has no items. An empty binding with
  its header on still draws its heading over an empty body; set `showHeader: false` where that matters.

## 4. Templates: which item an address resolves to

- **`lookupDetailItem`** (`src/lib/detail/lookupItem.ts`) is the one lookup the item page and the
  per-item OG card both use, so a shared link and its card cannot disagree. The collection is
  `detailPage.itemCollectionId`, else the page's own collection. It reads every item, not the first page.
- **`resolveItem`** (`src/lib/detail/resolveItem.ts`): `_id` first, then `raw[itemKeyField]` when the
  page sets one.
- **`detailPage.scope`** narrows which items are addressable; an absent or malformed scope changes
  nothing.
- **`restrictToLinked`** (`src/lib/detail/linkedItems.ts`) keeps only the items some link on the site
  reaches: SELF (a block on the page drawing the collection, unless it opts out, within its scope) and
  INBOUND (a layout on a page that does not serve the collection, linking into the first page that does,
  which ignores that owner's own opt-out). An inbound linker counts only when it serves THIS collection,
  as the renderer decides. A page with no block drawing the collection is left unrestricted. The page
  list (sitemap) applies the same rule, so a listed address is always a linked one.
- A read that failed is told apart from an item that does not exist (`src/lib/detail/itemMiss.ts`); only
  the second is a 404.

## 5. The item page itself

- Under the hero, the item page draws the card's facts and the item's own outbound link
  (`resolveDetailItemSummary` in `src/lib/detail/itemSummary.ts`, placed by
  `src/components/DetailItemSummary/index.ts`). With Detail pages on the card no longer links out, so
  this is the only place a visitor still reaches that link.
- The label follows the layout the item came from: "Apply" for positions, "Order" for a float tile's
  `orderUrl` (or its `linkLabel`), "Buy" for pastel tiles, the item's own label where it has one, else a
  neutral "Visit".
- **Only `http(s)`, `mailto:` and `tel:` links are drawn.** Anything else draws no button.
- `fields.show` adds known facts the card did not draw; with no `fields.show` the card's visible facts
  are shown. On a `products` page the summary sits under the buy box, which stays whole.

## 6. What 404s by design

Read this before filing an item-page 404 as a defect:
- an item outside the page's `detailPage.scope`;
- an item that no link on the site reaches (its list opts out with `detailEligible: false` on its
  page, and nothing links into it from elsewhere);
- a page with `detailPage.enabled: false`, or a page that serves a different collection than the item's;
- an address built from a section-level `itemKeyField` instead of the page's;
- a page whose `format` is not in Templates' `COMPOSE_FORMATS` (see `references/page-formats.md`);
- scanner probe paths (`wp-*`, `.env`, `.git`, `wp-config.` prefixes and `.php`, `.asp`, `.aspx`, `.jsp`,
  `.cgi` endings): Templates' `src/middleware.ts` answers a data-free `no-store` 404, unless an authored
  redirect claims the address.

A card that links nowhere on a list that opted out is also by design, not a missing link.

## 7. Changing any of this

- A change to who links where is a renderer change AND a Templates change, made together; the portal
  switch follows when the opt-in rule moves. Templates' `linkedItems` parity test calls the renderer's own
  rule from its built output (`src/lib/detail/linkedItems.ts` names it), and the renderer's `DetailLinkReviewFixes.test.tsx` pins the label and
  float-button decisions.
- **Validate a detail-link change** with each affected layout with detail off and on, a mixed page (two
  collections, one served), and a hero "Last up" link, through the Studio gate (the portal's
  `npm run kit:validate`, run against the packed renderer as the renderer's CLAUDE.md describes).
- An owner-decided behaviour here (detail wins, the neutral label, the hidden `itemKeyField`) is listed
  in `vivreal-knowledge:vivreal-product-rules`. Do not "fix" it.
