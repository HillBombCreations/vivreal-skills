---
name: vivreal-package-update
description: Use to bump a shared dependency across ALL Vivreal repos that consume it — especially the private @hillbombcreations/* GitHub Packages (schemas, site-renderer, tier-quotas). Discovers consumers, detects version skew, bumps each repo, deletes node_modules + package-lock.json, reinstalls against GitHub Packages, builds/tests, and opens PRs. Triggers on: bump package, update dependency across repos, upgrade @hillbombcreations/schemas, version skew, coordinated dependency update, update shared package everywhere, package-lock reinstall.
---

# Vivreal Cross-Repo Package Update

Coordinated bump of a shared dependency across every consumer repo, with a **clean reinstall**
(delete `node_modules` + `package-lock.json`, then `npm install`) so the private
`@hillbombcreations/*` packages re-resolve from GitHub Packages. Built for the recurring
"bump `@hillbombcreations/schemas` everywhere" flow and to kill version skew (e.g. one repo
left on an old pin — VR_Main_API was stuck on `^1.15.1` while others were on `^1.18.0`).

## GitHub Packages auth (read this first)

`@hillbombcreations/*` are PRIVATE packages on GitHub's npm registry. Each repo has a `.npmrc`:
```
@hillbombcreations:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<GitHub PAT with read:packages>
```
- The token is **inlined in `.npmrc`** (a secret; `.npmrc` is gitignored — keep it that way).
- The canonical token lives in **`${VIVREAL_REPOS}/Vivreal_Portal_Mobile/.npmrc`**. If a repo is
  missing `.npmrc` or its token is stale (install 401/403 from npm.pkg.github.com), copy the
  `.npmrc` from the portal into that repo before reinstalling.
- **NEVER** echo, commit, or paste the token. If you must set it transiently, use an env var
  (`NODE_AUTH_TOKEN` / a temp `.npmrc`), and never print it.

## Procedure

### 1. Discover consumers + detect skew
Scan every repo under `${VIVREAL_REPOS}` for the target package and report the current pin per repo:
```bash
PKG="@hillbombcreations/schemas"
for d in "${VIVREAL_REPOS:-..}"/*/; do
  pj="$d/package.json"; [ -f "$pj" ] || continue
  v=$(node -e "const p=require('$pj');const a={...p.dependencies,...p.devDependencies};process.stdout.write(a['$PKG']||'')" 2>/dev/null)
  [ -n "$v" ] && echo "$(basename "$d"): $v"
done
```
Report which repos are on which version (the skew) and confirm the **target version** with the user.
Check the package's own repo (e.g. `Vivreal-Schemas`) git log/CHANGELOG for breaking changes between
the old and new versions before bumping.

### 2. Per consumer repo (one branch each)
For each repo to update:
1. Create a branch: `chore/bump-<pkg-short>-<version>` (e.g. `chore/bump-schemas-1.18.0`).
2. Set the new version in `package.json` (use the same range style already present — usually `^x.y.z`).
3. **Clean reinstall (the key step):**
   ```bash
   rm -rf node_modules package-lock.json
   npm install        # re-resolves @hillbombcreations/* from GitHub Packages via .npmrc
   ```
   If install fails with 401/403 on `npm.pkg.github.com`, the `.npmrc` token is missing/stale —
   copy it from the portal (see auth section) and retry. Do NOT proceed without a clean install.
4. **Verify:** run the repo's build + tests (`npm run build`, `npm test` / `npm run lint` —
   check `package.json` scripts; backends use Mocha/NYC, portal uses its build + unit tests).
   A clean reinstall can surface a transitive break the old lockfile was masking — that's the point.
5. Commit `package.json` + the regenerated `package-lock.json` together
   (`chore(deps): bump <pkg> to <version>`). Do NOT commit `node_modules` or `.npmrc`.

### 3. PRs
After all repos build+test green, open a PR per repo (`gh pr create`), cross-linking them so they
merge together (shared-schema changes are only safe when every consumer ships the same version).
**Ask before opening PRs** — don't auto-PR.

## Ordering & safety
- **Producer first:** if you're also publishing a new version of the shared package, publish it to
  GitHub Packages BEFORE bumping consumers (else `npm install` can't find the version).
- **Additive vs breaking:** purely additive `strict:false` schema changes are safe to skew (a consumer
  on an older pin just won't write the new fields). A breaking change (new `required`/`enum`, removed
  export, renamed field) must land in ALL consumers together — don't leave skew.
- **Lockfile integrity:** always delete BOTH `node_modules` and `package-lock.json` so npm fully
  re-resolves; a stale lockfile can pin an old transitive version and hide the real upgrade.
- Never `--force` / `--legacy-peer-deps` to paper over a peer-dependency conflict — investigate it.
- This is a mutating workflow (writes branches/PRs). Confirm scope with the user before the first push.
