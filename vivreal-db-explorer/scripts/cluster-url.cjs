#!/usr/bin/env node
/**
 * Resolves the Atlas CLUSTER_URL for vivreal-db-explorer with no setup beyond a vivreal-hq clone
 * beside the session's checkout. The clone root comes from `repos-root.cjs`: the optional
 * `VIVREAL_REPOS` override, else derived from CLAUDE_PROJECT_DIR (which Claude Code gives an MCP
 * server) and the current folder.
 *
 * Used two ways:
 *   - required by `launch-mongo-mcp.cjs`, which starts the MCP server connected;
 *   - run directly by the /db-query and /db-schema fallback,
 *     `node "${CLAUDE_PLUGIN_ROOT}/scripts/cluster-url.cjs"`, which prints the URL on stdout for
 *     the connect call. That command is pre-approved in their `allowed-tools`, so it is one fixed
 *     script path with no arguments.
 *
 * WHICH SECRET. This repository is PUBLIC and never names it. In order:
 *   1. `VIVREAL_DB_SECRET_ID`, an optional override. Never required.
 *   2. Key `dbSecretId` of `<clone root>/vivreal-hq/.vivreal/private-names.json`, the private
 *      names file vivreal-hq carries (names only, never values). Read with fs, no shell.
 *   3. Otherwise an error that names exactly what is missing.
 * (`MDB_MCP_CONNECTION_STRING`, when set, wins over all of this; the launcher checks it first.)
 *
 * The id is checked against the Secrets Manager name alphabet before it reaches `aws`, because on
 * Windows the spawn runs through a shell. The URL is a SECRET (it embeds the Atlas user and
 * password): it is only ever returned to the caller or written to stdout, never logged, and no
 * error message echoes it.
 */
'use strict';

const { spawnSync } = require('child_process');
const { existsSync, readFileSync, statSync } = require('fs');
const path = require('path');
const { resolveReposRoot } = require('./repos-root.cjs');

const PRIVATE_NAMES = ['.vivreal', 'private-names.json'];

// The characters AWS allows in a Secrets Manager secret name, plus the colon of a full secret
// ARN (both are accepted by --secret-id). None of them is a cmd.exe or POSIX shell metacharacter.
const SECRET_ID_SHAPE = /^[A-Za-z0-9/_+=.@:-]{1,2048}$/;

const isDir = (p) => {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
};

/**
 * The secret id and where it came from, or an error naming exactly what is missing. `starts` are
 * the folders the clone root is derived from (the cwd is appended) when VIVREAL_REPOS is unset. A set
 * but wrong VIVREAL_REPOS is refused, never replaced (repos-root.cjs).
 */
function resolveSecretId(env, starts = [env.CLAUDE_PROJECT_DIR]) {
  let id;
  let source;
  if (env.VIVREAL_DB_SECRET_ID) {
    id = env.VIVREAL_DB_SECRET_ID;
    source = 'the VIVREAL_DB_SECRET_ID override';
  } else {
    const resolved = resolveReposRoot({ env, starts });
    if (!resolved.root) {
      return { error: `no Vivreal clone root: ${resolved.reason} (SETUP.md).` };
    }
    const hq = path.join(resolved.root, 'vivreal-hq');
    if (!isDir(hq)) {
      return { error: `vivreal-hq not found under the clone root ${resolved.root}. Clone it there (SETUP.md).` };
    }
    const file = path.join(hq, ...PRIVATE_NAMES);
    if (!existsSync(file)) {
      return { error: `vivreal-hq/.vivreal/private-names.json not found under the clone root ${resolved.root}. Pull vivreal-hq main.` };
    }
    let names;
    try {
      names = JSON.parse(readFileSync(file, 'utf8'));
    } catch {
      return { error: 'vivreal-hq/.vivreal/private-names.json is not valid JSON. Pull vivreal-hq main.' };
    }
    if (!names || typeof names.dbSecretId !== 'string' || !names.dbSecretId) {
      return { error: 'vivreal-hq/.vivreal/private-names.json has no dbSecretId. Pull vivreal-hq main.' };
    }
    id = names.dbSecretId;
    source = 'vivreal-hq/.vivreal/private-names.json';
  }
  if (!SECRET_ID_SHAPE.test(id)) {
    return { error: `the database secret id from ${source} is not a valid Secrets Manager name.` };
  }
  return { id, source };
}

/** CLUSTER_URL from the resolved secret, or an error. Never logs the URL. */
function readClusterUrl(env, { onWindows = process.platform === 'win32' } = {}) {
  const resolved = resolveSecretId(env);
  if (resolved.error) return resolved;
  const res = spawnSync(
    'aws',
    ['secretsmanager', 'get-secret-value', '--secret-id', resolved.id, '--query', 'SecretString', '--output', 'text'],
    { encoding: 'utf8', shell: onWindows, env },
  );
  if (res.status !== 0 || !res.stdout) {
    const why = res.error ? res.error.message : (res.stderr || '').trim();
    return { error: `could not read the database secret named in ${resolved.source} (aws CLI exit ${res.status}). ${why}` };
  }
  let secret;
  try {
    secret = JSON.parse(res.stdout);
  } catch {
    return { error: 'the database secret is not JSON.' };
  }
  if (!secret || typeof secret.CLUSTER_URL !== 'string' || !secret.CLUSTER_URL) {
    return { error: 'the database secret has no CLUSTER_URL key.' };
  }
  return { url: secret.CLUSTER_URL, source: resolved.source };
}

module.exports = { resolveSecretId, readClusterUrl, SECRET_ID_SHAPE };

if (require.main === module) {
  const r = readClusterUrl(process.env);
  if (r.error) {
    process.stderr.write(`cluster-url: NOT CONNECTED: ${r.error}\n`);
    process.exit(1);
  }
  process.stdout.write(r.url);
}
