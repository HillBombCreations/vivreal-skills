#!/usr/bin/env node
'use strict';

/**
 * Refuse any AWS CLI call that could print a Lambda function's environment.
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
 * THE ESCALATION LADDER, AND WHY THE EARLIER RUNGS FAILED.
 *
 *   1. A warning written in `docs/projects/pricing-and-tenancy/rotation-list.md`.
 *      Failed: nobody reads it at the moment a command is typed.
 *   2. The rule in every agent brief, as a named section. Failed, MEASURED,
 *      2026-10-02: the brief carried it verbatim and an agent ran
 *      `aws lambda get-function` unprojected anyway, printing five credentials.
 *   3. A hook that refused known bad `--query` shapes (a blocklist). Failed
 *      review twice on PR #60: each pass closed some shapes and the next found
 *      more (`Configuration`, `@`, `*`, `Configuration.*`, a JSON escaped
 *      `"Environ\u006dent"`, a second `--query` overriding the first). JMESPath
 *      has too many ways to say "everything" for a list of them to stay closed.
 *   4. This hook, an ALLOWLIST. A query is permitted only when it parses under a
 *      small grammar AND every value it selects is provably a field of a
 *      FunctionConfiguration other than Environment, or lies outside one. Any
 *      shape this file does not understand is refused, so a new JMESPath trick
 *      fails closed instead of open.
 *
 * THE GRAMMAR (whitespace allowed between tokens):
 *
 *   query  := keyset | path ( '.' select )? | select
 *   path   := name index* ( '.' name index* )*
 *   index  := '[' digits? ']'
 *   select := '{' name ':' leaf ( ',' name ':' leaf )* '}'
 *           | '[' leaf ( ',' leaf )* ']'
 *   leaf   := keyset | name ( '.' name )*
 *   keyset := 'keys' '(' name ( '.' name )* ')'   ONLY of <function>.Environment.Variables
 *   name   := [A-Za-z_][A-Za-z0-9_]*               never 'Environment' in any case
 *
 * No `*`, `@`, backslash, quote, backtick, filter, pipe, slice or function call
 * other than that one `keys(...)`. `keys(Environment.Variables)` is kept because it
 * returns names with no values and is the probe every agent brief in this repo
 * prints; it is matched as a whole term, so the word Environment is never a path
 * segment anywhere else.
 *
 * Beyond the grammar, the command line must carry exactly one `--query` (argparse
 * keeps the last, so a second overrides a safe first), no `--debug` (it logs the raw
 * response body), an `--output` from the known filtered set, and no shell or
 * PowerShell expansion that could add arguments the hook cannot see (`$VAR`
 * unquoted, `$(...)`, backticks, `@splat`). A quoted `"$var"` as a flag value is
 * one argument and is allowed.
 *
 * WHAT IS DELIBERATELY NOT BLOCKED. `secretsmanager get-secret-value` is left
 * alone on purpose. This estate's established pattern for a production database
 * write reads `CLUSTER_URL` into a Node process through it and never echoes it.
 *
 * SELF TEST: `node vivreal-infra/hooks/lambda-env-guard.cjs --self-test`
 */

/**
 * AWS CLI lambda subcommands whose response includes a FunctionConfiguration, each
 * mapped to the path from the response root down to one. `[]` is a list level.
 * `get-function-url-config` is absent on purpose: its response (FunctionUrl, AuthType,
 * Cors, InvokeMode, timestamps) carries no Environment.
 */
const CONFIG_PREFIX = {
  'get-function-configuration': [],
  'update-function-configuration': [],
  'update-function-code': [],
  'create-function': [],
  'publish-version': [],
  'get-function': ['Configuration'],
  'list-functions': ['Functions', '[]'],
  'list-versions-by-function': ['Versions', '[]'],
};

/** Every `--output` value the CLI filters through `--query`. */
const FILTERED_OUTPUTS = new Set(['json', 'text', 'table', 'yaml', 'yaml-stream']);

/**
 * Split a shell line into the separate commands it runs. A projection on one
 * command says nothing about the next, so each is judged on its own. Line
 * continuations (bash `\`, PowerShell backtick) are joined first, or a query on the
 * continued line would be judged apart from its command.
 */
