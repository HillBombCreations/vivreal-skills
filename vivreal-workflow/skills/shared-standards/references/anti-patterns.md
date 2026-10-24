# Vivreal anti-pattern catalog (plugin copy)

**Source of truth:** `vivreal-hq/docs/standards/anti-patterns.md` (private repo, owner-approved
2026-10-24). This file is the plugin copy so every agent can read the rules without a vivreal-hq
checkout. Edit the vivreal-hq file first, then carry the change here in the same week.

**What this copy leaves out, on purpose.** This plugin repo is public. The source catalog carries
the dated evidence for each entry: the measured counts, the customer and group names, the Sentry
issue ids, the `repo@sha:path:line` citations into private repos, and the current list of which
service still lacks which protection. That evidence lives only in vivreal-hq (its paths under
`docs/projects/...` are vivreal-hq paths, readable at `${VIVREAL_REPOS}/vivreal-hq/` when that
checkout exists). Read the source when you need the evidence; this copy carries the rule, how to
spot it, and the guard, which is all a review needs.

Use: before writing code and before reviewing a diff, decide for each entry whether the diff ADDS,
REMOVES or does not touch an instance, using that entry's "How to spot it". A diff that adds an
instance is wrong even when its tests pass, unless it also adds the entry's guard. When a diff
shows a recurring class this catalog does not name, propose the entry (in vivreal-hq first).

"Not yet" in "Enforced today" means nothing in CI, lint, an alarm or a query would turn red on a
new instance. Review and memory do not count as enforcement.

---

## Summary table

| # | Name | Rule (one line) | Enforced today |
|---|---|---|---|
| 1 | Borrowed links | Draw and send only addresses we own; a third-party or signed link is an input, never a stored display value | Not yet |
| 2 | Whole-document reads | Every list read answers a named, narrow view with a hard `limit` ceiling | Partly (Sentry detects, nothing blocks) |
| 3 | N+1 and unbounded bursts | A screen makes a bounded, budgeted number of requests; fan-out has a concurrency cap | Partly (opt-in batcher) |
| 4 | Secrets that can reach logs | Redact at the logger and SDK boundary by the value's shape, never by variable name | Partly (some services) |
| 5 | Error status for "nothing yet" | A page-load GET answers 200 for every state an owner can be in | Not yet |
| 6 | Unbounded background work | Every outbound call has a timeout; every poll pauses when hidden and has a time cap | Not yet (a few call sites only) |
| 7 | A cache that replaces | A shared cache has one write rule: merge by id; a replace writer is a defect | Not yet |
| 8 | Duplicate fetches per render | One request-scoped memo per backend read; two helpers asking the same question share one call | Not yet |
| 9 | Silent owner-visible failures | Anything that fails where an owner can see it reports to Sentry or an alarm, and tells the owner even when the app is closed | Partly (operator alarms only) |
| 10 | Test traffic in prod signals | Our own runs are tagged and never page; local runs never send as `production` | Partly |
| 11 | Silencing recurring issues | No archive, ignore, `expectedDenial` or "resolved" without a named root cause and a guard | Not yet |
| 12 | Alarms that cannot fire | An alarm's threshold must be reachable by one real failure of that path | Partly |
| 13 | Dropping the cause | A wrapper error keeps the underlying cause and the provider's reason | Partly |
| 14 | Blanket tolerance | Tolerate an expected failure by name; fail on everything else | Fixed in the package repos; no CI check |
| 15 | Mirrored copies that drift | A rule copied across repos has one source or a parity test | Partly |
| 16 | Mongo predicates that lie | Multi-field array matches use `$elemMatch`; boundary values (`limit 0`, null) get a branch | Not yet |
| 17 | Tests that fake the failing layer | One test per change runs through the real next hop and the real schema | Review only |
| 18 | Safety nets never exercised | A renewal, refresh, backup or alarm proves it worked, not just that it ran | Partly (no-run alarms only) |
| 19 | Expiries with no register | Anything that expires has a date in a register, an owner, and an alarm before it lapses | Not yet |

---

## 1. Borrowed links

**Rule.** Draw, email and serve only addresses we own (a key in our storage, or our stable
`client.vivreal.io/media?key=` redirect). A platform CDN URL or a signed URL is an input to copy,
never a value to store for display.

