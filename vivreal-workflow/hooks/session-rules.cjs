'use strict';
// SessionStart and SubagentStart: hand the session, and every subagent it starts, the owners'
// shared rules from vivreal-hq `origin/main`: `docs/standards/live-values.md` (the numbers the
// owners flip) and `docs/standards/INDEX.md` (one line per rule). hq's CLAUDE.md imports both,
// so a CURRENT hq checkout already holds them; everywhere else this hook is how they arrive.
//
//   SessionStart (plain stdout, added to the main thread's context):
//     the provenance line, the live lines, a fetch note when hq was fetched over a day ago, the
//     release-conductor line, and the index, except in a current hq checkout (its CLAUDE.md
//     imports the index already).
//   SubagentStart (one JSON object; Claude Code ignores plain stdout on this event):
//     the same text as hookSpecificOutput.additionalContext, or nothing in a current hq checkout,
//     except for Explore and Plan, which start without any CLAUDE.md.
//
// "Current" means the checkout's CLAUDE.md has a bare `@docs/standards/INDEX.md` line AND its
// tracked docs/standards/ files equal origin/main's. A checkout that fails either gets a stale
// line naming why, then origin/main's index, which wins.
//
// When the index cannot be read anywhere and origin/main truly lacks it (an hq clone whose
// origin/main predates the shared rules and whose working tree has none), or the live values are
// unreadable too, either event prints ONE line saying so and naming the fetch, never a promise of
// an index below. A read that failed for another reason (a git timeout, say) keeps the live values
// it read and ends with the command that reads the index (F467).
//
// Outside hq it reads hq through the kept hq worktree, `<clone root>/_wt/hq-main`, and every command
// it prints names that worktree (F641): the hq clone at the clone root is an owner's own checkout. Until
// the kept worktree exists it reads the clone and prints one line telling the main thread to make it.
//
// It reads, never writes: every git call runs with GIT_OPTIONAL_LOCKS=0 and with every inherited
// GIT_* variable dropped, it never fetches, and it compares docs/standards by blob hash
// (ls-tree, ls-files, hash-object without -w), because `git diff` refreshes and rewrites
// .git/index even with GIT_OPTIONAL_LOCKS=0 (measured on git 2.51), which would take the index
// lock in a checkout another agent is using. Outside a Vivreal checkout it prints nothing. It
// always exits 0: a missing rule line is never worth a broken session.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HQ = 'vivreal-hq';
const LIVE_PATH = 'docs/standards/live-values.md';
const INDEX_PATH = 'docs/standards/INDEX.md';
const STANDARDS_DIR = 'docs/standards/';
const LIVE_START = '<!-- live-values:start -->';
const LIVE_END = '<!-- live-values:end -->';
const IMPORT_LINE = '@docs/standards/INDEX.md';
// Claude Code caps a hook's stdout and its additionalContext at 10,000 characters and passes only
// a 2,000-character preview past that, so the hook keeps its own output under this.
const OUTPUT_BUDGET = 9800;
const STALE_FETCH_HOURS = 24;
const GIT_TIMEOUT_MS = 3000;
// Built-in subagents that start without any CLAUDE.md, so the import never reaches them.
const SKIPS_CLAUDE_MD = new Set(['Explore', 'Plan']);
const REASON_NO_IMPORT = `no ${IMPORT_LINE} import in CLAUDE.md`;
const REASON_DIFFERS = 'docs/standards differs from origin/main';
// The kept hq worktree every agent reads hq through (shared-standards, "Path resolution"; F641):
// the hq clone at the clone root is an owner's own checkout, so no printed command names it.
const KEPT_PARTS = ['_wt', 'hq-main'];
const KEPT_DEFAULT = '$VIVREAL_REPOS/' + KEPT_PARTS.join('/');
const BY = "printed by the vivreal-workflow plugin's session-rules hook:";

/** The folder every printed git command names: the kept hq worktree, or the hq worktree in use. */
const adviceOf = (f) => (f && f.adviceDir) || KEPT_DEFAULT;
const showCmd = (f) => `git -C "${adviceOf(f)}" show origin/main:`;

const lf = (text) => String(text).replace(/\r\n?/g, '\n');
const slashed = (p) => (path.sep === '\\' ? String(p).replace(/\\/g, '/') : p);

