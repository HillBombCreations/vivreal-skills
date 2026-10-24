# Anti-pattern catalog (public form)

This is the public form of the anti-pattern catalog. Each entry carries a rule, the generic way it
hurts, how to spot it in code, and the shape of a good guard. Agents with access read the internal
catalog at `${VIVREAL_REPOS}/vivreal-hq/docs/standards/anti-patterns.md` for the evidence behind
each entry and its enforcement status.

How to use it: before writing code and before reviewing a diff, decide for each entry whether the
diff ADDS, REMOVES or does not touch an instance, using that entry's "How to spot it". A diff that
adds an instance is wrong even when its tests pass, unless it also adds a guard of the entry's
shape. A diff that fixes an instance adds the guard with a red proof (the guard, run at the base
commit, goes red). A guard counts as enforcement only when CI, a lint rule, a hook, an alarm or a
scheduled query turns red on a new instance; review and memory do not count. When a diff shows a
recurring class this catalog does not name, say so in the review and name it as a new entry.

---

## Checklist form

The rules as a reviewer walks them, one line per entry.

1. **Borrowed links.** Store and display only addresses you own; a third-party or signed URL is an input, never a stored display value.
2. **Whole-document reads.** Every list read answers a named, narrow view with a hard `limit` ceiling, and only an allowlisted slice crosses to the client.
3. **N+1 and unbounded bursts.** A screen makes a bounded, tested number of requests, and every fan-out has a concurrency cap.
4. **Secrets that can reach logs.** Redact at the logger and error-reporting boundary by the value's shape, never by variable name.
5. **Error status for "nothing yet".** A GET a page makes on load answers 200 for every valid state.
6. **Unbounded background work.** Every outbound call has a timeout below its caller's budget; every poll pauses when hidden and stops after a cap.
7. **A cache that replaces.** A shared cache has one write rule, merge by id.
8. **Duplicate fetches per render.** One request-scoped memo per backend read.
9. **Silent user-visible failures.** A failure a user can see reaches error tracking or an alarm, and the user is told even when the app is closed.
10. **Test traffic in production signals.** Your own runs are tagged as test traffic and never page; nothing local reports as production.
11. **Silencing recurring issues.** No ignore, archive, expected-status allowance or "by design" without a named root cause and a guard.
12. **Alarms that cannot fire.** One real failure of the path must breach the alarm's threshold.
13. **Dropping the cause.** A wrapper error keeps the underlying cause and the upstream's stated reason.
14. **Blanket tolerance.** Tolerate an expected failure by name and fail on everything else.
15. **Mirrored copies that drift.** A rule needed in two places has one source, or a parity test.
16. **Query predicates that lie.** Conditions on one array element share one element-scoped clause; boundary values get an explicit branch.
17. **Tests that fake the failing layer.** One test per change runs through the real next hop and the real schema, and asserts the exact set.
18. **Safety nets never exercised.** A renewal, refresh, backup, failover or alarm proves it worked, not only that it ran.
19. **Expiries with no register.** Anything that expires has a date, an owner and an alarm before it lapses, in one register.

---

## 1. Borrowed links

**Rule:** Store and display only addresses you own; a third-party CDN URL or a signed URL is an input to copy, never a value to keep.

**Why it hurts:** A borrowed or signed link can expire or be revoked after it is stored, which can silently break images and links, and a failed image usually raises no error anywhere.

**How to spot it:** A persisted field such as `*Url`, `avatarUrl`, `logoUrl` or `mediaUrls` written straight from an upstream response. An `<img src>` reading such a field. A URL carrying an expiry or signature query parameter (`Expires=`, `Signature=`, `token=`) that is persisted, emailed, or written into Open Graph or JSON-LD.

**Guard shape:** A lint rule that fails an image source expression reading a stored third-party URL field outside one approved component. A scheduled query that counts stored strings matching the signed-URL markers and alerts above zero, with a positive control that proves the query can match. A browser check that asserts zero image requests to hosts you do not own.

---

## 2. Whole-document reads

**Rule:** A list read answers a named view, the narrowest by default; an unknown view is a 400; every `limit` has a maximum; only an allowlisted slice crosses a server-to-client boundary.

**Why it hurts:** Returning whole documents can multiply payload size, which can slow every page load on a phone and can expose fields the client never needed.

**How to spot it:** A `find` or aggregate with no projection on a list route. A validator on `limit` with no maximum, such as `Joi.number()` without `.max()`. `parseInt(req.query.limit) || N` passed straight to the database. A client component receiving a stored document whole as a prop. A proxy relaying an upstream body with no size check.