**Why it hurts owners.** Broken avatars and post pictures on /social and Channels, growing with the
age of the connection, and Sentry captures none of it, because a failed `<img>` is not an error.

**How to spot it.** A stored field named `*Url`, `*ImageUrl`, `logoUrl`, `mediaUrls` or
`picture.data.url` written from a provider response. An `<img src>` reading one of those. A URL
containing `oe=`, `x-expires=`, `Expires=`, `Signature=`, `X-Amz-Signature=` or `e=` that is
persisted, emailed, or put in OG or JSON-LD. A sync that writes a provider CDN URL into a product
or profile image field.

**Guard.**
- Proposed lint (portal): `vivreal/no-platform-image-src`. An `src` expression reading
  `profileImageUrl`, `avatarUrl`, `logoUrl`, `mediaUrls` or `getPostMedia(...).url` outside
  `AccountPicture` and `getPostMedia` is an error. Red proof: a fixture `<img src={p.profileImageUrl} />`.
- Proposed DB query (weekly, fleet-ops health watcher): count documents in `Vivreal.groups` and
  every pod's `collection_objects` and `integration_objects` where any string field matches the
  signed-marker regex. Alert on more than 0, with an `https://` positive control.
- Proposed walk check: zero image requests to `fbcdn.net`, `cdninstagram.com`, `tiktokcdn*.com`,
  `licdn.com`, `twimg.com` on /social and Channels.

**Enforced today.** Not yet. Precedents that follow the rule: Stripe product images (CMS
`src/shared/stableMediaUrl.js`), rich text stores keys only, OG images re-sign per request, order
emails send no signed logo.

---

## 2. Whole-document reads

**Rule.** A list read answers a named view. With no view named, it returns the narrowest one. An
unknown view is a 400. Every list validator has a `max` on `limit`. Anything crossing a
server-to-client boundary is an allowlist slice.

**Why it hurts owners.** Slow first paint on a phone, and every customer site's visitors pay too.
Whole site documents and whole list documents run to hundreds of kilobytes or more per load.

**How to spot it.** A `find` or aggregate with no projection on a list route. `Joi.number()` on
`limit` without `.max()`. `parseInt(limit) || N` passed straight to `$limit`. A `'use client'`
component receiving `siteData` or any stored document whole. A proxy relaying `res.text()` with no
size awareness.

**Guard.**
- Proposed test (Secure, CMS): every named view has an exact key-set assertion and a byte budget on
  a fixture with N pages or lists.
- Proposed test (CMS): a validator walk that fails on any `limit` key without `.max()`.
- Proposed telemetry (portal): a `portal.proxy.oversize` log over a per-route budget, default 256 KB.
- Proposed size budget (Templates): the served home page's RSC flight carries no `pageConfigs` key
  and stays under a budget.
- Sentry: "Large HTTP payload" issues alert instead of being archived.

**Enforced today.** Partly. Sentry's performance detector creates the issues, but nothing blocks a
new whole-document read.

---

## 3. N+1 requests and unbounded bursts

**Rule.** The server answers a screen's question in one call. A screen's request count is budgeted
by a test. Every fan-out has a concurrency cap.

**Why it hurts owners.** Slow Lists and Studio, and blank covers when media signing throttles at
its reserved concurrency. An uncapped build can fire dozens of concurrent reads at a cold API and
get refused.

**How to spot it.** A fetch inside `.map` per card, row or binding. `Promise.all(items.map(fetch))`
with no cap. A per-entity route where a screen needs many entities. A direct `/get-media` call
outside `src/lib/media/signedMediaBatcher.ts` (portal).

**Guard.**
- Proposed lint (portal): `vivreal/no-direct-get-media`.
- Proposed budget test (portal vitest): render a screen against a counting axios mock and assert
  the EXACT route set and once-each count.
- Proposed lint (all repos): `Promise.all` over a `.map` whose callback awaits a network call must
  go through a named `mapWithConcurrency(n, ...)` helper.
- Sentry: an alert rule on new `performance_n_plus_one_api_calls` issues instead of archiving.

**Enforced today.** Partly. The batcher exists but is opt in. The N+1 detector fires but its issue
is archived.

---

## 4. Secrets that can reach logs or errors

**Rule.** Redact at the boundary (logger serializers, Sentry `beforeSend`, error constructors), by
the value's shape, never by the variable's name. Never put a provider body into an error message.

