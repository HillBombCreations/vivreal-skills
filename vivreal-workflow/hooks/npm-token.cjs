#!/usr/bin/env node
// Runs npm or npx, handing a GitHub Packages token for the private @hillbombcreations/* packages ONLY
// to the commands that need one, with no setup. The vivreal-workflow SessionStart hook defines `npm`
// and `npx` in the session's Bash as calls to this file: `node <this file> npm <args...>`.
//
// Which command gets which token (owners, 2026-11-04):
//   - install and read commands (`ci`, `install`, `i`, `add`, `update`, `view`, `info`, `outdated`),
//     and `npx` (or `npm exec`/`npm x`) only when an argument names `@hillbombcreations/`: the shared
//     READ-ONLY token, from the secret named by key `packagesTokenSecret`;
//   - `npm publish` ONLY: the WRITE token, from the secret named by key `packagesWriteTokenSecret`,
//     and never to a lifecycle script: `prepublishOnly` (npm run) and `npm pack` (which runs prepack,
//     prepare and postpack itself) run with NO token, then only `npm publish <the packed tarball>
//     --ignore-scripts` gets the write token, then `publish` and `postpublish` run with NO token. A
//     tarball publish runs no lifecycle script in npm 10 or 11, while a folder publish in npm 10 runs
//     `prepare` even with --ignore-scripts. A failed step before the upload stops it. The caller's
//     --ignore-scripts skips prepublishOnly and the after-upload scripts and is passed to the pack. A
//     caller's own tarball is published as is; another folder or a workspace is refused (pack it first);
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
// or writes it to a file. An install child, and every install script it runs, can read the READ
// token in its environment; that is npm's design. Build, test and publish-time lifecycle scripts get
// no token at all.
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
 * How to start `tool` with these exact arguments and no shell. On Windows npm.cmd cannot be spawned
 * without one, so do what npm.cmd does: run the npm CLI script with this node, preferring the copy
 * under the global prefix (an upgraded npm) over the one bundled with node. Elsewhere, the
 * executable on PATH.
 */
