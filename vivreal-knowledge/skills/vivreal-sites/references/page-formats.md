# Site structure — pages, sections, page formats

How a Vivreal site is laid out and how content binds into it. (Reference of `vivreal-sites`.)

## A site = site values + pages

The `sites` document (group's tenant DB) holds:
- **site values** — brand/theme + authored navbar/footer chrome (see `references/site-values.md`).
- **`pages[]`** — each page has a `format`, display flags (`displayOnHeader`, etc.), a slug, and `pageConfigs`/sections that bind to the group's content collections.

The site doc is written by the deploy pipeline's `seedCollections` state at create time (pages/collectionGroups/integrationsUsed) and thereafter edited in Studio. The deployed site fetches it via `VR_Client_API GET /tenant/siteDetails`.

## Page format drives layout — NOT templateType

The single most important structural fact: **the rendered storefront selects layout from `pageConfigs[].format`, NOT from the site's `templateType`.** `templateType` (`ecommerce` / `showcase`) only influences which collection schemas + page configs get **seeded** at create time and is recorded for traceability (`.vivreal-template.json`); runtime ignores it. So:

- "Render differently for ecommerce vs showcase" is a **renderer** concern (`vivreal-site-renderer` + `Vivreal_Templates`), never branch/deploy logic.
- A page `format` can be added to **any** site regardless of its `templateType`.

### Live page formats

- **`showcase`** — editorial showcase pages (Shows/portfolio style).
- **`ecommerce`** — product storefront pages (`/products`, product detail), Stripe checkout.
- **`schedule`** — agenda / upcoming-stops page for mobile/pop-up vendors (food trucks etc.). Page-level `format:"schedule"` addable to any site (deliberately NOT a templateType — lowest blast radius). v1: SMS capture-only, OSM iframe map (no key). Stops are collection objects; VR_Client_API ships a zero-dep RFC5545 `.ics` feed (`GET /sites/:siteId/feeds/schedule.ics`).
- Several more formats exist commented-out in the seed templates (not live).

Page formats are a **forward/backward-compatible union**: the renderer renders an unknown future `format`/section value as `null` (no crash). Adding an enum value is a minor renderer bump; changing existing semantics is a major bump (see `vivreal-renderer-knowledge`).

## Sections + content binding

Within a page, sections bind to the group's content collections (collection groups / objects, integration objects). A binding references a collection by `refID` and carries display config (section title, CTA, badges, subtitle). The renderer dispatches each section type via `ContentRenderer` / `composePage`.

**Binding round-trip trap:** the portal's `pageUtils.ts` mappers (`refToCollectionBinding`) use a **field whitelist** — when you add ANY new field to a page/binding shape, add it to those mappers too, or it gets **silently erased on every load→save round-trip** (this bit `title`/`subtitle`). Verify mappers before shipping a new binding field.

## The publishDate storefront gate (content visibility rule #1)

VR_Client_API gates EVERY storefront read behind `publishDate: { $lte: new Date() }`:
- `getCollectionObjects.js` (collection objects incl. filter defs), `getIntegrationObjects.js` (Stripe products), `processCollectionObjects.js`.

A doc with `publishDate: null` does NOT match `$lte: <Date>` (Mongo type bracketing) → silently excluded. **WRONG-TYPE variant:** a `publishDate` stored as a BSON **string** (`"2026-03-12T..."`) instead of a native `Date` is *also* silently dropped even when the date is valid/past — arises from any write path that bypassed Mongoose casting (raw driver `updateOne`/`bulkWrite`, seed/import, agent/MCP create). Detect with `{ publishDate: { $type: "string" } }`; fix is data-only (cast string→Date). When content "vanishes from the storefront," check publishDate **type**, not just value/nullness — it presents identically to a renderer regression.

Author gotchas:
- Portal **product create** defaults `publishDate: null` (draft-by-design) — new products are hidden until dated.
- **Filters/config content must always be live** — stamp `publishDate` on create AND update. A past bug had the filter dialog re-nulling publishDate on edit (the `collectionObjects/update` proxy sets `publishDate: body ?? null`).
- **Schedule stops** MUST set `publishDate = now`; the event date lives in `objectValue.start`; the shaper splits upcoming/past on `start`, NEVER on publishDate — else all future stops vanish.

Field-link note: collection objects link to their group via `collectionObj.refID`; integration objects (Stripe products) via `collectionGroup.refID`. Collections are snake_case (`collection_objects`, `integration_objects`). Integration objects are NOT covered by content versioning (no version-revert for products).

## Product-filter ↔ enum binding (content visibility rule #2)

The home Product Showcase emits `/products?f_productType=<objectValue.product-type>`; `/products` filters on the canonical product `productType` value (the group's "Product Filters" collection, `key="productType"`). If the showcase field is **free text**, an author can type a display label that ≠ the stored value and the filter link silently matches zero products.

- Studio's **filter-bound enums** resolve enum options live from the products-page filter keys (`normalizeFilterKey` handles kebab↔camel) so new authoring can't drift.
- The systemic fix (schema-bind the showcase `product-type` to the canonical filter values — "Option C") is deferred; legacy free-text instances can still drift and were patched per-instance.
- Same bug class as the publishDate string variant: a label-vs-value mismatch that silently fails a machine comparison.

## How to add a page / format

1. Add the `format` to the portal `PageFormat` union (`pageBuilder.ts`) + both Add/Edit page dialog format lists. Preview then auto-works.
2. Add the format to the renderer (`src/types`, a `*Page.tsx` template, registry entry, `composePage` section builder + `renderSection` case, index exports) — publish a renderer minor bump.
3. Add the format string to `Vivreal_Templates` `COMPOSE_FORMATS` (`src/app/[slug]/page.tsx`) + bump the renderer dep on Templates main.
4. If the format needs server data the public API doesn't yet return, add it in VR_Client_API.
5. Going live = publish renderer + bump Templates dep + merge Templates main (auto-syncs all customer branches — see `references/authoring-and-parity.md` + `vivreal-site-deploy-pipeline`).
