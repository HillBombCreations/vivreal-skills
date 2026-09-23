---
name: vivreal-observability
description: 'Use when reasoning about whether Vivreal would actually FIND OUT about a failure: CloudWatch alarms and why one that looks healthy may be latched silent, alarm periods and thresholds, SNS notification behaviour, AWS Budgets against cost alarms, CloudWatch log groups and retention policy, API Gateway access logging and the account-level role, CloudFront distribution logging and origin verification, or any question shaped like "why did nothing page us" or "is this alarmed". Teaches that an alarm notifies on a TRANSITION and never on a state, that a threshold is a claim about traffic volume, and the three shapes in this fleet where a failure is structurally invisible to the thing meant to catch it. Triggers on: CloudWatch alarm, alarm latched, alarm did not fire, ALARM state, notification, SNS, put-metric-alarm, describe-alarms, AWS Budgets, cost alarm, billing alarm, log retention, put-retention-policy, log group, never expire, filter-log-events, access logging, API Gateway logging role, CloudFront logging, origin verification, on-call, did we get alerted, is this monitored.'
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

## Logs

**Retention.** The declared policy is **30 days standard, and 365 days for sign-in, billing and
payment paths**, because those are the money and identity trails. The estate has been swept so that
**no log group is set to never expire**, down from several dozen. A never-expiring log group is both
an unbounded bill and a compliance surface nobody decided to keep.

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
per-page count that looks like a total. See `verification-discipline`.

**Gateway access logging was never wired, for years.** The account-level CloudWatch role that API
Gateway requires for access logs existed and was correctly configured since 2024, and had simply
**never been attached at the account level**. That, and not any per-stage setting, is why the fleet
had no per-route telemetry at all. It is now connected.

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

---

## Where the other half of this lives

- **Application errors and traces:** the `vivreal-sentry` plugin. Note in particular that
  **database spans have never reached the tracing tool**, so query performance is invisible fleet
  wide, and no amount of AWS-side work changes that.
- **Live investigation** of any of the above: the `vivreal-ops` agent, which is read-only.
- **Deploy verification**, which is a different question from monitoring: `vivreal-deploy-tracker`.
- **Connection and cluster limits:** `vivreal-atlas-topology`.
