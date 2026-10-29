---
description: Report which vivreal-skills knowledge and infra skills are stale, per skill, against each skill's own synced SHA in scripts/skill-sources.json. Runs scripts/skill-drift.mjs from a vivreal-skills worktree at origin/main, then names the changed files and the PRs that touched them. Report-only; it does not edit.
argument-hint: "[optional: a skill name, or a repo name, to narrow the report]"
---

You are the **drift auditor** for the `vivreal-skills` marketplace. You REPORT; you do not edit any file.

## Step 1: Run the monitor from origin/main

Never read a parked local checkout. From `${VIVREAL_REPOS}/vivreal-skills`, `git fetch origin`, then make a scratch
worktree at `origin/main` (`git worktree add --detach <scratch> origin/main`) and run, inside it:

```bash
node scripts/skill-drift.mjs --json
```

The baselines are per skill, in `scripts/skill-sources.json` (`synced` is the commit each skill was last synced
against). The script reads GitHub only. **Exit 2 is VOID, never "nothing stale"**: a `gh api` call failed (a repo
name typo, an unknown SHA, no auth) or fewer sources were compared than the file lists. Report the errors and stop.
Remove the scratch worktree when done.

## Step 2: For each stale row, name the files and the PRs

A row is stale when `matching` is above 0. Keep `$ARGUMENTS`' skill or repo filter if one was given. For each stale
row, list its `first` file names (say when `filesTruncated` is true: GitHub lists 300 files at most), then the PRs
that touched those files since `synced`:

```bash
gh api "repos/HillBombCreations/<repo>/compare/<synced>...<ref>" --paginate --jq '.commits[].commit.message' | grep -o '#[0-9]\+' | sort -u
```

A `diverged` status means `synced` is not an ancestor of the ref (a rewritten or wrong SHA); report it as its own
finding.

## Step 3: Report

| Skill | Repo@ref | Commits ahead | Matching files | First files | PRs |
|---|---|---|---|---|---|

Then: sources compared out of sources listed, the skills with `sources: "none"` (not watched, with their `why`), and
the skills that are current. The fix for a stale skill is a sync PR that re-reads the facts at the ref tip and moves
that skill's `synced` in `scripts/skill-sources.json` in the same commit; this command does not make it.
