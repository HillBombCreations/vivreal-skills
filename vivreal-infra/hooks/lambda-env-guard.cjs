#!/usr/bin/env node
'use strict';

/**
 * Refuse the AWS CLI calls listed below (lambda reads, and cloudcontrol reads of a
 * Lambda function) when they could print a Lambda function's environment.
 *
 * THE LIMIT, stated plainly: this hook is a guardrail against accidental env dumps from
 * the CLI, not a security boundary; code that calls the AWS SDK is out of its reach
 * (`python -c` with boto3, a node script with @aws-sdk/client-lambda, any program). It
 * reads command TEXT, and no pattern list can follow arbitrary code. The real control is
 * an IAM deny on lambda:GetFunctionConfiguration (and the other reads listed below) for
 * agent roles, designed in this repository's docs/agent-permissions-boundary.md and not
 * yet built (backlog T3). The
 * heredoc exemption below is the same: an interpreter this hook does not know can
 * still run a file a heredoc wrote.
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
 * unquoted, `$(...)`, bash backticks, `@splat`). A bash value that is one double-quoted
 * string whose every `$` is a plain `$NAME` or `${NAME}` (`"$fn"`, `"VR-CMS-API-$STAGE"`) is
 * one argument and is allowed, but only right after a value-taking flag spelled in full
 * (VALUE_FLAGS); in PowerShell only a quoted value with no variable (`"fn-`$x"`) is, since
 * Windows PowerShell 5.1 can split a variable into several arguments. An expansion after a
 * spelled-out subcommand that is not a listed read (`aws lambda get-alias --function-name
 * $FN`) is allowed when it is a plain variable, nothing runs and nothing is chained after
 * it. A comment (`#`, `<#`) and an argument appender (`xargs`, `parallel`) on a lambda read
 * are refused, and `powershell -EncodedCommand` is decoded and judged.
 *
 * HOW THE CLI IS REACHED does not matter (PR #60 review pass 3). The trigger is a
 * `lambda` word plus a listed subcommand word, whatever the program (`aws`, `$X`, a
 * shell function, `python -m awscli`). A command string handed to `bash -c`,
 * `sh -c`, `powershell -Command`, `pwsh -c`, `cmd /c` or `Invoke-Expression` / `iex`
 * is judged again as a command of its own, and one this hook cannot parse is refused
 * when it names `lambda` and a listed subcommand. Any command that names a lambda read
 * and carries a backslash or a `{a,b}` brace expansion outside quotes is refused
 * whole, because the shell rewrites those into words this hook would otherwise
 * misread (`\--query @`, `{--query,@}`, `--deb\ug`, `--{debug,debug}`). Both tests
 * match `lambda` as a WHOLE word (2026-10-31), so a log group (`/aws/lambda/fn`, a
 * `--log-group-name` value) or a script's `lambda x: {...}` does not trip them.
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
 * continued line would be judged apart from its command. A lone `&` (bash background,
 * PowerShell 7 background or call operator) also starts a new command; `&&`, `>&`, `&>`
 * and `2>&1` do not.
 */
