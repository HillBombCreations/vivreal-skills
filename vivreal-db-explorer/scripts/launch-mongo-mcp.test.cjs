// Run: node --test vivreal-db-explorer/scripts/launch-mongo-mcp.test.cjs
// Drives the REAL launcher with a fake `aws` and a fake `npx` first on PATH, so every assertion is
// about what the launcher actually hands the AWS CLI and the MCP server. The secret id comes from
// VIVREAL_DB_SECRET_ID, and on Windows the launcher spawns through a shell, so an id outside the
// Secrets Manager name alphabet must never reach `aws` at all.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

const LAUNCHER = join(__dirname, 'launch-mongo-mcp.cjs');
const isWin = process.platform === 'win32';
const OPTIONS = 'maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer';
const CLUSTER = 'mongodb+srv://fake.example/';

const FAKE_AWS = `
const fs = require('fs');
fs.appendFileSync(process.env.FAKE_AWS_LOG, JSON.stringify(process.argv.slice(2)) + '\\n');
if (process.env.FAKE_AWS_FAIL) { process.stderr.write('fake aws: AccessDenied'); process.exit(255); }
process.stdout.write(JSON.stringify({ CLUSTER_URL: ${JSON.stringify(CLUSTER)} }));
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
writeFileSync(join(dir, 'fake-aws.js'), FAKE_AWS);
writeFileSync(join(dir, 'fake-npx.js'), FAKE_NPX);
for (const [name, script] of [['aws', 'fake-aws.js'], ['npx', 'fake-npx.js']]) {
  if (isWin) {
    // The launcher runs both through cmd.exe on Windows, which resolves a .cmd on PATH.
    writeFileSync(join(dir, `${name}.cmd`), `@"${process.execPath}" "%~dp0${script}" %*\r\n`);
  } else {
    writeFileSync(join(dir, name), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/${script}" "$@"\n`);
    chmodSync(join(dir, name), 0o755);
  }
}
test.after(() => rmSync(dir, { recursive: true, force: true }));

let runs = 0;
function launch(extraEnv) {
  runs += 1;
  const awsLog = join(dir, `aws-${runs}.log`);
  const npxLog = join(dir, `npx-${runs}.json`);
  const env = { ...process.env, FAKE_AWS_LOG: awsLog, FAKE_NPX_LOG: npxLog };
  delete env.MDB_MCP_CONNECTION_STRING;
  delete env.VIVREAL_DB_SECRET_ID;
  delete env.FAKE_AWS_FAIL;
  Object.assign(env, extraEnv);
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = dir + (isWin ? ';' : ':') + (env[pathKey] || '');
  const res = spawnSync(process.execPath, [LAUNCHER], { cwd: dir, env, encoding: 'utf8', timeout: 60000 });
  const awsCalls = existsSync(awsLog)
    ? readFileSync(awsLog, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    : [];
  const server = existsSync(npxLog) ? JSON.parse(readFileSync(npxLog, 'utf8')) : null;
  return { status: res.status, stderr: res.stderr || '', awsCalls, server };
}

const awsArgs = (id) => ['secretsmanager', 'get-secret-value', '--secret-id', id, '--query', 'SecretString', '--output', 'text'];

test('control: the fake npx is the server the launcher starts, read-only', () => {
  const r = launch({ MDB_MCP_CONNECTION_STRING: CLUSTER });
  assert.ok(r.server, `the fake npx never ran: ${r.stderr}`);
  assert.deepEqual(r.server.args, ['-y', '--ignore-scripts', 'mongodb-mcp-server@1.13.0']);
  assert.equal(r.server.readOnly, 'true');
});

test('ALLOW: a well-formed secret name reaches aws verbatim and the server starts connected', () => {
  const r = launch({ VIVREAL_DB_SECRET_ID: 'example/prod/main-api' });
  assert.deepEqual(r.awsCalls, [awsArgs('example/prod/main-api')], r.stderr);
  assert.equal(r.server.conn, `${CLUSTER}?${OPTIONS}`);
  assert.equal(r.status, 0, r.stderr);
});

test('ALLOW: a full secret ARN reaches aws verbatim', () => {
  const arn = 'arn:aws:secretsmanager:us-east-1:' + '0'.repeat(12) + ':secret:example/prod/main-api-AbCdEf';
  const r = launch({ VIVREAL_DB_SECRET_ID: arn });
  assert.deepEqual(r.awsCalls, [awsArgs(arn)], r.stderr);
  assert.equal(r.server.conn, `${CLUSTER}?${OPTIONS}`);
});

test('ALLOW: a connection string already in the environment wins and aws is never called', () => {
  const r = launch({ MDB_MCP_CONNECTION_STRING: 'mongodb+srv://env.example/', VIVREAL_DB_SECRET_ID: 'example/prod/main-api' });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.server.conn, `mongodb+srv://env.example/?${OPTIONS}`);
});

test('ALLOW: an aws failure starts the server unconnected rather than not at all', () => {
  const r = launch({ VIVREAL_DB_SECRET_ID: 'example/prod/main-api', FAKE_AWS_FAIL: '1' });
  assert.equal(r.awsCalls.length, 1, r.stderr);
  assert.ok(r.server, 'the server never started');
  assert.equal(r.server.conn, null);
});

test('REFUSE: no VIVREAL_DB_SECRET_ID never reaches aws and starts unconnected', () => {
  const r = launch({});
  assert.deepEqual(r.awsCalls, [], 'aws was called with no secret id configured');
  assert.equal(r.server.conn, null);
  assert.match(r.stderr, /VIVREAL_DB_SECRET_ID/);
});

test('REFUSE: an empty VIVREAL_DB_SECRET_ID never reaches aws', () => {
  const r = launch({ VIVREAL_DB_SECRET_ID: '' });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.server.conn, null);
});

test('REFUSE: a padded VIVREAL_DB_SECRET_ID never reaches aws', () => {
  const r = launch({ VIVREAL_DB_SECRET_ID: ' example/prod/main-api ' });
  assert.deepEqual(r.awsCalls, []);
  assert.equal(r.server.conn, null);
  assert.match(r.stderr, /not a valid Secrets Manager name/);
});

test('REFUSE: shell metacharacters never reach aws and the injected command never runs', () => {
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
    const r = launch({ VIVREAL_DB_SECRET_ID: id });
    assert.deepEqual(r.awsCalls, [], `aws was called for ${JSON.stringify(id)}`);
    assert.equal(r.server.conn, null, `the server started connected for ${JSON.stringify(id)}`);
    assert.equal(existsSync(marker), false, `the injected command ran for ${JSON.stringify(id)}`);
  }
});
