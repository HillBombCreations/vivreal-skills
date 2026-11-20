# Portal UI rules: the owners' corrections, as standing rules

**What this is.** Every UI correction the owners have made to the portal, written as a rule with
the shared component that does it right. The owners kept catching the same misses in portal
builds: a help mark on a row of its own, cards of different heights and casing, bare selects and
inputs beside the styled ones, hand-built tabs, a sheet that would not scroll, a page that froze
after a save, posts that did not look like their platform. Each rule below is one of those
catches. Read every theme a change touches before any portal UI work, and check those rules again
before reporting the change done (`vivreal-principal:portal-coder`, "UI pre-done checklist").

**Source.** The owners' record, vivreal-hq `docs/standards/portal-ui-feedback.md` (private): owner
items `UF-001` to `UF-113`, approved agent corrections `A-01` to `A-12`, the 80 rules in 14
themes, the gaps, and the owners' answers to its framing questions (2026-11-19). The ids after
each rule cite that record; the owners' own words live only there. Where an answer of 2026-11-19
changed or settled a rule, the rule says "owners, 2026-11-19". An owner correction that came after
the record carries its own date and backlog row instead (PAGE-9), making 81 rules here.

**Paths.** Every path is in `${VIVREAL_REPOS}/Vivreal_Portal_Mobile/`, read at `origin/stable`
`9974e41b` (v0.46.0). Re-read a file at the current deployed line before you rely on it; a moved
path is a reason to look, never a reason to hand-build.

**Gaps.** A rule whose "Use" names a gap has no shared component for that part yet. Do not
hand-roll one and do not copy a hand version: ask the owners first (the list is at the end).

**Framing.** When the look, the placement, the order, the shape per width or the words that frame
a feature are not settled by a rule here, by the record, by an owner-approved mockup the plan
names, or by the owner-approved plan's own words, stop building that piece and report the question
to whoever dispatched you, who asks the owners (PROC-5). Never pick one to keep moving.

## 1. Cards: products and orders (7)

- **CARD-1. Show a thing the way the place it lives shows it.** A product is the site engine's own
  product card in the shop's look, on Sales and on every channel's product list; its name is as the
  owner typed it (TITLE-5). (UF-097) Use: `ShopProductCard`
  (`src/components/Integrations/Pages/Stripe/Components/ShopProductCard.tsx`).
- **CARD-2. Products and orders are one card family:** the same shell, divider, tray, chips, "..."
  button and state words. (UF-032, UF-105, UF-107) Use: `Card variant="tile"`
  (`src/components/UI/card.tsx`), `Chip` and `StateChip`
  (`src/components/Universal/StateChip/index.tsx`); the order card is the reference
  (`src/components/Integrations/Pages/Stripe/Components/OrderCard.tsx`). Gap G3: the product card
  still hand-writes its tile classes (`renderProduct.tsx`); never copy them into new work.
- **CARD-3. Every card in a list is the same shape:** the same header height, type scale and casing,
  whatever the data. A card that lists items shows the same fixed number of item lines on every
  card (about two), then "and n more", so every card in a row is the same height; cards are not
  stretched to equal height around uneven content (owners, 2026-11-19). Check with 1, 2 and 4 or
  more items at 390 and 1440. (UF-111) Use: `Card variant="tile"`; gap G3 for the fixed-lines
  header (`OrderItems.tsx` shows one to three lines today, so its height follows the data).
- **CARD-4. A number lives on the thing it counts,** never in a second place such as a summary strip.
  (UF-002, UF-015) Use: the thing itself (a site's views sit on its tile,
  `src/components/Dashboard/SiteTiles/index.tsx`).
- **CARD-5. The common action is on the card; a rare or risky one lives in its "..." menu.** (UF-096,
  UF-098) Use: the product card's tray and menu
  (`src/components/Integrations/Pages/Stripe/Components/renderProduct.tsx`).
- **CARD-6. The chrome is quiet and the customer's content is rich:** no border, corner and padding
  furniture around a name; the detail goes into the thing the customer made. (UF-051) Use:
  `PostShell` (`src/components/Integrations/Pages/Social/Components/PostShell.tsx`).
