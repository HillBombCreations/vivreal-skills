#!/usr/bin/env node
/**
 * Reads the `vivreal/prod/main-api` secret JSON on stdin and writes its CLUSTER_URL to stdout.
 *
 * WHY A FILE: /db-query and /db-schema pre-approve this exact command in `allowed-tools`. An
 * inline `node -e '...'` rule had to be matched as a quoted, parenthesised program text; a
 * fixed script path is one plain rule, and nothing else `node` could run is approved with it.
 *
 * The value is a secret (it embeds the Atlas user and password). It is written only to stdout,
 * for the caller to pass into the MCP connect call. Every failure message names what is
 * missing and never echoes the input.
 */
'use strict';

const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('end', () => {
  let secret;
  try {
    secret = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    process.stderr.write('extract-cluster-url: stdin is not JSON (expected the SecretString of vivreal/prod/main-api)\n');
    process.exit(1);
  }
  const url = secret && typeof secret.CLUSTER_URL === 'string' ? secret.CLUSTER_URL : '';
  if (!url) {
    process.stderr.write('extract-cluster-url: the secret has no CLUSTER_URL key\n');
    process.exit(1);
  }
  process.stdout.write(url);
});
