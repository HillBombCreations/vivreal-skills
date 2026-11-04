// SessionStart: inside a Vivreal checkout, print who owns which task in this repo, where the
// dispatch template and the owner rules live, and a names-only doctor line. Elsewhere it prints
// nothing. Never blocks: always exits 0.
//
// Zero configuration: when Claude Code offers CLAUDE_ENV_FILE, this hook appends, for the Bash
// commands of the session (subagents included):
//   - `export VIVREAL_REPOS='<root>'`, derived by repos-root.cjs (vendored byte-identical from
//     vivreal-hq), only when VIVREAL_REPOS is NOT already set (a set value is the user's override;
//     a wrong one is refused and reported, never replaced);
//   - `npm` and `npx` shell functions, always, that run them through npm-token.cjs. It gives the
//     shared read-only packages token (from AWS, with the user's own sign-in) only to install and
//     read commands, the write token only to `npm publish`, and strips NODE_AUTH_TOKEN from every
//     other command, a caller's own included (owners, 2026-11-04). This hook writes no token: the
//     env file holds only the function text. The wrapper never prints a token or writes one to a
//     file; the npm child that receives one, and its install scripts, can read their environment.
// PowerShell commands get none of this (Claude Code passes them no path-valued variable and no
// functions), so agents use the Bash tool for repo work.
const fs = require('fs');
const path = require('path');
const { loadRoutes, vivrealRepoOf, routesFor, TEMPLATE_PATH } = require('./routes-lib.cjs');
const { resolveReposRoot } = require('./repos-root.cjs');

const MAX_LINES = 40;

/** Forward slashes, so the value reads the same in Git Bash, on macOS and on Linux. */
function forwardSlashes(p) {
  return String(p).split(path.sep).join('/');
}

/** POSIX single-quote a value for an `export` line. */
function shQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

// Shell text, appended verbatim: npm and npx run through the token wrapper beside this file.
const WRAPPER = path.join(__dirname, 'npm-token.cjs').split(path.sep).join('/');
const NPM_FUNCTIONS = ['npm', 'npx'].map((tool) => `${tool}() { node ${shQuote(WRAPPER)} ${tool} "$@"; }`);

/** The lines this session should append to CLAUDE_ENV_FILE; empty when nothing is needed. */
function envFileLines(env, resolved) {
  const lines = [];
  if (!env.VIVREAL_REPOS && resolved.root) lines.push(`export VIVREAL_REPOS=${shQuote(forwardSlashes(resolved.root))}`);
  lines.push(...NPM_FUNCTIONS);
  return lines;
}

function doctorLine(env, resolved, exported) {
  let repos;
  if (env.VIVREAL_REPOS) {
    repos = resolved.root ? 'set (override)' : `set but REFUSED (${resolved.reason})`;
  } else if (resolved.root) {
    repos = `derived from ${forwardSlashes(resolved.from)}${exported ? ', exported to Bash' : ''}`;
  } else {
    repos = 'NOT FOUND (open the session inside a Vivreal clone)';
  }
  let token;
  const scope = 'install and read commands only, publish gets the write token, others none';
  if (!exported) token = 'MISSING (no CLAUDE_ENV_FILE this session)';
  else if (env.NODE_AUTH_TOKEN) token = `set (override; ${scope})`;
  else token = `read-only packages token from AWS per npm call in Bash (${scope})`;
  return `Doctor: VIVREAL_REPOS ${repos}, NODE_AUTH_TOKEN ${token}`;
}

function main() {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    data = {};
  }
  const env = process.env;
  const cwd = data.cwd || process.cwd();
  const repo = vivrealRepoOf(cwd, env);
  if (!repo) return;

  const resolved = resolveReposRoot({ env, starts: [cwd] });
  let exported = false;
  if (env.CLAUDE_ENV_FILE) {
    const lines = envFileLines(env, resolved);
    if (lines.length) {
      try {
        fs.appendFileSync(env.CLAUDE_ENV_FILE, lines.join('\n') + '\n');
        exported = true;
      } catch {
        exported = false;
      }
    }
  }

  const rows = routesFor(loadRoutes(), repo);
  const tail = [
    `Dispatch template: ${TEMPLATE_PATH}`,
    'Owner rules: $VIVREAL_REPOS/vivreal-hq/docs/standards/process.md',
    doctorLine(env, resolved, exported),
  ];
  const head = [`Vivreal routing for ${repo} (dispatch the owner, general-purpose only when none fits):`];
  const room = MAX_LINES - head.length - tail.length;
  const body = rows.slice(0, room).map((r) => `- ${r.task}: ${r.agent}${r.note ? ` (${r.note})` : ''}`);
  process.stdout.write([...head, ...body, ...tail].join('\n') + '\n');
}

if (require.main === module) {
  try {
    main();
  } catch {
    /* fail open: a routing hint is never worth a broken session */
  }
  process.exit(0);
}

module.exports = { envFileLines, shQuote, NPM_FUNCTIONS };
