'use strict';
// PreToolUse on Bash and PowerShell (F641, lesson L-C-01): a subagent never runs a command in an
// owner's own checkout under the clone root. Three agents ran git in the owner's hq checkout on
// one day although each brief named a kept worktree, so the rule is enforced here, not only written.
//
// A line continuation (a Bash backslash-newline, a PowerShell backtick-newline) is joined first; an
// escaped character outside quotes (a doubled backslash or backtick, an escaped quote) is taken
// literally, so it neither continues a line nor opens a quote; and the `&` of a redirection (`2>&1`,
// `&>`) is no separator. A command's folders, segment by segment
// (`&&`, `||`, `;`, `|`, `&`, a newline, a parenthesis):
//   - `cd <dir>`, `pushd`, `chdir`, `Set-Location`, `sl`, `Push-Location` move the folder the next
//     segments run in (`cd -- <dir>` too), and the folder moved to counts itself; a folder under the
//     root that does not exist (and that this command's one-off `worktree add` does not make) is
//     not moved to, since that `cd` fails; `popd` and `cd -` go back (a folder
//     stack; with nothing in this command to go back to, the folder stays), and a Bash subshell
//     `( ... )` restores the folder it started in when it closes; a `cd` sent to the background
//     (`&`) or run as a pipeline stage (`|`) runs in a subshell and moves nothing;
//   - the wrappers `timeout`, `nohup`, `env` (with `VAR=x` and `-C <dir>`), `nice`, `setsid` and
//     `wsl` (with `--cd <dir>`, `-e`, `-d`) are peeled off and the command they run is checked,
//     with a WSL `/mnt/<drive>/...` path read as the Windows path it names;
//   - a `git` segment counts its `-C <dir>` (applied in order), `--git-dir`, `--work-tree`, and a
//     `GIT_DIR=` or `GIT_WORK_TREE=` set before it, in place of the folder it runs in;
//   - `bash -c`, `bash -lc`, `sh -c`, `wsl.exe -e bash -lc`, `powershell -Command`, `cmd /c`, `eval`,
//     a `$( ... )` and, in Bash, a backtick substitution are read the same way, starting from the
//     folder they run in;
//   - a segment that only sets variables (`X=1`, `export X=1`, `$env:X = 1`) runs nothing;
//   - every other segment counts the folder it runs in: the last `cd` before it, else the hook
//     input's `cwd`.
// The command is REFUSED when any folder it counts is an owner checkout: a folder under the clone
// root, outside `_wt` and `_ops`, whose nearest `.git` above it is a DIRECTORY (a nearest `.git`
// that is a FILE is a linked worktree, an agent's own, and is allowed). Checking every segment, not only
// the last, closes `git -C <owner> show; git -C <worktree> log`.
//
// ALLOWED: the main thread (the hook input carries `agent_id` only inside a subagent or an
// in-process teammate; Claude Code hooks reference, "Common input fields", pinned by recorded
// inputs in owner-checkout-guard.test.cjs, U-SK1); a folder under `_wt/` or `_ops/`; a folder
// outside the clone root or the root itself; a folder that is not a checkout; a linked worktree;
// the one-off clone form, read strictly: no git option but `-C` and no `GIT_*` variable set in the
// command, then a `fetch` with only the listed options, a plain remote and no refspec writing
// anything but a remote-tracking ref, or a `worktree add` with only the listed options (never
// `-f`, `--force`, `-B`) of a path under `_wt/` or `_ops/`; it touches only the clone's shared
// .git and is how a worktree of a repo with none is made; and a data-bearing fleet's own tools,
// never git, in its data folders only (FLEET_DATA).
//
// What it cannot see, and lets through: a folder named by a variable this command did not set
// (`cd "$X"` with X from elsewhere), a path the command builds at run time, a script that changes
// folder itself, a program outside the wrapper list that runs another (`xargs`, `find -exec`,
// `sudo`, `env -S`), a folder a program takes as an option (`npm --prefix`, `make -C`), a script
// fed on stdin (`bash <<EOF`), a `GIT_*` variable exported a way it does not read (`typeset -x`),
// PowerShell `iex`, a `cd` in a pipeline or to a missing folder outside the root, a file a
// redirection writes, a file written through a path argument (`rm -rf <clone>/docs` from a
// worktree), and a file READ in an owner checkout from elsewhere (`cat <owner>/CLAUDE.md`), which
// runs nothing there. It
// fails open on its own errors and outside a Vivreal clone root: a broken guard is never a reason
// a command cannot run, and the definitions say the same rule.
const fs = require('fs');
const os = require('os');
const path = require('path');

