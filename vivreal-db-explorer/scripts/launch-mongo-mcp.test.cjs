// Run: node --test vivreal-db-explorer/scripts/launch-mongo-mcp.test.cjs
// Drives the REAL launcher and the REAL fallback script (cluster-url.cjs) with a fake `aws` and a
// fake `npx` first on PATH, so every assertion is about what they actually hand the AWS CLI and
// the MCP server. The secret id resolves, in order, from the VIVREAL_DB_SECRET_ID override, then
// key `dbSecretId` of `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json`, else a message
// naming what is missing. Each branch has an ALLOW and a REFUSE case. On Windows both scripts spawn
// `aws` through a shell, so an id outside the Secrets Manager name alphabet must never reach it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const LAUNCHER = join(__dirname, 'launch-mongo-mcp.cjs');
const FALLBACK = join(__dirname, 'cluster-url.cjs');
const isWin = process.platform === 'win32';
const OPTIONS = 'maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer';
const CLUSTER = 'mongodb+srv://fake.example/';
const FILE_ID = 'example/prod/from-file';
const OVERRIDE_ID = 'example/prod/override';

const FAKE_AWS = `
const fs = require('fs');
fs.appendFileSync(process.env.FAKE_AWS_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.FAKE_AWS_FAIL) { process.stderr.write('fake aws: AccessDenied'); process.exit(255); }
process.stdout.write(process.env.FAKE_AWS_OUT || JSON.stringify({ CLUSTER_URL: ${JSON.stringify(CLUSTER)} }));
`;
const FAKE_NPX = `
const fs = require('fs');
fs.writeFileSync(process.env.FAKE_NPX_LOG, JSON.stringify({
  args: process.argv.slice(2),
  conn: process.env.MDB_MCP_CONNECTION_STRING || null,
  readOnly: process.env.MDB_MCP_READ_ONLY || null,
}));
`;

