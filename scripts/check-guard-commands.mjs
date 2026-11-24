#!/usr/bin/env node
/**
 * check-guard-commands.mjs
 *
 * Definitions against the owner-checkout guard (F641, definition review pass 2, E3). Every
 * shell block a definition holds is a command the reader is told to run. This runs each one
 * through the guard's own decision (vivreal-workflow/hooks/owner-checkout-guard.cjs, `decide`)
 * as the reader's `agent_type`, from the folder that reader starts in, and fails on every block
 * the guard would refuse. A definition that tells an agent to run what the guard refuses sends
 * that agent into a refusal it cannot get past, which pass 2 found twelve times.
 *
 * What it reads, per file under a plugin (`parked/` and the evals corpus are not loaded and are
 * left out):
 *   - a fenced block whose info string is a shell (bash, sh, shell, zsh, console, powershell,
 *     ps1, pwsh), and an unlabelled fence whose first command line starts with a program
 *     (PROGRAM below), read as ONE command (a `cd` at its top carries to the lines below, and a
 *     backslash-newline joins lines, as the guard reads them). In a `console` block only the
 *     `$ ` prompt lines count. A PowerShell block is read as PowerShell.
 *   - an inline code span in the prose (single backticks, outside every fence) whose text starts
 *     with a program (PROGRAM below) AND names a folder itself (FOLDER_WORD below: a `cd`, a
 *     `pushd` or `Set-Location`, a `-C`, `--git-dir`, `--work-tree`, `GIT_DIR=`, or the root
 *     variable), read as one command (F654: seven of pass 2's twelve refused instructions were
 *     inline). A bare inline `git status` or `node commands/x.js` is left out: the prose around it
 *     sets where it runs, and read from the reader's start folder it would be refused for every
 *     data fleet whatever the definition says (84 such spans when measured). One starting with
 *     `Set-Location`, `Push-Location` or `$env:` is read as PowerShell.
 *   - who reads it: `<plugin>/agents/<name>.md` is agent `<plugin>:<name>`; a skill, a plugin
 *     `references/` file or a skill reference is read by a subagent of that plugin
 *     (`<plugin>:<skill or file>`); a command runs in the main thread, which the guard never
 *     refuses, so commands are counted and not checked.
 *   - where its commands run: the three data-bearing fleets at their clone root (vivreal-leadgen
 *     and vivreal-content at the hq clone, vivreal-site-migrator at the Vivreal_Site_Migrator
 *     clone), as their sessions do. Every other reader is modelled in its own worktree under
 *     `_wt/`. That is not where Claude Code starts it (a subagent starts in the main
 *     conversation's current working directory, which can be an owner clone): it is where its
 *     commands run, because shared-standards ("Every clone at the root is an owner's checkout") and
 *     the guard's own refusal tell it to begin each command with `cd <its worktree> &&` (F654).
 *     The fake clone root makes every top-level folder an owner clone, every folder exist, and no
 *     variable set but the root variable and the home folder.
 *
 * A block that is not a command for its reader (a refused example shown on purpose, output, a
 * line only the main thread runs) is marked on the line just above its fence, or for inline code,
 * on the line just above the line that holds it (the mark covers every span on that line):
 *   <!-- guard-check: skip, <the reason> -->
 * A mark with no reason fails, and every mark is counted in the report.
 *
 * Run:        node scripts/check-guard-commands.mjs
 * Self-test:  node scripts/check-guard-commands.mjs --self-test
 * The self-test plants a refused line (a poisoned control) and a clean one beside it, in each
 * reader shape, runs the same check over them in memory, and fails unless the poison is found
 * and the clean ones pass; it then plants a poisoned agent file in a temporary plugin tree (never
 * the real one, so a killed run leaves nothing behind), which the walk must find, and runs the real
 * walk, which must be clean. The cases also run as node tests (check-guard-commands.test.mjs).
 */