const KEPT = new Set(['_wt', '_ops']);
const CD_WORDS = new Set(['cd', 'pushd', 'chdir', 'set-location', 'sl', 'push-location']);
const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'powershell', 'pwsh', 'cmd']);
const INNER_FLAGS = new Set(['-c', '-lc', '-ic', '-lic', '-command', '/c']);
const KEYWORDS = new Set(['if', 'then', 'else', 'elif', 'fi', 'do', 'done', 'while', 'until', 'for', '{', '}', '!', 'time', 'exec', 'command', 'builtin']);
// Programs that run another command: the guard checks the command they run (pass 1, guard-bypass).
const WRAPPERS = new Set(['timeout', 'nohup', 'env', 'nice', 'setsid', 'wsl']);
const NEUTRAL = new Set(['export', 'set', 'unset', ':', 'true', 'local', 'declare', 'readonly']);
const ROOT_VAR = 'VIVREAL_REPOS';
// Markers splitSegments emits for a subshell's `(` and `)`, so the folder is restored after it.
const OPEN = '\u0001(';
const CLOSE = '\u0001)';
// git options before the subcommand that take a value (any of them ends the one-off form).
const GIT_VALUE_OPTS = new Set(['-c', '--config-env', '--exec-path', '--namespace', '--super-prefix']);
// `git fetch` options the one-off form accepts; anything else ends it: `--upload-pack` (runs a
// command), `-u` and `--update-head-ok` (move the checked-out branch), `--refmap`,
// `--recurse-submodules`, `--prune-tags` or `-P` (delete the owner's local-only tags), `--depth`
// and its kin (make a full clone shallow) and `--filter` (marks the remote a promisor in the
// clone's config).
const FETCH_FLAGS = new Set([
  '--prune', '-p', '--tags', '-t', '--no-tags', '-n', '--all', '--quiet', '-q',
  '--verbose', '-v', '--dry-run', '--no-recurse-submodules', '--progress', '--no-progress',
  '--atomic', '--force', '-f', '--append', '-a', '--multiple', '--write-fetch-head', '--no-write-fetch-head',
  '--auto-gc', '--no-auto-gc', '--auto-maintenance', '--no-auto-maintenance',
]);
const FETCH_VALUE_OPT = /^--jobs(=|$)/;
// `git worktree add` options the one-off form accepts. `-f`, `--force` and `-B` (which resets an
// existing branch, the owner's included) end it. `--orphan` takes no value (`git worktree add -h`):
// read as a value option it would swallow a `-f` after it.
const WORKTREE_VALUE_OPTS = new Set(['-b', '--reason']);
const WORKTREE_FLAGS = new Set([
  '--detach', '-d', '--no-track', '--track', '--checkout', '--no-checkout', '--quiet', '-q', '--lock', '--orphan',
  '--guess-remote', '--no-guess-remote', '--relative-paths', '--no-relative-paths',
]);
// The owner-operated fleets whose working data exists only in one owner clone, untracked, so their
// agents cannot move to a worktree without a code change there. Each plugin's agents (agent_type
// `<plugin>:<agent>`) may run their own tools, never git, only in their data folders (paths below
// the clone root, lowercase): the lead store under `packages/leadgen` (`Data/`, not regenerable);
// the content capture session files and fixtures under `packages/content-studio`; the migrator's
// `captures/`, plus its own tools (`node commands/...`, `node scripts/...`, `node -e`,
// `npm run <script>`) at the clone root, where its `.env` sits, each optionally piped into a stdin
// filter and followed by an echo of `$?` (pass 2, E2). A `cd` within the clone runs nothing and
// is allowed (pass 1, fleet-breadth).
const HQ_LOW = 'vivreal' + '-hq';
// `say` is the sentence the refusal adds for that fleet's agents, so a refused agent learns where
// its tools do run instead of being sent to a worktree its data is not in.
const FLEET_DATA = Object.freeze({
  'vivreal-leadgen': { clone: HQ_LOW, dirs: [HQ_LOW + '/packages/leadgen'], say: 'packages/leadgen of the hq clone' },
  'vivreal-content': { clone: HQ_LOW, dirs: [HQ_LOW + '/packages/content-studio'], say: 'packages/content-studio of the hq clone' },
  'vivreal-site-migrator': {
    clone: 'vivreal_site_migrator',
    dirs: ['vivreal_site_migrator/captures'],
    rootTools: true,
    say:
      'captures/ of the Vivreal_Site_Migrator clone. At that clone\'s root it runs only node commands/..., node scripts/..., ' +
      'node -e and npm run <script>, with redirections (2>&1, > captures/<kit>/x.log), piped only into tail, head, grep, wc, sort or cat reading stdin, ' +
      'and an echo of $? after it (; echo "exit=$?"); anything else there needs a cd into captures/ or a worktree',
  },
});
const MAX_DEPTH = 4;
const MAX_FORKS = 8;

