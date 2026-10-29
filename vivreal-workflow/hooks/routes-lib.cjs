// Shared by session-routing.cjs and dispatch-guard.cjs: load routes.json and work out which
// Vivreal repository a directory belongs to. No side effects; every failure returns null.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROUTES_PATH = path.join(__dirname, '..', 'routing', 'routes.json');
const TEMPLATE_PATH = path.join(__dirname, '..', 'references', 'dispatch-template.md');

function loadRoutes() {
  return JSON.parse(fs.readFileSync(ROUTES_PATH, 'utf8')).routes;
}

const slash = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');

function originOf(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
    }).trim();
  } catch {
    return '';
  }
}

/**
 * The repository name when `cwd` is a Vivreal checkout: its git origin is HillBombCreations/*,
 * or it sits under $VIVREAL_REPOS. A worktree under _wt/ resolves by its origin. Else null.
 */
function vivrealRepoOf(cwd, env = process.env) {
  const origin = originOf(cwd);
  const m = origin.match(/HillBombCreations\/([^/]+?)(\.git)?$/i);
  if (m) return m[1];
  const root = slash(env.VIVREAL_REPOS);
  const here = slash(cwd);
  if (root && here.toLowerCase().startsWith(root.toLowerCase() + '/')) {
    const first = here.slice(root.length + 1).split('/')[0];
    return first && first !== '_wt' && first !== '_ops' ? first : null;
  }
  return null;
}

/** Routes that apply in `repo`: its own rows plus every '*' row. */
function routesFor(routes, repo) {
  return routes.filter((r) => r.repo === '*' || (repo && r.repo.toLowerCase() === repo.toLowerCase()));
}

/** The route a first word selects in `repo`; a repo-specific row beats a '*' row. */
function routeForWord(routes, word, repo) {
  const w = String(word || '').toLowerCase();
  if (!w) return null;
  const hits = routes.filter((r) => r.keywords.includes(w));
  return (
    hits.find((r) => repo && r.repo.toLowerCase() === repo.toLowerCase()) ||
    hits.find((r) => r.repo === '*') ||
    null
  );
}

module.exports = { loadRoutes, vivrealRepoOf, routesFor, routeForWord, TEMPLATE_PATH };