**Guard shape:** A test per named view asserting the exact key set and a byte budget on a large fixture. A test that walks every validator and fails on a `limit` key with no maximum. Request logging that flags a response over a per-route size budget.

---

## 3. N+1 requests and unbounded bursts

**Rule:** The server answers a screen's question in one call, a test budgets each screen's request count, and every fan-out has a concurrency cap.

**Why it hurts:** Per-item requests can make a screen slow in proportion to its length, and an uncapped burst can trip a downstream throttle and cause refusals for every user of that service.

**How to spot it:** A fetch inside `.map` per card, row or binding. `Promise.all(items.map(fetchSomething))` with no cap. A per-entity route called many times where a screen needs many entities. A request that bypasses an existing batching helper.

**Guard shape:** A render test against a counting HTTP mock that asserts the exact route set and the expected call count for each. A lint rule that requires a `Promise.all` over network calls to go through a named concurrency-limited helper. A lint rule forbidding direct calls to an endpoint that a batcher fronts.

---

## 4. Secrets that can reach logs or errors

**Rule:** Redact at the boundary (logger serializers, the error reporter's pre-send hook, error constructors) by the value's shape, never by the variable's name, and never put an upstream response body into an error message.

**Why it hurts:** A single leaked token or credential can expose every tenant's data, and a log line or error event can carry it further than anyone reading the code expects.

**How to spot it:** `logger.error({ err })` on an HTTP client error that carries request config and headers. A template literal that interpolates an upstream response body into `new Error(...)`. `access_token=` in a URL. A shell presence check such as `${VAR:-}` that expands the value. An error-reporting init that sends default PII or local variables with no scrub hook. A test asserting that a full URL reaches a log byte for byte.

**Guard shape:** A REFUSE test per service that logs an HTTP error carrying `Authorization: Bearer <poison>` and reports an event with a `token=` cookie, then asserts the poison appears nowhere in the output; build the poison in the test's own language, not through a shell. A scheduled log query for credential-shaped strings, with a positive control. A lint rule on template literals that interpolate a response body into an error.

---

## 5. An error status used to mean "nothing yet"

**Rule:** A GET a page makes on load answers 200 for every valid state, with the state in the body; 4xx is only for a request that is wrong, and a caller without access still gets 403, never `200 null`.

**Why it hurts:** An error status for an ordinary empty state can fill consoles and error tracking with noise, and the client-side suppression added to quiet it can hide real 404s.

**How to spot it:** A service that throws `404 *_not_found` for a collection-level "none yet". A client call that lists 404 or 403 as an expected status on a GET. A catch that turns a 404 or 403 into `null` or a state string.

**Guard shape:** A route test pair per GET: ALLOW pins 200 plus the state field for the empty state, REFUSE pins 403 for a caller without access. A lint warning on an expected 404 or 403 for a GET whose path has no id segment. A query that trends 4xx responses on page-load GETs by route.

---

## 6. Unbounded background work

**Rule:** Every outbound call has a timeout shorter than its caller's budget, every client poll pauses while the page is hidden and stops or backs off after a cap, and an SDK socket timeout comes with an explicit retry limit.

**Why it hurts:** A hung upstream can turn a user action into a gateway timeout, and a poll left running in a background tab can multiply backend load with nobody using it.

**How to spot it:** `fetch(url, { method, headers, body })` with no `signal`. An HTTP client call with no `timeout` on an instance with no default. An SDK client constructed with no request timeout. `setInterval` or a recursive `setTimeout` poll with no `document.visibilityState` check. A socket timeout added with the SDK's default retry count left in place.

**Guard shape:** A lint rule on `fetch` calls whose options carry no `signal`, steering to one shared timeout wrapper, proved red on a bare `fetch(url)` fixture. A test that every registered poll site handles `visibilitychange`. A scheduled count of timeout-less call sites that alerts on growth.

---

## 7. A cache that replaces instead of merging

**Rule:** A shared cache has one write rule, merge by id; a full refresh merges and then prunes only what the server says is gone.

**Why it hurts:** A writer that replaces can erase what another writer merged, which can cause repeated refetches and can show stale or wrong state that persists across reloads.

**How to spot it:** `setState(prev => ({ ...prev, [key]: items }))` beside another writer that upserts into the same key. A persistent store write of a whole list under one key on every change. `localStorage.setItem` of a whole list.

**Guard shape:** A test per shared cache: seed it, upsert one item, re-seed with a page that omits it, and assert the exact id set. A lint rule that permits writes to a keyed cache only through named merge helpers.

---

## 8. Duplicate fetches per render

**Rule:** Server reads go through one request-scoped memo keyed by backend, path and params, so two helpers asking the same question in one render share one call.

**Why it hurts:** Repeated upstream reads within one render can add latency and load for no benefit, and the cost grows with the size of what is read.

**How to spot it:** Two helpers in one page each fetching the same upstream path. A `cache: 'no-store'` fetch in a server component with no request-scoped `cache()` wrapper.

**Guard shape:** A server-render test against a counting fetch mock that asserts the exact upstream call list. A tracing query that flags a span description repeated within one trace.

---

## 9. User-visible failures that report nowhere

**Rule:** A failure a user can see reaches error tracking or an alarm, and the affected user hears about it even when the app is closed (push or email), in plain words, with the fix.

**Why it hurts:** A failure no system reports can be discovered first by the user's own customers, and can persist unnoticed.

**How to spot it:** `onError={() => hide()}` on an image. `.catch(() => {})` on a read whose result renders. A failure branch that only emits a live socket event. A status write to `expired` or `failed` with no notification beside it.

**Guard shape:** One notification path that every terminal failure calls, with a test asserting the call on each terminal failure branch. An image error handler that reports a sampled breadcrumb naming the host, never the URL. An alarm on credentials or jobs entering a dead state.

---

## 10. Test traffic in production signals

**Rule:** A process that is not a deployed production artifact never reports as production; your runs against production carry a verified run marker, report under a separate test environment, and never page. Tag, never drop.

**Why it hurts:** Test noise can drown real alerts, and test bursts against production can degrade service for real users.

**How to spot it:** An error-reporting init whose environment falls back to a default or comes from a local env file convention. A script, build or end-to-end run that calls production with no marker.

**Guard shape:** An environment derived from the deploy itself, with a REFUSE test that the production branch resolves to `production`. A signed run marker checked server side. Alert rules scoped to `production`, plus one volume rule on the test environment.

---

## 11. Silencing recurring issues

**Rule:** A recurring issue is never ignored, archived, resolved, allowlisted as expected or called "by design" without a named root cause that explains every event, a guard that turns red on a recurrence, and a proof window at zero.

**Why it hurts:** A silenced issue can keep happening with nobody told, and each suppression makes the next real failure on that path harder to see.

**How to spot it:** An issue status change with no linked fix. A diff that adds an expected-denial or expected-status allowance, an `ignoreErrors` or `denyUrls` entry, or a drop in the error reporter's pre-send hook. A "by design" comment next to a suppression.

**Guard shape:** A scheduled query for ignored or archived issues with recent events, and resolved issues with events after resolution, each sent back to unresolved unless it links a root cause. A pre-push check that a diff adding a suppression names a root-cause document in the same commit message.

---

## 12. Alarms that cannot fire

**Rule:** An alarm's threshold is a claim about traffic: one real failure of that path must breach it, it reads a signal the code actually emits on failure, and an alarm left in its alarm state notifies again.

**Why it hurts:** An alarm whose threshold real traffic cannot reach can stay green through a real outage, and an alarm that notifies only on a state transition can sit red with nobody told.

**How to spot it:** A multi-datapoint requirement (such as `DatapointsToAlarm` above 1) on a low-volume path. An invocation-error metric on a function that wraps an HTTP framework, which answers a handled 500 as a successful invocation. A threshold copied from a busier path.

**Guard shape:** An infra test that compares each alarm's threshold times datapoints against the observed per-period traffic of its path and flags any alarm a single failure cannot breach. A scheduled check that notifies again for alarms left in the alarm state. A verifier that triggers each alarm's path on purpose and confirms the transition.

---

## 13. Dropping the cause

**Rule:** A wrapper error carries the underlying error as `cause` and the upstream's stated reason in structured fields, and the log line prints them.

**Why it hurts:** A failure that cannot be named can recur unfixed, because the detail that tells DNS, TLS, throttling and a refusal apart can be thrown away at the wrap.

**How to spot it:** `throw new SomeError('...')` inside a catch that does not pass `{ cause: err }`. A log call in a catch that prints only the wrapper's message.

**Guard shape:** The ESLint core `preserve-caught-error` rule at error level, proved red on a fixture that rethrows without `cause` (confirm the installed ESLint version ships the rule). A REFUSE test that a refused upstream call's log line contains the upstream's error code field.

---

## 14. Blanket tolerance for one expected failure

**Rule:** When a step tolerates a known failure, match that failure by name and fail on everything else; never a bare `||`, and a pipeline's exit status is its last command's.

**Why it hurts:** A blanket tolerance can turn every failure into success, so a release step can silently stop working while every run reports green.

**How to spot it:** `|| echo`, `|| true` or `2>/dev/null || true` on a step that matters. `rc=$?` read after a pipe without `set -o pipefail`, which reports the last command's status. A tolerated read whose missing value is never checked afterwards.

**Guard shape:** A pre-push or CI check that fails on workflow `run:` lines ending in `|| echo` or `|| true` unless the line names the tolerated condition in a marker comment, with comments stripped before matching. A test that the tolerated step still fails on an unnamed error.

---

## 15. Mirrored copies that drift

**Rule:** A rule needed in two repositories lives in one package; where a copy is unavoidable, a parity test compares the copies and moves with the function it mirrors.

**Why it hurts:** Two copies of one rule can diverge silently, so one path can reject or drop what the other accepts.

**How to spot it:** A comment containing "must match", "ported", "mirrors" or "copy of". The same filename with similar contents in two repositories. A constant table duplicated across services.

**Guard shape:** A sweep that lists same-named files and mirror comments across repositories and requires each to name its parity test in a register. A parity test that runs both copies over the same inputs and compares the results.

---

## 16. Query predicates that lie

**Rule:** Two or more conditions on the same array element go in one element-scoped clause (`$elemMatch` in a document database), a value whose meaning inverts at a boundary gets an explicit branch, and a projection on a credential-bearing array names only the fields it needs.

**Why it hurts:** Separate predicates on an array can each match a different element, which can select records that meet none of the intended conditions, and a boundary value such as a zero limit can turn a bounded read into an unbounded one.

**How to spot it:** A filter object with two or more keys sharing an array prefix (`'items.a'`, `'items.b'`) and no `$elemMatch`. `.limit(x)` where `x` comes from a request and can be 0. A positional projection after a multi-predicate array match. A sparse or partial index whose filter cannot match the queries meant to use it.

**Guard shape:** A lint rule flagging query objects passed to `find`, `updateOne` or `countDocuments` with two or more keys sharing a dotted array prefix. A REFUSE fixture per sweep query whose array splits the conditions across two elements and must not match. A test that a zero or null limit is rejected or clamped.

---

## 17. Tests that fake the layer where the failure lives

**Rule:** At least one test per change runs through the real next hop (the real route handler and validator) and the real schema model, asserts the exact set rather than a count, and tests what renders rather than what is declared.

**Why it hurts:** A stub at the failing layer can keep tests green while production breaks, and a fix can pass its tests while the code path it changes is unreachable.

**How to spot it:** A stubbed model write such as `sinon.stub(Model, 'updateOne')` with no real-schema test beside it. A client test that mocks the network when the change alters what the client sends. `calledOnce` where the question is which call. A count assertion where the set matters.

**Guard shape:** A red proof: the new test, run at the base commit in a read-only worktree, goes red on its REFUSE assertion and then passes on the fix. A review item that asks for the real-hop test by name.

---

## 18. Safety nets never exercised

**Rule:** A renewal, refresh, backup, failover or alarm proves that it worked, not only that it ran, and one that production never exercised gets exercised on purpose before the day it is needed.

**Why it hurts:** A safety net that runs without ever succeeding can fail on the one day it matters, with every run log reporting success.

**How to spot it:** A scheduled job whose success log reports zero renewed, refreshed or checked on every run. A "did not run" alarm with no matching "did not succeed" alarm. A restore path no test or drill exercises.

**Guard shape:** A metric for the time since the last real success per target, with an alarm when it exceeds the renewal window. A synthetic exercise that renews or restores one internal canary on a schedule and alarms on refusal.

---

## 19. Expiries with no register

**Rule:** Anything that expires (a token, key, certificate, domain, invite, approval, signed URL) has a row in one register with its date, whether it renews itself, its owner, and the alarm that fires before it lapses.

**Why it hurts:** An expiry date nobody recorded can become an unscheduled outage, with no warning to the person who could renew it.

**How to spot it:** A stored `tokenExpiry`, `expiresAt`, `expires_in`, `NotAfter` or similar field with no reader that alarms. A credential or certificate created by hand in a console with no record of its expiry.

**Guard shape:** A register generated on a schedule from read-only sources (stored token dates, certificate `NotAfter`, domain expiry lookups, API token expiry headers), plus a hand-kept section for what cannot be read automatically. An alarm on any row that does not renew itself inside its lead time, escalating as the date nears.