/** The length of a line end at `i` (`\n` or `\r\n`), else 0. */
function lineEndAt(s, i) {
  if (s[i] === '\n') return 1;
  if (s[i] === '\r' && s[i + 1] === '\n') return 2;
  return 0;
}

/**
 * Split at separators outside quotes; keep `$( ... )` whole. `ps` keeps backslashes literal.
 * Each segment carries `op`, the operator before it (`|`, `||`, `&`, `&&`, `;`, a newline, `(`,
 * `)`, or undefined for the first), so a pipeline stage can be told from a separate command.
 */
function splitOps(command, ps) {
  const segs = [];
  let cur = '';
  let quote = null;
  let depth = 0;
  let pending;
  const flush = (opAfter) => {
    const text = cur.trim();
    cur = '';
    if (text) {
      segs.push({ text, op: pending });
      pending = opAfter;
    } else if (opAfter !== '\n') pending = opAfter;
    // An empty line after `|`, `&&` or `||` continues that command, so the operator stays.
  };
  for (let i = 0; i < command.length; i++) {
    const c = command[i];
    const next = command[i + 1];
    if (quote) {
      // Bash removes a backslash-newline inside double quotes too (pass 2, E1).
      if (c === '\\' && !ps && quote === '"' && lineEndAt(command, i + 1)) {
        i += lineEndAt(command, i + 1);
        continue;
      }
      cur += c;
      if (c === '\\' && !ps && quote === '"' && next !== undefined) {
        cur += next;
        i++;
      } else if (c === quote) quote = null;
      continue;
    }
    // A line continuation joins the next line to this one before anything is split (pass 2, E1):
    // Bash removes a backslash-newline outright (so `cd /a\<newline>/b` is `cd /a/b`), and a
    // PowerShell backtick-newline reads as a space.
    if (!ps && c === '\\' && lineEndAt(command, i + 1)) {
      i += lineEndAt(command, i + 1);
      continue;
    }
    if (ps && c === '`' && lineEndAt(command, i + 1)) {
      i += lineEndAt(command, i + 1);
      cur += ' ';
      continue;
    }
    // Outside quotes the escape character takes the next character literally (F654, pass 3): an
    // escaped backslash or backtick before a line end is no continuation, so the next line is a
    // command of its own, and an escaped quote opens no quote. Both characters stay in the text.
    if (((!ps && c === '\\') || (ps && c === '`')) && next !== undefined) {
      cur += c + next;
      i++;
      continue;
    }
    if (c === "'" || c === '"') {
      quote = c;
      cur += c;
      continue;
    }
    // A Bash backtick substitution stays whole, like `$( ... )`; substitutions() reads its body.
    // In PowerShell a backtick is the escape character, so it is left alone there.
    if (c === '`' && !ps) {
      const end = command.indexOf('`', i + 1);
      if (end > i) {
        cur += command.slice(i, end + 1);
        i = end;
        continue;
      }
    }
    // A comment runs nothing: skip to the end of the line.
    if (c === '#' && (cur === '' || /\s$/.test(cur))) {
      const nl = command.indexOf('\n', i);
      i = (nl < 0 ? command.length : nl) - 1;
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
        flush('\n');
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
      // The `&` of a redirection (`2>&1`, `>&2`, `<&3`, `&>`, `&>>`) is part of it, not a
      // separator (pass 2, E2): split there and `1` would read as a program.
      if (c === '&' && (command[i - 1] === '>' || command[i - 1] === '<' || next === '>')) {
        cur += c;
        continue;
      }
      // A subshell's parentheses become markers, so the folder it moved to is restored after it.
      // The `(` marker carries the operator before the group (`cd x && ( ... )`).
      if (c === '(') {
        if (cur.trim()) flush('(');
        cur = '';
        segs.push({ text: OPEN, op: pending });
        pending = '(';
        continue;
      }
      if (c === ')') {
        flush(')');
        segs.push({ text: CLOSE, op: ')' });
        continue;
      }
      let op = c;
      if ((c === '|' || c === '&') && next === c) {
        op = c + c;
        i++;
      } else if (c === '|' && next === '&') i++; // `|&` pipes stderr too: still a pipe
      flush(op);
      continue;
    }
    cur += c;
  }
  flush(undefined);
  return segs;
}

