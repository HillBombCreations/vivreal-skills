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
 * Why this segment must be refused, or null when it is fine.
 *
 * A projection is safe when it does not reach into `Environment` at all, or
 * when it reaches it only through `keys(`, which returns names and no values.
 */
function refusalFor(segment) {
  if (!/(^|\s)aws(\s|$)/.test(segment)) return null;
  if (!/\blambda\b/.test(segment)) return null;

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

  if (/\bEnvironment\b/.test(query) && !/keys\s*\(\s*Environment/.test(query)) {
    return (
      'this --query reaches into Environment without keys(). Narrowing to the variables ' +
      'OBJECT selects the container and prints everything inside it, which is how ' +
      'CLUSTER_URL leaked on 2026-09-30 and again on 2026-10-02.'
    );
  }

  return null;
}

const GUIDANCE = [
  '',
  'Permitted shapes:',
  "  --query 'keys(Environment.Variables)'        names only, no values",
  "  --query '[FunctionName,Runtime,State]'       anything that never names Environment",
  "  --query 'Functions[].[FunctionName,Runtime]' for list-functions",
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

  // The sanctioned shapes must be permitted, or the hook is useless.
  ['allow', "aws lambda get-function-configuration --function-name f --query 'keys(Environment.Variables)'"],
  ['allow', "aws lambda get-function-configuration --function-name f --query '[Runtime,State,LastUpdateStatus]' --output text"],
  ['allow', "aws lambda list-functions --query 'Functions[].[FunctionName,Runtime]' --output text"],
  ['allow', "aws lambda get-function-configuration --function-name f --query 'keys( Environment.Variables )'"],
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
  console.error('REFUSED by block-unprojected-lambda-reads: ' + why + '\n' + GUIDANCE);
  process.exit(2);
});
