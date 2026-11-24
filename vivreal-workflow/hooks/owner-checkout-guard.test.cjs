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
// Clones (a `.git` directory) at the root, and linked worktrees (a `.git` file) outside `_wt/`:
// a sibling-named worktree and an `isolation: worktree` subagent's folder inside the hq clone.
const CLONES = new Set([
  'vivreal-hq', 'vivreal_eventhandler', 'vr_cms_api', 'vr_secure_api', 'vr_main_api',
  'vivreal_portal_mobile', 'vivreal_templates', 'vivreal_site_migrator', 'vivreal-skills',
]);
const LINKED = new Set(['vr_cms_api-f53b', `${HQ}/.claude/worktrees/agent-1`]);
const winKind = (p) => {
  const rel = String(p).replace(/\\/g, '/').toLowerCase().split('/').slice(2);
  if (rel[rel.length - 1] !== '.git') return null;
  const dir = rel.slice(0, -1).join('/');
  if (CLONES.has(dir)) return 'dir';
  if (LINKED.has(dir)) return 'file';
  return null;
};
const AGENT = 'a0123456789abcdef';
const OWNER = `${WROOT}/${HQ}`;
const WT = `${WROOT}/_wt/hq-main`;
const OUTSIDE = DRIVE + '/elsewhere';
// Folders a `cd` is told do not exist (pass 2): every other folder these tests name exists.
const MISSING = new Set([`${WROOT}/_wt/missing`, `${WROOT}/_wt/other`, `${WROOT}/Vivreal_Site_Migrator/captures/k/preview`].map((p) => p.toLowerCase()));
const isDir = (p) => !MISSING.has(String(p).toLowerCase());
const win = (command, over = {}) =>
  lib().decide({ command, cwd: WT, agentId: AGENT, toolName: 'Bash', root: WROOT, platform: 'win32', home: DRIVE + '/home', env: {}, kindOf: winKind, isDir, ...over });

