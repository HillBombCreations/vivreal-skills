# Publishing to vivreal.io and the help site

The one home for what a script, a runner or an agent needs to know before it writes content,
images or captures into vivreal.io or help.vivreal.io (both are Vivreal sites built from
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

## Help site structure that trips a duplicate check

- **Table rows share a band.** Many rows sit in one `band`, so a "does this row already exist"
  check needs `band` AND `order`, not the band alone. A band-only check matched the row before it
  and stopped a real publish with a false duplicate on 2026-10-15.
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
