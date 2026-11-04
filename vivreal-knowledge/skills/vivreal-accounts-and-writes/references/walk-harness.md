# Read-only walk and capture harness

The one home for the harness traps that footage-recorder, tutorial-maker, help-page-producer,
qa-walker and marketing-auditor each learned on their own between 2026-10-13 and 2026-11-03. The
write rules (which login, the eight-step protocol, the never-list) stay in this skill's
`SKILL.md`; this file is how a browser script stays read-only and still sees the product as an
owner does.

## 0. Which identity

Three test identities exist, and no others (owners, 2026-11-04; every other test account, its business
and the platform review accounts were deleted). Each is resolved by placeholder, never written out:

- **The Vivreal Content demo business's agent sign-in**: the default for every read-only walk and every
  shoot. A write needs the owner's go, and its social channels are REAL: never Post, Schedule or Reply.
- **QA scratch-2**, through the `scratch2-owner` key of the QA account bundle (its name is key `qaAccountBundle` of `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json`): the one business
  where tests write freely (orders, refunds, Stripe TEST, destructive checks).
- **`canlook`**, a key of the same bundle: the non-admin member of QA scratch-2, for permission and role tests.

**Empty-state and first-run tests use a fresh sign-up** created for the test and deleted, with its
business, at the end of the run. No standing account is kept empty. Read one bundle key in process
(section 3), never the whole bundle.

## 1. Guard the browser context, not the page

- **Arm the guard on the context** (`context.on('request')` and `context.route`), never on one
  page. On 2026-10-15 a delete went through while a page-level request log stayed empty: the write
  came from a second tab, a popup or the portal's service worker, which a page listener never sees.
- **Answer a refused write with a readable 403, never an abort.** The portal queues a write for a
  later retry only when it gets no response at all, and that retry would run later, from the shared
  profile, with no guard.
- **Refuse to start while the portal's offline queue holds anything** (IndexedDB `vivreal-cache`,
  store `pendingMutations`). A queued replay lands after the take. Never empty the queue to get
  past it: those are someone's pending writes. Report what it holds and stop.
- **An empty request log is never proof that nothing was written.** Read the item back from a
  fresh process. The guard narrows the risk; the write protocol still applies in full.

## 2. POST reads to let through, anchored on host and method

A blanket "block every POST" signs the session out and blanks the screens being filmed. Each of
these is a read, or a write the app makes on view, and gets its own allow-list entry anchored on
the host and the method (never a broad pattern such as `/upload|presign|media/i`, which once
passed media-library deletes):

| Request | Why it must pass |
|---|---|
| `POST /app/api/proxy/user/refresh` | Blocking it signs the session out and hides every plan-gated block. This supersedes the older note that blocking the profile refresh "fails nothing" |
| `POST /app/api/proxy/get-media` | It signs image addresses; blocked, Studio and Socials tiles draw blank |
| `POST /app/monitoring` | The error-reporting tunnel under the portal's base path. Answer 200 with an empty body, so a walk never reports to Sentry |
| `POST /api/cart-quote` on a customer site | A quote; it writes nothing |
| `POST .../integrations/tiktok/creator-info` | A read |
| `POST .../recommendations/events` | A write the app makes on view: block it and count it as "blocked on view", never fail the take on it |

Not covered by any route guard: WebSocket frames.

## 3. Sign in, in process

- Read the walk secret with the AWS SDK, or `execFileSync` with the output captured, and never
  print it, log it, pass it on a command line or write it to a file. The secret's name comes from
  `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json`, never from a copy in a script.
- Use a scratch browser profile folder and delete any saved session state at the end.
- Allow the token refresh (section 2). A walk that blocks it films a signed-out portal.

## 4. Script mechanics

- **Write scripts with the Write tool**, never a heredoc or `node -e`: both collapse backslashes,
  and a hook refuses some of them.
- **Give every screenshot an absolute path** built from the script's own folder or the session
  scratchpad; a relative path lands wherever the shell happened to be.
- **A tool call over 120 s is moved to the background**, so run one take per call.
- **tsx leaks `__name` into `page.evaluate`.** Add
  `context.addInitScript('globalThis.__name = (f) => f')` before the first page loads.
- **Load Playwright from one place per process.** Two copies (an `.mts` import and a
  `createRequire` of another install) give two browser registries that do not see each other.

## 5. Selectors and names

- **Hidden duplicates share a test id** (the phone and computer layouts both render), so match
  `:visible`, and read and click only the visible one.
- **Read accessible names from the accessibility tree**, not from `innerText` or a class name.
- **Text scans are case-sensitive.** Scan for the words as the product writes them, and lower-case
  both sides when the case does not matter.

## 6. Direct API calls

A direct call to Secure, CMS or Main (a proof, a read-back, a fixture read) carries the header
`X-App-Source: vivreal`, the same one the portal sends. Without it Secure answers "Missing or
unrecognised X-App-Source header" and files it in Sentry, so a walk's own probes show up as new
issues. Never send a deliberately malformed request to production: a walk's malformed probe has
reopened a resolved issue. On a production walk, also block the Sentry ingest host.
