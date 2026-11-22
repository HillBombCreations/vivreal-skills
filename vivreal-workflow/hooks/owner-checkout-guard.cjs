'use strict';
// PreToolUse on Bash and PowerShell (F641, lesson L-C-01): a subagent never runs a command in an
// owner's own checkout under the clone root. Three agents ran git in the owner's hq checkout on
// one day although each brief named a kept worktree, so the rule is enforced here, not only written.
//
// A command's folders, segment by segment (`&&`, `||`, `;`, `|`, `&`, a newline, a parenthesis):
//   - `cd <dir>`, `pushd`, `chdir`, `Set-Location`, `sl`, `Push-Location` move the folder the next
//     segments run in, and the folder moved to counts itself;
//   - a `git` segment counts its `-C <dir>` (applied in order), `--git-dir`, `--work-tree`, and a
//     `GIT_DIR=` or `GIT_WORK_TREE=` set before it, in place of the folder it runs in;
//   - `bash -c`, `bash -lc`, `sh -c`, `wsl.exe -e bash -lc`, `powershell -Command`, `cmd /c` and a
//     `$( ... )` are read the same way, starting from the folder they run in;
//   - a segment that only sets variables (`X=1`, `export X=1`, `$env:X = 1`) runs nothing;
//   - every other segment counts the folder it runs in: the last `cd` before it, else the hook
//     input's `cwd`.
// The command is REFUSED when any folder it counts is an owner checkout: a folder under the clone
// root whose first part is not `_wt` or `_ops` and holds `.git`. Checking every segment, not only
// the last, closes `git -C <owner> show; git -C <worktree> log`.
//
// ALLOWED: the main thread (the hook input carries `agent_id` only inside a subagent or an
// in-process teammate; Claude Code hooks reference, "Common input fields", pinned by recorded
// inputs in owner-checkout-guard.test.cjs, U-SK1); a folder under `_wt/` or `_ops/`; a folder
// outside the clone root or the root itself; a folder that is not a checkout.
//
// What it cannot see, and lets through: a folder named by a variable this command did not set
// (`cd "$X"` with X from elsewhere), a path the command builds at run time, a script that changes
// folder itself, and a file READ in an owner checkout from elsewhere (`cat <owner>/CLAUDE.md`),
// which runs nothing there. It fails open on its own errors and outside a Vivreal clone root: a
// broken guard is never a reason a command cannot run, and the definitions say the same rule.
const fs = require('fs');
const os = require('os');
const path = require('path');

const KEPT = new Set(['_wt', '_ops']);
const CD_WORDS = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'wsl', 'powershell', 'pwsh', 'cmd']);
const INNER_FLAGS = new Set(['-c', '-lc', '-ic', '-lic', '-command', '/c']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', '{', '}', '!', 'time', 'exec', 'command', 'builtin']);
const NEUTRAL = new Set(['export', 'set', 'unset', ':', 'true', 'local', 'declare', 'readonly']);
const ROOT_VAR = 'VIVREAL_REPOS';
const MAX_DEPTH = 4;

/** Split at separators outside quotes; keep `$( ... )` whole. `ps` keeps backslashes literal. */
function splitSegments(command, ps) {
  const segs = [];
  let cur = '';
  let quote = null;
  let depth = 0;
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];
    if (quote) {
      cur += c;
      if (c === '\\' && !ps && quote === '"' && next !== undefined) {
        cur += next;
        i++;
      } else if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    // A heredoc body is data, not commands: skip from the next line to its delimiter line.
    if (!ps && c === '<' && next === '<' && command[i + 2] !== '<') {
      const m = command.slice(i).match(/^<<(-?)\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/);
      const nl = command.indexOf('\n', i);
      if (m && nl >= 0) {
        cur += command.slice(i, nl);
        let at = nl + 1;
        while (at < command.length) {
          let end = command.indexOf('\n', at);
          if (end < 0) end = command.length;
          const line = command.slice(at, end).replace(/\r$/, '');
          at = end + 1;
          if ((m[1] ? line.trim() : line) === m[2]) break;
        }
        segs.push(cur);
        cur = '';
        i = at - 1;
        continue;
      }
    }
    if (c === '$' && next === '(') {
      depth++;
      cur += '$(';
      i++;
      continue;
    }
    if (depth > 0) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      cur += c;
      continue;
    }
    if (c === '\n' || c === ';' || c === '|' || c === '&' || c === '(' || c === ')') {
      segs.push(cur);
      cur = '';
      continue;
    }
    cur += c;
  }
  segs.push(cur);
  return segs.map((s) => s.trim()).filter(Boolean);
}

/** The `$( ... )` bodies in a segment, outermost first. */
function substitutions(seg) {
  const out = [];
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] !== '$' || seg[i + 1] !== '(') continue;
    let depth = 1;
    let j = i + 2;
    for (; j < seg.length && depth > 0; j++) {
      if (seg[j] === '(') depth++;
      else if (seg[j] === ')') depth--;
    }
    out.push(seg.slice(i + 2, j - 1));
    i = j - 1;
  }
  return out;
}