- **CARD-7. Phones get the full card, never a cut-down one.** (UF-098) Use: the same card component at
  every width (`renderProduct.tsx`).

## 2. Dialogs and sheets (6)

- **SHEET-1. A sheet that can outgrow the screen pins its title and its action and scrolls only its
  body.** Never a scroller with no height inside a max-height column. (UF-057, UF-089) Use:
  `BottomSheetContent pinned` with one `BottomSheetBody` (`src/components/UI/bottom-sheet.tsx`);
  `pinned` is off by default, so pass it (gap G6). References: the order view
  (`src/components/Integrations/Pages/Stripe/Dialogs/ViewOrderDialog/index.tsx`) and the Add stock
  sheet (`src/components/Integrations/Pages/Stripe/Components/RestockSheet.tsx`).
- **SHEET-2. Every task window is a bottom sheet on a phone and a right-side sheet on a computer,**
  everywhere, the remaining centred task dialogs included; only a short yes or no confirm may stay a
  small centred dialog (owners, 2026-11-19). (UF-033, UF-034, UF-065, UF-089, A-03) Use:
  `BottomSheet` below `md` and `Sheet side="right"` from `md` (`src/components/UI/sheet.tsx`),
  chosen with `useIsMobile` (`src/hooks/use-mobile.tsx`), composed as the order view and the Add
  stock sheet compose them; a confirm uses `ConfirmDiscardDialog` or `src/components/UI/dialog.tsx`.
  Gap: no one shared component wraps both shapes; compose the two primitives, and ask before
  building a wrapper.
- **SHEET-3. One close per sheet, 44px, on the title row.** (UF-053, UF-110) Use:
  `SHEET_CLOSE_IN_TITLE_ROW` (`src/components/UI/sheet-title-row.ts`) in a sheet; `PageBoard`'s
  `trailing` slot on a page that works like a sheet.
- **SHEET-4. A nested view opens at its own top,** never at the scroll height of the view it came
  from. (UF-068) Use: no shared component; reset the scroller on open and test it.
- **SHEET-5. A sheet that edits something visible shows it changing:** it opens or scrolls the
  preview to the part being edited, as the other pieces do. (UF-073, UF-074, UF-093, UF-102) Use:
  Studio's preview (`src/components/Sites/Studio/LivePreview.tsx`, `PreviewCartParts.tsx`) and the
  phone sheet that keeps it visible at half height (`src/components/Sites/Studio/MobileEditSheet.tsx`).
- **SHEET-6. Nothing floats over the content it describes or over the main button;** every overlay is
  portaled to the body. (UF-022, A-05, A-06) Use: the Radix primitives in `src/components/UI/`
  (they portal); anything else through `createPortal(..., document.body)`.

## 3. Help marks and header rows (5)

- **HELP-1. A help mark never takes a row of its own.** On a page it sits on the board's sentence
  row; in a sheet or a dialog it sits beside the title, just before the close, at every screen
  size, computers included (owners, 2026-11-19). (UF-038, UF-053, UF-056, UF-060, UF-100, UF-110)
  Use: `PageBoard`'s `help` (`src/components/Universal/PageBoard/index.tsx`); `SHEET_TITLE_ROW` and
  `SHEET_HELP_IN_TITLE_ROW` (`src/components/UI/sheet-title-row.ts`). Gap G4: `FullScreenDialog`,
  `StepDialog`, `BusinessDialogShell`, `UI/dialog` and `UI/bottom-sheet` have no help slot, and
  from 768 the Studio panels and Add a page still put the help link on a line under the title.
- **HELP-2. Header icons centre on the title's first line and their whole 44px answers a tap;** the
  title and subtitle wrap rather than squeeze. (UF-101, UF-103, A-04) Use:
  `SHEET_ICON_ON_TITLE_LINE` and `SHEET_DIALOG_TITLE_IN_ROW` (`sheet-title-row.ts`).
- **HELP-3. One header arrangement everywhere:** back, title or sentence, help, one create action,
  "...", close, in that order. A difference is a named variant of the shared header, never a
  hand-built one. (UF-038, UF-047) Use: `PageBoard` (`back`, `fallback`, `help`, `primary`, `more`,
  `trailing`).