function segments(command) {
  return String(command)
    .replace(/[\\`]\r?\n/g, ' ')
    .split(/\n|&&|\|\||[;|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Shell-style words of a segment, each as { raw, value }. `value` drops the quote
 * characters; `raw` keeps them so a value assembled from several quoted pieces can
 * be told apart from a single quoted one.
 */
function words(segment) {
  const out = [];
  let i = 0;
  while (i < segment.length) {
    while (i < segment.length && /\s/.test(segment[i])) i += 1;
    if (i >= segment.length) break;
    let raw = '';
    let value = '';
    while (i < segment.length && !/\s/.test(segment[i])) {
      const c = segment[i];
      if (c === '"' || c === "'") {
        const end = segment.indexOf(c, i + 1);
        const stop = end === -1 ? segment.length : end + 1;
        raw += segment.slice(i, stop);
        value += segment.slice(i + 1, end === -1 ? segment.length : end);
        i = stop;
      } else {
        raw += c;
        value += c;
        i += 1;
      }
    }
    out.push({ raw, value });
  }
  return out;
}

const AWS_BINARY = /^aws(\.exe|\.cmd)?$/i;

/** The lambda subcommand this segment runs through the AWS CLI, or null. */
function configSubcommand(ws) {
  const isAws = ws.some((w, k) => {
    const base = w.value.split(/[\\/]/).pop();
    return AWS_BINARY.test(base) || (w.value === '-m' && /^awscli$/i.test((ws[k + 1] || {}).value || ''));
  });
  if (!isAws) return null;
  if (!ws.some((w) => w.value.toLowerCase() === 'lambda')) return null;
  const hit = ws.find((w) => Object.prototype.hasOwnProperty.call(CONFIG_PREFIX, w.value.toLowerCase()));
  return hit ? hit.value.toLowerCase() : null;
}

// argparse accepts an unambiguous prefix of a long option, so `--quer` is `--query`.
// `--qu` is ambiguous with `--qualifier` and argparse rejects it.
const QUERY_FLAG = /^--que(r(y)?)?(=|$)/;
const DEBUG_FLAG = /^--deb(u(g)?)?(=|$)/;
const OUTPUT_FLAG = /^--out(p(u(t)?)?)?(=|$)/;
const SAFE_VAR = /^"\$(\{[A-Za-z_][A-Za-z0-9_]*\}|[A-Za-z_][A-Za-z0-9_]*)"$/;

/* ---------------------------- query grammar ---------------------------- */

class Refusal extends Error {}

function lex(query) {
  const toks = [];
  let i = 0;
  while (i < query.length) {
    const c = query[i];
    if (/\s/.test(c)) {
      i += 1;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(query.slice(i));
      toks.push({ t: 'name', v: m[0] });
      i += m[0].length;
    } else if (/[0-9]/.test(c)) {
      const m = /^[0-9]+/.exec(query.slice(i));
      toks.push({ t: 'num', v: m[0] });
      i += m[0].length;
    } else if ('.[]{},:()'.includes(c)) {
      toks.push({ t: c });
      i += 1;
    } else {
      throw new Refusal('the --query contains "' + c + '", which is outside the permitted grammar');
    }
  }
  return toks;
}

/**
 * Where a selection stands relative to the FunctionConfiguration in the response:
 * { pos } while still on the way down the command's prefix (pos === prefix.length
 * means AT a whole FunctionConfiguration), or SAFE once it has selected a field of
 * one, or left the prefix for a sibling like `Code` or `NextMarker`.
 */
const SAFE = 'safe';

function checkName(name) {
  if (name.toLowerCase() === 'environment') {
    throw new Refusal('the --query names Environment, which holds every secret the function has');
  }
}

function stepName(state, prefix, name) {
  checkName(name);
  if (state === SAFE) return SAFE;
  const expected = prefix[state.pos];
  if (expected === undefined) return SAFE; // a field of the FunctionConfiguration
  if (expected === '[]') {
    throw new Refusal('the --query names "' + name + '" on a list of functions before indexing it');
  }
  return name === expected ? { pos: state.pos + 1 } : SAFE;
}

function stepIndex(state, prefix) {
  if (state === SAFE) return SAFE;
  return prefix[state.pos] === '[]' ? { pos: state.pos + 1 } : state;
}

function requireSafe(state, what) {
  if (state !== SAFE) {
    throw new Refusal(
      'the --query selects ' + what + ' whole, and a whole FunctionConfiguration (or a list of ' +
      'them) carries Environment.Variables without the query naming it',
    );
  }
}

function parseQuery(query, prefix) {
  const toks = lex(query);
  let k = 0;
  const peek = (o = 0) => toks[k + o] || { t: 'end' };
  const take = (t) => {
    if (peek().t !== t) throw new Refusal('the --query is not in the permitted grammar near token ' + (k + 1));
    k += 1;
    return toks[k - 1];
  };

  // keyset: keys(<path>) where <path> is the function's Environment.Variables, nothing else.
  function keyset(state) {
    take('name');
    take('(');
    const names = [take('name').v];
    while (peek().t === '.') {
      take('.');
      names.push(take('name').v);
    }
    take(')');
    let s = state;
    let n = 0;
    while (s !== SAFE && s.pos < prefix.length && n < names.length) {
      s = stepName(s, prefix, names[n]);
      n += 1;
    }
    const rest = names.slice(n);
    if (s === SAFE || s.pos !== prefix.length || rest.length !== 2 || rest[0] !== 'Environment' || rest[1] !== 'Variables') {
      throw new Refusal('keys() is permitted only as keys(Environment.Variables) on a function');
    }
  }

  const isKeyset = () => peek().t === 'name' && peek().v === 'keys' && peek(1).t === '(';

  function leaf(state) {
    if (isKeyset()) return keyset(state);
    let s = stepName(state, prefix, take('name').v);
    let label = toks[k - 1].v;
    while (peek().t === '.') {
      take('.');
      s = stepName(s, prefix, take('name').v);
      label += '.' + toks[k - 1].v;
    }
    requireSafe(s, '"' + label + '"');
    return undefined;
  }

  function select(state) {
    if (peek().t === '{') {
      take('{');
      do {
        if (peek().t === ',') take(',');
        checkName(take('name').v);
        take(':');
        leaf(state);
      } while (peek().t === ',');
      take('}');
    } else {
      take('[');
      do {
        if (peek().t === ',') take(',');
        leaf(state);
      } while (peek().t === ',');
      take(']');
    }
  }

  const index = (state) => {
    take('[');
    if (peek().t === 'num') take('num');
    take(']');
    return stepIndex(state, prefix);
  };

  const root = { pos: 0 };
  if (isKeyset()) {
    keyset(root);
  } else if (peek().t === '{' || (peek().t === '[' && peek(1).t === 'name')) {
    select(root);
  } else {
    let s = root;
    let label = '';
    while (peek().t === '[') {
      s = index(s);
      label += '[]';
    }
    for (;;) {
      s = stepName(s, prefix, take('name').v);
      label += (label ? '.' : '') + toks[k - 1].v;
      while (peek().t === '[') {
        s = index(s);
        label += '[]';
      }
      if (peek().t !== '.') break;
      take('.');
      if (peek().t === '{' || peek().t === '[') {
        select(s);
        s = SAFE;
        break;
      }
    }
    requireSafe(s, '"' + label + '"');
  }
  if (peek().t !== 'end') throw new Refusal('the --query continues past a complete selection');
}

/* ------------------------------ the decision ---------------------------- */

/** Why this segment must be refused, or null when it is fine. */
function refusalFor(segment) {
  const ws = words(segment);
  const sub = configSubcommand(ws);
  if (!sub) return null;

  const queries = [];
  for (let k = 0; k < ws.length; k += 1) {
    const w = ws[k];
    if (DEBUG_FLAG.test(w.value)) {
      return '--debug logs the raw response body, Environment.Variables included, whatever --query says.';
    }
    if (OUTPUT_FLAG.test(w.value)) {
      const eq = w.value.indexOf('=');
      const out = eq === -1 ? (ws[k + 1] || {}).value : w.value.slice(eq + 1);
      if (!FILTERED_OUTPUTS.has(String(out))) {
        return '--output "' + out + '" is not one of ' + [...FILTERED_OUTPUTS].join(', ') + '.';
      }
    }
    if (QUERY_FLAG.test(w.value)) {
      const eq = w.raw.indexOf('=');
      queries.push(eq === -1 ? ws[k + 1] && ws[k + 1].raw : w.raw.slice(eq + 1));
    }
    // Anything that expands into arguments the hook cannot see. A quoted "$var" is one word.
    if (/[$`]/.test(w.raw) || /^@\w/.test(w.raw)) {
      const prev = ws[k - 1];
      const isFlagValue = prev && /^--/.test(prev.value) && !QUERY_FLAG.test(prev.value);
      if (!(SAFE_VAR.test(w.raw) && isFlagValue)) {
        return (
          'the command carries an expansion (' + w.raw + ') that can add arguments this hook cannot ' +
          'see, a second --query among them. Quote it as a flag value ("$name") or spell the value out.'
        );
      }
    }
  }

  if (queries.length === 0) {
    return 'aws lambda ' + sub + ' with no --query returns the function\'s full Environment.Variables.';
  }
  if (queries.length > 1) {
    return 'more than one --query: the CLI keeps the last one, so a safe first query proves nothing.';
  }
  const raw = queries[0];
  if (raw === undefined) return '--query has no value.';
  const quoted = /^'([^']*)'$/.exec(raw) || /^"([^"]*)"$/.exec(raw);
  if (!quoted && /['"]/.test(raw)) {
    return 'the --query value is built from more than one quoted piece; write it as one quoted string.';
  }
  try {
    parseQuery(quoted ? quoted[1] : raw, CONFIG_PREFIX[sub]);
  } catch (e) {
    if (e instanceof Refusal) return e.message + '.';
    throw e;
  }
  return null;
}

