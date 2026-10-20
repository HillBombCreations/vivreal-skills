---
name: vivreal-deploy-proof
description: 'Use to PROVE that a backend release or infrastructure change is actually running in production, a VR_CMS_API / VR_Secure_API / VR_Main_API / VR_Client_API / VR_Outreach_API / EventHandler deploy, a release-train promote or backport, a deploy-role IAM grant, or any CloudFormation stack update, and to diagnose one that went green and shipped nothing. Teaches the baseline-then-moved-and-terminal stack check, why UPDATE_ROLLBACK_COMPLETE passes every naive check, the failures that leave no stack events, proving the running code by health SHA, alias and downloaded artifact, and where a deploy-role refusal is fixed. For a customer SITE deploy (Step Functions + Amplify) use vivreal-deploy-tracker instead. Triggers on: did it deploy, is it live, prove the deploy, verify the release, promote went green, stack status, UPDATE_ROLLBACK_COMPLETE, LastUpdatedTime, deploy failed, not authorized to perform, deploy role, health release sha, which version is running, lambda_api.yml, CodeSha256, live alias.'
---

# Proving a backend deploy landed

**A green workflow is not a deploy.** It says the deploy COMMAND exited, not that CloudFormation
applied anything or that the new code is what answers requests. This programme has every variant on
record: a green promote followed by a red deploy (the release line claimed a version production was
not running), a deploy that rolled back while every ref said shipped, a no-op change set that
exited zero, and a watcher that attached to a days-old run and reported success.

**This skill states method, not inventory.** It names no version, stack time or count. Read them.

## The four claims, and what proves each

| Claim | Proof | Not proof |
|---|---|---|
| The commit is on the release line | `git cherry` against the line, or a tree compare when a squash defeats it | `merge-base --is-ancestor` (a backport is patch-equivalent, not an ancestor) |
| The stack applied it | `LastUpdatedTime` moved past a baseline taken BEFORE, AND `StackStatus` is `UPDATE_COMPLETE` by name | a green run; "not in progress"; `LastUpdatedTime` moved alone |
| The new code is serving | the service's `/health` `release` equals the line tip SHA, and the alias or function `CodeSha256` changed | `$LATEST` moved on a function the gateway reaches through an alias |
| The behaviour is in it | a marker string absent before and present after in the downloaded artifact, beside a control string present in both | the lockfile, the source, the test suite |

## Step 1: baseline, then wait for moved AND terminal

```bash
export MSYS_NO_PATHCONV=1
aws cloudformation describe-stacks --stack-name <stack> \
  --query 'Stacks[0].[StackStatus,LastUpdatedTime]' --output text   # BEFORE you dispatch
```

Poll until the time differs from the baseline AND the status no longer ends in `_IN_PROGRESS`, then
assert the status you expect **by name**. A loop that stops when the time changes samples mid
update; a loop that only waits out `_IN_PROGRESS` can read a stack that has not started yet.

**`UPDATE_ROLLBACK_COMPLETE` is moved and terminal, and it is a FAILED deploy.** It satisfies every
naive check: the time moved, nothing is in progress, the workflow may be green. Production runs the
previous code, and the release line now claims a version nobody is running.

### Every function in the stack, with a count

The stack status says the template applied. It does not say each function took the new code, so
read every function the stack owns, and count them, because a loop that drops one prints nothing
to say so:

```bash
export MSYS_NO_PATHCONV=1 AWS_PAGER=""
sp() {   # usage: sp <stack> <expected function count>
  local STACK=$1 WANT=$2 FNS N
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].[StackStatus,LastUpdatedTime]" --output text | tr -d '\r'
  FNS=$(aws cloudformation list-stack-resources --stack-name "$STACK" \
    --query "StackResourceSummaries[?ResourceType=='AWS::Lambda::Function'].PhysicalResourceId" \
    --output text | tr -d '\r')
  N=$(echo $FNS | wc -w); echo "functions: $N (expected $WANT)"
  [ "$N" = "$WANT" ] || echo "STOP: function count differs"
  for f in $FNS; do
    aws lambda get-function-configuration --function-name "$f" \
      --query "[FunctionName,LastModified,CodeSha256,TracingConfig.Mode]" \
      --output text | tr -d '\r'
  done
}
```

- **`tr -d '\r'` on every name list is load-bearing on Windows.** The AWS CLI there ends
  `--output text` with a CR, so the last name in the list carries it, the call for that function
  fails, and the loop moves on. A release once read every stack this way and silently skipped the
  last function of each one. The count is what makes a skip visible.
- **`WANT` is read, not remembered.** Take it from the same `list-stack-resources` query in the
  baseline BEFORE you dispatch, and change it only when the diff adds or removes a function in the
  template. A count copied from an earlier release is the stale inventory this skill refuses.
- **Never count with `length(...)` inside `--query`.** The CLI paginates `list-stack-resources`
  and applies `--query` to each page, so a large stack printed two partial counts. List the ids
  and count them in the shell, as above.
- **Name only the fields you need, and read no environment at all.** Never drop the `--query`,
  because the default output prints every environment value. The helper used to project one
  variable, `SENTRY_RELEASE`, but the local hook that blocks environment reads blocks any
  `Environment.Variables` projection, so the v7 release proved every function with `LastModified`,
  `CodeSha256` and `TracingConfig` instead and recorded that as a deviation (v7 release runbook,
  "Deviation, stack proofs", 2026-10-20). The helper above is that form.

PASS needs the count to match AND every function to show a `LastModified` later than the deploy
time with a `CodeSha256` that differs from the baseline. For functions behind a `live`
alias, also run the alias check in Step 3; the same `tr -d '\r'` and count rules apply to that
loop.