- **HELP-4. One help link per surface, and it opens its article, never the help home.** (UF-021,
  UF-040) Use: `HelpLink` (`src/components/Universal/HelpLink/index.tsx`): `row` in a header,
  `sentence` at the end of an empty state's line.
- **HELP-5. Help is light:** a link to the article beside each piece, not videos everywhere.
  (UF-021, UF-087) Use: `HelpLink`.

## 4. Titles and long words (5)

- **TITLE-1. A title wraps to at most two lines, then cuts with "..."** (owners, 2026-11-19, for every
  title: page, sheet, dialog and card). A page board sentence is at most two lines at 360 with its
  controls present; copy that needs three is rewritten. A heading follows what the person is on,
  never what they are browsing. (UF-025, UF-044, UF-101) Use: `PageBoard`;
  `SHEET_DIALOG_TITLE_IN_ROW`. Gap G4: `FullScreenDialog`, `StepDialog` and `BusinessDialogShell`
  cut their titles at one line, and no shared two-line title exists.
- **TITLE-2. A heading never shares a row with a button in a way that squeezes it into a column.**
  (UF-025) Use: `PageBoard` (its create action is a 44px "+" below 640).
- **TITLE-3. A long name never pushes a page sideways:** the text is `min-w-0` and wraps, and an end
  slot caps its width. (UF-035, UF-052) Use: `NamedRule`
  (`src/components/Universal/NamedRule/index.tsx`).
- **TITLE-4. The words that tell two things apart are never cut:** a product's size or option, a
  sheet's own name, a button's label (A-07; owners, 2026-11-19). Use: the two-line rule above;
  where a cut would still hide them, the layout gives them a line of their own.
- **TITLE-5. Names show exactly as the owner typed them:** item and product names on a portal card
  keep the owner's casing whatever the shop's style, and the live site keeps its own look (owners,
  2026-11-19). One casing rule across a card. (UF-111) Use: no shared component; the order card's
  item lines (`OrderItems.tsx`) take the shop's capitals today, which this rule replaces.

## 5. Forms: shared controls only (9)

- **FORM-1. Every control is the `src/components/UI` primitive:** `Input`, `Textarea`, `Select`,
  `Checkbox`, `RadioGroup`, `Switch`, `SegmentedControl`. Never a bare `<input>`, `<select>` or
  `<textarea>`. (UF-049, UF-091, UF-106) Guard: `tests/unit/lint/noNewBareFormControls.test.ts`
  fails a new one, and its frozen numbers may only go down; when counting what is left, use its
  numbers (G8).
- **FORM-2. A field is one box:** 44px minimum, the 10px corner, `--border-strong`, 16px words, so a
  typed field and a picked one line up. (UF-049) Use: `src/components/UI/input.tsx`,
  `src/components/UI/select.tsx`.
- **FORM-3. Labels sit above their control,** the same for every field in a row, and the boxes stand
  level. (UF-023, UF-090) Use: `Label` (`src/components/UI/label.tsx`);
  `src/components/Integrations/Pages/Stripe/Dialogs/TrackingFields.tsx` is the pattern.
- **FORM-4. Essentials first, then inputs, then toggles:** the most-used settings go at the top even
  when one is a toggle, and within the rest inputs come before toggles (owners, 2026-11-19). An
  input that belongs to a toggle sits under that toggle. Sweep every Studio panel the change
  touches. (UF-104) Use: Studio's panel order (ST-1); no other shared component.
- **FORM-5. A field the owner does not need is removed, never marked "don't fill this";** its value
  stays as hidden data when something reads it. (UF-062, UF-077) Use: no component (a removal).
- **FORM-6. A quick amount shows the plain number it adds and previews the result.** (UF-099) Use:
  the Add stock sheet (`RestockSheet.tsx`).
- **FORM-7. An unticked checkbox is drawn in `--border-strong`.** (UF-107) Use:
  `src/components/UI/checkbox.tsx`.
