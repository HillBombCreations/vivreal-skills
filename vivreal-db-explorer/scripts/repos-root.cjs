// The folder that holds every Vivreal clone, found with no configuration.
//
// One algorithm, byte-identical in vivreal-workflow/hooks/repos-root.cjs and
// vivreal-db-explorer/scripts/repos-root.cjs (a plugin can only require files inside itself);
// vivreal-workflow/hooks/routing-hooks.test.cjs fails when the two copies differ.
//
// Order:
//   1. VIVREAL_REPOS, an OPTIONAL override. Used only when it is absolute and holds a vivreal-hq
//      clone (vivreal-hq/.git); otherwise it is reported as rejected and derivation runs.
//   2. For each start folder in order (the session's cwd, CLAUDE_PROJECT_DIR, a script's own
//      folder): the parent of the MAIN checkout, from `git rev-parse --git-common-dir`, so a
//      worktree under _wt/ resolves to the same root as its main checkout; then the first ancestor
//      of the start that holds a vivreal-hq clone, which covers _ops/ and other non-git folders.
//   3. null, with the reason. Never a guessed drive or home folder.
//
// No side effects and no dependencies; every failure is a null root with a reason.
'use strict';

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** True when `dir` holds a vivreal-hq clone (a main checkout's .git folder or a worktree's .git file). */
function holdsHq(dir) {
  try {
    return fs.existsSync(path.join(dir, 'vivreal-hq', '.git'));
  } catch {
    return false;
  }
}

/** Forward slashes, so the value reads the same in Git Bash, on macOS and on Linux. */
function forwardSlashes(p) {
  return p.split(path.sep).join('/');
}

/** The absolute git common dir for `start`, or null when `start` is not inside a git checkout. */
function gitCommonDir(start) {
  try {
    const out = execFileSync('git', ['-C', start, 'rev-parse', '--git-common-dir'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
    // Relative from a main checkout (".git", "../../.git"), absolute from a worktree.
    return out ? path.resolve(start, out) : null;
  } catch {
    return null;
  }
}

/** The clone root reachable from one start folder, or null. */
function rootFromStart(start) {
  if (typeof start !== 'string' || !start || !path.isAbsolute(start) || !isDir(start)) return null;
  const common = gitCommonDir(start);
  if (common) {
    const candidate = path.dirname(path.dirname(common));
    if (holdsHq(candidate)) return candidate;
  }
  let dir = path.resolve(start);
  for (;;) {
    if (holdsHq(dir)) return dir;
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

/**
 * Resolve the clone root.
 * @param {{ env?: object, starts?: Array<string|undefined> }} options
 * @returns {{ root: string|null, source: string, rejected: string|null, reason?: string }}
 *   `root` uses forward slashes; `source` is "VIVREAL_REPOS" or "derived from <start>";
 *   `rejected` says why a set VIVREAL_REPOS was not used; `reason` explains a null root.
 */
function resolveReposRoot({ env = process.env, starts = [] } = {}) {
  const override = env.VIVREAL_REPOS;
  let rejected = null;
  if (override) {
    if (path.isAbsolute(override) && holdsHq(override)) {
      return { root: forwardSlashes(path.resolve(override)), source: 'VIVREAL_REPOS', rejected: null };
    }
    rejected = 'VIVREAL_REPOS is set but is not an absolute folder holding a vivreal-hq clone';
  }
  const tried = starts.filter((s) => typeof s === 'string' && s);
  for (const start of tried) {
    const root = rootFromStart(start);
    if (root) return { root: forwardSlashes(root), source: `derived from ${forwardSlashes(start)}`, rejected };
  }
  const where = tried.length ? tried.map(forwardSlashes).join(', ') : 'no start folder';
  return {
    root: null,
    source: 'none',
    rejected,
    reason:
      `${rejected || 'VIVREAL_REPOS is not set'}, and no folder holding a vivreal-hq clone was found from ${where}. ` +
      'Open the session inside a Vivreal clone.',
  };
}

module.exports = { resolveReposRoot, holdsHq };
