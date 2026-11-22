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
const win = (command, over = {}) =>
  lib().decide({ command, cwd: WT, agentId: AGENT, toolName: 'Bash', root: WROOT, platform: 'win32', home: DRIVE + '/home', env: {}, kindOf: winKind, ...over });

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