**Why it hurts owners.** One leaked token is every tenant's data. Agents have also leaked live
credentials into transcripts through a shell `${VAR:-}` presence check, a grep of `.next/cache`,
and a snapshot of a plain-text password field. An `integrations.$` projection returns encrypted
token fields, so a careless read prints ciphertext.

**How to spot it.** `logger.*({ err })` on an axios or fetch error. `new Error(\`... ${body}\`)`
with a provider body. `access_token=` in a URL. `${VAR:-` in shell. A Sentry init with
`sendDefaultPii` or `includeLocalVariables` and no `beforeSend` scrub. A pino logger with no `err`
serializer that drops axios `config.headers`. A test asserting that a URL reaches a log byte for
byte.

**Guard.**
- Proposed REFUSE tests per service: log an AxiosError carrying `Authorization: Bearer <poison>`
  and send a server event with a `token=` cookie; assert the poison is absent. Build the poison in
  the test's own language, not through a shell.
- Proposed log query (weekly, fleet-ops): a Logs Insights pattern set over every `/aws/lambda/*`
  group, with same-query positive controls, alerting on more than 0.
- Proposed lint: `no-restricted-syntax` on template literals that interpolate `errBody`,
  `responseText` or `await res.text()` into `new Error`.
- Precedent to copy: CMS `src/shared/refreshOAuthToken.js` keeps the provider reason in structured
  fields, never in the message text.

**Enforced today.** Partly. Some service loggers scrub, the on-call error notifier redacts before
Discord, and Sentry's org scrubber is on. Not every service yet (the source catalog lists which).

---

## 5. An error status used to mean "nothing yet"

**Rule.** A GET a page makes on load answers 200 for every state an owner can be in. 4xx is only
for a request that is wrong. A non-member still gets 403, never `200 null`.

**Why it hurts owners.** A red console line on every load, which every walk files again. The
suppression layers added to quiet it then hide real 404s.

**How to spot it.** A service that throws `404 *_not_found` for a collection-level "none".
`expectedDenial` on a GET. Portal `expectedStatuses: [404]`, or a catch that turns 404 or 403 into
`null` or a state string.

**Guard.**
- Proposed per-route test (Secure, CMS): ALLOW pins `200` plus the state field; REFUSE pins 403 for
  a non-member.
- Proposed lint (portal): `expectedStatuses` containing 404 or 403 on a GET is a warning unless the
  path has an id segment.
- Proposed Sentry query (daily triage): `http.response.status_code:[400,403,404]` on GETs to our
  APIs grouped by route, as a trend.

**Enforced today.** Not yet. `expectedDenial` is this anti-pattern institutionalised.

---

## 6. Unbounded background work

**Rule.** Every outbound call has a timeout shorter than its caller's budget (API Gateway 29 s, the
Lambda timeout). Every client poll pauses when `document.visibilityState` is hidden and backs off
after a time cap. When you add a socket timeout to an AWS SDK client, set `maxAttempts` too.

**Why it hurts owners.** A provider that hangs turns an owner's "Connect" into a raw gateway
timeout. A tab left open on a polling screen calls the backend thousands of times a day.

**How to spot it.** `fetch(url, { method, headers, body })` with no `signal`. `axios.get` without
`timeout` on an instance with no default. `new XClient({})` with no `requestHandler`. `setInterval`
or a recursive `setTimeout` poll with no visibility check.

**Guard.**
- Proposed lint (all Node repos): `no-restricted-syntax` on `CallExpression[callee.name='fetch']`
  whose second argument has no `signal` property, steering to one shared `fetchWithTimeout`. Red
  proof: a fixture with a bare `fetch(url)`.
- Proposed scanner (fleet-ops, CI-free): a weekly count of timeout-less call sites per repo,
  alerting on growth.
- Proposed portal test: every `setInterval` poll site is registered in a list that a test checks
  for a `visibilitychange` handler.

**Enforced today.** Not yet. Precedents: `AbortSignal.timeout` in a few CMS call sites, and the CMS
stuck-publish sweep bounds a hung publish. Inverse trap: an SDK socket timeout arms the SDK's own
retry, so it needs `maxAttempts` beside it.

---

## 7. A cache that replaces instead of merging

**Rule.** A shared cache has one write semantics, merge by id. A full refresh merges and then
prunes only what the server says is gone. Two writers with different semantics is a defect.

