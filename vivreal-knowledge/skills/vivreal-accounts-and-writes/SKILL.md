---
name: vivreal-accounts-and-writes
description: 'Use before filming, walking or capturing anything in the Vivreal portal or on vivreal.io, and before any write a capture or walk makes. Carries which login to use for which business (the demo account, the QA scratch owner, the owner session), the eight-step owner-approved write protocol (named approval, snapshot, write through the UI, fresh-process read-back, restore, manifest entry), the never-list (Post, Publish, Schedule, Connect and the rest), and the rules for stills that fill vivreal.io marketing slots (pair by what the slot says, no demo site has its own web address, mask comped plan figures). Shared by footage-recorder, tutorial-maker, help-page-producer, qa-walker and marketing-auditor. Triggers on: which login, demo account, scratch owner, switch business, owner-approved write, write protocol, snapshot and restore, mutations, marketing still, screenshot swap, vivreal.io slot.'
---

# Accounts and owner-approved writes

The one home for these rules. It used to live inside the `footage-recorder` agent, where an agent in
another plugin could not read it. Every agent that films, walks or captures follows it as written.
`tutorial-maker`'s connect-and-post take is the single exception to the never-list, under its own
owner authority (2026-10-04); nothing else schedules.

## Which login, for which business

| Identity | How | Use it for |
|---|---|---|
| The demo account, `vivreal-content-demo` | The saved capture session (`packages/content-studio/capture-assets/auth.storageState.json`) | **The default for every shoot.** It reaches the Vivreal Content business and the Vivreal business. Its display name is "Cobalt Crumb", so "Signed in as Cobalt Crumb" is expected: it is the account's name, not a person, so never caption it as one |
| `vivreal/qa/walk-accounts#scratch-owner` (key `scratch-owner` of the shared QA bundle) | Secrets Manager, read ONE key in process (SDK `GetSecretValue` then `JSON.parse(...)["scratch-owner"]`, or the e2e harness resolver `vivreal/qa/walk-accounts#scratch-owner`); never `--output text` on the bundle, which would print all four QA logins; never printed, logged, passed on a command line or written to a file | **The QA v5 scratch business only** (owner, 2026-10-14), for example a site that has to be hidden from search. `agent-walk-user` cannot reach that business. Delete any saved session state file it produced at the end of the run |
| The owner's own session | The owner signs in and drives, or records | Frames that need the owner's own connections. **Connections are per person**: the AI agent and Connected apps screens show the signed-in person's connections, so the demo account films an empty or different list |
| Anything else | | Ask the owner first. Never `justin@vivreal.io`, which reaches real customers |

| Business | What it is for | Watch out |
|---|---|---|
| **Vivreal Content** | The default filming business | A **prospect** business, so the search-visibility UI (status line, "Let people find your site", the Home card) is hidden there by design. Its channels are Vivreal's own real accounts. Read its tier and `dbKey` live; never quote them from a file |
| **Vivreal** (vivreal.io) | Read-only shots of surfaces Vivreal Content hides, search visibility above all | A real, live business. Read only |
| **QA v5 scratch** | The scratch business for approved writes (hide and restore, add and delete) | Only through `vivreal/qa/walk-accounts#scratch-owner` |

**Switching business is one `PUT user/switch-profile`**, the same on phone and desktop, and it is a
write: list it in `mutations[]` and switch back at the end. **Each browser context carries its own
business cookie**, so a phone window and a desktop context each switch, and switch back, on their
own. Phone: `[data-testid=mobile-header-avatar]`, then `[data-testid=mobile-header-switch-to-<key>]`.
Desktop: `button[aria-label="Open business menu"]:visible`, then the row. The portal renders TWO
buttons with that label (the phone avatar carries it too), so a bare selector matches both: read
and click only the visible one, in every session script. Chain the restore inside the same script and read the LAST `switch-profile` response;
restores crashed mid-run more than once on 2026-10-13. Never film the business list itself (see
filming-hygiene.md).

## The write protocol

Read-only by default. A write happens only when the owner approved **that** write, named in the
dispatch or in the run notes with its date. Approved so far (owner, 2026-10-13 and 2026-10-14):
switching to the Vivreal business and back; hiding a QA v5 scratch site from search, then restoring
it; an invite, then cancelling it; a booking added, then deleted; an item changed, then restored.
Every one runs the same eight steps, or not at all:

1. **Named approval.** Quote it in the manifest entry.
2. **One item.** One site, one booking, one invite. Never a batch.
3. **Snapshot first.** Read the exact fields the write will touch from the product's own read
   route, and save that JSON before the first press. A still is not a snapshot.
4. **Write through the product UI**, never behind it. A direct database write skips the site's
   revalidate webhook and the timestamps, so it is not what an owner does.
5. **Read back from a fresh process** (a new browser context or a new script), never from the page
   that wrote.
6. **Restore**, the same way.
7. **Read back again from a fresh process.** It must equal the snapshot. Name every field that does
   not come back byte-identical and why (hiding and restoring a site rewrites
   `searchVisibilitySetBy` and `searchVisibilitySetAt`), so the owner can accept it knowingly.
8. **Manifest entry** in `footage-manifest.json` `mutations[]`: `what`, the approval, the ids
   (site, group), `before`, `after`, `restored` (boolean), the restore time, the read-back, any
   non-identical fields, and `proof`. A run that crashes mid-write returns `failed`, never `ok`, and
   says loudly what is left dirty.

**Never, approved or not:** Post, Publish to a channel, Schedule, Send, Connect, Disconnect, Delete
anything that is not your own approved test item, Deploy, Purchase, Revert a site version, or save
the footer social panel. (Connect and Schedule of one approved calendar row happen only in
`vivreal-content:tutorial-maker`'s connect-and-post take, under its own owner authority, never here.)

**Never swap names in the page.** Editing a business or site name in the DOM before a capture fakes
the product (the "Harbour Street Barbers" still, 2026-10-14). If a frame needs a different name,
rename it in the product as an approved write (a believable demo name, recorded, read back), shoot,
then put it back. A help still must show nothing edited.

## Stills for vivreal.io marketing slots (learned 2026-10-15, the screenshot swap)

This section is the one home for these rules; any agent that captures or swaps a marketing still
follows it.

- **Pair a still to a slot by what the slot's copy says, never by filename.** S58 was paired to
  the "On your own web address (domain)" card because the filenames matched, and the new frame
  showed search settings instead. For every pairing, read the card's heading and body, then
  confirm the frame shows that thing.
- **No demo site has its own web address.** Every demo site lives on a `*.vivreal.io` subdomain,
  so no demo frame can show "your own web address" connected. For a custom-domain slot, use the
  connect-your-address flow (for example `point-your-address-computer.png`) or change the card's
  copy; never present a subdomain as an owned domain.
- **Mask the demo account's comped plan figures.** The demo business is on a hand-comped plan, so
  its screens say things a prospect reads as our pricing: "You are on Pro, at no charge",
  "Websites 15 of 40" (Pro is five websites), and storage figures that are not on /pricing. Check
  every figure against vivreal.io/pricing. Mask in the still itself (crop it out or cover it, and
  record the mask in the manifest), never by editing the page (see "Never swap names in the page" above).
- **The A19 home flip tiles have two images each.** The T1 to T6 swap keys are the tile BACKS
  (the hover screenshot). Each front is that tile's own image field in the CMS, so a front is
  changed by a CMS image write, not by overwriting a T key. The CMS publishing traps that go
  with it live in `vivreal-knowledge:vivreal-sites`, "Publishing to vivreal.io and the help site".