/** The segments alone (see splitOps). */
function splitSegments(command, ps) {
  return splitOps(command, ps).map((s) => s.text);
}

/** The `$( ... )` bodies in a segment, outermost first, and in Bash the backtick bodies too. */
function substitutions(seg, ps) {
  const out = [];
  for (let i = 0; i < seg.length; i++) {
    if (seg[i] === '`' && !ps) {
      const end = seg.indexOf('`', i + 1);
      if (end < 0) break;
      out.push(seg.slice(i + 1, end));
      i = end;
      continue;
    }
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
 * The decision for one tool call, from facts alone. `kindOf(p)` ('file', 'dir' or null) is
 * injected so the tests decide which folders are checkouts and which are linked worktrees.
 * @returns {{ refuse: boolean, folder?: string }}
 */
function decide({ command, cwd, agentId, agentType, toolName, root, platform = process.platform, home = os.homedir(), env = process.env, kindOf = statKind, isDir = (p) => statKind(p) === 'dir' }) {
  if (typeof agentId !== 'string' || agentId === '') return { refuse: false };
  if (typeof root !== 'string' || !root || typeof command !== 'string' || !command.trim()) return { refuse: false };
  // Fields of another type never reach a string operation (a null-prototype object throws there,
  // and a throw would fail open): a missing or odd cwd is the hook's own folder, as in main().
  if (typeof cwd !== 'string' || !cwd) cwd = process.cwd();
  if (typeof home !== 'string' || !home) home = os.homedir();
  const ps = toolName === 'PowerShell';
  const r = makeResolver({ root, platform, home, env });
  const rootN = r.rootN;
  const relOf = (folder) => (folder && rootN && folder.startsWith(rootN + '/') ? folder.slice(rootN.length + 1) : null);

  // An owner checkout: under the root, outside _wt/ and _ops/, and the nearest `.git` above the
  // folder is a DIRECTORY (the clone itself). A nearest `.git` that is a FILE is a linked worktree
  // (`<clone>/.claude/worktrees/<name>`, a sibling-named worktree), which is an agent's, not the
  // owner's; no `.git` at all is not a checkout.
  const ownerCheckout = (folder) => {
    const rel = relOf(folder);
    if (!rel) return false;
    const parts = rel.split('/');
    if (!parts[0] || KEPT.has(parts[0])) return false;
    for (let n = parts.length; n >= 1; n--) {
      const kind = kindOf(path.join(root, ...parts.slice(0, n), '.git'));
      if (kind === 'file') return false;
      if (kind === 'dir') return true;
    }
    return false;
  };

  const underKept = (folder) => {
    const rel = relOf(folder);
    if (!rel) return false;
    const parts = rel.split('/');
    return KEPT.has(parts[0]) && parts.length > 1 && parts[1] !== '';
  };

  // The one-off clone form, read strictly (definition review pass 1, guard-one-off): no git option
  // but `-C`, then `fetch` with only listed options, a plain remote and refspecs that write only
  // remote-tracking refs (never a branch, and never a tag, which `--prune` could then delete), or
  // `worktree add` with only listed options and a path under _wt/ or _ops/.
  function fetchIsOneOff(args) {
    const positional = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (FETCH_FLAGS.has(a)) continue;
      const v = a.match(FETCH_VALUE_OPT);
      if (v) {
        // A value that looks like an option is not a value this form accepts.
        if (!a.includes('=') && String(args[++i] || '').startsWith('-')) return false;
        continue;
      }
      if (a.startsWith('-')) return false;
      positional.push(a);
    }
    const refspecs = positional.slice(1);
    // A remote helper (`ext::<command>`) runs a command, wherever it sits (`--multiple` takes several remotes).
    if (positional.some((p) => p.includes('::'))) return false;
    // `tag <name>` is `refs/tags/<name>:refs/tags/<name>`, a tag write (pass 2 note).
    if (refspecs.includes('tag')) return false;
    return refspecs.every((spec) => {
      if (!spec.includes(':')) return true;
      const dst = spec.slice(spec.lastIndexOf(':') + 1);
      return dst === '' || (dst.startsWith('refs/remotes/') && !dst.includes('..'));
    });
  }
  function worktreeAddIsOneOff(args, clone, scope) {
    // git reads options after the path too (`worktree add <path> -B main`), so every argument is
    // read, not only those before the path.
    const positional = [];
    for (let i = 0; i < args.length; i++) {
      const a = args[i];
      if (a === '--') {
        positional.push(...args.slice(i + 1));
        break;
      }
      if (WORKTREE_VALUE_OPTS.has(a)) {
        // A value that looks like an option (`--reason -B`) is not a value this form accepts.
        if (String(args[++i] || '').startsWith('-')) return null;
        continue;
      }
      if (WORKTREE_FLAGS.has(a)) continue;
      if (a.startsWith('-')) return null;
      positional.push(a);
    }
    // <path> [<commit-ish>]; the folder it makes, or null when this is not the one-off form.
    if (positional.length < 1 || positional.length > 2) return null;
    const made = r.resolve(clone, positional[0], scope);
    return underKept(made) ? made : null;
  }

  // A data-bearing fleet runs its own tools (never git) only in its data folders (FLEET_DATA).
  // An own-key lookup: a plugin named like an object key (`constructor`) is no fleet.
  const plugin = typeof agentType === 'string' && /^[a-z0-9-]+:[^:]+$/i.test(agentType) ? agentType.split(':')[0] : '';
  const fleet = Object.prototype.hasOwnProperty.call(FLEET_DATA, plugin) ? FLEET_DATA[plugin] : undefined;
  const fleetAllows = (c) => {
    if (!fleet || c.git) return false;
    const rel = relOf(c.folder);
    if (!rel) return false;
    const low = rel.toLowerCase();
    if (fleet.dirs.some((d) => low === d || low.startsWith(d + '/'))) return true;
    if (c.prog === 'cd' && low.split('/')[0] === fleet.clone) return true;
    if (fleet.rootTools && low === fleet.clone) {
      return rootToolAllowed(c.prog, c.args) || (c.op === '|' && stdinFilter(c.prog, c.args)) || (STATUS_OPS.has(c.op) && statusEcho(c.prog, c.args));
    }
    return false;
  };

  const counted = [];
  // Folders the one-off `worktree add` in this command makes: a later `cd` into one is followed
  // although it does not exist yet when the hook runs.
  const created = new Set();
  // A `cd` to a missing folder forks the reading in two (see the cd branch); this caps the forks.
  let forks = 0;
  function scan(cmd, start, vars, depth) {
    if (depth > MAX_DEPTH) return;
    walk(splitOps(cmd, ps), 0, { cur: start, prev: undefined, dirStack: [], shellStack: [] }, vars, depth, false);
  }
  // Reads `segs` from index `from` in folder state `st`. `failing`: the `cd` just before failed, so
  // the commands joined to it by `&&` or a pipe never run, and the rest run where it left off.
  function walk(segs, from, st, vars, depth, failing) {
    let cur = st.cur;
    // The folder before the last `cd`; undefined until this command has changed folder once.
    let prev = st.prev;
    let dirStack = st.dirStack.slice();
    const shellStack = st.shellStack.map((s) => ({ ...s, dirStack: s.dirStack.slice() }));
    // While the failed `cd`'s chain is skipped, a `{ ...; }` or `( ... )` group in it is skipped whole.
    let skipDepth = 0;
    const opensGroup = (s) => s === OPEN || /^\{(\s|$)/.test(s);
    const closesGroup = (s) => s === CLOSE || /^\}/.test(s);
    for (let at = from; at < segs.length; at++) {
      const { text: seg, op } = segs[at];
      if (failing) {
        if (skipDepth > 0) {
          if (opensGroup(seg)) skipDepth++;
          else if (closesGroup(seg)) skipDepth--;
          continue;
        }
        if (op === '&&' || op === '|') {
          if (opensGroup(seg)) skipDepth = 1;
          continue;
        }
        failing = false;
      }
      // A Bash subshell gets its own folder, `cd -` target and folder stack, and none of them
      // outlive it. A PowerShell `( ... )` only groups, so a Set-Location inside it stays.
      if (seg === OPEN) {
        if (!ps) shellStack.push({ cur, prev, dirStack: dirStack.slice() });
        continue;
      }
      if (seg === CLOSE) {
        if (!ps && shellStack.length) ({ cur, prev, dirStack } = shellStack.pop());
        continue;
      }
      for (const inner of substitutions(seg, ps)) scan(inner, cur, vars, depth + 1);
      let flat = seg.replace(/\$\((?:[^()]|\([^()]*\))*\)/g, '$(x)');
      if (!ps) flat = flat.replace(/`[^`]*`/g, '`x`');
      const psEnv = flat.match(/^\$env:([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/i);
      if (psEnv) {
        const value = words(psEnv[2], ps)[0] || '';
        vars[psEnv[1]] = r.resolve(cur, value, vars) || value;
        continue;
      }
      let w = words(flat, ps);
      const local = {};
      let segCur = cur;
      let wrapped = false;
      const progOf = () => (w.length ? path.basename(w[0].replace(/\\/g, '/')).toLowerCase().replace(/\.exe$/, '') : '');
      // Keywords, leading assignments and wrappers (WRAPPERS): each is peeled off, and the command
      // it runs is the one checked.
      for (let guard = 0; guard < 16; guard++) {
        while (w.length && KEYWORDS.has(w[0].toLowerCase())) w = w.slice(1);
        while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) {
          const eq = w[0].indexOf('=');
          local[w[0].slice(0, eq)] = w[0].slice(eq + 1);
          w = w.slice(1);
        }
        const p = progOf();
        if (!WRAPPERS.has(p)) break;
        wrapped = true;
        const rest = w.slice(1);
        let i = 0;
        if (p === 'timeout') {
          for (; i < rest.length && rest[i].startsWith('-'); i++) if (/^-[sk]$|^--(signal|kill-after)$/.test(rest[i])) i++;
          i++; // the duration
        } else if (p === 'setsid') {
          for (; i < rest.length && rest[i].startsWith('-'); i++);
        } else if (p === 'nice') {
          for (; i < rest.length && rest[i].startsWith('-'); i++) if (rest[i] === '-n' || rest[i] === '--adjustment') i++;
        } else if (p === 'env') {
          for (; i < rest.length && rest[i].startsWith('-'); i++) {
            const a = rest[i];
            if (a === '-u' || a === '--unset') i++;
            else if (a === '-C' || a === '--chdir') segCur = r.resolve(segCur, rest[++i], { ...vars, ...local });
            else if (a.startsWith('--chdir=')) segCur = r.resolve(segCur, a.slice(8), { ...vars, ...local });
          }
        } else if (p === 'wsl') {
          for (; i < rest.length; i++) {
            const a = rest[i];
            if (a === '--cd' && i + 1 < rest.length) segCur = r.resolve(segCur, rest[++i], { ...vars, ...local });
            else if (/^(-d|--distribution|-u|--user|--shell-type)$/.test(a)) i++;
            else if (a === '-e' || a === '--exec' || a === '--') {
              i++;
              break;
            } else if (a.startsWith('-')) continue;
            else break;
          }
        }
        w = rest.slice(i);
      }
      const name = progOf();
      if (!w.length || (NEUTRAL.has(name) && !wrapped)) {
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
      for (const [k, v] of Object.entries(local)) scope[k] = r.resolve(segCur, v, vars) || v;
      const args = w.slice(1);

      // A `cd` sent to the background (`cd <wt> & git status`) or run as a pipeline stage
      // (`cd <wt> | cat; git status`) runs in a subshell, so the folder stays where it was
      // (F654, pass 3). Its target still counts as a folder this command names.
      const nextOp = at + 1 < segs.length ? segs[at + 1].op : undefined;
      if (CD_WORDS.has(name) && !wrapped && (nextOp === '&' || nextOp === '|' || op === '|')) {
        const target = args.find((a) => a !== '--' && !/^(-[LPe@]|\/d|-(literal)?path)$/i.test(a));
        const to = target === undefined ? null : r.resolve(cur, target, scope);
        counted.push({ folder: to || cur, git: false, prog: 'cd', args });
        continue;
      }
      if (CD_WORDS.has(name) && !wrapped) {
        let target;
        // After `--` the next word is the folder, even one named `-` (pass 2 warning: `cd -- <clone>`).
        let literal = false;
        for (let i = 0; i < args.length && target === undefined && !literal; i++) {
          if (args[i] === '--') {
            literal = true;
            target = args[i + 1];
          } else if (/^-(literal)?path$/i.test(args[i])) target = args[i + 1];
          else if (!/^(-[LPe@]|\/d)$/i.test(args[i])) target = args[i];
        }
        const before = cur;
        const stackBefore = dirStack.slice();
        if (name === 'pushd' || name === 'push-location') dirStack.push(cur);
        // `cd -` before any `cd` in this command goes to an OLDPWD the guard cannot read: the
        // folder stays the one it knows, so the next segment is still checked.
        if (target === '-' && !literal) cur = prev === undefined ? cur : prev;
        else if (target === undefined) cur = r.clean(home);
        else {
          const to = r.resolve(cur, target, scope);
          cur = to;
          // A folder under the clone root that does not exist now (pass 2 warning: `cd <missing
          // worktree>; git status` in a clone): that `cd` fails unless something in this command
          // makes the folder first, so the rest is read both ways. Here, as written; and in a
          // second walk where the `cd` failed, its `&&` chain never ran and the rest runs in the
          // folder it left. A folder this command's one-off `worktree add` makes is not missing;
          // one outside the root (a WSL home) cannot always be read from here and is followed.
          const knowable = to !== null && rootN !== null && to.startsWith(rootN + '/');
          if (knowable && !created.has(to) && !isDir(to)) {
            if (forks < MAX_FORKS) {
              forks++;
              walk(segs, at + 1, { cur: before, prev, dirStack: stackBefore, shellStack }, vars, depth, true);
            } else {
              // Past the cap: the folder stays, and the target still counts as this cd's folder.
              counted.push({ folder: to, git: false, prog: 'cd', args });
              cur = before;
            }
          }
        }
        prev = before;
        counted.push({ folder: cur, git: false, prog: 'cd', args });
        continue;
      }
      if ((name === 'popd' || name === 'pop-location') && !wrapped) {
        // With an empty stack `popd` fails and the folder stays where it is.
        if (dirStack.length) {
          prev = cur;
          cur = dirStack.pop();
        }
        continue;
      }
      if (name === 'eval' && args.length) {
        scan(args.join(' '), segCur, { ...scope }, depth + 1);
        continue;
      }
      if (SHELLS.has(name)) {
        const k = args.findIndex((a) => INNER_FLAGS.has(a.toLowerCase()));
        if (k >= 0 && k + 1 < args.length) {
          scan(args.slice(k + 1).join(' '), segCur, { ...scope }, depth + 1);
          continue;
        }
      }
      if (name === 'git') {
        const folders = [];
        let dashC = null;
        let onlyC = true;
        let i = 0;
        for (; i < args.length; i++) {
          const a = args[i];
          if (a === '-C' && i + 1 < args.length) {
            dashC = r.resolve(dashC === null ? segCur : dashC, args[++i], scope);
          } else if (a.startsWith('--git-dir=') || a.startsWith('--work-tree=')) {
            onlyC = false;
            folders.push(r.resolve(segCur, a.slice(a.indexOf('=') + 1), scope));
          } else if ((a === '--git-dir' || a === '--work-tree') && i + 1 < args.length) {
            onlyC = false;
            folders.push(r.resolve(segCur, args[++i], scope));
          } else if (a.startsWith('-')) {
            onlyC = false;
            if (GIT_VALUE_OPTS.has(a)) i++;
          } else break;
        }
        for (const k of ['GIT_DIR', 'GIT_WORK_TREE']) {
          if (scope[k]) folders.push(r.resolve(segCur, scope[k], scope));
        }
        // The one-off clone form: `git -C <clone> fetch ...`, or `git -C <clone> worktree add` of a
        // worktree under _wt/ or _ops/. Both touch only the clone's shared .git (its remote refs,
        // its list of worktrees), never the owner's working tree, index or branches, and they are
        // how a worktree of a repo with none is made (F641).
        const [sub, ...more] = args.slice(i);
        let oneOff = false;
        // A `GIT_*` variable set anywhere in the command (before the git word, or exported in an
        // earlier segment) can name a program git runs (`GIT_SSH_COMMAND`), so it ends the form.
        if (onlyC && dashC !== null && !folders.length && !Object.keys(scope).some((k) => /^GIT_/i.test(k))) {
          if (sub === 'fetch') oneOff = fetchIsOneOff(more);
          else if (sub === 'worktree' && more[0] === 'add') {
            const made = worktreeAddIsOneOff(more.slice(1), dashC, scope);
            oneOff = typeof made === 'string';
            if (oneOff) created.add(made);
          }
        }
        if (dashC !== null) folders.push(dashC);
        if (!folders.length) folders.push(segCur);
        for (const folder of folders) counted.push({ folder, git: true, oneOff });
        continue;
      }
      counted.push({ folder: segCur, git: false, prog: name, args, op });
    }
  }

  scan(command, r.clean(cwd || process.cwd()), {}, 0);
  const hit = counted.find((c) => ownerCheckout(c.folder) && !c.oneOff && !fleetAllows(c));
  if (!hit) return { refuse: false };
  return fleet ? { refuse: true, folder: hit.folder, fleet: { plugin, say: fleet.say } } : { refuse: true, folder: hit.folder };
}

