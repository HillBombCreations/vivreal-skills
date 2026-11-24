---
name: vivreal-observability
description: 'Use when reasoning about whether Vivreal would actually FIND OUT about a failure: CloudWatch alarms and why one that looks healthy may be latched silent, alarm periods and thresholds, AWS Budgets against cost alarms, log groups and retention, API Gateway access logging, CloudFront logging and origin verification, or any question shaped like "why did nothing page us" or "is this alarmed". Teaches that an alarm notifies on a TRANSITION and never on a state, that a threshold is a claim about traffic volume, and the shapes where a failure is invisible to the thing meant to catch it. Triggers on: CloudWatch alarm, alarm latched, alarm did not fire, notification, SNS, put-metric-alarm, describe-alarms, AWS Budgets, cost alarm, billing alarm, log retention, put-retention-policy, never expire, filter-log-events, access logging, API Gateway logging role, CloudFront logging, origin verification, on-call, did we get alerted, is this monitored, WAF custom response, CORS on a 429.'
---

**This skill states mechanisms, not inventory.** Every roster and count below is something the AWS
CLI produces in seconds, and this fleet's alarm estate is actively being repaired, so a number
written here is stale by the time it is read. Count it, and say when you counted.

# Would we actually find out?

This is the question the skill exists for. "Is there an alarm" is the wrong question, and answering
it has repeatedly produced a confident yes on a failure nobody was told about.

Three separate things must all hold before a failure reaches a human:

1. The failure has to **produce the signal** the detector watches.
2. The detector has to be **capable of crossing its threshold** given real traffic.
3. The detector has to **transition** into the alarm state, not merely be in it.

Each of those has failed independently here, and each failure looked like a healthy monitor.

---

## 1. An alarm notifies on a TRANSITION, never on a state

This is the single most expensive misunderstanding in this estate, and it is the reason "we have an
alarm on that" is not an answer.

An alarm sends its notification when it **changes** from OK to ALARM. While it stays in ALARM it is
silent. So if the alarm's evaluation period is **at least as long as the interval at which the
failure recurs**, the alarm goes red once, notifies once, and then never speaks again no matter how
many more times the thing fails. It latches. A dashboard shows it red; nobody's inbox shows
anything.

**It is non-deterministic, which is worse than being reliably broken.** Two alarms of identical
shape produced opposite outcomes across comparable outages: one sent zero notifications across a
multi-night failure; the other re-notified several times, purely because its datapoints happened to
land such that a rolling window read OK briefly each day, which re-armed the transition. You cannot
conclude anything from having received notifications, and you cannot conclude anything from not
having received them.

**So the diagnostic is not "did it notify".** It is:

> **Is the evaluation period at least as long as the interval at which this failure recurs?**

If yes, the alarm can latch, and its silence is worthless as evidence. Fix by shortening the
period, so the metric returns to OK between occurrences and the transition re-arms.

**Corollary, and sweep for it:** a long-red alarm is a silent alarm. An alarm that has been in ALARM
for weeks is not a monitored problem, it is an unmonitored one. Two live outages were found exactly
this way. Sweep `describe-alarms --state-value ALARM` and sort by `StateUpdatedTimestamp`; anything
old is a finding in itself.

## 2. A threshold is a claim about traffic, and most claims here are false

A threshold like "5 errors in 5 minutes" asserts that the path can plausibly produce five errors in
five minutes. On a route that takes a couple of dozen invocations a fortnight, **it cannot fire at
all**, not rarely: never. The alarm exists, is correctly configured, reports OK forever, and is
decoration.

Several alarms in this fleet are in that position, and a handful more are reachable in well under
one per cent of evaluation windows. Two carry this fault **together with** the latching shape, which
matters because the fixes pull in opposite directions: shortening the period to stop latching makes
an already-unreachable threshold more unreachable still. **Fix both at once or you will make it
worse.**

Note the distinction that stops this becoming a witch hunt: most unreachable thresholds sit on
**dormant functions**, which is a different problem (why is this deployed at all) and not an alarm
defect. Only genuinely-trafficked paths with impossible thresholds are alarm defects.

