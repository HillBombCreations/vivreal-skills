// Run: node --test scripts/skill-drift.test.mjs
// Drives the REAL skill-drift.mjs CLI with a fake `gh` first on PATH, so every row it prints and
// its exit code come from the code path the weekly job runs. The fake answers each `gh api`
// endpoint with the output the script's own --jq would produce, and logs every call.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, linkSync, mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), 'skill-drift.mjs');
const SYNCED = 'a'.repeat(40);
const isWin = process.platform === 'win32';

// The fake gh. On Windows it runs as `gh.exe` (a link to node) with the cwd holding a script
// named `api`, so `gh api ...` is `node api ...`. Elsewhere `gh` is a shell script calling it.
const FAKE = `
const fs = require('fs');
const args = process.argv.slice(2);
if (args[0] === 'api') args.shift();
const endpoint = args.find((a) => !a.startsWith('-') && a.startsWith('repos/'));
fs.appendFileSync(process.env.FAKE_GH_LOG, endpoint + '\\n');
const rules = JSON.parse(process.env.FAKE_GH);
const rule = rules.find((r) => endpoint.includes(r.match));
if (!rule) { process.stderr.write('fake gh: no rule for ' + endpoint); process.exit(1); }
if (rule.code) { process.stderr.write(rule.err || 'fake failure'); process.exit(rule.code); }
process.stdout.write(rule.out);
`;

const dir = mkdtempSync(join(tmpdir(), 'vr-drift-'));
writeFileSync(join(dir, 'api'), FAKE);
if (isWin) {
  try {
    linkSync(process.execPath, join(dir, 'gh.exe'));
  } catch {
    copyFileSync(process.execPath, join(dir, 'gh.exe'));
  }
} else {
  writeFileSync(join(dir, 'gh'), `#!/bin/sh\nexec "${process.execPath}" "$(dirname "$0")/api" "$@"\n`);
  chmodSync(join(dir, 'gh'), 0o755);
}
const sourcesFile = join(dir, 'sources.json');
writeFileSync(
  sourcesFile,
  JSON.stringify({ 'p/skill': { sources: [{ repo: 'R', ref: 'main', paths: ['src/'], synced: SYNCED }] } }),
);
test.after(() => rmSync(dir, { recursive: true, force: true }));

function run(rules) {
  const log = join(dir, `calls-${Math.random().toString(36).slice(2)}.log`);
  writeFileSync(log, '');
  const env = { ...process.env, FAKE_GH: JSON.stringify(rules), FAKE_GH_LOG: log };
  const pathKey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';
  env[pathKey] = dir + (isWin ? ';' : ':') + (env[pathKey] || '');
  const res = spawnSync(process.execPath, [SCRIPT, '--file', sourcesFile], { cwd: dir, env, encoding: 'utf8' });
  const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : [];
  return { status: res.status, stdout: res.stdout, stderr: res.stderr, calls };
}

const others = (n) => Array.from({ length: n }, (_, i) => `other/file-${i}.js`);
const compareLine = (o) => JSON.stringify({ status: 'ahead', behind: 0, ...o }) + '\n';
const rowOf = (stdout) => stdout.split('\n').find((l) => l.includes('p/skill')) || '';

test('control: the fake gh is the one the script runs', () => {
  const r = run([{ match: 'compare/', out: compareLine({ ahead: 1, files: ['src/a.js'], commits: ['c1'] }) }]);
  assert.ok(r.calls.length > 0, `the fake gh was never called: ${r.stderr}`);
  assert.match(r.calls[0], new RegExp(`^repos/HillBombCreations/R/compare/${SYNCED}\\.\\.\\.main$`));
});

test('ALLOW: an untruncated compare with a matching file is STALE, exit 0', () => {
  const r = run([{ match: 'compare/', out: compareLine({ ahead: 1, files: ['src/a.js'], commits: ['c1'] }) }]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(rowOf(r.stdout), /^STALE p\/skill \| R@main \| 1 ahead \| 1 matching/);
});

test('ALLOW: an untruncated compare with nothing under the paths is ok, exit 0', () => {
  const r = run([{ match: 'compare/', out: compareLine({ ahead: 2, files: ['other/x.js'], commits: ['c1', 'c2'] }) }]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(rowOf(r.stdout), /^ok {4}p\/skill/);
});

test('REFUSE: a compare truncated at 300 files resolves through the commits API and reports STALE', () => {
  const r = run([
    { match: 'compare/', out: compareLine({ ahead: 3, files: others(300), commits: ['c1', 'c2', 'c3'] }) },
    { match: `commits/${SYNCED}`, out: '2026-10-01T00:00:00Z\n' },
    // c9 touches the path but is not ahead of the synced commit, so it must not count.
    { match: 'commits?', out: 'c2\nc3\nc9\n' },
  ]);
  assert.equal(r.status, 0, r.stderr);
  const row = rowOf(r.stdout);
  assert.doesNotMatch(row, /^ok/, `a truncated compare printed ok: ${row}`);
  assert.match(row, /^STALE p\/skill \| R@main \| 3 ahead \| 2 matching commits/);
  assert.ok(
    r.calls.some((c) => c.startsWith('repos/HillBombCreations/R/commits?') && c.includes('path=src') && c.includes('sha=main')),
    `no path-scoped commits call: ${r.calls.join(', ')}`,
  );
});

test('REFUSE: a truncated compare whose commits fallback fails is UNKNOWN, counted stale, exit non-zero', () => {
  const r = run([
    { match: 'compare/', out: compareLine({ ahead: 3, files: others(300), commits: ['c1', 'c2', 'c3'] }) },
    { match: `commits/${SYNCED}`, out: '2026-10-01T00:00:00Z\n' },
    { match: 'commits?', code: 1, err: 'HTTP 502' },
  ]);
  assert.notEqual(r.status, 0, 'a compare it could not resolve exited 0');
  const row = rowOf(r.stdout);
  assert.match(row, /^UNKNOWN p\/skill/, `row was: ${row}`);
  assert.match(r.stdout, /1 with matching changes or unknown/);
});

test('REFUSE: a truncated compare whose commit list is short of ahead_by is UNKNOWN', () => {
  const r = run([
    { match: 'compare/', out: compareLine({ ahead: 400, files: others(300), commits: ['c1'] }) },
    { match: `commits/${SYNCED}`, out: '2026-10-01T00:00:00Z\n' },
    { match: 'commits?', out: '' },
  ]);
  assert.notEqual(r.status, 0);
  assert.match(rowOf(r.stdout), /^UNKNOWN p\/skill/);
});

test('ALLOW: a truncated compare with no ahead commit under the paths is ok, and says how it knows', () => {
  const r = run([
    { match: 'compare/', out: compareLine({ ahead: 2, files: others(300), commits: ['c1', 'c2'] }) },
    { match: `commits/${SYNCED}`, out: '2026-10-01T00:00:00Z\n' },
    { match: 'commits?', out: 'c9\n' },
  ]);
  assert.equal(r.status, 0, r.stderr);
  assert.match(rowOf(r.stdout), /^ok {4}p\/skill .*0 matching commits \(file list truncated at 300; resolved by the commits API\)/);
});