const REFUSE = [
  ['the brief form: cd into the hq checkout, then git', `cd ${OWNER} && git log -1`, { cwd: OUTSIDE }],
  ['git -C the hq checkout show', `git -C ${OWNER} show origin/main:docs/standards/INDEX.md`, {}],
  ['GIT_DIR set to the checkout .git, then git log', `GIT_DIR=${OWNER}/.git git log`, {}],
  ['a bare git status whose cwd is the checkout', 'git status', { cwd: OWNER }],
  ['the root variable, bare', `git -C "${V}/${HQ}" show origin/main:CLAUDE.md`, { env: {} }],
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

// ------------------------------------------------- the one-off clone form (fetch, worktree add)
const CMS = `${WROOT}/VR_CMS_API`;
const ONE_OFF_ALLOW = [
  ['git -C <clone> fetch', `git -C ${CMS} fetch origin`],
  ['git -C <clone> fetch --prune, through the root variable', `git -C "${V}/VR_CMS_API" fetch --prune origin`],
  ['git -C <clone> worktree add --detach under _wt', `git -C ${CMS} worktree add --detach "${V}/_wt/VR_CMS_API-read" origin/stable`],
  ['worktree add -b <branch> --no-track, a path relative to the clone', `git -C ${CMS} worktree add -b fix/x --no-track ../_wt/cms-fix origin/main`],
  ['worktree add under _ops', `git -C ${CMS} worktree add --detach ${WROOT}/_ops/release-c/cms origin/stable`],
  ['the hq clone too, into the kept hq worktree', `git -C "${V}/${HQ}" worktree add --detach "${V}/_wt/hq-main" origin/main`],
  ['fetch then add, chained', `git -C ${CMS} fetch origin && git -C ${CMS} worktree add --detach ${WROOT}/_wt/c origin/stable`],
];
for (const [name, command] of ONE_OFF_ALLOW) {
  test(`ALLOW (subagent, one-off clone form): ${name}`, () => {
    assert.deepEqual(win(command, { cwd: OUTSIDE }), { refuse: false }, command);
  });
}
const ONE_OFF_REFUSE = [
  ['worktree add outside _wt and _ops', `git -C ${CMS} worktree add --detach ${OUTSIDE}/cms origin/stable`],
  ['worktree add into another clone', `git -C ${CMS} worktree add --detach ${WROOT}/VR_Main_API/x origin/stable`],
  ['worktree add of the _wt folder itself', `git -C ${CMS} worktree add --detach ${WROOT}/_wt origin/stable`],
  ['worktree add with no path', `git -C ${CMS} worktree add`],
  ['worktree remove', `git -C ${CMS} worktree remove --force ${WROOT}/_wt/c`],
  ['worktree list', `git -C ${CMS} worktree list`],
  ['ls-remote', `git -C ${CMS} ls-remote origin refs/heads/stable`],
  ['fetch after a cd into the clone (not the -C form)', `cd ${CMS} && git fetch origin`],
  ['fetch with --git-dir set too', `git -C ${CMS} --git-dir=${CMS}/.git fetch origin`],
  ['a fetch that is fine, then a show in the clone', `git -C ${CMS} fetch origin && git -C ${CMS} show origin/stable:package.json`],
];
for (const [name, command] of ONE_OFF_REFUSE) {
  test(`REFUSE (subagent, not the one-off form): ${name}`, () => {
    assert.equal(win(command, { cwd: OUTSIDE }).refuse, true, command);
  });
}

// ------------------------------------------------- data-bearing fleets in their own clone
const MIG = `${WROOT}/Vivreal_Site_Migrator`;
test('ALLOW: a leadgen agent runs its own tools in packages/leadgen of the hq clone', () => {
  for (const agentType of ['vivreal-leadgen:profiler', 'vivreal-leadgen:runner']) {
    assert.deepEqual(win('cd packages/leadgen && node commands/validate.js --has-profile --limit 1000', { cwd: OWNER, agentType }), { refuse: false }, agentType);
    assert.deepEqual(win('node commands/outreach-contact.js search --company X', { cwd: `${OWNER}/packages/leadgen`, agentType }), { refuse: false }, agentType);
  }
});
test('ALLOW: a site-migrator agent runs its own tools in the Vivreal_Site_Migrator clone', () => {
  const cmd = 'node commands/assemble-blueprint.js captures/kit --group "Vertical" --gap-policy block';
  assert.deepEqual(win(cmd, { cwd: MIG, agentType: 'vivreal-site-migrator:kit-designer' }), { refuse: false });
});
const FLEET_REFUSE = [
  ['a leadgen agent running git in the hq clone', 'git status', OWNER, 'vivreal-leadgen:runner'],
  ['a content agent running git -C the hq clone show', `git -C ${OWNER} show origin/main:CLAUDE.md`, OUTSIDE, 'vivreal-content:help-page-producer'],
  ['a leadgen agent in another clone', `cd ${CMS} && npm test`, OWNER, 'vivreal-leadgen:runner'],
  ['a site-migrator agent in the hq clone', 'node x.js', OWNER, 'vivreal-site-migrator:cutover'],
  ['a site-migrator agent in the Secure clone (the old cutover step)', `cd ${WROOT}/VR_Secure_API && node scripts/audit-group-key.js`, MIG, 'vivreal-site-migrator:cutover'],
  ['a site-migrator agent in the Templates clone (the old dev:linked step)', `cd ${WROOT}/Vivreal_Templates && npm run dev:linked`, MIG, 'vivreal-site-migrator:kit-designer'],
  ['a site-migrator agent in the portal clone (the old studio-registrar place)', 'npx vitest run tests/unit', `${WROOT}/Vivreal_Portal_Mobile`, 'vivreal-site-migrator:studio-registrar'],
  ['a general-purpose agent in the hq clone', 'node commands/validate.js', `${OWNER}/packages/leadgen`, 'general-purpose'],
  ['a coder in the hq clone', 'node commands/validate.js', OWNER, 'vivreal-principal:coder'],
  ['a look-alike plugin name', 'node x.js', OWNER, 'vivreal-leadgen-extra:runner'],
  ['a plugin name with no agent part', 'node x.js', OWNER, 'vivreal-leadgen'],
];
for (const [name, command, cwd, agentType] of FLEET_REFUSE) {
  test(`REFUSE (subagent): ${name}`, () => {
    assert.equal(win(command, { cwd, agentType }).refuse, true, `${agentType}: ${command}`);
  });
}

test('REFUSE: a comment hides nothing that runs, and a commented-out command does not count', () => {
  assert.deepEqual(win(`cd ${WT} && ls   # never cd ${OWNER} (a note)`, { cwd: OWNER }), { refuse: false });
  assert.equal(win(`# a note\ncd ${OWNER} && git log`, { cwd: OUTSIDE }).refuse, true);
});

// ------------------------------------------------- every repointed instruction, as written
// Each row is the command shape a changed definition now tells a subagent to run, run from the
// worst starting folder it can have (the clone a session is usually opened in), with the
// agent_type that definition runs as. Each must be ALLOWED; the old shape beside it is REFUSED.
const SEC = `${WROOT}/VR_Secure_API`;
const SHAPES = [
  {
    def: 'shared-standards SKILL.md: hq ref read',
    agentType: 'vivreal-principal:researcher',
    cwd: OWNER,
    now: `git -C "${V}/_wt/hq-main" fetch origin && git -C "${V}/_wt/hq-main" show origin/main:docs/standards/INDEX.md`,
    old: `git -C "${V}/${HQ}" show origin/main:docs/standards/INDEX.md`,
  },
  {
    def: 'shared-standards SKILL.md: bring the kept hq worktree to origin/main',
    agentType: 'vivreal-principal:researcher',
    cwd: OWNER,
    now: `cd "${V}/_wt/hq-main" && test -z "$(git status --porcelain)" && git checkout --detach origin/main`,
    old: `test -z "$(git -C "${V}/${HQ}" status --porcelain)" && git -C "${V}/${HQ}" checkout --detach origin/main`,
  },
  {
    def: 'shared-standards SKILL.md: a kept read worktree per repo (the one-off form)',
    agentType: 'vivreal-principal:researcher',
    cwd: OWNER,
    now: `git -C "${V}/VR_CMS_API" fetch origin && git -C "${V}/VR_CMS_API" worktree add --detach "${V}/_wt/VR_CMS_API-read" origin/stable`,
    old: `cd "${V}/VR_CMS_API" && git fetch origin && git show origin/stable:package.json`,
  },
  {
    def: 'shared-standards SKILL.md: .env.local from fetch-env-local',
    agentType: 'vivreal-principal:coder',
    cwd: OWNER,
    now: `cd "${V}/_wt/cms-fix" && node "${V}/_wt/hq-main/packages/fleet-ops/onboarding/fetch-env-local.js" cms .`,
    old: `node "${V}/${HQ}/packages/fleet-ops/onboarding/fetch-env-local.js" cms "${V}/VR_CMS_API"`,
  },
  {
    def: 'coder.md, architect.md, researcher.md, portal-coder.md: docs:route from the kept hq worktree',
    agentType: 'vivreal-principal:coder',
    cwd: OWNER,
    now: `cd "${VB}/_wt/hq-main" && npm run docs:route -- "checkout"`,
    old: `cd "${VB}/${HQ}" && npm run docs:route -- "checkout"`,
  },
  {
    def: 'coder.md: a fresh worktree; package-publisher.md: a consumer worktree',
    agentType: 'vivreal-principal:coder',
    cwd: CMS,
    now: `git -C "${V}/VR_CMS_API" fetch origin && git -C "${V}/VR_CMS_API" worktree add -b fix/x --no-track "${V}/_wt/cms-fix" origin/main`,
    old: 'git fetch origin && git worktree add -b fix/x --no-track ../cms-fix origin/main',
  },
  {
    def: 'coder.md, testing.md: a pinned sibling worktree',
    agentType: 'vivreal-principal:portal-coder',
    cwd: `${WROOT}/_wt/pc-x`,
    now: `git -C "${V}/VR_Client_API" fetch origin && git -C "${V}/VR_Client_API" worktree add --detach "${V}/_wt/client-pin" origin/stable`,
    old: `git -C "${V}/VR_CMS_API" worktree add --detach ../client-pin origin/stable`,
  },
  {
    def: 'portal-coder.md: SOLO step 1 fresh worktree',
    agentType: 'vivreal-principal:portal-coder',
    cwd: `${WROOT}/Vivreal_Portal_Mobile`,
    now: `git -C "${V}/Vivreal_Portal_Mobile" fetch origin && git -C "${V}/Vivreal_Portal_Mobile" worktree add -b fix/y --no-track "${V}/_wt/pc-y" origin/main`,
    old: 'git fetch origin && git worktree add -b fix/y --no-track ../pc-y origin/main',
  },
  {
    def: 'portal-coder.md: doctor from the kept hq worktree',
    agentType: 'vivreal-principal:portal-coder',
    cwd: OWNER,
    now: `cd "${V}/_wt/hq-main" && node packages/fleet-ops/onboarding/doctor.js --repo portal`,
    old: `cd "${V}/${HQ}" && node packages/fleet-ops/onboarding/doctor.js --repo portal`,
  },
  {
    def: 'package-publisher.md, cutover.md, template.md, vivreal-migrator-knowledge: the portal reach at a ref',
    agentType: 'vivreal-site-migrator:cutover',
    cwd: MIG,
    now: `git -C "${V}/_wt/Vivreal_Portal_Mobile-read" show origin/stable:src/data/generated/blank-buildable-reach.json > reach.json`,
    old: `git -C "${V}/Vivreal_Portal_Mobile" show origin/stable:src/data/generated/blank-buildable-reach.json > reach.json`,
  },
  {
    def: 'cutover.md, template.md: the census from the kept hq worktree',
    agentType: 'vivreal-site-migrator:cutover',
    cwd: MIG,
    now: `cd "${V}/_wt/hq-main" && node packages/fleet-ops/blank-buildable/cli.js --sites snap --reach reach.json --by-site`,
    old: `cd "${V}/${HQ}" && node packages/fleet-ops/blank-buildable/cli.js --sites snap --reach reach.json --by-site`,
  },
  {
    def: 'cutover.md: the group key audit in Secure\'s kept tool worktree',
    agentType: 'vivreal-site-migrator:cutover',
    cwd: MIG,
    now: [
      `W="${V}/_wt/VR_Secure_API-ops"`,
      `git -C "${V}/VR_Secure_API" fetch origin`,
      `cd "${V}/_wt" && { test -e "$W/.git" || git -C "${V}/VR_Secure_API" worktree add --detach "$W" origin/stable; }`,
      'cd "$W" && test -z "$(git status --porcelain)" && git checkout --detach origin/stable',
      `cd "$W" && { test -e .env || cp "${V}/VR_Secure_API/.env" .env; } && npm ci`,
      'cd "$W" && node scripts/audit-group-key.js',
    ].join('\n'),
    old: `cd ${SEC} && node scripts/audit-group-key.js`,
  },
  {
    def: 'cutover.md: provisioning in Main\'s kept tool worktree',
    agentType: 'vivreal-site-migrator:cutover',
    cwd: MIG,
    now: [
      `W="${V}/_wt/VR_Main_API-ops"`,
      `git -C "${V}/VR_Main_API" fetch origin`,
      `cd "${V}/_wt" && { test -e "$W/.git" || git -C "${V}/VR_Main_API" worktree add --detach "$W" origin/stable; }`,
      'cd "$W" && test -z "$(git status --porcelain)" && git checkout --detach origin/stable',
      `cd "$W" && { test -e .env || cp "${V}/VR_Main_API/.env" .env; } && npm ci`,
      'cd "$W" && node src/hbcreations/scripts/provisionDemoAccount.js --email a@b.c --first A --last B --group-name "Brand"',
    ].join('\n'),
    old: `cd ${WROOT}/VR_Main_API\nnode src/hbcreations/scripts/provisionDemoAccount.js --email a@b.c`,
  },
  {
    def: 'template.md: Round A, the kit bundle in the migrator clone and the preview in a Templates worktree',
    agentType: 'vivreal-site-migrator:kit-designer',
    cwd: MIG,
    now: [
      'node commands/assemble-blueprint.js captures/kit --group "Vertical" --gap-policy block   # gotcha L',
      'node commands/preview-bundle.js captures/kit/blueprint.json --out captures/kit/preview',
      `cd ${VB}/_wt/Vivreal_Templates-preview && NEXT_PUBLIC_CLIENT_API=http://127.0.0.1:8799 SITE_ID=preview API_KEY=dev npm run dev:linked   # bg; browse localhost:3000 (never 127.0.0.1)`,
    ].join('\n'),
    old: `cd ${VB}/Vivreal_Templates && NEXT_PUBLIC_CLIENT_API=http://127.0.0.1:8799 SITE_ID=preview API_KEY=dev npm run dev:linked`,
  },
  {
    def: 'studio-registrar.md: work in a portal worktree',
    agentType: 'vivreal-site-migrator:studio-registrar',
    cwd: MIG,
    now: `cd "${VB}/_wt/portal-registration" && npx vitest run tests/unit/studio`,
    old: `cd "${VB}/Vivreal_Portal_Mobile" && npx vitest run tests/unit/studio`,
  },
  {
    def: 'skills-sync.md: the drift monitor in a scratch worktree',
    agentType: 'general-purpose',
    cwd: OWNER,
    now: `git -C "${V}/vivreal-skills" fetch origin && git -C "${V}/vivreal-skills" worktree add --detach "${V}/_wt/skills-drift" origin/main && cd "${V}/_wt/skills-drift" && node scripts/skill-drift.mjs --json`,
    old: `cd "${VB}/vivreal-skills" && git fetch origin && git worktree add --detach ../skills-drift origin/main`,
  },
  {
    def: 'vuln.md: the deployed ref, read in the repo\'s kept read worktree',
    agentType: 'vivreal-workflow:vuln',
    cwd: OWNER,
    now: `git -C "${V}/VR_CMS_API" fetch --prune origin && cd "${V}/_wt/VR_CMS_API-read" && git ls-remote origin refs/heads/stable && git rev-parse origin/stable && git show origin/stable:package-lock.json > lock.json`,
    old: `git -C "${V}/VR_CMS_API" fetch --prune origin && git -C "${V}/VR_CMS_API" ls-remote origin refs/heads/stable`,
  },
  {
    def: 'researcher.md: a research worktree',
    agentType: 'vivreal-principal:researcher',
    cwd: OWNER,
    now: `git -C "${V}/VR_Main_API" worktree add --detach "${V}/_wt/main-research" origin/stable && cd "${V}/_wt/main-research" && git log -5 --oneline`,
    old: 'git worktree add --detach ../main-research origin/stable',
  },
  {
    def: 'vivreal-ops.md, vivreal-atlas-topology: the deployed atlas-read copy',
    agentType: 'vivreal-ops:vivreal-ops',
    cwd: OWNER,
    now: [
      '# Start in the kept hq worktree (shared-standards, Path resolution): nothing runs in a clone.',
      `hq="${V}/_wt/hq-main"`,
      'cd "$hq" || { echo "make the kept hq worktree first (shared-standards, Path resolution)"; exit 1; }',
      'git -C "$hq" fetch origin --quiet',
      'tmp="$(mktemp -d)"',
      'git -C "$hq" archive -o "$tmp/atlas-read.tar" origin/main packages/fleet-ops/atlas-read',
      'tar -xf "$tmp/atlas-read.tar" -C "$tmp"',
      'node "$tmp/packages/fleet-ops/atlas-read/atlas-read.js" --period P5D --granularity PT1H',
      'rm -rf "$tmp"',
    ].join('\n'),
    old: `hq="${V}/${HQ}"\ngit -C "$hq" archive -o atlas-read.tar origin/main packages/fleet-ops/atlas-read`,
  },
  {
    def: 'vivreal-ops.md, vivreal-atlas-topology: check:atlas',
    agentType: 'vivreal-ops:vivreal-ops',
    cwd: OWNER,
    now: `cd "${V}/_wt/hq-main" && npm run check:atlas --workspace packages/fleet-ops -- --period P1D --granularity PT5M`,
    old: 'npm run check:atlas --workspace packages/fleet-ops',
  },
  {
    def: 'release-engineer.md: fleet-rollout from the kept hq worktree',
    agentType: 'vivreal-workflow:release-engineer',
    cwd: OWNER,
    now: `cd "${V}/_wt/hq-main" && node packages/fleet-ops/fleet-rollout/cli.js --dry-run`,
    old: `node "${V}/${HQ}/packages/fleet-ops/fleet-rollout/cli.js" --dry-run`,
  },
  {
    def: 'marketing-auditor.md: the voice pre-pass',
    agentType: 'vivreal-product:marketing-auditor',
    cwd: OWNER,
    now: `cd "${V}/_wt/hq-main/packages/content-studio" && node scripts/voice-check.mjs draft.md`,
    old: 'node scripts/voice-check.mjs draft.md',
  },
  {
    def: 'evals README: the corpus trees',
    agentType: 'vivreal-agent-review:definition-reviewer',
    cwd: OWNER,
    now: `cd ${OUTSIDE}/scratch && git -C ${VB}/_wt/hq-main archive 29b9404 | tar -x -C ${OUTSIDE}/scratch/hq-before`,
    old: `git -C ${VB}/${HQ} archive 29b9404 | tar -x -C ${OUTSIDE}/scratch/hq-before`,
  },
  {
    def: 'session-rules.cjs: the commands it prints',
    agentType: 'vivreal-principal:coder',
    cwd: OWNER,
    now: `git -C "${WROOT}/_wt/hq-main" fetch origin && git -C "${WROOT}/_wt/hq-main" show origin/main:docs/standards/live-values.md`,
    old: `git -C "${V}/${HQ}" show origin/main:docs/standards/live-values.md`,
  },
  {
    def: 'tutorial-maker.md: the CDP Chrome and --out (content fleet, hq clone)',
    agentType: 'vivreal-content:tutorial-maker',
    cwd: OWNER,
    now: `cd packages/content-studio && chrome.exe --mute-audio --remote-debugging-port=9222 --user-data-dir=${VB}/_wt/hq-main/.agent-cache/tutorial-profiles/chrome-cdp`,
    old: `git -C "${V}/${HQ}" status`,
  },
  {
    def: 'profiler.md (leadgen fleet, hq clone): validate',
    agentType: 'vivreal-leadgen:profiler',
    cwd: OWNER,
    now: 'cd packages/leadgen && node commands/validate.js --has-profile --limit 1000',
    old: 'cd packages/leadgen && git log -1',
  },
];
for (const s of SHAPES) {
  test(`ALLOW (repointed instruction, ${s.agentType}): ${s.def}`, () => {
    const d = win(s.now, { cwd: s.cwd, agentType: s.agentType });
    assert.deepEqual(d, { refuse: false }, `refused at ${d.folder}: ${s.now}`);
  });
  test(`REFUSE (the old instruction, ${s.agentType}): ${s.def}`, () => {
    assert.equal(win(s.old, { cwd: s.cwd, agentType: s.agentType }).refuse, true, s.old);
  });
}

// ------------------------------------------------- the real hook, with the recorded inputs
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-owner-guard-'));
const hq = path.join(root, HQ);
fs.mkdirSync(path.join(hq, '.git'), { recursive: true });
const wt = path.join(root, '_wt', 'hq-main');
fs.mkdirSync(wt, { recursive: true });
fs.writeFileSync(path.join(wt, '.git'), 'gitdir: elsewhere\n');
// An `isolation: worktree` subagent's folder: a linked worktree inside the hq clone.
const iso = path.join(hq, '.claude', 'worktrees', 'agent-1');
fs.mkdirSync(path.join(iso, 'src'), { recursive: true });
fs.writeFileSync(path.join(iso, '.git'), 'gitdir: elsewhere\n');
fs.mkdirSync(path.join(hq, 'packages', 'leadgen'), { recursive: true });
fs.mkdirSync(path.join(root, 'Vivreal_Site_Migrator', '.git'), { recursive: true });
const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'not-vivreal-'));
test.after(() => {
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(elsewhere, { recursive: true, force: true });
});