const dir = mkdtempSync(join(tmpdir(), 'vr-mongo-launcher-'));
const bin = join(dir, 'bin');
mkdirSync(bin);
writeFileSync(join(bin, 'fake-aws.js'), FAKE_AWS);
writeFileSync(join(bin, 'fake-npx.js'), FAKE_NPX);
for (const [name, script] of [['aws', 'fake-aws.js'], ['npx', 'fake-npx.js']]) {
  if (isWin) {
    // Both scripts run these through cmd.exe on Windows, which resolves a .cmd on PATH.
    writeFileSync(join(bin, `${name}.cmd`), `@"${process.execPath}" "%~dp0${script}" %*\r\n`);
  } else {
    writeFileSync(join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/${script}" "$@"\n`);
    chmodSync(join(bin, name), 0o755);
  }
}
test.after(() => rmSync(dir, { recursive: true, force: true }));

let runs = 0;

/**
 * A scratch VIVREAL_REPOS root. `hq: false` leaves out the vivreal-hq clone, `names: null` leaves
 * out the private names file, and `raw` writes that text as the file instead of JSON.
 */
function repos({ hq = true, names = { dbSecretId: FILE_ID }, raw } = {}) {
  runs += 1;
  const root = join(dir, `repos-${runs}`);
  mkdirSync(root);
  if (hq) {
    // vivreal-hq/.git marks the folder as a clone root (repos-root.cjs).
    mkdirSync(join(root, 'vivreal-hq', '.git'), { recursive: true });
    const dotdir = join(root, 'vivreal-hq', '.vivreal');
    mkdirSync(dotdir, { recursive: true });
    if (raw !== undefined) writeFileSync(join(dotdir, 'private-names.json'), raw);
    else if (names) writeFileSync(join(dotdir, 'private-names.json'), JSON.stringify(names));
  }
  return root;
}

function run(script, extraEnv) {
  runs += 1;
  const awsLog = join(dir, `aws-${runs}.log`);
  const npxLog = join(dir, `npx-${runs}.json`);
  const env = { ...process.env, FAKE_AWS_LOG: awsLog, FAKE_NPX_LOG: npxLog };
  // The machine running the tests may have any of these set; every case states its own.
  for (const k of ['MDB_MCP_CONNECTION_STRING', 'VIVREAL_DB_SECRET_ID', 'VIVREAL_REPOS', 'CLAUDE_PROJECT_DIR', 'FAKE_AWS_FAIL', 'FAKE_AWS_OUT']) {
    delete env[k];
  }
  Object.assign(env, extraEnv);
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = bin + (isWin ? ';' : ':') + (env[pathKey] || '');
  const res = spawnSync(process.execPath, [script], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  const awsCalls = existsSync(awsLog)
    ? readFileSync(awsLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const server = existsSync(npxLog) ? JSON.parse(readFileSync(npxLog, 'utf8')) : null;
  return { status: res.status, stdout: res.stdout || '', stderr: res.stderr || '', awsCalls, server };
}
const launch = (extraEnv) => run(LAUNCHER, extraEnv);
const fallback = (extraEnv) => run(FALLBACK, extraEnv);

const awsArgs = (id) => ['secretsmanager', 'get-secret-value', '--secret-id', id, '--query', 'SecretString', '--output', 'text'];
const CONNECTED = `${CLUSTER}?${OPTIONS}`;

test('control: the fake npx is the server the launcher starts, read-only', () => {
  const r = launch({ MDB_MCP_CONNECTION_STRING: CLUSTER });
  assert.ok(r.server, `the fake npx never ran: ${r.stderr}`);
  assert.deepEqual(r.server.args, ['-y', '--ignore-scripts', 'mongodb-mcp-server@1.13.0']);
  assert.equal(r.server.readOnly, 'true');
});

// (a) MDB_MCP_CONNECTION_STRING
test('(a) ALLOW: a connection string in the environment wins, and aws is never called', () => {
  const r = launch({ MDB_MCP_CONNECTION_STRING: 'mongodb+srv://env.example/', VIVREAL_DB_SECRET_ID: OVERRIDE_ID, VIVREAL_REPOS: repos() });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.server.conn, `mongodb+srv://env.example/?${OPTIONS}`);
});

test('(a) REFUSE: an empty connection string does not count, so resolution moves on', () => {
  const r = launch({ MDB_MCP_CONNECTION_STRING: '', VIVREAL_REPOS: repos() });
  assert.deepEqual(r.awsCalls, [awsArgs(FILE_ID)], r.stderr);
});

// (b) the optional VIVREAL_DB_SECRET_ID override
test('(b) ALLOW: the override wins over the private names file', () => {
  const r = launch({ VIVREAL_DB_SECRET_ID: OVERRIDE_ID, VIVREAL_REPOS: repos() });
  assert.deepEqual(r.awsCalls, [awsArgs(OVERRIDE_ID)], r.stderr);
  assert.equal(r.server.conn, CONNECTED);
});

test('(b) ALLOW: a full secret ARN override reaches aws verbatim', () => {
  const arn = 'arn:aws:secretsmanager:us-east-1:' + '0'.repeat(12) + ':secret:example/prod/main-api-AbCdEf';
  const r = launch({ VIVREAL_DB_SECRET_ID: arn });
  assert.deepEqual(r.awsCalls, [awsArgs(arn)], r.stderr);
  assert.equal(r.server.conn, CONNECTED);
});

test('(b) ALLOW: an empty override is not set, so the file decides', () => {
  const r = launch({ VIVREAL_DB_SECRET_ID: '', VIVREAL_REPOS: repos() });
  assert.deepEqual(r.awsCalls, [awsArgs(FILE_ID)], r.stderr);
});

test('(b) REFUSE: a malformed override never reaches aws and never falls through to the file', () => {
  const r = launch({ VIVREAL_DB_SECRET_ID: ' example/prod/main-api ', VIVREAL_REPOS: repos() });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.server.conn, null);
  assert.match(r.stderr, /NOT CONNECTED: the database secret id from the VIVREAL_DB_SECRET_ID override is not a valid Secrets Manager name/);
});

// (c) key dbSecretId of the private names file
test('(c) ALLOW: with no override, dbSecretId from the private names file reaches aws verbatim', () => {
  const r = launch({ VIVREAL_REPOS: repos() });
  assert.deepEqual(r.awsCalls, [awsArgs(FILE_ID)], r.stderr);
  assert.equal(r.server.conn, CONNECTED);
  assert.equal(r.status, 0, r.stderr);
});

test('(c) REFUSE: a private names file that is not JSON never reaches aws, and says so', () => {
  const r = launch({ VIVREAL_REPOS: repos({ raw: '{ not json' }) });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.server.conn, null);
  assert.match(r.stderr, /private-names\.json is not valid JSON/);
});

test('(c) REFUSE: a private names file with no dbSecretId never reaches aws, and says so', () => {
  for (const names of [{ secretPrefix: 'x' }, { dbSecretId: '' }, { dbSecretId: 42 }]) {
    const r = launch({ VIVREAL_REPOS: repos({ names }) });
    assert.deepEqual(r.awsCalls, [], JSON.stringify(names));
    assert.match(r.stderr, /private-names\.json has no dbSecretId/);
  }
});

