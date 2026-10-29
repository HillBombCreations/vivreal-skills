// Run: node --test vivreal-workflow/hooks/routing-hooks.test.cjs
// REFUSE and ALLOW controls for dispatch-guard.cjs, and the inside/outside controls for
// session-routing.cjs. Each spawns the real hook with a real stdin payload.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const GUARD = path.join(__dirname, 'dispatch-guard.cjs');
const SESSION = path.join(__dirname, 'session-routing.cjs');

function run(hook, payload, env) {
  const res = spawnSync(process.execPath, [hook], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
  return { status: res.status, stdout: res.stdout };
}

// A scratch root with no git, so the repo is decided by VIVREAL_REPOS alone.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-routes-'));
const portal = path.join(root, 'Vivreal_Portal_Mobile');
fs.mkdirSync(portal, { recursive: true });
const cms = path.join(root, 'VR_CMS_API');
fs.mkdirSync(cms, { recursive: true });
const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'not-vivreal-'));
test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(elsewhere, { recursive: true, force: true });
});

function decisionOf(stdout) {
  assert.ok(stdout.length > 0, 'the guard printed nothing, so it did not deny');
  const out = JSON.parse(stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  return out;
}

test('REFUSE: a general-purpose "Fix ..." dispatch in a Vivreal repo is denied with the coder route', () => {
  const r = run(
    GUARD,
    { cwd: cms, tool_name: 'Agent', tool_input: { subagent_type: 'general-purpose', description: 'Fix the route' } },
    { VIVREAL_REPOS: root },
  );
  assert.equal(r.status, 0);
  const out = decisionOf(r.stdout);
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /^Route this to vivreal-principal:coder \(code in any repo except the portal\)\./);
  assert.match(out.permissionDecisionReason, /starting "\[gp\]"/);
});

test('REFUSE: a dispatch with no subagent_type is treated as general-purpose', () => {
  const r = run(GUARD, { cwd: cms, tool_input: { description: 'Review this diff' } }, { VIVREAL_REPOS: root });
  assert.match(decisionOf(r.stdout).permissionDecisionReason, /vivreal-principal:reviewer/);
});

test('REFUSE in the portal names portal-coder, not coder', () => {
  const r = run(
    GUARD,
    { cwd: portal, tool_input: { subagent_type: 'general-purpose', description: 'Fix the sidebar' } },
    { VIVREAL_REPOS: root },
  );
  assert.match(decisionOf(r.stdout).permissionDecisionReason, /^Route this to vivreal-principal:portal-coder/);
});

test('ALLOW: a named coder dispatch passes untouched', () => {
  const r = run(
    GUARD,
    { cwd: cms, tool_input: { subagent_type: 'vivreal-principal:coder', description: 'Fix the route' } },
    { VIVREAL_REPOS: root },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('ALLOW: a "[gp]" general-purpose dispatch passes', () => {
  const r = run(
    GUARD,
    { cwd: cms, tool_input: { subagent_type: 'general-purpose', description: '[gp] Fix the route' } },
    { VIVREAL_REPOS: root },
  );
  assert.equal(r.stdout, '');
});

test('ALLOW: a general-purpose dispatch with no routed first word passes', () => {
  const r = run(
    GUARD,
    { cwd: cms, tool_input: { subagent_type: 'general-purpose', description: 'Summarise the thread' } },
    { VIVREAL_REPOS: root },
  );
  assert.equal(r.stdout, '');
});

test('ALLOW: outside a Vivreal repo the guard stays silent on a routed first word', () => {
  // The plugin installs at user scope, so this hook fires in every repo on the machine.
  // DC2 scopes routing to Vivreal checkouts; the same "Fix ..." the REFUSE case denies must pass here.
  for (const description of ['Fix the route', 'Explain the failing test', 'Review this diff']) {
    const r = run(
      GUARD,
      { cwd: elsewhere, tool_input: { subagent_type: 'general-purpose', description } },
      { VIVREAL_REPOS: root },
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', `denied "${description}" outside Vivreal`);
  }
});

test('REFUSE: a keyword with a digit (ga4) routes', () => {
  const r = run(
    GUARD,
    { cwd: cms, tool_input: { subagent_type: 'general-purpose', description: 'GA4 numbers for last week' } },
    { VIVREAL_REPOS: root },
  );
  assert.match(decisionOf(r.stdout).permissionDecisionReason, /^Route this to vivreal-growth-analytics:growth/);
});

test('REFUSE: a dispatch on the legacy Task tool name is still judged', () => {
  const r = run(
    GUARD,
    { cwd: cms, tool_name: 'Task', tool_input: { subagent_type: 'general-purpose', description: 'Fix the route' } },
    { VIVREAL_REPOS: root },
  );
  assert.equal(decisionOf(r.stdout).permissionDecision, 'deny');
});

test('ALLOW: publishing site content is not a package publish', () => {
  for (const description of [
    'Publish the site content corrections',
    'Publish the help page edits to help.vivreal.io',
    'Publish the conversion page',
    'Publish the conversion tracking page',
    'Publish the new version of the help page',
    'Publish the spinner fix on the help page',
  ]) {
    const r = run(
      GUARD,
      { cwd: cms, tool_input: { subagent_type: 'general-purpose', description } },
      { VIVREAL_REPOS: root },
    );
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '', `routed "${description}" to a package route`);
  }
});

test('REFUSE: publishing a package still routes to package-publisher', () => {
  for (const description of [
    'publish @hillbombcreations/schemas',
    'bump the package version',
    'Publish the new package version',
    'Bump the renderer pin',
    'Publish the npm packages',
  ]) {
    const r = run(
      GUARD,
      { cwd: cms, tool_input: { subagent_type: 'general-purpose', description } },
      { VIVREAL_REPOS: root },
    );
    assert.match(decisionOf(r.stdout).permissionDecisionReason, /^Route this to vivreal-workflow:package-publisher/, description);
  }
});

test('session hook prints nothing outside a Vivreal checkout (control)', () => {
  const r = run(SESSION, { cwd: elsewhere }, { VIVREAL_REPOS: root });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('session hook prints the portal routes inside the portal', () => {
  const r = run(SESSION, { cwd: portal }, { VIVREAL_REPOS: root, NODE_AUTH_TOKEN: '' });
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split('\n');
  assert.ok(lines.length > 5 && lines.length <= 40, `printed ${lines.length} lines`);
  assert.match(r.stdout, /Vivreal routing for Vivreal_Portal_Mobile/);
  assert.match(r.stdout, /portal code: vivreal-principal:portal-coder \(say the mode/);
  assert.match(r.stdout, /Dispatch template: .*dispatch-template\.md/);
  assert.match(r.stdout, /Owner rules: \$VIVREAL_REPOS\/vivreal-hq\/docs\/standards\/process\.md/);
  assert.match(r.stdout, /Doctor: VIVREAL_REPOS set, NODE_AUTH_TOKEN MISSING/);
  assert.doesNotMatch(r.stdout, /tutorial-maker/, 'an hq-only route leaked into the portal block');
});
