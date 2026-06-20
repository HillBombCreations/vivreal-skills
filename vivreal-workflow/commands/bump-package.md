---
description: Bump a shared dependency across all Vivreal consumer repos (esp. private @hillbombcreations/* GitHub Packages) — discover consumers, detect skew, clean-reinstall (delete node_modules + package-lock), build/test, and open PRs.
argument-hint: <package> [target-version]  e.g. @hillbombcreations/schemas 1.18.0
---

You are running a cross-repo coordinated dependency bump. The user invoked `/bump-package` with: **$ARGUMENTS**

Follow the `vivreal-package-update` skill exactly. In short:

1. Read the skill `vivreal-package-update` (it carries the GitHub Packages auth rules + the clean-reinstall procedure).
2. **Discover + skew:** scan `${VIVREAL_REPOS}/*/package.json` for the package; report each repo's current pin and the skew.
   If no target version was given, propose the latest (check the package's repo CHANGELOG for breaking changes) and CONFIRM with the user.
3. **Per repo** (branch `chore/bump-<pkg>-<version>`): set the version, then
   `rm -rf node_modules package-lock.json && npm install` (re-auths via the repo's `.npmrc`; if 401/403, copy `.npmrc` from `Vivreal_Portal_Mobile`), then run build + tests. Commit `package.json` + regenerated `package-lock.json` (never `node_modules`/`.npmrc`).
4. **PRs:** only after every repo is green, and ASK before opening them. Cross-link the PRs so they merge together.

Safety: publish the producer version FIRST if you're also releasing it; breaking changes must land in ALL consumers together (no skew); always delete BOTH `node_modules` and `package-lock.json`; never `--force`/`--legacy-peer-deps` to mask a conflict. This is a mutating workflow — confirm scope before the first push.
