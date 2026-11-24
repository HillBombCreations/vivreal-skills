# The Next Release Picks sheet: recipes

The owners pick backlog rows and watch each release in the Next Release Picks sheet, a Sheets
artifact in a Claude Docs project. Its location is the key `releaseSheetUrl` of
`${VIVREAL_REPOS}/_wt/hq-main/.vivreal/private-names.json`; open it by that value, and never write
the location into a shared file. The rule behind it is P-sheet (vivreal-hq
`docs/standards/process.md`).

## Who writes it, and when

- **Only a main thread writes the sheet, never a subagent.** A subagent reports; the main thread
  writes. `vivreal-workflow:ledger-keeper`'s SHEET-PREP mode (release C, L-C-16) is the subagent
  that prepares a refresh: it reads the sheet and the records and returns an edit list, never a
  write; the main thread re-reads each cell it names and applies the list.
- **Re-read the cells you will change before every write.** The owners edit it by hand.
- **Update it with every batch state change** (built, a review verdict, a publish, a promote
  proven): the release tab's row AND each Backlog row that batch carries, in the same pass as the
  release's `progress.md`.
- **Flip a Backlog row to Released only when its step is proven live**, never before.
- **Set your owner's name in Assigned to before starting a row** (section below). Your owner is
  the one the session's `gh` login names (P-go-form; release-conductor section 4).

## Tabs

- **Backlog**: every owed item, one row each.
- **One tab per release** (and one for a hotfix release): each release step with its status, its
  GO, the proof time in UTC and links. A release tab starts with one "Build: <repo>" row per batch.
- **Post-release**: one row per owed item of the release's `post-release-list.json`.
- **Docs**: links to the plans, progress, decisions, backlog, triage, reviews and research on the
  release-state branch, plus a "How to use Assigned to" row.

## Backlog columns, in order

Pick, ID, Assigned to, Item, Priority (P0 to P3), Recommended release, Why this priority, Theme,
Your note, Size, Status note, Repos, Dated, Links.

- **Your note is the owners' own column. Never write it.**
- **Recommended release** takes a release letter, "After <letter>", "Later" or "Drop"; blank means
  shipped or closed, nothing owed.
- **Status note** says the exact state: which PR, built, in review, approved, and which step makes
  it live.
- **Sorted by Recommended release, then Priority**, with the done rows (blank release) at the
  bottom. A new row goes inside its release group, inserted beside a row of that group so it takes
  the dropdowns; or append it and re-sort (sort by Priority first, then by Recommended release,
  each a stable sort).

## Vocabularies

- **Pick:** Next release (picked, not started), In progress (being built, reviewed or published),
  Open (not started and not scheduled; Recommended release says when), Released (live and
  proven), Close (done with no ship), Later (the owners deferred it), Drop. "In hotfix" is unused.
- **Assigned to:** an owner's name means being worked now; "<name> (planning)" means being scoped
  or designed, so check with that owner before building; blank means free to pick up. Released
  and closed rows keep the name of who delivered them.
- **Release tab status:** Live, Done, Approved, In review, Built, Building, Research, In progress,
  Waiting, STOP.
- **Post-release tab columns:** Group, ID, What to do, When, Who, Assigned to, Status, How we know
  it is done, Source. Status takes Owed, Dated, Waiting on step, Owner, UNVERIFIED or Done.

## How a write is made

- Writes go through the Claude Docs `update` tool with `engine: "workbook"` and `applyEdits`
  against the sheet's LATEST revision: read the revision first, never reuse a remembered number.
  `alignment.wrap` takes `true` or `false`.
- **More than a few hundred cells:** write a CSV, upload it with the Artifact tool as an asset of
  the sheet's URL, run `importFile` (it lands in a temporary tab), `copyCells` into place, then
  `deleteSheet` the temporary tab. Dropdowns land as text, so run `makeDropdown` over the range
  after the copy.
- A Bash command holding the word `lambda` and backslashes trips the vivreal-infra lambda env
  guard (it reads Python's `key=lambda` as an AWS call). Put such a script in a file and run the
  file.