- **FORM-8. State is visible:** a saved panel says so until a value changes, and a hidden refusal or
  an active filter says it happened. (UF-012, UF-013, UF-014, UF-016, UF-018, UF-064, UF-094, A-02)
  Use: the cart settings save button that reads "Saved"
  (`src/components/Sites/Studio/LeftRail/chrome/CartSettingsEditor.tsx`); `StateChip` for a state
  word.
- **FORM-9. No unsaved-changes warning when nothing changed.** (UF-039) Use: `ConfirmDiscardDialog`
  (`src/components/Universal/ConfirmDiscardDialog/index.tsx`), raised only on a real difference.

## 6. Selects and dropdowns (5)

- **SEL-1. One select: `UI/select`.** Never the browser's own select. (UF-007, UF-049, UF-091) Use:
  `src/components/UI/select.tsx`; guard `tests/unit/components/UI/selectTriggerIsTheField.test.ts`.
- **SEL-2. The trigger is the field box and the menu takes the control's corner:** 44px rows at 16px,
  the tick at the trailing edge. Never pass a class that changes the corner, the height or the text
  size. (UF-049) Use: `select.tsx`.
- **SEL-3. Pick the control by the count:** two or three choices are a `SegmentedControl` (a form
  control, never page navigation), an either-or is a `Switch`, up to about fifteen is the select,
  and a longer list needs search: one shared searchable select, a bottom sheet with a search box on
  a phone and a dropdown with search on a computer (owners, 2026-11-19). (UF-007) Use:
  `src/components/UI/segmented-control.tsx`, `src/components/UI/switch.tsx`, `select.tsx`. Gap G2:
  the shared searchable select is not built; `StateSelect`, `ContentSourceSelect` and the business
  time zone row are three hand versions. Do not add a fourth; ask.
- **SEL-4. An important action is never the last option in a dropdown;** it gets its own visible
  button. (UF-080) Use: Studio's page picker
  (`src/components/Sites/Studio/LeftRail/PageSelector.tsx`) is the pattern.
- **SEL-5. Every select and view switch is fully styled, with a pointer cursor.** (UF-045, UF-113)
  Use: `select.tsx`; `SectionSwitcher` for a view switch. The base layer gives every enabled button
  the pointer, so never strip it.
- **Two short selects that belong together** (Show and Sort by) share one row on a phone, half the
  width each, when they fit at 390: PAGE-9 under Page layouts.

## 7. Tabs and section switching (5)

- **TAB-1. One section switcher on every page: `SectionSwitcher`.** A segmented track below `md`,
  underline tabs from `md`, and a "Section" chip that opens a sheet when the labels do not fit at
  360. (UF-029, UF-045, UF-113) Use: `src/components/Universal/SectionSwitcher/index.tsx`.
  `src/components/UI/tabs.tsx` has no importers: never import it. Known miss (G1): Campaigns
  hand-builds its own tabs (`src/components/Campaigns/CampaignList.tsx`); moving it onto the
  switcher is owner-approved (TAB-4).
- **TAB-2. No nested tabs.** A page that carries two hierarchies gives each its own home. (UF-020)
  Use: `SectionSwitcher`, one level.
- **TAB-3. An in-context switch (list or grid, two to five choices inside a form) is a
  `SegmentedControl`, never page navigation.** (UF-020) Use: `src/components/UI/segmented-control.tsx`.
- **TAB-4. Tabs open on what the owner wants first:** live and sent work first, drafts after. On
  Campaigns that is the sent campaigns first and Drafts second, on the shared switcher (owners,
  2026-11-19). (UF-019) Use: `SectionSwitcher`, its first tab the default.
- **TAB-5. Never a sideways-scrolling tab strip,** or any sideways strip of controls. (UF-006) Use:
  `SectionSwitcher`'s chip and sheet when the labels do not fit.

## 8. Page layouts (9)

- **PAGE-1. Lay a page out for the owner's job, not by copy and paste:** one heading primitive, one
  header arrangement, one container; a difference is a named variant. (UF-026, UF-027, UF-028,
  UF-047, UF-050) Use: `PageBoard`, `PageContainer`, `NamedRule`.
