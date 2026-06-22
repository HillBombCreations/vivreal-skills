#!/usr/bin/env node
/**
 * Launcher for the read-only MongoDB MCP server used by vivreal-db-explorer.
 *
 * WHY THIS EXISTS: agents kept asking the user to paste an Atlas connection
 * string because the bare `mongodb-mcp-server` starts UNCONNECTED whenever
 * MDB_MCP_CONNECTION_STRING isn't exported in the launching shell. This wrapper
 * sources the string the same way every backend Lambda does — from AWS Secrets
 * Manager (secret `hb-api-secrets`, key `CLUSTER_URL`) — so the server is already
 * connected before any agent runs a query. The agent never has to ask.
 *
 * Resolution order:
 *   1. MDB_MCP_CONNECTION_STRING already in the environment  → use verbatim.
 *   2. CLUSTER_URL from AWS Secrets Manager (hb-api-secrets)  → use that.
 *   3. Neither available → start UNCONNECTED and tell stderr how to recover.
 *      The /db-query and /db-schema commands carry the self-service fallback:
 *      source the string + call mcp__mongodb__connect, still never asking the user.
 *
 * PROTOCOL SAFETY: this process speaks JSON-RPC over stdio. It MUST NOT write
 * anything to stdout (that would corrupt the MCP stream) — all diagnostics go to
 * stderr — and it hands stdio straight through to the child server. The resolved
 * connection string is a SECRET: it is only ever placed in the child's env, never
 * logged, echoed, or written to stdout/stderr.
 */
const { spawnSync, spawn } = require('child_process');

const log = (msg) => process.stderr.write(`[vivreal-db-explorer] ${msg}\n`);
const onWindows = process.platform === 'win32';

function resolveConnectionString() {
  if (process.env.MDB_MCP_CONNECTION_STRING) {
    log('Using MDB_MCP_CONNECTION_STRING from environment.');
    return process.env.MDB_MCP_CONNECTION_STRING;
  }

  log('No MDB_MCP_CONNECTION_STRING in env — sourcing CLUSTER_URL from Secrets Manager (hb-api-secrets)…');
  const res = spawnSync(
    'aws',
    ['secretsmanager', 'get-secret-value',
      '--secret-id', 'hb-api-secrets',
      '--query', 'SecretString',
      '--output', 'text'],
    { encoding: 'utf8', shell: onWindows },
  );

  if (res.status !== 0 || !res.stdout) {
    const why = res.error ? res.error.message : (res.stderr || '').trim();
    log(`Could not read hb-api-secrets (aws CLI exit ${res.status}). ${why}`);
    log('Starting UNCONNECTED. The agent must source the string and call connect — see the');
    log('"Connecting" section of /db-query (sources CLUSTER_URL itself; never asks the user).');
    return null;
  }

  try {
    const secret = JSON.parse(res.stdout);
    if (!secret.CLUSTER_URL) {
      log('hb-api-secrets resolved but has no CLUSTER_URL key. Starting unconnected.');
      return null;
    }
    log('Resolved CLUSTER_URL from Secrets Manager — server will start connected (read-only).');
    return secret.CLUSTER_URL;
  } catch (e) {
    log(`Failed to parse hb-api-secrets JSON: ${e.message}. Starting unconnected.`);
    return null;
  }
}

const connectionString = resolveConnectionString();

// Read-only is enforced here so it can never be dropped by a missing env block.
const env = { ...process.env, MDB_MCP_READ_ONLY: 'true' };
if (connectionString) env.MDB_MCP_CONNECTION_STRING = connectionString;

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
