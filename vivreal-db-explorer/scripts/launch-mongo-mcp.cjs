#!/usr/bin/env node
/**
 * Launcher for the read-only MongoDB MCP server used by vivreal-db-explorer.
 *
 * WHY THIS EXISTS: agents kept asking the user to paste an Atlas connection
 * string because the bare `mongodb-mcp-server` starts UNCONNECTED whenever
 * MDB_MCP_CONNECTION_STRING isn't exported in the launching shell. This wrapper
 * sources the string the same way every backend Lambda does, from AWS Secrets
 * Manager (the Main API service secret, key `CLUSTER_URL`), so the server is already
 * connected before any agent runs a query. The agent never has to ask.
 *
 * WHICH SECRET: the name comes from the VIVREAL_DB_SECRET_ID environment variable, never
 * from this file. This repository is PUBLIC and does not publish secret names; the value
 * is in the private vivreal-hq repo at docs/infra/secret-names.md. Set it once in the
 * user-level Claude Code settings `env` block so every session's launcher sees it.
 *
 * Resolution order:
 *   1. MDB_MCP_CONNECTION_STRING already in the environment  → use verbatim.
 *   2. CLUSTER_URL from the Secrets Manager secret VIVREAL_DB_SECRET_ID names  → use that.
 *   3. Neither available (or the id is unset or malformed) → start UNCONNECTED and tell
 *      stderr how to recover.
 *      The /db-query and /db-schema commands carry the self-service fallback:
 *      source the string + call mcp__mongodb__connect, still never asking the user.
 *
 * PROTOCOL SAFETY: this process speaks JSON-RPC over stdio. It MUST NOT write
 * anything to stdout (that would corrupt the MCP stream), all diagnostics go to
 * stderr, and it hands stdio straight through to the child server. The resolved
 * connection string is a SECRET: it is only ever placed in the child's env, never
 * logged, echoed, or written to stdout/stderr.
 *
 * CONNECTION FOOTPRINT: per the fleet-wide connection policy (the 2026-09-15 Atlas
 * connection spec in vivreal-hq), every non-Lambda connector bounds its pool and identifies itself. `withMcpOptions` below
 * appends `maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer` to whichever
 * connection string this launcher resolves, whether that came from the environment or from
 * Secrets Manager.
 *
 * FOLLOW-UP (not done here): the Main API service secret's user can write. The connection
 * spec proposes a dedicated read-only `dev-tools-ro` user for MCP/CLI use; that user and its
 * secret do not exist yet, so VIVREAL_DB_SECRET_ID still names the writable service secret.
 * Repoint the variable once that read-only user exists.
 */
const { spawnSync, spawn } = require('child_process');

const log = (msg) => process.stderr.write(`[vivreal-db-explorer] ${msg}\n`);
const onWindows = process.platform === 'win32';

// Bounds this session to the same footprint every script, CI job and MCP server must carry:
// a small pool, a bounded idle time, and an appName so the connection is attributable instead
// of landing under the shared "hillbomb_api" name every backend Lambda still reports today.
const MCP_CONNECTION_OPTIONS = 'maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer';

// The characters AWS allows in a Secrets Manager secret name, plus the colon of a full secret
// ARN (both are accepted by --secret-id). None of them is a cmd.exe or POSIX shell metacharacter.
const SECRET_ID_SHAPE = /^[A-Za-z0-9/_+=.@:-]{1,2048}$/;

function withMcpOptions(uri) {
  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}${MCP_CONNECTION_OPTIONS}`;
}

function resolveConnectionString() {
  if (process.env.MDB_MCP_CONNECTION_STRING) {
    log('Using MDB_MCP_CONNECTION_STRING from environment.');
    return process.env.MDB_MCP_CONNECTION_STRING;
  }

  const secretId = process.env.VIVREAL_DB_SECRET_ID;
  if (!secretId) {
    log('No MDB_MCP_CONNECTION_STRING and no VIVREAL_DB_SECRET_ID in env. Starting UNCONNECTED.');
    log('Set VIVREAL_DB_SECRET_ID (its value is in vivreal-hq docs/infra/secret-names.md), or see');
    log('the "Connecting" section of /db-query.');
    return null;
  }
  // On Windows the spawn below runs through a shell, so the id is joined into a command line.
  // Refuse anything outside the Secrets Manager name alphabet rather than let it be parsed.
  if (!SECRET_ID_SHAPE.test(secretId)) {
    log('VIVREAL_DB_SECRET_ID is not a valid Secrets Manager name. Starting UNCONNECTED.');
    return null;
  }

  log('No MDB_MCP_CONNECTION_STRING in env, sourcing CLUSTER_URL from the secret VIVREAL_DB_SECRET_ID names…');
  const res = spawnSync(
    'aws',
    ['secretsmanager', 'get-secret-value',
      '--secret-id', secretId,
      '--query', 'SecretString',
      '--output', 'text'],
    { encoding: 'utf8', shell: onWindows },
  );

  if (res.status !== 0 || !res.stdout) {
    const why = res.error ? res.error.message : (res.stderr || '').trim();
    log(`Could not read the secret VIVREAL_DB_SECRET_ID names (aws CLI exit ${res.status}). ${why}`);
    log('Starting UNCONNECTED. The agent must source the string and call connect, see the');
    log('"Connecting" section of /db-query (sources CLUSTER_URL itself; never asks the user).');
    return null;
  }

  try {
    const secret = JSON.parse(res.stdout);
    if (!secret.CLUSTER_URL) {
      log('The secret resolved but has no CLUSTER_URL key. Starting unconnected.');
      return null;
    }
    log('Resolved CLUSTER_URL from Secrets Manager, server will start connected (read-only).');
    return secret.CLUSTER_URL;
  } catch (e) {
    log(`Failed to parse the secret JSON: ${e.message}. Starting unconnected.`);
    return null;
  }
}

const connectionString = resolveConnectionString();

// Read-only is enforced here so it can never be dropped by a missing env block.
const env = { ...process.env, MDB_MCP_READ_ONLY: 'true' };
if (connectionString) env.MDB_MCP_CONNECTION_STRING = withMcpOptions(connectionString);

const child = spawn(
  'npx',
  ['-y', '--ignore-scripts', 'mongodb-mcp-server@1.13.0'],
  { stdio: 'inherit', env, shell: onWindows },
);

child.on('error', (err) => {
  log(`Failed to launch mongodb-mcp-server: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
