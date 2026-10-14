// Run: node --test vivreal-workflow/hooks/package-nudge.test.cjs
// Pins the advice package-nudge.cjs gives. It used to say "delete node_modules +
// package-lock.json, then npm install", which on Windows prunes Linux-only
// optional dependencies and has broken this fleet's lockfiles.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, 'package-nudge.cjs');

function runHook(filePath, sessionId) {
  const sid = sessionId || `t${process.pid}${Math.random().toString(36).slice(2)}`;
  const marker = path.join(os.tmpdir(), `vr-pkg-nudge-${sid}`);
  fs.rmSync(marker, { force: true });
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ session_id: sid, tool_input: { file_path: filePath } }),
    encoding: 'utf8',
  });
  return { status: res.status, stdout: res.stdout, sid, marker };
}

function messageFrom(stdout) {
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'PostToolUse');
  const msg = parsed.hookSpecificOutput.additionalContext;
  assert.equal(typeof msg, 'string');
  assert.ok(msg.length > 0, 'parsed an empty message');
  return msg;
}

test('a package.json edit gets the surgical-lockfile advice', (t) => {
  const run = runHook('C:\\repos\\X\\package.json');
  t.after(() => fs.rmSync(run.marker, { force: true }));
  assert.equal(run.status, 0);
  const msg = messageFrom(run.stdout);
  assert.match(msg, /package-publisher/);
  assert.match(msg, /vivreal-package-update/);
  assert.match(msg, /surgically/);
  assert.match(msg, /`npm ci`/);
  assert.match(msg, /npx -y npm@10 ci --dry-run/);
  assert.match(msg, /Never delete `package-lock\.json`/);
});

test('the message never advises deleting the lockfile or running npm install', (t) => {
  const run = runHook('/repo/package.json');
  t.after(() => fs.rmSync(run.marker, { force: true }));
  const msg = messageFrom(run.stdout);
  // The only sentence allowed to name `npm install` or deletion is the prohibition.
  const sentences = msg.split(/(?<=[.)])\s+(?=[A-Z])/);
  assert.ok(sentences.length > 1, 'sentence split found nothing to check');
  for (const s of sentences) {
    if (/npm install|delete/i.test(s)) assert.match(s, /^Never\b/, `advice sentence: ${s}`);
  }
  assert.doesNotMatch(msg, /delete `node_modules`/);
  assert.doesNotMatch(msg, /then `npm install`/);
});

test('a non-package.json edit stays silent', (t) => {
  const run = runHook('/repo/src/index.ts');
  t.after(() => fs.rmSync(run.marker, { force: true }));
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
});

test('a package.json inside node_modules stays silent', (t) => {
  const run = runHook('/repo/node_modules/foo/package.json');
  t.after(() => fs.rmSync(run.marker, { force: true }));
  assert.equal(run.status, 0);
  assert.equal(run.stdout, '');
});

test('the nudge fires once per session', (t) => {
  const first = runHook('/repo/package.json');
  t.after(() => fs.rmSync(first.marker, { force: true }));
  assert.ok(first.stdout.length > 0);
  const second = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ session_id: first.sid, tool_input: { file_path: '/repo/package.json' } }),
    encoding: 'utf8',
  });
  assert.equal(second.status, 0);
  assert.equal(second.stdout, '');
});