**Before setting any threshold, measure the metric's real distribution over 30 days.** A threshold
nobody checked against traffic is a guess wearing a number.

## 3. The failure may never produce the signal at all

Three shapes here, all of which make a failure structurally invisible:

- **A handled error returns as a successful invocation.** Backends running Express inside Lambda
  through a serverless adapter answer a 500 by *returning* it. The Lambda runtime sees a clean
  return, so the **Lambda `Errors` metric stays at zero** and every alarm built on it is blind to
  every application failure. An entire service's functions can be "alarmed" and cover nothing.
  Detect application failures on a log-pattern filter or an HTTP-status metric, never on `Errors`.
- **The inverse: a runtime error the logger never sees.** An `Invoke Error` is written by the Lambda
  runtime itself and does not pass through the application logger, so a **log-pattern filter can
  never catch it**. A snapshot function failed on roughly half its invocations while both its
  logging and its subscription were fine. **A log filter and a metric alarm are not substitutes for
  each other; they catch disjoint sets.** Where it matters, you need both.
- **Rejected requests write no log line.** A request refused at the gateway before the function runs
  is counted by API Gateway and logged nowhere. So a traffic census built from gateway counts
  measures **requests, not successes**, and a route showing a dozen calls may have had a third of
  that actually execute. Reconcile against invocations before concluding a route is used.

---

## Cost: alarms on a metric that does not exist

Two cost alarms here watched a metric with **zero registered datapoints**, so they read healthy
permanently while real spend sat at several times their threshold. A control metric returning normal
datapoints alongside them is what exposed it.

**A metric alarm proves nothing until you have confirmed the metric has data.** `get-metric-statistics`
over the alarm's own window, and require a non-zero datapoint count, before believing any billing or
cost alarm.

Those two are replaced with **AWS Budgets**, which read actual spend from the billing system rather
than a published metric, and which were reconciled against the cost report at setup. There are two:
a total-spend budget and a tighter infrastructure-only one. **Read the current amounts from
`aws budgets describe-budgets`**; they are policy values and they move.

---

## A new alarm must not page at its own creation

An absence alarm (a "no run in 2 hours" alarm, a missed-run alarm) reads ALARM the moment it is
created, because no datapoint exists yet, and pages the owners at its own creation:
`live-rebuild-sweep-missed-run` paged 12 minutes after it was made and stayed in ALARM (backlog
F343). **Release B's answer:** every new alarm was created with `ActionsEnabled: false`, and a
reviewed one-line commit switched its actions on after it had read `OK` for 24 hours, proven with
`describe-alarms --query 'MetricAlarms[].[AlarmName,StateValue,ActionsEnabled]'`. Each repo pins it
with a test that holds the list of alarms allowed actions (VR_Secure_API
`test/unit/alarms/alarmActionsGate.test.js`, VR_Client_API `test/checkoutTaxAlarm.test.js`, and the
same in CMS and Main); a flip edits that list.

**The flip is not a deployment** (hq `docs/standards/process.md`, P-one-promote, amended 2026-11-18:
one deployment per repo per release, for every plan from now; parameter and data flips, one-shots
such as indexes and kits, package publishes under P-packages and docs merges are not deployments,
and a repo whose several stacks deploy back to back in one step counts as one deployment). Release
B's plan flipped its alarms with follow-up commits and promotes (BR-30); a plan no longer does: only
release B's deployments already made before the owners' decision (hq `decisions.md`,
2026-11-18T16:48:03Z) are exempt, and BR-30's flips now ride each repo's one batch, walked on the
local stack until the walk passes, before that repo's one deployment. An alarm whose metric cannot
breach before its soak ends is created with its actions on; one that could page at its own creation
is shaped by the design so it cannot, inside the one deployment, or carries an owner exception
recorded in hq `decisions.md`.

