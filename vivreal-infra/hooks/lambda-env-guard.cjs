#!/usr/bin/env node
'use strict';

/**
 * Refuse the AWS CLI calls listed below (lambda reads, and cloudcontrol reads of a
 * Lambda function) when they could print a Lambda function's environment.
 *
 * This hook stops ACCIDENTAL reads by agents. It is not a security boundary: a
 * determined caller can reach the same data some other way, and the boundary for
 * that is AWS permissions (an IAM deny on these reads), a planned follow-up.
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
 * HOW THE CLI IS REACHED does not matter (PR #60 review pass 3). The trigger is a
 * `lambda` word plus a listed subcommand word, whatever the program (`aws`, `$X`, a
 * shell function, `python -m awscli`). A command string handed to `bash -c`,
 * `sh -c`, `powershell -Command`, `pwsh -c`, `cmd /c` or `Invoke-Expression` / `iex`
 * is judged again as a command of its own, and one this hook cannot parse is refused
 * when it mentions `lambda` and a listed subcommand. Any command that names `lambda`
 * and carries a backslash or a `{a,b}` brace expansion outside quotes is refused
 * whole, because the shell rewrites those into words this hook would otherwise
 * misread (`\--query @`, `{--query,@}`, `--deb\ug`, `--{debug,debug}`).
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

/**
 * Whether the command names `lambda` and carries a backslash or a brace expansion
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
  return expanded === null || expanded.some((t) => /lambda/i.test(t));
}

/** Cloud Control reads whose `Properties` carry a Lambda function's Environment. */
const CLOUDCONTROL_READS = ['get-resource', 'list-resources'];

