---
name: vivreal-product-rules
description: 'Use before filing, describing or changing Vivreal behaviour that looks wrong but was decided on purpose, when walking the product, writing help pages or copy, reviewing a diff or fixing a reported defect, covering the owner-decided rules for item detail links, list archived filters, Clear the examples, business rename, the public sign-up answer, outreach exclusion and opt-out wording, staff surfaces and staff alarm pushes.'
---

# Vivreal product rules (decided, not defects)

Last synced: 2026-10-21 (v7.1 and v7.2 rules added, read at each deployed line)

Each line below is a decision the owner made or a rule the product enforces on purpose. A walker who
does not know them files defects against decisions, a help page mis-describes them, and a coder may
undo one. **If something here looks wrong, raise it with the owner; do not "fix" it.** Every rule names
where it is enforced, so read the code there before you rely on the wording here, and check that the
change is on the deployed line before you describe it to a customer.

These rules outlive the release that made them, so this file is organised by topic, not by version.
Never put a customer name, id or address in this file.

## Sites and items

1. **Detail wins.** With Detail pages on, an item card links to the item's own page even when the item
   has an authored link of its own (owner, 2026-10-19). The authored link moves to the item page, under
   the hero. Renderer `detailHrefBuilder` (`src/lib/itemDetailHref.ts`); Templates
   `resolveDetailItemSummary` (`src/lib/detail/itemSummary.ts`).
2. **A card on a detail link uses a neutral word.** A positions card linking to its role page says
   "View role", not "Apply"; "Apply" appears only where the authored apply link is the one used. A float
   product tile's Order button still comes only from the authored `url` or `orderUrl`. Renderer
   `src/layouts/DetailLinkReviewFixes.test.tsx`.
3. **A card links only to a page that serves its collection, or nowhere.** Never a link that would 404.
   Renderer `resolveServingDetailRouteSlug`; Templates `lookupDetailItem` mirrors it.
4. **The item page's own button draws only `http(s)`, `mailto:` and `tel:` links**; anything else draws
   no button, and the label falls back to "Visit". Templates `src/lib/detail/itemSummary.ts`.
5. **The Detail pages switch clears section opt-outs on its own page only**, and only for a page that
   did not already serve item pages; pages that serve them keep their opt-outs (that is how a list shown
   on several pages avoids duplicate addresses). Portal `src/lib/sites/detailPageSwitch.ts`.
6. **`itemKeyField` is not editable in a section.** The address word comes from the page's design; a
   section value made links that 404. Hidden, never deleted from storage. Portal
   `src/lib/sites/sectionConfigControls.ts` (`HIDDEN_SECTION_CONFIG_KEYS`).
7. **Some item addresses 404 by design** (outside the page's scope, not reached by any link, a page
   serving another collection, scanner probe paths). Full list:
   `vivreal-sites` `references/detail-pages.md`, section 6.

## Content lists and the AI connection

8. **`archived` is a filter, not "include".** In the MCP `list-content` tool, `false` or omitted returns
   only items that are not archived, and `true` returns ONLY archived items. To see everything, make one
   call each way. An item with no `archived` field counts as not archived. VR-MCP-Server
   `src/tools/objects.ts`; VR_CMS_API's list read (`archived=false` means not `true`).
9. **The MCP calendar leaves out private lists.** `list-events` always asks the CMS to exclude sign-ups,
   contact messages, quote requests and form enquiries; events, bookings and posts stay (owner,
   2026-10-19). VR-MCP-Server `src/tools/calendar.ts` (`excludePrivateLists`).

## Examples and renames

10. **"Clear the examples" removes only untouched examples.** It finds the seeded examples, asks with a
    count and the names, then deletes each one only while it still carries its example marker
    (`vivrealExample` from the seed, or `example`) AND its `updatedAt` is the one the page read. An
    example the owner edited is theirs and is kept: the CMS answers 409 for it, and 404 for one already
    gone. Portal `src/components/CollectionObjects/ClearExamples/`; VR_CMS_API
    `deleteCollectionObject.js` (`onlyIfExample`).
