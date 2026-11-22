// Run: node --test vivreal-workflow/hooks/owner-checkout-guard.test.cjs
// REFUSE and ALLOW controls for owner-checkout-guard.cjs (F641): the pure decision over injected
// folders, then the real hook spawned with the PreToolUse inputs Claude Code recorded
// (fixtures/pretooluse-recorded.json), against a scratch clone root. Nothing here touches a real
// checkout. The hq folder name is joined at run time, so this file never holds the root variable
// followed by it, which check-definitions refuses in every file.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, 'owner-checkout-guard.cjs');
const RECORDED = require('./fixtures/pretooluse-recorded.json');
const lib = () => require('./owner-checkout-guard.cjs');
const HQ = 'vivreal-hq';
const V = '$VIVREAL_REPOS';
const VB = '${VIVREAL_REPOS}';

// ------------------------------------------------------- the pure decision, on Windows paths
// A made-up drive, so the shapes Git Bash and WSL write are exercised on any machine.
const DRIVE = 'Q' + ':';
const WROOT = DRIVE + '/vr';
const CHECKOUTS = new Set(['vivreal-hq', 'vivreal_eventhandler', 'vr_cms_api-f53b', '_wt', '_ops']);
const winExists = (p) => {
  const parts = String(p).replace(/\\/g, '/').toLowerCase().split('/');
  // <drive>/vr/<first>/.git
  return parts.length === 4 && parts[3] === '.git' && CHECKOUTS.has(parts[2]) && !['_wt', '_ops'].includes(parts[2]);
};
const AGENT = 'a0123456789abcdef';
const OWNER = `${WROOT}/${HQ}`;
const WT = `${WROOT}/_wt/hq-main`;
const OUTSIDE = DRIVE + '/elsewhere';
const win = (command, over = {}) =>
  lib().decide({ command, cwd: WT, agentId: AGENT, toolName: 'Bash', root: WROOT, platform: 'win32', home: DRIVE + '/home', env: {}, exists: winExists, ...over });

const REFUSE = [
  ['the brief form: cd into the hq checkout, then git', `cd ${OWNER} && git log -1`, { cwd: OUTSIDE }],
  ['git -C the hq checkout show', `git -C ${OWNER} show origin/main:docs/standards/INDEX.md`, {}],
  ['GIT_DIR set to the checkout .git, then git log', `GIT_DIR=${OWNER}/.git git log`, {}],
  ['a bare git status whose cwd is the checkout', 'git status', { cwd: OWNER }],
  ['the root variable, bare', `git -C "${V}/${HQ}" fetch origin`, { env: {} }],
  ['the root variable, braced', `cd "${VB}/${HQ}" && git status`, {}],
  ['the PowerShell root variable', `Set-Location "$env:VIVREAL_REPOS/${HQ}"; git status`, { toolName: 'PowerShell' }],
  ['a Git Bash drive path', `cd /q/vr/${HQ} && git status`, {}],
  ['a WSL drive path inside wsl.exe -e bash -lc', `wsl.exe -e bash -lc 'cd /mnt/q/vr/${HQ} && npm ci'`, {}],
  ['a Windows backslash path in PowerShell', `Set-Location -Path ${DRIVE}\\vr\\${HQ}; git log`, { toolName: 'PowerShell' }],
  ['pushd', `pushd ${OWNER} && git log`, {}],
  ['--git-dir=', `git --git-dir=${OWNER}/.git log`, {}],
  ['--work-tree=', `git --work-tree=${OWNER} status`, {}],
  ['export GIT_DIR, then git', `export GIT_DIR=${OWNER}/.git; git log`, {}],
  ['PowerShell $env:GIT_DIR, then git', `$env:GIT_DIR = '${OWNER}/.git'; git log`, { toolName: 'PowerShell' }],
  ['a command substitution', `test -z "$(git -C ${OWNER} status --porcelain)" && echo clean`, {}],
  ['a later segment, after a worktree cd', `cd ${WT} && git -C ${OWNER} log`, { cwd: OUTSIDE }],
  ['an owner git -C before a worktree one (a last-only reading would pass it)', `git -C ${OWNER} show HEAD; git -C ${WT} log`, {}],
  ['a subfolder of the checkout', `cd ${OWNER}/packages/fleet-ops && node x.js`, {}],
  ['another repository checkout', `cd ${WROOT}/Vivreal_EventHandler && npm test`, {}],
  ['a sibling-named worktree outside _wt', `cd ${WROOT}/VR_CMS_API-f53b && git status`, {}],
  ['a relative path up to the checkout', `cd ../../${HQ} && git log`, {}],
  ['a variable set in the same command', `W="${V}/${HQ}"\ncd "$W" && git log`, {}],
  ['npm with no cd, cwd the checkout', 'npm test', { cwd: OWNER }],
  ['a git -C relative to the root', `cd ${WROOT} && git -C ${HQ} log`, {}],
];
for (const [name, command, over] of REFUSE) {
  test(`REFUSE (subagent): ${name}`, () => {
    const d = win(command, over);
    assert.equal(d.refuse, true, `not refused: ${command}`);
    // The refused folder is under the root and outside _wt/ and _ops/.
    const rel = d.folder.slice(WROOT.toLowerCase().length + 1);
    assert.ok(d.folder.startsWith(WROOT.toLowerCase() + '/') && rel && !/^_(wt|ops)(\/|$)/.test(rel), d.folder);
  });
}

