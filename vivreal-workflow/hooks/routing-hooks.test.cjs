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
const hq = path.join(root, 'vivreal-hq');
// A .git folder marks the scratch root as a clone root, so the VIVREAL_REPOS override is accepted.
fs.mkdirSync(path.join(hq, '.git'), { recursive: true });
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

test('REFUSE: a renderer Studio gate routes to package-publisher (S3)', () => {
  for (const description of ['Studio gate on renderer 1.96.4', 'Gate kit:validate live-view for renderer 1.96.4']) {
    const r = run(
      GUARD,
      { cwd: portal, tool_input: { subagent_type: 'general-purpose', description } },
      { VIVREAL_REPOS: root },
    );
    assert.match(decisionOf(r.stdout).permissionDecisionReason, /^Route this to vivreal-workflow:package-publisher \(renderer Studio gate/, description);
  }
});

test('ALLOW: a Studio product fix is not the Studio gate (S3)', () => {
  const r = run(
    GUARD,
    { cwd: portal, tool_input: { subagent_type: 'general-purpose', description: 'Studio photo retry fix' } },
    { VIVREAL_REPOS: root },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('REFUSE: publishing help or vivreal.io content in vivreal-hq routes to help-page-producer (S5)', () => {
  for (const description of ["Publish 6 help articles' content rows", 'Publish the vivreal.io blog fixes']) {
    const r = run(
      GUARD,
      { cwd: hq, tool_input: { subagent_type: 'general-purpose', description } },
      { VIVREAL_REPOS: root },
    );
    assert.match(decisionOf(r.stdout).permissionDecisionReason, /^Route this to vivreal-content:help-page-producer \(publish help/, description);
  }
});

test('REFUSE: a package publish in vivreal-hq still routes to package-publisher (S5 control)', () => {
  const r = run(
    GUARD,
    { cwd: hq, tool_input: { subagent_type: 'general-purpose', description: 'Publish renderer package 1.96.4' } },
    { VIVREAL_REPOS: root },
  );
  assert.match(decisionOf(r.stdout).permissionDecisionReason, /^Route this to vivreal-workflow:package-publisher/);
});

test('REFUSE: a usability pass routes to regular-user, and a dry run of a data step to coder (S7)', () => {
  const cases = [
    ['Usability pass on the checkout screens', /^Route this to vivreal-product:regular-user/],
    ['Regular-user read of the new sign-up flow', /^Route this to vivreal-product:regular-user/],
    ['Dry-run the archived orders cleanup', /^Route this to vivreal-principal:coder/],
  ];
  for (const [description, expected] of cases) {
    const r = run(
      GUARD,
      { cwd: cms, tool_input: { subagent_type: 'general-purpose', description } },
      { VIVREAL_REPOS: root },
    );
    assert.match(decisionOf(r.stdout).permissionDecisionReason, expected, description);
  }
});

test('ALLOW: "seed" no longer routes; tenant data setup stays on the main thread (S7, Q11)', () => {
  const r = run(
    GUARD,
    { cwd: cms, tool_input: { subagent_type: 'general-purpose', description: 'Seed the QA business with bakery products' } },
    { VIVREAL_REPOS: root },
  );
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('session hook prints nothing outside a Vivreal checkout (control)', () => {
  const r = run(SESSION, { cwd: elsewhere }, { VIVREAL_REPOS: root });
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('session hook prints the portal routes inside the portal', () => {
  const r = run(SESSION, { cwd: portal }, { VIVREAL_REPOS: root, NODE_AUTH_TOKEN: '', CLAUDE_ENV_FILE: '' });
  assert.equal(r.status, 0);
  const lines = r.stdout.trim().split('\n');
  assert.ok(lines.length > 5 && lines.length <= 40, `printed ${lines.length} lines`);
  assert.match(r.stdout, /Vivreal routing for Vivreal_Portal_Mobile/);
  assert.match(r.stdout, /portal code: vivreal-principal:portal-coder \(say the mode/);
  assert.match(r.stdout, /Dispatch template: .*dispatch-template\.md/);
  assert.match(r.stdout, /Owner rules: \$VIVREAL_REPOS\/vivreal-hq\/docs\/standards\/process\.md/);
  assert.match(r.stdout, /Doctor: VIVREAL_REPOS set \(override\), NODE_AUTH_TOKEN MISSING/);
  assert.doesNotMatch(r.stdout, /tutorial-maker/, 'an hq-only route leaked into the portal block');
});

// ---------------------------------------------------------------------------------------------
// Zero configuration: repos-root.cjs derives the clone root, and the session hook exports it to
// Bash through CLAUDE_ENV_FILE only when no override is set (universal-setup research 2.1, 2.2).

// Required lazily, inside each test, so this file still loads at a base commit without it.
const resolveReposRoot = (...args) => require('./repos-root.cjs').resolveReposRoot(...args);
// The exact shell text the session hook must append, written out here rather than imported, so the
// test checks what lands in the file, not what the module declares.
const NPM_FUNCTIONS = [
  'npm() { NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$(gh auth token 2>/dev/null)}" command npm "$@"; }',
  'npx() { NODE_AUTH_TOKEN="${NODE_AUTH_TOKEN:-$(gh auth token 2>/dev/null)}" command npx "$@"; }',
];

function git(cwd, ...args) {
  const res = spawnSync('git', ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', '-c', 'init.defaultBranch=main', ...args], {
    cwd,
    encoding: 'utf8',
  });
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

const real = (p) => fs.realpathSync.native(p);

// A clone root with hq marked as a clone, one real git repo with a commit, a worktree of it under
// _wt/, an _ops/ folder that is not a repo, and a subfolder inside the repo.
const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-clone-root-'));
fs.mkdirSync(path.join(tree, 'vivreal-hq', '.git'), { recursive: true });
const repoDir = path.join(tree, 'VR_CMS_API');
fs.mkdirSync(path.join(repoDir, 'src', 'deep'), { recursive: true });
git(repoDir, 'init', '-q');
git(repoDir, 'commit', '-q', '--allow-empty', '-m', 'probe');
const wtDir = path.join(tree, '_wt', 'cms-probe');
git(repoDir, 'worktree', 'add', '-q', '--detach', wtDir);
const opsDir = path.join(tree, '_ops', 'one-shot');
fs.mkdirSync(opsDir, { recursive: true });
// A folder with no clone root anywhere above it.
const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-no-root-'));
test.after(() => {
  fs.rmSync(tree, { recursive: true, force: true });
  fs.rmSync(outside, { recursive: true, force: true });
});

const noOverride = () => {
  const env = { ...process.env };
  delete env.VIVREAL_REPOS;
  return env;
};

test('ALLOW: the clone root is derived from a main checkout, a subfolder, a _wt worktree and a non-git _ops folder', () => {
  for (const start of [repoDir, path.join(repoDir, 'src', 'deep'), wtDir, opsDir]) {
    const r = resolveReposRoot({ env: noOverride(), starts: [start] });
    assert.ok(r.root, `no root from ${start}: ${r.reason}`);
    assert.equal(real(r.root), real(tree), `wrong root from ${start}`);
    assert.match(r.source, /^derived from /);
    assert.doesNotMatch(r.root, /\\/, 'the root must use forward slashes');
  }
});

test('REFUSE: no clone root above the start gives null and a reason, never a guess', () => {
  const r = resolveReposRoot({ env: noOverride(), starts: [outside] });
  assert.equal(r.root, null);
  assert.match(r.reason, /VIVREAL_REPOS is not set, and no folder holding a vivreal-hq clone was found/);
});

test('ALLOW: a valid VIVREAL_REPOS override wins over derivation', () => {
  const r = resolveReposRoot({ env: { ...noOverride(), VIVREAL_REPOS: tree }, starts: [outside] });
  assert.equal(real(r.root), real(tree));
  assert.equal(r.source, 'VIVREAL_REPOS');
});

test('REFUSE: an override that holds no vivreal-hq clone, or is relative, is rejected and derivation runs', () => {
  for (const bad of [outside, 'repos']) {
    const r = resolveReposRoot({ env: { ...noOverride(), VIVREAL_REPOS: bad }, starts: [repoDir] });
    assert.match(r.rejected, /VIVREAL_REPOS is set but is not an absolute folder holding a vivreal-hq clone/);
    assert.equal(real(r.root), real(tree), `derivation did not run for override ${bad}`);
  }
});

function runSession(cwd, overrides) {
  const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vr-envfile-')), 'env.sh');
  fs.writeFileSync(envFile, '');
  const env = noOverride();
  delete env.NODE_AUTH_TOKEN;
  delete env.CLAUDE_PROJECT_DIR;
  Object.assign(env, { CLAUDE_ENV_FILE: envFile }, overrides);
  const res = spawnSync(process.execPath, [SESSION], { input: JSON.stringify({ cwd }), encoding: 'utf8', env });
  const lines = fs.readFileSync(envFile, 'utf8').split('\n').filter(Boolean);
  fs.rmSync(path.dirname(envFile), { recursive: true, force: true });
  return { status: res.status, stdout: res.stdout, lines };
}

test('session hook with no overrides appends exactly the derived export and the two npm functions', () => {
  const r = runSession(repoDir, {});
  assert.equal(r.status, 0);
  assert.equal(r.lines.length, 3, `appended ${JSON.stringify(r.lines)}`);
  const m = r.lines[0].match(/^export VIVREAL_REPOS='([^']+)'$/);
  assert.ok(m, `first line is not the export: ${r.lines[0]}`);
  assert.equal(real(m[1]), real(tree));
  assert.deepEqual(r.lines.slice(1), NPM_FUNCTIONS);
  assert.match(r.stdout, /Vivreal routing for VR_CMS_API/);
  assert.match(r.stdout, /Doctor: VIVREAL_REPOS derived \(derived from .*\), exported to Bash, NODE_AUTH_TOKEN from gh auth token, per npm call in Bash/);
});

test('session hook: a set VIVREAL_REPOS suppresses the export, a set NODE_AUTH_TOKEN suppresses the functions', () => {
  const both = runSession(repoDir, { VIVREAL_REPOS: tree, NODE_AUTH_TOKEN: 'set-by-test' });
  assert.deepEqual(both.lines, [], `appended ${JSON.stringify(both.lines)}`);
  assert.match(both.stdout, /Doctor: VIVREAL_REPOS set \(override\), NODE_AUTH_TOKEN set \(override\)/);
  const reposOnly = runSession(repoDir, { VIVREAL_REPOS: tree });
  assert.deepEqual(reposOnly.lines, NPM_FUNCTIONS);
  assert.ok(!reposOnly.lines.some((l) => l.startsWith('export VIVREAL_REPOS')), 'an override was replaced');
});

test('session hook outside any Vivreal checkout writes nothing to CLAUDE_ENV_FILE (control)', () => {
  const r = runSession(outside, {});
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(r.lines, []);
});

test('the npm functions read the token at call time and never print it', () => {
  for (const fn of NPM_FUNCTIONS) {
    assert.match(fn, /^np[mx]\(\) \{ NODE_AUTH_TOKEN="\$\{NODE_AUTH_TOKEN:-\$\(gh auth token 2>\/dev\/null\)\}" command np[mx] "\$@"; \}$/);
    assert.doesNotMatch(fn, /echo|printf/);
  }
});

test('repos-root.cjs copies in vivreal-workflow and vivreal-db-explorer are byte-identical', () => {
  const here = fs.readFileSync(path.join(__dirname, 'repos-root.cjs'));
  const there = fs.readFileSync(path.join(__dirname, '..', '..', 'vivreal-db-explorer', 'scripts', 'repos-root.cjs'));
  assert.ok(here.length > 0);
  assert.ok(here.equals(there), 'the two repos-root.cjs copies differ; copy the workflow one over the other');
});
