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
// npm and npx run through the token wrapper beside the hook (owners, 2026-11-04: one shared read-only
// packages token from AWS, never `gh auth token`).
const WRAPPER = path.join(__dirname, 'npm-token.cjs');
const WRAPPER_FWD = WRAPPER.split(path.sep).join('/');
const NPM_FUNCTIONS = [
  `npm() { node '${WRAPPER_FWD}' npm "$@"; }`,
  `npx() { node '${WRAPPER_FWD}' npx "$@"; }`,
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
// A real Vivreal checkout names its origin, which is how the hooks recognise it with no root at all.
git(repoDir, 'remote', 'add', 'origin', 'https://github.com/HillBombCreations/VR_CMS_API.git');
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
    const r = resolveReposRoot({ env: noOverride(), starts: [start], cwd: outside });
    assert.ok(r.root, `no root from ${start}: ${r.reason}`);
    assert.equal(real(r.root), real(tree), `wrong root from ${start}`);
    assert.ok(r.source === 'git' || r.source === 'ancestor', `source ${r.source}`);
    assert.equal(real(r.from), real(start));
  }
});

test('REFUSE: no clone root above the start gives null and a reason, never a guess', () => {
  const r = resolveReposRoot({ env: noOverride(), starts: [outside], cwd: outside });
  assert.equal(r.root, null);
  assert.match(r.reason, /no folder holding a vivreal-hq clone was found from /);
});

test('ALLOW: a valid VIVREAL_REPOS override wins over derivation', () => {
  const r = resolveReposRoot({ env: { ...noOverride(), VIVREAL_REPOS: tree }, starts: [outside], cwd: outside });
  assert.equal(real(r.root), real(tree));
  assert.equal(r.source, 'VIVREAL_REPOS');
});

test('REFUSE: a wrong VIVREAL_REPOS is refused loudly, never replaced by a derived root (hq policy)', () => {
  const cases = [
    [outside, /VIVREAL_REPOS \(.+\) holds no vivreal-hq clone; unset it to derive the folder/],
    ['repos', /VIVREAL_REPOS is set to a relative path \(repos\)/],
  ];
  for (const [bad, reason] of cases) {
    // repoDir would derive a root, so a non-null root here would mean the override was replaced.
    const r = resolveReposRoot({ env: { ...noOverride(), VIVREAL_REPOS: bad }, starts: [repoDir], cwd: repoDir });
    assert.equal(r.root, null, `override ${bad} was replaced by ${r.root}`);
    assert.match(r.reason, reason);
  }
});

test('session hook: a wrong VIVREAL_REPOS is reported as refused, and no export replaces it', () => {
  const r = runSession(repoDir, { VIVREAL_REPOS: outside });
  assert.match(r.stdout, /Doctor: VIVREAL_REPOS set but REFUSED \(VIVREAL_REPOS \(.+\) holds no vivreal-hq clone/);
  assert.ok(!r.lines.some((l) => l.startsWith('export VIVREAL_REPOS')), 'a refused override was replaced');
});

function runSession(cwd, overrides) {
  const envFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'vr-envfile-')), 'env.sh');
  fs.writeFileSync(envFile, '');
  const env = noOverride();
  delete env.NODE_AUTH_TOKEN;
  delete env.CLAUDE_PROJECT_DIR;
  Object.assign(env, { CLAUDE_ENV_FILE: envFile }, overrides);
  const res = spawnSync(process.execPath, [SESSION], { cwd, input: JSON.stringify({ cwd }), encoding: 'utf8', env });
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
  assert.match(r.stdout, /Doctor: VIVREAL_REPOS derived from .*, exported to Bash, NODE_AUTH_TOKEN read-only packages token from AWS per npm call in Bash \(install and read commands only, publish gets the write token, others none\)/);
});

