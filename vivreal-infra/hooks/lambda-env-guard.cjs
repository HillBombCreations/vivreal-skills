#!/usr/bin/env node
'use strict';

/**
 * Refuse any AWS CLI call that would print a Lambda function's environment.
 *
 * Moved from vivreal-hq 2026-10 so it fires in every repo where releases run.
 *
 * WHY THIS EXISTS, and why it is a hook rather than a rule.
 *
 * A Lambda `FunctionConfiguration` carries `Environment.Variables` in full. Any
 * call that returns one, without a `--query` projection that excludes it, prints
 * every secret that function holds. In this estate that is routinely
 * `CLUSTER_URL` with Mongo credentials, `STRIPE_SECRET_KEY`, `ENCRYPTION_KEY`
 * and a GitHub App RSA private key.
 *
 * THE ESCALATION LADDER, AND WHY THE FIRST TWO RUNGS FAILED.
 *
 *   1. A warning written in `docs/projects/pricing-and-tenancy/rotation-list.md`.
 *      Failed: nobody reads it at the moment a command is typed.
 *   2. The rule in every agent brief, as a named section, in these words:
 *      "the ONLY permitted query shape is --query 'keys(Environment.Variables)'".
 *      Failed, MEASURED, 2026-10-02. The brief carried it verbatim and an agent
 *      ran `aws lambda get-function` unprojected anyway, printing five
 *      credentials. That agent was careful everywhere else: it red proofed three
 *      assertions, verified an ECR tag resolved before pinning it, and paired its
 *      zero failure count with a control returning 80 real failures. It also
 *      self reported the leak, unprompted.
 *
 * So this is not a carelessness problem and a rule aimed at carelessness will
 * not catch it. The leaking shape is one flag away from the safe one and it is
 * the obvious thing to type when you want to see a function's configuration.
 *
 *   3. This hook. An instruction competes with everything else in context at the
 *      moment of use. A refusal does not.
 *
 * WHAT IS DELIBERATELY NOT BLOCKED. `secretsmanager get-secret-value` is left
 * alone on purpose. This estate's established pattern for a production database
 * write reads `CLUSTER_URL` into a Node process through it and never echoes it,
 * and blocking it would break that while catching a shape that has not actually
 * leaked. Worth revisiting, not worth guessing at now.
 *
 * SELF TEST: `node vivreal-infra/hooks/lambda-env-guard.cjs --self-test`
 * Follows the convention fleet-ops already uses for its own guards, so the hook
 * can be proved to refuse and to permit without waiting for a real call.
 */

/** AWS CLI lambda subcommands whose response includes a FunctionConfiguration. */
const CONFIG_RETURNING = [
  'get-function',
  'get-function-configuration',
  'list-functions',
  'list-versions-by-function',
  'update-function-configuration',
  'update-function-code',
  'create-function',
  'publish-version',
];

/**
 * Split a shell line into the separate commands it runs. A projection on one
 * command says nothing about the next, so each is judged on its own.
 */
function segments(command) {
  return String(command)
    .split(/\n|&&|\|\||[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** The value of `--query` in a segment, or null when it carries none. */
function queryValue(segment) {
  const m = /--query[\s=]+('([^']*)'|"([^"]*)"|(\S+))/.exec(segment);
  if (!m) return null;
  return m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4];
}

/**
 * The first container a JMESPath query selects whole, or null. `@`, `Configuration`,
 * `Functions` and `Versions` each hold one or more FunctionConfigurations; selected with no
 * `.field` after them (an index, `[]`, `[*]` or a `[?filter]` keeps whole elements) they print
 * the environment. A container inside `keys(...)` yields names only and is left alone.
 */
function wholeContainer(query) {
  // A filter keeps whole elements, so it is judged as `[]`. Its body can name `@` and fields
  // that are never output, so it is removed before the scan.
  const q = query.replace(/\[\?[^\]]*\]/g, '[]');
  const re = /(@|\bConfiguration\b|\bFunctions\b|\bVersions\b)((?:\[[^\]]*\])*)/g;
  let m;
  while ((m = re.exec(q)) !== null) {
    if (/keys\s*\(\s*$/.test(q.slice(0, m.index))) continue;
    const next = q.slice(m.index + m[0].length).trimStart()[0];
    if (next === '.') continue;
    return m[1] + m[2];
  }
  return null;
}