**Why it hurts owners.** Studio re-fetches the same lists several times per open, because a seed
writer replaces what an upsert writer added, and a whole-value offline cache carries the loss
across a reload. A replaced cache once showed a paying owner "Free".

**How to spot it.** `setState(prev => ({ ...prev, [key]: items }))` beside another writer that
upserts into the same key. `db.put(store, { key, data })` for a list. `localStorage.setItem` of a
whole list on every change.

**Guard.**
- Proposed test (portal): for each shared cache, seed, upsert one item, re-seed with a page that
  omits it, and assert the EXACT id set survives.
- Proposed lint: a context setter keyed by profile may be written only through named `merge*`
  helpers (`no-restricted-syntax` on the computed-key spread pattern in `src/contexts/`).

**Enforced today.** Not yet.

---

## 8. Duplicate fetches per render

**Rule.** Server reads go through one request-scoped memo keyed by backend, path and params, so two
helpers asking the same question in one render share one call.

**Why it hurts owners.** A slower page: one server render reading the same upstream twice,
including a large site view.

**How to spot it.** Two helpers in one page each calling `serverFetchDirect` for the same upstream.
`cache: 'no-store'` with no React `cache()` wrapper.

**Guard.**
- Proposed test (portal): one server render against a counting fetch mock asserts the EXACT
  upstream call list.
- Proposed Sentry query (weekly): server transactions where a `span.description` repeats within a
  trace, grouped by transaction.

**Enforced today.** Not yet.

---

## 9. Owner-visible failures that report nowhere

**Rule.** If an owner can see it fail, it reaches Sentry or an alarm, and the owner hears about it
even when the app is closed (push or email), in owner words, with the fix.

**Why it hurts owners.** They find out from their customers. Image failures raise no Sentry issue,
a failed scheduled post notifies only over the websocket, and a dead social connection can sit
unnoticed for weeks.

**How to spot it.** `onError={() => hide()}` on an image. `.catch(() => {})` on a read whose result
renders. A failure branch that only emits a socket event. An `expired` status write with no
notification beside it.

**Guard.**
- Proposed: a `notifyOwner(groupID, category, ownerCopy)` path that every terminal failure calls
  (push plus an email fallback), with a test asserting the call on a durable publish failure and on
  `markSocialAccountExpired`.
- Proposed portal: image `onError` reports a sampled breadcrumb with host (not URL) to Sentry, so a
  borrowed-link regression (entry 1) becomes visible.
- Existing alarms to keep: `VR-CMS-API-social-credential-dead` and
  `VR-Secure-API-social-credential-dead`.

**Enforced today.** Partly, for operators only. Nothing reaches the owner when the app is closed.

---

## 10. Our own test traffic polluting production signals

**Rule.** A process that is not a deployed production artifact never sends as `production`. Our
runs against production are tagged with a verified run marker, reported under `production-test`,
and never page. Tag, never drop.

**Why it hurts owners.** Real alerts drown in our noise, and our bursts degrade real sites (walks
have saturated Atlas; a local build caused a burst of refusals).

**How to spot it.** A Sentry init whose environment falls back to `development` or comes from a
`.env.local` convention. A script or build that hits production with no marker.

**Guard.** The sentry-test-traffic design (vivreal-hq `docs/projects/sentry-test-traffic/design.md`):
a deploy-derived environment with an anti-silencing REFUSE test (the `stable` branch must resolve to
`production`), a signed run marker, a tenant class by group, and alert rules scoped to `production`
plus one volume rule on `production-test`.

**Enforced today.** Partly (local env set to `local`, alert rules scoped to `production`).

---

## 11. Silencing recurring issues

**Rule.** An issue that recurs is never archived, ignored, resolved, marked `expectedDenial`, or
called "by design" without (a) a named root cause that explains every event, (b) a guard that turns
red on a recurrence, and (c) a proof window of N days at zero.

**Why it hurts owners.** The problem keeps happening and nobody is told. Owner rule, 2026-10-23:
recurring failures get a foundational root-cause fix, not band-aids.

**How to spot it.** A status change in Sentry with no linked fix. An `expectedDenial`,
`expectedStatuses`, `ignoreErrors` or `denyUrls` entry added in a diff. A comment saying "by design"
next to a suppression.