11. **A business rename rewrites only kit-shaped titles.** A page title is rewritten only where the old
    name is the whole title, or a whole segment at either end joined by ` | `, ` · `, `, ` or `: `,
    matched exactly. The name mid-sentence, a longer word or another case is the owner's own text and
    stays. The campaign sender name changes only on an exact match, and the From address's local part
    never changes (it would reset sender reputation). VR_Secure_API `src/shared/renameIdentity.js`.

## Sign-ups and people

12. **A public sign-up gets one identical answer**, whether the address or number is new or already on
    the list, with no record id, and in comparable time. Anything else lets a holder of the site's public
    token ask whether a person is on a business's list. VR_Client_API
    `src/services/tenant/createDefinedCollectionObject.js` (`SIGNUP_ACCEPTED`).

## Outreach (staff only)

13. **Excluding a business is permanent.** There is no un-exclude. Every contact linked to it gets the
    contact exclude mark (`objectValue._system`), so relinking one elsewhere cannot free it; enrolment
    skips them and every send re-checks. An excluded business is never re-seeded. VR_Outreach_API
    `POST /companies/:id/exclude` (`src/api/routes/companies.js`, `src/db/companyExclusion.js`).
14. **Admin outreach sequences carry no opt-out wording** (owner, 2026-10-19: direct, personal outreach).
    Do not add an opt-out line to sequence copy or a check that requires one. Portal campaigns and portal
    subscriber email KEEP their opt-out and unsubscribe, and a "not interested" reply is still honoured.
15. **Admin outreach is fixed forward in the admin app**, never by restoring the old portal CRM (owner,
    2026-10-20). See `vivreal-knowledge:vivreal-admin-app-knowledge`.

## Staff surfaces and pushes

16. **The portal keeps no staff-only surface** (owner, 2026-10-16). Outreach CRM, flags, sign-up
    alerts, staff alarms and anything gated by the admin email list live only in the admin app, which is
    invite-only for three people and sign-in only. Never add a staff-only feature to the portal, and never
    design a sign-up flow for the admin app.
17. **Staff pushes reach admin-app devices only, and customer pushes never do.** VR_Main_API's
    `notificationConsumer` sends a pinned-recipient (staff) type only to subscriptions with
    `surface: 'admin'`, and customer types only to the rest. A staff alert with no admin device
    subscribed is logged and delivered to nobody. See `vivreal-infra:vivreal-notifications`.

## Sign-ups, lists and the site clock (v7.1 and v7.2)

18. **A site sign-up is one step** (owner, 2026-10-20): typing the address is the consent, so it is
    saved subscribed with no confirmation email and the site says "You're on the list." Only a hard
    bounce or a complaint on the platform list keeps an address unmailable. An unsubscribed person who
    signs up again gets one rejoin email (at most one a week) and is back only after clicking it.
    People the OWNER adds or imports are still asked to confirm by email. VR_Client_API
    `createDefinedCollectionObject.js`, VR_Secure_API `recordParkedSignup.js`, VR_CMS_API
    `importSubscribers.js`.
19. **Unsubscribe and bounces reach every copy of the address on that list**, and only that list in
    that business. VR_Main_API `campaignUnsubscribe.js`, `src/campaignEvents/lambda.js`.
20. **Deleting a site keeps the people.** Sign-up, contact, reservation, quote-request, booking and
    parked sign-up lists are kept while they hold anyone, and a list another site of the business
    uses is kept with its items (owner, 2026-10-20). VR_Secure_API `deleteSite.js`.
21. **The business time zone is the site's clock** (owner, 2026-10-20). A page or section may set its
    own zone and wins on that page; a kit's sample zone never reaches a customer site. VR_Client_API
    `src/shared/siteTimeZone.js`, renderer `scheduleTimezone`, VR_Secure_API `scrubKitZones`.
22. **A repeating stop's end date means "repeat until"**, never one long event, and the calendar feed
    lists each occurrence (owner, 2026-10-20). Renderer `src/lib/scheduleOccurrences.ts`, shared with
    VR_Client_API's feed.

## Adding a rule

One line, the decision in owner words, who decided and when, and the code that enforces it. Keep this
file short: the detail belongs in the system's own knowledge skill, and this file points there.
