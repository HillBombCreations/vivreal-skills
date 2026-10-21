# Site values + navbar/footer chrome

What configures a site's brand/theme and its authored header/footer. (Reference of `vivreal-sites`.)

## Site values: the brand/theme layer

Everything brand-specific comes from **site values** on the `sites` doc, NOT hardcoded in the template:
- Colors / theme (injected at runtime as CSS vars `--primary`, `--secondary`, etc. via the template's `Providers`), logo, site name, social links, contact info, typography (`--font-display` / `--font-body`).
- **No client-specific content, brand names, colors, or logos may be committed to Vivreal_Templates**, it must come from the API. `data/mockData.ts` is fallback only (used if the API is unavailable). See `vivreal-templates-knowledge`.

Site values + chrome are persisted via the portal proxy `PUT /api/proxy/sites/update` → VR_Secure_API `updateSiteValues`, and returned to the live site by VR_Client_API `getSiteDetails`.

- **A business rename rewrites only kit-shaped titles** (VR_Secure_API `src/shared/renameIdentity.js`, v7): `seo.metaTitle` and `detailPage.seo.titlePattern` change only where the old name is the whole title or a whole end segment joined by a kit separator; the campaign sender name changes only on an exact match, and the From address's local part never does.
- **The site's time zone is the business's** (v7.1): `siteDetails.values.timezone` as the site reads it is VR_Client_API's answer (the business zone first, the site's own stored value second), so writing the site value changes nothing while the business has a zone. Set it on the business (portal Business details, `PUT /api/group/timezone`).

## Authored navbar + footer chrome (Q3b): Studio-editable, lazy auto-derive

Customers can author their **navbar and footer** in Studio; the renderer falls back to auto-derived chrome when a field is unset (so existing sites render identically until edited):

- **`navigation` subdoc**: `{ menuItems, cta }`.
- **`footer` subdoc**: `{ columns, legal, socialLinks, hidePoweredBy }`.
- **Lazy rule**: a field that is `null`/absent ⇒ the renderer auto-derives it (`deriveNav` / `deriveMenuItems` / `deriveFooterPages` / `deriveFooterColumns`). `deriveMenuItems` always seeds `Home@0` even when the home page has `displayOnHeader:false`.
- **Caps enforced server-side** (VR_Secure_API validator, 400 on violation): ≤20 menu items, ≤6 footer columns, ≤20 links/column.

### The strict-mode subdoc trap (data-loss hazard)

The `navigation`/`footer` subdocs are declared as **Mixed** on `siteSchema` **explicitly** because the parent site doc is strict-mode, **undeclared `$set` paths are silently dropped**. If you add a new chrome field, declare it on the schema (`Vivreal-Schemas` `siteSchema`) or it will never persist. Page fields work the other way round: `PageSchema` is strict:false, but `bulkWrite` casts against the ROOT schema, so an undeclared page key is stripped there (page reorder never persisted until the v6 schemas minor declared `order`), and VR_Secure_API's page-update allow-list is the schemas package's `pageFields`.

### Writing site values from a script

- **Dotted and `$` body keys never reach VR_Secure_API** (`express-mongo-sanitize`), so `updates: { 'hero.title': ... }` arrives empty and 500s. Send each touched top-level field WHOLE, from a fresh read with only the target strings changed.
- **`updateSiteValues` MERGES `siteDetails.values`** (absent key untouched, explicit `null` clears). Its unconditional `domainInformation` `$set` is safe only because Mongoose strips `undefined`. After any write, re-read the whole document and diff it against a pre-write backup: only the intended paths and `updatedAt` may differ.

### Renderer chrome facts

- The renderer chrome is **framework-free + token-driven** (CSS vars + an optional `accentColor`). Preserve the props API + the Q3b dual-mode resolvers + `data-chrome` / `data-nav` anchors when touching it.
- Social links map `{type,link}` (storage) → `{platform,url}` (renderer).
- **`BrandMark` is the canonical brand-logo slot renderer** (renderer `components/BrandMark.tsx`, 1.42.0+): a brand logo is never center-cropped; wide wordmarks fall back to a letter-mark or `siteData.favicon`. Consumed by the renderer chrome/cart AND Templates' cart dialogs, it's the answer to "the logo looks cropped in a small slot".

### hidePoweredBy is tier-gated

`footer.hidePoweredBy` only takes effect for paid tiers. VR_Client_API `getSiteDetails` returns the
group `tier`, and the renderer `src/chrome/poweredBy.ts` holds the permitted set. **Read that file
rather than quoting a set from here.** It has changed, `basic` CAN hide the badge, and the match is
against the RAW STORED tier, so a group still carrying a retired tier id keeps the attribution. The
tier piggybacks on an existing group read, so there is no extra DB round trip.

## Where chrome is edited in Studio

Studio labels (plain-language rename): **Header & Footer** (was "Site chrome"), **Header** (was "Navbar"), **Header button** (was "CTA"). Per-page CTA ("Bottom banner") is a separate `page.cta` editor. See `references/authoring-and-parity.md`.
