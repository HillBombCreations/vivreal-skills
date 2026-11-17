// Run: node --test vivreal-workflow/hooks/session-rules.test.cjs
// ALLOW and REFUSE controls for session-rules.cjs: the pure output builder over fixtures in the
// planned vivreal-hq formats, the gather step over an injected git runner, and the real hook
// spawned against scratch git repositories (an hq clone whose origin/main holds the rules, a
// stale worktree of it, and another Vivreal repo). Nothing here reads a real vivreal-hq checkout:
// every spawned hook gets VIVREAL_REPOS pointed at a scratch folder and no CLAUDE_PROJECT_DIR.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, 'session-rules.cjs');
// Required lazily, so this file still loads where the module is absent and each test fails on
// its own assertion.
const lib = () => require('./session-rules.cjs');

const SHA = '0123456789abcdef0123456789abcdef01234567';
const FIRST = `Vivreal shared rules from hq origin/main@${SHA.slice(0, 7)}, printed by the vivreal-workflow plugin's session-rules hook:`;
const STALE_NO_IMPORT =
  "This checkout cannot load the current rules (no @docs/standards/INDEX.md import in CLAUDE.md); the index below is hq origin/main's and wins.";
const STALE_DIFFERS =
  "This checkout cannot load the current rules (docs/standards differs from origin/main); the index below is hq origin/main's and wins.";

// Fixtures in the shapes the plan fixes (live-values markers, `- <key>: <value> | <source>` lines,
// an INDEX with a title, an HTML comment and `- P-<id>:` lines). The values are made up.
const LIVE_LINES = [
  '- agent-cap: 7 per machine | fixture owner, 2026-01-01T00:00:00Z',
  '- model: fixture-model | fixture owner, 2026-01-01T00:00:00Z',
  '- release: Z, in progress, run by a fixture owner | fixture',
  '- release-state: branch docs/fixture | pull before you write, push right after',
  '- next-release: Y, planning in free slots only (P-idle-slots) | fixture',
  '- sheet: Fixture Sheet, location key releaseSheetUrl | fixture',
];
const LIVE = [
  '# Live values',
  '',
  'Header prose that is not a live line.',
  '',
  '<!-- live-values:start -->',
  ...LIVE_LINES,
  '<!-- live-values:end -->',
  '',
].join('\n');
const INDEX = [
  '# Owner rules index',
  '',
  '<!-- One line per rule in process.md, same ID. Budget comment that',
  'spans two lines. -->',
  '',
  'The live values load just above.',
  '',
  '## Concurrency',
  '- P-cap: at most the live agent-cap background agents per machine.',
  '- P-idle-slots: a free slot goes to the current release first.',
  '',
  '## Review',
  '- P-review-every-change: every change gets an independent review.',
  '',
].join('\n');

function facts(over = {}) {
  return {
    event: 'SessionStart',
    agentType: undefined,
    repo: 'VR_Client_Auth',
    live: LIVE,
    index: INDEX,
    sha: SHA,
    source: 'origin',
    fetchAgeHours: 1,
    importPresent: false,
    standardsDiffer: false,
    ...over,
  };
}

const firstLineOf = (text) => text.split('\n')[0];
const contextOf = (stdout) => {
  const parsed = JSON.parse(stdout);
  assert.equal(parsed.hookSpecificOutput.hookEventName, 'SubagentStart');
  assert.equal(typeof parsed.hookSpecificOutput.additionalContext, 'string');
  return parsed.hookSpecificOutput.additionalContext;
};

// ---------------------------------------------------------------- SessionStart, pure builder

test('ALLOW: another Vivreal repo prints the provenance line, the live lines and the index', () => {
  const out = lib().buildOutput(facts());
  assert.equal(firstLineOf(out), FIRST);
  for (const l of LIVE_LINES) assert.ok(out.includes(l + '\n'), `missing live line ${l}`);
  assert.match(out, /^- P-cap: at most the live agent-cap/m);
  assert.match(out, /^- P-review-every-change:/m);
  assert.match(out, /^Load vivreal-workflow:release-conductor before the first dispatch\.$/m);
});