test('session hook: a set VIVREAL_REPOS suppresses the export; the npm functions are written even with a token set, so builds are stripped', () => {
  const both = runSession(repoDir, { VIVREAL_REPOS: tree, NODE_AUTH_TOKEN: 'set-by-test' });
  assert.deepEqual(both.lines, NPM_FUNCTIONS, `appended ${JSON.stringify(both.lines)}`);
  assert.match(both.stdout, /Doctor: VIVREAL_REPOS set \(override\), NODE_AUTH_TOKEN set \(override; install and read commands only/);
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

test('REFUSE: no line the session hook writes uses gh auth token (owners, 2026-11-04)', () => {
  const r = runSession(repoDir, {});
  assert.ok(r.lines.length > 0, 'the hook wrote nothing, so this check saw nothing');
  for (const line of r.lines) assert.doesNotMatch(line, /gh auth token/, `a gh token path survives: ${line}`);
  for (const fn of NPM_FUNCTIONS) assert.doesNotMatch(fn, /echo|printf|NODE_AUTH_TOKEN/);
});

// ---------------------------------------------------------------------------------------------
// npm-token.cjs: NODE_AUTH_TOKEN from the env override, else the shared read-only packages token
// in AWS (name from private-names.json key packagesTokenSecret), else a message naming the missing
// part. A fake `aws` and a fake `npm`/`npx` first on PATH record what each was handed.

const TOKEN = 'ghp_FAKE' + 'packages0token0for0tests';
const WRITE_TOKEN = 'ghp_FAKE' + 'write0token0for0tests';
const SECRET_NAME = 'example/packages-token';
const WRITE_SECRET_NAME = 'example/packages-write-token';
const NAMES = { packagesTokenSecret: SECRET_NAME, packagesWriteTokenSecret: WRITE_SECRET_NAME };
const isWin = process.platform === 'win32';
const fake = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-npm-token-'));
const fakeBin = path.join(fake, 'bin');
fs.mkdirSync(path.join(fakeBin, 'node_modules', 'npm', 'bin'), { recursive: true });
test.after(() => fs.rmSync(fake, { recursive: true, force: true }));
fs.writeFileSync(
  path.join(fakeBin, 'fake-aws.js'),
  [
    "const fs = require('fs');",
    "fs.appendFileSync(process.env.FAKE_AWS_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');",
    "const mode = process.env.FAKE_AWS_MODE || 'ok';",
    "if (mode === 'notfound') { process.stderr.write('An error occurred (ResourceNotFoundException) when calling the GetSecretValue operation'); process.exit(254); }",
    "if (mode === 'nocreds') { process.stderr.write('Unable to locate credentials. You can configure credentials by running \"aws configure\".'); process.exit(253); }",
    "if (mode === 'nokey') { process.stdout.write(JSON.stringify({ OTHER: 'x' })); process.exit(0); }",
    "const id = process.argv[process.argv.indexOf('--secret-id') + 1];",
    "process.stdout.write(JSON.stringify({ NODE_AUTH_TOKEN: id === process.env.FAKE_WRITE_ID ? process.env.FAKE_WRITE_TOKEN : process.env.FAKE_TOKEN }));",
  ].join('\n'),
);
const FAKE_TOOL = [
  "const fs = require('fs');",
  "const argv = process.argv.slice(2);",
  "if (argv[0] === 'pack' && argv.includes('--pack-destination')) {",
  "  const dest = argv[argv.indexOf('--pack-destination') + 1];",
  "  fs.mkdirSync(dest, { recursive: true });",
  "  fs.writeFileSync(require('path').join(dest, 'vr-token-probe-1.0.0.tgz'), 'fake tarball');",
  "}",
  "fs.appendFileSync(process.env.FAKE_NPM_LOG + '.all', JSON.stringify({ args: argv, hasToken: Boolean(process.env.NODE_AUTH_TOKEN) }) + '\\n');",
  "fs.writeFileSync(process.env.FAKE_NPM_LOG, JSON.stringify({",
  "  tool: process.env.FAKE_TOOL_NAME || 'unknown',",
  "  args: process.argv.slice(2),",
  "  hasToken: Boolean(process.env.NODE_AUTH_TOKEN),",
  "  tokenMatches: process.env.NODE_AUTH_TOKEN === process.env.FAKE_TOKEN || process.env.NODE_AUTH_TOKEN === process.env.FAKE_OVERRIDE,",
  "  which: !process.env.NODE_AUTH_TOKEN ? 'none' : process.env.NODE_AUTH_TOKEN === process.env.FAKE_TOKEN ? 'read'",
  "    : process.env.NODE_AUTH_TOKEN === process.env.FAKE_WRITE_TOKEN ? 'write'",
  "    : process.env.NODE_AUTH_TOKEN === process.env.FAKE_OVERRIDE ? 'override' : 'other',",
  "}));",
  "process.stdout.write('fake tool ran\\n');",
  "process.exit(Number(process.env.FAKE_TOOL_EXIT || 0));",
].join('\n');
for (const tool of ['npm', 'npx']) {
  const cli = path.join(fakeBin, 'node_modules', 'npm', 'bin', `${tool}-cli.js`);
  fs.writeFileSync(cli, FAKE_TOOL.replace("process.env.FAKE_TOOL_NAME || 'unknown'", `'${tool}'`));
  if (isWin) {
    // The wrapper runs the CLI script beside npm.cmd with node, so the .cmd only has to exist.
    fs.writeFileSync(path.join(fakeBin, `${tool}.cmd`), `@"${process.execPath}" "%~dp0node_modules\\npm\\bin\\${tool}-cli.js" %*\r\n`);
  } else {
    fs.writeFileSync(path.join(fakeBin, tool), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/node_modules/npm/bin/${tool}-cli.js" "$@"\n`);
    fs.chmodSync(path.join(fakeBin, tool), 0o755);
  }
}
// The fake aws in two places: beside the fake npm and npx, and alone, so a test can run REAL npm.
const awsOnlyBin = path.join(fake, 'aws-only');
fs.mkdirSync(awsOnlyBin, { recursive: true });
fs.copyFileSync(path.join(fakeBin, 'fake-aws.js'), path.join(awsOnlyBin, 'fake-aws.js'));
for (const dir of [fakeBin, awsOnlyBin]) {
  if (isWin) {
    fs.writeFileSync(path.join(dir, 'aws.cmd'), `@"${process.execPath}" "%~dp0fake-aws.js" %*\r\n`);
  } else {
    fs.writeFileSync(path.join(dir, 'aws'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/fake-aws.js" "$@"\n`);
    fs.chmodSync(path.join(dir, 'aws'), 0o755);
  }
}

let tokenRuns = 0;
/**
 * A clone root whose private names file carries `names` (none when `names` is null), and a package
 * folder in it with `pkg` as its package.json.
 */
function tokenRoot(names, pkg = { name: 'vr-token-probe', version: '1.0.0' }) {
  tokenRuns += 1;
  const r = path.join(fake, `root-${tokenRuns}`);
  fs.mkdirSync(path.join(r, 'vivreal-hq', '.git'), { recursive: true });
  fs.mkdirSync(path.join(r, 'VR_CMS_API'), { recursive: true });
  fs.writeFileSync(path.join(r, 'VR_CMS_API', 'package.json'), JSON.stringify(pkg, null, 2));
  if (names) {
    fs.mkdirSync(path.join(r, 'vivreal-hq', '.vivreal'), { recursive: true });
    fs.writeFileSync(path.join(r, 'vivreal-hq', '.vivreal', 'private-names.json'), JSON.stringify(names));
  }
  return path.join(r, 'VR_CMS_API');
}

function runWrapper(cwd, tool, args, extraEnv = {}, bin = fakeBin) {
  tokenRuns += 1;
  const awsLog = path.join(fake, `aws-${tokenRuns}.log`);
  const npmLog = path.join(fake, `npm-${tokenRuns}.json`);
  const env = { ...process.env, FAKE_AWS_LOG: awsLog, FAKE_NPM_LOG: npmLog, FAKE_TOKEN: TOKEN, FAKE_WRITE_TOKEN: WRITE_TOKEN, FAKE_WRITE_ID: WRITE_SECRET_NAME };
  for (const k of ['VIVREAL_REPOS', 'NODE_AUTH_TOKEN', 'CLAUDE_PROJECT_DIR', 'FAKE_AWS_MODE', 'FAKE_OVERRIDE', 'FAKE_TOOL_EXIT']) delete env[k];
  Object.assign(env, extraEnv);
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = bin + path.delimiter + (env[pathKey] || '');
  const res = spawnSync(process.execPath, [WRAPPER, tool, ...args], { cwd, env, encoding: 'utf8', timeout: 60000 });
  const awsCalls = fs.existsSync(awsLog)
    ? fs.readFileSync(awsLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const child = fs.existsSync(npmLog) ? JSON.parse(fs.readFileSync(npmLog, 'utf8')) : null;
  const calls = fs.existsSync(npmLog + '.all')
    ? fs.readFileSync(npmLog + '.all', 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', awsCalls, child, calls };
}

const neverLeaks = (r) => {
  for (const t of [TOKEN, WRITE_TOKEN]) {
    assert.ok(!r.stdout.includes(t), 'a token reached stdout');
    assert.ok(!r.stderr.includes(t), 'a token reached stderr');
    assert.ok(!(r.child && r.child.args.some((a) => a.includes(t))), 'a token reached argv');
  }
};

test('ALLOW: the shared token reaches only the npm child env, never stdout, stderr or argv', () => {
  const r = runWrapper(tokenRoot(NAMES), 'npm', ['ci', '--arg with space']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(r.child, `the fake npm never ran: ${r.stderr}`);
  assert.equal(r.child.tool, 'npm');
  assert.deepEqual(r.child.args, ['ci', '--arg with space']);
  assert.equal(r.child.hasToken, true);
  assert.equal(r.child.tokenMatches, true);
  assert.deepEqual(r.awsCalls, [['secretsmanager', 'get-secret-value', '--secret-id', SECRET_NAME, '--query', 'SecretString', '--output', 'text']]);
  assert.equal(r.stderr, '');
  neverLeaks(r);
});

test('ALLOW: npx naming @hillbombcreations/ gets the read token', () => {
  const r = runWrapper(tokenRoot(NAMES), 'npx', ['@hillbombcreations/' + 'site-loader', 'check']);
  assert.equal(r.child && r.child.tool, 'npx');
  assert.equal(r.child.tokenMatches, true);
  neverLeaks(r);
});

test('ALLOW: a NODE_AUTH_TOKEN already set wins, and aws is never called', () => {
  const r = runWrapper(tokenRoot(NAMES), 'npm', ['view', 'x'], { NODE_AUTH_TOKEN: 'override-token', FAKE_OVERRIDE: 'override-token' });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.child.hasToken, true);
  assert.equal(r.child.tokenMatches, true);
});

test('ALLOW: the child exit code is the wrapper exit code', () => {
  const r = runWrapper(tokenRoot(NAMES), 'npm', ['test'], { FAKE_TOOL_EXIT: '3' });
  assert.equal(r.status, 3);
});

test('ALLOW: install-type commands get the READ token, from the read secret', () => {
  for (const args of [['ci'], ['install'], ['i', 'x'], ['add', 'x'], ['update'], ['view', 'x'], ['info', 'x'], ['outdated'], ['--prefix', 'sub', 'ci']]) {
    const r = runWrapper(tokenRoot(NAMES), 'npm', args);
    assert.equal(r.child && r.child.which, 'read', `npm ${args.join(' ')} got ${r.child && r.child.which}`);
    assert.deepEqual(r.awsCalls.map((c) => c[c.indexOf('--secret-id') + 1]), [SECRET_NAME]);
    neverLeaks(r);
  }
});

test('ALLOW: npm publish ONLY gets the WRITE token, from the write secret', () => {
  const r = runWrapper(tokenRoot(NAMES), 'npm', ['publish']);
  assert.equal(r.child && r.child.which, 'write');
  assert.deepEqual(r.awsCalls.map((c) => c[c.indexOf('--secret-id') + 1]), [WRITE_SECRET_NAME]);
  neverLeaks(r);
});

// A preload that records every spawnSync the wrapper itself makes (not its children), then lets
// the real call through, so the run still behaves exactly as in a session.
const SPAWN_STUB = path.join(fake, 'spawn-stub.cjs');
fs.writeFileSync(
  SPAWN_STUB,
  [
    "const cp = require('child_process');",
    "const fs = require('fs');",
    "const real = cp.spawnSync;",
    "cp.spawnSync = function (file, args, opts) {",
    "  if (String(process.argv[1] || '').endsWith('npm-token.cjs')) {",
    "    fs.appendFileSync(process.env.SPAWN_LOG, JSON.stringify({ file: require('path').basename(String(file)), windowsHide: Boolean(opts && opts.windowsHide === true) }) + '\\n');",
    "  }",
    "  return real.apply(this, arguments);",
    "};",
  ].join('\n'),
);

test('REFUSE: both wrapper spawns (aws and the npm child) are recorded with windowsHide, so no console window opens', () => {
  const spawnLog = path.join(fake, 'spawn-hide.log');
  const preload = SPAWN_STUB.split(path.sep).join('/');
  const r = runWrapper(tokenRoot(NAMES), 'npm', ['ci'], { SPAWN_LOG: spawnLog, NODE_OPTIONS: `--require "${preload}"` });
  assert.equal(r.status, 0, r.stderr);
  const calls = fs.readFileSync(spawnLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  // repos-root.cjs also spawns git to find the clone root; every spawn is held to the same rule.
  const npmChild = isWin ? path.basename(process.execPath) : 'npm';
  assert.ok(calls.some((c) => /^aws/.test(c.file)), `the aws spawn was not recorded: ${JSON.stringify(calls)}`);
  assert.equal(calls[calls.length - 1].file, npmChild, `the npm child spawn was not recorded last: ${JSON.stringify(calls)}`);
  for (const c of calls) assert.equal(c.windowsHide, true, `${c.file} was spawned without windowsHide`);
  // ALLOW: hiding the window does not swallow output; the child's stdout still reaches the caller.
  assert.match(r.stdout, /fake tool ran/);
  assert.equal(r.child.which, 'read');
  neverLeaks(r);
});

test('ALLOW: npm view and its aliases, and npm pack of an @hillbombcreations/ registry spec, get the READ token', () => {
  const spec = '@hillbombcreations/' + 'site-renderer@1.98.2';
  const cases = [
    ['view', spec, 'dist.integrity'],
    ['show', spec, 'version'],
    ['v', spec],
    ['pack', spec],
    ['pack', spec, '--pack-destination', 'out'],
    ['pack', '--json', '@hillbombcreations/' + 'tier-quotas@latest', '@hillbombcreations/' + 'schemas@^2.1.0'],
  ];
  for (const args of cases) {
    const r = runWrapper(tokenRoot(NAMES), 'npm', args);
    assert.equal(r.child && r.child.which, 'read', `npm ${args.join(' ')} got ${r.child && r.child.which}`);
    assert.deepEqual(r.awsCalls.map((c) => c[c.indexOf('--secret-id') + 1]), [SECRET_NAME]);
    neverLeaks(r);
  }
});

test('REFUSE: npm pack of a folder, a tarball, a git or file spec, or another scope gets NO token and never calls aws', () => {
  const cases = [
    ['pack'],
    ['pack', '--dry-run'],
    ['pack', '.'],
    ['pack', './sub'],
    ['pack', 'probe-1.0.0.tgz'],
    ['pack', 'lodash@4.17.21'],
    ['pack', '@hillbombcreations/' + 'x@github:HillBombCreations/x'],
    ['pack', '@hillbombcreations/' + 'x@file:../x'],
    ['pack', 'github:HillBombCreations/' + 'site-renderer'],
    ['pack', '@hillbombcreations/' + 'site-renderer@1.98.2', '.'],
    ['pack', '--pack-destination', '@hillbombcreations/' + 'x'],
  ];
  for (const args of cases) {
    const r = runWrapper(tokenRoot(NAMES), 'npm', args);
    assert.equal(r.child && r.child.hasToken, false, `npm ${args.join(' ')} saw a token`);
    assert.deepEqual(r.awsCalls, [], `npm ${args.join(' ')} called aws`);
  }
});

test('REFUSE: npm publish never gets the READ token, even of an @hillbombcreations/ spec or when the read secret is all there is', () => {
  const both = runWrapper(tokenRoot(NAMES), 'npm', ['publish']);
  assert.notEqual(both.child && both.child.which, 'read');
  assert.ok(!both.awsCalls.some((c) => c.includes(SECRET_NAME)), 'publish fetched the read secret');
  const scoped = runWrapper(tokenRoot(NAMES), 'npm', ['publish', '@hillbombcreations/' + 'site-renderer@1.98.2']);
  assert.equal(scoped.child, null, 'a publish of a registry spec ran npm');
  assert.deepEqual(scoped.awsCalls, []);
  const readOnly = runWrapper(tokenRoot({ packagesTokenSecret: SECRET_NAME }), 'npm', ['publish']);
  assert.equal(readOnly.child && readOnly.child.hasToken, false, 'publish ran with the read token');
  assert.deepEqual(readOnly.awsCalls, []);
  for (const r of [both, scoped, readOnly]) neverLeaks(r);
});

test('REFUSE: build, test and npx next build children see NO token, and aws is never called', () => {
  const cases = [
    ['npm', ['run', 'build']],
    ['npm', ['test']],
    ['npm', ['run', 'test:unit', '--', '--watch=false']],
    ['npx', ['next', 'build']],
    ['npm', ['exec', 'next', 'build']],
  ];
  for (const [tool, args] of cases) {
    const r = runWrapper(tokenRoot(NAMES), tool, args);
    assert.equal(r.child && r.child.hasToken, false, `${tool} ${args.join(' ')} saw a token`);
    assert.deepEqual(r.awsCalls, [], `${tool} ${args.join(' ')} called aws`);
    assert.equal(r.stderr, '', `${tool} ${args.join(' ')} printed noise`);
  }
});

test('REFUSE: a NODE_AUTH_TOKEN the caller set is stripped from build and test children', () => {
  for (const [tool, args] of [['npm', ['run', 'build']], ['npm', ['test']], ['npx', ['next', 'build']]]) {
    const r = runWrapper(tokenRoot(NAMES), tool, args, { NODE_AUTH_TOKEN: 'override-token', FAKE_OVERRIDE: 'override-token' });
    assert.equal(r.child && r.child.hasToken, false, `${tool} ${args.join(' ')} kept the caller's token`);
  }
});

test('ALLOW: a token-free pack, then the one publish of that tarball gets the WRITE token, --ignore-scripts added', () => {
  const r = runWrapper(tokenRoot(NAMES), 'npm', ['publish', '--tag', 'next']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.calls.length, 2, JSON.stringify(r.calls));
  assert.equal(r.calls[0].args[0], 'pack');
  assert.equal(r.calls[0].hasToken, false, 'npm pack ran with a token');
  const [cmd, tarball, ...rest] = r.calls[1].args;
  assert.equal(cmd, 'publish');
  assert.match(tarball, /vr-token-probe-1\.0\.0\.tgz$/);
  assert.deepEqual(rest, ['--tag', 'next', '--ignore-scripts']);
  assert.equal(r.child.which, 'write');
  neverLeaks(r);
});

test('ALLOW: the caller\'s own tarball is published as is, with the write token and no pack', () => {
  const dir = tokenRoot(NAMES);
  const r = runWrapper(dir, 'npm', ['publish', 'probe-1.0.0.tgz']);
  assert.equal(r.calls.length, 1, JSON.stringify(r.calls));
  assert.deepEqual(r.calls[0].args, ['publish', path.join(dir, 'probe-1.0.0.tgz'), '--ignore-scripts']);
  assert.equal(r.child.which, 'write');
});

test('REFUSE (A5, real npm): publish-time lifecycle scripts run with NO token; only the publish has it', () => {
  // A real package whose prepublishOnly, prepare and postpack each record the token they see.
  const pkg = {
    name: 'vr-a5-probe',
    version: '1.0.0',
    scripts: {
      prepublishOnly: 'node probe.js prepublishOnly',
      prepack: 'node probe.js prepack',
      prepare: 'node probe.js prepare',
      postpack: 'node probe.js postpack',
    },
  };
  const dir = tokenRoot(NAMES, pkg);
  fs.writeFileSync(
    path.join(dir, 'probe.js'),
    "require('fs').writeFileSync(__dirname + '/seen-' + process.argv[2] + '.txt', process.env.NODE_AUTH_TOKEN || '');\n",
  );
  const r = runWrapper(dir, 'npm', ['publish', '--dry-run'], { NODE_AUTH_TOKEN: '', FAKE_OVERRIDE: '' }, awsOnlyBin);
  assert.equal(r.status, 0, `real npm publish --dry-run failed: ${r.stderr.slice(-400)}`);
  for (const name of ['prepublishOnly', 'prepack', 'prepare', 'postpack']) {
    const seen = path.join(dir, `seen-${name}.txt`);
    assert.ok(fs.existsSync(seen), `${name} never ran`);
    assert.equal(fs.readFileSync(seen, 'utf8'), '', `${name} saw a token`);
  }
  // The write token was fetched once, for the publish process alone.
  assert.deepEqual(r.awsCalls.map((c) => c[c.indexOf('--secret-id') + 1]), [WRITE_SECRET_NAME]);
  neverLeaks(r);
});

test('REFUSE (A5): a caller token is stripped from the scripts too, and --ignore-scripts skips them', () => {
  const pkg = { name: 'vr-a5-probe', version: '1.0.0', scripts: { prepublishOnly: 'node probe.js prepublishOnly' } };
  const dir = tokenRoot(NAMES, pkg);
  fs.writeFileSync(
    path.join(dir, 'probe.js'),
    "require('fs').writeFileSync(__dirname + '/seen-' + process.argv[2] + '.txt', process.env.NODE_AUTH_TOKEN || '');\n",
  );
  const withToken = runWrapper(dir, 'npm', ['publish', '--dry-run'], { NODE_AUTH_TOKEN: 'override-token', FAKE_OVERRIDE: 'override-token' }, awsOnlyBin);
  assert.equal(withToken.status, 0, withToken.stderr.slice(-400));
  assert.equal(fs.readFileSync(path.join(dir, 'seen-prepublishOnly.txt'), 'utf8'), '', 'the caller token reached prepublishOnly');
  fs.rmSync(path.join(dir, 'seen-prepublishOnly.txt'));
  const skipped = runWrapper(dir, 'npm', ['publish', '--dry-run', '--ignore-scripts'], {}, awsOnlyBin);
  assert.equal(skipped.status, 0, skipped.stderr.slice(-400));
  assert.ok(!fs.existsSync(path.join(dir, 'seen-prepublishOnly.txt')), '--ignore-scripts still ran a script');
});

test('REFUSE (A5): a failed prepublishOnly stops the publish, and the token is never fetched', () => {
  const r = runWrapper(tokenRoot(NAMES, { name: 'p', version: '1.0.0', scripts: { prepublishOnly: 'node -e "process.exit(4)"' } }), 'npm', ['publish'], {}, awsOnlyBin);
  assert.equal(r.status, 4);
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /the prepublishOnly script failed \(exit 4\); nothing was published/);
});

test('REFUSE (A5): publishing another folder or a workspace is refused, even with --ignore-scripts', () => {
  for (const args of [['publish', 'other-dir'], ['publish', '--ignore-scripts', 'other-dir'], ['publish', '--workspace', 'pkg-a'], ['publish', '--workspaces']]) {
    const r = runWrapper(tokenRoot(NAMES), 'npm', args);
    assert.equal(r.status, 1, `npm ${args.join(' ')} was not refused`);
    assert.equal(r.child, null, `npm ${args.join(' ')} ran npm`);
    assert.deepEqual(r.awsCalls, []);
    assert.match(r.stderr, /would run its scripts in the publish process/);
  }
});

test('REFUSE: publish with no packagesWriteTokenSecret key names that key and never uses the read token', () => {
  const r = runWrapper(tokenRoot({ packagesTokenSecret: SECRET_NAME }), 'npm', ['publish']);
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /has no packagesWriteTokenSecret key/);
  assert.equal(r.child.hasToken, false);
});

test('REFUSE: no packagesTokenSecret key names the key, never reaches aws, and npm runs tokenless', () => {
  const r = runWrapper(tokenRoot({ dbSecretId: 'example/other' }), 'npm', ['ci']);
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /npm-token: no NODE_AUTH_TOKEN for @hillbombcreations packages: .*has no packagesTokenSecret key/);
  assert.equal(r.child.hasToken, false);
});

test('REFUSE: no private names file at all says so and never reaches aws', () => {
  const r = runWrapper(tokenRoot(null), 'npm', ['ci']);
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /private-names\.json is missing or not JSON/);
  assert.equal(r.child.hasToken, false);
});

test('REFUSE: a secret the owners have not created yet is named as missing, and npm runs tokenless', () => {
  const r = runWrapper(tokenRoot({ packagesTokenSecret: SECRET_NAME }), 'npm', ['ci'], { FAKE_AWS_MODE: 'notfound' });
  assert.equal(r.awsCalls.length, 1);
  assert.match(r.stderr, /the shared read-only packages token secret does not exist/);
  assert.equal(r.child.hasToken, false);
});

test('REFUSE: no AWS credentials is named as the missing part', () => {
  const r = runWrapper(tokenRoot({ packagesTokenSecret: SECRET_NAME }), 'npm', ['ci'], { FAKE_AWS_MODE: 'nocreds' });
  assert.match(r.stderr, /AWS credentials: sign in with your own identity/);
  assert.doesNotMatch(r.stderr, /Unable to locate credentials/, 'the aws CLI output was echoed');
  assert.equal(r.child.hasToken, false);
});

test('REFUSE: a secret with no NODE_AUTH_TOKEN key is named, and npm runs tokenless', () => {
  const r = runWrapper(tokenRoot({ packagesTokenSecret: SECRET_NAME }), 'npm', ['ci'], { FAKE_AWS_MODE: 'nokey' });
  assert.match(r.stderr, /the shared read-only packages token secret has no NODE_AUTH_TOKEN key/);
  assert.equal(r.child.hasToken, false);
});

test('REFUSE: a secret name with shell metacharacters never reaches aws', () => {
  const r = runWrapper(tokenRoot({ packagesTokenSecret: 'x & echo pwned' }), 'npm', ['ci']);
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /packagesTokenSecret value is not a valid Secrets Manager name/);
});

test('REFUSE: with no clone root the wrapper says so and never reaches aws', () => {
  const lone = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-npm-noroot-'));
  try {
    const r = runWrapper(lone, 'npm', ['ci']);
    assert.deepEqual(r.awsCalls, []);
    assert.match(r.stderr, /no Vivreal clone root/);
    assert.equal(r.child.hasToken, false);
  } finally {
    fs.rmSync(lone, { recursive: true, force: true });
  }
});

test('repos-root.cjs copies in vivreal-workflow and vivreal-db-explorer are byte-identical', () => {
  const here = fs.readFileSync(path.join(__dirname, 'repos-root.cjs'));
  const there = fs.readFileSync(path.join(__dirname, '..', '..', 'vivreal-db-explorer', 'scripts', 'repos-root.cjs'));
  assert.ok(here.length > 0);
  assert.ok(here.equals(there), 'the two repos-root.cjs copies differ; copy the workflow one over the other');
  // Both are vivreal-hq's packages/fleet-ops/lib/repos-root.js, vendored byte-identical (its sha256,
  // with line endings as committed). Re-vendor both copies and move this pin when hq changes it.
  const VENDORED_SHA256 = '9ff838579cda51909986ff950d93b0dee082e6c5b5be70645513c3710cbbf13d';
  const lf = here.toString('utf8').replace(/\r\n/g, '\n');
  assert.equal(require('node:crypto').createHash('sha256').update(lf).digest('hex'), VENDORED_SHA256);
});