**Guard.**
- Proposed daily Sentry query (triage agent): issues in `ignored` or `archived` with events in the
  last 7 days, and issues `resolved` with a new event after resolution. Each needs a root-cause link
  or goes back to unresolved.
- Proposed check (each repo, in a pre-push hook, no Actions minutes): a diff that adds
  `expectedDenial`, `expectedStatuses`, `ignoreErrors` or a Sentry `beforeSend` drop must name a
  `docs/` root-cause file in the same commit message.

**Enforced today.** Not yet.

---

## 12. Alarms that cannot fire

**Rule.** An alarm's threshold is a claim about traffic. One real failure of that path must breach
it. Never alarm a serverless-express service on Lambda `Errors` alone. Sweep for alarms stuck in
ALARM, because CloudWatch notifies only on a transition.

**Why it hurts owners.** The failure happens and nobody knows: a 2-of-3 alarm cannot fire on a
single failing minute, a billing alarm needing 5 errors cannot fire on a path with a handful of
invocations a fortnight, serverless-express turns a handled 500 into a successful invocation, and an
alarm already red never notifies again.

**How to spot it.** `DatapointsToAlarm` greater than 1 on a low-volume path. `MetricName: Errors`
on an Express Lambda. A threshold copied from a busy path.

**Guard.**
- Proposed infra test (fleet-ops, zero-dep): read every alarm, and for each one compare threshold
  times datapoints against the 14-day p95 per-period traffic of its path. Flag any alarm a single
  failure cannot breach.
- Proposed scheduled check: `describe-alarms --state-value ALARM` with `StateUpdatedTimestamp` older
  than 24 h pages again.
- Existing: Secure's `alarm-verifier` stack.

**Enforced today.** Partly (the alarm verifier, plus many 1-of-1 alarms). Not fleet-wide.

---

## 13. Dropping the cause

**Rule.** A wrapper error carries the underlying error (`cause`) and the provider's stated reason in
structured fields, and the log line prints them.

**Why it hurts owners.** We cannot fix what we cannot name, and the same failure returns. A
connection backstop that logs only "exceeded the backstop" leaves DNS, TLS or throttling unproven;
a provider's refusal reason thrown away cannot be acted on.

**How to spot it.** `throw new XError('...')` inside a catch that does not pass `{ cause: err }`. A
`logger.*` in a catch that logs only `err.message` of a wrapper.

**Guard.**
- Proposed lint: ESLint's core `preserve-caught-error` rule at error level in every repo (confirm
  the installed ESLint version ships it before enabling). Red proof: a fixture rethrowing without
  `cause`.
- Proposed test pattern: a REFUSE test that a refused provider call's log line contains the
  provider's error code field.

**Enforced today.** Partly.

---

## 14. Blanket tolerance for one expected failure

**Rule.** When a step tolerates a known failure, match it by name and fail on everything else.
Never a bare `||`. A pipeline's exit status is the last command's.

**Why it hurts owners.** A package silently stops publishing for weeks: `npm publish || echo`
swallowed bad tokens, broken builds and outages. `cmd | tr -d '\r'; rc=$?` reports success.

**How to spot it.** `|| echo`, `|| true`, `2>/dev/null || true` on a step that matters. The correct
shape tolerates the read and then fails loudly on the missing value.

**Guard.** Proposed pre-push hook check (per repo, no Actions minutes): fail on `run:` lines in
`.github/workflows/*.yml` matching `\|\|\s*(echo|true)` unless the line carries a
`# tolerated: <named condition>` comment. Strip comments before matching
(`vivreal-workflow:verification-discipline`).

**Enforced today.** Fixed in the package repos. No check prevents a new one.

---

## 15. Mirrored copies that drift

**Rule.** A rule needed in two repos lives in one package. Where a copy is unavoidable, a parity
test compares the copies, and moves with the function it mirrors.

**Why it hurts owners.** Paid orders silently dropped when a "ported verbatim" copy of a routing
helper skipped a tier. Copies of the encryption util, the OAuth platform configs, and several
refreshers of one social account each drift on their own.

**How to spot it.** A comment containing "must match", "ported", "mirrors" or "copy of". The same
filename in two backend repos.

**Guard.** Proposed fleet-ops sweep: list files with the same basename across backend repos, plus
comments matching `must match|ported|mirror`. Each needs a parity test name in a register file.
Diff the copies weekly.

