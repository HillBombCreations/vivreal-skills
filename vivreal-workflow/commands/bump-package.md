---
description: Bump a shared dependency across all Vivreal consumer repos (esp. private @hillbombcreations/* GitHub Packages), discover consumers, detect skew, patch each consumer's lockfile surgically (see the package-publisher agent), build/test, and open PRs.
argument-hint: <package> [target-version]  e.g. @hillbombcreations/schemas <target-version>
---

You are running a cross-repo coordinated dependency bump. The user invoked `/bump-package` with: **$ARGUMENTS**

Follow the `vivreal-package-update` skill exactly. In short:

1. Read the skill `vivreal-package-update` (it carries the GitHub Packages auth rules + the lockfile-patch procedure).
2. **Discover + skew:** scan `${VIVREAL_REPOS}/*/package.json` for the package; report each repo's current pin and the skew.
   If no target version was given, propose the latest (check the package's repo CHANGELOG for breaking changes) and CONFIRM with the user.
3. **Per repo**, one commit on that repo's open release PR (create its branch from `origin/main` if it has none): set the version, then patch `package-lock.json` surgically for
   the target package only, following the `package-publisher` agent's procedure, never
   `rm -rf node_modules package-lock.json && npm install` on Windows (see Safety below). If `npm ci` reports 401/403
   against `npm.pkg.github.com`, the repo's `.npmrc` token is stale, copy it from `Vivreal_Portal_Mobile` and retry.
   Then run build + tests. Commit `package.json` + the patched `package-lock.json` (never `node_modules`/`.npmrc`).
4. **PRs:** push and open (or update) each repo's release PR once that repo is green, cross-linked so they merge together. After a reviewer PASS on the publish the owner's standing approval covers this, so do not ask. Every new commit on a PR needs a delta review.

Safety: publish the producer version FIRST if you're also releasing it; re-pin EVERY consumer in the same release, breaking or additive
(owner standing rule: a skew is reported, never chosen; narrowing needs an explicit owner instruction); never `--force`/`--legacy-peer-deps` to mask a conflict. **Never `rm -rf node_modules package-lock.json && npm
install` on Windows to move a pin**, it prunes Linux-only optional dependencies, one renderer bump took the fleet's
lockfile from 263 optional entries to 261 and broke `npm ci` (`EUSAGE`) on the next build. Patch the lockfile entry
surgically instead, see the `package-publisher` agent, which owns this procedure. This is a mutating workflow, confirm
scope before the first push wherever no standing approval covers the publish.
