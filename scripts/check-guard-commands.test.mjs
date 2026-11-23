// Run: node --test scripts/check-guard-commands.test.mjs
// REFUSE and ALLOW controls for check-guard-commands.mjs (F654, the C-SK definition review pass 3
// warnings): inline code that names a folder is read as well as fenced blocks, the self-test's
// poisoned file is planted in a temporary tree and never in the real one, and the header says
// where a subagent really starts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as check from './check-guard-commands.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'scripts', 'check-guard-commands.mjs');
const findings = (rel, text) => check.checkText(rel, text, { files: 0, checked: 0, skipped: 0, mainThread: 0 });

test('REFUSE: inline code in prose that reads an owner clone is a finding', () => {
  const got = findings('vivreal-principal/agents/poison.md', 'First run `git -C "$VIVREAL_REPOS/VR_CMS_API" log -1` to read it.\n');
  assert.equal(got.length, 1);
  assert.match(got[0].msg, /^inline code refused/);
});

test('REFUSE: an inline cd into a clone is a finding for a data fleet too', () => {
  assert.equal(findings('vivreal-leadgen/agents/poison.md', 'Run `cd "$VIVREAL_REPOS/VR_CMS_API" && npm test`.\n').length, 1);
});

test('REFUSE: inline PowerShell Set-Location into a clone is a finding', () => {
  assert.equal(findings('vivreal-principal/agents/poison.md', 'Run `Set-Location "$env:VIVREAL_REPOS/VR_CMS_API"; git status` there.\n').length, 1);
});

test('ALLOW: the same inline read through a kept worktree, a path, and a command that names no folder', () => {
  assert.equal(findings('vivreal-principal/agents/poison.md', 'First run `git -C "$VIVREAL_REPOS/_wt/VR_CMS_API-read" log -1` to read it.\n').length, 0);
  assert.equal(findings('vivreal-principal/agents/poison.md', 'The file `src/lib/x.ts` holds it.\n').length, 0);
  assert.equal(findings('vivreal-leadgen/agents/poison.md', 'Then run `git status` and `node commands/stats.js`.\n').length, 0);
});

test('ALLOW: an inline refused example under a skip mark with a reason', () => {
  const text = '<!-- guard-check: skip, a refused example shown on purpose -->\nNever `git -C "$VIVREAL_REPOS/VR_CMS_API" log`.\n';
  assert.equal(findings('vivreal-principal/agents/poison.md', text).length, 0);
});

test('every self-test case holds as a node test', () => {
  for (const [what, rel, text, want] of check.selfTestCases()) {
    assert.equal(findings(rel, text).length, want, what);
  }
});

test('REFUSE: the planted poisoned file is found in a temporary tree, alone, and never written to the real tree', () => {
  const found = check.plantedWalk();
  assert.deepEqual(found.map((f) => f.rel), ['vivreal-leadgen/agents/zz-guard-check-poison.md']);
  assert.equal(existsSync(join(ROOT, 'vivreal-leadgen', 'agents', 'zz-guard-check-poison.md')), false);
  assert.doesNotMatch(readFileSync(SCRIPT, 'utf8'), /join\(ROOT, 'vivreal-leadgen', 'agents', 'zz-guard-check-poison\.md'\)/);
});

test('the header says where a subagent starts, as the Claude Code docs do', () => {
  const head = readFileSync(SCRIPT, 'utf8').split('*/')[0];
  assert.match(head, /starts in the main\s+\*?\s*conversation's current working directory/);
  assert.doesNotMatch(head, /every other reader starts in its own worktree/);
});

test('ALLOW: the real definitions are clean', () => {
  assert.deepEqual(check.checkRepo().findings, []);
});