import { readFileSync, readdirSync, statSync, writeFileSync, rmSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { decide } = require(join(ROOT, 'vivreal-workflow', 'hooks', 'owner-checkout-guard.cjs'));
const norm = (p) => p.split(sep).join('/');

// A made-up drive, joined at run time, so no literal machine path sits in this file.
const DRIVE = 'Q' + ':';
const FAKE_ROOT = DRIVE + '/vr';
const HQ = 'vivreal' + '-hq';
const HOME_CLONE = Object.freeze({
  'vivreal-leadgen': HQ,
  'vivreal-content': HQ,
  'vivreal-site-migrator': 'Vivreal_Site_Migrator',
});
const WORKTREE = `${FAKE_ROOT}/_wt/agent-worktree`;
const SHELL_LANGS = new Set(['bash', 'sh', 'shell', 'zsh', 'console', 'powershell', 'ps1', 'pwsh']);
const PS_LANGS = new Set(['powershell', 'ps1', 'pwsh']);
const PROGRAM = /^(?:[A-Z_][A-Z0-9_]*=\S*\s+)*(node|npm|npx|git|cd|curl|bash|sh|python3?|py|ffmpeg|ffprobe|tsx|gh|aws|wsl|wsl\.exe|magick|rm|cp|mv|mkdir|ls|cat|grep|jq|sed|find|chrome\.exe|pwsh|powershell|timeout|test|echo|export|source|pushd|printenv|tail|head|wc|tar|docker|stripe|mongosh|blender|xargs|env|nohup|setsid|set-location|push-location)(\s|$)/i;
// An inline span is checked only when it chooses a folder itself (see the header).
const FOLDER_WORD = /(^|[\s;&|(])(cd|pushd|chdir|set-location|push-location)\s|(^|\s)-C\s|--git-dir|--work-tree|\bGIT_DIR=|\bGIT_WORK_TREE=|\$\{?VIVREAL_REPOS\}?|\$env:VIVREAL_REPOS/i;
const MARK = /^\s*<!--\s*guard-check:\s*skip\b(.*?)-->\s*$/;

/**
 * Every top-level folder under the fake root is an owner clone (a `.git` directory); a folder
 * under `<clone>/.claude/worktrees/` is a linked worktree (a `.git` file).
 */
function fakeKind(p) {
  const s = String(p).split('\\').join('/');
  if (!s.toLowerCase().startsWith(FAKE_ROOT.toLowerCase() + '/')) return null;
  const parts = s.slice(FAKE_ROOT.length + 1).split('/');
  if (parts[parts.length - 1] !== '.git') return null;
  if (parts.length === 2 && !/^_(wt|ops)$/i.test(parts[0])) return 'dir';
  if (parts.length === 5 && parts[1] === '.claude' && parts[2] === 'worktrees') return 'file';
  return null;
}

/** Who reads `rel` (a repo-relative path), or null when nothing loads it as a subagent. */
export function readerOf(rel) {
  const parts = rel.split('/');
  const plugin = parts[0];
  if (!/^vivreal-[a-z0-9-]+$/.test(plugin) || parts.includes('parked') || parts.includes('evals')) return null;
  if (parts[1] === 'commands') return { mainThread: true };
  let agent;
  if (parts[1] === 'agents' && parts.length === 3) agent = basename(parts[2], '.md');
  else if (parts[1] === 'skills') agent = parts[2];
  else if (parts[1] === 'references') agent = basename(parts[parts.length - 1], '.md');
  else return null;
  const home = Object.prototype.hasOwnProperty.call(HOME_CLONE, plugin) ? HOME_CLONE[plugin] : null;
  return { agentType: `${plugin}:${agent}`, cwd: home ? `${FAKE_ROOT}/${home}` : WORKTREE };
}

/** The shell blocks in `text`: { line, lang, command, mark } per block, `line` 1-based at the fence. */
export function shellBlocks(text) {
  const lines = text.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^(\s*)(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)/);
    if (!open) continue;
    const fence = open[2];
    const lang = (open[3] || '').toLowerCase();
    const body = [];
    let j = i + 1;
    // A fence with an info string inside a block opens a nested block (a `json` example inside a
    // `markdown` one, written with three backticks both times), and the next bare fence closes it.
    let nested = 0;
    for (; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t.startsWith(fence[0].repeat(fence.length))) {
        const info = t.replace(/^[`~]+/, '').trim();
        if (info) nested++;
        else if (nested) nested--;
        else break;
      }
      body.push(lines[j].slice(Math.min(open[1].length, lines[j].length - lines[j].trimStart().length)));
    }
    const markLine = i > 0 ? lines[i - 1].match(MARK) : null;
    const mark = markLine ? { reason: markLine[1].replace(/^\s*,\s*/, '').trim() } : null;
    let cmd = null;
    if (lang === 'console') {
      const prompts = body.filter((l) => /^\s*\$ /.test(l)).map((l) => l.replace(/^\s*\$ /, ''));
      if (prompts.length) cmd = prompts.join('\n');
    } else if (SHELL_LANGS.has(lang)) {
      cmd = body.join('\n');
    } else if (lang === '') {
      const first = body.find((l) => l.trim() && !l.trim().startsWith('#'));
      if (first && PROGRAM.test(first.trim())) cmd = body.join('\n');
    }
    if (cmd !== null && cmd.trim()) out.push({ line: i + 1, lang, command: cmd, mark });
    i = j;
  }
  return out;
}

/** The fenced line numbers (0-based) of `lines`, fences included, so inline spans skip them. */
function fencedLines(lines) {
  const fenced = new Set();
  for (let i = 0; i < lines.length; i++) {
    const open = lines[i].match(/^\s*(`{3,}|~{3,})/);
    if (!open) continue;
    const fence = open[1];
    let j = i + 1;
    let nested = 0;
    for (; j < lines.length; j++) {
      const t = lines[j].trim();
      if (t.startsWith(fence[0].repeat(fence.length))) {
        if (t.replace(/^[`~]+/, '').trim()) nested++;
        else if (nested) nested--;
        else break;
      }
    }
    for (let k = i; k <= j && k < lines.length; k++) fenced.add(k);
    i = j;
  }
  return fenced;
}

/**
 * The inline code spans in `text` that are commands: { line, lang, command, mark } per span,
 * outside every fence, single backticks only, the span's text starting with a program.
 */
export function inlineCommands(text) {
  const lines = text.split(/\r?\n/);
  const fenced = fencedLines(lines);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (fenced.has(i)) continue;
    const markLine = i > 0 ? lines[i - 1].match(MARK) : null;
    const mark = markLine ? { reason: markLine[1].replace(/^\s*,\s*/, '').trim() } : null;
    // A span is one backtick, text with no backtick, one backtick, not part of a longer run.
    for (const m of lines[i].matchAll(/(?<!`)`([^`]+)`(?!`)/g)) {
      const command = m[1].trim();
      if (!PROGRAM.test(command) || !FOLDER_WORD.test(command)) continue;
      const lang = /^(set-location|push-location|\$env:)/i.test(command) ? 'powershell' : '';
      out.push({ line: i + 1, lang, command, mark, inline: true });
    }
  }
  return out;
}