**Enforced today.** Partly (some cross-repo parity tests).

---

## 16. Mongo predicates that lie

**Rule.** Two or more conditions on the same array element go in one `$elemMatch`. A value whose
meaning inverts at a boundary (`limit(0)` is "no limit", `null` versus missing) gets an explicit
branch. A projection on a credential-bearing array names the fields it needs.

**Why it hurts owners.** A sweep filtering `integrations.type`, `integrations.active` and
`integrations.accounts` as separate predicates matches `active: true` on a DIFFERENT element, so it
selects groups whose integration is off. A read meant to skip became unbounded through `limit(0)`.
A compound sparse index was a no-op.

**How to spot it.** A filter object with two or more keys sharing an array prefix (`'arr.a'`,
`'arr.b'`) and no `$elemMatch`. `.limit(x)` where `x` comes from a request. A `$` positional
projection after a multi-predicate array match.

**Guard.**
- Proposed lint (backends): a custom rule flagging object literals passed to
  `find`/`updateOne`/`countDocuments` with two or more keys sharing a dotted array prefix.
- Proposed test pattern: every sweep query gets a REFUSE fixture whose array splits the conditions
  across two elements and must NOT match.

**Enforced today.** Not yet.

---

## 17. Tests that fake the layer where the failure lives

**Rule.** At least one test per change runs through the real next hop (the real proxy route, the
real serverless-express plus validator) and the real Mongoose schema. Assert the exact set, never a
count. Test what renders, not what is declared.

**Why it hurts owners.** Green CI, broken production. A stubbed model hid a schema path error, a
strict schema dropped an undeclared field, and a fix passed eight tests while unreachable
(`vivreal-workflow:verification-discipline`, "A faked layer").

**How to spot it.** `sinon.stub(Model, 'updateOne')` with no real-schema test beside it. A portal
hook test that mocks the network when the change alters what the client sends. `calledOnce` where
the question is which.

**Guard.** The shared-standards red proof (the new test run at the base commit in a read-only
worktree must go red), and the reviewer checklist item 13, which asks for the real-hop test by name.

**Enforced today.** Review only.

---

## 18. Safety nets never exercised

**Rule.** A renewal, refresh, backup, failover or alarm proves that it WORKED, not just that it ran.
If production has never exercised it, exercise it on purpose before the date it is needed.

**Why it hurts owners.** The net fails on the one day it matters. A token sweep can run hourly for
months and never once have renewed a given provider; a refresh job can check zero tokens for a
month; a probe can mark every account of one platform dead on its first run.

**How to spot it.** A cron whose success log shows `renewed: 0` or `checked: 0` every day. A
"no-run" alarm with no matching "no-success" alarm.

**Guard.**
- Proposed metric and alarm per renewer: `LastSuccessfulRenewalAge` per provider, alarming when an
  active account's token is inside its renew window and no success was logged in 2 ticks.
- Proposed synthetic exercise: renew one internal account per provider weekly, on purpose, and
  alarm on refusal. The Vivreal Content accounts are the canary.

**Enforced today.** Partly. "No-run" alarms exist; they prove a run, not a renewal.

---

## 19. Expiries with no register

**Rule.** Anything that expires (a token, key, certificate, domain, invite, approval, signed URL)
has a row in one register: its date, whether it renews itself, who owns it, and the alarm that fires
before it lapses.

**Why it hurts owners.** A date nobody wrote down is an outage nobody scheduled: unrotated secrets,
non-expiring personal access tokens, domains at outside registrars, user tokens with an operator
alarm but no owner warning, and platform review dates recorded nowhere.

**How to spot it.** A stored `tokenExpiry`, `expiresAt`, `NotAfter`, `Expiry` or `expires_in` with
no reader that alarms. A credential created in a console with no ticket.

**Guard.**
- Proposed register: vivreal-hq `docs/standards/expiry-register.md`, generated weekly by a fleet-ops
  job from read-only sources (Mongo token dates, ACM `NotAfter`, Route53 domain expiry, RDAP for
  outside registrars, GitHub token expiry headers, Cognito pending users). A hand-kept section
  covers Meta, Atlas and Google.
- Proposed alarm: any register row inside 30 days that does not renew itself pages the owner by
  email; inside 7 days it pages on-call.

**Enforced today.** Not yet.