- **PAGE-2. Every page uses the shell:** `PageContainer` (full width with gutters), the `PageBoard`
  heading row, at most two rows between the heading and the content (a switcher, a status line, a
  toolbar or a lead rule), and `NamedRule` for sections. (UF-024, UF-029, UF-030, UF-031, UF-076)
  Use: `src/components/Universal/PageContainer/index.tsx`, `PageBoard`,
  `src/components/Universal/PageToolbar/index.tsx`, `NamedRule`; guards `e2e/page-tops.spec.ts` and
  `tests/unit/components/Universal/pageTopRules.test.ts`.
- **PAGE-3. The main content shows without a big scroll:** in the installed app at 390 by 797 the
  first item sits above the tab bar, and what the owners want seen first (an offer above the options
  it is about) comes first. (UF-076, UF-095, UF-109) Use: `PageBoard` plus `PageToolbar`.
- **PAGE-4. No summary tile rows, ever:** no strip of three or four tiles across the top with the real
  content below. (UF-002, UF-015) Use: a band, the board's sentence or uneven columns.
- **PAGE-5. Desktop is its own deliberate pass:** extra width buys more content, never floating dead
  space or a column of air. Lists, boards and dashboards stay full width; forms, settings and long
  text cap at a readable width, centred (owners, 2026-11-19). (UF-002, UF-004, UF-037, UF-046,
  UF-082) Use: `PageContainer` for the full width. Gap: no shared capped width for forms and
  settings exists. `PageContainer`'s own note says a paragraph and a lone form field "keep their
  own measure (about 68 characters, about 480px) INSIDE a full-width section whose named rule spans
  the whole width", set on the paragraph or the field, because "nothing is centred in air". The
  owners' answer replaces PageContainer's note for forms and settings; ask only how wide, and where
  the cap lives.
- **PAGE-6. One create action on the heading row, the rest behind "...", every button in the
  product's style.** (UF-038, UF-042, UF-076) Use: `PageBoard`'s `primary` and `more`
  (`src/components/Universal/PageMoreMenu/index.tsx`); `Button` (`src/components/UI/Button/index.tsx`).
- **PAGE-7. Keep page actions where the owners put them:** the dashboard's quick actions last, under
  the content, never in a side rail; Support before Visit site. (UF-001, UF-010) Use:
  `src/components/Dashboard/QuickActions/index.tsx`, in its place.
- **PAGE-8. Never a horizontal scroll, anywhere.** (UF-006, UF-036, UF-052) Use: `NamedRule` (a long
  name yields) and `SectionSwitcher` (a chip, never a strip).