/** The guard's decision on one block, as `reader`. */
export function judge(block, reader) {
  return decide({
    command: block.command,
    cwd: reader.cwd,
    agentId: 'definition-check',
    agentType: reader.agentType,
    toolName: PS_LANGS.has(block.lang) ? 'PowerShell' : 'Bash',
    root: FAKE_ROOT,
    platform: 'win32',
    home: DRIVE + '/agent-home',
    env: {},
    kindOf: fakeKind,
    isDir: () => true,
  });
}

/** Findings for one file: refused blocks and marks with no reason. Counts go into `tally`. */
export function checkText(rel, text, tally) {
  const findings = [];
  const reader = readerOf(rel);
  if (!reader) return findings;
  for (const b of [...shellBlocks(text), ...inlineCommands(text)]) {
    if (reader.mainThread) {
      tally.mainThread++;
      continue;
    }
    if (b.mark) {
      tally.skipped++;
      if (!b.mark.reason) findings.push({ rel, line: b.line, msg: 'a guard-check skip mark with no reason' });
      continue;
    }
    tally.checked++;
    const d = judge(b, reader);
    if (d.refuse) {
      const first = b.command.split('\n').find((l) => l.trim() && !l.trim().startsWith('#')) || b.command;
      findings.push({ rel, line: b.line, msg: `${b.inline ? 'inline code ' : ''}refused for ${reader.agentType} starting in ${reader.cwd.slice(FAKE_ROOT.length + 1)}: runs in ${d.folder.slice(FAKE_ROOT.length + 1)}: ${first.trim().slice(0, 160)}` });
    }
  }
  return findings;
}

function walkMarkdown(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules' || name === '.agy') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMarkdown(p, out);
    else if (name.endsWith('.md')) out.push(p);
  }
  return out;
}

export function checkRepo(root = ROOT) {
  const tally = { files: 0, checked: 0, skipped: 0, mainThread: 0 };
  const findings = [];
  for (const plugin of readdirSync(root).filter((n) => /^vivreal-/.test(n) && statSync(join(root, n)).isDirectory())) {
    for (const p of walkMarkdown(join(root, plugin))) {
      const rel = norm(p.slice(root.length + 1));
      if (!readerOf(rel)) continue;
      tally.files++;
      findings.push(...checkText(rel, readFileSync(p, 'utf8'), tally));
    }
  }
  return { findings, tally };
}

