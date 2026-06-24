---
name: vivreal-sites
description: Use when reasoning about the Vivreal SITE PRODUCT — how a customer site is structured and authored, NOT the AWS deploy plumbing. Covers what a site IS (pages, sections, page formats like showcase/ecommerce/schedule, site values, navbar/footer chrome), the authoring model (Studio → composePage → site-renderer/Templates parity, content goes live on Save, no Publish button), and the rules that decide whether content actually appears (the publishDate storefront gate, product-filter ↔ enum binding). Use when asked "how do Vivreal sites work", "why isn't my content/section showing on the live site", "how do I add a page/section/format", "how does the Studio preview match the live site", or "how is site chrome authored". Triggers on: Vivreal site, customer site, site structure, page format, showcase, ecommerce, schedule page, site values, navbar, footer, site chrome, Studio, composePage, live preview parity, publishDate gate, product filter binding, content not showing on site, page sections, pageConfigs. For the AWS deploy pipeline (Step Functions/Amplify/Route53) use vivreal-site-deploy-pipeline instead; for query rules use vivreal-db.
---

# Vivreal Sites — Product, Data & Authoring Model

How a Vivreal customer site is **shaped, authored, and made to appear** — the product/data view. This is deliberately distinct from the AWS **deploy plumbing** (`vivreal-site-deploy-pipeline` = Step Functions, Amplify, Route53). Cross-link, don't duplicate. For query mechanics see `vivreal-db`; for the renderer package internals see `vivreal-renderer-knowledge`; for the customer-template repo see `vivreal-templates-knowledge`.

## The one-paragraph model

A **site** is a Mongo document (`sites` collection, in the group's tenant DB) holding **site values** (brand: colors, logo, name, social, contact + authored **navbar/footer chrome**) and a list of **pages**. Each page has a **format** (`showcase` / `ecommerce` / `schedule` / …) and **pageConfigs/sections** that bind to the group's content collections. The deployed site (a Vivreal_Templates branch) fetches that doc + the bound content from **VR_Client_API** and renders it via the **`@hillbombcreations/site-renderer`** package. The portal **Studio** edits the same doc and previews it through the **same `composePage()`** the live site uses, so preview and live can't drift.

## The three areas (read the reference for the one you need)

- **Page formats + sections + how a site is structured** → `references/page-formats.md`
  (what `format` does, `pageConfigs[].format` drives layout NOT `templateType`, the section/binding model, how to add a page/format, the showcase product-filter binding rule.)
- **Site values + navbar/footer chrome** → `references/site-values.md`
  (what lives in site values, the Q3b authored navbar/footer overrides + lazy auto-derive, where they persist + the strict-mode subdoc trap.)
- **Authoring + Studio↔live parity + going live** → `references/authoring-and-parity.md`
  (Studio is the single surface, content goes live on **Save** (no Publish button), composePage preview parity seams, and the Templates `main` auto-sync rollout.)

## The TWO rules that most often make content "not show up"

These bite constantly — know them even before opening a reference:

1. **publishDate storefront gate.** VR_Client_API hides any content where `publishDate` is null (draft), in the future (scheduled), **or stored as a string instead of a Date** (silently dropped by `$lte: new Date()` type-bracketing). "Created/edited in the portal but missing on the site" is almost always this. Check `publishDate` **type and value** first. Config-like content (filters, schedule stops) MUST be stamped with a past `publishDate`; event dates live elsewhere (e.g. `objectValue.start`), never in `publishDate`. Full detail: `vivreal-db` + `references/page-formats.md`.
2. **Label-vs-value binding drift.** A free-text field that must equal a canonical machine value (e.g. the home Product Showcase `product-type` → `/products?f_productType=` filter) silently matches zero when an author types a display label ("Sweet Treats") instead of the stored value ("Sweets"). Studio's filter-bound enums fix this for new authoring; legacy free-text data can still drift. See `references/page-formats.md`.

## Companions / boundary

| Need | Skill |
|---|---|
| How a site gets BUILT + DEPLOYED on AWS (Step Functions, Amplify, Route53, auto-sync) | `vivreal-site-deploy-pipeline` |
| How a **Save → live** edit propagates to a built site (on-publish cache-revalidation webhook) | `vivreal-site-deploy-pipeline` |
| The renderer package (composePage, primitives, publishing it) | `vivreal-renderer-knowledge` |
| The customer-template repo (clientFetch, branch model) | `vivreal-templates-knowledge` |
| Safe Mongo queries against the `sites` / `collection_objects` collections | `vivreal-db` |
| The public API that serves site content (routes, frozenCheck, signed media) | `vivreal-client-stack-knowledge` |

Sources of truth: `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` (Studio preview parity, sites routes), `C:\repos\Vivreal_Templates\CLAUDE.md`, `C:\repos\vivreal-site-renderer\CLAUDE.md` + `docs/DESIGN_LANGUAGE.md`. Memory: `insight_publishdate_storefront_gate.md`, `project_q3b_site_chrome.md`, `project_schedule_page_type.md`, `project_site_studio_next_level.md`, `project_showcase_producttype_binding_followup.md`, `insight_templates_main_autosync.md`.