test('REFUSE: an index that would pass the 9,800 budget prints live lines and a pointer, no index', () => {
  const big = INDEX + Array.from({ length: 200 }, (_, i) => `- P-filler-${i}: ${'x'.repeat(60)}`).join('\n');
  const out = lib().buildOutput(facts({ index: big }));
  assert.ok(out.length <= 9800, `printed ${out.length} characters`);
  for (const l of LIVE_LINES) assert.ok(out.includes(l), `missing live line ${l}`);
  assert.doesNotMatch(out, /^- P-/m, 'an index line was printed past the budget');
  assert.match(out, /too long to print here/);
  assert.match(out, /show origin\/main:docs\/standards\/INDEX\.md/);
});

test('ALLOW: a current hq checkout prints the live lines and no index body', () => {
  const out = lib().buildOutput(facts({ repo: 'vivreal-hq', importPresent: true, standardsDiffer: false }));
  assert.equal(firstLineOf(out), FIRST);
  for (const l of LIVE_LINES) assert.ok(out.includes(l), `missing live line ${l}`);
  assert.doesNotMatch(out, /^- P-/m);
  assert.doesNotMatch(out, /cannot load the current rules/);
});

test('REFUSE of the skip: hq with no import line prints the stale line and the index', () => {
  const out = lib().buildOutput(facts({ repo: 'vivreal-hq', importPresent: false, standardsDiffer: false }));
  const lines = out.split('\n');
  assert.equal(lines[0], FIRST);
  assert.equal(lines[1], STALE_NO_IMPORT);
  assert.match(out, /^- P-cap:/m);
});

test('REFUSE of the skip: hq whose docs/standards differs prints the stale line and the index', () => {
  const out = lib().buildOutput(facts({ repo: 'vivreal-hq', importPresent: true, standardsDiffer: true }));
  const lines = out.split('\n');
  assert.equal(lines[0], FIRST);
  assert.equal(lines[1], STALE_DIFFERS);
  assert.match(out, /^- P-cap:/m);
});

test('REFUSE: live values with no markers print one unreadable line, never a guessed value', () => {
  const out = lib().buildOutput(facts({ live: LIVE.replace('<!-- live-values:start -->\n', '') }));
  assert.equal(firstLineOf(out), FIRST);
  const unreadable = out.split('\n').filter((l) => /live values unreadable/i.test(l));
  assert.equal(unreadable.length, 1);
  for (const l of LIVE_LINES) assert.ok(!out.includes(l), `printed ${l} from an unmarked file`);
  assert.match(out, /^- P-cap:/m, 'the index still prints');
});

test('ALLOW: a fetch 23 hours old prints no fetch note', () => {
  assert.doesNotMatch(lib().buildOutput(facts({ fetchAgeHours: 23 })), /last fetched/);
});

test('REFUSE: a fetch 25 hours old prints a fetch note', () => {
  const out = lib().buildOutput(facts({ fetchAgeHours: 25 }));
  assert.match(out, /hq origin\/main was last fetched 25 hours ago/);
  assert.match(out, /fetch origin/);
});

test('a non-Vivreal folder prints nothing on either event', () => {
  assert.equal(lib().buildOutput(facts({ repo: null })), '');
  assert.equal(lib().buildOutput(facts({ repo: null, event: 'SubagentStart', agentType: 'Explore' })), '');
});