**Release B's alarms created this way** (actions off from 2026-11-17 and 2026-11-18, each switched
on inside its repo's one deployment on 2026-11-19 after reading `OK` for 24 hours):
`VR-CMS-API-caller-rate-refused`, `VR-Secure-API-caller-rate-refused`,
`VR-Client-API-checkout-tax-dropped`, `VR-Secure-API-UsageMonths-errors`,
`VR-Secure-API-UsageMonths-no-run-2h`, `VR-Secure-API-usage-absorbed` and EventHandler's six site
rebuild alarms (the rebuild's R-B5). Main's `VR-Main-API-sign-in-code-send-failed` was created with
its actions on, inside Main's one deployment (BR-35d joined the batch). Read the live set with that
query, not this list. **The cost of the rule:** while any alarm's actions are off, Secure's
AlarmVerifier counts it as undeliverable, so `VR-Secure-API-AlarmVerifier-undeliverable-alarms`
flips to ALARM every few hours and notifies the owners (backlog F499). Expect it while an alarm is
held off, and say so when it fires.

**Read the AlarmVerifier from its sweep line, never by a word** (release B deploy day). Each run
writes one `alarm.verify.sweep_complete` line (VR_Secure_API `src/alarmVerifier/main.js`) carrying
`alarms_checked`, `alarms_failing`, `by_class` and the failing alarm names. The word
"undeliverable" is in the alarm's NAME and its metric's (`UndeliverableAlarms`), never in the
sweep line, so a log filter on it reads a false zero (it did on 2026-11-19, while the sweep line
itself read 0 failing). Filter on the event name and read `alarms_failing`.

## What v7 deployed (2026-10-20), and how to check it

The estate grew in the v7 release. These are pointers to the templates and checks, not a roster;
read the deployed stack for the current set.

- **Mongo timeout metric filters** on every function log group the template names, plus the Client
  API slow-fetch filter, in vivreal-hq
  `packages/fleet-ops/mongo-timeout-alarm/cloudformation/mongo-timeout-alarms.yaml`. Beside the
  one-minute `vivreal-mongo-operation-timeouts` alarm sits a sustained alarm,
  `vivreal-mongo-operation-timeouts-sustained`, whose threshold is an owner decision passed
  explicitly on every deploy (`--parameter-overrides SustainedThreshold=...`), because a
  CloudFormation parameter `Default` never updates a deployed stack. Read the stored parameter.
- **The two alarm names share a prefix.** A check that matches alarm names with `includes()` or a
  prefix passes on the wrong alarm; parse whole names (the composite's `ALARM("...")` terms).
- **Amplify hosting alarms** in `packages/fleet-ops/cloudformation/amplify-hosting-alarms.yaml`:
  portal 5xx and latency, marketing 5xx, admin 5xx, and customer sites 5xx computed as the account
  total minus the named apps. The sites page alarm uses the composite
  `vivreal-mongo-upstream-outage` as its `ActionsSuppressor` (with a wait and an extension period
  read from the template), so a database outage pages once as a database outage and a real sites
  outage still pages, a few minutes late at most.
- **An alarm with no actions of its own can still be delivered through a composite.** Secure's
  alarm verifier once credited only an alarm's own actions and flagged the suppressed sites alarm
  and the composite as undeliverable; it now follows composites (Secure v2.22.3, 2026-10-20). A
  verifier finding on an actionless alarm is a question about the composite first.
- **Read-only coverage checks.** `npm run check:mongo-coverage --workspace packages/fleet-ops` in
  vivreal-hq compares the filters with the live log groups; exit 2 is VOID, not a pass, and it
  belongs after any Secure or CMS deploy that adds a function. VR_OnCall_Webhook carries its own
  `npm run check:subscriptions`.
- **Alarm pushes reach admin-app devices only.** The OnCall bridge's pushes open the admin app's
  monitoring page, and Main's notification consumer sends staff types only to devices subscribed
  with `surface: 'admin'`. Until an admin device subscribes, an alarm push reaches nobody, and the
  consumer logs a warning saying so (see `vivreal-notifications`). v7 shipped Main and the bridge
  with the admin device sign-up (runbook S11) deferred (owner, 2026-10-20), so check for an admin
  device subscription first.

---

## Release C (live 2026-11-24; read at the deployed lines: Secure `origin/stable` `7e3c2334`, CMS release `9042eaf5`,
Client Auth `8a182057`, EventHandler `main` `87c2ae12`, Templates `origin/stable` `a7121e5f`, hq `f06f6580`)

Each deployed tree equals the approved head first read here except for version stamps, one Secure doc, the hq script watch's
schedule move and EventHandler's sweeper fix (each compared file by file with the GitHub compare API on 2026-11-24).

- **The alarm verifier's hold list** (VR_Secure_API F499): `src/alarmVerifier/holdList.js` holds an alarm switched off
  by plan from `UndeliverableAlarms`, for the `actions-disabled` class only, each entry with an owner-approved reason
  and an `until` at most 45 days after the commit that added it; held alarms are logged by name and counted in the
  `HeldAlarms` metric. The stuck digest has no exemption list. **So pausing an alarm's pages trades one page for
  another** (release C, L-C-31): an alarm whose actions are disabled and that is not on the hold list is counted at the
  verifier's next :26 run and pages through `VR-Secure-API-AlarmVerifier-undeliverable-alarms`. Pause a once-a-day alarm
  only around its own run, between two verifier runs, or add a dated hold in a reviewed Secure change.
- **The daily script watch** (hq F457, `packages/fleet-ops/script-watch`, stack and function `vivreal-script-watch`,
  daily at 09:50 UTC, rule `vivreal-script-watch-daily`; it moved from 09:35, which Secure's nightly marketing rollup
  already holds, and the deploy script refuses a schedule another rule holds): it reads the script hosts each page
  actually serves on Vivreal's own pages, the public app pages and every customer site host, with three alarms (only
  did-not-run gated by `AlarmActionsEnabled`; the new-host and void alarms act from the first change set, so its first
  run can page); the admin app's Errors page opens with a Blocked scripts section (`scriptBlocks`). Deployed by
  `scripts/deploy-script-watch.sh` with `--alarm-actions on|off` and no default. **A watch's allow rule for a known
  vendor covers that vendor's host family, and a new watch's first scheduled run is read before its alarm can page**
  (release C, L-C-32): its first run paged on five Microsoft Clarity beacon hosts (letter subdomains of `clarity.ms`
  that Clarity rotates) behind tags the baseline already knew, because the baseline listed hosts. A family rule is
  tested with lookalike REFUSE cases (a host that only ends in the vendor's name, a sibling domain). Read the live rule
  in hq `packages/fleet-ops/script-watch` at `origin/main`, not here: its fix forward follows release C's deploy.
- **The stylesheet warning** (Templates, VIVREAL-TEMPLATES-Q, D-P6-5): a failed stylesheet is retried once, then one
  named warning, never a page of errors; a head sheet that failed before hydration is found by its throwing
  `cssRules` read.
- **An absence alarm is created so it cannot breach before its first datapoint** (release C, L-C-27):
  `TreatMissingData: notBreaching`, or actions off with a flip after the first datapoint. CMS's
  `VR-CMS-API-pickup-reminder-did-not-run` read missing data as breaching over 3 x 3600 s, went to ALARM at its
  creation before the hourly sweep had run, and paged the owners (its booking sibling did the same on 2026-10-30).
  Every plan and review checks each new alarm for a creation-time breach.
- **New alarms**: `vivreal-site-capacity-refused` (EventHandler F168), `VR-CMS-API-pickup-reminder-errors` and
  `-did-not-run` (CMS F528), `vivreal-square-coupon-link-close-failed` (CMS); `VR-Client-Auth-lambda-errors` now
  needs two consecutive minutes. The rebuild sweeper's oldest-pending alarm publishes 0 in `shadow`, so a practice
  tick never pages (F620).
- **Tracing**: Secure, Client and Main sample through a `tracesSampler` that returns the service's own rate, so an
  incoming trace's decision no longer overrides it (F568).

## Logs

**Retention.** The declared policy is **30 days standard, and 365 days for sign-in, billing and
payment paths**, because those are the money and identity trails. The estate has been swept so that
**no log group is set to never expire**, down from several dozen. A never-expiring log group is both
an unbounded bill and a compliance surface nobody decided to keep. One deliberate exception: the
admin app's ops-read Lambda log group keeps 400 days (vivreal-hq
`packages/admin-app/cloudformation/ops-read.yaml`, v7), so do not "fix" it to the policy.

