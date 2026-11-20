# WSL steps on a Windows machine

Lockfile changes, Linux test gates and packs compared with the registry run in WSL Ubuntu. Every
trap below cost a release step, a false result or a write in an owner's checkout. The machine side
(nvm's lines in `~/.profile`) is the WSL step of the vivreal-skills `SETUP.md`.

## One quoted login-shell command that changes folder first

- **Every WSL step is ONE quoted command that changes folder first.** A `wsl` call starts in the
  calling shell's folder, and the Bash tool can start a call in the session's folder, which is
  often an owner's checkout; in a subagent, and often in the main session, a `cd` in an earlier call
  does not carry over. So each step is one call that moves into its worktree, proves it, then
  runs:
  `wsl.exe -e bash -lc 'cd "<the worktree as a /mnt/<drive>/... path>" && pwd && <command>'`,
  and stop if `pwd` prints anything but that worktree. Twice in one release this was skipped: a probe
  rewrote an owner's root `package.json`, lockfile and `node_modules`, and read-only commands ran
  in an owner's checkout.
- **A WSL step is a login shell, `bash -lc`, never `bash -c`** (release B, 2026-11-17, found by the
  HA-B2 one-shot builder after several briefs used the plain form). Measured: `wsl.exe bash -c`
  loads no profile, so nvm never starts, `node` is not found, and `npm` resolves to the Windows npm
  under `/mnt/<drive>/Program Files`; `bash -lc` finds nvm's Linux copies, but only where nvm's two
  lines are in `~/.profile` (`SETUP.md`, the WSL step): a stock nvm install writes them to the end
  of `~/.bashrc`, below the line that returns early for a shell that is not interactive.
- **Prove Linux node in its own call, before any install or test:**
  `wsl.exe -e bash -lc 'cd "<the worktree>" && pwd && command -v node npm'` must print the worktree,
  then two paths, neither under `/mnt/`. Read what it prints: `command -v` exits 0 when only one
  of the names is found, so chaining on it guards nothing, and a Windows npm run from WSL installs
  Windows binaries into the tree. A path under `/mnt/`, or a missing line, means the machine lacks
  the SETUP step: stop and report it, never carry on with the Windows npm.

## `-e`, so the outer shell never sees your `$`

- **Without `-e`, `wsl.exe` hands its command line to a shell that expands every `$` first, quotes or
  not, in the folder the call started in, before your `cd` runs.** A variable set inside the command
  reads empty, and a command substitution runs in the calling folder. Release B hit this the day the
  first rule shipped: a coder put `$(...)` around two `git diff`s on a `wsl.exe bash -lc` line, and
  both ran in the owner's checkout (read only, so nothing was written).
- **`wsl.exe -e` runs `bash` directly, with no outer shell, so the `$` reaches the login shell intact**
  (definition review F476 (1), the root-cause fix for L-B-12). Measured 2026-11-18 from a worktree:
  `wsl.exe bash -lc 'cd /tmp && echo "$(pwd)"'` printed the worktree, and
  `wsl.exe -e bash -lc 'cd /tmp && echo "$(pwd)"'` printed `/tmp`. Every form in this file uses `-e`.
- **A long or many-line step still goes in a script file**, written with the Write tool (a heredoc
  decodes backslashes, see "Bash heredocs decode backslash escapes" in SKILL.md) and run as
  `wsl.exe -e bash -lc 'cd "<the worktree>" && pwd && bash "<the script as a /mnt/<drive>/... path>"'`;
  its own first line changes folder too. Without `-e`, a script file is the only safe home for a `$`.
- **`nohup <command> &` dies when `wsl.exe` returns.** Start a long-running process with
  `setsid -f <command> > <log> 2>&1`, which outlives the call.
- **`wsl.exe` inside a shell loop swallows the loop's input** (release B, L-B-42). In
  `while read x; do wsl.exe ...; done < list`, the first `wsl.exe` reads the rest of the list as its
  own input, so the loop runs once and exits 0. Give every `wsl.exe` in a loop `< /dev/null`.

## Node in WSL and paths on the Windows side (release B, L-B-42)

- **Node 22 in WSL can drop a slow IPv4 connect and fall back to IPv6, which WSL's network cannot
  reach.** Its address-family autoselection gives each connect attempt 250 ms; on a kit stage's
  media checks about 1 in 100 sources failed with `ETIMEDOUT` that way. Run such a step with
  `NODE_OPTIONS=--no-network-family-autoselection` (put it in the step's env file): it changes only
  how a socket connects, never what is sent, and with it 666 of 666 sources answered on two passes.
- **With path conversion off (`MSYS_NO_PATHCONV=1`), a Windows program gets your path exactly as
  written.** Git Bash's `/<drive>/...` form then reaches Windows git as a path on the current drive,
  so `git worktree add /<drive>/<clones>/_wt/<name>` lands in a doubled folder,
  `<drive>:/<drive>/<clones>/_wt/<name>`. While conversion is off, give Windows git the Windows form
  (the drive letter, a colon, then forward slashes), and read where it landed with
  `git worktree list` before you use it.

## Installs, tests and packs run on WSL's own disk, never on Windows instead

- **Installs and packs run on WSL's own disk**, a folder under `~`, never on a `/mnt/<drive>` folder
  Windows also uses: `npm ci` there replaces the Windows `node_modules` with Linux binaries, and
  `npm pack` there records every file as mode 0755, so the tarball never equals the registry's.
  Feed that folder a `git archive` of the head (made by Windows git) when nothing in WSL needs git.
- **When WSL git cannot read a Windows worktree, test in a WSL-native clone made from a bundle.** A
  worktree's `.git` is a file naming a Windows path (`gitdir: <drive>:/...`), which WSL git cannot
  follow: it answers `fatal: not a git repository: <worktree>/<drive>:/<repo>/.git/worktrees/<name>`
  (measured 2026-11-17). Any step that needs git in WSL (a hook, a red proof at the base commit, a
  `git diff`) then runs in a clone:
  1. From Git Bash, bundle the branch into a scratch folder outside every repo:
     `git -C "<the worktree>" bundle create "<scratch>/<name>.bundle" <branch>`.
  2. Clone it on WSL's own disk, one quoted call that changes folder first:
     `wsl.exe -e bash -lc 'cd ~ && pwd && git clone -b <branch> "<the bundle as a /mnt/<drive>/... path>" ~/<name>'`.
  3. Prove Linux node there (the call above, with `cd ~/<name>`), then install and test in the
     clone. Edit and commit only in the Windows worktree; after a change, bundle and clone again.
     Remove the clone when the step is done.
- **Never install on Windows in its place.** When a brief puts an install or a test in Linux, or
  says nothing installs on Windows, a WSL failure is a reason to make the clone above, never to run
  `npm ci` on Windows: release B's VR_Main_API coder did that the same day, "because WSL git cannot
  drive that worktree", and it was a slip even with the lockfile unchanged.