/** The environment for every git child: no inherited GIT_* variable, no optional locks, no prompt. */
function gitEnv(env) {
  const out = {};
  for (const [k, v] of Object.entries(env || {})) {
    if (/^GIT_/i.test(k)) continue;
    out[k] = v;
  }
  out.GIT_OPTIONAL_LOCKS = '0';
  out.GIT_TERMINAL_PROMPT = '0';
  return out;
}

/** The real git runner: `git -C <dir> <args>`, with a timeout, stdout only. */
function runGit(dir, args, env, input) {
  const res = spawnSync('git', ['-C', dir, ...args], {
    env,
    input,
    encoding: 'utf8',
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'ignore'],
  });
  return { status: res.error ? null : res.status, stdout: res.stdout || '' };
}

/** True only for a bare `@docs/standards/INDEX.md` line outside a fenced code block. */
function hasImportLine(text) {
  if (typeof text !== 'string' || !text) return false;
  let fence = null;
  for (const raw of lf(text).split('\n')) {
    const line = raw.trimEnd();
    const f = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (f) {
      if (!fence) fence = f[1][0];
      else if (f[1][0] === fence) fence = null;
      continue;
    }
    if (!fence && line === IMPORT_LINE) return true;
  }
  return false;
}

/** The `- key: value | source` lines between the markers, or why there are none. */
function parseLive(text) {
  if (typeof text !== 'string' || !text) return { ok: false, why: `${LIVE_PATH} is missing` };
  const t = lf(text);
  const start = t.indexOf(LIVE_START);
  const end = t.indexOf(LIVE_END);
  if (start < 0 || end < 0 || end < start) return { ok: false, why: `${LIVE_PATH} has no live-values markers` };
  const lines = t
    .slice(start + LIVE_START.length, end)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.startsWith('- '));
  if (!lines.length) return { ok: false, why: `${LIVE_PATH} has no lines between its markers` };
  return { ok: true, lines };
}