**The CloudFormation trap that makes this fragile.** Retention was drifted across an entire
service's functions, set by hand, while the template declared something different and had never been
applied. **CloudFormation only re-asserts a property whose TEMPLATE value changed**, so the drift
survived every deploy. The consequence is the dangerous part: the next edit to that line for any
reason would have pushed the template's value onto every function at once and **destroyed the
long-retention money trail as a side effect of an unrelated change**. Declare retention explicitly
and pin it with a test; never leave it hand-set.

**`filter-log-events` returns a false zero.** Recent events are not yet indexed, so a filter over a
fresh window comes back empty on a stream that plainly has data. Read the stream directly with
`get-log-events`, and remember the API **paginates**, so a `length(events)` projection prints a
per-page count that looks like a total. See `verification-discipline`, and `vivreal-lambda-logs`
for the full read-the-stream and Logs Insights method.

**Gateway access logging was never wired, for years.** The account-level CloudWatch role that API
Gateway requires for access logs existed and was correctly configured since 2024, and had simply
**never been attached at the account level**. That, and not any per-stage setting, is why the fleet
had no per-route telemetry at all. It is now connected.

**Connected is not the same as searchable by route (read 2026-11-18).** The CMS, Secure and Client
REST stages log `resourceId` and no request path; Main's format logs the path
(`vivreal-knowledge:vivreal-main-api-knowledge`) and the WebSocket stage's logs the `routeKey`, both
searchable by route; the MCP server and Outreach have no access log. So a search of the first three for a route's name is a false zero: map the route to its
resource id first, or read the Lambda's own `route` field, and prove the zero with a control row
in the same query (`vivreal-lambda-logs`, Step 3). The missing path is deliberate, and each
template's access-log comment says why: `$context.resourcePath` falls back to the full resolved path
on a request that matches no route, so a probe once put a caller's email address in the log, and an
access log format has no redaction step. Main logs `$context.path` by a recorded trade-off: its
catch-all proxy leaves `resourceId` unable to name any route. Adding a path elsewhere is that same
design decision, never a quick fix; read the stage's `accessLogSettings.format` before relying on
this paragraph.

