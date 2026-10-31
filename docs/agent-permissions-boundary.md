# AWS permissions boundary for agent roles (design only)

Status: DESIGN ONLY, for the November 2026 release (plan item K3, backlog T3, owner decision Q7:
"design only this release, build next release after the owners choose the role split"). Nothing in
this document has been built. No IAM policy, role, user, profile or setting was changed to write it.

## 1. Why

Every guard this marketplace ships against an AWS secret leak is a text check on a command line.
`vivreal-infra/hooks/lambda-env-guard.cjs` refuses an unprojected Lambda read, and its own header
says it "is not a security boundary: a determined caller can reach the same data some other way, and
the boundary for that is AWS permissions". This note designs that boundary.

What the agents run as today, read with `aws sts get-caller-identity` and
`aws iam list-attached-user-policies` (policy names only) on 2026-10-31:

- Agents call the AWS CLI with the **human operator's own IAM user**, through whatever credentials
  the CLI resolves on that machine. The account has two IAM users, and the one read carries
  `AdministratorAccess`. Long-lived access keys, no session limit, no separation between what the
  person may do and what an agent acting for them may do.
- The production account is the **management account of its AWS Organization** (all features on).
  This matters for option C below: service control policies never apply to a management account.
- An IAM Identity Center instance exists in the organization.

What an agent has actually done with that access, the reason the hook exists: on 2026-10-02 an agent
ran `aws lambda get-function` unprojected and printed five production credentials into a transcript,
although its brief carried the rule verbatim. A text rule failed, then a blocklist hook failed review
twice, and the allowlist hook is the current net. Each rung stops accidents; none stops a read the
identity is allowed to make.

## 2. What a boundary must hold

Reads that return secret VALUES, which no agent needs to see:

| Read | Why it leaks |
|---|---|
| `lambda:GetFunctionConfiguration`, `lambda:GetFunction`, `lambda:ListFunctions`, `lambda:ListVersionsByFunction` | each returns `Environment.Variables` in full (database URL with credentials, payment keys, encryption keys) |
| `cloudformation` Cloud Control `GetResource` / `ListResources` on `AWS::Lambda::Function` | returns the same environment inside `Properties` |
| `secretsmanager:GetSecretValue` | the secret itself. One sanctioned exception: `vivreal/prod/atlas-ops-read`, read in process by `atlas-read.js` and never printed |
| `ssm:GetParameter*` with decryption | SecureString values |
| `amplify:GetApp`, `amplify:GetBranch`, `amplify:ListApps`, `amplify:ListBranches` | app and branch environment variables, and basic-auth credentials |
| `iam:*` writes, `sts:AssumeRole` into other roles | the way out of any boundary |

Reads the agents DO need, and that the boundary must keep: CloudWatch metrics and Logs Insights,
CloudFormation stack state and templates, Step Functions execution history, API Gateway and IAM
policy reads (names and documents, not secrets), `lambda:GetFunctionConcurrency`, `lambda:GetAlias`,
`lambda:ListAliases`, `lambda:GetPolicy`, Secrets Manager `ListSecrets` / `DescribeSecret` (names
only), Amplify job history, S3 object metadata, and the one Atlas read-only secret above.

Writes: `vivreal-ops` and every investigator need none. The `infra-engineer` agent and the
release engineer do, and they are exactly the agents where a boundary matters most, because their
writes include IAM and CloudFormation.

## 3. Options

### A. One agent role with a permissions boundary, assumed through a named profile

Create a role (for example `vivreal-agent-readonly`) whose trust policy lets each human IAM user
assume it, give it a broad read policy, and attach a **permissions boundary** that caps it: allow the
read services in section 2, explicitly deny the secret-returning reads and every IAM or STS escape.
Agents run with `AWS_PROFILE` set to a profile that assumes the role (`role_arn` plus
`source_profile` in the CLI config), set in the agent session's environment, not in each brief.

- Holds: an agent cannot print a Lambda environment, a secret, a parameter or an Amplify env, even
  with a command the hook does not understand, because the API refuses it.
- Costs: agents lose `GetFunctionConfiguration` entirely, so "what timeout or memory is deployed"
  comes from the CloudFormation template and `describe-stack-resources` instead, plus CloudWatch.
  That is a real loss for `vivreal-ops`, and the reason option E exists.
- Gap: the human's admin keys are still on the same machine. An agent that passes `--profile` with
  the human's profile name, or unsets `AWS_PROFILE`, gets admin back. The hook can refuse a
  `--profile` naming any profile but the agent's, which turns that into the same "stops accidents"
  guarantee as today, not a boundary. Closing it needs option D.
- Effort: small. One role, one boundary policy, one managed read policy, a CLI profile per machine.

### B. Several agent roles, one shared boundary (the role split)

Option A, with one role per kind of agent work, all capped by the same boundary:

| Role | Who | Adds to the read set |
|---|---|---|
| read-only investigator | `vivreal-ops`, researcher, reviewer, the QA and content agents | nothing |
| release | release engineer, deploy proof | `lambda:UpdateAlias`, CloudFormation change-set execute on named stacks, Amplify `StartJob` |
| infra | `infra-engineer` | CloudFormation create and update on named stacks, `iam:PassRole` for named roles only; never `iam:Create*` without the boundary condition below |

The boundary also carries the anti-escalation pair: deny `iam:CreateRole` and `iam:PutRolePolicy`
unless `iam:PermissionsBoundary` equals this boundary's ARN, and deny
`iam:DeleteRolePermissionsBoundary` and `iam:PutRolePermissionsBoundary` outright, so no role can
create a role with more than it has.

- Holds: everything A holds, plus least privilege per kind of task.
- Costs: someone must pick the role per dispatch, and the dispatch template must name it. A wrong
  pick fails with AccessDenied, which is loud, so it fails safe.
- Effort: medium. Three roles, and every write grant scoped to named stacks and roles.

### C. A service control policy

An SCP on the account denying the secret reads to every principal whose ARN matches the agent roles.

- Does not apply here: the production account is the organization's management account, and SCPs
  never affect the management account. It would need the workloads moved to a member account, a
  migration far larger than this item.

### D. IAM Identity Center permission sets instead of IAM users

Humans sign in through Identity Center (`aws sso login`) and get short-lived credentials per
permission set. An "agent" permission set carries the boundary of A or B (a permission set can
reference a customer managed policy as its permissions boundary). The admin permission set needs a
separate sign-in.

- Holds: no long-lived keys on disk, so an agent cannot reach admin credentials that are not there.
  This is the only option that closes A's `--profile` gap.
- Costs: every person changes how they authenticate, every machine's CLI config changes, and the
  scripts that assume a profile (for example the separate account behind `--profile` in the deploy
  tracker) need checking. Session expiry interrupts long agent runs unless the session length is
  raised.
- Effort: large, and it is the change Q7 named as the reason to design first.

### E. Encrypt Lambda environments with a customer managed KMS key the agents cannot use

Each function's `KmsKeyArn` names a key whose policy grants `kms:Decrypt` to the function's
execution role and the deploy role only. Lambda decrypts environment variables for the function at
run time; a caller without `kms:Decrypt` on that key is expected to receive the configuration with
the environment replaced by an error, so `GetFunctionConfiguration` stays usable for timeout,
memory and runtime.

- Holds: protects the data, not the call, so it covers every reader: the CLI, Cloud Control, the
  console, an SDK script, any future API that returns a function configuration.
- Not yet proven: the "configuration without the values" behaviour must be shown by ONE real call
  against one function before anything relies on it (an IAM simulation is not proof of a grant or a
  denial in this account; it has been wrong here twice).
- Costs: one template change per function stack, a key policy to own, KMS request charges per cold
  start, and a deploy role that must keep `kms:Decrypt` or deploys break.
- Effort: medium, spread across every backend repository.

### F. Keep the hook only

- Holds: accidental reads with command shapes the hook knows, nothing more.
- Costs: nothing new. It is today.

## 4. Recommendation

1. **Build B with two roles first**, read-only and infra, and let release work use infra until a
   third role earns its place. Two roles is the smallest split that keeps `infra-engineer`'s IAM
   and CloudFormation writes away from every other agent. The boundary carries the section 2 denies
   and the anti-escalation pair, with the `atlas-ops-read` secret as its one allowed
   `GetSecretValue`.
2. **Prove E on one function in the same release**, with one real call as the proof. If it holds,
   roll it out per repository and give the read-only role `GetFunctionConfiguration` back; if not,
   the read-only role reads deployed config from CloudFormation and CloudWatch.
3. **Keep the env guard hook.** It still stops the accident before the API is asked, and it is what
   protects a session that forgot to set the profile. Teach it to refuse `--profile` naming
   anything but the agent profiles once those exist.
4. **Plan D for the release after**, once the role split has run for a release without surprises.
   It is the step that removes admin keys from the machines agents run on.
5. **Not C.** It cannot apply to the account the workloads live in.

## 5. Decisions the owners need to make before the build

- The role split: two roles (recommended), three, or one.
- Whether the human admin keys stay on machines where agents run until D, accepting that the
  `--profile` gap is only an accident net in that time.
- Whether to spend the per-repository work on E.
- Who owns the boundary policy and its review (it should live in a template, not the console, and
  be read by `infra-engineer`'s deploy-role checks).

## 6. Build notes for next release (not done here)

- The boundary and roles go in a CloudFormation template reviewed like any other IAM change, with a
  REFUSE test per deny (one real call each, as the agent role) and an ALLOW test per kept read.
- Every agent brief that runs AWS commands names its profile, and `vivreal-workflow:shared-standards`
  gains the rule. The hook's header and `vivreal-infra/hooks/hooks.json` description then point at
  the built boundary instead of "a planned follow-up".
- Nothing in the boundary names an account id, user name or machine path; it uses
  `${AWS::AccountId}` and role names, so the same template works for any operator.