const ALLOW = [
  ['cd into a worktree first, cwd the checkout', `cd ${WT} && git log -1`, { cwd: OWNER }],
  ['the kept hq worktree through the root variable', `git -C "${V}/_wt/hq-main" show origin/main:docs/standards/INDEX.md`, { cwd: OUTSIDE }],
  ['an _ops folder', `cd ${WROOT}/_ops/release-c && node apply.js --dry-run`, { cwd: OWNER }],
  ['git -C a worktree from the checkout cwd (its effective folder)', `git -C ${WT} status`, { cwd: OWNER }],
  ['a command outside the clone root', 'ls -la', { cwd: OUTSIDE }],
  ['cd outside the clone root', `cd ${OUTSIDE} && git status`, { cwd: OWNER }],
  ['the clone root itself', `cd ${WROOT} && ls`, { cwd: OUTSIDE }],
  ['a folder under the root that is not a checkout', `cd ${WROOT}/_scratch && ls`, { cwd: OUTSIDE }],
  ['variables first, then a worktree cd', `export MSYS_NO_PATHCONV=1 && cd ${WT} && git log`, { cwd: OWNER }],
  ['reading a file in the checkout from a worktree runs nothing there', `cd ${WT} && cat ${OWNER}/CLAUDE.md`, { cwd: OWNER }],
  ['a WSL step that changes into a worktree first', `cd ${WT} && wsl.exe -e bash -lc 'cd /mnt/q/vr/_wt/hq-main && npm ci'`, { cwd: OWNER }],
  ['a heredoc body is data', `cd ${WT} && cat > notes.txt <<'EOF'\ncd ${OWNER} && git log\nEOF`, { cwd: OWNER }],
  ['the name with a dash is another folder', `cd ${WROOT}/${HQ}-archive && ls`, { cwd: OUTSIDE }],
];
for (const [name, command, over] of ALLOW) {
  test(`ALLOW (subagent): ${name}`, () => {
    assert.deepEqual(win(command, over), { refuse: false }, `refused: ${command}`);
  });
}

test('ALLOW: the main thread (no agent_id) runs every REFUSE form', () => {
  for (const [, command, over] of REFUSE) {
    assert.deepEqual(win(command, { ...over, agentId: undefined }), { refuse: false }, command);
    assert.deepEqual(win(command, { ...over, agentId: '' }), { refuse: false }, command);
  }
});