- **PAGE-9. Short paired controls share one row on a phone.** A pair like Show and Sort by sits on
  one row at phone width, half the width each, whenever both fit at 390 with their labels and their
  longest value; they stack only when they do not fit. (owner feedback 2026-11-19, F566; added after
  the record's 80) Use: two `UI/select` fields side by side in a two-column grid, each keeping the
  field box (SEL-2); no wrapper component. Known cases, both named by F566: the Sales products list
  (`src/components/Integrations/Pages/Stripe/Sections/products.tsx`), which stacks them today, and
  Orders' Show select, once a second control joins it
  (`src/components/Integrations/Pages/Stripe/Sections/orders.tsx`, which has Show alone today).

## 9. Performance and freezes (4)

- **PERF-1. One scroll lock per sheet, owned by the sheet;** a wrapper never locks again. A test opens
  and closes it and asserts that the body's `position` and `overflow` and the html `overflowY` are
  empty afterwards. (UF-092) Use: `ViewItem`'s lock (`src/components/Universal/ViewItem/index.tsx`);
  `tests/unit/releaseB/p378MenuButtonScrollLock.test.ts` is the test shape. Gap G5: a second hand
  copy lives in `src/components/Group/InviteUser/index.tsx`, and no shared, counted lock exists. Do
  not write a third; ask.
- **PERF-2. One request per need per page.** (UF-088) Use: one shared fetch per page; no component.
- **PERF-3. Changing a period shows loading in the layout's shape and settles without a jump.**
  (UF-043) Use: the screen's own skeleton (the `Client` and `Loader` split).
- **PERF-4. After any save the screen stays responsive, on every save path and every heavy list you
  touch.** Right after the save, the screen scrolls and takes input in the installed app at 390,
  and in a computer browser, where the document is the scroller. The owners know of no other frozen
  screen, which does not mean there is none (owners, 2026-11-19), so the check is general; the
  known example is a product sheet on Sales that left the page unable to scroll after a save. (UF-092)
  Use: the PERF-1 test shape.

## 10. Social post previews (6)

- **SOC-1. A post is drawn close to its platform:** that platform's post layout and proportion, its
  mark, and its likes, comments and shares shown the way it shows them, read only (owners,
  2026-11-19). (UF-051, UF-112) Use: `PostShell` and the per-platform cards
  (`InstagramPostCard.tsx`, `FacebookPostCard.tsx`, `TikTokPostCard.tsx`, `LinkedInPostCard.tsx`, in
  `src/components/Integrations/Pages/Social/Components/`).
- **SOC-2. No fake buttons:** no like button, comment field or share control that looks live and does
  nothing. The mark and the counts are shown, never offered as controls. (UF-051, UF-112) Use:
  `PostShell`.
- **SOC-3. The state chip above and the result line below are the same on every post,** so scanning
  survives. (UF-051) Use: `PostShell` with `StateChip`.
- **SOC-4. Socials shows posts as a grid, the way the platforms do.** (UF-079) Use:
  `src/components/Social/Hub/SocialPostGrid.tsx`.
- **SOC-5. The same idea reaches products:** a thing is shown as its own channel shows it. (UF-097)
  Use: `ShopProductCard`.
- **SOC-6. Compose is one pass:** one caption with a per-platform change switch, several photos at
  once, no raw markup in a caption. (UF-011, UF-083, UF-084) Use: the composer
  (`src/components/Integrations/Pages/Social/Composer/`, `CaptionField.tsx`).

## 11. Phone first (5)

- **PH-1. The installed app at 390 is the main mobile view.** Check it first, then the 390 browser,
  then 1440. (UF-058, UF-069, UF-108) Use: no component; the check itself.
- **PH-2. Design for standalone spacing;** never add or double a safe-area inset. (UF-048, UF-055)
  Use: `PageContainer` (adds none) and `src/components/AppChrome/index.tsx` (owns the inset).
- **PH-3. Both widths, every time.** (UF-004, UF-020, UF-024, UF-046) Use: no component; the check.
- **PH-4. Where a header holds icons, also check 320 and 360.** (UF-101) Use: no component; the
  check.
- **PH-5. Every control is a 44px target and its whole area answers a tap,** measured in a real
  browser. (UF-072, A-04) Use: `Button`; `SHEET_ICON_ON_TITLE_LINE` in a sheet header.

## 12. Copy (4)

- **COPY-1. Words follow vivreal-hq `brand/voice.md`:** zero em or en dashes, words an owner uses, US
  spelling (calendar, canceled, color), and never "tap" said to someone on a computer. (UF-063, A-11)
  Use: no component; the voice guide.
- **COPY-2. Search words are plain:** "show up when people search online", never SEO, meta or one
  search engine's name. (UF-061) Use: no component.
- **COPY-3. Every word on screen is true:** name every option a feature supports, say a setting from
  the owner's side (delivery is the owner's offer), one name per state. (UF-003, UF-008, UF-078,
  A-09, A-12) Use: no component.
- **COPY-4. An icon that could be misread carries a word.** Support keeps its headphones icon, with
  its word beside it (owners, 2026-11-19). (UF-010) Use: the existing support entries; never swap
  the icon.

## 13. Studio panels and pickers (6)

- **ST-1. Essentials first:** the words and pictures an owner came to change at the top, exact sizes
  and positions at the bottom, collapsed. (UF-066) Use: Studio's disclosure rows
  (`src/components/Sites/Studio/LeftRail/disclosure/`; `EditorFineTuning.tsx` is the collapsed
  foot).
