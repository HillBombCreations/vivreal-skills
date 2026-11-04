#!/usr/bin/env node
// Runs npm or npx, handing a GitHub Packages token for the private @hillbombcreations/* packages ONLY
// to the commands that need one, with no setup. The vivreal-workflow SessionStart hook defines `npm`
// and `npx` in the session's Bash as calls to this file: `node <this file> npm <args...>`.
//
// Which command gets which token (owners, 2026-11-04):
//   - install and read commands (`ci`, `install`, `i`, `add`, `update`, `view`, `info`, `outdated`),
//     and `npx` (or `npm exec`/`npm x`) only when an argument names `@hillbombcreations/`: the shared
//     READ-ONLY token, from the secret named by key `packagesTokenSecret`;
//   - `npm publish` ONLY: the WRITE token, from the secret named by key `packagesWriteTokenSecret`;
//   - every other command (`run`, `test`, `exec` of anything else, `npx next build` and the rest):
//     NO token. NODE_AUTH_TOKEN is deleted from the child's environment, even when the caller set it,
//     because a Next.js build cache writes environment values to disk and a test or build script has
//     no use for it. No AWS call is made and nothing is printed for these.
// The secret NAMES are keys of `<clone root>/vivreal-hq/.vivreal/private-names.json` (this repository
// is PUBLIC and never names them); each value is JSON with key `NODE_AUTH_TOKEN`, read with the
// user's own AWS sign-in at the moment npm runs. A NODE_AUTH_TOKEN already in the environment is an
// optional override, used only for the commands above that get a token. Never `gh auth token`: it
// carries the person's whole GitHub access.
//
// What is and is not true about where the token goes: this wrapper puts it only into the environment
// of the one npm or npx child that needs it, and never prints it, logs it, puts it on a command line
// or writes it to a file. That child, and every install script it runs, can read its environment;
// that is npm's design, and why build and test commands get none.
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { resolveReposRoot } = require('./repos-root.cjs');

const TOOLS = new Set(['npm', 'npx']);
const READ_KEY = 'packagesTokenSecret';
const WRITE_KEY = 'packagesWriteTokenSecret';
const VALUE_KEY = 'NODE_AUTH_TOKEN';
const READ_COMMANDS = new Set(['ci', 'install', 'i', 'add', 'update', 'view', 'info', 'outdated']);
const EXEC_COMMANDS = new Set(['exec', 'x']);
// npm options that take the next argument as their value, so it is not mistaken for the command.
const VALUE_FLAGS = new Set(['--prefix', '-C', '--workspace', '-w', '--registry', '--cache', '--userconfig', '--loglevel', '--tag', '--access', '--otp']);
const OUR_SCOPE = '@hillbombcreations/';
// The Secrets Manager name alphabet, plus the colon of a full ARN. None of these is a shell
// metacharacter, which matters because `aws` is spawned through a shell on Windows.
const SECRET_ID_SHAPE = /^[A-Za-z0-9/_+=.@:-]{1,2048}$/;
const onWindows = process.platform === 'win32';

/** The npm command word: the first argument that is neither an option nor an option's value. */
function npmCommand(args) {
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--') return null;
    if (a.startsWith('-')) {
      if (VALUE_FLAGS.has(a)) i += 1;
      continue;
    }
    return a;
  }
  return null;
}

/** Which token this call gets: 'read', 'write' or 'none'. */
function tokenKindFor(tool, args) {
  const namesOurScope = args.some((a) => a.includes(OUR_SCOPE));
  if (tool === 'npx') return namesOurScope ? 'read' : 'none';
  const cmd = npmCommand(args);
  if (cmd === 'publish') return 'write';
  if (cmd && READ_COMMANDS.has(cmd)) return 'read';
  if (cmd && EXEC_COMMANDS.has(cmd)) return namesOurScope ? 'read' : 'none';
  return 'none';
}

/**
 * The token for one kind, or the reason there is none. Never throws, never logs.
 * @returns {{ token: string, source: string } | { missing: string }}
 */
function resolvePackagesToken(env, kind) {
  if (env.NODE_AUTH_TOKEN) return { token: env.NODE_AUTH_TOKEN, source: 'NODE_AUTH_TOKEN' };
  const key = kind === 'write' ? WRITE_KEY : READ_KEY;
  const label = kind === 'write' ? 'write' : 'read-only';
  const resolved = resolveReposRoot({ env });
  if (!resolved.root) return { missing: `no Vivreal clone root (${resolved.reason})` };
  const file = path.join(resolved.root, 'vivreal-hq', '.vivreal', 'private-names.json');
  let names;
  try {
    names = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return { missing: 'vivreal-hq/.vivreal/private-names.json is missing or not JSON (pull vivreal-hq main)' };
  }
  const id = names && names[key];
  if (typeof id !== 'string' || !id) {
    return { missing: `vivreal-hq/.vivreal/private-names.json has no ${key} key (pull vivreal-hq main)` };
  }
  if (!SECRET_ID_SHAPE.test(id)) return { missing: `the ${key} value is not a valid Secrets Manager name` };
  const res = spawnSync(
    'aws',
    ['secretsmanager', 'get-secret-value', '--secret-id', id, '--query', 'SecretString', '--output', 'text'],
    { encoding: 'utf8', shell: onWindows, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  if (res.error || res.status !== 0 || !res.stdout) {
    const err = String(res.stderr || '');
    if (res.error && res.error.code === 'ENOENT') return { missing: 'the AWS CLI is not on PATH' };
    if (/ResourceNotFoundException|can't find the specified secret/i.test(err)) {
      return { missing: `the shared ${label} packages token secret does not exist` };
    }
    if (/Unable to locate credentials|ExpiredToken|InvalidClientTokenId|UnrecognizedClientException|SSO session|token has expired|could not be found/i.test(err)) {
      return { missing: 'AWS credentials: sign in with your own identity (`aws sso login` or `aws configure`)' };
    }
    if (/AccessDenied/i.test(err)) return { missing: `AWS access: your identity cannot read the shared ${label} packages token secret` };
    return { missing: `could not read the shared ${label} packages token secret (aws CLI exit ${res.status})` };
  }
  let secret;
  try {
    secret = JSON.parse(res.stdout);
  } catch {
    return { missing: `the shared ${label} packages token secret is not JSON with a ${VALUE_KEY} key` };
  }
  const token = secret && secret[VALUE_KEY];
  if (typeof token !== 'string' || !token) {
    return { missing: `the shared ${label} packages token secret has no ${VALUE_KEY} key` };
  }
  return { token, source: `the shared ${label} packages token in AWS` };
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
  const kind = tokenKindFor(tool, args);
  if (kind === 'none') {
    delete env.NODE_AUTH_TOKEN;
  } else {
    const found = resolvePackagesToken(env, kind);
    if (found.token) {
      env.NODE_AUTH_TOKEN = found.token;
    } else {
      delete env.NODE_AUTH_TOKEN;
      process.stderr.write(
        `npm-token: no NODE_AUTH_TOKEN for @hillbombcreations packages: ${found.missing}. ${tool} runs without it.\n`,
      );
    }
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

module.exports = { resolvePackagesToken, tokenKindFor, npmCommand, commandFor, READ_KEY, WRITE_KEY, VALUE_KEY };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
