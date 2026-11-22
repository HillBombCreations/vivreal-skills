# Setting up a machine

For anyone working on Vivreal, on macOS, Linux or Windows. There is one step that is yours, signing in; everything
else is derived on the machine. This file holds no values, no tokens and no account ids.

## 1. Install the tools

Git, Node.js 22 LTS, the GitHub CLI (`gh`), the AWS CLI v2, `uv` (for `uvx`, used only where a project declares an
AWS documentation MCP) and Claude Code.

```bash
# Windows
winget install Git.Git OpenJS.NodeJS.LTS GitHub.cli Amazon.AWSCLI astral-sh.uv
# macOS
brew install git node@22 gh awscli uv
# Linux: git from your package manager; Node 22 (nvm or nodesource), gh (cli.github.com),
# the AWS CLI v2 (the AWS installer), then uv:
curl -LsSf https://astral.sh/uv/install.sh | sh
```

On Windows, keep Git's default `core.autocrlf=true` and run `git config --global core.longpaths true`.

### The WSL step (Windows only): Node inside WSL, found by a login shell

Lockfile changes, Linux test gates and packs compared with the registry run in WSL Ubuntu, so WSL needs
its own Node, and agents reach it with a login shell, `wsl.exe -e bash -lc '...'` (`-e`, so no outer
shell expands a `$` first). That shell reads the first of `~/.bash_profile`, `~/.bash_login` and
`~/.profile` that exists, and only that one; Ubuntu's `~/.profile`
then reads `~/.bashrc`, which returns at its top for a shell that is not interactive. A stock nvm
install writes its two lines to the end of `~/.bashrc`, below that return, so they never run and `npm`
resolves to the Windows npm under `/mnt/`. Inside a WSL terminal (open Ubuntu, not a `wsl.exe` command
line without `-e`, which expands `$` first):

1. Install nvm by its own README (github.com/nvm-sh/nvm), then `nvm install 22`.
2. Put nvm's two lines in the login file too, once:
   ```bash
   grep -q 'nvm.sh' ~/.profile || printf '%s\n' 'export NVM_DIR="$HOME/.nvm"' '[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"' >> ~/.profile
   ```
   Where `~/.bash_profile` or `~/.bash_login` exists, put them in that file instead.

Prove it from Git Bash on Windows. This must print your WSL home folder, then two paths, neither under
`/mnt/`; read both lines, because `command -v` exits 0 when only one of the names is found:

```bash
wsl.exe -e bash -lc 'cd ~ && pwd && command -v node npm'
```

How agents use WSL from there (one quoted command that changes folder first, any `$` in a script file,
installs on WSL's own disk): the `shared-standards` skill, `references/wsl.md`.

## 2. Sign in (the one step that is yours)

```bash
gh auth login -s read:packages,workflow
aws configure sso        # or `aws configure`, with your OWN identity as the default profile, region us-east-1
claude                   # Claude Code's own sign-in
```

Never a shared key, and never a token pasted into a chat. Publishing a package needs `write:packages` as well, and
only on the machine that publishes.

## 3. Clone hq and open it

```bash
gh repo clone HillBombCreations/vivreal-hq      # into any folder; that folder becomes the clone root
cd vivreal-hq && claude
```

Accept the trust prompt. hq's `.claude/settings.json` declares this marketplace and the plugins hq uses, so Claude
Code fetches them in the background; they are active from the second session on. Owner-operated plugins
(`vivreal-content`, `vivreal-leadgen`, `vivreal-site-migrator`) run production fleets on real accounts, so they are
enabled only in the repos that run that work.

Then ask the agent to clone the rest and check the machine. It first makes the kept hq worktree from
the hq clone the session opened in (the main thread is the one session that may run there; every
agent works in worktrees, `shared-standards` "Path resolution"), then runs the tools from it, in Bash:

```bash
git worktree add --detach ../_wt/hq-main origin/main
node "$VIVREAL_REPOS/_wt/hq-main/packages/fleet-ops/onboarding/clone-all.js"
node "$VIVREAL_REPOS/_wt/hq-main/packages/fleet-ops/onboarding/doctor.js" --repo portal
```

## What is derived, so you never set it

- **`VIVREAL_REPOS`**, the folder that holds every clone: derived from the checkout a session is opened in (the
  folder above the main checkout that holds `vivreal-hq`, worktrees included). The vivreal-workflow SessionStart
  hook exports it to every Bash command of the session, subagents included; hooks and the db-explorer MCP server
  derive it themselves. Setting `VIVREAL_REPOS` yourself is an optional override, never a step; a wrong value is
  refused with the reason, not replaced, so unset it rather than guess. The PowerShell tool
  does not receive it, so agents do repo work in Bash. See the `shared-standards` skill, "Path resolution".
- **`NODE_AUTH_TOKEN`** for the private `@hillbombcreations/*` packages: a read-only packages token from AWS. In an
  agent's Bash, install and read commands (`npm ci`, `install`, `update`, `view`, `outdated`, and `npx` naming
  `@hillbombcreations/`) fetch the one shared READ-ONLY token from AWS Secrets Manager with your own AWS sign-in at
  the moment they run; `npm publish` alone gets the write token, for the upload only (never its lifecycle scripts); build, test and every other command get none.
  The secret names are keys of the private names file below. The wrapper never prints a token or writes one to a
  file. Never `gh auth token`, which carries your whole GitHub access. In your own terminal, run npm commands
  through the agent. A token you set yourself is used for installs and publish only.
- **Private names** (secret and parameter prefixes, the database secret): keys of
  `${VIVREAL_REPOS}/_wt/hq-main/.vivreal/private-names.json`, which the hq clone carries. Where a skill writes a
  placeholder such as `<secret-prefix>/`, the value is that file's key of the same name.
- **`/db-query`** reads the database secret named by key `dbSecretId` of that file, through your default AWS
  profile. `VIVREAL_DB_SECRET_ID` is an optional override only. That database user can WRITE, so `/db-query` stays
  read-only by its own guards, not by its credential.
- **`.env.local` files** come from Secrets Manager through hq's `packages/fleet-ops/onboarding/fetch-env-local.js`,
  which the agent runs when a repo has `.env.example` and no `.env.local`. It prints names, never values, and lists
  the personal keys you fill yourself.

## Plugins outside hq

In a repo whose settings do not declare the marketplace yet, install by hand:

```bash
claude plugin marketplace add HillBombCreations/vivreal-skills
claude plugin install <name>@vivreal-skills --scope user
```

Sessions in a repo that declares no plugins get the hooks and skills only from a user-scope install,
so install the core set at user scope once per machine: `vivreal-principal`, `vivreal-workflow`,
`vivreal-knowledge`, `vivreal-infra`, `vivreal-agent-review`, `vivreal-db-explorer`,
`vivreal-sentry`, `vivreal-ops`, `vivreal-product`, `vivreal-cms`, `vivreal-fullstack` and
`vivreal-proxy-factory`. The vivreal-workflow hooks then print the owners' shared rules (hq
`docs/standards/live-values.md` and `INDEX.md` from hq `origin/main`) into every session and
subagent. A new owner's machine follows vivreal-hq `docs/ONBOARDING.md` from here.
