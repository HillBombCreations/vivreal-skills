# Site values + navbar/footer chrome

What configures a site's brand/theme and its authored header/footer. (Reference of `vivreal-sites`.)

## Site values — the brand/theme layer

Everything brand-specific comes from **site values** on the `sites` doc, NOT hardcoded in the template:
- Colors / theme (injected at runtime as CSS vars `--primary`, `--secondary`, etc. via the template's `Providers`), logo, site name, social links, contact info, typography (`--font-display` / `--font-body`).
- **No client-specific content, brand names, colors, or logos may be committed to Vivreal_Templates** — it must come from the API. `data/mockData.ts` is fallback only (used if the API is unavailable). See `vivreal-templates-knowledge`.

Site values + chrome are persisted via the portal proxy `PUT /api/proxy/sites/update` → VR_Secure_API `updateSiteValues`, and returned to the live site by VR_Client_API `getSiteDetails`.

## Authored navbar + footer chrome (Q3b) — Studio-editable, lazy auto-derive

Customers can author their **navbar and footer** in Studio; the renderer falls back to auto-derived chrome when a field is unset (so existing sites render identically until edited):

- **`navigation` subdoc**: `{ menuItems, cta }`.
- **`footer` subdoc**: `{ columns, legal, socialLinks, hidePoweredBy }`.
- **Lazy rule**: a field that is `null`/absent ⇒ the renderer auto-derives it (`deriveNav` / `deriveMenuItems` / `deriveFooterPages` / `deriveFooterColumns`). `deriveMenuItems` always seeds `Home@0` even when the home page has `displayOnHeader:false`.
- **Caps enforced server-side** (VR_Secure_API validator, 400 on violation): ≤20 menu items, ≤6 footer columns, ≤20 links/column.

### The strict-mode subdoc trap (data-loss hazard)

The `navigation`/`footer` subdocs are declared as **Mixed** on `siteSchema` **explicitly** because the parent site doc is strict-mode — **undeclared `$set` paths are silently dropped**. If you add a new chrome field, declare it on the schema (`Vivreal-Schemas` `siteSchema`) or it will never persist. (`Vivreal-Schemas` 1.16.0 added these subdocs.)

### Renderer chrome facts

- The renderer chrome is **framework-free + token-driven** (CSS vars + an optional `accentColor`). Preserve the props API + the Q3b dual-mode resolvers + `data-chrome` / `data-nav` anchors when touching it.
- Social links map `{type,link}` (storage) → `{platform,url}` (renderer).

### hidePoweredBy is tier-gated

`footer.hidePoweredBy` only takes effect for paid tiers. VR_Client_API `getSiteDetails` returns the group `tier`; the renderer's `canHidePoweredBy` = `pro` / `proplus` / `enterprise`. Free/basic/unknown always show the attribution (safe default). The tier piggybacks on an existing group read — no extra DB round-trip.

## Where chrome is edited in Studio

Studio labels (plain-language rename): **Header & Footer** (was "Site chrome"), **Header** (was "Navbar"), **Header button** (was "CTA"). Per-page CTA ("Bottom banner") is a separate `page.cta` editor. See `references/authoring-and-parity.md`.
