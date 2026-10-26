# tutorial-maker: connect-and-post measurements per provider

Moved out of the `tutorial-maker` agent body on 2026-10-14 (skills audit batch 5). Measured per provider during the
2026-10-04 to 2026-10-05 channel series (Instagram, LinkedIn, TikTok); the 2026-10-16 section adds the
one Socials composer that now schedules every channel. **Newest dated section wins**; re-probe any
selector on the day before a take rests on it.

## Contents (line numbers in this file)

- 49: MEASURED 2026-10-16, portal 0.36: ONE Socials composer schedules every channel
- 92: MEASURED 2026-10-04, Instagram retake 2 (video 1, shot clean, portal v0.33.1)
- 94: Disconnecting a wrong account works in the UI
- 100: A disconnected provider's Connect is `[data-testid=channel-offer-<key>] button`
- 102: Instagram forces its own login form even when the browser is signed in
- 108: The consent screen names the account
- 114: Composer
- 120: Instagram's schedule picker is IN-PAGE, not native
- 130: Connect-and-post: connect segment = browser, post half = the app (owner, 2026-10-06)
- 136: The phone pass of a connect-and-post cannot repeat the connect or the post
- 140: Resolve a selector BEFORE sending it
- 144: Use a fresh `REMOTE_DIR` per take
- 146: Harness defects found and fixed this run
- 162: Scope every scrub or bulk rewrite to the take's own paths. Never walk the scratchpad root
- 170: MEASURED 2026-10-05, LinkedIn (video 3): r01 published from the Vivreal Company Page
- 172: Posting identity, owner rule: every LinkedIn calendar row posts from the Vivreal Company
- 177: The identity is NOT picked inside the composer
- 187: Byte-compare the composer, do not eyeball it
- 191: After Publish
- 197: A killed agent does not kill its recorder
- 203: Never reuse the killed take's session folder for the new take
- 207: Git Bash rewrites a leading-slash argument into a Windows path
- 210: An inspector that finds a tab by URL must take the NEWEST match
- 212: Two takes attached to one Chrome corrupt each other's captions (FIXED in `tutorial-lib.ts`)
- 218: The orphan's encode failed
- 221: LinkedIn schedule, measured 2026-10-05 (r12, no recording, headless Playwright on the portal
- 228: A post filmed AFTER the real post carries tells
- 233: MEASURED 2026-10-05, TikTok (video 4): r11 scheduled Mon Oct 5 7:00 PM PT as @vivreal.io
- 235: Ending a stopped take that is still attached
- 241: TikTok pre-checks, all read-only in a throwaway tab
- 246: TikTok skipped its login entirely
- 253: The channel header shows the display name as a handle
- 257: Composer
- 265: The TikTok composer defaults Comment, Duet and Stitch to OFF
- 270: TikTok's schedule picker is the same in-page wheel as Instagram's
- 277: Picker defect (portal, unfixed): the FIRST row of a column cannot reach the centre band
- 287: Captions persist until replaced
- 290: The `tasks/` output folder of the session is shared with other agents

**MEASURED 2026-10-16, portal 0.36: ONE Socials composer schedules every channel (8 posts, not filmed).**
Newest; read before any post half. **For scheduling it supersedes the per-channel composers and the
Hour/Minute wheel below** (`ig-publish-*`, `li-publish-*`, "New TikTok"); the connect half (provider
login, consent screens, identity checks on the provider side) is unchanged.
- **Open it from Socials:** `/app/social`, `social-hub-compose-button` ("Write a post"), dialog
  `social-composer-dialog`. Channels are chips, `social-composer-chip-<instagram|facebook|linkedIn|tiktok>`
  (`aria-pressed`); one composer posts to every ticked channel.
- **One caption box**, `social-composer-caption`, with NO hashtag chip box: hashtags go in the text
  after a blank line. Fill, then byte-compare the textarea to the draft, as below.
- **Media:** one hidden `input[type=file]` (`image/*,video/*`, multiple, order kept).
  `social-composer-media-count` reads "N of 10" (Instagram, Facebook), "N of 20" (LinkedIn), "1 of 1"
  (TikTok); guard the N, not the limit. Per-channel blockers: `social-composer-violation-<key>` and
  `social-composer-blocking-reason`.
- **Identity, read it before the press:** LinkedIn `social-composer-posting-as-linkedIn` (the Page
  switcher is inside the composer now, and it must read the Company Page); Instagram and TikTok the
  handle in the preview header or the TikTok panel; Facebook only the preview author and
  `/app/channels/facebook`.
- **The time picker replaced the wheel** (and its first-row defect): Later
  `social-composer-timing-schedule` opens `social-composer-timing-when-sheet`; day
  `social-composer-timing-when-day-YYYY-MM-DD`; time buttons `social-composer-timing-when-time-<minutes
  after midnight>` (690 = 11:30 am, 1140 = 7:00 pm) in 15 minute steps; readback
  `social-composer-timing-when-readback`; confirm `social-composer-timing-when-confirm`. Then read
  `social-composer-timing-date` and the submit label ("Schedule for Fri, Oct 16 at 11:30 am"). Launch
  Playwright with `timezoneId: 'America/Los_Angeles'` so the readback says Pacific Time.
- **TikTok panel** (`social-composer-tiktok-panel`): privacy `tiktok-privacy-select`, option "Everyone";
  Comment, Duet and Stitch (`tiktok-allow-*`) still default OFF, tick them; the disclosure toggle
  defaults off. TikTok has NO preview in this composer.
- **After Schedule the dialog STAYS OPEN** with a per-channel "Scheduled for ..." row and a Done
  button. Wait for that row, not for the dialog to close.
- **Media uploads at Schedule, not at attach.** Attaching writes nothing, so a prepared composer that
  is closed leaves nothing behind. On Schedule each file goes to a `preupload-media-*` key and the
  create promotes it under the post.
- **Read-back that proves it:** GET `api/proxy/integrations/get?type=<key>` lists the scheduled
  objects with `platform`, `accountHandle`, `publishDate` (UTC), the caption (`objectValue.caption` on
  Instagram and TikTok, `postContent` on Facebook and LinkedIn), `postType` and `mediaKeys`.
  Byte-compare the text there. Socials "Going out" lists only the next few, so it is not a full
  read-back.
- **Editing a scheduled post changes words only** (Socials, the post card's options, Edit: one
  textarea and Save). Media, time, channel and author cannot change there; a media swap is Delete
  plus re-create, which needs the owner's OK every time.
- vivreal-hq run notes with the full method: `docs/agent-notes/tutorial-maker.md`, the 2026-10-16
  sections.

**MEASURED 2026-10-04, Instagram retake 2 (video 1, shot clean, portal v0.33.1).** Newest; read
before the Facebook, LinkedIn and TikTok takes.
- **Disconnecting a wrong account works in the UI** (the footage-recorder 2026-10-02 note that
  "Account actions" is unreachable is stale for this): `/app/channels/instagram`,
  `[data-testid=ig-open-settings]`, `button[aria-label="Account actions"]`, the sheet names the
  handle (the display name and the personal handle, read it there too), `[data-testid=account-disconnect]`,
  then `[data-testid=account-disconnect-confirm-action]`. Rehearse to the dialog and press
  `account-disconnect-keep` first if unsure. The card then moves to "Add another" with a Connect button.
- **A disconnected provider's Connect is `[data-testid=channel-offer-<key>] button`**, there is no
  `a[href]` card for it. It opens in the SAME tab, so the screencast films the provider screens.
- **Instagram forces its own login form even when the browser is signed in** (the URL carries
  `force_authentication`), with Chrome autofill putting an email in the username box. The owner
  typed, and REDACT START/END fired (about 17 s). Do not caption a "you are already signed in"
  beat for Instagram. Before rolling, check WHICH account the browser is signed in as
  (`instagram.com/accounts/edit/` in a throwaway tab shows the username) and that
  `/accounts/manage_access/` lists no active Vivreal app, so the full permission screen shows.
- **The consent screen names the account** ("Vivreal-In-IG is requesting access to: vivreal.io"):
  that line is the on-camera account check before Allow. **Allow is a `div[role=button]`**: use
  `clickRole {role:"button", name:"Allow", exact:true}`. `button:has-text("Allow")` resolves to
  nothing visible, waits 30 s, and fails, twice on camera. The screen turned dark-themed partway.
- Back in Vivreal at `/app/channels/instagram?connected=true` with the toast "Instagram connected
  successfully" and the handle in the header. The composer preview also shows the handle.
- *(Superseded for scheduling, see 2026-10-16.)* **Composer:** `[data-testid=ig-create-carousel]`, file input `input[type=file]` (hidden,
  `multiple`, the six slides attached in order), caption `[data-testid=ig-publish-caption]`,
  hashtags `[data-testid=ig-publish-hashtags]` is a chip box that commits on a SPACE. Never send
  Enter in that dialog: the same footer button posts immediately when timing is Now. **There is
  no alt text field** (Location only), so a draft's per-slide alt text cannot be entered here.
  Typing through CDP is slow: 799 characters at `delay:10` took about 150 s of take.
- *(Superseded for scheduling, see 2026-10-16.)* **Instagram's schedule picker is IN-PAGE, not native** (closes the qa-walk B7 gap): Later is
  `[data-testid=ig-publish-timing-schedule]`, days are buttons named "Monday, October 5th, 2026",
  time is two scroll-snap columns (`[aria-label=Hour]`, `[aria-label=Minute]`, 28 px rows in an
  84 px window, only 3 rows visible) plus AM and PM buttons. **Only click a visible row**: a
  clipped row's box sits over whatever is beneath, and on desktop that is the submit bar. Step
  by clicking the visible neighbour (`[aria-label=Hour] button:text-is("10")`, then "11"), and
  measure first with the inspector below. Read the result off the submit label ("Schedule for
  Oct 5, 11:30 AM") and the line under the picker ("in Pacific time, the clock on this device").
- After Schedule, about 30 s of upload, then the card reads "Scheduled" with a 6 badge, the
  header's post count includes it, and Calendar shows it on the day ("Instagram, 11:30 AM").
- **Connect-and-post: connect segment = browser, post half = the app (owner, 2026-10-06).**
  The connect is filmed in the browser (the owner's Chrome attached over `TUTORIAL_CDP_URL`),
  because Meta's login checkpoint is stricter in the installed app. The phone post half runs
  as the installed app on the tutorial profile's portal session; it needs no provider login,
  and an app-view pass ignores `TUTORIAL_CDP_URL`. Never set `--phone-display=browser` for
  the whole take.
- **The phone pass of a connect-and-post cannot repeat the connect or the post.** Film the post
  half: Channels shows the connection as Working, then the same composer, ring Schedule WITHOUT
  pressing (chapter it), Close, "Unsaved Changes", Discard Changes, then Calendar. Say so in the
  handoff; the session intro caption ("Connect Instagram, then post to it") is wrong for that pass.
- **Resolve a selector BEFORE sending it.** A bad one costs 30 s of dead take per verb. Attach a
  second `connectOverCDP`, find the page by URL, `page.evaluate` read-only, then
  `browser.close()` (disconnect only). It does not disturb the screencast; one attach timed out
  once and worked on retry.
- **Use a fresh `REMOTE_DIR` per take.** The scratchpad's `remote/` held a stale `state.json`
  from an earlier LinkedIn take (seq 878), which reads as a live driver.
- **Harness defects found and fixed this run:** (1) the CDP raw video did not start on the pass
  clock (the first, odd-sized frame was dropped by `fps=30`), so every trim cut 6 to 9 s late and
  failed its length check on BOTH passes; fixed in `cdp-screencast.ts` (`fps=30:start_time=0`
  plus a head padded to `t0`, test `tests/cdp-screencast.test.ts`). A take shot before that fix
  needs a hand re-trim: find the intro caption's first frame in the raw (ffmpeg shifts a file to
  start at 0, so `select` and `-ss` both work in that shifted time) and `-ss` there. (2)
  `<mode>/cdp-frames/` (4,250 JPEGs) sat in the committed tree; now gitignored. (3) Never ffprobe
  or decode a `*.trimming.raw.webm` while the run is still trimming: the reader's handle made the
  harness's cleanup fail with EBUSY. (4) **A provider consent URL carries Vivreal's signed OAuth
  `state` in its query** (`params_json=...state...`), and the still records and `state.json`
  wrote the full URL into the committed footage folder. `remote-drive.ts` `safeUrl` now writes
  origin and path only (test `tests/remote-drive-safe-url.test.ts`), and so does the error
  snapshot in `tutorial-lib.ts`. An operator helper that prints `state.json` must do the same,
  or the token lands in task output files. Before handing over, grep the session folder, the
  footage folder, `REMOTE_DIR` and your own task outputs for `params_json`, `code=`,
  `access_token` and `state=`, and expect zero.
- **Scope every scrub or bulk rewrite to the take's own paths. Never walk the scratchpad root.**
  The scratchpad is shared with every other agent of the session: a query-string scrub run over
  its root on 2026-10-04 rewrote 421 files belonging to other work (copied repos, node_modules,
  other agents' logs, and two Chrome IndexedDB files of the qa-walker's throwaway profiles,
  which it corrupted by writing binary as text). 391 were put back exactly by matching each
  against an identical original on disk; 30 could not be. List the exact files first, then
  rewrite that list.

**MEASURED 2026-10-05, LinkedIn (video 3): r01 published from the Vivreal Company Page.** Newest;
read before any LinkedIn take.
- **Posting identity, owner rule: every LinkedIn calendar row posts from the Vivreal Company
  Page, INCLUDING the ones drafted in founder voice ("I", "me"), unless the owner says otherwise
  for that row.** The first r01 take had the text in the composer as Justin's personal profile
  and was killed before Post. A founder-voice row needs its "I" lines rewritten to "we" (r01 was,
  commit a5919cf) before it is posted; flag any you find rather than posting "I" from the Page.
- *(Superseded for scheduling, see 2026-10-16.)* **The identity is NOT picked inside the composer.** It follows the channel page's
  `[data-testid=active-account-switcher-trigger]` ("VIEWING AS"), options
  `[data-testid=active-account-switcher-option]`; the Page is
  `:has-text("linkedin.com/company/vivreal")`. "All accounts" composes as the PERSONAL profile.
  This setting persists account-wide (qa-walk defect 10), so read it every take. Once the Page
  is picked, the composer shows `[data-testid=li-publish-posting-as]` = "Posting as Vivreal,
  Company Page", the subtitle changes to "Share an update to your LinkedIn Company Page.", the
  preview author is Vivreal, and visibility becomes the fixed line "Posts from a Company Page are
  always public." Read `li-publish-posting-as` immediately before pressing
  `[data-testid=li-publish-submit]` ("Publish to LinkedIn"); stop if it is anything else.
- **Byte-compare the composer, do not eyeball it.** Extract the draft's fenced blocks with CRLF
  normalised to LF (the working tree is CRLF under autocrlf), join Post and Hashtags with one
  blank line, `fill` it (typing 1,455 characters through CDP takes minutes, so type the first
  sentence on camera, then fill), and compare `textarea.value` to the file before the press.
- **After Publish** the card reads "Going out now" and does not refresh by itself; "See all"
  (`[data-testid=linkedin-see-all-posts]`) re-reads it as "Published, 1 minute ago". Proof on
  LinkedIn, read-only in a throwaway tab: `linkedin.com/company/vivreal/posts/` redirects an
  admin to the dashboard, so read `/company/106085315/admin/page-posts/published/` instead (it
  shows the post authored by Vivreal, "By Justin Ceccarelli" is only LinkedIn's admin
  attribution), and `/in/me/recent-activity/all/` to confirm it is NOT on the personal profile.
- **A killed agent does not kill its recorder.** The previous take's `run-tutorial` node process
  outlived the agent by over ten minutes, still screencasting its tab and polling its own
  `REMOTE_DIR/cmd.json`. Before treating a killed take as frames-only, list node processes for
  `run-tutorial`; if one is alive, send it `clearCaption` then `done` through its own
  `REMOTE_DIR`, and it encodes, trims and writes `chapters.json` normally. Anything you do in
  that tab meanwhile (closing a composer, discarding text) is filmed in that take.
- **Never reuse the killed take's session folder for the new take.** A new run into the same
  `content/tutorials/<date>-<slug>/` overwrites `cdp-frames/` and the takes; pass
  `--out=<different folder>`. A post-only take also needs a different opening caption:
  `TUTORIAL_INTRO` now overrides the session-e intro.
- **Git Bash rewrites a leading-slash argument into a Windows path** before node sees it
  (`"/app/channels/linkedIn"` arrived as `C:/Program Files/Git/app/...` and matched no tab).
  Match on a substring without the leading slash, or set `MSYS_NO_PATHCONV=1`.
- **An inspector that finds a tab by URL must take the NEWEST match** when an older take's tab
  is still open on the same page, or it reads the wrong one.
- **Two takes attached to one Chrome corrupt each other's captions (FIXED in `tutorial-lib.ts`).**
  The overlay binding `__vrState` and its init script were registered on the owner's whole
  context, so with the orphaned take still attached, both processes answered the binding and
  the live-publish take showed the OLD take's last caption on most frames, from the dashboard
  on. They are now registered on the take's own tab only. Still: never run a second CDP take
  while another is attached, and watch the first seconds of a take for a caption you did not send.
- **The orphan's encode failed** with `close failed: Command failed: ffmpeg ...` (its stdio was
  the dead agent's pipe). `frames.txt` was written first, so the raw encodes by hand with the same
  ffmpeg line from that log (add `-t` to keep only the part you need), then `-ss <contentStartMs>`.
- *(Superseded for scheduling, see 2026-10-16.)* **LinkedIn schedule, measured 2026-10-05 (r12, no recording, headless Playwright on the portal
  profile):** the composer has **no alt text field** (Photos, text, visibility, timing only), so a
  draft's `alt-text.md` cannot be entered. Press Later (`li-publish-timing-schedule`) first; the
  picker is the same in-page wheel, and the readback is `[data-testid=li-publish-timing-date]`
  ("Publishing Oct 6, 2026 at 7:30 AM"). Launch with `timezoneId: 'America/Los_Angeles'` so "the
  clock on this device" is Pacific. A draft's "publishes from Justin's personal profile" line is
  stale; the Company Page rule above wins.
- **A post filmed AFTER the real post carries tells.** The reshoot (Publish ringed, not pressed)
  shows "Your last post went out today.", "1 posts, 1 published" and the published card at the
  bottom of the channel page before the composer opens. Prefer the real press on a clean take;
  if a reshoot is needed, frame the edit around those, and say so in the brief.

**MEASURED 2026-10-05, TikTok (video 4): r11 scheduled Mon Oct 5 7:00 PM PT as @vivreal.io.** Newest;
read before any TikTok take. Supersedes nothing above.
- **Ending a stopped take that is still attached:** the Facebook recorder outlived its stop by
  about 7 minutes. `run.log` line "REMOTE DRIVE: ... (dir <REMOTE_DIR>)" names its folder; write
  `{"id":..,"action":"clearCaption"}` then `done` to its `cmd.json` (tmp file plus rename). Its
  encode failed again (the orphan-stdio `close failed`), and the hand encode from
  `cdp-frames/frames.txt` took about 1 minute for a 6.7 minute take. The CDP window then held one
  blank tab and attached in 0.13 s.
- **TikTok pre-checks, all read-only in a throwaway tab:** `/app/channels` (the Connect is
  `[data-testid=channel-offer-tiktok] button`) and `/app/channels/tiktok` ("TikTok is not
  connected"). `tiktok.com/profile` redirects to `/@<username>`, which names the account the
  browser is signed in as (here `@vivreal.io`, display name Vivreal, 0 videos). The Socials route is
  `/app/social`, not `/app/socials` (that one 404s).
- **TikTok skipped its login entirely** because the browser was signed in. Connect went straight
  to "Vivreal wants to access your TikTok account", with the full five-switch list, the account
  named under the avatar ("Vivreal, Switch account"), and Cancel and **Continue as real
  `button`s** (`clickRole button "Continue"` worked first time). No password field, so no REDACT
  chapters. **Continue sits at y 0.97, at the bottom edge of a 1440x810 frame, and the caption did
  NOT move off it** (harness defect, unfixed): caption the permissions beat, then `clearCaption`
  before ringing Continue.
- **The channel header shows the display name as a handle** ("Vivreal, @Vivreal"), which is not the
  TikTok username. **The composer header shows the real one** ("Vivreal, @vivreal.io"), so read the
  identity in the composer (`[data-testid=tiktok-publish-dialog]`), not on the channel page.
  Unlike LinkedIn, there is no "Viewing as" switcher for TikTok.
- *(Superseded for scheduling, see 2026-10-16.)* **Composer:** "New TikTok" (`clickRole button "New TikTok"`, no testid). Hidden `input[type=file]`
  (accept `video/*`, single) inside the dialog; ring `button:has-text("Select a video")` and use
  `upload`. Caption and hashtags share ONE `textarea` (no chip box). Type the first words, then
  `fill` the rest and byte-compare `textarea.value` (110/2200 for r11, which is the true length;
  post.md's "87 characters" was wrong). Privacy `[data-testid=tiktok-privacy-select]` is a button.
  Its options are `role=option` Everyone, Friends, Only me. **Submit is armed on Now ("Post to
  TikTok") the moment a video, caption and privacy are set**, so press Later
  (`tiktok-publish-timing-schedule`) before anything else near the footer.
- **The TikTok composer defaults Comment, Duet and Stitch to OFF** (`tiktok-allow-comment`,
  `-duet`, `-stitch`, checkboxes with `aria-checked`); tick them whenever the caption asks for
  comments (r11 went out queued with all three off and had to be redone, 2026-10-05). Saved as
  `objectValue.disableComment/Duet/Stitch`. A queued post's card menu has Edit and an inline
  "Delete this for good?" confirm; the cards carry no id, so map them through the React props.
- *(Superseded for scheduling, see 2026-10-16.)* **TikTok's schedule picker is the same in-page wheel as Instagram's** (closes qa-walk B7 for
  TikTok): `[aria-label=Hour]`/`[aria-label=Minute]` columns of 28 px rows in an 84 px window, AM and
  PM buttons, default today plus the next 5 minutes. **Hours already past today are DISABLED while
  AM is selected,** so the 07 click waited 15 s and failed on camera. Press PM FIRST, then the hour.
  **A wheel scroll over a column selects on settle** (scrolling minute up by 300 px landed on 05).
  Move the pointer off the columns (`ring` a calendar day) before any dialog scroll, or the scroll
  changes the time.
- *(Superseded for scheduling, see 2026-10-16.)* **Picker defect (portal, unfixed): the FIRST row of a column cannot reach the centre band.**
  With minute 00 selected, `scrollTop` is 0, 00 sits in the top row drawn white on white, and the
  blue band shows a greyed 05. Hour 01 is the same. The truth is the line
  `p:has-text("Publishing Oct 5, 2026 at 7:00 PM")`, which sits UNDER the footer until the dialog is
  scrolled further. Ring that line and push in on it, never on the wheel, for any :00 time.
- After Schedule the dialog closes at once (no upload wait for a 1.9 MB video), the card reads
  "Scheduled", and the header still says "Nothing has gone out to TikTok yet." while the stats say
  "1 videos from Vivreal" (it counts the queued post, with a plural slip). Calendar Today lists
  "TikTok, 7:00 PM". Socials: `[data-testid=social-health-card-tiktok]` filters the feed to the
  card, "Scheduled, Vivreal, Goes out today at 7:00pm", and "Going out" lists "Today, 7:00pm".
- **Captions persist until replaced**: `ms` is only the hold. "Leave these on" stayed burned over
  the Vivreal page for about 30 s after the redirect. Send `clearCaption` right after any provider
  press that leaves the provider's screen, or the edit loses that stretch.
- **The `tasks/` output folder of the session is shared with other agents.** A leak grep over
  the whole folder hits other agents' outputs; grep only your own task ids.