function segments(command) {
  return String(command)
    .replace(/[\\`]\r?\n/g, ' ')
    .split(/\n|&&|\|\||[;|]|(?<![&>])&(?![&>])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Walk a piece of shell text quote by quote, in the dialect of the shell that will
 * run it, and call `emit(char, quoted)` for each character of the resulting text.
 * Bash: a backslash outside quotes escapes the next character, and inside double
 * quotes escapes only $ ` " \. PowerShell: a backslash is literal, and a backtick
 * escapes inside double quotes. Returns { escaped, unterminated }, where `escaped`
 * says a backslash appeared outside quotes.
 */
function walk(text, dialect, emit) {
  const bash = dialect === 'bash';
  let escaped = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'") {
      const end = text.indexOf("'", i + 1);
      if (end === -1) return { escaped, unterminated: true, stop: i };
      emit('', true, i); // marks where the word starts, and an empty '' is still a word
      for (let j = i + 1; j < end; j += 1) emit(text[j], true, j);
      i = end + 1;
    } else if (c === '"') {
      const isEscape = (j) => (bash ? text[j] === '\\' && '$`"\\'.includes(text[j + 1]) : text[j] === '`');
      let end = i + 1;
      while (end < text.length && text[end] !== '"') end += isEscape(end) ? 2 : 1;
      if (end >= text.length) return { escaped, unterminated: true, stop: i };
      emit('', true, i);
      for (let j = i + 1; j < end; ) {
        if (isEscape(j)) {
          emit(text[j + 1], true, j);
          j += 2;
        } else {
          emit(text[j], true, j);
          j += 1;
        }
      }
      i = end + 1;
    } else if (c === '\\') {
      escaped = true;
      if (bash && i + 1 < text.length) {
        emit(text[i + 1], true, i);
        i += 2;
      } else {
        emit(c, false, i);
        i += 1;
      }
    } else {
      emit(c, false, i);
      i += 1;
    }
  }
  return { escaped, unterminated: false, stop: text.length };
}

/**
 * Shell-style words of a segment, each as { raw, value }. `value` is what the
 * program receives; `raw` keeps the quotes so a value assembled from several quoted
 * pieces can be told apart from a single quoted one. `unterminated` reports a quote
 * that never closed, which means this hook cannot know the real words.
 */
function words(segment, dialect) {
  const out = [];
  let cur = null;
  const flush = (to) => {
    if (cur) {
      cur.raw = segment.slice(cur.from, to);
      out.push(cur);
    }
    cur = null;
  };
  const res = walk(segment, dialect, (ch, quoted, at) => {
    if (!quoted && /\s/.test(ch)) {
      flush(at);
      return;
    }
    if (!cur) cur = { from: at, value: '' };
    cur.value += ch;
  });
  if (res.unterminated) {
    // Keep the old reading for the tail (one word to the end) so callers still see it.
    if (!cur) cur = { from: res.stop, value: '' };
    cur.value += segment.slice(res.stop + 1);
    flush(segment.length);
  } else {
    flush(segment.length);
  }
  return { ws: out.map(({ raw, value }) => ({ raw: raw.trim(), value })), unterminated: res.unterminated };
}

/**
 * Bash brace expansion of `text`, enough to see what words a `{a,b}` or `{a..b}`
 * would produce. Returns null when the expansion would exceed `cap` results.
 */
function braceExpand(text, cap = 64) {
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{' || text[i - 1] === '$') continue;
    let depth = 0;
    const commas = [];
    let close = -1;
    for (let j = i; j < text.length; j += 1) {
      if (text[j] === '{') depth += 1;
      else if (text[j] === '}') {
        depth -= 1;
        if (depth === 0) {
          close = j;
          break;
        }
      } else if (text[j] === ',' && depth === 1) commas.push(j);
    }
    if (close === -1) break;
    const body = text.slice(i + 1, close);
    let alts = null;
    if (commas.length) {
      alts = [];
      let from = i + 1;
      for (const c of commas) {
        alts.push(text.slice(from, c));
        from = c + 1;
      }
      alts.push(text.slice(from, close));
    } else if (/^\w+\.\.\w+(\.\.-?\d+)?$/.test(body)) {
      alts = [body.replace(/\.\./g, ' ')]; // a sequence: its endpoints are enough to see a name
    }
    if (!alts) continue;
    const out = [];
    for (const alt of alts) {
      const sub = braceExpand(text.slice(0, i) + alt + text.slice(close + 1), cap);
      if (!sub) return null;
      out.push(...sub);
      if (out.length > cap) return null;
    }
    return out;
  }
  return [text];
}

/** Cloud Control reads whose `Properties` carry a Lambda function's Environment. */
const CLOUDCONTROL_READS = ['get-resource', 'list-resources'];

/** The words of plain text, cut wherever a shell would end a word or a command, lower case. */
function tokensOf(text) {
  return String(text)
    .toLowerCase()
    .split(/[\s;&|()<>`$'"{},\\]+/)
    .filter(Boolean);
}

/**
 * Whether text names a read this hook judges, by WHOLE words: `lambda` beside a listed
 * subcommand, or `cloudcontrol` beside a listed read with Lambda named anywhere. The word
 * must be whole (2026-10-31): a log group such as `/aws/lambda/fn`, in a `--log-group-name`
 * value or anywhere else, is one word that is not `lambda`, and a script's `lambda x: {...}`
 * names no subcommand, so neither is a lambda read.
 */
function namesLambdaRead(text) {
  const t = tokensOf(text);
  if (t.includes('lambda') && t.some((w) => Object.prototype.hasOwnProperty.call(CONFIG_PREFIX, w))) return true;
  return t.includes('cloudcontrol') && t.some((w) => CLOUDCONTROL_READS.includes(w)) && /lambda/i.test(text);
}

/**
 * Whether the command names a lambda read and carries a backslash or a brace expansion
 * outside quotes, either of which the shell turns into words this hook would misread.
 */
function rewritesWords(command, dialect) {
  let unquoted = '';
  let flat = '';
  const res = walk(command, dialect, (ch, quoted) => {
    unquoted += quoted ? '_' : ch;
    // Quoted braces and commas are literal, so they must not expand in `flat`.
    flat += quoted && /[{},]/.test(ch) ? ' ' : ch;
  });
  const brace = braceExpand(unquoted, 4096);
  const hasBrace = brace === null || brace.length > 1 || brace[0] !== unquoted;
  if (!res.escaped && !hasBrace) return false;
  const expanded = braceExpand(flat);
  return expanded === null || expanded.some((t) => namesLambdaRead(t));
}

/**
 * Whether text names a lambda read, for text this hook cannot parse. Quotes, braces,
 * commas and backslashes are dropped first, so `l'a'mbda` and `get-fun{}ction` still read
 * as the words they become.
 */
function mentionsLambdaRead(text) {
  return namesLambdaRead(String(text).replace(/[\\'"`{},]/g, ''));
}

// Programs that run a command string of their own, and PowerShell's string evaluators.
const SHELL_BIN = /^(bash|sh|zsh|dash|ksh|wsl|cmd|powershell|pwsh)(\.exe)?$/i;
const STRING_EVAL = /^(iex|invoke-expression)$/i;
const MAX_DEPTH = 4;

/**
 * Whether a raw word is ONE double-quoted string that the shell always hands over as exactly
 * one argument. An ALLOWLIST (review of #63): every `$` inside must be a plain variable,
 * bash `$NAME` or `${NAME}`, PowerShell `$name`, `${name}` or `$env:NAME`. Anything else,
 * `$(`, a backtick in bash, `"$@"`, `"${@:1}"`, `"${@/x/y}"`, `"${!N}"`, `"${a[@]}"`, can run
 * a command or expand to several words, so it is not one argument. In PowerShell a backtick
 * inside double quotes is its escape character (`$ is a literal dollar).
 */
const BASH_ONE_QUOTED = /^"(?:[^"\\`$]|\\[$`"\\\n]|\\(?=[^$`"\\\n])|\$[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\})*"$/;
const PWSH_ONE_QUOTED = /^"(?:[^"`$]|`[\s\S]|\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*|\$\{[A-Za-z_][A-Za-z0-9_]*\})*"$/i;

function isOneQuotedArgument(raw, dialect) {
  return (dialect === 'bash' ? BASH_ONE_QUOTED : PWSH_ONE_QUOTED).test(raw);
}

/**
 * A word that is nothing but one plain variable, quoted or not: bash `$NAME` / `${NAME}`,
 * PowerShell also `$env:NAME`. Never `$(`, a backtick, `$@`, `${...}` with an operator, or `@splat`.
 */
function isPlainVariableWord(raw, dialect) {
  const name = dialect === 'bash' ? '[A-Za-z_][A-Za-z0-9_]*' : '(?:env:)?[A-Za-z_][A-Za-z0-9_]*';
  return new RegExp('^("?)\\$(?:' + name + '|\\{[A-Za-z_][A-Za-z0-9_]*\\})\\1$', 'i').test(raw);
}