const GUIDANCE = [
  '',
  'Permitted (an allowlist: plain names, dots, [N] or [] indexes, one {k: name} or [name, name] at the end):',
  "  --query 'keys(Environment.Variables)'                  names only, no values",
  "  --query '[FunctionName,Runtime,LastModified]'          get-function-configuration",
  "  --query 'LoggingConfig.LogGroup'                       one field",
  "  --query 'Configuration.{Name:FunctionName,Sha:CodeSha256}' or 'Code.Location'   get-function",
  "  --query 'Functions[].{Name:FunctionName,Runtime:Runtime}'                       list-functions",
  '',
  'Refused: no --query, two --query flags, --debug, *, @, quotes or backslashes inside the query,',
  'filters, pipes, any function but that keys(), Environment anywhere, or a selection that ends on',
  'a whole function (Configuration, Functions[0], Versions[]).',
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
  // The two shapes that actually leaked.
  ['block', 'aws lambda get-function --function-name vh-site-deployment-siteThumbnail'],
  ['block', 'aws lambda list-functions --output json'],
  // Narrowing to the variables object still prints it.
  ['block', "aws lambda get-function-configuration --function-name f --query '{Env:Environment.Variables}'"],
  ['block', "aws lambda get-function-configuration --function-name f --query 'Environment.Variables'"],
  ['block', 'aws lambda get-function-configuration --function-name f'],
  ['block', 'MSYS_NO_PATHCONV=1 aws lambda get-function --function-name f'],
  ['block', 'aws sts get-caller-identity && aws lambda list-functions --output json'],
  ['block', "aws lambda list-functions --query 'Functions[].Environment.Variables'"],
  ['block', 'aws lambda update-function-configuration --function-name f --timeout 30'],
  // PR #60 review pass 1.
  ['block', 'aws lambda get-function --function-name f --query Configuration'],
  ['block', 'aws lambda list-functions --query "Functions[0]"'],
  ['block', 'aws lambda get-function-configuration --function-name f --query @'],
  ['block', "aws lambda get-function --function-name f --query '{c: Configuration}'"],
  ['block', "aws lambda list-versions-by-function --function-name f --query 'Versions[?Version==`1`]'"],
  ['block', 'aws lambda get-function-configuration --function-name f --query "[keys(Environment.Variables), Environment.Variables]"'],
  ['block', 'aws.exe lambda get-function-configuration --function-name f'],
  ['block', "& 'C:/Program Files/Amazon/AWSCLIV2/aws.exe' lambda get-function --function-name f"],
  ['block', 'AWS.EXE lambda list-functions'],
  // PR #60 review pass 2: wildcards, a JSON escaped name, a second --query.
  ['block', "aws lambda get-function-configuration --function-name f --query '*'"],
  ['block', "aws lambda get-function --function-name f --query 'Configuration.*'"],
  ['block', "aws lambda list-functions --query 'Functions[].*'"],
  ['block', "aws lambda get-function-configuration --function-name f --query '\"Environ\\u006dent\".Variables'"],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName --query @'],
  // New with the allowlist, each a way round a blocklist.
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName --debug'],
  ['block', 'python -m awscli lambda get-function-configuration --function-name f'],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName $EXTRA'],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName @extra'],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName --quer @'],
  ['block', "aws lambda list-functions --query 'Functions[] | [0]'"],
  ['block', "aws lambda get-function-configuration --function-name f --query '{e: environment}'"],
  ['block', "aws lambda list-functions --query 'Functions[].{n: FunctionName, c: @}'"],
  ['block', "aws lambda get-function-configuration --function-name f --query 'FunctionName'\"\""],
  ['block', "aws lambda get-function --function-name f --query 'keys(Configuration)'"],

  // Every read the fleet's own prose prints, verbatim apart from placeholders.
  ['allow', "aws lambda get-function-configuration --function-name f --query 'keys(Environment.Variables)'"],
  ['allow', "aws lambda get-function-configuration --function-name f --query '{Timeout:Timeout,MemorySize:MemorySize,Runtime:Runtime,Architectures:Architectures,EnvKeys:keys(Environment.Variables)}'"],
  ['allow', "aws lambda get-function-configuration --query '{Timeout:Timeout,MemorySize:MemorySize,EnvKeys:keys(Environment.Variables)}'"],
  ['allow', "aws lambda list-functions --query 'Functions[].{FunctionName:FunctionName,Runtime:Runtime,LastModified:LastModified}'"],
  ['allow', "aws lambda get-function --function-name f --query 'Configuration.{FunctionName:FunctionName,CodeSha256:CodeSha256,LastModified:LastModified}'"],
  ['allow', 'aws lambda get-function-configuration --function-name "$f" \\\n      --query "[FunctionName,LastModified,CodeSha256,TracingConfig.Mode]" \\\n      --output text | tr -d \'\\r\''],
  ['allow', 'aws lambda get-function --function-name f:live --query Code.Location'],
  ['allow', 'aws lambda get-function-configuration --function-name f --query LoggingConfig.LogGroup'],
  // The sanctioned shapes in the guidance.
  ['allow', "aws lambda get-function-configuration --function-name f --query '[Runtime,State,LastUpdateStatus]' --output text"],
  ['allow', "aws lambda list-functions --query 'Functions[].[FunctionName,Runtime]' --output text"],
  ['allow', "aws lambda get-function-configuration --function-name f --query 'keys( Environment.Variables )'"],
  ['allow', "aws lambda get-function --function-name f --query 'Configuration.[Runtime,State]' --output text"],
  ['allow', "aws lambda list-functions --query 'Functions[0].FunctionName'"],
  ['allow', 'aws lambda get-function --function-name f --query=Configuration.CodeSha256'],
  ['allow', "aws lambda list-functions --query 'Functions[].{n: FunctionName, k: keys(Environment.Variables)}'"],
  ['allow', "& 'C:/Program Files/Amazon/AWSCLIV2/aws.exe' lambda get-function-configuration --function-name \"${fn}\" --query 'keys(Environment.Variables)'"],
  // Unrelated calls must pass untouched.
  ['allow', 'aws.exe lambda get-alias --function-name f --name live'],
  ['allow', 'aws cloudformation describe-stacks --stack-name VR-Main-API'],
  ['allow', 'aws lambda get-alias --function-name f --name live'],
  ['allow', 'aws lambda get-function-concurrency --function-name f'],
  ['allow', 'aws lambda get-function-url-config --function-name f'],
  ['allow', "aws logs start-query --query-string 'fields @timestamp' --query queryId --output text"],
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
      console.error('FAIL expected ' + expected + ' got ' + actual + ': ' + command + (why ? '\n  ' + why : ''));
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
  // A control on the escape case: the command must really hold a backslash, or the
  // case would prove nothing about the backslash it is named for.
  if (!CASES.some((c) => c[1].includes(String.fromCharCode(92) + 'u006d'))) {
    failed += 1;
    console.error('FAIL the escaped-name case holds no backslash');
  }
  // And a control on the tool gate: the same leaking command must be permitted
  // for a tool this hook does not police.
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
  console.error('REFUSED by vivreal-infra lambda-env-guard: ' + why + '\n' + GUIDANCE);
  process.exit(2);
});