test('the index title and its HTML comments are stripped', () => {
  const out = lib().buildOutput(facts());
  assert.doesNotMatch(out, /# Owner rules index/);
  assert.doesNotMatch(out, /<!--|-->/);
  assert.doesNotMatch(out, /spans two lines/);
  assert.match(out, /^## Concurrency$/m);
});

test('REFUSE: the first line is the provenance line on both events, never a bare live line', () => {
  for (const f of [facts(), facts({ event: 'SubagentStart', agentType: 'vivreal-principal:coder' })]) {
    const raw = lib().buildOutput(f);
    const text = f.event === 'SubagentStart' ? contextOf(raw) : raw;
    assert.equal(firstLineOf(text), FIRST);
    assert.notEqual(firstLineOf(text), LIVE_LINES[0]);
  }
});

test('a working-tree fallback names its source on the first line', () => {
  const out = lib().buildOutput(facts({ source: 'worktree' }));
  assert.match(firstLineOf(out), /^Vivreal shared rules from the hq working tree /);
  assert.match(firstLineOf(out), /printed by the vivreal-workflow plugin's session-rules hook:$/);
});

test('no hq clone prints one line that says so', () => {
  const out = lib().buildOutput(facts({ hqMissing: 'VIVREAL_REPOS holds no vivreal-hq clone' }));
  const lines = out.trim().split('\n');
  assert.equal(lines.length, 1);
  assert.match(lines[0], /no vivreal-hq clone was found/);
  assert.match(lines[0], /SETUP\.md step 3/);
});

// ---------------------------------------------------------------- SubagentStart, pure builder

test('ALLOW: SubagentStart in another repo returns one JSON object with the live lines and the index', () => {
  const raw = lib().buildOutput(facts({ event: 'SubagentStart', agentType: 'vivreal-principal:researcher' }));
  const ctx = contextOf(raw);
  assert.equal(firstLineOf(ctx), FIRST);
  for (const l of LIVE_LINES) assert.ok(ctx.includes(l), `missing live line ${l}`);
  assert.match(ctx, /^- P-cap:/m);
});

test('REFUSE: SubagentStart never prints plain text (Claude Code ignores plain stdout on it)', () => {
  const raw = lib().buildOutput(facts({ event: 'SubagentStart', agentType: 'general-purpose' }));
  assert.ok(raw.length > 0);
  assert.doesNotThrow(() => JSON.parse(raw), 'SubagentStart output is not one JSON object');
  assert.equal(raw.trim().split('\n').length, 1, 'more than one line of output');
});

test('ALLOW: SubagentStart in a current hq checkout adds nothing for a custom or plugin agent', () => {
  for (const agentType of ['vivreal-principal:coder', 'my-agent', 'general-purpose']) {
    assert.equal(
      lib().buildOutput(facts({ event: 'SubagentStart', agentType, repo: 'vivreal-hq', importPresent: true })),
      '',
      `${agentType} got a duplicate of the import`,
    );
  }
});

test('SubagentStart in a current hq checkout gives Explore and Plan the index (they skip CLAUDE.md)', () => {
  for (const agentType of ['Explore', 'Plan']) {
    const ctx = contextOf(
      lib().buildOutput(facts({ event: 'SubagentStart', agentType, repo: 'vivreal-hq', importPresent: true })),
    );
    assert.equal(firstLineOf(ctx), FIRST);
    assert.doesNotMatch(ctx, /cannot load the current rules/);
    assert.match(ctx, /^- P-cap:/m);
    for (const l of LIVE_LINES) assert.ok(ctx.includes(l));
  }
});

test('SubagentStart in a stale hq checkout returns the stale line and the index', () => {
  const ctx = contextOf(
    lib().buildOutput(
      facts({ event: 'SubagentStart', agentType: 'vivreal-principal:coder', repo: 'vivreal-hq', importPresent: false }),
    ),
  );
  assert.equal(ctx.split('\n')[1], STALE_NO_IMPORT);
  assert.match(ctx, /^- P-cap:/m);
});

test('REFUSE: the 9,800 budget applies to additionalContext', () => {
  const big = INDEX + Array.from({ length: 200 }, (_, i) => `- P-filler-${i}: ${'x'.repeat(60)}`).join('\n');
  const ctx = contextOf(lib().buildOutput(facts({ event: 'SubagentStart', agentType: 'Explore', index: big })));
  assert.ok(ctx.length <= 9800, `additionalContext is ${ctx.length} characters`);
  assert.doesNotMatch(ctx, /^- P-/m);
  assert.match(ctx, /too long to print here/);
});

test('no Load release-conductor line for a subagent (it does not dispatch)', () => {
  const ctx = contextOf(lib().buildOutput(facts({ event: 'SubagentStart', agentType: 'Explore' })));
  assert.doesNotMatch(ctx, /release-conductor before the first dispatch/);
});

// ---------------------------------------------------------------- the import line

test('ALLOW: a bare import line counts as present', () => {
  const md = '# CLAUDE.md\n\n## Rules every session follows\n\nThe rules.\n\n@docs/standards/live-values.md\n@docs/standards/INDEX.md\r\n';
  assert.equal(lib().hasImportLine(md), true);
});

test('REFUSE: the import line in backticks or in a code fence does not count', () => {
  assert.equal(lib().hasImportLine('Load `@docs/standards/INDEX.md` here.\n'), false);
  assert.equal(lib().hasImportLine('`@docs/standards/INDEX.md`\n'), false);
  assert.equal(lib().hasImportLine('```\n@docs/standards/INDEX.md\n```\n'), false);
  assert.equal(lib().hasImportLine('~~~md\n@docs/standards/INDEX.md\n~~~\n'), false);
  assert.equal(lib().hasImportLine(''), false);
  assert.equal(lib().hasImportLine(null), false);
});

// ---------------------------------------------------------------- gather, injected git

function fakeGit({ sha = SHA, tree, indexPaths, hashes, live = LIVE, index = INDEX, showFails = false } = {}) {
  const calls = [];
  const defaultTree = [
    `100644 blob aaaa\tdocs/standards/INDEX.md`,
    `100644 blob bbbb\tdocs/standards/live-values.md`,
  ];
  const run = (dir, args, env, input) => {
    calls.push({ dir, args, env, input });
    const [cmd] = args;
    if (cmd === 'rev-parse' && args.includes('--show-toplevel')) return { status: 0, stdout: dir + '\n' };
    if (cmd === 'rev-parse' && args.includes('--git-common-dir')) return { status: 0, stdout: '.git\n' };
    if (cmd === 'rev-parse') return sha ? { status: 0, stdout: sha + '\n' } : { status: 1, stdout: '' };
    if (cmd === 'show') {
      if (showFails) return { status: 128, stdout: '' };
      const target = args[args.length - 1];
      if (target.endsWith(':docs/standards/live-values.md')) return { status: 0, stdout: live };
      if (target.endsWith(':docs/standards/INDEX.md')) return { status: 0, stdout: index };
      return { status: 128, stdout: '' };
    }
    if (cmd === 'ls-tree') return { status: 0, stdout: (tree || defaultTree).map((l) => l + '\0').join('') };
    if (cmd === 'ls-files') {
      const p = indexPaths || ['docs/standards/INDEX.md', 'docs/standards/live-values.md'];
      return { status: 0, stdout: p.map((x) => x + '\0').join('') };
    }
    if (cmd === 'hash-object') return { status: 0, stdout: (hashes || ['aaaa', 'bbbb']).join('\n') + '\n' };
    return { status: 1, stdout: '' };
  };
  return { run, calls };
}

function gatherWith(over = {}, gitOpts = {}) {
  const g = fakeGit(gitOpts);
  const files = {
    [path.join('/hq', 'CLAUDE.md')]: '# hq\n\n@docs/standards/live-values.md\n@docs/standards/INDEX.md\n',
    ...over.files,
  };
  const out = lib().gather({
    event: 'SessionStart',
    cwd: '/hq',
    agentType: undefined,
    env: { GIT_DIR: '/elsewhere/.git', GIT_WORK_TREE: '/elsewhere', Git_Index_File: '/x', PATH: 'p', ...over.env },
    git: g.run,
    readFile: (p) => {
      if (Object.prototype.hasOwnProperty.call(files, p)) return files[p];
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    },
    exists: () => true,
    mtimeMs: () => Date.now() - 2 * 3600 * 1000,
    now: Date.now(),
    repoOf: () => over.repo || 'vivreal-hq',
    resolveRoot: () => ({ root: '/root', source: 'git' }),
    ...over.inject,
  });
  return { out, calls: g.calls };
}

test('REFUSE of a lock: every git call runs with GIT_OPTIONAL_LOCKS=0 and no inherited GIT_* variable', () => {
  const { calls } = gatherWith();
  assert.ok(calls.length >= 5, `only ${calls.length} git calls`);
  for (const c of calls) {
    assert.equal(c.env.GIT_OPTIONAL_LOCKS, '0', `git ${c.args.join(' ')} ran without GIT_OPTIONAL_LOCKS=0`);
    assert.equal(c.env.GIT_TERMINAL_PROMPT, '0');
    for (const k of Object.keys(c.env)) {
      if (k === 'GIT_OPTIONAL_LOCKS' || k === 'GIT_TERMINAL_PROMPT') continue;
      assert.doesNotMatch(k, /^GIT_/i, `git ${c.args.join(' ')} inherited ${k}`);
    }
    assert.equal(c.env.PATH, 'p', 'the rest of the environment is kept');
  }
});

test('REFUSE of a write: the hook only reads (no fetch, no diff, no hash-object -w)', () => {
  const { calls } = gatherWith();
  assert.ok(calls.length >= 5, `only ${calls.length} git calls`);
  const allowed = new Set(['rev-parse', 'show', 'ls-tree', 'ls-files', 'hash-object']);
  for (const c of calls) {
    assert.ok(allowed.has(c.args[0]), `git ${c.args[0]} is not a read this hook may make`);
    assert.ok(!c.args.includes('-w'), 'hash-object -w writes an object');
  }
  // `git diff` refreshes and rewrites .git/index even with GIT_OPTIONAL_LOCKS=0 (measured on git
  // 2.51, see the integration test below), so the comparison must not use it.
  assert.ok(!calls.some((c) => c.args[0] === 'diff'));
});

test('gather in a current hq checkout: import present, standards equal, sha from origin/main', () => {
  const { out } = gatherWith();
  assert.equal(out.repo, 'vivreal-hq');
  assert.equal(out.sha, SHA);
  assert.equal(out.source, 'origin');
  assert.equal(out.importPresent, true);
  assert.equal(out.standardsDiffer, false);
  assert.equal(out.live, LIVE);
  assert.equal(out.index, INDEX);
  assert.ok(out.fetchAgeHours > 1.9 && out.fetchAgeHours < 2.1);
});

test('REFUSE: a changed blob, a missing path or an extra path makes standards differ', () => {
  assert.equal(gatherWith({}, { hashes: ['aaaa', 'cccc'] }).out.standardsDiffer, true);
  assert.equal(gatherWith({}, { indexPaths: ['docs/standards/INDEX.md'] }).out.standardsDiffer, true);
  assert.equal(
    gatherWith({}, { indexPaths: ['docs/standards/INDEX.md', 'docs/standards/live-values.md', 'docs/standards/x.md'], hashes: ['aaaa', 'bbbb', 'dddd'] }).out
      .standardsDiffer,
    true,
  );
  assert.equal(gatherWith({}, { sha: null }).out.standardsDiffer, true);
});

test('REFUSE: no CLAUDE.md, or one without the bare import line, is not current', () => {
  assert.equal(gatherWith({ files: { [path.join('/hq', 'CLAUDE.md')]: '# hq\n`@docs/standards/INDEX.md`\n' } }).out.importPresent, false);
  assert.equal(
    gatherWith({ inject: { readFile: () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); } } }).out.importPresent,
    false,
  );
});

test('origin/main without the files falls back to the working tree, labelled', () => {
  const files = {
    [path.join('/hq', 'docs', 'standards', 'live-values.md')]: LIVE,
    [path.join('/hq', 'docs', 'standards', 'INDEX.md')]: INDEX,
  };
  const { out } = gatherWith({ files }, { showFails: true });
  assert.equal(out.source, 'worktree');
  assert.equal(out.live, LIVE);
});

test('outside hq, the rules are read from the clone root, and a missing hq clone is reported', () => {
  const other = gatherWith({ repo: 'VR_Client_Auth' });
  assert.equal(other.out.repo, 'VR_Client_Auth');
  assert.ok(other.calls.some((c) => c.dir === path.join('/root', 'vivreal-hq')));
  assert.equal(other.out.importPresent, undefined, 'import is an hq-only fact');
  const missing = gatherWith({
    repo: 'VR_Client_Auth',
    inject: { resolveRoot: () => ({ root: null, source: 'none', reason: 'no clone root' }) },
  });
  assert.match(missing.out.hqMissing, /no clone root/);
});

// ---------------------------------------------------------------- the wiring

test('hooks.json runs this hook on SessionStart and on every SubagentStart (no matcher)', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'hooks.json'), 'utf8'));
  const runsRules = (entry) => entry.hooks.some((h) => /hooks\/session-rules\.cjs"?$/.test(h.command));
  const sessionStart = manifest.hooks.SessionStart.filter(runsRules);
  assert.equal(sessionStart.length, 1, 'SessionStart does not run session-rules.cjs exactly once');
  assert.ok(manifest.hooks.SessionStart.some((e) => e.hooks.some((h) => /session-routing\.cjs/.test(h.command))), 'the routing hook is gone');
  const subagent = (manifest.hooks.SubagentStart || []).filter(runsRules);
  assert.equal(subagent.length, 1, 'SubagentStart does not run session-rules.cjs exactly once');
  assert.equal(subagent[0].matcher, undefined, 'a matcher would skip some agent types');
  for (const h of [...sessionStart[0].hooks, ...subagent[0].hooks]) assert.ok(h.timeout >= 5, 'timeout under 5 seconds');
});