## Step 2: when it failed, find the reason where it actually is

- **Stack events.** `aws cloudformation describe-stack-events --stack-name <stack>` and take the
  FIRST `*_FAILED` row of the update, not the last; later rows are the rollback.
  `ResourceStatusReason` names the resource and usually the denied action.
- **Failures that leave NO stack events,** so `LastUpdatedTime` never moves and events show only the
  last good deploy:
  - packaging, before CloudFormation: `Unable to upload artifact ./dist/<fn> referenced by CodeUri`
    means a new function is missing from the repo's build roster (`build-lambdas.js` and friends).
    Unit suites cannot see it; a build-parity test can.
  - the inline template cliff: `aws cloudformation deploy` sends the template inline and refuses a
    body over 51,200 bytes CLIENT side. The packaged size is what counts, not the commented file on
    disk. The fix is `--s3-bucket` on the deploy invocation.
  - `AWS::EarlyValidation::PropertyValidation`: fails at change-set creation and names nothing; the
    evidence is the change set's `Changes` and the property values you changed (for example a Lambda
    `Description` over 256 characters hiding in a folded YAML scalar).
- **A deploy-role refusal** (`GitHubActions-Deploy ... is not authorized to perform: <action>`): the
  role's grants are code, in `vivreal-hq/packages/fleet-ops/deploy-role/cloudformation/deploy-role-permissions.yaml`,
  and several are scoped by RESOURCE NAME PREFIX, so a new queue or schedule named off convention is
  refused even when the action is granted (`vivreal-*` / `VR-*` queues; the CMS stack's schedules
  under `VR-CMS-API-*`, Sid `CmsStackSchedules`). `npm run measure:deploy-role --workspace packages/fleet-ops`
  diffs the live role against that template, read-only. The tooling stops before the write on
  purpose; a grant is an edit to that file and a supervised deploy, owned by the `infra-engineer`
  agent, never a console change or a raw `aws iam` write.

## Step 3: prove the code that is serving

- **Health SHA.** Secure, CMS, Client, Main, Outreach and the MCP server answer `/health` with the
  deployed commit in `release`. Compare it with `git ls-remote origin <line>`; read it more than
  once, since an edge can serve a previous answer. The portal's equivalent is `/app/release.json`.
- **Aliases decide what "the function" means.** Read `AutoPublishAlias` and `DeploymentPreference`
  in the repo's template rather than remembering. Where the gateway invokes a `live` alias, check the
  ALIAS's `CodeSha256` (`aws lambda get-alias --function-name <fn> --name live`); a deploy that
  publishes a version but does not move the alias serves stale code while `$LATEST` looks current. A
  function with no alias serves `$LATEST`. A CodeDeploy canary (`DeploymentPreference` enabled)
  moves the alias minutes AFTER the stack update completes, so read it after the canary window.
- **The artifact.** `aws lambda get-function --function-name <fn>[:live] --query Code.Location`
  returns a presigned URL; download and unzip it. Read `node_modules/<pkg>/package.json` for a pinned
  package, and grep the bundle for a string that exists only after the change. Bundlers inline JSON
  and rename files, so grep the value, not a filename, and count occurrences so a vendored copy does
  not read as a hit. Pair every marker with a control string, or you may be reading the wrong zip.

## Step 4: then prove the behaviour

Stack state and artifact prove the code arrived. They do not prove it works. For anything with a
runtime effect, read the log streams for the event the change produces (see `vivreal-lambda-logs`),
or exercise it, and say which of the two you did.

## Release-train traps that look like deploy failures

- **`promote.yml` moves `stable` before `lambda_api.yml` runs**, so for the length of a deploy, and
  for good if it fails, the line names a version production is not running. Always check the stack.
- **A force-push that REWINDS `stable` fires no push run.** A rollback must also dispatch
  `gh workflow run lambda_api.yml --ref stable`. The portal's Amplify autobuild likewise ignores an
  already-built commit and needs `aws amplify start-job ... --job-type RELEASE`.
- **A rejected `workflow_dispatch` leaves the previous run newest**, so watch a run identified by
  head SHA or creation time, never the first row of `gh run list`.
- **A release-line-only commit regresses on the next promote** unless it is also on `main`. Compare
  the lines by content before every promote.
- **The Monday promote crons re-ship whatever is on the line.** A line that failed to deploy fails
  again on Monday until it is fixed.
- **A service string limit fails only at deploy time.** CloudWatch caps `AlarmDescription` at 1024
  characters, `AlarmName` at 255 and a composite `AlarmRule` at 10240. Tests, lint, review and the
  change-set preview all pass an over-long value; the real update fails on that resource and rolls
  the whole stack back (Secure v2.22.2, 2026-10-20). Measure any alarm string a change adds, keep a
  repo test that parses every template for these limits, and on a failed deploy read the FIRST
  `*_FAILED` stack event.
- **Proving an IAM change: the first real call is the proof.** `aws iam simulate-principal-policy` on
  the role, for the granted actions (`allowed`) AND a control you did not grant (`implicitDeny`), is
  a pre-check only: it evaluates the resource ARN and context keys you supply, so it agrees with a
  policy written against the wrong resource or conditioned on a key the real request never carries.
  Both happened in v7 (Amplify `ListJobs` on 2026-10-17, the ECR Public bearer token on
  2026-10-20; details in `vivreal-iam-secrets`). Then make the first real call the grant exists for
  and read its result.

## Related

`vivreal-deploy-tracker` (customer site deploys), `vivreal-lambda` (packaging and limits),
`vivreal-iam-secrets` (policies and secrets), `vivreal-lambda-logs` (reading what ran), and the
`infra-engineer` agent for making a change and shipping it.
