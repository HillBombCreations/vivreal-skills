#!/usr/bin/env node
/**
 * skill-drift.mjs, the stale-skill monitor (VS-10).
 *
 * For every source in scripts/skill-sources.json, ask GitHub what changed on the source's
 * ref since the commit the skill was last synced against, keep only the files under the
 * source's `paths`, and print one row per source:
 *
 *   skill | repo@ref | commits ahead | matching files | first 10 names
 *
 * It reads GitHub only (`gh api`), never a local clone: a parked checkout on another branch
 * is exactly the stale read this tool exists to replace.
 *
 * It asserts it parsed something. Exit 2 when any `gh api` call fails (a typo in a repo
 * name, a SHA GitHub does not have, no auth) or when the number of sources compared is not
 * the number of sources in the file. Exit 0 otherwise, whether or not anything drifted:
 * drift is a finding to report, not a failure of the tool.
 *
 * Run:   node scripts/skill-drift.mjs            the table
 *        node scripts/skill-drift.mjs --json     the same rows as JSON
 *        node scripts/skill-drift.mjs --file <path>   another sources file (the REFUSE control
 *                                                     runs against a scratch copy)
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ORG = 'HillBombCreations';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// GitHub lists at most 300 changed files for a whole comparison, on its first page only.
const COMPARE_FILE_CAP = 300;

function parseArgs(argv) {
  const args = { json: false, file: join(ROOT, 'scripts', 'skill-sources.json') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--file') args.file = argv[++i];
    else {
      console.error(`unknown argument: ${argv[i]}`);
      process.exit(2);
    }
  }
  if (!args.file) {
    console.error('--file needs a path');
    process.exit(2);
  }
  return args;
}

/** `paths` entries ending in `/` are directory prefixes; anything else is one exact file. */
export function matchesPaths(file, paths) {
  return paths.some((p) => (p.endsWith('/') ? file.startsWith(p) : file === p));
}

/** Every { skill, repo, ref, paths, synced } in the file, `sources: "none"` entries skipped. */
export function listSources(doc) {
  const out = [];
  for (const [skill, entry] of Object.entries(doc)) {
    if (entry.sources === 'none') continue;
    for (const s of entry.sources) out.push({ skill, ...s });
  }
  return out;
}

function compare(src) {
  // --paginate walks every page of commits; --jq runs per page, so each page is one line.
  const res = spawnSync(
    'gh',
    [
      'api',
      '--paginate',
      `repos/${ORG}/${src.repo}/compare/${src.synced}...${encodeURIComponent(src.ref)}`,
      '--jq',
      '{status: .status, ahead: .ahead_by, behind: .behind_by, files: [.files[]?.filename]}',
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  if (res.error || res.status !== 0) {
    return { error: (res.error && res.error.message) || res.stderr.trim() || `gh exited ${res.status}` };
  }
  const pages = res.stdout.split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
  if (pages.length === 0) return { error: 'gh api returned no page' };
  const files = [...new Set(pages.flatMap((p) => p.files))];
  return { status: pages[0].status, ahead: pages[0].ahead, behind: pages[0].behind, files };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let doc;
  try {
    doc = JSON.parse(readFileSync(args.file, 'utf8'));
  } catch (e) {
    console.error(`cannot read ${args.file}: ${e.message}`);
    process.exit(2);
  }
  const sources = listSources(doc);
  if (sources.length === 0) {
    console.error(`${args.file} lists no sources, so nothing was compared`);
    process.exit(2);
  }

  const rows = [];
  const errors = [];
  for (const src of sources) {
    const r = compare(src);
    if (r.error) {
      errors.push(`${src.skill} ${src.repo}@${src.ref}: ${r.error}`);
      continue;
    }
    const matching = r.files.filter((f) => matchesPaths(f, src.paths));
    rows.push({
      skill: src.skill,
      repo: src.repo,
      ref: src.ref,
      synced: src.synced,
      status: r.status,
      ahead: r.ahead,
      behind: r.behind,
      matching: matching.length,
      filesTruncated: r.files.length >= COMPARE_FILE_CAP,
      first: matching.slice(0, 10),
    });
  }

  if (args.json) {
    console.log(JSON.stringify({ compared: rows.length, inFile: sources.length, rows, errors }, null, 2));
  } else {
    const stale = rows.filter((r) => r.matching > 0);
    for (const r of rows) {
      const cap = r.filesTruncated ? ' (GitHub lists 300 files at most; there are more)' : '';
      const div = r.status === 'diverged' ? ` DIVERGED, ${r.behind} behind` : '';
      console.log(
        `${r.matching > 0 ? 'STALE' : 'ok   '} ${r.skill} | ${r.repo}@${r.ref} | ${r.ahead} ahead${div} | ` +
          `${r.matching} matching${cap}${r.first.length ? ' | ' + r.first.join(', ') : ''}`,
      );
    }
    console.log(`\n${rows.length} of ${sources.length} sources compared, ${stale.length} with matching changes.`);
    for (const e of errors) console.error(`ERROR ${e}`);
  }

  if (errors.length > 0 || rows.length !== sources.length) process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
