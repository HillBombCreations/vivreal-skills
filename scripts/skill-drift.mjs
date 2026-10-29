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

// How far before the synced commit's date the commits fallback looks. A commit merged after
// the sync can carry an older committer date (a long-lived branch), and `since` filters on it.
const SINCE_SLACK_DAYS = 90;

/** One `gh api` call; stdout lines, or { error } with gh's own message. */
function ghApi(args) {
  const res = spawnSync('gh', ['api', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (res.error || res.status !== 0) {
    return { error: (res.error && res.error.message) || (res.stderr || '').trim() || `gh exited ${res.status}` };
  }
  return { lines: res.stdout.split('\n').map((l) => l.trim()).filter(Boolean) };
}

function compare(src) {
  // --paginate walks every page of commits; --jq runs per page, so each page is one line.
  // Files come on the first page only, capped at COMPARE_FILE_CAP; commits come on every page.
  const res = ghApi([
    '--paginate',
    `repos/${ORG}/${src.repo}/compare/${src.synced}...${encodeURIComponent(src.ref)}`,
    '--jq',
    '{status: .status, ahead: .ahead_by, behind: .behind_by, files: [.files[]?.filename], commits: [.commits[]?.sha]}',
  ]);
  if (res.error) return res;
  const pages = res.lines.map((l) => JSON.parse(l));
  if (pages.length === 0) return { error: 'gh api returned no page' };
  const files = [...new Set(pages.flatMap((p) => p.files))];
  const commits = [...new Set(pages.flatMap((p) => p.commits || []))];
  return { status: pages[0].status, ahead: pages[0].ahead, behind: pages[0].behind, files, commits };
}

/**
 * When the file list is truncated, the commits ahead of `synced` that touch any of `paths`,
 * from the path-scoped commits API intersected with the compare's own ahead set. Returns
 * { shas } or { error }; an error means the row cannot be called fresh.
 */
function aheadCommitsTouching(src, aheadShas) {
  const when = ghApi([`repos/${ORG}/${src.repo}/commits/${src.synced}`, '--jq', '.commit.committer.date']);
  if (when.error) return { error: `synced commit date: ${when.error}` };
  const date = Date.parse(when.lines[0]);
  if (Number.isNaN(date)) return { error: `synced commit date unreadable: ${when.lines[0]}` };
  const since = new Date(date - SINCE_SLACK_DAYS * 24 * 3600 * 1000).toISOString();
  const ahead = new Set(aheadShas);
  const hits = new Set();
  for (const p of src.paths) {
    const query =
      `sha=${encodeURIComponent(src.ref)}&path=${encodeURIComponent(p.replace(/\/$/, ''))}` +
      `&since=${encodeURIComponent(since)}&per_page=100`;
    const res = ghApi(['--paginate', `repos/${ORG}/${src.repo}/commits?${query}`, '--jq', '.[].sha']);
    if (res.error) return { error: `commits touching ${p}: ${res.error}` };
    for (const sha of res.lines) if (ahead.has(sha)) hits.add(sha);
  }
  return { shas: [...hits] };
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
    const row = {
      skill: src.skill,
      repo: src.repo,
      ref: src.ref,
      synced: src.synced,
      status: r.status,
      ahead: r.ahead,
      behind: r.behind,
      filesTruncated: r.files.length >= COMPARE_FILE_CAP,
      unit: 'files',
      unknown: null,
    };
    if (!row.filesTruncated) {
      const matching = r.files.filter((f) => matchesPaths(f, src.paths));
      row.matching = matching.length;
      row.first = matching.slice(0, 10);
    } else if (r.commits.length !== r.ahead) {
      // The fallback intersects with the compare's ahead set, so that set must be whole.
      row.unknown = `file list truncated at ${COMPARE_FILE_CAP} and the compare listed ${r.commits.length} of ${r.ahead} ahead commits`;
    } else {
      // The file list stops at COMPARE_FILE_CAP, so an empty match there proves nothing.
      const hit = aheadCommitsTouching(src, r.commits);
      if (hit.error) {
        row.unknown = `file list truncated at ${COMPARE_FILE_CAP} and the commits fallback failed: ${hit.error}`;
      } else {
        row.unit = 'commits';
        row.matching = hit.shas.length;
        row.first = hit.shas.slice(0, 10).map((s) => s.slice(0, 7));
      }
    }
    if (row.unknown) {
      row.matching = null;
      row.first = [];
    }
    rows.push(row);
  }

  const unknown = rows.filter((r) => r.unknown);
  if (args.json) {
    console.log(JSON.stringify({ compared: rows.length, inFile: sources.length, rows, errors }, null, 2));
  } else {
    const stale = rows.filter((r) => r.unknown || r.matching > 0);
    for (const r of rows) {
      const div = r.status === 'diverged' ? ` DIVERGED, ${r.behind} behind` : '';
      const head = `${r.skill} | ${r.repo}@${r.ref} | ${r.ahead} ahead${div} | `;
      if (r.unknown) {
        console.log(`UNKNOWN ${head}${r.unknown}`);
        continue;
      }
      const how = r.unit === 'commits' ? ` (file list truncated at ${COMPARE_FILE_CAP}; resolved by the commits API)` : '';
      const label = r.unit === 'commits' ? 'matching commits' : 'matching';
      console.log(
        `${r.matching > 0 ? 'STALE' : 'ok   '} ${head}${r.matching} ${label}${how}` +
          `${r.first.length ? ' | ' + r.first.join(', ') : ''}`,
      );
    }
    console.log(
      `\n${rows.length} of ${sources.length} sources compared, ${stale.length} with matching changes or unknown ` +
        `(${unknown.length} unknown).`,
    );
    for (const e of errors) console.error(`ERROR ${e}`);
  }

  // An UNKNOWN row is a source that could not be called fresh, so it fails the run like an error.
  if (errors.length > 0 || unknown.length > 0 || rows.length !== sources.length) process.exit(2);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