// ---------------------------------------------------------------- the real hook, real git

function git(cwd, ...args) {
  const res = spawnSync(
    'git',
    ['-c', 'user.name=probe', '-c', 'user.email=probe@example.invalid', '-c', 'init.defaultBranch=main', '-c', 'core.autocrlf=false', ...args],
    { cwd, encoding: 'utf8', env: cleanEnv() },
  );
  assert.equal(res.status, 0, `git ${args.join(' ')} failed: ${res.stderr}`);
  return res.stdout.trim();
}

function cleanEnv(extra = {}) {
  const env = {};
  for (const [k, v] of Object.entries(process.env)) {
    if (/^GIT_/i.test(k)) continue;
    if (['VIVREAL_REPOS', 'CLAUDE_PROJECT_DIR', 'CLAUDE_ENV_FILE'].includes(k)) continue;
    env[k] = v;
  }
  return { ...env, ...extra };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-rules-'));
const seed = path.join(root, '_seed');
const bare = path.join(root, '_origin-hq.git');
const hq = path.join(root, 'vivreal-hq');
const stale = path.join(root, '_wt', 'hq-stale');
const other = path.join(root, 'VR_Client_Auth');
const nowhere = fs.mkdtempSync(path.join(os.tmpdir(), 'not-vivreal-'));
const noHqRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-no-hq-'));
test.after(() => {
  for (const d of [root, nowhere, noHqRoot]) fs.rmSync(d, { recursive: true, force: true });
});

fs.mkdirSync(seed, { recursive: true });
git(seed, 'init', '-q');
fs.writeFileSync(path.join(seed, 'CLAUDE.md'), '# hq, an old checkout with no import\n');
git(seed, 'add', '-A');
git(seed, 'commit', '-q', '-m', 'old');
const staleSha = git(seed, 'rev-parse', 'HEAD');
fs.mkdirSync(path.join(seed, 'docs', 'standards'), { recursive: true });
fs.writeFileSync(path.join(seed, 'CLAUDE.md'), '# hq\n\n## Rules every session follows\n\n@docs/standards/live-values.md\n@docs/standards/INDEX.md\n');
fs.writeFileSync(path.join(seed, 'docs', 'standards', 'live-values.md'), LIVE);
fs.writeFileSync(path.join(seed, 'docs', 'standards', 'INDEX.md'), INDEX);
git(seed, 'add', '-A');
git(seed, 'commit', '-q', '-m', 'rules');
const currentSha = git(seed, 'rev-parse', 'HEAD');
git(root, 'clone', '-q', '--bare', seed, bare);
git(root, 'clone', '-q', bare, hq);
// The hook knows hq by its origin URL; it never fetches, so the URL is never contacted.
git(hq, 'remote', 'set-url', 'origin', 'https://github.com/HillBombCreations/vivreal-hq.git');
git(hq, 'worktree', 'add', '-q', '--detach', stale, staleSha);
fs.mkdirSync(other, { recursive: true });
git(other, 'init', '-q');
git(other, 'remote', 'add', 'origin', 'https://github.com/HillBombCreations/VR_Client_Auth.git');
fs.mkdirSync(path.join(noHqRoot, 'VR_Client_Auth'), { recursive: true });
git(path.join(noHqRoot, 'VR_Client_Auth'), 'init', '-q');
git(path.join(noHqRoot, 'VR_Client_Auth'), 'remote', 'add', 'origin', 'https://github.com/HillBombCreations/VR_Client_Auth.git');

const REAL_FIRST = `Vivreal shared rules from hq origin/main@${currentSha.slice(0, 7)}, printed by the vivreal-workflow plugin's session-rules hook:`;

function runHook(payload, reposRoot = root) {
  const res = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify(payload),
    encoding: 'utf8',
    env: cleanEnv({ VIVREAL_REPOS: reposRoot }),
  });
  assert.equal(res.status, 0, `the hook exited ${res.status}: ${res.stderr}`);
  return res.stdout;
}