/** The migrator's own tools at its clone root: `node commands/...`, `node scripts/...`, `node -e`, `npm run <script>`. */
function rootToolAllowed(prog, args) {
  const a = args || [];
  if (prog === 'node') return /^(\.\/)?(commands|scripts)\//.test(a[0] || '') || a[0] === '-e' || a[0] === '--eval';
  if (prog === 'npm') return a[0] === 'run' && typeof a[1] === 'string' && !a[1].startsWith('-');
  return false;
}

// Stdin filters a migrator agent may pipe its own tool into at the clone root (pass 2, E2). Each
// reads stdin only (no file argument: grep takes one pattern, or none after `-e`) and writes only
// to stdout; an option outside its list, or a word holding `<` or `>` (a redirection), ends it.
const STDIN_FILTERS = Object.freeze({
  tail: { flags: /^-(\d+|[nc][+-]?\d+|[qvzfF]+)$|^--(lines|bytes)=[+-]?\d+$/, values: /^-[nc]$|^--(lines|bytes)$/, patterns: 0 },
  head: { flags: /^-(\d+|[nc]-?\d+|[qvz]+)$|^--(lines|bytes)=-?\d+$/, values: /^-[nc]$|^--(lines|bytes)$/, patterns: 0 },
  grep: {
    flags: /^-[ivwxcnoqsEFPaz]+$|^-[mABC]\d+$|^--(ignore-case|invert-match|word-regexp|line-regexp|count|line-number|only-matching|quiet|silent|extended-regexp|fixed-strings|perl-regexp|colou?r(=\w+)?)$/,
    values: /^-[mABCe]$|^--(max-count|after-context|before-context|context|regexp)$/,
    patterns: 1,
  },
  wc: { flags: /^-[lwcmL]+$|^--(lines|words|bytes|chars|max-line-length)$/, patterns: 0 },
  sort: { flags: /^-[bdfghiMnRruVsz]+$|^-[kt].+$/, values: /^-[kt]$/, patterns: 0 },
  cat: { flags: /^-[AbeEnstTuv]+$/, patterns: 0 },
});
function stdinFilter(prog, args) {
  const f = Object.prototype.hasOwnProperty.call(STDIN_FILTERS, prog) ? STDIN_FILTERS[prog] : undefined;
  const a = args || [];
  if (!f || a.some((w) => /[<>]/.test(w))) return false;
  let positional = 0;
  let patternGiven = false;
  for (let i = 0; i < a.length; i++) {
    const w = a[i];
    if (f.values && f.values.test(w)) {
      if (i + 1 >= a.length) return false;
      if (w === '-e' || w === '--regexp') patternGiven = true;
      i++;
    } else if (w.startsWith('-') && w !== '-') {
      if (!f.flags.test(w)) return false;
    } else if (w !== '-') positional++;
  }
  return positional <= (f.patterns && !patternGiven ? 1 : 0);
}