/**
 * Why this segment must be refused, or null when it is fine.
 *
 * A projection is safe when it reaches `Environment` only through
 * `keys(Environment.Variables)`, which returns names and no values, and never selects a
 * whole FunctionConfiguration container (see wholeContainer).
 */
function refusalFor(segment) {
  // aws, aws.exe or aws.cmd, bare or at the end of a path, in either case: PowerShell runs
  // `aws.exe` and `& '.../AWSCLIV2/aws.exe'`, which `(^|\s)aws(\s|$)` did not match.
  if (!/(^|[\s\\/&"'(])aws(\.exe|\.cmd)?(?=[\s"']|$)/i.test(segment)) return null;
  if (!/\blambda\b/i.test(segment)) return null;

  // The trailing guard is a negative lookahead and NOT \b, because a hyphen is
  // itself a word boundary: /\bget-function\b/ matches inside
  // "get-function-concurrency", which returns no Environment and was being
  // refused. The self-test caught that, which is the whole reason it exists.
  const sub = CONFIG_RETURNING.find((s) =>
    new RegExp('\\b' + s + '(?![-\\w])').test(segment),
  );
  if (!sub) return null;

  const query = queryValue(segment);
  if (query === null) {
    return (
      'aws lambda ' + sub + ' with no --query projection returns the function\'s full ' +
      'Environment.Variables, which prints every secret it holds.'
    );
  }

  // keys(Environment.Variables) returns names only. Strip each exact use and judge what is
  // left: a keys() anywhere used to excuse the whole query, so a values read beside it passed.
  const rest = query.replace(/keys\s*\(\s*Environment\.Variables\s*\)/g, '');
  if (/\bEnvironment\b/.test(rest)) {
    return (
      'this --query reaches into Environment other than through keys(Environment.Variables). ' +
      'Narrowing to the variables OBJECT selects the container and prints everything inside it, ' +
      'which is how CLUSTER_URL leaked on 2026-09-30 and again on 2026-10-02.'
    );
  }

  const whole = wholeContainer(rest);
  if (whole) {
    return (
      'this --query selects "' + whole + '" whole, and a whole FunctionConfiguration carries ' +
      'Environment.Variables without the query ever naming it. Project named fields from it instead.'
    );
  }

  return null;
}

const GUIDANCE = [
  '',
  'Permitted shapes:',
  "  --query 'keys(Environment.Variables)'        names only, no values",
  "  --query '[FunctionName,Runtime,State]'       named fields, never a whole object",
  "  --query 'Configuration.[Runtime,State]'      for get-function",
  "  --query 'Functions[].[FunctionName,Runtime]' for list-functions",
  '',
  'Refused even when the query never names Environment: @, Configuration, Functions[0],',
  'Versions[] or any other selection of a whole FunctionConfiguration, which prints it.',
  '',
  'If you genuinely need a variable\'s value, read it in a process and never echo it.',
  'The only safe existence probe for a variable is ${VAR:+set} ALONE, with no :- default:',
  'the second expansion of a compound probe prints the value.',
].join('\n');

function decide(toolName, command) {
  if (toolName !== 'Bash' && toolName !== 'PowerShell') return null;
  for (const seg of segments(command)) {
    const why = refusalFor(seg);
    if (why) return why;
  }
  return null;
}

/* ------------------------------------------------------------------ */

const CASES = [
  // The two shapes that actually leaked, both must be refused.
  ['block', 'aws lambda get-function --function-name vh-site-deployment-siteThumbnail'],
  ['block', 'aws lambda list-functions --output json'],
  // The documented near miss: narrowing to the object still prints it.
  ['block', "aws lambda get-function-configuration --function-name f --query '{Env:Environment.Variables}'"],
  ['block', "aws lambda get-function-configuration --function-name f --query 'Environment.Variables'"],
  ['block', 'aws lambda get-function-configuration --function-name f'],
  // Hidden behind a prefix and a chain, still refused.
  ['block', 'MSYS_NO_PATHCONV=1 aws lambda get-function --function-name f'],
  ['block', "aws sts get-caller-identity && aws lambda list-functions --output json"],
  ['block', "aws lambda list-functions --query 'Functions[].Environment.Variables'"],
  // Writes that echo the config back are the same exposure.
  ['block', 'aws lambda update-function-configuration --function-name f --timeout 30'],
  // A projection that selects a whole container prints Environment without naming it
  // (PR #60 review H1, each probed through the real hook and passed before this fix).
  ['block', 'aws lambda get-function --function-name f --query Configuration'],
  ['block', 'aws lambda list-functions --query "Functions[0]"'],
  ['block', 'aws lambda get-function-configuration --function-name f --query @'],
  ['block', "aws lambda get-function --function-name f --query '{c: Configuration}'"],
  ['block', "aws lambda list-versions-by-function --function-name f --query 'Versions[?Version==`1`]'"],
  // keys() anywhere used to excuse the whole query, so a values read rode beside it.
  ['block', 'aws lambda get-function-configuration --function-name f --query "[keys(Environment.Variables), Environment.Variables]"'],
  // The PowerShell spellings: aws.exe, by bare name or by full path.
  ['block', 'aws.exe lambda get-function-configuration --function-name f'],
  ['block', "& 'C:/Program Files/Amazon/AWSCLIV2/aws.exe' lambda get-function --function-name f"],
  ['block', 'AWS.EXE lambda list-functions'],

  // The sanctioned shapes must be permitted, or the hook is useless.
  ['allow', "aws lambda get-function-configuration --function-name f --query 'keys(Environment.Variables)'"],
  ['allow', "aws lambda get-function-configuration --function-name f --query '[Runtime,State,LastUpdateStatus]' --output text"],
  ['allow', "aws lambda list-functions --query 'Functions[].[FunctionName,Runtime]' --output text"],
  ['allow', "aws lambda get-function-configuration --function-name f --query 'keys( Environment.Variables )'"],
  // A container followed by a field or a multiselect is a projection, not the container.
  ['allow', "aws lambda get-function --function-name f --query 'Configuration.[Runtime,State]' --output text"],
  ['allow', "aws lambda list-functions --query 'Functions[0].FunctionName'"],
  ['allow', "aws lambda list-functions --query 'Functions[?Runtime==`nodejs20.x`].FunctionName'"],
  ['allow', "aws lambda get-function-configuration --function-name f --query 'keys(@)'"],
  ['allow', 'aws.exe lambda get-alias --function-name f --name live'],
  // Unrelated calls must pass untouched.
  ['allow', 'aws cloudformation describe-stacks --stack-name VR-Main-API'],
  ['allow', 'aws lambda get-alias --function-name f --name live'],
  ['allow', 'aws lambda get-function-concurrency --function-name f'],
  ['allow', 'git status --porcelain'],
  ['allow', 'npm test'],
];

function selfTest() {
  let failed = 0;
  for (const [expected, command] of CASES) {
    const why = decide('Bash', command);
    const actual = why ? 'block' : 'allow';
    if (actual !== expected) {
      failed += 1;
      console.error('FAIL expected ' + expected + ' got ' + actual + ': ' + command);
    }
  }
  // A control on the harness: the suite must contain both verdicts, or a
  // matcher that said "allow" to everything would pass a one sided set.
  const blocks = CASES.filter((c) => c[0] === 'block').length;
  const allows = CASES.filter((c) => c[0] === 'allow').length;
  if (blocks < 5 || allows < 5) {
    failed += 1;
    console.error('FAIL the case set is one sided: ' + blocks + ' block, ' + allows + ' allow');
  }
  // And a control on the tool gate: the same leaking command must be permitted
  // for a tool this hook does not police, so the gate is proved to be reading
  // the tool name rather than ignoring it.
  if (decide('Read', 'aws lambda list-functions --output json') !== null) {
    failed += 1;
    console.error('FAIL the tool-name gate is not being applied');
  }
  if (failed) {
    console.error('\n' + failed + ' self-test failure(s).');
    process.exit(1);
  }
  console.log('self-test OK: ' + blocks + ' refused, ' + allows + ' permitted, controls pass.');
  process.exit(0);
}

if (process.argv.includes('--self-test')) selfTest();

let raw = '';
process.stdin.on('data', (c) => {
  raw += c;
});
process.stdin.on('end', () => {
  let payload;
  try {
    payload = JSON.parse(raw || '{}');
  } catch {
    // Never fail a tool call because this hook could not parse its own input.
    process.exit(0);
  }
  const why = decide(payload.tool_name, (payload.tool_input || {}).command || '');
  if (!why) process.exit(0);
  console.error('REFUSED by vivreal-infra lambda-env-guard:' + why + '\n' + GUIDANCE);
  process.exit(2);
});
