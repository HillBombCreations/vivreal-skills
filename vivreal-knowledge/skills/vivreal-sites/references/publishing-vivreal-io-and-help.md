# Publishing to vivreal.io and the help site

The one home for what a script, a runner or an agent needs to know before it writes content,
images or captures into vivreal.io or the help centre at vivreal.io/help (both are Vivreal sites built from
Templates, with content in the CMS). Learned on the v6 help publishing batches and the
vivreal.io screenshot swap, 2026-10-15. `help-page-producer`, `footage-recorder` and the
marketing agents point here rather than keeping their own copy.

## What the CMS does to what you write

- **`objectValue.mediaKeys` comes back SORTED.** The CMS rebuilds it on save
  (`buildMediaKeysFromValue` in VR_CMS_API `src/shared/processMediaFields.js` returns a sorted
  list), so a read-back that compares it in the order you sent fails on a write that worked.
  Compare it as a set, or sorted.
- **`objectValue.mediaFields` is keyed by FILE NAME, not by field.** The CMS rebuilds it on save
  as `mediaFields[<file name>] = "<field key>"`. Two media fields on one item that share a file
  name collapse to one entry, and VR_Client_API then resolves only one of them. That is why the
  six vivreal.io home flip-tile fronts showed blank: each front shared its file name with the
  back. Give every media field on an item its own file name. (Product fix is a v7 item.)
- **`promoteMedia` re-encodes the image.** A PNG is re-encoded losslessly, so its decoded
  pixels match only if it was no wider than the cap (2000 px through the batch promote, 512 px
  by default), wider ones are downscaled; anything else that is not SVG (JPEG, WebP, GIF) comes
  back as a JPEG at quality 80. Never prove an upload by comparing bytes or
  hashes. Decode both and compare pixels (exact for a PNG within the cap, a PSNR threshold otherwise). It can also
  hand back an earlier upload of the same file, with that upload's old signed URL stored as the
  value, so check a reused upload's URL has no baked `Expires=` before trusting it.
- **`media_files` rows live in the main Vivreal database**, not the tenant database (`pod_01`
  and friends), and the name field is `fileName`. A lookup against the tenant database returns a
  false zero.

## Writing a help or vivreal.io row

`help-page-producer`'s PUBLISH mode follows this section, and so does any reviewed one-shot that
writes a row of either site.

- **Every row saves through the portal's `collectionObjects/update`, and the CMS sets
  `objectValue` and `publishDate` whole.** Send the full `objectValue`, or `article`, `kind`,
  `band` and any field the list's schema does not declare (a Home Use Cases row keeps a `panel`
  object) are lost. Send the stored `publishDate`, or the row unpublishes, and the stored
  `usingVariant`, or the proxy writes `{}` over it.
- **The answer is `{ success, data: { groupID, updated } }`.** `data.groupID` is the guard that the
  right business is active; assert it on every write.
- **`raw._id` in a page's payload is the sub-document id.** The document id is the rendered item's
  own `id`. Table row keys and aside note keys are already document ids. A plan that cites
  `objectValue._id` updates nothing, or the wrong row.
- **A table row's first cell is `title`;** the rest are `values` lines `"Column | Value"`, with the
  prefix byte-identical to the column heading.
- **Headings also live in Help Article Contents rows** (matched by `anchor`), and index cards are
  Help Articles rows: change all three or none.
- **A band with a `video` shows the video, never its `image`.** Check the video's frames before
  calling a band's media current.
- **Blog bodies hold no table tags** (they print as run-together text). Use headings and short
  lists.