function report({ findings, tally }) {
  console.log(`check-guard-commands: ${tally.files} definition files, ${tally.checked} shell blocks and inline commands run through the guard as their reader, ${tally.skipped} marked skip, ${tally.mainThread} in commands (main thread, never refused).`);
  for (const f of findings) console.log(`  ${f.rel}:${f.line}  ${f.msg}`);
  console.log(findings.length ? `FAIL: ${findings.length} block(s) the guard refuses for their own reader.` : 'PASS: the guard refuses no block for its own reader.');
}

const FENCE = '`'.repeat(3);
/** The self-test's cases, [what, rel, text, wantFindings]; also run by check-guard-commands.test.mjs. */
export function selfTestCases() {
  const fence = FENCE;
  return [
    // [what, rel, text, wantFindings]
    ['poison: a leadgen agent runs git at the hq root', 'vivreal-leadgen/agents/poison.md', `${fence}bash\ngit status\n${fence}\n`, 1],
    ['clean: the same agent in packages/leadgen', 'vivreal-leadgen/agents/poison.md', `${fence}bash\ncd packages/leadgen && node commands/x.js\n${fence}\n`, 0],
    ['poison: a content agent lists hq files from the root', 'vivreal-content/agents/poison.md', `${fence}bash\nls -t content/calendars/*.md | head -4\n${fence}\n`, 1],
    ['clean: the same read from packages/content-studio', 'vivreal-content/agents/poison.md', `${fence}bash\ncd packages/content-studio && ls -t ../../content/calendars/*.md | head -4\n${fence}\n`, 0],
    ['poison: a migrator agent runs a non-tool at its root', 'vivreal-site-migrator/agents/poison.md', `${fence}\nprintenv PLAYWRIGHT_MCP_OUTPUT_DIR\n${fence}\n`, 1],
    ['clean: the same in captures/', 'vivreal-site-migrator/agents/poison.md', `${fence}\ncd captures && printenv PLAYWRIGHT_MCP_OUTPUT_DIR\n${fence}\n`, 0],
    ['poison: a skill reads an owner clone', 'vivreal-workflow/skills/poison/SKILL.md', `${fence}bash\ngit -C "$VIVREAL_REPOS/VR_CMS_API" show origin/stable:x\n${fence}\n`, 1],
    ['clean: the same through the kept read worktree', 'vivreal-workflow/skills/poison/SKILL.md', `${fence}bash\ngit -C "$VIVREAL_REPOS/_wt/VR_CMS_API-read" show origin/stable:x\n${fence}\n`, 0],
    ['poison: a line continuation hides the clone', 'vivreal-principal/agents/poison.md', `${fence}sh\ngit \\\n  -C "$VIVREAL_REPOS/VR_CMS_API" log\n${fence}\n`, 1],
    ['poison: PowerShell Set-Location into a clone', 'vivreal-principal/agents/poison.md', `${fence}powershell\nSet-Location "$env:VIVREAL_REPOS/VR_CMS_API"; git status\n${fence}\n`, 1],
    ['poison: a console prompt line', 'vivreal-principal/agents/poison.md', `${fence}console\n$ cd "$VIVREAL_REPOS/VR_CMS_API" && npm test\nok\n${fence}\n`, 1],
    ['poison: a skip mark with no reason', 'vivreal-principal/agents/poison.md', `<!-- guard-check: skip -->\n${fence}bash\ngit -C "$VIVREAL_REPOS/VR_CMS_API" log\n${fence}\n`, 1],
    ['clean: a skip mark with a reason', 'vivreal-principal/agents/poison.md', `<!-- guard-check: skip, a refused example shown on purpose -->\n${fence}bash\ngit -C "$VIVREAL_REPOS/VR_CMS_API" log\n${fence}\n`, 0],
    ['clean: a command runs in the main thread', 'vivreal-workflow/commands/poison.md', `${fence}bash\ngit -C "$VIVREAL_REPOS/VR_CMS_API" log\n${fence}\n`, 0],
    ['clean: an unlabelled block that is not a command', 'vivreal-principal/agents/poison.md', `${fence}\nVR_CMS_API/\n  src/\n${fence}\n`, 0],
    ['clean: a parked definition is not loaded', 'vivreal-content/parked/agents/poison.md', `${fence}bash\ngit status\n${fence}\n`, 0],
    ['poison: inline code in prose reads an owner clone', 'vivreal-principal/agents/poison.md', 'First run `git -C "$VIVREAL_REPOS/VR_CMS_API" log -1` to read it.\n', 1],
    ['clean: the same inline read through a worktree', 'vivreal-principal/agents/poison.md', 'First run `git -C "$VIVREAL_REPOS/_wt/VR_CMS_API-read" log -1` to read it.\n', 0],
    ['poison: inline PowerShell Set-Location into a clone', 'vivreal-principal/agents/poison.md', 'Run `Set-Location "$env:VIVREAL_REPOS/VR_CMS_API"; git status` there.\n', 1],
    ['clean: inline code that is no command (a path)', 'vivreal-principal/agents/poison.md', 'The file `src/lib/x.ts` holds it.\n', 0],
    ['clean: an inline command that names no folder (the prose sets it)', 'vivreal-leadgen/agents/poison.md', 'Then run `git status` and `node commands/stats.js`.\n', 0],
    ['poison: an inline cd into a clone, for a data fleet too', 'vivreal-leadgen/agents/poison.md', 'Run `cd "$VIVREAL_REPOS/VR_CMS_API" && npm test`.\n', 1],
    ['clean: an inline refused example under a skip mark', 'vivreal-principal/agents/poison.md', '<!-- guard-check: skip, a refused example shown on purpose -->\nNever `git -C "$VIVREAL_REPOS/VR_CMS_API" log`.\n', 0],
    ['clean: a fenced line is not read again as inline code', 'vivreal-principal/agents/poison.md', `<!-- guard-check: skip, a refused example shown on purpose -->\n${fence}bash\necho \`git -C "$VIVREAL_REPOS/VR_CMS_API" log\`\n${fence}\n`, 0],
  ];
}

