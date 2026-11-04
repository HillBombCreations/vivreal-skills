'use strict';
// The folder that holds every Vivreal clone side by side, found with NO setup on any machine.
//
// One algorithm for every consumer (docs/projects/universal-setup-2026-11/research.md, 2.1):
//   1. VIVREAL_REPOS, when set, is an OPTIONAL override. It must be absolute and hold a
//      vivreal-hq clone (`<it>/vivreal-hq/.git`). A set but wrong override is refused, never
//      silently replaced by a derived folder: whoever set it meant it.
//   2. For each start folder (the calling script's own folder first, then the cwd, then
//      CLAUDE_PROJECT_DIR): `git rev-parse --git-common-dir` gives the MAIN checkout's .git even
//      from a linked worktree, so its parent's parent is the clones folder. When git cannot
//      answer (not a checkout, git missing), walk up from the start to the first ancestor that
//      holds `vivreal-hq/.git` (covers `_ops/` and other plain folders beside the clones).
//   3. Otherwise null, with a reason. Never a drive or home-folder guess: a guessed root is how a
//      parked sibling checkout produced false greens.
//
// Zero dependencies. `exists` and `commonDir` are injectable so the tests prove each branch.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const HQ = 'vivreal-hq';

const isSet = (v) => typeof v === 'string' && v.trim() !== '';

/** The git common dir for `start`, absolute, or null when git cannot answer there. */
function gitCommonDir(start) {
  const res = spawnSync('git', ['-C', start, 'rev-parse', '--git-common-dir'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    windowsHide: true,
  });
  if (res.error || res.status !== 0) return null;
  const out = String(res.stdout || '').trim();
  if (!out) return null;
  // Relative from a main checkout (`.git`, `../../.git`), absolute from a worktree.
  return path.resolve(start, out);
}

const holdsHq = (dir, exists) => exists(path.join(dir, HQ, '.git'));

/**
 * @param {object} [opts]
 * @param {Record<string,string|undefined>} [opts.env]  process.env by default
 * @param {string[]} [opts.starts]  folders to derive from, in order; the cwd and
 *   CLAUDE_PROJECT_DIR are appended after them
 * @returns {{ root: string|null, source: 'VIVREAL_REPOS'|'git'|'ancestor'|'none', from?: string, reason?: string }}
 */
function resolveReposRoot({ env = process.env, starts = [], cwd = process.cwd(), exists = fs.existsSync, commonDir = gitCommonDir } = {}) {
  if (isSet(env.VIVREAL_REPOS)) {
    const given = env.VIVREAL_REPOS.trim();
    if (!path.isAbsolute(given)) {
      return { root: null, source: 'none', reason: `VIVREAL_REPOS is set to a relative path (${given}); unset it to derive the folder, or make it absolute` };
    }
    const root = path.resolve(given);
    if (!holdsHq(root, exists)) {
      return { root: null, source: 'none', reason: `VIVREAL_REPOS (${root}) holds no ${HQ} clone; unset it to derive the folder, or point it at the folder that holds ${HQ}` };
    }
    return { root, source: 'VIVREAL_REPOS' };
  }

  const all = [...starts, cwd, env.CLAUDE_PROJECT_DIR].filter(isSet).map((s) => path.resolve(s));
  const seen = new Set();
  for (const start of all) {
    if (seen.has(start)) continue;
    seen.add(start);

    const common = commonDir(start);
    if (common) {
      const root = path.dirname(path.dirname(common));
      if (holdsHq(root, exists)) return { root, source: 'git', from: start };
    }

    for (let dir = start; ; dir = path.dirname(dir)) {
      if (holdsHq(dir, exists)) return { root: dir, source: 'ancestor', from: start };
      if (path.dirname(dir) === dir) break;
    }
  }
  return {
    root: null,
    source: 'none',
    reason: `no folder holding a ${HQ} clone was found from ${all.join(', ') || '(no start folder)'}; run this from inside a Vivreal clone, or set VIVREAL_REPOS`,
  };
}

/** The root, or an Error carrying the reason. For CLIs that cannot do anything without it. */
function requireReposRoot(opts) {
  const r = resolveReposRoot(opts);
  if (!r.root) throw new Error(r.reason);
  return r.root;
}

/** One line saying which folder was used and why, for a CLI's first line of output. */
function describeReposRoot(r) {
  if (r.source === 'VIVREAL_REPOS') return `repos root: ${r.root} (from VIVREAL_REPOS)`;
  if (r.source === 'git' || r.source === 'ancestor') {
    return `repos root: ${r.root} (derived from ${r.from}; VIVREAL_REPOS overrides it)`;
  }
  return `repos root: none (${r.reason})`;
}

module.exports = { resolveReposRoot, requireReposRoot, describeReposRoot, gitCommonDir, HQ };