/** Words of one segment, quotes removed. A backslash escapes only a space or a quote in Bash. */
function words(seg, ps) {
  const out = [];
  let cur = '';
  let quote = null;
  let started = false;
  for (let i = 0; i < seg.length; i++) {
    const c = seg[i];
    const next = seg[i + 1];
    if (quote) {
      if (c === '\\' && !ps && quote === '"' && /["\\$`]/.test(next || '')) {
        cur += next;
        i++;
      } else if (c === quote) quote = null;
      else cur += c;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      started = true;
      continue;
    }
    if (c === '\\' && !ps && /[\s"']/.test(next || '')) {
      cur += next;
      started = true;
      i++;
      continue;
    }
    if (/\s/.test(c)) {
      if (started) out.push(cur);
      cur = '';
      started = false;
      continue;
    }
    cur += c;
    started = true;
  }
  if (started) out.push(cur);
  return out;
}

/**
 * A normalized absolute folder for `raw` seen from `base`, or null when it cannot be known.
 * Forward slashes; on Windows a Git Bash `/c/...` or WSL `/mnt/c/...` path becomes `c:/...`, and
 * every comparison is case-insensitive.
 */
function makeResolver({ root, platform, home, env }) {
  const win = platform === 'win32';
  const fold = (p) => (win || platform === 'darwin' ? p.toLowerCase() : p);
  const clean = (p) => {
    let s = String(p).replace(/\\/g, '/');
    if (win) {
      let m = s.match(/^\/mnt\/([a-z])(\/.*|$)/i) || s.match(/^\/([a-z])(\/.*|$)/i);
      if (m) s = `${m[1]}:${m[2] || '/'}`;
    }
    s = path.posix.normalize(s);
    if (s.length > 1 && s.endsWith('/') && !/^[a-z]:\/$/i.test(s)) s = s.slice(0, -1);
    return fold(s);
  };
  const isAbs = (s) => s.startsWith('/') || /^[a-z]:\//i.test(s);
  const rootN = root ? clean(root) : null;

  function expand(raw, vars) {
    let s = String(raw);
    if (s === '~' || s.startsWith('~/')) s = home + s.slice(1);
    let unknown = false;
    const lookup = (name) => {
      if (name === ROOT_VAR) return root;
      if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
      if (name === 'HOME' || name === 'USERPROFILE') return home;
      if (env && typeof env[name] === 'string' && name !== 'PWD' && name !== 'OLDPWD') return env[name];
      unknown = true;
      return '';
    };
    s = s
      .replace(/%([A-Za-z_][A-Za-z0-9_]*)%/g, (_, n) => lookup(n))
      .replace(/\$\{(?:env:)?([A-Za-z_][A-Za-z0-9_]*)\}/g, (_, n) => lookup(n))
      .replace(/\$(?:env:)?([A-Za-z_][A-Za-z0-9_]*)/g, (_, n) => lookup(n));
    if (/\$\(|`/.test(s)) unknown = true;
    return unknown ? null : s;
  }

  function resolve(base, raw, vars) {
    const s = expand(raw, vars);
    if (s === null || s === '') return null;
    const c = String(s).replace(/\\/g, '/');
    const abs = isAbs(clean(c)) ? c : base === null ? null : path.posix.join(base, c);
    return abs === null ? null : clean(abs);
  }

  return { clean, resolve, rootN };
}

/**
 * The decision for one tool call, from facts alone. `exists` is injected so the tests decide
 * which folders are checkouts.
 * @returns {{ refuse: boolean, folder?: string }}
 */
function decide({ command, cwd, agentId, toolName, root, platform = process.platform, home = os.homedir(), env = process.env, exists = fs.existsSync }) {
  if (typeof agentId !== 'string' || agentId === '') return { refuse: false };
  if (!root || typeof command !== 'string' || !command.trim()) return { refuse: false };
  const ps = toolName === 'PowerShell';
  const r = makeResolver({ root, platform, home, env });
  const rootN = r.rootN;

  const ownerCheckout = (folder) => {
    if (!folder || !rootN) return false;
    if (folder === rootN || !folder.startsWith(rootN + '/')) return false;
    const first = folder.slice(rootN.length + 1).split('/')[0];
    if (!first || KEPT.has(first)) return false;
    return exists(path.join(root, first, '.git'));
  };

  const counted = [];
  function scan(cmd, start, vars, depth) {
    if (depth > MAX_DEPTH) return;
    let cur = start;
    for (const seg of splitSegments(cmd, ps)) {
      for (const inner of substitutions(seg)) scan(inner, cur, vars, depth + 1);
      const flat = seg.replace(/\$\((?:[^()]|\([^()]*\))*\)/g, '$(x)');
      const psEnv = flat.match(/^\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
      if (psEnv) {
        const value = words(psEnv[2], ps)[0] || '';
        vars[psEnv[1]] = r.resolve(cur, value, vars) || value;
        continue;
      }
      let w = words(flat, ps);
      while (w.length && KEYWORDS.has(w[0].toLowerCase())) w = w.slice(1);
      const local = {};
      while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
        const eq = w[0].indexOf('=');
        local[w[0].slice(0, eq)] = w[0].slice(eq + 1);
        w = w.slice(1);
      }
      const name = w.length ? path.basename(w[0].replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '') : '';
      if (!w.length || NEUTRAL.has(name)) {
        // Assignments only: they set variables for later segments and run nothing.
        const sets = { ...local };
        for (const a of w.slice(1)) {
          const eq = a.indexOf('=');
          if (eq > 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(a.slice(0, eq))) sets[a.slice(0, eq)] = a.slice(eq + 1);
        }
        for (const [k, v] of Object.entries(sets)) vars[k] = r.resolve(cur, v, vars) || v;
        continue;
      }
      const scope = { ...vars };
      for (const [k, v] of Object.entries(local)) scope[k] = r.resolve(cur, v, vars) || v;
      const args = w.slice(1);

      if (CD_WORDS.has(name)) {
        let target;
        for (let i = 0; i < args.length && target === undefined; i++) {
          if (/^-(literal)?path$/i.test(args[i])) target = args[i + 1];
          else if (!/^(-[LPe@]|\/d)$/i.test(args[i])) target = args[i];
        }
        if (target === '-') cur = null;
        else if (target === undefined) cur = r.clean(home);
        else cur = r.resolve(cur, target, scope);
        counted.push(cur);
        continue;
      }
      if (name === 'popd' || name === 'pop-location') {
        cur = null;
        continue;
      }
      if (SHELLS.has(name)) {
        const k = args.findIndex((a) => INNER_FLAGS.has(a.toLowerCase()));
        if (k >= 0 && k + 1 < args.length) {
          scan(args.slice(k + 1).join(' '), cur, { ...scope }, depth + 1);
          continue;
        }
      }
      if (name === 'git') {
        const folders = [];
        let dashC = null;
        for (let i = 0; i < args.length; i++) {
          const a = args[i];
          if (a === '-C' && i + 1 < args.length) {
            dashC = r.resolve(dashC === null ? cur : dashC, args[++i], scope);
          } else if (a.startsWith('--git-dir=') || a.startsWith('--work-tree=')) {
            folders.push(r.resolve(cur, a.slice(a.indexOf('=') + 1), scope));
          } else if ((a === '--git-dir' || a === '--work-tree') && i + 1 < args.length) {
            folders.push(r.resolve(cur, args[++i], scope));
          } else if (!a.startsWith('-')) break;
        }
        for (const k of ['GIT_DIR', 'GIT_WORK_TREE']) {
          if (scope[k]) folders.push(r.resolve(cur, scope[k], scope));
        }
        if (dashC !== null) folders.push(dashC);
        if (!folders.length) folders.push(cur);
        counted.push(...folders);
        continue;
      }
      counted.push(cur);
    }
  }

  scan(command, r.clean(cwd || process.cwd()), {}, 0);
  const hit = counted.find((f) => ownerCheckout(f));
  return hit ? { refuse: true, folder: hit } : { refuse: false };
}

function reasonFor(folder) {
  return (
    `Refused by the vivreal-workflow owner-checkout guard (F641): this command would run in ${folder}, ` +
    `an owner's own checkout under VIVREAL_REPOS. A subagent works only in a worktree under ` +
    `$VIVREAL_REPOS/_wt/ or a folder under $VIVREAL_REPOS/_ops/: start the command with ` +
    `cd "$VIVREAL_REPOS/_wt/<your worktree>" && . For hq reads use the kept hq worktree ` +
    `(vivreal-workflow:shared-standards, Path resolution). Only the main thread works in an owner checkout.`
  );
}

function main() {
  const data = JSON.parse(fs.readFileSync(0, 'utf8') || '{}');
  const ti = data.tool_input || {};
  if (typeof data.agent_id !== 'string' || data.agent_id === '') return;
  for (const k of Object.keys(process.env)) if (/^GIT_/i.test(k)) delete process.env[k];
  const cwd = data.cwd || process.cwd();
  const { resolveReposRoot } = require('./repos-root.cjs');
  const { root } = resolveReposRoot({ env: process.env, starts: [cwd] });
  const d = decide({ command: ti.command, cwd, agentId: data.agent_id, toolName: data.tool_name, root });
  if (!d.refuse) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reasonFor(d.folder) },
    }),
  );
}

if (require.main === module) {
  try {
    main();
  } catch {
    /* fail open: a broken guard is never a reason a command cannot run */
  }
  process.exit(0);
}

module.exports = { decide, reasonFor, splitSegments, words };