The transferable lesson, and it recurs: **a thing wired by hand is a thing nobody can see is
unwired.** The same shape produced a Cognito trigger that was detached for months. Anything
configured through a console click and not expressed in a template needs an explicit test that it is
still attached, because its absence looks exactly like its presence from every repository.

**CloudWatch refuses an evaluation window longer than seven days.** A weekly schedule therefore
cannot be alarmed with any margin; a twice-weekly cadence leaves enough periods to detect a single
missed run. If a scheduled job must be monitored, its cadence is set by what monitoring can see, not
only by how often the work is needed.

---

## Edge

**All five CloudFront distributions now log**, up from two. Logging is a precondition for answering
almost any edge question, so check `get-distribution-config` for `Logging.Enabled` before promising
an analysis you cannot perform.

**The public API distribution has no origin verification.** The raw API Gateway URL behind it is
reachable directly, so any protection applied at the distribution (WAF, caching, headers, rate
rules) can be bypassed by calling the origin. Treat edge-applied controls on that path as
non-binding until a shared secret header or equivalent is enforced at the origin, and do not cite
one as a security control.

**Log bucket expiries are not uniform.** At least one distribution's dedicated log bucket carries a
shorter expiry than the shared bucket's policy, and nothing records whether that was deliberate.
Read the lifecycle rule rather than assuming the fleet policy applies.