- **A new page is a site-document write** (pages keep `blocks` and a mirror `collections` array),
  never a row write, so `help-page-producer`'s PUBLISH mode cannot make it. It is a content add,
  and content adds go through the product's own screens (owner rule P-content-through-ui): the page in Studio,
  its lists, rows and index card in the portal's content editor, by an agent acting as an owner
  would under a GO (`help-page-producer`'s ADD dispatch), before PUBLISH mode can fill it. A
  reviewed one-shot (`vivreal-workflow:ops-one-shot`) is only for a step those screens cannot do,
  named with why. Plan the add up front, when the article list is made, not when the drafts are
  approved: the 2026-11 release's 26 new help pages, made by one-shot before this rule
  (`${VIVREAL_REPOS}/_ops/open-backlog-2026-11-help-pages`), waited on it.
- **Never re-run a help site loader:** it duplicates every entry.

## Help site structure that trips a duplicate check

- **Table rows share a band.** Many rows sit in one `band`, so a "does this row already exist"
  check needs `band` AND `order`, not the band alone. A band-only check matched the row before it
  and stopped a real publish with a false duplicate on 2026-10-15.
- **A row's place in its section is a stored number no screen sets** (release B help publish,
  2026-11-19). A Sections list's schema carries no `order` field, `order` is a system key the
  portal's content editor never shows (portal `src/lib/schema/i17FieldTables.ts`), and a published
  list sorts by `objectValue.order`, then `objectValue._system.order`, then `_id`, with a MISSING
  order sorting FIRST (VR_Client_API `src/services/tenant/HelpFunctions/collectionObjectOrder.js`).
  So a row added in the content editor draws at the TOP of its section, and its long-text box also
  adds `target="_blank"` and `rel` to every link. A new row on an existing help page is therefore a
  step the screens cannot do: plan it as help-publish's create (the same portal route), which lands
  LAST in its section (`nextOrder`, the highest order plus one), and name that reason.
- **Never leave a bound section empty.** A bound steps section with no rows still draws its title
  and an empty message, so create the replacement rows before deleting the old ones, never after.
- **Stored forms:** help step rows hold their text in `description` and their `step` as text
  ("1" to "5"), never a number; band bodies store `&` as `&amp;` (plain-text card fields such as
  `aiContext` keep a bare `&`); a band row has ONE `imageAlt` and ONE `imageCaption` for its phone and
  computer pictures, so write words true of both.
- **The help search reads only the index cards** (release B triage, 2026-11-19). The `/search`
  page's first binding that declares `queryFields` wins (`vivreal-knowledge:vivreal-renderer-knowledge`),
  and the help site's names `title`, `description` and `section` over the Help Articles list.
  Article text lives in each article's Sections list, which search never reads, so a search miss
  proves only that no card holds the word; read candidate pages' bodies before calling a topic
  absent. Studio shows `queryFields` read only until portal 0.46.0 (`src/lib/sites/sectionConfigCopy.ts`
  on `origin/stable`), whose F550 adds "What a search looks through" on a lookup page's layout
  section, so changing what the help search reads is a Studio change from then on, never a script.
- **A plain curl of a help page finds almost no words.** The server HTML is a streamed skeleton;
  the text sits in entries, table rows and aside notes inside the page's React payload. Read the
  settled page in a browser, or parse the payload.

## Reading what you published

- **The help sitemap leaves out noindex pages** by design (Templates `src/lib/seo/sitemap.ts`,
  `pageIndexingBlock`). Count the expected sitemap entries from the indexable pages only; /search
  is withheld on purpose.
- **Images in a page are served through `/_next/image?url=...`.** Unwrap the `url` parameter
  (URL-decode it) before matching an S3 key, or every key reads as missing.
- **The Client API edge caches content for about a minute** (`vivreal-client-stack-knowledge`,
  the API edge cache), so a read straight after a write can still be old. Wait it out before
  calling a write failed.
- **Which vivreal.io pages are ISR cached** (home and /domains, five minutes plus a long
  stale window): `vivreal-templates-knowledge`, "Which pages actually cache".
- **A purge does not make the site fresh everywhere at once.** What it reaches and how to prove
  freshness lives in `vivreal-infra:vivreal-media-cdn`, "Purging an edge cache". Never call
  `/api/revalidate` by hand.
- **A vivreal.io screenshot swap needs no CMS write:** overwrite the same S3 key (the bucket is versioned, so it reverts), purge through `cdn-purge`, and verify by content hash.
- **vivreal.io page structure traps:** each section exists twice (`blocks[]` and `collections[]`) and editing one renders nothing; a bulk create leaves `publishDate` null, so its rows render nowhere; the compare pages hardcode their competitor list.