test('real hook, another repo: provenance line with the real origin/main sha, live lines, index', () => {
  const out = runHook({ hook_event_name: 'SessionStart', cwd: other, source: 'startup' });
  assert.equal(firstLineOf(out), REAL_FIRST);
  for (const l of LIVE_LINES) assert.ok(out.includes(l));
  assert.match(out, /^- P-cap:/m);
});

test('real hook, current hq: live lines, no index body, no stale line', () => {
  const out = runHook({ hook_event_name: 'SessionStart', cwd: hq });
  assert.equal(firstLineOf(out), REAL_FIRST);
  assert.doesNotMatch(out, /^- P-/m);
  assert.doesNotMatch(out, /cannot load/);
});

test('real hook, stale hq worktree: the stale line names the missing import, then the index', () => {
  const out = runHook({ hook_event_name: 'SessionStart', cwd: stale });
  const lines = out.split('\n');
  assert.equal(lines[0], REAL_FIRST);
  assert.match(lines[1], /^This checkout cannot load the current rules \(no @docs\/standards\/INDEX\.md import in CLAUDE\.md; docs\/standards differs from origin\/main\);/);
  assert.match(out, /^- P-cap:/m);
});

test('real hook, SubagentStart: nothing for a plugin agent in current hq, JSON for Explore and elsewhere', () => {
  assert.equal(runHook({ hook_event_name: 'SubagentStart', cwd: hq, agent_type: 'vivreal-principal:researcher' }), '');
  const explore = contextOf(runHook({ hook_event_name: 'SubagentStart', cwd: hq, agent_type: 'Explore' }));
  assert.equal(firstLineOf(explore), REAL_FIRST);
  assert.match(explore, /^- P-cap:/m);
  const elsewhere = contextOf(runHook({ hook_event_name: 'SubagentStart', cwd: other, agent_type: 'vivreal-principal:coder' }));
  assert.equal(firstLineOf(elsewhere), REAL_FIRST);
  const staleCtx = contextOf(runHook({ hook_event_name: 'SubagentStart', cwd: stale, agent_type: 'vivreal-principal:coder' }));
  assert.match(staleCtx.split('\n')[1], /^This checkout cannot load the current rules/);
});

