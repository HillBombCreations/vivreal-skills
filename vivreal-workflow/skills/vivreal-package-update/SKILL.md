---
name: vivreal-package-update
description: 'Use to bump a shared dependency across ALL Vivreal repos that consume it, especially the private @hillbombcreations/* GitHub Packages (schemas, site-renderer, tier-quotas). Discovers consumers, detects version skew, bumps each repo, patches each consumer lockfile surgically (see the package-publisher agent), builds/tests, and opens PRs. Triggers on: bump package, update dependency across repos, upgrade @hillbombcreations/schemas, version skew, coordinated dependency update, update shared package everywhere, package-lock reinstall.'
---

# Vivreal Cross-Repo Package Update

Coordinated bump of a shared dependency across every consumer repo, with a **surgical lockfile
patch** per consumer (never a clean reinstall on Windows, see below) so the private
`@hillbombcreations/*` packages resolve to the exact target version. Built for the recurring
"bump `@hillbombcreations/schemas` everywhere" flow and to kill version skew (e.g. one repo
left on an old pin, VR_Main_API was stuck on an older pin while the others had moved on).

**Why a surgical patch and not `rm -rf node_modules package-lock.json && npm install`:** that
reinstall PRUNES Linux-only optional dependencies when run on Windows. One renderer bump took
the fleet's lockfile from 263 optional entries to 261, silently dropping packages Linux's deploy
target needed, and the lockfile then failed `npm ci` (`EUSAGE`), cascading into false test,
type-check, and build failures unrelated to the actual bump. The full surgical-patch procedure
(patch only the target package's `version`/`resolved`/`integrity`, verify the optional-dependency
count is unchanged, prove it with `npm ci`) lives in the **`package-publisher`** agent, this skill
follows that procedure rather than restating it.

## GitHub Packages auth (read this first)

`@hillbombcreations/*` are PRIVATE packages on GitHub's npm registry. Each repo has a `.npmrc`:
```
@hillbombcreations:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<GitHub PAT with read:packages>
```
- The token is **inlined in `.npmrc`** (a secret; `.npmrc` is gitignored, keep it that way).
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
  v=$(node -e "const p=require('$pj');const a={...p.dependencies...p.devDependencies};process.stdout.write(a['$PKG']||'')" 2>/dev/null)
  [ -n "$v" ] && echo "$(basename "$d"): $v"
done
```
Report which repos are on which version (the skew) and confirm the **target version** with the user.
Check the package's own repo (e.g. `Vivreal-Schemas`) git log/CHANGELOG for breaking changes between
the old and new versions before bumping.

### 2. Per consumer repo (one commit on its release PR)
For each consumer (every one of them, see Ordering & safety):
1. Work on the repo's open release PR branch for this release; if it has none, create one from
   `origin/main` (`git worktree add -b <branch> --no-track <path> origin/main`, then `git push -u origin <branch>`, never a detached tree).
2. Set the new version in `package.json` (use the same range style already present, usually `^x.y.z`).
3. **Patch the lockfile surgically (the key step, see the `package-publisher` agent for the full
   procedure):** never `rm -rf node_modules package-lock.json && npm install` on Windows, that
   reinstall prunes Linux-only optional dependencies out of the lockfile (see Ordering & safety
   below). Instead, change only the target package's `version`, `resolved`, and `integrity`
   fields in `package-lock.json`, pulled from `npm view <pkg>@<version> dist.tarball` /
   `dist.integrity`. Verify the optional-dependency count is identical before and after the
   patch, then run `npm ci` (never `npm install`) to prove the patched lockfile installs.
   If `npm ci` fails with 401/403 on `npm.pkg.github.com`, the `.npmrc` token is missing/stale,
   copy it from the portal (see auth section) and retry.
4. **Verify:** run the repo's build + tests (`npm run build`, `npm test` / `npm run lint`, check `package.json` scripts; backends use Mocha/NYC, portal uses its build + unit tests).
   An `npm ci`-verified install can surface a transitive break the old lockfile was masking, that's the point.
5. Commit `package.json` + the patched `package-lock.json` together
   (`chore(deps): bump <pkg> to <version>`). Do NOT commit `node_modules` or `.npmrc`.
6. **Actions access:** For a consumer new to this package, confirm the package's Manage Actions access (GitHub, Hill Bomb Creations org, Packages, the package, Package settings) lists the consumer repo with Read before its release PR deploys. Local installs and PR checks pass on a personal token, so only the deploy's `npm ci` would catch it, with a 403. Only an org owner can grant it (the page answers 404 signed out), so if it is missing or you cannot see it, list it as a release prerequisite for the owner.

### 3. PRs
Once a repo builds and tests green, push and open (or update) its release PR (`gh pr create` only
if it had none), cross-linking them so they merge together (shared-schema changes are only safe
when every consumer ships the same version). After a reviewer PASS on the publish, the owner's
standing approval covers this, so do not ask. **Every new commit on a PR needs a delta review**,
including a re-pin added after an earlier review passed.

## Ordering & safety

- **A green publish workflow is not a publish, and this fleet has proved it.** A step of the
  form `npm publish || echo "already published"` reports success for a bad token, a broken
  build and a registry outage alike. **Before bumping any consumer, confirm the version
  exists on the registry**: `npm view @hillbombcreations/<pkg> version`. Reading the
  workflow run is not evidence; reading the registry is.
- When you touch a package publish workflow, tolerate the duplicate-version case BY NAME and
  fail on everything else. See the `verification-discipline` skill.
- **Review before publish:** Publish only after a reviewer PASS on the package PR at the exact SHA being published. With no PASS, stop and request a review; asking the owner does not substitute for the review.
- **Producer first:** if you're also publishing a new version of the shared package, publish it to
  GitHub Packages BEFORE bumping consumers (else `npm install` can't find the version).
- **Re-pin every consumer (owner standing rule):** after a reviewed publish, every consumer moves in
  the same release, breaking or additive. A skew is reported, never chosen, and narrowing the re-pin
  needs an explicit owner instruction. Additive vs breaking (new `required`/`enum`, removed export,
  renamed field) still goes in the report; it does not change which consumers move.
- **Lockfile integrity:** patch the target package's lockfile entry surgically, never
  `rm -rf node_modules package-lock.json && npm install` on Windows and never
  `--package-lock-only` as a substitute (it produces a lockfile shape that breaks a later
  `npm ci`). A clean reinstall on Windows prunes Linux-only optional dependencies, one renderer
  bump took the fleet from 263 optional entries to 261 and broke `npm ci` (`EUSAGE`). See the
  `package-publisher` agent, which owns this procedure.
- Never `--force` / `--legacy-peer-deps` to paper over a peer-dependency conflict, investigate it.
- This is a mutating workflow (writes branches/PRs). Confirm scope with the user before the first push only where no standing approval covers the publish.