/**
 * Whether word k expands into arguments the hook cannot see. A single-quoted word is
 * literal in both shells. A flag value (other than --query's) that is one double-quoted
 * string, such as "$fn", "VR-CMS-API-$STAGE" or "/aws/lambda/${fn}", is one argument.
 * An unquoted $VAR is not: bash splits it on spaces and PowerShell splats an array.
 */
function isExpansion(ws, k, dialect) {
  const w = ws[k];
  if (!/[$`]/.test(w.raw) && !/^@\w/.test(w.raw)) return false;
  if (/^'[^']*'$/.test(w.raw)) return false;
  // A quoted value is one argument only where the CLI consumes it as a VALUE: after a flag on
  // VALUE_FLAGS, spelled in full and with no `=` of its own. After a boolean flag
  // (`--no-paginate "$Q"`) or a `--region=x` word it is a whole extra option, a second
  // `--query` among them (review of #63, pass 2).
  const prev = ws[k - 1];
  const isFlagValue = Boolean(prev) && VALUE_FLAGS.has(prev.value.toLowerCase());
  if (!isFlagValue) return true;
  // Windows PowerShell 5.1 passes a variable holding `\"` to a native program as several
  // arguments, and this hook cannot tell 5.1 from pwsh 7, so in PowerShell only a quoted
  // value with no variable in it (escapes such as `$ allowed) counts as one argument.
  if (dialect !== 'bash' && /\$/.test(w.raw.replace(/`[\s\S]/g, ''))) return true;
  return !isOneQuotedArgument(w.raw, dialect);
}

/**
 * AWS CLI options that take one value on the lambda reads judged here (the subcommand's own
 * and the global ones). Anything else before a quoted expansion makes it a possible option.
 */
const VALUE_FLAGS = new Set([
  '--function-name', '--qualifier', '--marker', '--max-items', '--starting-token', '--page-size',
  '--master-region', '--function-version', '--region', '--profile', '--endpoint-url', '--ca-bundle',
  '--cli-read-timeout', '--cli-connect-timeout', '--color', '--cli-binary-format',
]);

/**
 * The lambda read this segment runs, whatever program runs it, as { sub } or
 * { why } when the segment hides the service or subcommand behind an expansion.
 * Null when it is not a lambda read.
 */
function configSubcommand(ws, dialect, isLast) {
  // The CLI's grammar first (the same parse the alias check uses): a listed read wherever the
  // global options put the service. The word heuristics below still catch a program the parse
  // cannot see (`$X lambda ...`, a shell function).
  for (const start of awsProgramStarts(ws)) {
    const { pathAts, unknownAt } = parseAwsCli(ws, start);
    if (unknownAt !== -1 || pathAts.length < 2 || ws[pathAts[0]].value.toLowerCase() !== 'lambda') continue;
    const sub = ws[pathAts[1]].value.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(CONFIG_PREFIX, sub)) return { sub };
  }
  const lambdaAts = ws.map((w, k) => (w.value.toLowerCase() === 'lambda' ? k : -1)).filter((k) => k !== -1);
  const lambdaAt = lambdaAts.length ? lambdaAts[0] : -1;
  const subAt = ws.findIndex((w) => Object.prototype.hasOwnProperty.call(CONFIG_PREFIX, w.value.toLowerCase()));
  const expansionAt = ws.findIndex((w, k) => isExpansion(ws, k, dialect));
  if (lambdaAt !== -1 && subAt !== -1) return { sub: ws[subAt].value.toLowerCase() };
  // A plain literal word straight after `lambda` IS the subcommand the CLI runs, and it is not
  // a listed read (that case returned above). An expansion after it can only add arguments to
  // that subcommand, so `aws lambda get-alias --function-name $FN` is not a hidden read. Only
  // when every expansion is a plain variable word (never `$(`, a backtick or `@splat`, which
  // run code or splat) and nothing is chained after this command (`& $C`, `; ...`, `| ...`).
  const spelled = (k) => {
    const next = ws[k + 1];
    return Boolean(next) && /^[a-z0-9][a-z0-9-]*$/i.test(next.value) && !isExpansion(ws, k + 1, dialect);
  };
  const plainOnly = ws.every((w, k) => !isExpansion(ws, k, dialect) || isPlainVariableWord(w.raw, dialect));
  const runsNothing = !ws.some((w) => /\$\(|`/.test(w.raw) && !/^'[^']*'$/.test(w.raw));
  if (lambdaAt !== -1 && expansionAt > lambdaAt + 1 && isLast && plainOnly && runsNothing && lambdaAts.every(spelled)) {
    return null;
  }
  if (lambdaAt !== -1 && expansionAt !== -1) {
    return { why: 'the lambda subcommand may be hidden in an expansion (' + ws[expansionAt].raw + '); spell it out.' };
  }
  if (subAt !== -1 && expansionAt !== -1 && expansionAt < subAt) {
    return { why: 'the service before ' + ws[subAt].value + ' may be lambda, hidden in an expansion (' + ws[expansionAt].raw + '); spell it out.' };
  }
  return null;
}

/** Why a Cloud Control read of a Lambda function must be refused, or null. */
function cloudControlRefusal(ws) {
  const lower = ws.map((w) => w.value.toLowerCase());
  if (!lower.includes('cloudcontrol') || !lower.some((v) => CLOUDCONTROL_READS.includes(v))) return null;
  const k = ws.findIndex((w) => /^--type-name(=|$)/.test(w.value));
  const type = k === -1 ? undefined : ws[k].value.includes('=') ? ws[k].value.split('=')[1] : (ws[k + 1] || {}).value;
  if (type && /^[A-Za-z0-9:]+$/.test(type) && !/lambda/i.test(type)) return null;
  return (
    'cloudcontrol ' + lower.find((v) => CLOUDCONTROL_READS.includes(v)) + ' on a Lambda function (or a type ' +
    'this hook cannot see) returns Properties with Environment.Variables, and no --query can project inside it.'
  );
}

// argparse accepts an unambiguous prefix of a long option, so `--quer` is `--query`.
// `--qu` is ambiguous with `--qualifier` and argparse rejects it.
const QUERY_FLAG = /^--que(r(y)?)?(=|$)/;
const DEBUG_FLAG = /^--deb(u(g)?)?(=|$)/;
const OUTPUT_FLAG = /^--out(p(u(t)?)?)?(=|$)/;

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

/**
 * The AWS CLI aliases of the user running the hook, from `~/.aws/cli/alias` under the home
 * directory Node resolves on any OS (HOME, or USERPROFILE on Windows), as the CLI itself does.
 * Every section is kept, generically, keyed by its command path: `[toplevel]` under '' expands
 * `aws <alias>`, and `[command <service> ...]` under '<service> ...' expands `aws <service> ...
 * <alias>` (lambda, cloudcontrol or any other). A missing or unreadable file means no aliases.
 * Read once per hook run.
 */
let cliAliases = null;
function loadCliAliases() {
  if (cliAliases) return cliAliases;
  cliAliases = new Map();
  let text = '';
  try {
    text = require('node:fs').readFileSync(require('node:path').join(require('node:os').homedir(), '.aws', 'cli', 'alias'), 'utf8');
  } catch {
    return cliAliases; // No alias file is the normal case; nothing to expand.
  }
  let section = null;
  let last = null;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*([#;]|$)/.test(line)) continue;
    const head = /^\s*\[\s*(.+?)\s*\]\s*$/.exec(line);
    if (head) {
      const name = head[1].toLowerCase().replace(/\s+/g, ' ');
      const path = name === 'toplevel' ? '' : /^command /.test(name) ? name.slice('command '.length) : null;
      if (path !== null && !cliAliases.has(path)) cliAliases.set(path, new Map());
      section = path === null ? null : cliAliases.get(path);
      last = null;
    } else if (/^\s/.test(line) && section && last) {
      section.set(last, (section.get(last) + ' ' + line.trim()).trim()); // an indented continuation line
    } else {
      const kv = /^\s*([^=\s]+)\s*=\s*(.*)$/.exec(line);
      if (kv && section) {
        last = kv[1].toLowerCase();
        section.set(last, kv[2].trim());
      }
    }
  }
  return cliAliases;
}

/**
 * The segment with a CLI alias expanded, as { name, text, shell }, or null when no word is an
 * alias. After an `aws` word, the command path is built from the positional words that follow
 * (global options and their values skipped); the first word that is an alias in the section for
 * the path so far is expanded. `shell` is true for a `!` alias, a shell command of its own. The
 * alias TEXT is for judging only and never goes into a message: it can hold anything.
 */
function expandCliAlias(ws) {
  const aliases = loadCliAliases();
  if (!aliases.size) return null;
  const expand = (at, key) => {
    const value = aliases.get(key).get(ws[at].value.toLowerCase());
    if (value.startsWith('!')) return { name: ws[at].value, text: value.slice(1), shell: true };
    return { name: ws[at].value, text: ws.map((w, j) => (j === at ? value : w.raw)).join(' '), shell: false };
  };
  // 1. The CLI's own grammar: global options, then the command path, as parseAwsCli reads it.
  let unplaced = false;
  for (const start of awsProgramStarts(ws)) {
    const parsed = parseAwsCli(ws, start);
    if (parsed.unknownAt !== -1) {
      unplaced = true; // an option this hook cannot place; step 2 still looks
      continue;
    }
    const path = [];
    for (const at of parsed.pathAts) {
      const key = path.join(' ');
      const section = aliases.get(key);
      if (section && section.has(ws[at].value.toLowerCase())) {
        return expand(at, key);
      }
      path.push(ws[at].value.toLowerCase());
    }
  }
  // 2. Fail-closed fallback for any shape the parse could not place (an unknown option, a
  //    program behind an expansion): a section's command path spelled out as consecutive words,
  //    followed by one of its aliases, is expanded wherever it appears. A bare `--` between them
  //    is skipped, as the CLI skips it. Toplevel aliases are looked for only after an `aws`
  //    whose options the parse could not place, so an ordinary word is never taken for one.
  const idx = ws.map((w, j) => j).filter((j) => ws[j].value !== '--');
  for (const [key, section] of aliases) {
    if (!key) {
      if (!unplaced) continue;
      const first = Math.min(...awsProgramStarts(ws));
      const at = idx.find((j) => j >= first && section.has(ws[j].value.toLowerCase()));
      if (at !== undefined) return expand(at, key);
      continue;
    }
    const parts = key.split(' ');
    for (let i = 0; i + parts.length < idx.length; i += 1) {
      if (!parts.every((p, n) => ws[idx[i + n]].value.toLowerCase() === p)) continue;
      const at = idx[i + parts.length];
      if (section.has(ws[at].value.toLowerCase())) {
        return expand(at, key);
      }
    }
  }
  return null;
}

/**
 * The AWS CLI's global options (aws-cli v2 `aws help`), split by whether they take a value.
 * Command-level value options on the lambda reads are VALUE_FLAGS. argparse also accepts any
 * unambiguous prefix, so `--out json` is `--output json`.
 */
const GLOBAL_VALUE_OPTIONS = [
  '--output', '--query', '--profile', '--region', '--endpoint-url', '--color', '--ca-bundle',
  '--cli-read-timeout', '--cli-connect-timeout', '--cli-binary-format', '--cli-input-json', '--cli-input-yaml',
];
const GLOBAL_BOOLEAN_OPTIONS = [
  '--debug', '--no-paginate', '--no-verify-ssl', '--no-sign-request', '--no-cli-pager',
  '--cli-auto-prompt', '--no-cli-auto-prompt', '--version',
];

/** Where the AWS CLI program's own arguments start: after `aws`, `aws.exe`, or `-m awscli`. */
function awsProgramStarts(ws) {
  const starts = [];
  for (let k = 0; k < ws.length; k += 1) {
    const base = ws[k].value.split(/[\\/]/).pop();
    if (/^aws(\.exe)?$/i.test(base) || (base.toLowerCase() === 'awscli' && k > 0 && ws[k - 1].value === '-m')) {
      starts.push(k + 1);
    }
  }
  return starts;
}

/**
 * Parse the AWS CLI's grammar once, from the first argument after the program: skip global
 * options (`--opt value`, `--opt=value`, booleans, unambiguous prefixes of either), then read
 * the service and the command path after it. Returns { serviceAt, pathAts, unknownAt }:
 * `pathAts` lists the service, the subcommand and any deeper command words, the words an
 * alias can stand for; `unknownAt` is the index of an option before the service this hook
 * cannot place (-1 when none), so callers fail closed instead of guessing the service.
 */
function parseAwsCli(ws, start) {
  const resolve = (name) => {
    const exact = (list) => list.includes(name);
    if (exact(GLOBAL_VALUE_OPTIONS) || VALUE_FLAGS.has(name)) return 'value';
    if (exact(GLOBAL_BOOLEAN_OPTIONS)) return 'boolean';
    const values = GLOBAL_VALUE_OPTIONS.filter((o) => o.startsWith(name));
    const booleans = GLOBAL_BOOLEAN_OPTIONS.filter((o) => o.startsWith(name));
    if (values.length === 1 && booleans.length === 0) return 'value';
    if (booleans.length === 1 && values.length === 0) return 'boolean';
    return null;
  };
  // A bare `--` is argparse's end-of-options marker: the CLI drops it and reads on, so
  // `aws -- probefc`, `aws lambda -- fc` and `aws --region x -- probefc` run the same command
  // as without it (measured on aws-cli 2.34.0, review of #63 pass 6). It is skipped wherever
  // it sits, before the service or inside the command path.
  const isEnd = (w) => w.value === '--';
  let k = start;
  while (k < ws.length && /^-/.test(ws[k].value)) {
    if (isEnd(ws[k])) {
      k += 1;
      continue;
    }
    const word = ws[k].value.toLowerCase();
    const eq = word.indexOf('=');
    const kind = resolve(eq === -1 ? word : word.slice(0, eq));
    if (kind === null) return { serviceAt: -1, pathAts: [], unknownAt: k };
    k += kind === 'value' && eq === -1 ? 2 : 1;
  }
  const pathAts = [];
  for (let at = k; at < ws.length && pathAts.length < 4; at += 1) {
    if (isEnd(ws[at])) continue;
    if (/^-/.test(ws[at].value)) break;
    pathAts.push(at);
  }
  return { serviceAt: pathAts.length ? pathAts[0] : -1, pathAts, unknownAt: -1 };
}

/** Why this segment must be refused, or null when it is fine. */
function refusalFor(segment, dialect, depth, isLast = true) {
  const { ws, unterminated } = words(segment, dialect);
  if (unterminated && mentionsLambdaRead(segment)) {
    return 'a quote never closes, so this hook cannot read the words, and the text mentions a lambda read.';
  }

  // A command string run by another shell, or by Invoke-Expression, is a command of its own.
  for (let k = 0; k < ws.length; k += 1) {
    const base = ws[k].value.split(/[\\/]/).pop();
    if (!SHELL_BIN.test(base) && !STRING_EVAL.test(base)) continue;
    // `powershell -EncodedCommand <base64>` runs the decoded UTF-16LE text: judge that text.
    // PowerShell accepts any prefix of the parameter name (`-e`, `-ec`, `-enc`, ...).
    const encAt = ws.findIndex((w, j) => j > k && /^[-/]e[a-z]*$/i.test(w.value)
      && ('encodedcommand'.startsWith(w.value.slice(1).toLowerCase()) || w.value.slice(1).toLowerCase() === 'ec'));
    if (/^(powershell|pwsh)(\.exe)?$/i.test(base) && encAt !== -1) {
      const payload = (ws[encAt + 1] || {}).value || '';
      const decoded = Buffer.from(payload, 'base64').toString('utf16le');
      const why = decideText(decoded, depth + 1);
      if (why) return 'in the command encoded for ' + base + ' -EncodedCommand: ' + why;
    }
    const nested = ws.slice(k + 1).map((w) => w.value).join(' ');
    // cmd /c expands %NAME% (and, under /v:on, !NAME!) in its command string, an argument this
    // hook cannot see.
    if (/^cmd(\.exe)?$/i.test(base) && /%[A-Za-z_][A-Za-z0-9_]*%|![A-Za-z_][A-Za-z0-9_]*!/.test(nested)
      && tokensOf(nested).some((t) => t === 'lambda' || /^aws(\.exe)?$/.test(t.split('/').pop()))) {
      return 'cmd expands %VAR% in its command string, which can add a second --query; spell the arguments out.';
    }
    const why = decideText(nested, depth + 1);
    if (why) return 'in the command string passed to ' + base + ': ' + why;
  }

  // PowerShell's stop-parsing token `--%` hands the rest of the line to the program verbatim,
  // with cmd-style `%VAR%` expanded, so a `--query=@` can hide there. Everything after it is
  // opaque to this hook: a command naming the AWS CLI, `lambda` or a listed read that uses it
  // is refused, even with a literal --query before it, since a second --query after it wins.
  const namesCli = (w) => /^(aws(\.exe)?|lambda)$/i.test(w.value.split(/[\\/]/).pop())
    || Object.prototype.hasOwnProperty.call(CONFIG_PREFIX, w.value.toLowerCase());
  // A program named by an expansion (`& $a --% %X%`) may be the CLI too.
  const programHidden = (() => {
    // `&` (call) and `.` (dot-source) both run the program named after them.
    const cmd = ws.find((w) => w.raw !== '&' && w.raw !== '.' && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w.value));
    return Boolean(cmd) && /[$`]|^@\w/.test(cmd.raw) && !/^'[^']*'$/.test(cmd.raw);
  })();
  if (dialect !== 'bash' && ws.some((w) => w.raw === '--%') && (ws.some(namesCli) || programHidden)) {
    return 'PowerShell --% passes the rest of the line verbatim with %VAR% expanded, which this hook cannot see ' +
      '(a second --query among it). Drop --% and spell the arguments out.';
  }

  // An AWS CLI alias (~/.aws/cli/alias) can spell a lambda read under another name: judge the
  // command again with the alias expanded. The message names the alias only: its body, and any
  // reason derived from it, can carry a profile, a key or anything else, so neither is printed.
  const aliased = expandCliAlias(ws);
  if (aliased !== null) {
    const why = aliased.shell
      ? decideText(aliased.text, depth + 1)
      : depth < MAX_DEPTH ? refusalFor(aliased.text, dialect, depth + 1, isLast) : 'aliases nest too deep';
    if (why) {
      return 'the AWS CLI alias "' + aliased.name + '" expands to a command this hook refuses. ' +
        'Run the read it stands for directly, spelled out, with a --query projection.';
    }
  }

  const cc = cloudControlRefusal(ws);
  if (cc) return cc;

  const found = configSubcommand(ws, dialect, isLast);
  if (!found) return null;
  if (found.why) return found.why;
  const { sub } = found;

  // An unquoted word starting `#` begins a comment in bash and PowerShell, and PowerShell's
  // `<#` opens a block comment: everything after it, a --query among it, never reaches the CLI.
  const comment = ws.find((w) => /^#/.test(w.raw) || (dialect !== 'bash' && /^<#/.test(w.raw)));
  if (comment) {
    return 'the command carries a comment (' + comment.raw + '), and the shell drops what follows it, ' +
      'a --query among it. Remove the comment.';
  }
  // xargs and parallel append arguments read from stdin, a second --query among them.
  const appender = ws.find((w) => /^(xargs|parallel)(\.exe)?$/i.test(w.value.split(/[\\/]/).pop()));
  if (appender) {
    return appender.value + ' appends arguments this hook cannot see (a second --query among them); ' +
      'run the lambda read directly.';
  }

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
    if (isExpansion(ws, k, dialect)) {
      return (
        'the command carries an expansion (' + w.raw + ') that can add arguments this hook cannot ' +
        'see, a second --query among them. Quote it as a flag value ("$name") or spell the value out.'
      );
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


// Anything that can run code: a shell, an interpreter, eval or source, or a wrapper that runs
// its argument. Named anywhere outside a heredoc body, it voids every heredoc exemption.
const CODE_RUNNER = /^(bash|sh|zsh|dash|ksh|wsl|cmd|powershell|pwsh|iex|invoke-expression|python[0-9.]*|py|node|perl|ruby|awk|gawk|mawk|make|gmake|eval|source|exec|xargs|parallel|env|sudo|nohup|time|timeout|nice|watch|command|builtin)(\.exe)?$/i;
// Words that can open a command without being the command.
const COMMAND_PREFIX = /^(if|then|else|elif|while|until|do|!|\{|\(|\(\(|time)$/;
const HEREDOC_DELIM = /^-?[ \t]*((?:'[^'\n]*'|"[^"\n]*"|\\.|[^\s;&|<>()'"\\])+)/;

/**
 * The line with every quoted or escaped character masked to '_', the same length as the
 * line, so an index into the mask is an index into the line.
 */
function maskQuoted(line) {
  let mask = '';
  let quote = null;
  for (let j = 0; j < line.length; j += 1) {
    const c = line[j];
    if (quote === '"' && c === '\\') {
      mask += '__';
      j += 1;
    } else if (quote) {
      if (c === quote) quote = null;
      mask += '_';
    } else if (c === "'" || c === '"') {
      quote = c;
      mask += '_';
    } else if (c === '\\') {
      mask += j + 1 < line.length ? '__' : '_';
      j += 1;
    } else {
      mask += c;
    }
  }
  return mask.slice(0, line.length);
}

/**
 * Whether bash text (heredoc bodies already removed) could run code that a heredoc body
 * feeds: a command substitution or backtick anywhere, a runner named anywhere, or a command
 * word that is an expansion (`$c`, `${c}`), `.`, or a file path being executed.
 */
function runsCode(text) {
  if (/\$\(|`/.test(text)) return true;
  for (const seg of String(text).split(/\n|&&|\|\||[;|&]/)) {
    const ws = words(seg, 'bash').ws;
    // `<` and `>` split too: `sh<x.sh` is one shell word but runs sh on the file.
    const names = ws.flatMap((w) => w.value.split(/[;&|(){}<>]/)).map((v) => v.split(/[\\/]/).pop());
    if (names.some((v) => CODE_RUNNER.test(v))) return true;
    const cmd = ws.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w.value) && !COMMAND_PREFIX.test(w.value));
    if (!cmd) continue;
    if (/[$`]/.test(cmd.raw) || cmd.value === '.' || /[\\/]/.test(cmd.value)) return true;
  }
  return false;
}

/**
 * Whether the command that owns the heredoc at `at` on `line` only writes its stdin to a
 * file: `cat` with a `>` or `>>` file redirect, or `tee` with a file argument.
 */
function isFileWriter(line, mask, at) {
  const bounds = /[;&|(){}]/g;
  let from = 0;
  let to = line.length;
  let m;
  while ((m = bounds.exec(mask))) {
    if (m.index < at) from = m.index + 1;
    else {
      to = m.index;
      break;
    }
  }
  const ws = words(line.slice(from, to), 'bash').ws;
  const k = ws.findIndex((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w.value));
  if (k === -1) return false;
  if (ws[k].raw === 'cat') return ws.some((w) => /^\d*>>?(?!&)/.test(w.raw));
  if (ws[k].raw !== 'tee') return false;
  // tee's file is an argument before the heredoc operator, so the delimiter is never counted.
  const args = words(line.slice(from, at), 'bash').ws.slice(k + 1);
  return args.some((w) => !/^-/.test(w.value) && !/^\d*[<>]/.test(w.raw));
}

/**
 * A bash heredoc body is data handed to its command on stdin, so a doc append
 * (`cat >> notes.md <<'EOF'`) whose text mentions a lambda read must not be judged as one.
 * A body is exempt, removed from the text this hook judges, ONLY when its command is a plain
 * file writer (`cat` or `tee` into a file), its delimiter is quoted or the body holds no `$(`
 * or backtick, and nothing anywhere else in the command runs code (see runsCode). Every other
 * body stays in place and is judged exactly as before. Anything this cannot read with
 * certainty (an unclosed quote, a `<<` inside `((`, a body with no terminator) returns the
 * text untouched.
 */
function stripHeredocs(command) {
  const lines = String(command).split('\n');
  const ops = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    i += 1;
    if (walk(line, 'bash', () => {}).unterminated) return command;
    const mask = maskQuoted(line);
    const hash = mask.search(/(^|\s)#/);
    const code = hash === -1 ? mask : mask.slice(0, hash);
    const found = [];
    const opRx = /(^|[^<])<<(?!<)/g;
    let m;
    while ((m = opRx.exec(code))) {
      const at = m.index + m[1].length;
      const before = code.slice(0, at);
      if ((before.match(/\(\(/g) || []).length > (before.match(/\)\)/g) || []).length) return command;
      const d = HEREDOC_DELIM.exec(line.slice(at + 2));
      if (!d) return command;
      found.push({
        dash: line[at + 2] === '-',
        quoted: /['"\\]/.test(d[1]),
        delim: d[1].replace(/['"]/g, '').replace(/\\(.)/g, '$1'),
        writer: isFileWriter(line, code, at),
      });
    }
    for (const op of found) {
      const start = i;
      while (i < lines.length && (op.dash ? lines[i].replace(/^\t+/, '') : lines[i]).replace(/\r$/, '') !== op.delim) i += 1;
      if (i >= lines.length) return command;
      ops.push({ ...op, start, end: i });
      i += 1; // past the terminator line
    }
  }
  if (ops.length === 0) return command;
  const inBody = new Set();
  for (const op of ops) for (let j = op.start; j < op.end; j += 1) inBody.add(j);
  if (runsCode(lines.filter((_, j) => !inBody.has(j)).join('\n'))) return command;
  const drop = new Set();
  for (const op of ops) {
    const body = lines.slice(op.start, op.end).join('\n');
    if (op.writer && (op.quoted || !/\$\(|`/.test(body))) for (let j = op.start; j < op.end; j += 1) drop.add(j);
  }
  return lines.filter((_, j) => !drop.has(j)).join('\n');
}

/**
 * Judge one command in the given shell dialects (a nested command string is judged
 * in both, since this hook cannot always tell which shell will run it).
 */
function decideText(command, depth, dialects = ['bash', 'powershell']) {
  if (depth > MAX_DEPTH) {
    return mentionsLambdaRead(command) ? 'command strings nest too deep to read, and one mentions a lambda read.' : null;
  }
  for (const dialect of dialects) {
    // PowerShell has no heredoc; only bash text loses the bodies that are plain file data.
    const text = dialect === 'bash' ? stripHeredocs(command) : command;
    const joined = String(text).replace(/[\\`]\r?\n/g, ' ');
    if (rewritesWords(joined, dialect)) {
      return (
        'the command names a lambda read and carries a backslash or a {a,b} brace expansion outside quotes, ' +
        'which the shell turns into words this hook cannot see (a second --query, or --debug). ' +
        'Write paths with forward slashes or inside quotes.'
      );
    }
    const segs = segments(text);
    // `'...' | iex` hands a string to Invoke-Expression through the pipe: judge every string.
    const evaluates = segs.some((s) => words(s, dialect).ws.some((w) => STRING_EVAL.test(w.value)));
    // A command that names lambda, chained with a command whose program is itself an expansion
    // (`aws lambda get-alias ... & $C`, `...; $C`), may be running a read this hook cannot see.
    if (segs.length > 1 && segs.some((s) => words(s, dialect).ws.some((w) => w.value.toLowerCase() === 'lambda'))) {
      // Wrappers that run their argument (`nohup $C`, `eval "$C"`, `. $C`) are looked through.
      const WRAPPER = /^(nohup|eval|exec|env|time|timeout|nice|sudo|command|builtin|source|\.|&|watch|iex|invoke-expression|start-process|-\S*|\d+[smhd]?)$/i;
      const hidden = segs.find((s) => {
        const cmd = words(s, dialect).ws.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w.value) && !COMMAND_PREFIX.test(w.value) && !WRAPPER.test(w.value));
        return cmd && (/[$`]/.test(cmd.raw) || /^@\w/.test(cmd.raw)) && !/^'[^']*'$/.test(cmd.raw);
      });
      if (hidden) {
        return 'a command beside this lambda command runs a program named by an expansion (' + hidden + '); spell the command out.';
      }
    }
    for (const [s, seg] of segs.entries()) {
      const why = refusalFor(seg, dialect, depth, s === segs.length - 1);
      if (why) return why;
      if (!evaluates) continue;
      for (const w of words(seg, dialect).ws) {
        if (!/\s/.test(w.value)) continue;
        const inner = decideText(w.value, depth + 1);
        if (inner) return 'in a string passed to Invoke-Expression: ' + inner;
      }
    }
  }
  return null;
}

function decide(toolName, command) {
  if (toolName !== 'Bash' && toolName !== 'PowerShell') return null;
  return decideText(command, 0, [toolName === 'Bash' ? 'bash' : 'powershell']);
}

/* ------------------------------------------------------------------ */

// A backslash built from its code, so no string escaping can quietly change what a case holds.
const BS = String.fromCharCode(92);

// [verdict, command, tool (default Bash)]
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
  // PR #60 review pass 3, FIX 1: words the shell rewrites (bash argv in the review).
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName ' + BS + '--query @'],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName {--query,@}'],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName --deb' + BS + 'ug'],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName --{debug,debug}'],
  ['block', 'X=' + BS + '" aws lambda get-function-configuration --function-name f --query @ #' + BS + '"'],
  ['block', 'aws lambda get-function-configuration --function-name f --query FunctionName --q\'\'uery @'],
  // FIX 2: however the CLI is reached.
  ['block', 'bash -c "aws lambda get-function --function-name f"'],
  ['block', 'powershell.exe -Command "aws lambda get-function --function-name f"'],
  ['block', "Invoke-Expression 'aws lambda get-function --function-name f'", 'PowerShell'],
  ['block', "'aws lambda get-function --function-name f' | iex", 'PowerShell'],
  ['block', 'X=aws; $X lambda get-function --function-name f'],
  ['block', 'a(){ aws "$@"; }; a lambda get-function --function-name f'],
  ['block', 'a' + BS + 'ws lambda get-function --function-name f'],
  ['block', "sh -c 'aws lambda list-functions'"],
  ['block', 'pwsh -c "aws lambda get-function-configuration --function-name f --query FunctionName --debug"'],
  ['block', 'bash -c "aws lambda get-function --function-name f; echo done"'],
  ['block', 'aws $SVC get-function --function-name f'],
  // Note in pass 3: Cloud Control returns the function's Properties, Environment included.
  ['block', 'aws cloudcontrol get-resource --type-name AWS::Lambda::Function --identifier f'],
  ['block', 'aws cloudcontrol list-resources --type-name AWS::Lambda::Function'],
  // The query probes pass 3 found already refused, kept so they stay refused.
  ['block', "aws lambda get-function-configuration --function-name f --query 'Environment . Variables'"],
  ['block', "aws lambda get-function-configuration --function-name f --query 'ENVIRONMENT.Variables'"],
  ['block', "aws lambda get-function-configuration --function-name f --query '\nEnvironment.Variables'"],
  ['block', "aws lambda get-function --function-name f --query 'Configuration[0]'"],
  ['block', "aws lambda get-function --function-name f --query 'Configuration[]'"],
  ['block', "aws lambda list-functions --query 'Functions[][]'"],
  ['block', "aws lambda list-functions --query '[Functions[0]]'"],
  ['block', "aws lambda list-functions --query '{a:Functions}'"],
  ['block', "aws lambda list-functions --query 'Functions[0:1]'"],
  ['block', 'aws lambda get-function-configuration --function-name f --query=@'],
  ['block', "aws --region us-east-1 lambda list-versions-by-function --function-name f --query 'Versions[0]'"],
  ['block', "aws lambda get-function-configuration --function-name f --query FunctionName `\n --query '@'", 'PowerShell'],
  ['block', 'aws lambda get-function-configuration --function-name f --cli-input-json \'{"FunctionName":"f"}\''],
  ['block', 'aws lambda get-function-configuration --function-name f --output text'],
  ['block', 'python -m awscli lambda get-function --function-name f'],
  ['block', 'aws lambda get-function --function-name f | jq .Configuration.Environment'],
  // Heredocs (2026-10-29): a body that runs, or a read outside the body, is still judged.
  ['block', "bash <<'EOF'\naws lambda get-function --function-name f\nEOF"],
  ['block', "cat <<'EOF' | sh\naws lambda list-functions\nEOF"],
  ['block', "'bash' <<'EOF'\naws lambda get-function --function-name f\nEOF"],
  ['block', "$SH <<'EOF'\naws lambda get-function --function-name f\nEOF"],
  ['block', 'cat > out.txt <<EOF\n$(aws lambda get-function --function-name f)\nEOF'],
  ['block', "cat >> notes.md <<'EOF'\nnotes\nEOF\naws lambda get-function --function-name f"],
  ['block', "cat >> notes.md <<'EOF'\naws lambda get-function --function-name f"],
  ['block', 'echo "<<EOF"\naws lambda get-function --function-name f\nEOF'],
  ['block', '# <<EOF\naws lambda get-function --function-name f\nEOF'],
  ['block', 'echo $((1<<X))\naws lambda get-function --function-name f\nX'],
  // Review of #61: a body is exempt only for a plain file writer in a command that runs nothing.
  ['block', "read -r c <<'EOF'\naws lambda get-function --function-name f\nEOF\neval \"$c\""],
  ['block', "c=$(cat <<'EOF'\naws lambda get-function --function-name f\nEOF\n)\n$c"],
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\nbash x.sh"],
  ['block', 'bash <<< "aws lambda get-function --function-name f"'],
  ['block', "cat <<'EOF' | bash\naws lambda get-function --function-name f\nEOF"],
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\nsource x.sh"],
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\n. x.sh"],
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\n./x.sh"],
  ['block', "tee x.sh <<'EOF' | sh\naws lambda get-function --function-name f\nEOF"],
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\nc=x.sh; ${c}"],
  // Pass 2: a redirect glued to the runner, and interpreters that run a file.
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\nsh<x.sh"],
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\nbash<x.sh"],
  ['block', "cat > x.sh <<'EOF'\naws lambda get-function --function-name f\nEOF\nbash <x.sh"],
  ['block', "cat > x.py <<'EOF'\naws lambda get-function --function-name f\nEOF\npython3 x.py"],
  ['block', "cat > Makefile <<'EOF'\naws lambda get-function --function-name f\nEOF\nmake"],
  ['block', "cat > x.awk <<'EOF'\naws lambda get-function --function-name f\nEOF\nawk -f x.awk"],
  ['block', "cat > x.js <<'EOF'\naws lambda get-function --function-name f\nEOF\nnode x.js"],

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
  // Pass 3 counterparts: the same routes, used safely.
  ['allow', "bash -c \"aws lambda get-function-configuration --function-name f --query 'keys(Environment.Variables)'\""],
  ['allow', 'aws cloudcontrol get-resource --type-name AWS::S3::Bucket --identifier b'],
  ['allow', 'cp src/*.{js,ts} out/ && git diff ' + BS + '-- x'],
  // A doc append is data written to a file, whatever its text says (refused before 2026-10-29).
  ['allow', "cat >> docs/notes.md <<'EOF'\n- The lambda get-function read printed the env, see vh-site.js\nEOF"],
  ['allow', "cat >> docs/notes.md <<'EOF'\nThe lambda guard refused docs" + BS + 'notes' + BS + 'x and {a,b}\nEOF'],
  ['allow', 'cat >> "$f" <<-EOF\n\taws lambda list-functions --output json\n\tEOF'],
  ['allow', "cat > a.md <<'A' && cat > b.md <<'B'\naws lambda get-function --function-name f\nA\naws lambda list-functions\nB"],
  ['allow', "tee -a docs/notes.md <<'EOF'\n- aws lambda get-function printed the env\nEOF"],
  ['allow', "& \"C:" + BS + "Program Files" + BS + "Amazon" + BS + "AWSCLIV2" + BS + "aws.exe\" lambda get-function-configuration --function-name f --query 'keys(Environment.Variables)'", 'PowerShell'],
];

function selfTest() {
  let failed = 0;
  for (const [expected, command, tool = 'Bash'] of CASES) {
    const why = decide(tool, command);
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