**A WAF block a browser cannot read looks like the user's own network** (release B live walk M1,
2026-11-17). A WAF rule's `CustomResponse` (a 429 or a 403) REPLACES the answer API Gateway or the
origin would have sent, so it carries none of the API's CORS headers. The browser then reports a
network failure, the app shows its offline or "check your connection" text, and nothing in the app's
own error handling, Sentry included, sees a refusal. So:
- **Every custom response a browser can reach names its CORS headers:**
  `access-control-allow-origin` (one origin: a WAF cannot echo the request's `Origin`, so any other
  origin the app answers on stays unreadable), `access-control-allow-credentials: true` when the app
  sends credentials, and `vary: Origin`. Custom responses and their headers add no WAF cost.
- **A preflight blocked by a rate rule hides the answer too.** A custom header on the call (the
  portal's `X-App-Source`) makes the browser preflight it, and a preflight answered with any non-2xx
  status fails whatever headers it carries. Where the CORS layer answers `OPTIONS` before any route
  runs, a rule scoped to routes can skip the exact `OPTIONS` method and open no door; a whole-API
  rule that still counts it can still block a preflight at its limit. VR_Main_API v2.21.0 (live
  2026-11-19) skips it in two route rules and adds the headers to all of them
  (`vivreal-knowledge:vivreal-main-api-knowledge`, the WAF bullets).
- **Prove it with the app's real `Origin`** (next section).

---

## Audits and walks: four ways to be wrong quietly

- **Amplify access-log audits have two silent false negatives.** Logs are partitioned per domain,
  so read every custom domain AND the default app domain; and a range over 7 days returns nothing
  rather than partial data, so split the range and keep a known-hit control.
- **A WAF walk row reads the block with the app's real `Origin`.** Send the `Origin` the app
  sends (for the portal, `https://vivreal.io`) on the blocked call and on its preflight, and compare
  `access-control-allow-origin` with it byte for byte. A read with no `Origin` cannot tell whether a
  browser accepts the answer, and the app's own screen is the proof that it did: the expected
  result is the app's refusal text, never its offline text. Driving the block can trip the rule's
  alarm, which can page the owners: warn them in chat first (owner rule P-sentry-warn).
- **Older Sentry traces can hold session cookies and query-string emails.** The server-side
  scrubbing rules drop them now; treat traces from before those rules as sensitive.
- **Keep a walk's known errors off the Sentry quota:** add the project's IP inbound filter for the
  walk machine before the walk and remove it after (message filters need a higher Sentry plan).

## VR_OnCall_Webhook: errors reach a person by push
A new Sentry error becomes one staff web push in the admin app (`src/errorPush.js` at `origin/main`): claim, format, `SendMessage` to `vivreal-notification-queue`, consumed by VR_Main_API as type `infra.error`, opened at the admin app's Errors page. It REPLACED the ClickUp filing (owners, 2026-10-27), so it is the only delivery to a human on that path. An enqueued push is not a delivered one: delivery also needs the `infraAlerts` switch on and an admin-app device subscribed (`surface: "admin"`); the consumer logs `no-subscriptions` when there is none. See `vivreal-notifications`.

## fleet-ops e2e-local: the guarded local stack
vivreal-hq `packages/fleet-ops/e2e-local` (`node e2e.js start`) runs the portal, the admin app, Vivreal_Templates, the five APIs and VR-MCP-Server locally from worktrees under `E2E_WT_ROOT` (set it to `$VIVREAL_REPOS/_wt`), each API as `federated-user/local-e2e-<svc>`. Minting those identities needs `sts:GetFederationToken` on your own AWS identity; each scoped policy must fit its 2048-character limit. `run.log` must show the NO-DISPATCH guard holding for every service. Details and ports: that package's `README.md`.

## Where the other half of this lives

- **Application errors and traces:** the `vivreal-sentry` plugin. Note in particular that
  **database spans have never reached the tracing tool**, so query performance is invisible fleet
  wide, and no amount of AWS-side work changes that.
- **Live investigation** of any of the above: the `vivreal-ops` agent, which is read-only.
- **Deploy verification**, which is a different question from monitoring: `vivreal-deploy-tracker`.
- **Connection and cluster limits:** `vivreal-atlas-topology`.