/** The index without its title line and its HTML comments, trimmed. */
function stripIndex(text) {
  const noComments = lf(text).replace(/<!--[\s\S]*?-->/g, '');
  const lines = noComments.split('\n');
  const title = lines.findIndex((l) => l.trim() !== '');
  if (title >= 0 && /^# /.test(lines[title])) lines.splice(title, 1);
  return lines
    .map((l) => l.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function firstLine(sha, source) {
  if (source === 'origin' && sha) return `Vivreal shared rules from hq origin/main@${sha.slice(0, 7)}, ${BY}`;
  const why = sha ? `origin/main@${sha.slice(0, 7)} has no copy` : 'no origin/main ref';
  return `Vivreal shared rules from the hq working tree (${why}), ${BY}`;
}

/** The whole output when no index could be read from origin/main or the working tree. */
function noIndexLine(f) {
  const dir = adviceOf(f);
  const where = f.sha ? `hq origin/main@${f.sha.slice(0, 7)}` : 'hq (it has no origin/main ref)';
  return (
    `Vivreal shared rules, ${BY} no rules index could be read from ${where} or from its working tree, ` +
    `so none is printed. Run git -C "${dir}" fetch origin, then read ${LIVE_PATH} and ${INDEX_PATH} ` +
    `with git -C "${dir}" show origin/main:<path> before the first dispatch.` +
    (f.keptMissing ? ` ${keptMissingLine(f)}` : '')
  );
}

/** Said once when the kept hq worktree does not exist yet, so the rules came from the hq clone. */
function keptMissingLine(f) {
  return (
    `There is no kept hq worktree at ${f.keptMissing}, so these rules were read from the hq clone; the main thread ` +
    `makes it once, in the hq clone: git worktree add --detach ../${KEPT_PARTS.join('/')} origin/main ` +
    '(vivreal-workflow:shared-standards, Path resolution). No agent runs anything in the hq clone.'
  );
}

/**
 * The exact output for one event, from facts alone. '' means print nothing.
 * @param {object} f
 * @param {'SessionStart'|'SubagentStart'} f.event
 * @param {string} [f.agentType]  SubagentStart's agent type
 * @param {string|null} f.repo  the Vivreal repository name, null outside one
 * @param {string|null} f.live  live-values.md text
 * @param {string|null} f.index  INDEX.md text
 * @param {string|null} f.sha  hq origin/main
 * @param {boolean} [f.indexMissingAtOrigin]  origin/main is known to lack the index
 * @param {'origin'|'worktree'} f.source  where the two files were read
 * @param {number|null} f.fetchAgeHours
 * @param {boolean} [f.importPresent]  hq only
 * @param {boolean} [f.standardsDiffer]  hq only
 * @param {string} [f.hqMissing]  why no hq clone was found
 * @param {string} [f.hqDir]  the hq checkout the rules were read from
 * @param {string} [f.adviceDir]  the hq worktree every printed git command names (never the hq clone)
 * @param {string} [f.keptMissing]  the kept hq worktree path, when it does not exist yet
 */
function buildOutput(f) {
  if (!f || !f.repo) return '';
  const subagent = f.event === 'SubagentStart';
  const wrap = (text) =>
    subagent
      ? JSON.stringify({ hookSpecificOutput: { hookEventName: 'SubagentStart', additionalContext: text } })
      : text + '\n';

  if (f.hqMissing) {
    return wrap(
      `Vivreal shared rules, ${BY} no vivreal-hq clone was found (${f.hqMissing}). ` +
        'Clone it (SETUP.md step 3) before any dispatch; the owner rules live there.',
    );
  }

  const indexText = typeof f.index === 'string' && f.index.trim() ? f.index : null;
  const live = parseLive(f.live);
  // The one fetch line replaces everything only when the live values are unreadable too, or when
  // origin/main truly lacks the index (no ref at all, or a `show` of it that exited non-zero).
  // Any other failed read, a git timeout among them, keeps the live values it read (F467).
  // Checked before the current-hq skip below: a CLAUDE.md import of a file that is not there
  // gives the session nothing either.
  if (!indexText && (!live.ok || !f.sha || f.indexMissingAtOrigin === true)) return wrap(noIndexLine(f));

  const isHq = String(f.repo).toLowerCase() === HQ;
  const reasons = [];
  if (isHq && !f.importPresent) reasons.push(REASON_NO_IMPORT);
  if (isHq && f.standardsDiffer) reasons.push(REASON_DIFFERS);
  const stale = reasons.length > 0;
  // An unread index always gets its command line: an import of a file git could not read may
  // give the session nothing.
  const needsIndex = !indexText || !isHq || stale || (subagent && SKIPS_CLAUDE_MD.has(f.agentType));
  // A current hq checkout's CLAUDE.md already gave this subagent the rules.
  if (subagent && !needsIndex) return '';

  const lines = [firstLine(f.sha, f.source)];
  if (f.keptMissing) lines.push(keptMissingLine(f));
  if (stale) {
    let tail;
    if (!indexText) tail = "hq origin/main's index wins, and it could not be read here: read it with the command below.";
    else if (f.source === 'origin') tail = "the index below is hq origin/main's and wins.";
    else tail = 'origin/main has no copy here, so the index below is the working tree\'s; fetch hq origin.';
    lines.push(`This checkout cannot load the current rules (${reasons.join('; ')}); ${tail}`);
  }
  if (live.ok) lines.push(...live.lines);
  else lines.push(`Live values unreadable (${live.why}); read them with ${showCmd(f)}${LIVE_PATH}`);
  if (f.fetchAgeHours === null || f.fetchAgeHours === undefined || f.fetchAgeHours > STALE_FETCH_HOURS) {
    const age = typeof f.fetchAgeHours === 'number' ? `${Math.floor(f.fetchAgeHours)} hours ago` : 'at an unknown time';
    lines.push(`hq origin/main was last fetched ${age}; run git -C "${adviceOf(f)}" fetch origin before the first dispatch.`);
  }
  if (!subagent) lines.push('Load vivreal-workflow:release-conductor before the first dispatch.');

  let text = lines.join('\n');
  if (!indexText) {
    text +=
      '\nThe rules index could not be read here (a git read failed, timed out or came back empty); ' +
      `read it now with ${showCmd(f)}${INDEX_PATH} before the first dispatch.`;
  } else if (needsIndex) {
    const withIndex = `${text}\n\n${stripIndex(f.index)}`;
    if (withIndex.length <= OUTPUT_BUDGET) text = withIndex;
    else {
      text +=
        `\nThe rules index is too long to print here (${withIndex.length} characters, budget ${OUTPUT_BUDGET}); ` +
        `read it now with ${showCmd(f)}${INDEX_PATH}`;
    }
  }
  return wrap(text);
}

/** True when the checkout's tracked docs/standards/ files differ from `sha`'s, by content. */
function standardsDifferFrom(git, dir, sha, env) {
  if (!sha) return true;
  const tree = git(dir, ['ls-tree', '-r', '-z', sha, '--', STANDARDS_DIR], env);
  if (tree.status !== 0) return true;
  const want = new Map();
  for (const entry of tree.stdout.split('\0')) {
    const m = entry.match(/^\d+ blob ([0-9a-f]+)\t(.+)$/);
    if (m) want.set(m[2], m[1]);
  }
  const listed = git(dir, ['ls-files', '-z', '--', STANDARDS_DIR], env);
  if (listed.status !== 0) return true;
  const paths = listed.stdout.split('\0').filter(Boolean);
  if (paths.length !== want.size || paths.some((p) => !want.has(p))) return true;
  if (!paths.length) return false;
  // Applies the checkout's own filters (autocrlf), so a CRLF working tree hashes like the blob.
  const hashed = git(dir, ['hash-object', '--stdin-paths'], env, paths.join('\n') + '\n');
  if (hashed.status !== 0) return true;
  const got = hashed.stdout.trim().split('\n').map((s) => s.trim());
  return got.length !== paths.length || paths.some((p, i) => got[i] !== want.get(p));
}

/**
 * The facts buildOutput needs, read from disk and git. Everything that touches the machine is
 * injected, so the tests can drive each branch and see every git call.
 */
function gather({ event, cwd, agentType, env, git, readFile, exists, mtimeMs, now, repoOf, resolveRoot }) {
  const repo = repoOf(cwd, env);
  if (!repo) return { event, agentType, repo: null };
  const genv = gitEnv(env);
  const isHq = String(repo).toLowerCase() === HQ;

  let hqDir = null;
  let adviceDir = null;
  let keptMissing = null;
  let missing = null;
  if (isHq) {
    const top = git(cwd, ['rev-parse', '--show-toplevel'], genv);
    // git prints an absolute path (forward slashes on Windows), which path.join accepts.
    hqDir = top.status === 0 && top.stdout.trim() ? top.stdout.trim() : cwd;
    // An hq worktree under _wt/ names itself; the hq clone (an owner's checkout) names the kept one.
    const under = String(hqDir).replace(/\\/g, '/').split('/');
    adviceDir = under[under.length - 2] === KEPT_PARTS[0] ? hqDir : path.join(path.dirname(hqDir), ...KEPT_PARTS);
  } else {
    const r = resolveRoot({ env, starts: [cwd] });
    if (r.root) {
      // Read hq through the kept worktree (F641). Until it exists, read the clone, and say so.
      const kept = path.join(r.root, ...KEPT_PARTS);
      adviceDir = kept;
      if (exists(path.join(kept, '.git'))) hqDir = kept;
      else {
        hqDir = path.join(r.root, HQ);
        keptMissing = kept;
      }
    } else missing = r.reason || 'no clone root';
  }
  if (!missing && !exists(path.join(hqDir, '.git'))) missing = `${hqDir} is not a git checkout`;
  if (missing) return { event, agentType, repo, hqMissing: missing };

  const head = git(hqDir, ['rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main'], genv);
  const sha = head.status === 0 && /^[0-9a-f]{40}$/.test(head.stdout.trim()) ? head.stdout.trim() : null;

  let fromWorktree = false;
  // The exit status of each origin/main read, by path. git answers a path the commit does not hold
  // with exit 128; a timeout or a failed spawn gives no status at all, which is UNREADABLE, never
  // missing (F467, definition review F476 (2)). An empty answer is not trusted as content either.
  const shownStatus = {};
  const read = (rel) => {
    if (sha) {
      const shown = git(hqDir, ['show', `${sha}:${rel}`], genv);
      shownStatus[rel] = shown.status;
      if (shown.status === 0 && shown.stdout) return shown.stdout;
    }
    try {
      const text = readFile(path.join(hqDir, ...rel.split('/')));
      fromWorktree = true;
      return text;
    } catch {
      return null;
    }
  };
  const live = read(LIVE_PATH);
  const index = read(INDEX_PATH);
  // Decided only when no index could be read: does origin/main truly lack it? The `show` above
  // already answered, so no second git call asks again: a numbered non-zero exit is an absence, no
  // status (a timeout) is not, and with no origin/main ref at all there is nothing to read.
  let indexMissingAtOrigin = false;
  if (typeof index !== 'string' || !index.trim()) {
    const st = shownStatus[INDEX_PATH];
    indexMissingAtOrigin = !sha || (typeof st === 'number' && st !== 0);
  }

  let fetchAgeHours = null;
  // FETCH_HEAD moves on every fetch, but each linked worktree writes its own (in its own git dir,
  // measured on git 2.51), while the main checkout's FETCH_HEAD and the origin/main reflog live in
  // the common dir; the reflog moves only when origin/main does, and a clone writes neither. So
  // the newest of the three is the last fetch. Both paths print relative to hqDir or absolute.
  const paths = git(hqDir, ['rev-parse', '--git-common-dir', '--git-path', 'FETCH_HEAD'], genv);
  if (paths.status === 0) {
    const [common, ownFetchHead] = paths.stdout.split('\n').map((s) => s.trim());
    const candidates = [];
    if (common) {
      const dir = path.resolve(hqDir, common);
      candidates.push(path.join(dir, 'FETCH_HEAD'), path.join(dir, 'logs', 'refs', 'remotes', 'origin', 'main'));
    }
    if (ownFetchHead) candidates.push(path.resolve(hqDir, ownFetchHead));
    const times = candidates.map((p) => mtimeMs(p)).filter((m) => typeof m === 'number');
    if (times.length) fetchAgeHours = Math.max(0, (now - Math.max(...times)) / 3600000);
  }

  const out = {
    event,
    agentType,
    repo,
    live,
    index,
    sha,
    indexMissingAtOrigin,
    source: fromWorktree ? 'worktree' : 'origin',
    fetchAgeHours,
    // Printed inside a Bash command, where a Windows backslash path would need escaping.
    hqDir: slashed(hqDir),
    adviceDir: slashed(adviceDir),
  };
  if (keptMissing) out.keptMissing = slashed(keptMissing);
  if (isHq) {
    let claudeMd = null;
    try {
      claudeMd = readFile(path.join(hqDir, 'CLAUDE.md'));
    } catch {
      claudeMd = null;
    }
    out.importPresent = hasImportLine(claudeMd);
    out.standardsDiffer = standardsDifferFrom(git, hqDir, sha, genv);
  }
  return out;
}

function main() {
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  } catch {
    data = {};
  }
  // routes-lib and repos-root run git with this process's environment, so it is cleaned first.
  for (const k of Object.keys(process.env)) if (/^GIT_/i.test(k)) delete process.env[k];
  process.env.GIT_OPTIONAL_LOCKS = '0';
  process.env.GIT_TERMINAL_PROMPT = '0';
  const { vivrealRepoOf } = require('./routes-lib.cjs');
  const { resolveReposRoot } = require('./repos-root.cjs');
  const facts = gather({
    event: data.hook_event_name === 'SubagentStart' ? 'SubagentStart' : 'SessionStart',
    cwd: data.cwd || process.cwd(),
    agentType: data.agent_type,
    env: process.env,
    git: runGit,
    readFile: (p) => fs.readFileSync(p, 'utf8'),
    exists: fs.existsSync,
    mtimeMs: (p) => {
      try {
        return fs.statSync(p).mtimeMs;
      } catch {
        return null;
      }
    },
    now: Date.now(),
    repoOf: vivrealRepoOf,
    resolveRoot: resolveReposRoot,
  });
  const out = buildOutput(facts);
  if (out) process.stdout.write(out);
}

if (require.main === module) {
  try {
    main();
  } catch {
    /* fail open: a missing rule line is never worth a broken session */
  }
  process.exit(0);
}

module.exports = {
  buildOutput,
  gather,
  gitEnv,
  hasImportLine,
  parseLive,
  stripIndex,
  standardsDifferFrom,
  OUTPUT_BUDGET,
};
