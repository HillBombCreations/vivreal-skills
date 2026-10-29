// PreToolUse on the subagent tool. hooks.json matches `Agent|Task`: `Agent` is the tool's
// current name, and `Task` is its name on older Claude Code clients, kept so the guard still
// fires there. Inside a Vivreal checkout only (DC2, the same scope the session hook uses), a
// general-purpose dispatch whose description starts with a routed keyword is denied with the
// owning agent named. A description starting "[gp]" passes, as does every named subagent_type.
// The plugin installs at user scope, so outside Vivreal it stays silent. Fails open on any error.
const fs = require('fs');
const { loadRoutes, vivrealRepoOf, routeForWord } = require('./routes-lib.cjs');

try {
  const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const ti = data.tool_input || {};
  const type = String(ti.subagent_type || '').trim();
  if (type && type !== 'general-purpose') process.exit(0);
  const desc = String(ti.description || '').trim();
  if (/^\[gp\]/i.test(desc)) process.exit(0);
  const repo = vivrealRepoOf(data.cwd || process.cwd());
  if (!repo) process.exit(0);
  // Letters, digits and hyphens, the keyword shape check-definitions R13 enforces ("ga4").
  const first = (desc.match(/^[A-Za-z][A-Za-z0-9-]*/) || [''])[0];
  const route = routeForWord(loadRoutes(), first, repo, desc);
  if (!route) process.exit(0);
  const reason =
    `Route this to ${route.agent} (${route.task}). ` +
    'If no Vivreal agent owns it, re-dispatch with the description starting "[gp]".';
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason },
    }),
  );
} catch {
  /* fail open: the guard is advice with teeth, never a reason a dispatch cannot run */
}
process.exit(0);