function commandFor(tool, args, env) {
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  const dirs = String(env[pathKey] || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    if (onWindows) {
      const bundled = path.join(dir, 'node_modules', 'npm', 'bin', `${tool}-cli.js`);
      if (fs.existsSync(path.join(dir, `${tool}.cmd`)) && fs.existsSync(bundled)) {
        let cli = bundled;
        const prefixJs = path.join(dir, 'node_modules', 'npm', 'bin', 'npm-prefix.js');
        if (fs.existsSync(prefixJs)) {
          const r = spawnSync(process.execPath, [prefixJs], { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
          const prefix = String(r.stdout || '').trim();
          const upgraded = prefix && path.join(prefix, 'node_modules', 'npm', 'bin', `${tool}-cli.js`);
          if (upgraded && fs.existsSync(upgraded)) cli = upgraded;
        }
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

// `npm publish` from a package folder runs that package's lifecycle scripts in the publish process,
// and npm 10 runs `prepare` there even with --ignore-scripts (measured 2026-11-04, npm 10.9.3). A
// publish of a TARBALL runs none, in npm 10 and 11 alike. So the write token only ever goes to
// `npm publish <tarball> --ignore-scripts`, after a token-free `npm pack` (which runs prepack,
// prepare and postpack itself, as npm would) and a token-free prepublishOnly.
const WORKSPACE_FLAGS = new Set(['--workspace', '-w', '--workspaces', '-ws']);
const PREFIX_FLAGS = new Set(['--prefix', '-C']);
const isTarball = (a) => /\.(tgz|tar\.gz)$/i.test(a);

/**
 * How to run `npm publish` so the write token never reaches a lifecycle script. Pure, so the tests
 * drive it directly.
 * @returns {{ refuse: string }
 *   | { tarball: string, publishArgs: string[] }
 *   | { dir: string, before: string[], packArgs: string[], afterUpload: string[], flags: string[] }}
 */
function publishPlan(args, cwd, readPackageJson) {
  const ignoreScripts = args.includes('--ignore-scripts');
  const cmdAt = args.indexOf(npmCommand(args) || 'publish');
  let dir = cwd;
  let spec = null;
  let workspace = false;
  const flags = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (i === cmdAt) continue;
    if (PREFIX_FLAGS.has(a)) {
      dir = path.resolve(cwd, String(args[i + 1] || ''));
      i += 1;
      continue;
    }
    if (WORKSPACE_FLAGS.has(a) || a.startsWith('--workspace=') || a.startsWith('-w=')) workspace = true;
    if (VALUE_FLAGS.has(a)) {
      flags.push(a, args[i + 1]);
      i += 1;
      continue;
    }
    if (i > cmdAt && !a.startsWith('-')) {
      if (spec !== null) return { refuse: 'npm publish names more than one package.' };
      spec = a;
      continue;
    }
    flags.push(a);
  }
  const withIgnore = (list) => (list.includes('--ignore-scripts') ? list : [...list, '--ignore-scripts']);
  if (spec !== null && isTarball(spec)) {
    return { tarball: path.resolve(cwd, spec), publishArgs: withIgnore(['publish', path.resolve(cwd, spec), ...flags]) };
  }
  if (spec !== null || workspace) {
    return {
      refuse:
        'npm publish of another folder or a workspace would run its scripts in the publish process. ' +
        'Pack it first (npm pack <folder>), then publish the tarball: npm publish <file>.tgz.',
    };
  }
  const pkg = readPackageJson(dir);
  if (!pkg) return { refuse: `no readable package.json in ${dir}, so its publish scripts cannot be run without the token.` };
  const scripts = pkg.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const has = (name) => typeof scripts[name] === 'string' && scripts[name].trim() !== '';
  return {
    dir,
    before: !ignoreScripts && has('prepublishOnly') ? ['prepublishOnly'] : [],
    packArgs: ignoreScripts ? ['pack', '--ignore-scripts'] : ['pack'],
    afterUpload: ignoreScripts ? [] : ['publish', 'postpublish'].filter(has),
    flags: withIgnore(flags),
  };
}

function readPackageJsonIn(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

/** Spawn one npm or npx process; its exit status, or a non-zero code when it could not start. */
function runTool(tool, args, env, cwd) {
  const cmd = commandFor(tool, args, env);
  if (!cmd) {
    process.stderr.write(`npm-token: ${tool} was not found on PATH.\n`);
    return 127;
  }
  const child = spawnSync(cmd.file, cmd.argv, { stdio: 'inherit', env, cwd, shell: cmd.shell });
  if (child.error) {
    process.stderr.write(`npm-token: could not start ${tool} (${child.error.code || 'error'}).\n`);
    return 1;
  }
  return child.status === null ? 1 : child.status;
}

/** The write token for the one publish process, or the base env without any token. */
function publishEnvFor(env) {
  const out = { ...env };
  const found = resolvePackagesToken(out, 'write');
  if (found.token) {
    out.NODE_AUTH_TOKEN = found.token;
  } else {
    delete out.NODE_AUTH_TOKEN;
    process.stderr.write(`npm-token: no NODE_AUTH_TOKEN for @hillbombcreations packages: ${found.missing}. npm runs without it.\n`);
  }
  return out;
}

/**
 * `npm publish`: prepublishOnly and `npm pack` with NO token, then `npm publish <tarball>
 * --ignore-scripts` with the write token, then publish and postpublish with NO token.
 */
function publishWithoutScriptToken(args, env) {
  const plan = publishPlan(args, process.cwd(), readPackageJsonIn);
  if (plan.refuse) {
    process.stderr.write(`npm-token: ${plan.refuse}\n`);
    return 1;
  }
  if (plan.tarball) return runTool('npm', plan.publishArgs, publishEnvFor(env));

  const bare = { ...env };
  delete bare.NODE_AUTH_TOKEN;
  for (const name of plan.before) {
    const status = runTool('npm', ['run', name], bare, plan.dir);
    if (status !== 0) {
      process.stderr.write(`npm-token: the ${name} script failed (exit ${status}); nothing was published.\n`);
      return status;
    }
  }
  const out = fs.mkdtempSync(path.join(require('os').tmpdir(), 'npm-token-pack-'));
  try {
    const packed = runTool('npm', [...plan.packArgs, '--pack-destination', out], bare, plan.dir);
    if (packed !== 0) {
      process.stderr.write(`npm-token: npm pack failed (exit ${packed}); nothing was published.\n`);
      return packed;
    }
    const tarballs = fs.readdirSync(out).filter(isTarball);
    if (tarballs.length !== 1) {
      process.stderr.write(`npm-token: npm pack made ${tarballs.length} tarballs, expected 1; nothing was published.\n`);
      return 1;
    }
    const published = runTool('npm', ['publish', path.join(out, tarballs[0]), ...plan.flags], publishEnvFor(env), plan.dir);
    if (published !== 0) return published;
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
  for (const name of plan.afterUpload) {
    const status = runTool('npm', ['run', name], bare, plan.dir);
    if (status !== 0) return status;
  }
  return 0;
}

function main(argv) {
  const [tool, ...args] = argv;
  if (!TOOLS.has(tool)) {
    process.stderr.write('npm-token: usage: npm-token.cjs <npm|npx> [args...]\n');
    return 2;
  }
  const env = { ...process.env };
  const kind = tokenKindFor(tool, args);
  if (kind === 'write') return publishWithoutScriptToken(args, env);
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
  return runTool(tool, args, env);
}

module.exports = { resolvePackagesToken, tokenKindFor, npmCommand, commandFor, publishPlan, READ_KEY, WRITE_KEY, VALUE_KEY };

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}