// An echo of the exit status after a separate command (`; echo "exit=$?"`, `echo $?` on its own
// line): plain words, at least one holding `$?`, and no redirection or substitution.
const STATUS_OPS = new Set([';', '\n', '&&', '||']);
function statusEcho(prog, args) {
  const a = args || [];
  return prog === 'echo' && a.some((w) => w.includes('$?')) && a.every((w) => /^[A-Za-z0-9_ =:.,-]*(\$\?[A-Za-z0-9_ =:.,-]*)*$/.test(w));
}

function statKind(p) {
  try {
    const st = fs.statSync(p);
    return st.isDirectory() ? 'dir' : st.isFile() ? 'file' : null;
  } catch {
    return null;
  }
}

function reasonFor(folder, fleet) {
  const own = fleet
    ? ` A ${fleet.plugin} agent also runs its own tools, never git, in ${fleet.say}: start the command with a cd into that folder.`
    : '';
  return (
    `Refused by the vivreal-workflow owner-checkout guard (F641): this command would run in ${folder}, ` +
    `an owner's own checkout under VIVREAL_REPOS. A subagent works only in a worktree under ` +
    `$VIVREAL_REPOS/_wt/ or a folder under $VIVREAL_REPOS/_ops/: start the command with ` +
    `cd "$VIVREAL_REPOS/_wt/<your worktree>" && . A repo with no worktree gets one with the one-off form ` +
    `git -C "$VIVREAL_REPOS/<repo>" fetch origin, then git -C "$VIVREAL_REPOS/<repo>" worktree add ` +
    `--detach "$VIVREAL_REPOS/_wt/<repo>-read" origin/<line>. For hq reads use the kept hq worktree ` +
    `(vivreal-workflow:shared-standards, Path resolution). Only the main thread works in an owner checkout.` +
    own
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
  const d = decide({ command: ti.command, cwd, agentId: data.agent_id, agentType: data.agent_type, toolName: data.tool_name, root });
  if (!d.refuse) return;
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reasonFor(d.folder, d.fleet) },
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

module.exports = { decide, reasonFor, splitSegments, splitOps, words };