/** Whether text mentions `lambda` and a listed read subcommand, for text this hook cannot parse. */
function mentionsLambdaRead(text) {
  const plain = String(text).replace(/[\\'"`{},]/g, '').toLowerCase();
  if (!/lambda/.test(plain)) return false;
  const subs = [...Object.keys(CONFIG_PREFIX), ...CLOUDCONTROL_READS];
  return subs.some((s) => new RegExp('(^|[^a-z-])' + s + '($|[^a-z-])').test(plain));
}

// Programs that run a command string of their own, and PowerShell's string evaluators.
const SHELL_BIN = /^(bash|sh|zsh|dash|ksh|wsl|cmd|powershell|pwsh)(\.exe)?$/i;
const STRING_EVAL = /^(iex|invoke-expression)$/i;
const MAX_DEPTH = 4;

/** Whether word k expands into arguments the hook cannot see. A quoted "$var" flag value is one word. */
function isExpansion(ws, k) {
  const w = ws[k];
  if (!/[$`]/.test(w.raw) && !/^@\w/.test(w.raw)) return false;
  const prev = ws[k - 1];
  const isFlagValue = prev && /^--/.test(prev.value) && !QUERY_FLAG.test(prev.value);
  return !(SAFE_VAR.test(w.raw) && isFlagValue);
}

/**
 * The lambda read this segment runs, whatever program runs it, as { sub } or
 * { why } when the segment hides the service or subcommand behind an expansion.
 * Null when it is not a lambda read.
 */
function configSubcommand(ws) {
  const lambdaAt = ws.findIndex((w) => w.value.toLowerCase() === 'lambda');
  const subAt = ws.findIndex((w) => Object.prototype.hasOwnProperty.call(CONFIG_PREFIX, w.value.toLowerCase()));
  const expansionAt = ws.findIndex((w, k) => isExpansion(ws, k));
  if (lambdaAt !== -1 && subAt !== -1) return { sub: ws[subAt].value.toLowerCase() };
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
function refusalFor(segment, dialect, depth) {
  const { ws, unterminated } = words(segment, dialect);
  if (unterminated && mentionsLambdaRead(segment)) {
    return 'a quote never closes, so this hook cannot read the words, and the text mentions a lambda read.';
  }

  // A command string run by another shell, or by Invoke-Expression, is a command of its own.
  for (let k = 0; k < ws.length; k += 1) {
    const base = ws[k].value.split(/[\\/]/).pop();
    if (!SHELL_BIN.test(base) && !STRING_EVAL.test(base)) continue;
    const nested = ws.slice(k + 1).map((w) => w.value).join(' ');
    const why = decideText(nested, depth + 1);
    if (why) return 'in the command string passed to ' + base + ': ' + why;
  }

  const cc = cloudControlRefusal(ws);
  if (cc) return cc;

  const found = configSubcommand(ws);
  if (!found) return null;
  if (found.why) return found.why;
  const { sub } = found;

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
    if (isExpansion(ws, k)) {
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

// Programs that execute a heredoc body as code, so the body is judged rather than dropped.
const BODY_RUNNER = /^(bash|sh|zsh|dash|ksh|wsl|cmd|powershell|pwsh|iex|invoke-expression|python[0-9.]*|py|node|perl|ruby|eval|source|\.|xargs|parallel|env|sudo|exec|time|nohup)(\.exe)?$/i;
const HEREDOC_DELIM = /^-?[ \t]*((?:'[^'\n]*'|"[^"\n]*"|\\.|[^\s;&|<>()'"\\])+)/;

/**
 * Bash heredoc bodies are data handed to the command on stdin, not commands, so a doc
 * append (`cat >> notes.md <<'EOF'`) whose text mentions a lambda read must not be judged
 * as one. Returns { text, bodies }: `text` is the command with each body removed (the
 * operator lines and everything after the terminator stay), `bodies` the removed bodies
 * that still need judging. A body is still judged when its command could run it (a shell,
 * an interpreter, eval) or when its delimiter is unquoted and the body holds `$(` or a
 * backtick, since bash runs those substitutions. Anything this cannot read with certainty
 * (an unclosed quote, a `<<` inside `((`, a body with no terminator) returns the text
 * untouched, which is the pre-existing whole-text judgement.
 */
function stripHeredocs(command) {
  const lines = String(command).split('\n');
  const kept = [];
  const bodies = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    kept.push(line);
    i += 1;
    if (walk(line, 'bash', () => {}).unterminated) return { text: command, bodies: [] };
    // The line with every quoted or escaped character masked to '_', the same length as
    // the line, so an index into it is an index into the line.
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
    const hash = mask.search(/(^|\s)#/);
    const code = hash === -1 ? mask : mask.slice(0, hash);
    const ops = [];
    const opRx = /(^|[^<])<<(?!<)/g;
    let m;
    while ((m = opRx.exec(code))) {
      const at = m.index + m[1].length;
      const before = code.slice(0, at);
      if ((before.match(/\(\(/g) || []).length > (before.match(/\)\)/g) || []).length) {
        return { text: command, bodies: [] }; // arithmetic shift, or something this cannot tell from one
      }
      const d = HEREDOC_DELIM.exec(line.slice(at + 2));
      if (!d) return { text: command, bodies: [] };
      const dash = line[at + 2] === '-';
      const rawDelim = d[1];
      ops.push({
        dash,
        quoted: /['"\\]/.test(rawDelim),
        delim: rawDelim.replace(/['"]/g, '').replace(/\\(.)/g, '$1'),
      });
    }
    if (ops.length === 0) continue;
    // Whether anything on the operator line could execute the body: a runner by name (quoted
    // or not, after a pipe, inside a function body), or a command word hidden in an expansion.
    const lineWords = words(hash === -1 ? line : line.slice(0, hash), 'bash').ws;
    const names = lineWords.flatMap((w) => w.value.split(/[;&|(){}]/)).map((v) => v.split(/[\\/]/).pop());
    const firstCommand = lineWords.find((w) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w.value));
    const runs = names.some((v) => BODY_RUNNER.test(v)) || Boolean(firstCommand && /[$`]/.test(firstCommand.raw));
    for (const op of ops) {
      const start = i;
      while (i < lines.length && (op.dash ? lines[i].replace(/^\t+/, '') : lines[i]).replace(/\r$/, '') !== op.delim) i += 1;
      if (i >= lines.length) return { text: command, bodies: [] };
      const body = lines.slice(start, i).join('\n');
      if (runs || (!op.quoted && /\$\(|`/.test(body))) bodies.push(body);
      kept.push(lines[i]); // the terminator line, kept so a command after it is still a segment
      i += 1;
    }
  }
  return { text: kept.join('\n'), bodies };
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
    // PowerShell has no heredoc; only bash text loses its bodies, and a body that runs is judged on its own.
    let text = command;
    if (dialect === 'bash') {
      const stripped = stripHeredocs(command);
      for (const body of stripped.bodies) {
        const why = decideText(body, depth + 1);
        if (why) return 'in a heredoc body that runs: ' + why;
      }
      text = stripped.text;
    }
    const joined = String(text).replace(/[\\`]\r?\n/g, ' ');
    if (rewritesWords(joined, dialect)) {
      return (
        'the command names lambda and carries a backslash or a {a,b} brace expansion outside quotes, ' +
        'which the shell turns into words this hook cannot see (a second --query, or --debug). ' +
        'Write paths with forward slashes or inside quotes.'
      );
    }
    const segs = segments(text);
    // `'...' | iex` hands a string to Invoke-Expression through the pipe: judge every string.
    const evaluates = segs.some((s) => words(s, dialect).ws.some((w) => STRING_EVAL.test(w.value)));
    for (const seg of segs) {
      const why = refusalFor(seg, dialect, depth);
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
  ['allow', "cat >> docs/notes.md <<'EOF'\nThe lambda guard refused C:" + BS + 'repos' + BS + 'x and {a,b}\nEOF'],
  ['allow', 'cat >> "$f" <<-EOF\n\taws lambda list-functions --output json\n\tEOF'],
  ['allow', "cat > a.md <<'A' && cat > b.md <<'B'\naws lambda get-function --function-name f\nA\naws lambda list-functions\nB"],
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