/** Plants a poisoned agent file in a temporary plugin tree and walks it: the findings there. */
export function plantedWalk() {
  const tmp = mkdtempSync(join(tmpdir(), 'guard-check-'));
  try {
    const dir = join(tmp, 'vivreal-leadgen', 'agents');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'zz-guard-check-poison.md'), `---\nname: zz-guard-check-poison\n---\n${FENCE}bash\ngit -C "$VIVREAL_REPOS/VR_CMS_API" status\n${FENCE}\n`);
    writeFileSync(join(dir, 'zz-guard-check-clean.md'), `---\nname: zz-guard-check-clean\n---\n${FENCE}bash\ncd packages/leadgen && node commands/x.js\n${FENCE}\n`);
    return checkRepo(tmp).findings;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function selfTest() {
  let bad = 0;
  for (const [what, rel, text, want] of selfTestCases()) {
    const tally = { files: 0, checked: 0, skipped: 0, mainThread: 0 };
    const got = checkText(rel, text, tally).length;
    const ok = got === want;
    if (!ok) bad++;
    console.log(`  ${ok ? 'GREEN' : 'RED  '}  ${what}: ${got} finding(s), want ${want}${ok ? ' (correct)' : ''}`);
  }
  // The walk, poisoned: a planted agent file in a temporary tree must be found by path, alone.
  const found = plantedWalk();
  const poisoned = found.filter((f) => f.rel === 'vivreal-leadgen/agents/zz-guard-check-poison.md');
  const ok = poisoned.length === 1 && found.length === 1;
  if (!ok) bad++;
  console.log(`  ${ok ? 'GREEN' : 'RED  '}  poison: a planted file in a temporary tree's walk: ${poisoned.length} finding(s) for it, ${found.length} in all, want 1 and 1${ok ? ' (correct)' : ''}`);
  const real = checkRepo();
  report(real);
  if (real.findings.length) bad++;
  console.log(bad ? `Self-test FAILED: ${bad} case(s) wrong.` : 'Self-test PASSED: the poison is found, the clean lines pass, and the real definitions are clean.');
  return bad ? 1 : 0;
}

if (process.argv[1] && norm(process.argv[1]).endsWith('scripts/check-guard-commands.mjs')) {
  if (process.argv.includes('--self-test')) process.exit(selfTest());
  const res = checkRepo();
  report(res);
  process.exit(res.findings.length ? 1 : 0);
}