- **ST-2. A photo and its controls stack in one column at every width;** never a panel split in half.
  (UF-023, UF-067) Use: `src/components/Sites/Studio/LeftRail/disclosure/PhotoField.tsx`.
- **ST-3. A new picker entry looks exactly like the existing ones** (card, preview, name, description,
  grouping), and pickers can filter. (UF-005, UF-009, UF-017, UF-085) Use:
  `src/components/Sites/Studio/LeftRail/BlockPalette.tsx` and `disclosure/LayoutPickerView.tsx`.
- **ST-4. Hide the plumbing and leave nothing unreachable:** make the list a section needs, show what
  is unpublished, and give every stored setting a control. (UF-013, UF-014, UF-041, UF-081, UF-086,
  A-10) Use: no shared component.
- **ST-5. On a phone a tap on a section opens its editor.** (UF-071) Use: `MobileEditSheet.tsx`.
- **ST-6. A Studio setting shows in the preview exactly as on the live site.** (UF-070, UF-075,
  UF-093, UF-102) Use: Studio's preview (`LivePreview.tsx`, `PreviewSeam.tsx`).

## 14. How UI work is done (5)

- **PROC-1. Sweep the neighbours:** a fix for a reported UI defect covers every screen with the same
  cause, as one shared fix (owner rule P-neighbours). (UF-054, UF-059, UF-110, A-01) Use: no
  component.
- **PROC-2. Build the approved mockup exactly, at every width,** including its live parts; report
  anything narrower as a deviation before review. (UF-105, A-03, A-08) Use: no component.
- **PROC-3. Prove a layout by measuring the rendered page** (a box read from the browser, or a
  screenshot you opened), never by asserting class names. (the record's PROC-3) Use: no component.
- **PROC-4. A look change gets an owner-approved mockup first.** (UF-098, UF-105, UF-108) Use: no
  component.
- **PROC-5. When the framing is not settled, ask the owners before building.** Stop that piece and
  report the question to whoever dispatched you, who asks the owners; never pick. (UF-112) Use: no component.

## Gaps: no shared component yet; do not hand-roll; ask

- **G2, a shared searchable select** (SEL-3). The owners want one, for lists over about fifteen: a
  bottom sheet with a search box on a phone, a dropdown with search on a computer. Not built. Three
  hand versions exist (`src/components/Universal/StateSelect/index.tsx`,
  `src/components/Sites/Studio/LeftRail/ContentSourceSelect.tsx`, the business time zone row), and
  `select.tsx` documents the Studio delivery time zone as the one browser select left on purpose
  until this exists.
- **G3, a card header of fixed lines** (CARD-2, CARD-3). Nothing draws "the same number of item
  lines, then and n more" as one piece, and the product card hand-writes the tile.
- **G4, a sheet and dialog header with a help slot and a two-line title** (HELP-1, TITLE-1). Today it
  is a list of class constants (`sheet-title-row.ts`) applied by hand in three files
  (`MobileEditSheet.tsx`, Add a page, `MediaPicker`); `FullScreenDialog`, `StepDialog`,
  `BusinessDialogShell`, `UI/dialog` and `UI/bottom-sheet` have no help slot and cut their titles
  at one line.
- **G5, a shared, counted scroll lock** (PERF-1). Two hand copies exist.
- **G6, a long sheet that is safe by default** (SHEET-1). `pinned` is opt-in and `UI/dialog` scrolls
  its whole box, and no test catches a new sheet that scrolls its title away. Pass `pinned`.
- **One component for the task window's two shapes** (SHEET-2, from the 2026-11-19 answers). Compose
  `BottomSheet` and `Sheet side="right"` the way the order view does.
- **A capped, centred width for forms and settings** (PAGE-5, from the 2026-11-19 answers).

**Settled, not missing:** G1, tabs: `SectionSwitcher` is the component, `UI/tabs.tsx` is dead, and
Campaigns' hand tabs move onto it (TAB-1, TAB-4). G7, the support icon: keep the headphones
(COPY-4). G8, the bare-control count: use the guard's frozen numbers (FORM-1). Which screens froze:
no other is known, so every save path is checked (PERF-4).