// (d) nothing to resolve from
test('(d) REFUSE: VIVREAL_REPOS unset never reaches aws, starts unconnected, and names it', () => {
  const r = launch({});
  assert.deepEqual(r.awsCalls, [], 'aws was called with nothing configured');
  assert.equal(r.server.conn, null);
  assert.match(r.stderr, /NOT CONNECTED: no Vivreal clone root: no folder holding a vivreal-hq clone was found from /);
});

test('(d) REFUSE: a VIVREAL_REPOS with no vivreal-hq is refused, never replaced, never reaches aws, and names it', () => {
  const r = launch({ VIVREAL_REPOS: repos({ hq: false }) });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.server.conn, null);
  assert.match(r.stderr, /NOT CONNECTED: no Vivreal clone root: VIVREAL_REPOS \(.+\) holds no vivreal-hq clone/);
});

test('(d) REFUSE: vivreal-hq without the private names file never reaches aws, and names it', () => {
  const r = launch({ VIVREAL_REPOS: repos({ names: null }) });
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /NOT CONNECTED: vivreal-hq\/\.vivreal\/private-names\.json not found under the clone root/);
});

test('ALLOW: an aws failure starts the server unconnected rather than not at all', () => {
  const r = launch({ VIVREAL_REPOS: repos(), FAKE_AWS_FAIL: '1' });
  assert.equal(r.awsCalls.length, 1, r.stderr);
  assert.ok(r.server, 'the server never started');
  assert.equal(r.server.conn, null);
  assert.match(r.stderr, /could not read the database secret/);
});

test('REFUSE: shell metacharacters, from the override or the file, never reach aws or run', () => {
  const marker = join(dir, 'injected.txt');
  const payloads = [
    `x&echo INJECTED>${marker}`,
    `x;echo INJECTED>${marker}`,
    `x|echo INJECTED>${marker}`,
    `$(echo INJECTED>${marker})`,
    `\`echo INJECTED>${marker}\``,
    'x%PATH%',
    'x^y',
    'x"y',
    "x'y",
    'x(y)',
    'x<y',
    'x y',
    'x\ny',
  ];
  for (const id of payloads) {
    for (const env of [{ VIVREAL_DB_SECRET_ID: id }, { VIVREAL_REPOS: repos({ names: { dbSecretId: id } }) }]) {
      const where = `${JSON.stringify(id)} via ${Object.keys(env)[0]}`;
      const r = launch(env);
      assert.deepEqual(r.awsCalls, [], `aws was called for ${where}`);
      assert.equal(r.server.conn, null, `the server started connected for ${where}`);
      assert.equal(existsSync(marker), false, `the injected command ran for ${where}`);
    }
  }
});

// The /db-query and /db-schema fallback: the same resolution, printing the URL for the connect call.
test('fallback ALLOW: prints exactly the CLUSTER_URL, from the private names file', () => {
  const r = fallback({ VIVREAL_REPOS: repos() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, CLUSTER);
  assert.deepEqual(r.awsCalls, [awsArgs(FILE_ID)]);
});

test('fallback REFUSE: with nothing configured it prints no URL and names what is missing', () => {
  const r = fallback({});
  assert.notEqual(r.status, 0);
  assert.equal(r.stdout, '');
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /cluster-url: NOT CONNECTED: no Vivreal clone root: no folder holding a vivreal-hq clone was found/);
});

test('fallback REFUSE: a secret that is not JSON or has no CLUSTER_URL prints no URL and never echoes it', () => {
  for (const out of ['not-json-SECRETVALUE', JSON.stringify({ OTHER: 'SECRETVALUE' })]) {
    const r = fallback({ VIVREAL_REPOS: repos(), FAKE_AWS_OUT: out });
    assert.notEqual(r.status, 0);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /the database secret (is not JSON|has no CLUSTER_URL key)/);
    assert.doesNotMatch(r.stderr, /SECRETVALUE/);
  }
});

test('(e) ALLOW: with VIVREAL_REPOS unset, the root is derived from CLAUDE_PROJECT_DIR and the file decides', () => {
  const root = repos();
  const project = join(root, 'VR_CMS_API', 'src');
  mkdirSync(project, { recursive: true });
  const r = launch({ CLAUDE_PROJECT_DIR: project });
  assert.deepEqual(r.awsCalls, [awsArgs(FILE_ID)]);
  assert.equal(r.server && r.server.conn, CONNECTED);
});

test('(e) REFUSE: a CLAUDE_PROJECT_DIR with no clone root above it never reaches aws, and names it', () => {
  const project = join(dir, `no-root-${runs + 1}`);
  mkdirSync(project, { recursive: true });
  const r = launch({ CLAUDE_PROJECT_DIR: project });
  assert.deepEqual(r.awsCalls, []);
  assert.match(r.stderr, /NOT CONNECTED: no Vivreal clone root: no folder holding a vivreal-hq clone was found from /);
});
