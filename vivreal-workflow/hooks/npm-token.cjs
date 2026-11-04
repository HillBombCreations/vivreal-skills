#!/usr/bin/env node
// Runs npm or npx with a NODE_AUTH_TOKEN for the private @hillbombcreations/* packages, with no setup.
// The vivreal-workflow SessionStart hook defines `npm` and `npx` in the session's Bash as calls to
// this file: `node <this file> npm <args...>`.
//
// The token, in order (owners, 2026-11-04):
//   1. NODE_AUTH_TOKEN already in the environment: used as is (an optional override).
//   2. ONE shared READ-ONLY packages token in AWS Secrets Manager, read with the user's own AWS
//      sign-in at the moment npm runs. The secret's NAME is key `packagesTokenSecret` of
//      `<clone root>/vivreal-hq/.vivreal/private-names.json` (this repository is PUBLIC and never
//      names it); the value is JSON with key `NODE_AUTH_TOKEN`.
//   3. Otherwise one stderr line naming the missing part (the key, the secret, or AWS credentials),
//      and npm runs without a token, so a command that needs no private package still works.
// Never `gh auth token`: that carries the person's whole GitHub access, and any install script can
// read npm's environment.
//
// The token goes ONLY into the npm or npx child's environment. It is never printed, never logged,
// never written to disk and never put on a command line; no message here echoes it or the aws
// CLI's output.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveReposRoot } = require('./repos-root.cjs');

const TOOLS = new Set(['npm', 'npx']);
const NAME_KEY = 'packagesTokenSecret';
const VALUE_KEY = 'NODE_AUTH_TOKEN';
// The Secrets Manager name alphabet, plus the colon of a full ARN. None of these is a shell
// metacharacter, which matters because `aws` is spawned through a shell on Windows.
const SECRET_ID_SHAPE = /^[A-Za-z0-9/_+=.@:-]{1,2048}$/;
const onWindows = process.platform === 'win32';

/**
 * The token for the child, or the reason there is none. Never throws, never logs.
 * @returns {{ token: string, source: string } | { missing: string }}
 */
function resolvePackagesToken(env, starts) {
  if (env.NODE_AUTH_TOKEN) return { token: env.NODE_AUTH_TOKEN, source: 'NODE_AUTH_TOKEN' };
  const resolved = resolveReposRoot({ env, starts });
  if (!resolved.root) return { missing: `no Vivreal clone root (${resolved.reason})` };
  const file = path.join(resolved.root, 'vivreal-hq', '.vivreal', 'private-names.json');
  let names;
  try {
    names = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { missing: 'vivreal-hq/.vivreal/private-names.json is missing or not JSON (pull vivreal-hq main)' };
  }
  const id = names && names[NAME_KEY];
  if (typeof id !== 'string' || !id) {
    return { missing: `vivreal-hq/.vivreal/private-names.json has no ${NAME_KEY} key (pull vivreal-hq main)` };
  }
  if (!SECRET_ID_SHAPE.test(id)) {
    return { missing: `the ${NAME_KEY} value is not a valid Secrets Manager name` };
  }
  const res = spawnSync(
    'aws',
    ['secretsmanager', 'get-secret-value', '--secret-id', id, '--query', 'SecretString', '--output', 'text'],
    { encoding: 'utf8', shell: onWindows, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (res.error || res.status !== 0 || !res.stdout) {
    const err = String(res.stderr || '');
    if (res.error && res.error.code === 'ENOENT') return { missing: 'the AWS CLI is not on PATH' };
    if (/ResourceNotFoundException|can't find the specified secret/i.test(err)) {
      return { missing: 'the shared packages token secret does not exist yet (the owners create it)' };
    }
    if (/Unable to locate credentials|ExpiredToken|InvalidClientTokenId|UnrecognizedClientException|SSO session|token has expired|could not be found/i.test(err)) {
      return { missing: 'AWS credentials: sign in with your own identity (`aws sso login` or `aws configure`)' };
    }
    if (/AccessDenied/i.test(err)) return { missing: 'AWS access: your identity cannot read the shared packages token secret' };
    return { missing: `could not read the shared packages token secret (aws CLI exit ${res.status})` };
  }
  let secret;
  try {
    secret = JSON.parse(res.stdout);
  } catch {
    return { missing: `the shared packages token secret is not JSON with a ${VALUE_KEY} key` };
  }
  const token = secret && secret[VALUE_KEY];
  if (typeof token !== 'string' || !token) {
    return { missing: `the shared packages token secret has no ${VALUE_KEY} key` };
  }
  return { token, source: 'the shared read-only packages token in AWS' };
}

/**
 * How to start `tool` with these exact arguments and no shell: on Windows npm.cmd cannot be spawned
 * without one, so run the npm CLI script beside it with this node. Elsewhere, the executable on PATH.
 */
function commandFor(tool, args, env) {
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const dirs = String(env[pathKey] || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    if (onWindows) {
      const cli = path.join(dir, 'node_modules', 'npm', 'bin', `${tool}-cli.js`);
      if (fs.existsSync(path.join(dir, `${tool}.cmd`)) && fs.existsSync(cli)) {
        return { file: process.execPath, argv: [cli, ...args], shell: false };
      }
    } else {
      const bin = path.join(dir, tool);
      try {
        fs.accessSync(bin, fs.constants.X_OK);
        return { file: bin, argv: args, shell: false };
      } catch {
        /* not here */
      }
    }
  }
  return null;
}

function main(argv) {
  const [tool, ...args] = argv;
  if (!TOOLS.has(tool)) {
    process.stderr.write('npm-token: usage: npm-token.cjs <npm|npx> [args...]\n');
    return 2;
  }
  const env = { ...process.env };
  const found = resolvePackagesToken(env, [process.cwd(), env.CLAUDE_PROJECT_DIR]);
  if (found.token) {
    env.NODE_AUTH_TOKEN = found.token;
  } else {
    delete env.NODE_AUTH_TOKEN;
    process.stderr.write(
      `npm-token: no NODE_AUTH_TOKEN for @hillbombcreations packages: ${found.missing}. ${tool} runs without it.\n`,
    );
  }
  const cmd = commandFor(tool, args, env);
  if (!cmd) {
    process.stderr.write(`npm-token: ${tool} was not found on PATH.\n`);
    return 127;
  }
  const child = spawnSync(cmd.file, cmd.argv, { stdio: 'inherit', env, shell: cmd.shell });
  if (child.error) {
    process.stderr.write(`npm-token: could not start ${tool} (${child.error.code || 'error'}).\n`);
    return 1;
  }
  return child.status === null ? 1 : child.status;
}

module.exports = { resolvePackagesToken, commandFor, NAME_KEY, VALUE_KEY };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
