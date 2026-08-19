# Sync facts: release trains (2026-08-15, evening — supplements the morning sync)

> **Superseded in part (2026-08-19):** promote/backport semantics changed after this sheet was written — the Monday cron now auto-mints a PATCH for an untagged tip (refusing only when the line's last tag is yanked), and a new `backport.yml` in all five repos is the sanctioned incremental-release path (never `release-cut.yml`). The untagged-tip/hotfix claims below are historical; see the 2026-08-19 row in `docs/SYNC.md`.


Everything below shipped and was LIVE-VERIFIED today. Sources of truth: each repo's
`docs/RELEASE.md`, portal `docs/projects/{portal-release-train,backend-release-train}/`
(plans, cutover logs, drill records).

## The deploy-model change (the headline)

**"Merge to main = prod deploy" is DEAD in five repos.** Production deploys from the fixed
`stable` branch via a release train in: **Vivreal_Portal_Mobile, VR_Secure_API, VR_CMS_API,
VR_Main_API, VR_Client_API**. Merging `main` in those repos deploys NOTHING (portal: `main` is
an Amplify build canary with no traffic; backends: zero workflow runs fire). Still deploying
on push to `main` (unchanged): VR_Outreach_API, VR_Client_Auth, and everything else.

## The train (same shape in all five repos)

- Friday 5pm PST cron (`0 1 * * 6` UTC) — `release-cut.yml` cuts `release/vX.Y` from main,
  bumps package.json ON THE LINE ONLY, tags `vX.Y.0`. Portal cut also writes a served
  `public/release.json` marker (backends have no marker — the tag + deploy run identify what
  shipped). First cuts: portal v0.3.0 (now v0.3.1 live); all four backends v2.2.0.
- Monday promote crons are STAGGERED (backends before portal, matching Secure→CMS→portal
  ordering): Secure 15:00 UTC, CMS 15:15, Main 15:30, Client 15:45, portal 16:00
  (= 7:00–8:00am PST). `promote.yml` force-with-lease moves `stable` to the newest TAGGED cut;
  an untagged tip fails the cron loudly (hotfix tips ship only via human dispatch, which
  auto-bumps patch + tags). Yanked versions (`yanked-vX.Y.Z` tags) block cron re-deploys.
- Hotfix = commit/cherry-pick on `release/vX.Y`, push (the repo's husky gate runs), dispatch
  promote with `target=release/vX.Y` — one dispatch tags vX.Y.Z+1 and ships it.
- `rollback.yml` (dispatch-only) moves `stable` back to a prior `v*` tag + yanks.
- Deployed-version check: portal `curl https://vivreal.io/app/release.json`; backends
  `git ls-remote origin refs/heads/stable` + the tag + the deploy run log.
- All workflows authenticate as the `vivreal-deploy-site-app` GitHub App (id 3062345);
  every repo has `VIVREAL_GH_APP_ID`/`VIVREAL_GH_APP_PRIVATE_KEY` secrets; dry_run inputs
  everywhere; `stable` and tags must stay unprotected (force-with-lease is the mechanism).

## 🔑 Platform gotchas PROVEN in the live drills (the load-bearing knowledge)

1. **Amplify autobuild fires only for never-built commits** (portal drill): a rollback (or
   re-promote to an already-built commit) repoints `stable` but NO build fires — prod keeps
   serving the old build. Mandatory after portal rollback:
   `aws amplify start-job --app-id d2e6e3kdfrrxak --branch-name stable --job-type RELEASE`.
2. **GitHub Actions creates NO push run for a force-push that REWINDS a branch to an
   ancestor** (Client drill) — which is every backend rollback. Forward re-points (even of
   already-pushed commits) DO fire. Mandatory after backend rollback:
   `gh workflow run lambda_api.yml --ref stable`. Every rollback.yml's step summary and every
   RELEASE.md §4 states this.
3. Branch CREATION fires push triggers on unfiltered repos but not on path-filtered ones
   (Client's `paths-ignore` + no-diff); normal train pushes always carry the package.json bump
   so filters never block them.
4. The backend deploy re-scope was THREE `main`→`stable` edits per lambda_api.yml (trigger,
   `environment:` selector, and the Set Stage/Stack / Main's `$BRANCH_NAME` conditional that
   picks prod-vs-DEV stack) — missing the third deploys `VR-*-API-DEV` with prod creds while
   everything looks green. Positive proof = CFN `LastUpdatedTime` on the PROD stack.
5. Escape hatch (backends): reverting the re-scope commit on `main` self-heals — that very
   merge push production-deploys under the reverted config.
6. Portal prod path: CloudFront E39DUKXYGXCX8Q origin = `stable.d2e6e3kdfrrxak.amplifyapp.com`
   (swapped from `main.` — distro NOT CFN-managed).

## Corrections to make in the skills repo (map)

- `vivreal-workflow/skills/shared-standards/SKILL.md`: the Lambda quick-reference table's
  "Deploy Trigger" column (Secure/CMS/Main/Client → "release train: push to `stable`;
  see repo docs/RELEASE.md"; Outreach/Client_Auth/EventHandler unchanged); the repo table's
  per-repo purpose lines where they say deploys-on-main; ADD a short "Release trains
  (2026-08-15)" section carrying the model + the two platform gotchas + the stagger table +
  the hotfix/rollback one-liners. The morning's "Testing rules" additions stay untouched.
- `vivreal-experts/agents/{secure-api,cms-api,main-api,client-stack,portal}.md` +
  `vivreal-knowledge/skills/vivreal-{secure-api,cms-api,main-api,client-stack,portal}-knowledge/SKILL.md`:
  correct any "merge/push to main deploys prod" claim; add 1-3 gotcha lines: the train, the
  repo's promote time, the rollback manual-dispatch rule (backends) / start-job rule (portal),
  pointer to that repo's docs/RELEASE.md. Portal files also: release.json endpoint, stable
  branch + CloudFront fact, main = canary.
- Any other file asserting backend merge=deploy (grep the whole repo for it — e.g.
  `insight`-style prose inside knowledge files, `vivreal-fullstack` docs).
- Do NOT create a new agent/skill for deployments — the runbooks live in each repo's
  docs/RELEASE.md; the skills point at them (decision: extend existing, per user).
