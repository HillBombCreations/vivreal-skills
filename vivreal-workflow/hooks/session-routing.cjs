// SessionStart: inside a Vivreal checkout, print who owns which task in this repo, where the
// dispatch template and the owner rules live, and a names-only doctor line. Elsewhere it prints
// nothing. Never blocks: always exits 0.
const fs = require('fs');
const { loadRoutes, vivrealRepoOf, routesFor, TEMPLATE_PATH } = require('./routes-lib.cjs');

const MAX_LINES = 40;

try {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    data = {};
  }
  const cwd = data.cwd || process.cwd();
  const repo = vivrealRepoOf(cwd);
  if (!repo) process.exit(0);

  const rows = routesFor(loadRoutes(), repo);
  const has = (k) => (process.env[k] ? 'set' : 'MISSING');
  const tail = [
    `Dispatch template: ${TEMPLATE_PATH}`,
    'Owner rules: $VIVREAL_REPOS/vivreal-hq/docs/standards/process.md',
    `Doctor: VIVREAL_REPOS ${has('VIVREAL_REPOS')}, NODE_AUTH_TOKEN ${has('NODE_AUTH_TOKEN')}`,
  ];
  const head = [`Vivreal routing for ${repo} (dispatch the owner, general-purpose only when none fits):`];
  const room = MAX_LINES - head.length - tail.length;
  const body = rows.slice(0, room).map((r) => `- ${r.task}: ${r.agent}${r.note ? ` (${r.note})` : ''}`);
  process.stdout.write([...head, ...body, ...tail].join('\n') + '\n');
} catch {
  /* fail open: a routing hint is never worth a broken session */
}
process.exit(0);
