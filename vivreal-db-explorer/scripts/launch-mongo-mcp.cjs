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
 * Resolution order, with no setup beyond a vivreal-hq clone (the clone root is derived by
 * `repos-root.cjs`; `VIVREAL_REPOS` is an optional override):
 *   1. MDB_MCP_CONNECTION_STRING already in the environment  → use verbatim.
 *   2. Otherwise `cluster-url.cjs` reads CLUSTER_URL from the secret named by the optional
 *      VIVREAL_DB_SECRET_ID override, or by key `dbSecretId` of
 *      `<clone root>/vivreal-hq/.vivreal/private-names.json`. This repository is PUBLIC and
 *      never names the secret itself.
 *   3. Neither available → start UNCONNECTED and say on stderr exactly what is missing.
 *      The /db-query and /db-schema commands carry the self-service fallback: run
 *      `cluster-url.cjs` and call mcp__mongodb__connect, still never asking the user.
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
 * secret do not exist yet, so `dbSecretId` still names the writable service secret.
 * Repoint it in vivreal-hq once that read-only user exists.
 */
const { spawn } = require('child_process');
const { readClusterUrl } = require('./cluster-url.cjs');

const log = (msg) => process.stderr.write(`[vivreal-db-explorer] ${msg}\n`);
const onWindows = process.platform === 'win32';

// Bounds this session to the same footprint every script, CI job and MCP server must carry:
// a small pool, a bounded idle time, and an appName so the connection is attributable instead
// of landing under the shared "hillbomb_api" name every backend Lambda still reports today.
const MCP_CONNECTION_OPTIONS = 'maxPoolSize=2&maxIdleTimeMS=60000&appName=mcp:vivreal-db-explorer';

function withMcpOptions(uri) {
  const separator = uri.includes('?') ? '&' : '?';
  return `${uri}${separator}${MCP_CONNECTION_OPTIONS}`;
}

function resolveConnectionString() {
  if (process.env.MDB_MCP_CONNECTION_STRING) {
    log('Using MDB_MCP_CONNECTION_STRING from environment.');
    return process.env.MDB_MCP_CONNECTION_STRING;
  }

  const r = readClusterUrl(process.env, { onWindows });
  if (r.error) {
    log(`NOT CONNECTED: ${r.error}`);
    log('Starting UNCONNECTED. The "Connecting" section of /db-query is the fallback; it never asks the user.');
    return null;
  }
  log(`Resolved CLUSTER_URL from the secret named in ${r.source}; the server will start connected (read-only).`);
  return r.url;
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
