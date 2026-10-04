---
name: vivreal-lambda-logs
description: 'Use when you need to READ or COUNT what a Vivreal Lambda (or an Amplify site''s compute) actually logged, to prove a hotfix is working, to find the error behind a 500, to check a scheduled job ran, or to answer "how many times did X happen". Teaches the method that does not return a false zero, listing the newest log streams and paging get-log-events to the end, counting with Logs Insights instead of filter-log-events, resolving the right log group, account and Lambda version, and the Windows shell traps that silently rewrite a log group path. Triggers on: CloudWatch logs, log stream, get-log-events, filter-log-events, Logs Insights, start-query, is it in the logs, prove from the logs, read the logs, hourly run logged, count errors, Lambda log group, REPORT line, false zero.'
---

# Reading Vivreal Lambda logs without a false zero

**This skill states method, not inventory.** It names no function, log group or count that a
command can produce. Resolve them live, and say when you did.

The log streams are the record of what production did. Sentry is not a substitute: its error
ingestion was quota-exhausted for most of late August to mid September 2026, and a handled 500 from
a serverless-Express backend returns to Lambda as a SUCCESSFUL invocation, so the Lambda `Errors`
metric never sees it either (see `vivreal-observability`). When the question is "did it happen",
read the stream.

## The trap this skill exists for

**`aws logs filter-log-events` returns zero for events that are plainly in the stream.** Recent
events are not yet indexed for the filter, so a window of the last few minutes comes back empty on a
stream that `get-log-events` shows immediately. A control over an older window DOES return hits, so
the pair reads as "the query works, the zero is real", and it is not. This produced a wrong
conclusion twice in one session.

It fails a second way. `filter-log-events` paginates, so `--query 'length(events)'` prints a count
PER PAGE that reads like a total, and `--max-items` truncates the measurement AND any control run
with the same flag, which defeats the usual positive-control fix: a 14 day count came back 0 where
Logs Insights found 250 over the same group and window.

**Rule: never use `filter-log-events` to decide whether something happened.** Read the streams to
see events, and use Logs Insights to count them.

## Step 0: the right log group, in the right account

1. **Resolve the physical function name from the stack**, never guess it. Use
   `aws cloudformation list-stack-resources --stack-name <stack>`; `describe-stack-resources` has
   been measured silently TRUNCATING a large stack's resource list, which turns into a false "no
   such function".
2. **Resolve the log group from the function**:
   `aws lambda get-function-configuration --function-name <fn> --query LoggingConfig.LogGroup`
   (the default is `/aws/lambda/<physical name>`). Amplify-hosted Templates sites log compute to
   `/aws/amplify/<appId>`, and an app with compute logging off has none at all.
3. **Check the account and region.** Most of the fleet is one account in `us-east-1`, but the
   campaigns SES account and at least one customer's Amplify app live elsewhere (separate AWS
   profiles). A zero from the wrong account is a fact about the account.
4. **Retention bounds the evidence.** Standard groups keep 30 days. Anything older is gone, so
   capture the lines you will cite into the report as you read them.

## Step 1: see the events (read the streams)

```bash
export MSYS_NO_PATHCONV=1   # Git Bash on Windows rewrites /aws/lambda/... into a Windows path
G=/aws/lambda/<physical-function-name>

# newest streams first
aws logs describe-log-streams --log-group-name "$G" \
  --order-by LastEventTime --descending --max-items 5 \
  --query 'logStreams[].[logStreamName,lastEventTimestamp]' --output text

# one stream, from the head, paging to the end
aws logs get-log-events --log-group-name "$G" --log-stream-name "<stream>" \
  --start-from-head --output json > page1.json
# repeat with --next-token <nextForwardToken> until the token comes back UNCHANGED.
```

What makes this reliable, and what breaks it:

- **Page until `nextForwardToken` repeats.** That repeat is the only end-of-stream signal. An EMPTY
  page in the middle of a stream is legal, so "no events on this page" does not mean "no more".
- **One stream is one execution environment, not one time window.** A busy function writes many
  streams at once. To cover a window, take every stream whose `lastEventTimestamp` is inside it,
  not just the newest one.
- **The stream name carries the code version that wrote it**, `YYYY/MM/DD/[<version>]<id>`.
  `[$LATEST]` versus a numbered version tells you which build produced a line, which is how a
  "this fix is live" claim is tied to a specific deployed version rather than to a timestamp.
- **`START` / `END` / `REPORT` lines bracket each invocation.** `REPORT` carries Duration, Max
  Memory Used and, on a cold start, Init Duration. A 502 whose REPORT looks healthy and whose
  handler logged success is usually a response-size failure, not a crash.
- **The backends log JSON through pino**, so the event name is a field (`event`, for example
  `social.scheduledSync.completed`) and the human message is `msg`. Search for the event name, not
  for a sentence that may be reworded.

## Step 2: count them (Logs Insights)

```bash
Q=$(aws logs start-query --log-group-name "$G" \
  --start-time <epoch-seconds> --end-time <epoch-seconds> \
  --query-string 'fields @timestamp, event, msg
    | filter event = "social.scheduledSync.completed"
    | stats count() by bin(1h)' --query queryId --output text)
aws logs get-query-results --query-id "$Q"   # poll until status is Complete
```

Insights aggregates server side and is not subject to client paging. Read the result BY TIME BIN,
not only as a total: a 30 day total can describe a period that has already ended. For the most
recent few minutes, confirm in the stream, since indexing lag is the failure that started all this.

## Step 3: earn the zero

A zero is only evidence when the same query can return a hit for something you know is there.

- Pick a control that is **in the same window and the same group**, such as the `REPORT` lines or a
  routine event the function always emits. A control over an older window cannot detect an indexing
  lag on a newer one.
- The control must not share the measurement's failure modes: not the same `--max-items`, not the
  same truncated page, not the same wrong account. Two checks that fail the same way are one check.
- Name the group, account, window and command in the report, so the next reader can re-run it.

## Windows shell traps (this machine)

- **Path mangling:** Git Bash turns `/aws/lambda/x` into `C:/Program Files/Git/aws/lambda/x`, and
  the CLI then reports a log group that "does not exist". `export MSYS_NO_PATHCONV=1` first.
- **`--max-items` emits a `NextToken`** into otherwise valid output, and a truncated JSON document
  can still parse. Prefer `--output json` and parse it with node or python rather than grepping
  text, and check that you parsed at least one event before trusting a count.
- **Encoding:** CRLF and cp1252 can corrupt piped output. Write JSON to a file, then read it.

## Where the other halves live

- Whether anyone would be TOLD about a failure, alarms and thresholds: `vivreal-observability`.
- Proving a deploy landed (stack state, artifact, health SHA): `vivreal-deploy-proof`.
- Sentry-side investigation: the `vivreal-sentry` plugin.
- Per-service failure signatures (for example the CMS hourly social sync): the matching expert in
  `vivreal-experts`, such as `cms-api`.