function fill(recorded, { cwd, command, toolName, agentType }) {
  const input = JSON.parse(JSON.stringify(recorded));
  input.cwd = cwd;
  input.tool_input.command = command;
  if (toolName) input.tool_name = toolName;
  if (agentType) input.agent_type = agentType;
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

// ------------------------------------------------- definition review pass 1 (review-c-sk.md)
// guard-one-off: the one-off form is only a plain fetch or a plain worktree add.
const PASS1_ONE_OFF_REFUSE = [
  ['-c before the subcommand', `git -c core.sshCommand=evil -C ${CMS} fetch origin`],
  ['-c after -C', `git -C ${CMS} -c core.sshCommand=evil fetch origin`],
  ['--config-env before the subcommand', `git --config-env=core.sshCommand=X -C ${CMS} fetch origin`],
  ['--upload-pack=', `git -C ${CMS} fetch --upload-pack='touch x' .`],
  ['--upload-pack with a separate value', `git -C ${CMS} fetch --upload-pack 'touch x' .`],
  ['--update-head-ok', `git -C ${CMS} fetch --update-head-ok origin`],
  ['-u, the short --update-head-ok', `git -C ${CMS} fetch -u origin`],
  ['-u joined to another letter', `git -C ${CMS} fetch -uq origin`],
  ['a refspec writing refs/heads', `git -C ${CMS} fetch origin +x:refs/heads/main`],
  ['the +x:main shorthand', `git -C ${CMS} fetch origin +x:main`],
  ['a shorthand branch with no plus', `git -C ${CMS} fetch origin stable:stable`],
  ['a refspec writing refs/tags', `git -C ${CMS} fetch origin '+refs/tags/*:refs/tags/*'`],
  ['--prune-tags (deletes local-only tags)', `git -C ${CMS} fetch --prune-tags origin`],
  ['--depth (makes a full clone shallow)', `git -C ${CMS} fetch --depth 1 origin`],
  ['--filter (marks the remote a promisor in the clone config)', `git -C ${CMS} fetch --filter=blob:none origin`],
  ['a refspec target that climbs out of refs/remotes', `git -C ${CMS} fetch origin x:refs/remotes/../heads/main`],
  ['--jobs swallowing an option as its value', `git -C ${CMS} fetch --jobs -u origin`],
  ['a remote helper transport', `git -C ${CMS} fetch 'ext::sh -c touch% x' main`],
  ['a remote helper as a second remote with --multiple', `git -C ${CMS} fetch --multiple origin ext::helper`],
  ['an unlisted fetch option', `git -C ${CMS} fetch --recurse-submodules=yes origin`],
  ['worktree add -f', `git -C ${CMS} worktree add -f ${WROOT}/_wt/c origin/main`],
  ['worktree add --force', `git -C ${CMS} worktree add --force ${WROOT}/_wt/c origin/main`],
  ['worktree add -B (resets an existing branch)', `git -C ${CMS} worktree add -B main ${WROOT}/_wt/c origin/main`],
  ['worktree add -f -B main, together', `git -C ${CMS} worktree add -f -B main ${WROOT}/_wt/c`],
  ['worktree add with -B after the path', `git -C ${CMS} worktree add ${WROOT}/_wt/c -B main`],
  ['worktree add with -f after the commit', `git -C ${CMS} worktree add ${WROOT}/_wt/c origin/main -f`],
  ['worktree add --reason does not hide a -B after it', `git -C ${CMS} worktree add --lock --reason -B ${WROOT}/_wt/c main`],
  ['worktree add --orphan does not hide a -f after it', `git -C ${CMS} worktree add --orphan -f ${WROOT}/_wt/c`],
  ['a GIT_ variable set for the fetch', `GIT_SSH_COMMAND=evil git -C ${CMS} fetch origin`],
  ['a GIT_ variable exported in an earlier segment', `export GIT_SSH_COMMAND=evil; git -C ${CMS} fetch origin`],
  ['a GIT_ variable set through env', `env GIT_SSH_COMMAND=evil git -C ${CMS} fetch origin`],
];
for (const [name, command] of PASS1_ONE_OFF_REFUSE) {
  test(`REFUSE (subagent, pass 1 guard-one-off): ${name}`, () => {
    assert.equal(win(command, { cwd: OUTSIDE }).refuse, true, command);
  });
}
const PASS1_ONE_OFF_ALLOW = [
  ['a plain fetch', `git -C ${CMS} fetch origin`],
  ['fetch --prune --tags --jobs 4 --quiet', `git -C ${CMS} fetch --prune --tags --jobs 4 origin --quiet`],
  ['a refspec into refs/remotes', `git -C ${CMS} fetch origin +refs/heads/stable:refs/remotes/origin/stable`],
  ['a plain worktree add into _wt', `git -C ${CMS} worktree add ${WROOT}/_wt/c origin/main`],
  ['worktree add -b (a new branch, which fails if it exists)', `git -C ${CMS} worktree add -b fix/z --no-track ${WROOT}/_wt/z origin/main`],
  ['worktree add with --detach after the path', `git -C ${CMS} worktree add ${WROOT}/_wt/c --detach origin/main`],
  ['worktree add with -- before the path', `git -C ${CMS} worktree add --detach -- ${WROOT}/_wt/c origin/main`],
  ['worktree add --lock --reason with a plain value', `git -C ${CMS} worktree add --lock --reason held --detach ${WROOT}/_wt/c origin/main`],
  ['worktree add --orphan -b (an unborn branch)', `git -C ${CMS} worktree add --orphan -b fresh ${WROOT}/_wt/fresh`],
  ['a non-GIT_ variable set for the fetch', `LC_ALL=C git -C ${CMS} fetch origin`],
];
for (const [name, command] of PASS1_ONE_OFF_ALLOW) {
  test(`ALLOW (subagent, pass 1 guard-one-off): ${name}`, () => {
    assert.deepEqual(win(command, { cwd: OUTSIDE }), { refuse: false }, command);
  });
}

// L-C-39 (shared-standards references/git-network.md): the network git forms the skill writes, as
// a subagent's Bash call starts them, in an owner checkout.
const GIT_NETWORK_ALLOW = [
  ['the default: a fetch in your own worktree with no prompt and a deadline',
    `cd "${V}/_wt/hq-main" && GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 300 git fetch origin`],
  ['an ls-remote in your own worktree with no prompt and a deadline',
    `cd ${WT} && GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 60 git ls-remote origin refs/heads/main`],
  ['the one-off form for a repo with no worktree: a deadline from your worktree, no GIT_ variable',
    `cd ${WT} && GCM_INTERACTIVE=never timeout 300 git -C ${CMS} fetch origin`],
];
for (const [name, command] of GIT_NETWORK_ALLOW) {
  test(`ALLOW (subagent, L-C-39 git network form): ${name}`, () => {
    assert.deepEqual(win(command, { cwd: OWNER }), { refuse: false }, command);
  });
}
const GIT_NETWORK_REFUSE = [
  ['GIT_TERMINAL_PROMPT on the one-off form ends it',
    `cd ${WT} && GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never timeout 300 git -C ${CMS} fetch origin`],
  ['GIT_SSH_COMMAND on the one-off form ends it',
    `cd ${WT} && GIT_SSH_COMMAND=evil timeout 300 git -C ${CMS} fetch origin`],
  ['GIT_SSH_COMMAND on a fetch in the owner checkout itself',
    `cd ${OWNER} && GIT_SSH_COMMAND=evil timeout 300 git fetch origin`],
];
for (const [name, command] of GIT_NETWORK_REFUSE) {
  test(`REFUSE (subagent, L-C-39 git network form): ${name}`, () => {
    assert.equal(win(command, { cwd: OWNER }).refuse, true, command);
  });
}

// guard-bypass: the folder stack, cd -, subshells and wrappers.
const PASS1_BYPASS_REFUSE = [
  ['popd returns to the clone', `pushd ${WT} && popd && git status`, OWNER],
  ['two popd after two pushd return to the clone', `pushd ${OUTSIDE} && pushd ${WT} && popd && popd && git log`, OWNER],
  ['cd - returns to the clone', `cd ${WT} && cd - && git status`, OWNER],
  ['a subshell does not move the folder after it', `(cd ${WT} && ls); git status`, OWNER],
  ['nested subshells', `(cd ${WT} && (cd ${OUTSIDE} && ls)); npm test`, OWNER],
  ['popd with nothing pushed stays in the clone', 'popd; git status', OWNER],
  ['cd - with no earlier cd stays in the clone', 'cd -; git status', OWNER],
  ['a popd inside a subshell does not empty the stack after it', `pushd ${OUTSIDE}; (popd; true); popd; git status`, OWNER],
  ['PowerShell Push-Location then Pop-Location returns to the clone', `Push-Location ${WT}; Pop-Location; git status`, OWNER, 'PowerShell'],
  ['timeout', `timeout 30 git -C ${OWNER} show HEAD`, OUTSIDE],
  ['timeout with options', `timeout -k 5 --signal=TERM 30 git -C ${OWNER} status`, OUTSIDE],
  ['nohup', `nohup git -C ${OWNER} log`, OUTSIDE],
  ['env', `env git -C ${OWNER} log`, OUTSIDE],
  ['env VAR=x', `env GIT_PAGER=cat git -C ${OWNER} log`, OUTSIDE],
  ['env -i with an unset', `env -i -u HOME git -C ${OWNER} status`, OUTSIDE],
  ['env -C into the clone', `env -C ${OWNER} npm test`, OUTSIDE],
  ['nice', `nice -n 10 git -C ${OWNER} log`, OUTSIDE],
  ['setsid -f', `setsid -f git -C ${OWNER} log`, OUTSIDE],
  ['wsl --cd into the clone (a /mnt path)', `wsl --cd /mnt/q/vr/${HQ} npm ci`, OUTSIDE],
  ['wsl git -C the clone', `wsl git -C /mnt/q/vr/${HQ} status`, OUTSIDE],
  ['wsl.exe -d Ubuntu -e git -C the clone', `wsl.exe -d Ubuntu -e git -C /mnt/q/vr/${HQ} log`, OUTSIDE],
  ['timeout wrapping wsl wrapping git', `timeout 60 wsl git -C /mnt/q/vr/${HQ} log`, OUTSIDE],
  ['nohup wrapping bash -c', `nohup bash -c 'cd ${OWNER} && npm ci'`, OUTSIDE],
  ['eval', `eval "git -C ${OWNER} log -1"`, OUTSIDE],
  ['a backtick substitution', `echo \`git -C ${OWNER} log -1\``, OUTSIDE],
  ['a backtick substitution that changes folder', `x=\`cd ${OWNER} && npm ls\``, OUTSIDE],
];
for (const [name, command, cwd, toolName = 'Bash'] of PASS1_BYPASS_REFUSE) {
  test(`REFUSE (subagent, pass 1 guard-bypass): ${name}`, () => {
    assert.equal(win(command, { cwd, toolName }).refuse, true, command);
  });
}
const PASS1_BYPASS_ALLOW = [
  ['popd back to a worktree', `pushd ${OUTSIDE} && popd && git status`, WT],
  ['cd - back to a worktree', `cd ${OUTSIDE} && cd - && git status`, WT],
  ['a subshell in a worktree, then a worktree command', `(cd ${OUTSIDE} && ls); git status`, WT],
  ['popd with nothing pushed stays in a worktree', 'popd; git status', WT],
  ['cd - with no earlier cd stays in a worktree', 'cd -; git status', WT],
  ['a pushd inside a subshell does not outlive it', `(pushd ${OUTSIDE}; true); popd; git status`, WT],
  ['PowerShell Push-Location then Pop-Location returns to a worktree', `Push-Location ${OUTSIDE}; Pop-Location; git status`, WT, 'PowerShell'],
  ['PowerShell parentheses only group: a Set-Location inside them stays', `(Set-Location ${WT}); git status`, OUTSIDE, 'PowerShell'],
  ['timeout in a worktree', `cd ${WT} && timeout 540 npx vitest run x.test.ts`, OWNER],
  ['timeout with options, git -C a worktree', `timeout -k 5 --signal=TERM 30 git -C ${WT} status`, OUTSIDE],
  ['nohup, env VAR=x and nice in a worktree', `cd ${WT} && nohup env CI=1 nice -n 10 npm test`, OWNER],
  ['env -C into a worktree', `env -C ${WT} npm test`, OWNER],
  ['setsid -f in a worktree', `cd ${WT} && setsid -f npm run dev`, OWNER],
  ['wsl --cd into a worktree', 'wsl --cd /mnt/q/vr/_wt/hq-main npm ci', OUTSIDE],
  ['wsl git -C a worktree', 'wsl git -C /mnt/q/vr/_wt/hq-main status', OUTSIDE],
  ['wsl.exe -e bash -lc into a worktree', "wsl.exe -e bash -lc 'cd /mnt/q/vr/_wt/hq-main && npm ci'", OUTSIDE],
  ['nohup wrapping bash -c in a worktree', `nohup bash -c 'cd ${WT} && npm ci'`, OUTSIDE],
  ['eval of a worktree command', `eval "git -C ${WT} log -1"`, OUTSIDE],
  ['a backtick substitution in a worktree', `echo \`git -C ${WT} log -1\``, OUTSIDE],
  ['a PowerShell backtick is an escape, so the words after it are text, not a command', `Write-Output \`git -C ${OWNER} log\``, OUTSIDE, 'PowerShell'],
];
for (const [name, command, cwd, toolName = 'Bash'] of PASS1_BYPASS_ALLOW) {
  test(`ALLOW (subagent, pass 1 guard-bypass): ${name}`, () => {
    assert.deepEqual(win(command, { cwd, toolName }), { refuse: false }, command);
  });
}
// Already refused before pass 1, kept green: the same wrappers and parentheses with the clone as
// the starting folder, where no wrapper had to be looked through.
test('REFUSE (control, pass 1 guard-bypass): wrapped commands that start in the clone', () => {
  for (const command of ['timeout -k 5 --signal=TERM 30 git status', 'env -i -u HOME git status', 'nice -n 10 npm test', "wsl.exe -e bash -lc 'git log'"]) {
    assert.equal(win(command, { cwd: OWNER }).refuse, true, command);
  }
  assert.equal(win(`(Set-Location ${OWNER}); git status`, { cwd: OUTSIDE, toolName: 'PowerShell' }).refuse, true);
  assert.equal(win(`wsl.exe -e bash -lc 'cd /mnt/q/vr/${HQ} && git log'`, { cwd: OUTSIDE }).refuse, true);
});

// guard-false-refusal: a folder whose nearest .git is a FILE is a linked worktree.
test('ALLOW (pass 1 guard-false-refusal): an isolation worktree inside the hq clone, and a sibling-named worktree', () => {
  const iso = `${OWNER}/.claude/worktrees/agent-1`;
  assert.deepEqual(win('git status && npm test', { cwd: iso }), { refuse: false });
  assert.deepEqual(win('git log -1', { cwd: `${iso}/src/lib` }), { refuse: false });
  assert.deepEqual(win(`cd ${WROOT}/VR_CMS_API-f53b && git status`, { cwd: OUTSIDE }), { refuse: false });
});
test('REFUSE (pass 1 guard-false-refusal): the clone around it, its parent folders and a path that leaves it', () => {
  assert.equal(win('git status', { cwd: OWNER }).refuse, true);
  assert.equal(win('git status', { cwd: `${OWNER}/.claude/worktrees` }).refuse, true);
  assert.equal(win('npm test', { cwd: `${OWNER}/.claude` }).refuse, true);
  assert.equal(win(`cd ${OWNER}/.claude/worktrees/agent-1/../.. && git log`, { cwd: OUTSIDE }).refuse, true);
});
// The same pair through the real hook and the real file system: `.git` as a file, then as a folder.
test('ALLOW (spawned, pass 1 guard-false-refusal): a linked worktree inside the hq clone', () => {
  const r = run(fill(RECORDED.subagent, { cwd: path.join(iso, 'src'), command: 'git status && npm test' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});
test('REFUSE (spawned, pass 1 guard-false-refusal): the folder above that linked worktree', () => {
  const r = run(fill(RECORDED.subagent, { cwd: path.dirname(iso), command: 'git status' }));
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

// def-vs-guard: the shared-standards root check is the main thread's; a subagent runs it after a cd.
const ROOT_CHECK = [
  ': "${VIVREAL_REPOS:=$(cd "$(dirname "$(git rev-parse --git-common-dir)")/.." && pwd)}"',
  `ls "${V}" | grep -qx ${HQ} || { echo "no Vivreal clone root found"; exit 1; }`,
].join('\n');
test('ALLOW (pass 1 def-vs-guard): the root check after a cd into a worktree', () => {
  assert.deepEqual(win(`cd ${WT}\n${ROOT_CHECK}`, { cwd: OWNER }), { refuse: false });
});
test('REFUSE (control, pass 1 def-vs-guard): the root check as written, started in the clone', () => {
  assert.equal(win(ROOT_CHECK, { cwd: OWNER }).refuse, true);
});

// fleet-breadth: each fleet only in its data folders.
const PASS1_FLEET_REFUSE = [
  ['leadgen: rm -rf docs at the hq root', 'rm -rf docs', OWNER, 'vivreal-leadgen:runner'],
  ['leadgen: npm install at the hq root', 'npm install', OWNER, 'vivreal-leadgen:runner'],
  ['content: rm -rf docs at the hq root', 'rm -rf docs', OWNER, 'vivreal-content:footage-recorder'],
  ['content: npm install at the hq root', 'npm install', OWNER, 'vivreal-content:footage-recorder'],
  ['content: the voice check from the hq root (the old form)', 'node packages/content-studio/scripts/voice-check.mjs knowledge/x.md', OWNER, 'vivreal-content:guide-writer'],
  ["content: in packages/leadgen (another fleet's data)", 'node commands/import-leads.js x.csv', `${OWNER}/packages/leadgen`, 'vivreal-content:guide-writer'],
  ['leadgen: in packages/content-studio', 'npx tsx src/render-slide.ts', `${OWNER}/packages/content-studio`, 'vivreal-leadgen:runner'],
  ['site-migrator: rm -rf docs at its clone root', 'rm -rf docs', MIG, 'vivreal-site-migrator:site'],
  ['site-migrator: npm install at its clone root', 'npm install', MIG, 'vivreal-site-migrator:site'],
  ['site-migrator: npx at its clone root', 'npx some-tool', MIG, 'vivreal-site-migrator:site'],
  ['site-migrator: a node script outside commands/ and scripts/ at its root', 'node src/x.js', MIG, 'vivreal-site-migrator:site'],
  ['site-migrator: in docs/', 'node commands/x.js', `${MIG}/docs`, 'vivreal-site-migrator:site'],
  ['site-migrator: the capability regen in packages/site-loader of its clone (a tracked file)', 'cd packages/site-loader && node scripts/sync-integration-capabilities.js', MIG, 'vivreal-site-migrator:ingest'],
  ['leadgen: a cd elsewhere in the hq clone is allowed, the tool run there is not', 'cd docs && node x.js', OWNER, 'vivreal-leadgen:runner'],
];
for (const [name, command, cwd, agentType] of PASS1_FLEET_REFUSE) {
  test(`REFUSE (subagent, pass 1 fleet-breadth): ${name}`, () => {
    assert.equal(win(command, { cwd, agentType }).refuse, true, `${agentType}: ${command}`);
  });
}
const PASS1_FLEET_ALLOW = [
  ['leadgen: cd into its data folder from the hq root, then its tool', 'cd packages/leadgen && node commands/import-leads.js Data/exports/x.csv', OWNER, 'vivreal-leadgen:lead-scout'],
  ['content: the voice check from content-studio (the new form)', 'cd packages/content-studio && node scripts/voice-check.mjs ../../knowledge/x.md', OWNER, 'vivreal-content:guide-writer'],
  ['content: a render from content-studio', 'npx tsx src/render-video.ts brief.json --out=out/', `${OWNER}/packages/content-studio`, 'vivreal-content:short-form-editor'],
  ['site-migrator: its own tool at its clone root', 'node commands/load.js captures/x/blueprint.json', MIG, 'vivreal-site-migrator:site'],
  ['site-migrator: node -e at its clone root', `node -e "require('./src/blueprint/parts')"`, MIG, 'vivreal-site-migrator:collections'],
  ['site-migrator: npm run at its clone root', 'npm run estimate -- captures/x', MIG, 'vivreal-site-migrator:migration-estimator'],
  ['site-migrator: anything in captures/', 'ls -la && rm -f tmp.json', `${MIG}/captures/x`, 'vivreal-site-migrator:site'],
  ['site-migrator: the capability regen in a worktree of its repo', `cd "${V}/_wt/migrator-caps/packages/site-loader" && VIVREAL_PORTAL_DIR="${V}/_wt/Vivreal_Portal_Mobile-read" node scripts/sync-integration-capabilities.js`, MIG, 'vivreal-site-migrator:ingest'],
  ['leadgen: a cd back into its data folder, then its tool', 'cd docs && cd ../packages/leadgen && node commands/stats.js', OWNER, 'vivreal-leadgen:runner'],
];
for (const [name, command, cwd, agentType] of PASS1_FLEET_ALLOW) {
  test(`ALLOW (subagent, pass 1 fleet-breadth): ${name}`, () => {
    assert.deepEqual(win(command, { cwd, agentType }), { refuse: false }, `${agentType}: ${command}`);
  });
}
// A plugin named like an object key is no fleet (and must not make the guard throw, which would
// fail open); a real fleet name beside it is still read.
test('REFUSE (control, pass 1 fleet-breadth): an agent_type whose plugin part is an object key', () => {
  for (const agentType of ['constructor:x', 'toString:x', 'hasOwnProperty:x', '__proto__:x']) {
    assert.equal(win('node commands/validate.js', { cwd: `${OWNER}/packages/leadgen`, agentType }).refuse, true, agentType);
  }
  assert.deepEqual(win('node commands/validate.js', { cwd: `${OWNER}/packages/leadgen`, agentType: 'vivreal-leadgen:x' }), { refuse: false });
});

// The refusal tells a fleet agent where its tools do run; every other agent gets the worktree line only.
test('REFUSE (spawned, pass 1 fleet-breadth): a leadgen agent at the hq root is told its data folder', () => {
  const r = run(fill(RECORDED.subagent, { cwd: hq, command: 'rm -rf docs', agentType: 'vivreal-leadgen:runner' }));
  assert.notEqual(r.stdout, '', 'not refused: rm -rf docs at the hq root');
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.permissionDecision, 'deny');
  assert.match(out.permissionDecisionReason, /A vivreal-leadgen agent also runs its own tools, never git, in packages\/leadgen of the hq clone/);
  const other = JSON.parse(run(fill(RECORDED.subagent, { cwd: hq, command: 'rm -rf docs' })).stdout).hookSpecificOutput;
  assert.equal(other.permissionDecision, 'deny');
  assert.doesNotMatch(other.permissionDecisionReason, /also runs its own tools/);
});
test('ALLOW (spawned, pass 1 fleet-breadth): the same leadgen agent in packages/leadgen', () => {
  const r = run(fill(RECORDED.subagent, { cwd: path.join(hq, 'packages', 'leadgen'), command: 'node commands/stats.js', agentType: 'vivreal-leadgen:runner' }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

// ------------------------------------------------- definition review pass 2 (review-c-sk.md)
// Characters built at run time, so no escape in this file is read for the wrong reason.
const BS = String.fromCharCode(92);
const NL = '\n';
const CRLF = '\r\n';
const BT = '`';
const MIG_INGEST = 'vivreal-site-migrator:ingest';

// E1: a line continuation (Bash backslash-newline, PowerShell backtick-newline) joins the next
// line to this one before the command is split, so the strict one-off reading sees every option.
const PASS2_CONT_REFUSE = [
  ['fetch, then --upload-pack on the next line', `git -C ${CMS} fetch origin ${BS}${NL}  --upload-pack=x`, WT],
  ['fetch, then a refspec writing a branch on the next line', `git -C ${CMS} fetch ${BS}${NL}origin +x:main`, WT],
  ['git, then -C the clone on the next line', `git ${BS}${NL}  -C ${OWNER} log -1`, WT],
  ['git -C, then the clone on the next line', `git -C ${BS}${NL}  ${OWNER} log -1`, WT],
  ['cd, then the clone on the next line', `cd ${BS}${NL}  ${OWNER} && git status`, WT],
  ['worktree add, then -f on the next line', `git -C ${CMS} worktree add --detach ${WROOT}/_wt/x origin/main ${BS}${NL}  -f`, WT],
  ['worktree add, then -f -B main on the next line', `git -C ${CMS} worktree add ${BS}${NL} -f -B main ${WROOT}/_wt/x`, WT],
  ['a Windows line end after the backslash', `git -C ${CMS} fetch origin ${BS}${CRLF}  --upload-pack=x`, WT],
  ['two continuations in a row', `git ${BS}${NL} -C ${BS}${NL} ${OWNER} status`, WT],
  ['inside double quotes, the path goes on on the next line', `cd "${WT}${BS}${NL}/../../${HQ}" && git status`, OUTSIDE],
  ['inside a $( ) substitution', `x=$(git ${BS}${NL} -C ${OWNER} log -1)`, WT],
  ['PowerShell: a backtick at the line end', `git ${BT}${NL}  -C ${OWNER} log -1`, WT, 'PowerShell'],
  ['PowerShell: fetch, then --upload-pack on the next line', `git -C ${CMS} fetch origin ${BT}${NL}  --upload-pack=x`, WT, 'PowerShell'],
  ['PowerShell: a backtick and a Windows line end before the folder', `Set-Location ${BT}${CRLF}  ${OWNER}; git status`, WT, 'PowerShell'],
];
for (const [name, command, cwd, toolName = 'Bash'] of PASS2_CONT_REFUSE) {
  test(`REFUSE (subagent, pass 2 E1 line continuation): ${name}`, () => {
    assert.equal(win(command, { cwd, toolName }).refuse, true, JSON.stringify(command));
  });
}
const PASS2_CONT_ALLOW = [
  ['portal-coder: worktree add -b, the path on the next line, from a worktree', `git -C "${V}/Vivreal_Portal_Mobile" worktree add -b fix/x --no-track ${BS}${NL}  "${V}/_wt/pc-new" origin/main`, WT, 'vivreal-principal:portal-coder'],
  ['fetch, --prune and the remote on the next line', `git -C ${CMS} fetch ${BS}${NL}  --prune origin`, WT, 'vivreal-principal:coder'],
  ['cd into a worktree over two lines, then a two-line git', `cd ${BS}${NL}  ${WT} && git log ${BS}${NL}  --oneline -5`, OWNER, 'vivreal-principal:coder'],
  ['component-builder: NODE_PATH, then the sweep on the next line, at the migrator root', `export CLUSTER_URL=x${NL}NODE_PATH=${VB}/VR_Secure_API/node_modules ${BS}${NL}  node commands/sweep-renderer-impact.js --layouts a --prod`, MIG, 'vivreal-site-migrator:component-builder'],
  ['lead-scout: a two-line import in packages/leadgen', `cd packages/leadgen && node commands/import-leads.js Data/exports/c.csv ${BS}${NL}  --campaign n --tags a,b --dry-run`, OWNER, 'vivreal-leadgen:lead-scout'],
  ['PowerShell: a backtick continuation into a worktree', `Set-Location ${BT}${NL}  ${WT}; git status`, OWNER, 'vivreal-principal:coder', 'PowerShell'],
];
for (const [name, command, cwd, agentType, toolName = 'Bash'] of PASS2_CONT_ALLOW) {
  test(`ALLOW (subagent, pass 2 E1 line continuation): ${name}`, () => {
    assert.deepEqual(win(command, { cwd, agentType, toolName }), { refuse: false }, JSON.stringify(command));
  });
}
// Kept green: a backslash in a quoted heredoc body is data, so it never swallows the delimiter
// line and hides the command after it.
test('REFUSE (control, pass 2 E1): a backslash at a heredoc body line end does not hide the next command', () => {
  assert.equal(win(`cat > x.txt <<'EOF'${NL}a ${BS}${NL}EOF${NL}git -C ${OWNER} status`, { cwd: WT }).refuse, true);
});

// E2: the `&` of a redirection is no separator, and at the migrator root its own tool may be
// followed by stdin filters after a pipe and an echo of the exit status.
const PASS2_REDIR_ALLOW = [
  ['2>&1', 'node commands/crawl.js https://x.com --max-pages=120 --deep 2>&1'],
  ['a log file and 2>&1', 'node commands/crawl.js https://x.com > captures/x.com/crawl.log 2>&1'],
  ['&> a log file', 'node commands/crawl.js https://x.com &> captures/x.com/crawl.log'],
  ['&>> a log file', 'node commands/crawl.js https://x.com &>> captures/x.com/crawl.log'],
  ['>& a log file', 'node commands/crawl.js https://x.com >& captures/x.com/crawl.log'],
  ['| tail -30', 'node commands/crawl.js https://x.com | tail -30'],
  ['2>&1 | tail -30', 'node commands/crawl.js https://x.com --deep 2>&1 | tail -30'],
  ['|& tail -n 5', 'node commands/crawl.js https://x.com |& tail -n 5'],
  ['| grep -v DEBUG | head -n 40', 'node commands/crawl.js https://x.com 2>&1 | grep -v "DEBUG line" | head -n 40'],
  ['| wc -l, | sort | cat', 'npm run estimate -- https://x.com 2>&1 | sort -u | cat -n'],
  ['; echo "exit=$?"', 'node commands/crawl.js https://x.com; echo "exit=$?"'],
  ['| tail -30; echo "exit=$?"', 'node commands/crawl.js https://x.com 2>&1 | tail -30; echo "exit=$?"'],
  ['echo $? on the next line', `node commands/crawl.js https://x.com${NL}echo $?`],
];
for (const [name, command] of PASS2_REDIR_ALLOW) {
  test(`ALLOW (subagent, pass 2 E2, ingest at the migrator root): ${name}`, () => {
    assert.deepEqual(win(command, { cwd: MIG, agentType: MIG_INGEST }), { refuse: false }, command);
  });
}
const PASS2_REDIR_REFUSE = [
  ['| rm -rf docs', 'node commands/crawl.js https://x.com | rm -rf docs', MIG_INGEST],
  ['; git status', 'node commands/crawl.js https://x.com; git status', MIG_INGEST],
  ['2>&1 | sh', 'node commands/crawl.js https://x.com 2>&1 | sh', MIG_INGEST],
  ['| xargs rm', 'node commands/crawl.js https://x.com | xargs rm', MIG_INGEST],
  ['a filter reading a file, not stdin (tail)', 'node commands/crawl.js https://x.com | tail -30 .env', MIG_INGEST],
  ['a filter reading a file, not stdin (cat)', 'node commands/crawl.js https://x.com | cat .env', MIG_INGEST],
  ['a filter reading a file, not stdin (grep)', 'node commands/crawl.js https://x.com | grep x package.json', MIG_INGEST],
  ['grep -e and a file', 'node commands/crawl.js https://x.com | grep -e x package.json', MIG_INGEST],
  ['sort -o writes a file', 'node commands/crawl.js https://x.com | sort -o out.txt', MIG_INGEST],
  ['sort --compress-program runs a program', 'node commands/crawl.js https://x.com | sort --compress-program=sh', MIG_INGEST],
  ['a filter writing a file at the root', 'node commands/crawl.js https://x.com | tail -30 > notes.txt', MIG_INGEST],
  ['a filter after || is no pipe', 'node commands/crawl.js https://x.com || tail -30', MIG_INGEST],
  ['a filter as the first command', 'head -5 package.json', MIG_INGEST],
  ['an echo that is not the exit status', 'node commands/crawl.js https://x.com; echo done', MIG_INGEST],
  ['an exit-status echo written to a file', 'node commands/crawl.js https://x.com; echo "exit=$?" > status.txt', MIG_INGEST],
  ['an echo of a substitution that runs git', 'node commands/crawl.js https://x.com; echo "$(git status)"', MIG_INGEST],
  ['& still runs the next command in the background', 'node commands/crawl.js https://x.com 2>&1 & git status', MIG_INGEST],
  ['>&2 then npm install', 'node commands/crawl.js https://x.com >&2 && npm install', MIG_INGEST],
  ['a coder at the migrator root with 2>&1', 'node commands/crawl.js https://x.com 2>&1', 'vivreal-principal:coder'],
  ['a leadgen agent at the migrator root with | tail', 'node commands/crawl.js https://x.com | tail -30', 'vivreal-leadgen:runner'],
];
for (const [name, command, agentType] of PASS2_REDIR_REFUSE) {
  test(`REFUSE (subagent, pass 2 E2, at the migrator root): ${name}`, () => {
    assert.equal(win(command, { cwd: MIG, agentType }).refuse, true, `${agentType}: ${command}`);
  });
}
test('REFUSE (pass 2 E2): the migrator refusal names what IS allowed at its root, pipes and redirections included', () => {
  const d = win('rm -rf docs', { cwd: MIG, agentType: MIG_INGEST });
  assert.equal(d.refuse, true);
  const reason = lib().reasonFor(d.folder, d.fleet);
  assert.match(reason, /node commands\/\.\.\., node scripts\/\.\.\., node -e and npm run <script>/);
  assert.match(reason, /tail, head, grep, wc, sort or cat reading stdin/);
  assert.match(reason, /echo of \$\?/);
});
test('REFUSE (spawned, pass 2 E2): the real hook refuses | rm at the migrator root and names the filters', () => {
  const r = run(fill(RECORDED.subagent, { cwd: path.join(root, 'Vivreal_Site_Migrator'), command: 'node commands/crawl.js https://x.com | rm -rf docs', agentType: MIG_INGEST }));
  assert.notEqual(r.stdout, '', 'not refused');
  assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /tail, head, grep, wc, sort or cat reading stdin/);
});
test('ALLOW (spawned, pass 2 E2): the real hook runs the crawl with 2>&1 | tail -30 at the migrator root', () => {
  const r = run(fill(RECORDED.subagent, { cwd: path.join(root, 'Vivreal_Site_Migrator'), command: 'node commands/crawl.js https://x.com 2>&1 | tail -30', agentType: MIG_INGEST }));
  assert.equal(r.status, 0);
  assert.equal(r.stdout, '');
});

// Warnings: `cd --`, a `cd` to a folder that does not exist, and a `tag` refspec on fetch.
const PASS2_WARN_REFUSE = [
  ['cd -- the clone', `cd -- ${OWNER} && git status`, WT],
  ['cd -- the clone, then ;', `cd -- ${OWNER}; npm test`, WT],
  ['pushd -- the clone', `pushd -- ${OWNER} && git log`, WT],
  ['a cd to a missing worktree, then ; keeps the clone', `cd ${WROOT}/_wt/missing; git status`, OWNER],
  ['a cd to a missing worktree, then a newline keeps the clone', `cd ${WROOT}/_wt/missing${NL}git status`, OWNER],
  ['a pushd to a missing worktree keeps the clone', `pushd ${WROOT}/_wt/missing; npm test`, OWNER],
  ['a cd to a missing worktree, its && chain, then ; (runs in the clone when the cd fails)', `cd ${WROOT}/_wt/missing && git status; npm test`, OWNER],
  ['a cd to a missing worktree, then || (runs in the clone when the cd fails)', `cd ${WROOT}/_wt/missing && ls || npm test`, OWNER],
  ['a missing folder made at run time is still read as written', `mkdir -p ${WROOT}/_wt/missing; cd ${WROOT}/_wt/missing && git -C ${OWNER} status`, WT],
  ['a cd from a missing folder into the clone, in its && chain', `cd ${WROOT}/_wt/missing && cd ../../${HQ} && git log`, WT],
  ['a cd to a missing worktree, a brace group, then ; (runs in the clone when the cd fails)', `cd ${WROOT}/_wt/missing && { test -e .env || cp a .env; }; npm ci`, OWNER],
  ['a cd to a missing worktree, a subshell, then ; (runs in the clone when the cd fails)', `cd ${WROOT}/_wt/missing && (ls; true); git status`, OWNER],
  ['PowerShell: Set-Location to a missing worktree keeps the clone', `Set-Location ${WROOT}/_wt/missing; git status`, OWNER, 'PowerShell'],
  ['a worktree add of ANOTHER path does not make the missing one', `git -C ${CMS} worktree add --detach ${WROOT}/_wt/other origin/main && cd ${WROOT}/_wt/missing; npm ci`, OWNER],
  ['fetch origin tag v1 (writes a tag)', `git -C ${CMS} fetch origin tag v1`, OUTSIDE],
  ['fetch --force origin tag v1', `git -C ${CMS} fetch --force origin tag v1`, OUTSIDE],
  ['fetch origin main tag v1', `git -C ${CMS} fetch origin main tag v1`, OUTSIDE],
];
for (const [name, command, cwd, toolName = 'Bash'] of PASS2_WARN_REFUSE) {
  test(`REFUSE (subagent, pass 2 warnings): ${name}`, () => {
    assert.equal(win(command, { cwd, toolName }).refuse, true, command);
  });
}
const PASS2_WARN_ALLOW = [
  ['cd -- a worktree from the clone', `cd -- ${WT} && git status`, OWNER],
  ['a cd to a worktree that exists, then ;', `cd ${WT}; git status`, OWNER],
  ['a cd to a missing worktree, then only its && chain and pipes (none runs if the cd fails)', `cd ${WROOT}/_wt/missing && git status | tail -3 && npm test`, OWNER],
  ['a cd to a missing worktree, then a brace group and more && (none runs if the cd fails)', `cd ${WROOT}/_wt/missing && { test -e .env || cp a .env; } && npm ci`, OWNER],
  ['a cd to a missing worktree, then a subshell in its chain (none runs if the cd fails)', `cd ${WROOT}/_wt/missing && (ls; git status)`, OWNER],
  ['a cd to a missing folder in the migrator captures (a kit not made yet)', 'cd captures/k/preview && cp __saves/a.json siteDetails.json', MIG, 'vivreal-site-migrator:studio-confirm'],
  ['the one-off worktree add of a new path, then a cd into it', `git -C ${CMS} worktree add --detach ${WROOT}/_wt/missing origin/main && cd ${WROOT}/_wt/missing; npm ci`, OWNER],
  ['fetch origin main (a plain branch name)', `git -C ${CMS} fetch origin main`, OUTSIDE],
  ['fetch --tags origin', `git -C ${CMS} fetch --tags origin`, OUTSIDE],
];
for (const [name, command, cwd, agentType] of PASS2_WARN_ALLOW) {
  test(`ALLOW (subagent, pass 2 warnings): ${name}`, () => {
    assert.deepEqual(win(command, { cwd, agentType }), { refuse: false }, command);
  });
}
test('REFUSE (spawned, pass 2 warnings): a cd to a worktree that does not exist keeps the hq clone', () => {
  const r = run(fill(RECORDED.subagent, { cwd: hq, command: `cd "${path.join(root, '_wt', 'missing')}"; git status` }));
  assert.equal(JSON.parse(r.stdout || '{}').hookSpecificOutput?.permissionDecision, 'deny');
});
test('ALLOW (spawned, pass 2 warnings): the same cd to the worktree that exists', () => {
  const r = run(fill(RECORDED.subagent, { cwd: hq, command: `cd "${wt}"; git status` }));
  assert.equal(r.stdout, '');
});

// E3 and the folder warnings: every line pass 2 found refused for its own agent, read straight
// out of its definition file as it stands now (so the test follows the file), run through the
// guard as that agent from the folder its session starts in; the line as it read at a6c47ac is
// refused beside it.
const PLUGINS = path.join(__dirname, '..', '..');
const defText = (rel) => fs.readFileSync(path.join(PLUGINS, rel), 'utf8').split('\r\n').join('\n');
// The inline code span holding `needle`, its line breaks read as spaces.
function spanIn(rel, needle) {
  const text = defText(rel);
  const at = text.indexOf(needle);
  assert.ok(at >= 0, `${rel} no longer holds: ${needle}`);
  const start = text.lastIndexOf(BT, at);
  const end = text.indexOf(BT, at + needle.length);
  return text.slice(start + 1, end).split(NL).map((l) => l.trim()).join(' ');
}
// The fenced-block line that starts with `needle`, with the lines a backslash continues it onto.
function lineIn(rel, needle) {
  const lines = defText(rel).split(NL);
  let i = lines.findIndex((l) => l.trim().startsWith(needle));
  assert.ok(i >= 0, `${rel} no longer holds: ${needle}`);
  const out = [lines[i]];
  while (lines[i].trimEnd().endsWith(BS) && i + 1 < lines.length) out.push(lines[++i]);
  return out.map((l) => l.trim()).join(NL);
}
const LG = 'vivreal-leadgen/agents/';
const CT = 'vivreal-content/agents/';
const MG = 'vivreal-site-migrator/agents/';
const PORTAL_READ = `${V}/_wt/Vivreal_Portal_Mobile-read`;
const PASS2_DEFS = [
  // [definition line, agent_type, start folder, the command now (read from the file), the command at a6c47ac]
  ['profiler.md: list the crawled domains', 'vivreal-leadgen:profiler', OWNER, () => lineIn(LG + 'profiler.md', 'cd packages/leadgen && ls Data/profiles/'), 'ls packages/leadgen/Data/profiles/'],
  ['profiler.md: read a domain index', 'vivreal-leadgen:profiler', OWNER, () => lineIn(LG + 'profiler.md', 'cd packages/leadgen && cat Data/profiles/'), 'cat packages/leadgen/Data/profiles/{domain}/_index.json'],
  ['content-planner.md: the coverage check, manifests', 'vivreal-content:content-planner', OWNER, () => lineIn(CT + 'content-planner.md', 'cd packages/content-studio && cat ../../content/footage/'), 'cat content/footage/*/footage-manifest.json'],
  ['content-planner.md: the coverage check, listings', 'vivreal-content:content-planner', OWNER, () => lineIn(CT + 'content-planner.md', 'cd packages/content-studio && ls ../../content/tutorials'), 'ls content/tutorials content/help-media'],
  ['content-planner.md: the lookback (inline)', 'vivreal-content:content-planner', OWNER, () => spanIn(CT + 'content-planner.md', 'ls -t ../../content/calendars'), 'ls -t content/calendars/*.md | head -4'],
  ['content-planner.md: the lookback (block)', 'vivreal-content:content-planner', OWNER, () => lineIn(CT + 'content-planner.md', 'cd packages/content-studio && ls -t'), 'ls -t content/calendars/*.md | head -4'],
  ['carousel-editor.md: the slide render', 'vivreal-content:carousel-editor', OWNER, () => lineIn(CT + 'carousel-editor.md', 'cd packages/content-studio && npx tsx src/render-slide.ts'), 'npx tsx src/render-slide.ts packages/content-studio/capture-assets/templates/typography/x.html out.png 1080 1350 {}'],
  ['carousel-editor.md: the frame pull', 'vivreal-content:carousel-editor', OWNER, () => lineIn(CT + 'carousel-editor.md', 'cd packages/content-studio && ffmpeg -ss'), `ffmpeg -ss 3 -i content/footage/s/clips/c.mp4 -frames:v 1 ${BS}${NL}  .agent-cache/x-base.png`],
  ['carousel-editor.md: the PDF assembly', 'vivreal-content:carousel-editor', OWNER, () => lineIn(CT + 'carousel-editor.md', 'cd packages/content-studio && magick'), 'magick slides/slide-*.png carousel.pdf'],
  ['carousel-editor.md: the brand token sync', 'vivreal-content:carousel-editor', OWNER, () => spanIn(CT + 'carousel-editor.md', 'npm run sync-brand-tokens'), 'npm run sync-brand-tokens'],
  ['carousel-editor.md (linkedin-editor follows it): the PDF assembly', 'vivreal-content:linkedin-editor', OWNER, () => lineIn(CT + 'carousel-editor.md', 'cd packages/content-studio && magick'), 'cd content/social/x/linkedin && magick slide-*.png carousel.pdf'],
  ['mascot-artist.md: the render', 'vivreal-content:mascot-artist', OWNER, () => spanIn(CT + 'mascot-artist.md', 'render.py [pose]'), 'python brand/mascot/model/render.py standing'],
  ['footage-recorder.md: the nav read at the deployed portal', 'vivreal-content:footage-recorder', OWNER, () => spanIn(CT + 'footage-recorder.md', 'Vivreal_Portal_Mobile-read" show origin/stable'), `git -C "${V}/Vivreal_Portal_Mobile" show origin/stable:src/lib/nav/favorites.ts`],
  ['footage-recorder.md: the release read', 'vivreal-content:footage-recorder', OWNER, () => spanIn(CT + 'footage-recorder.md', 'app/release.json'), 'curl https://vivreal.io/app/release.json'],
  ['footage-recorder.md: capture', 'vivreal-content:footage-recorder', OWNER, () => lineIn(CT + 'footage-recorder.md', 'cd packages/content-studio && npx tsx src/portal-capture.ts'), 'npx tsx src/portal-capture.ts content/footage/s/sequence.json'],
  ['footage-recorder.md: split', 'vivreal-content:footage-recorder', OWNER, () => lineIn(CT + 'footage-recorder.md', 'cd packages/content-studio && npx tsx src/footage-split.ts'), 'npx tsx src/footage-split.ts content/footage/s'],
  ['help-page-producer.md: portal code at origin/stable', 'vivreal-content:help-page-producer', OWNER, () => spanIn(CT + 'help-page-producer.md', 'Vivreal_Portal_Mobile-read" show origin/stable'), `git -C "${V}/Vivreal_Portal_Mobile" show origin/stable:src/lib/nav/favorites.ts`],
  ['help-page-producer.md: both refs of a Timing line', 'vivreal-content:help-page-producer', OWNER, () => `${spanIn(CT + 'help-page-producer.md', 'Vivreal_Portal_Mobile-read" show')} origin/stable:src/x.ts`, 'git show origin/stable:src/x.ts'],
  ['short-form-editor.md: the render', 'vivreal-content:short-form-editor', OWNER, () => spanIn(CT + 'short-form-editor.md', '--out=../../<outputRoot>'), 'npx tsx src/render-video.ts brief.json --out=content/social/x/tiktok'],
  ['short-form-editor.md: the contact sheet (block)', 'vivreal-content:short-form-editor', OWNER, () => lineIn(CT + 'short-form-editor.md', 'cd packages/content-studio && ffmpeg -i'), 'ffmpeg -i clip.mp4 -vf "fps=2,scale=150:267,tile=9x3" -frames:v 1 sheet.png'],
  ['short-form-editor.md: the contact sheet (inline)', 'vivreal-content:short-form-editor', OWNER, () => spanIn(CT + 'short-form-editor.md', 'tile=6x5'), 'ffmpeg -i clip.mp4 -vf "fps=2,scale=150:267,tile=6x5" -frames:v 1 sheet.png'],
  ['short-form-editor.md: the outro props', 'vivreal-content:short-form-editor', OWNER, () => lineIn(CT + 'short-form-editor.md', "cd packages/content-studio && echo '{"), `echo '{"fps":25}' > .out/outro/props.json`],
  ['short-form-editor.md: the outro render', 'vivreal-content:short-form-editor', OWNER, () => lineIn(CT + 'short-form-editor.md', 'cd packages/content-studio && npx remotion render'), 'npx remotion render src/remotion/index.ts outro-card .out/outro/outro-card.mp4'],
  ['tutorial-maker.md: driving the take', 'vivreal-content:tutorial-maker', OWNER, () => lineIn(CT + 'tutorial-maker.md', 'cd packages/content-studio && TUTORIAL_PROVIDER='), `TUTORIAL_PROVIDER=instagram|facebook|linkedIn|tiktok ${BS}${NL}REMOTE_DIR=/tmp/remote ${BS}${NL}npx tsx src/tutorial/run-tutorial.ts x.ts --only=desktop`],
  ['tutorial-maker.md: the first --login', 'vivreal-content:tutorial-maker', OWNER, () => spanIn(CT + 'tutorial-maker.md', 'npm run tutorial -- --login'), 'npm run tutorial -- --login'],
  ['contact-enricher.md: the CLI', 'vivreal-leadgen:contact-enricher', OWNER, () => lineIn(LG + 'contact-enricher.md', 'cd packages/leadgen && node commands/outreach-contact.js get'), 'node commands/outreach-contact.js get 1'],
  ['contact-enricher.md: list the sequences', 'vivreal-leadgen:contact-enricher', OWNER, () => spanIn(LG + 'contact-enricher.md', 'cd packages/leadgen && node commands/list-sequences.js'), 'node commands/list-sequences.js'],
  ['prompt.md: list the sequences', 'vivreal-leadgen:prompt', OWNER, () => spanIn(LG + 'prompt.md', 'cd packages/leadgen && node commands/list-sequences.js'), 'node commands/list-sequences.js'],
  ['lead-scout.md: the import (two lines)', 'vivreal-leadgen:lead-scout', OWNER, () => lineIn(LG + 'lead-scout.md', 'cd packages/leadgen && node commands/import-leads.js'), `node commands/import-leads.js Data/exports/c.csv ${BS}${NL}  --campaign n --tags a,b --dry-run`],
  ['owner-researcher.md: what we already know', 'vivreal-leadgen:owner-researcher', OWNER, () => lineIn(LG + 'owner-researcher.md', 'cd packages/leadgen && node -e'), `node -e "const s=require('./Data/profiles/x/_social.json')"`],
  ['owner-researcher.md: gate and persist', 'vivreal-leadgen:owner-researcher', OWNER, () => lineIn(LG + 'owner-researcher.md', 'cd packages/leadgen && node commands/save-owner-research.js'), 'node commands/save-owner-research.js Data/reviews/o.json --dry-run'],
  ['component-builder.md: the live-site sweep (a continuation)', 'vivreal-site-migrator:component-builder', MIG, () => lineIn(MG + 'component-builder.md', 'NODE_PATH='), 'NODE_PATH=x node commands/sweep-renderer-impact.js --prod; printenv NODE_PATH'],
  ['component-builder.md: the browser output folder', 'vivreal-site-migrator:component-builder', MIG, () => spanIn(MG + 'component-builder.md', 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'), 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'],
  ['kit-designer.md: the browser output folder', 'vivreal-site-migrator:kit-designer', MIG, () => spanIn(MG + 'kit-designer.md', 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'), 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'],
  ['page-confirm.md: the browser output folder', 'vivreal-site-migrator:page-confirm', MIG, () => spanIn(MG + 'page-confirm.md', 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'), 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'],
  ['page-confirm.md: the renderer rebuild', 'vivreal-site-migrator:page-confirm', MIG, () => spanIn(MG + 'page-confirm.md', 'scripts/dev-sync.js'), 'cd vivreal-site-renderer && npm run dev-sync'],
  ['page-confirm.md: artifact freshness', 'vivreal-site-migrator:page-confirm', MIG, () => spanIn(MG + 'page-confirm.md', 'ls -la qa-*.json'), 'ls -la captures/k/qa-live.json captures/k/blueprint.json'],
  ['studio-confirm.md: the browser output folder', 'vivreal-site-migrator:studio-confirm', MIG, () => spanIn(MG + 'studio-confirm.md', 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'), 'printenv PLAYWRIGHT_MCP_OUTPUT_DIR'],
  ['studio-confirm.md: the media route proof', 'vivreal-site-migrator:studio-confirm', MIG, () => spanIn(MG + 'studio-confirm.md', 'collectionObjectMedia?key=x'), 'curl "http://127.0.0.1:8799/tenant/collectionObjectMedia?key=x"'],
  ['studio-confirm.md: the shim still serves the field', 'vivreal-site-migrator:studio-confirm', MIG, () => spanIn(MG + 'studio-confirm.md', '8799/api/sites'), 'curl -s http://127.0.0.1:8799/api/sites | node -e "console.log(1)"'],
  ['studio-confirm.md: restore the fixture', 'vivreal-site-migrator:studio-confirm', MIG, () => spanIn(MG + 'studio-confirm.md', 'cp __saves/served-baseline.json'), 'cp captures/k/preview/__saves/served-baseline.json captures/k/preview/siteDetails.json'],
  ['cutover.md: the build retry', 'vivreal-site-migrator:cutover', MIG, () => spanIn(MG + 'cutover.md', 'aws amplify start-job'), 'aws amplify start-job --app-id x --branch-name b --job-type RETRY --job-id 3'],
  ['cutover.md: watch a build', 'vivreal-site-migrator:cutover', MIG, () => spanIn(MG + 'cutover.md', 'aws amplify get-job'), 'aws amplify get-job --app-id x --branch-name b --job-id 1'],
  ['cutover.md: the cache TTL read', 'vivreal-site-migrator:cutover', MIG, () => spanIn(MG + 'cutover.md', "aws amplify get-app --app-id <id> --query 'app.environmentVariables.SITE_CACHE_TTL_SECONDS'"), "aws amplify get-app --app-id x --query 'app.environmentVariables.SITE_CACHE_TTL_SECONDS'"],
  ['cutover.md: the revalidate secret, read and tested in one command', 'vivreal-site-migrator:cutover', MIG, () => spanIn(MG + 'cutover.md', 'S=$(aws amplify get-branch'), `[ -n "$S" ] && [ "$S" != "None" ] && echo set || echo not-set`],
  ['kit-stager.md: the head read', 'vivreal-site-migrator:kit-stager', MIG, () => spanIn(MG + 'kit-stager.md', 'worktree add --detach "${VIVREAL_REPOS}/_wt/kitstage-<date>"'), 'git ls-remote origin master'],
];
for (const [name, agentType, cwd, now, old] of PASS2_DEFS) {
  test(`ALLOW (pass 2 E3, the definition as it reads now, ${agentType}): ${name}`, () => {
    const command = now();
    assert.deepEqual(win(command, { cwd, agentType }), { refuse: false }, command);
  });
  test(`REFUSE (pass 2 E3, the definition as it read at a6c47ac, ${agentType}): ${name}`, () => {
    assert.equal(win(old, { cwd, agentType }).refuse, true, old);
  });
}

// F654 (pass 3 warnings): an escaped backslash or backtick before a line end is no continuation,
// an escaped quote opens no quote, and a backgrounded or piped `cd` moves no folder.
const F654_REFUSE = [
  ['an escaped backslash at the line end hides nothing: the next line runs', `echo done ${BS}${BS}${NL}git -C ${OWNER} status`, WT, 'Bash'],
  ['the same with a Windows line end', `echo done ${BS}${BS}${CRLF}git -C ${OWNER} status`, WT, 'Bash'],
  ['an escaped quote opens no quote, so the git after the semicolon runs', `echo it${BS}'s; git -C ${OWNER} status`, WT, 'Bash'],
  ['PowerShell: a doubled backtick at the line end hides nothing', `echo done ${BT}${BT}${NL}git -C ${OWNER} status`, WT, 'PowerShell'],
  ['a backgrounded cd into a worktree leaves git in the clone', `cd ${WT} & git status`, OWNER, 'Bash'],
  ['a cd run as a pipeline stage leaves git in the clone', `cd ${WT} | cat; git status`, OWNER, 'Bash'],
  ['a cd piped into, too', `true | cd ${WT}; git log -1`, OWNER, 'Bash'],
  ['PowerShell: a piped Set-Location into the clone moves there, so git runs in it', `Set-Location ${OWNER} | Out-Null; git status`, WT, 'PowerShell'],
];
for (const [name, command, cwd, toolName] of F654_REFUSE) {
  test(`REFUSE (subagent, F654): ${name}`, () => {
    assert.equal(win(command, { cwd, toolName }).refuse, true, JSON.stringify(command));
  });
}
const F654_ALLOW = [
  ['an escaped backslash at the line end, the next line in a worktree', `echo done ${BS}${BS}${NL}git -C ${WT} status`, WT, 'Bash'],
  ['an escaped quote, then git in a worktree', `echo it${BS}'s; git -C ${WT} status`, WT, 'Bash'],
  ['PowerShell: a doubled backtick, then git in a worktree', `echo done ${BT}${BT}${NL}git -C ${WT} status`, WT, 'PowerShell'],
  ['a single backslash still joins the next line into one command', `git -C ${WT} log ${BS}${NL}  --oneline -5`, OWNER, 'Bash'],
  ['a cd that is not backgrounded moves the folder, and git runs in the background there', `cd ${WT}; git status & wait`, OWNER, 'Bash'],
  ['a cd joined by && moves the folder', `cd ${WT} && git status | cat`, OWNER, 'Bash'],
  ['the CRLF twin: an escaped backslash and a Windows line end, the next line in a worktree', `echo done ${BS}${BS}${CRLF}git -C ${WT} status`, WT, 'Bash'],
  ['the piped-into twin: a pipe after a real cd keeps the folder it moved to', `cd ${WT}; true | cat; git log -1`, OWNER, 'Bash'],
  ['PowerShell: a piped Set-Location into a worktree moves the folder (one runspace)', `Set-Location ${WT} | Out-Null; git status`, OWNER, 'PowerShell'],
];
for (const [name, command, cwd, toolName] of F654_ALLOW) {
  test(`ALLOW (subagent, F654): ${name}`, () => {
    assert.deepEqual(win(command, { cwd, toolName, agentType: 'vivreal-principal:coder' }), { refuse: false }, JSON.stringify(command));
  });
}

// Note: every gap the guard lets through is listed where agents read the rule.
test('the documented gaps: shared-standards and the guard header list every one the review named', () => {
  const skill = fs.readFileSync(path.join(__dirname, '..', 'skills', 'shared-standards', 'SKILL.md'), 'utf8');
  const guard = fs.readFileSync(HOOK, 'utf8');
  const gaps = ['xargs', 'find -exec', 'sudo', 'a path argument', 'npm --prefix', 'make -C', 'bash <<EOF', 'env -S', 'typeset -x', 'iex'];
  for (const g of gaps) {
    assert.ok(skill.includes(g), `shared-standards SKILL.md does not list: ${g}`);
    assert.ok(guard.includes(g), `the guard header does not list: ${g}`);
  }
});

// The guard never throws, on random commands from the shapes the review fuzzed and on odd field
// types (a throw would fail open). Deterministic: a fixed seed.
test('the guard never throws: fuzzed commands and odd input shapes', () => {
  const ch = (n) => String.fromCharCode(n);
  const toks = ['git', '-C', OWNER, CMS, 'fetch', 'worktree', 'add', 'tag', 'cd', 'pushd', 'popd', '-', '--', 'env', '-S', 'timeout', 'wsl', '--cd', 'nice', 'setsid', 'nohup',
    'eval', 'bash', '-c', '-lc', '(', ')', '$(', BT, ch(34), ch(39), ';', '&&', '||', '|', '|&', '&', '2>&1', '&>', '&>>', '>&', '<&', NL, CRLF, BS + NL, BT + NL, BS + CRLF, '<<EOF', '<<', 'EOF', '#', BS, BS + BS, '$', '${', '}', '{',
    'X=', 'GIT_DIR=' + OWNER, '__proto__=1', 'constructor=2', 'export', '$env:__proto__ = 1', '%X%', '~', 'tail', 'head', 'grep', 'sort', 'wc', 'cat', 'echo', '"exit=$?"', '-o', '-e',
    '', ' ', ch(1) + '(', ch(1) + ')', ch(0), ch(9), 'origin', 'x:y', '::', '..', '/', 'C:', '/mnt/q', `${WROOT}/_wt/missing`, WT, MIG, 'node', 'commands/x.js', 'set-location'];
  let seed = 12345;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const types = ['vivreal-leadgen:runner', MIG_INGEST, 'vivreal-content:x', 'constructor:x', '__proto__:y', 'x', '', undefined];
  for (let k = 0; k < 20000; k++) {
    let command = '';
    for (let j = 0, len = 1 + rnd(12); j < len; j++) command += toks[rnd(toks.length)] + (rnd(4) ? ' ' : '');
    const cwd = [OWNER, WT, MIG][rnd(3)];
    assert.doesNotThrow(() => win(command, { cwd, agentType: types[rnd(types.length)], toolName: rnd(3) ? 'Bash' : 'PowerShell' }), JSON.stringify(command));
  }
  for (const f of ['command', 'cwd', 'agentId', 'agentType', 'toolName', 'root', 'home', 'env', 'platform']) {
    for (const v of [123, null, undefined, true, [], ['a'], Object.create(null), new String('x'), 0, NaN]) {
      assert.doesNotThrow(() => win('git status', { cwd: OWNER, [f]: v }), `${f} as ${Array.isArray(v) ? 'array' : typeof v}`);
    }
  }
});