test('real hook, a folder that is not a Vivreal clone: nothing on either event', () => {
  assert.equal(runHook({ hook_event_name: 'SessionStart', cwd: nowhere }), '');
  assert.equal(runHook({ hook_event_name: 'SubagentStart', cwd: nowhere, agent_type: 'Explore' }), '');
});

test('real hook, no hq clone at the clone root: one line that says so', () => {
  const out = runHook({ hook_event_name: 'SessionStart', cwd: path.join(noHqRoot, 'VR_Client_Auth') }, noHqRoot);
  assert.equal(out.trim().split('\n').length, 1);
  assert.match(out, /no vivreal-hq clone was found/);
});

test('REFUSE of a write: a stat-dirty checkout is read as current and its .git/index is never rewritten', () => {
  // Same bytes, newer mtime: git's stat check now misses, so any command that refreshes the index
  // (git diff does, even with GIT_OPTIONAL_LOCKS=0) would rewrite it.
  const file = path.join(hq, 'docs', 'standards', 'INDEX.md');
  fs.writeFileSync(file, fs.readFileSync(file));
  const later = new Date(Date.now() + 5000);
  fs.utimesSync(file, later, later);
  const indexFile = path.join(hq, '.git', 'index');
  const before = fs.readFileSync(indexFile);
  const out = runHook({ hook_event_name: 'SessionStart', cwd: hq });
  assert.equal(firstLineOf(out), REAL_FIRST);
  assert.doesNotMatch(out, /cannot load/, 'a stat-only change was read as a content difference');
  assert.ok(fs.readFileSync(indexFile).equals(before), 'the hook rewrote .git/index');
  assert.ok(!fs.existsSync(indexFile + '.lock'));
  // Positive control: the checkout really was stat-dirty, so a refreshing command does rewrite it.
  git(hq, 'status', '--porcelain');
  assert.ok(!fs.readFileSync(indexFile).equals(before), 'control: git status did not refresh, so the check above proved nothing');
});
