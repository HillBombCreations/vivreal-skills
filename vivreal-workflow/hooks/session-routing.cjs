// SessionStart: inside a Vivreal checkout, print who owns which task in this repo, where the
// dispatch template and the owner rules live, and a names-only doctor line. Elsewhere it prints
// nothing. Never blocks: always exits 0.
//
// Zero configuration: when Claude Code offers CLAUDE_ENV_FILE, this hook appends, for the Bash
// commands of the session (subagents included):
//   - `export VIVREAL_REPOS='<root>'`, derived by repos-root.cjs, only when VIVREAL_REPOS is NOT
//     already set (a set value is the user's override and is never replaced);
//   - `npm` and `npx` shell functions that hand npm a NODE_AUTH_TOKEN read from `gh auth token` at
//     the moment npm runs, only when NODE_AUTH_TOKEN is NOT already set. The token is never written
//     to disk, never printed, and lives only in that npm process's environment.
// PowerShell commands get none of this (Claude Code passes them no path-valued variable and no
// functions), so agents use the Bash tool for repo work.
const fs = require('fs');
const { loadRoutes, vivrealRepoOf, routesFor, TEMPLATE_PATH } = require('./routes-lib.cjs');
const { resolveReposRoot } = require('./repos-root.cjs');

const MAX_LINES = 40;

// Shell text, appended verbatim. ${NODE_AUTH_TOKEN:-...} keeps a token the user set themselves.
const NPM_FUNCTIONS = [
  'npm() { NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$(gh auth token 2>/dev/null)}" command npm "$@"; }',
  'npx() { NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$(gh auth token 2>/dev/null)}" command npx "$@"; }',
];

/** POSIX single-quote a value for an `export` line. */
function shQuote(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}

/** The lines this session should append to CLAUDE_ENV_FILE; empty when nothing is needed. */
function envFileLines(env, resolved) {
  const lines = [];
  if (!env.VIVREAL_REPOS && resolved.root) lines.push(`export VIVREAL_REPOS=${shQuote(resolved.root)}`);
  if (!env.NODE_AUTH_TOKEN) lines.push(...NPM_FUNCTIONS);
  return lines;
}

function doctorLine(env, resolved, exported) {
  let repos;
  if (env.VIVREAL_REPOS) {
    repos = resolved.rejected ? `set but REJECTED (${resolved.rejected})` : 'set (override)';
  } else if (resolved.root) {
    repos = `derived (${resolved.source})${exported ? ', exported to Bash' : ''}`;
  } else {
    repos = 'NOT FOUND (open the session inside a Vivreal clone)';
  }
  let token;
  if (env.NODE_AUTH_TOKEN) token = 'set (override)';
  else token = exported ? 'from gh auth token, per npm call in Bash' : 'MISSING (no CLAUDE_ENV_FILE this session)';
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

  const resolved = resolveReposRoot({ env, starts: [cwd, env.CLAUDE_PROJECT_DIR] });
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