test('ALLOW: no clone root found, or no command', () => {
  assert.deepEqual(win('git status', { cwd: OWNER, root: null }), { refuse: false });
  assert.deepEqual(win('', { cwd: OWNER }), { refuse: false });
});

// ------------------------------------------------- the real hook, with the recorded inputs
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-owner-guard-'));
const hq = path.join(root, HQ);
fs.mkdirSync(path.join(hq, '.git'), { recursive: true });
const wt = path.join(root, '_wt', 'hq-main');
fs.mkdirSync(wt, { recursive: true });
fs.writeFileSync(path.join(wt, '.git'), 'gitdir: elsewhere\n');
const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'not-vivreal-'));
test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(elsewhere, { recursive: true, force: true });
});

function fill(recorded, { cwd, command, toolName }) {
  const input = JSON.parse(JSON.stringify(recorded));
  input.cwd = cwd;
  input.tool_input.command = command;
  if (toolName) input.tool_name = toolName;
  if ('agent_id' in input) input.agent_id = AGENT;
  return input;
}
function run(input) {
  const env = { ...process.env, VIVREAL_REPOS: root };
  delete env.CLAUDE_PROJECT_DIR;
  const res = spawnSync(process.execPath, [HOOK], { input: JSON.stringify(input), encoding: 'utf8', env });
  return { status: res.status, stdout: res.stdout };
}

test('U-SK1: the recorded inputs carry agent_id on the subagent call only', () => {
  assert.equal('agent_id' in RECORDED.mainThread, false);
  assert.equal('agent_type' in RECORDED.mainThread, false);
  assert.equal(typeof RECORDED.subagent.agent_id, 'string');
  assert.equal(RECORDED.subagent.agent_type, 'general-purpose');
  for (const r of [RECORDED.mainThread, RECORDED.subagent]) {
    assert.equal(r.hook_event_name, 'PreToolUse');
    assert.equal(r.tool_name, 'Bash');
    assert.equal(typeof r.cwd, 'string');
    assert.equal(typeof r.tool_input.command, 'string');
  }
});

test('REFUSE (spawned, recorded subagent input): a bare git status in the hq checkout', () => {
  const r = run(fill(RECORDED.subagent, { cwd: hq, command: 'git status' }));
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /owner-checkout guard \(F641\)/);
  assert.match(out.permissionDecisionReason, /_wt\/<your worktree>/);
});

test('REFUSE (spawned, recorded subagent input, PowerShell): Set-Location into the hq checkout', () => {
  const r = run(fill(RECORDED.subagent, { cwd: elsewhere, command: `Set-Location '${hq}'; git log`, toolName: 'PowerShell' }));
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('ALLOW (spawned, recorded main-thread input): the same bare git status', () => {
  const r = run(fill(RECORDED.mainThread, { cwd: hq, command: 'git status' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('ALLOW (spawned, recorded subagent input): cd into the kept worktree first', () => {
  const r = run(fill(RECORDED.subagent, { cwd: hq, command: `cd "${wt}" && git status` }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

test('ALLOW (spawned): outside the clone root, and a malformed input fails open', () => {
  assert.equal(run(fill(RECORDED.subagent, { cwd: elsewhere, command: 'git status' })).stdout, '');
  const res = spawnSync(process.execPath, [HOOK], { input: '{not json', encoding: 'utf8' });
  assert.equal(res.status, 0);
  assert.equal(res.stdout, '');
});

test('hooks.json runs the guard on Bash and PowerShell before the tool', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
  const entry = (cfg.hooks.PreToolUse || []).find((e) => e.hooks.some((h) => /owner-checkout-guard\.cjs/.test(h.command)));
  assert.ok(entry, 'no PreToolUse entry runs owner-checkout-guard.cjs');
  assert.equal(entry.matcher, 'Bash|PowerShell');
});
