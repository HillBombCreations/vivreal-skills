---
name: vivreal-sites
description: Use when reasoning about the Vivreal SITE PRODUCT — how a customer site is structured and authored, NOT the AWS deploy plumbing. Covers what a site IS (pages, sections, page formats like showcase/ecommerce/schedule/catalog/craft, site values, navbar/footer chrome), the site lifecycle (demo→live cutover, demo noindex gate), the authoring model (Studio → composePage → site-renderer/Templates parity, content goes live on Save, no Publish button), and the rules that decide whether content actually appears (the publishDate storefront gate, product-filter ↔ enum binding). Triggers on: Vivreal site, customer site, site structure, page format, showcase, site values, navbar, footer, site chrome, Studio, composePage, live preview parity, publishDate gate, product filter binding, content not showing on site, page sections, pageConfigs, lifecycleState, demo site, how do Vivreal sites work, add a page/section/format. For the AWS deploy pipeline use vivreal-site-deploy-pipeline; for query rules use vivreal-db.
---

# Vivreal Sites — Product, Data & Authoring Model

Last synced: 2026-07-21

How a Vivreal customer site is **shaped, authored, and made to appear** — the product/data view. This is deliberately distinct from the AWS **deploy plumbing** (`vivreal-site-deploy-pipeline` = Step Functions, Amplify, Route53). Cross-link, don't duplicate. For query mechanics see `vivreal-db`; for the renderer package internals see `vivreal-renderer-knowledge`; for the customer-template repo see `vivreal-templates-knowledge`.

## The one-paragraph model

A **site** is a Mongo document (`sites` collection, in the group's tenant DB) holding **site values** (brand: colors, logo, name, social, contact + authored **navbar/footer chrome**) and a list of **pages**. Each page has a **format** (`showcase` / `ecommerce` / `schedule` / `catalog` / `craft` / `profile` / `location-hub` / …) and **pageConfigs/sections** that bind to the group's content collections. The deployed site (a per-site Amplify app building the shared Vivreal_Templates **`stable`** channel branch — per-customer branches are dead) fetches that doc + the bound content from **VR_Client_API** and renders it via the **`@hillbombcreations/site-renderer`** package. The portal **Studio** edits the same doc and previews it through the **same `composePage()`** the live site uses, so preview and live can't drift.

## The three areas (read the reference for the one you need)

- **Page formats + sections + how a site is structured** → `references/page-formats.md`
  (what `format` does, `pageConfigs[].format` drives layout NOT `templateType`, the section/binding model, how to add a page/format, the showcase product-filter binding rule.)
- **Site values + navbar/footer chrome** → `references/site-values.md`
  (what lives in site values, the Q3b authored navbar/footer overrides + lazy auto-derive, where they persist + the strict-mode subdoc trap.)
- **Authoring + Studio↔live parity + going live** → `references/authoring-and-parity.md`
  (Studio is the single surface, content goes live on **Save** (no Publish button), composePage preview parity seams, and the promote-stable release rollout.)

## Lifecycle + going live (know these before debugging "why isn't my edit/site visible")

- **Save → live is cache revalidation, not a rebuild.** A Studio Save fires VR_Secure_API's webhookDelivery Lambda at the built site's `/api/revalidate` (HMAC-signed `X-Vivreal-Signature`); the site invalidates `site:<SITE_ID>` / `collection:<refID>` / `integration:<type>` cache tags and the edit appears in seconds. Rebuilds happen only on template RELEASES: the promote-stable workflow (manual `workflow_dispatch`, fast-forward `main`→`stable`, ancestry-guarded) rebuilds the whole fleet.
- **Sites have a lifecycle: `lifecycleState: 'demo' | 'live'`** (+ `sourceUrl`), flat fields in the site doc's siteDetails values. Demo sites (pre-cutover migrations) are made un-indexable by the Templates `isDemoSite` gate — robots `Disallow: /`, empty sitemap, `noindex` + canonical → `sourceUrl` — and can wear the renderer's DemoRibbon chrome (theme switcher + claim CTA). Cutover flips the flag and propagates via the revalidate webhook, no rebuild. Absent state ⇒ live/indexable (fail-safe).
- **Live-site media is CloudFront-SIGNED** (`media.vivreal.io`; unsigned URLs 403; short TTL — JSON-LD/OG embeds strip the signature via `unsignMediaUrl`). Content must be read through the signed `currentFile.source`/`srcset` fields, never hand-built CDN URLs. Detail: `vivreal-templates-knowledge` + `vivreal-client-stack-knowledge`.

## The TWO rules that most often make content "not show up"

These bite constantly — know them even before opening a reference:

1. **publishDate storefront gate.** VR_Client_API hides any content where `publishDate` is null (draft), in the future (scheduled), **or stored as a string instead of a Date** (silently dropped by `$lte: new Date()` type-bracketing). "Created/edited in the portal but missing on the site" is almost always this. Check `publishDate` **type and value** first. Config-like content (filters, schedule stops) MUST be stamped with a past `publishDate`; event dates live elsewhere (e.g. `objectValue.start`), never in `publishDate`. Full detail: `vivreal-db` + `references/page-formats.md`.
2. **Label-vs-value binding drift.** A free-text field that must equal a canonical machine value (e.g. the home Product Showcase `product-type` → `/products?f_productType=` filter) silently matches zero when an author types a display label ("Sweet Treats") instead of the stored value ("Sweets"). Studio's filter-bound enums fix this for new authoring; legacy free-text data can still drift. See `references/page-formats.md`.

## Companions / boundary

| Need | Skill |
|---|---|
| How a site gets BUILT + DEPLOYED on AWS (Step Functions, Amplify, Route53, promote-stable releases) | `vivreal-site-deploy-pipeline` |
| How a **Save → live** edit propagates to a built site (on-publish cache-revalidation webhook) | `vivreal-site-deploy-pipeline` |
| The renderer package (composePage, primitives, publishing it) | `vivreal-renderer-knowledge` |
| The customer-template repo (clientFetch, branch model) | `vivreal-templates-knowledge` |
| Safe Mongo queries against the `sites` / `collection_objects` collections | `vivreal-db` |
| The public API that serves site content (routes, frozenCheck, signed media) | `vivreal-client-stack-knowledge` |

Sources of truth: `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` (Studio preview parity, sites routes), `C:\repos\Vivreal_Templates\CLAUDE.md`, `C:\repos\vivreal-site-renderer\CLAUDE.md` + `docs/DESIGN_LANGUAGE.md`. Memory: `insight_publishdate_storefront_gate.md`, `project_q3b_site_chrome.md`, `project_schedule_page_type.md`, `project_site_studio_next_level.md`, `project_showcase_producttype_binding_followup.md`, `insight_templates_main_autosync.md`.
