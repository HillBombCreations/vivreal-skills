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

Then ask the agent to clone the rest and check the machine. It runs, in Bash:

```bash
node "$VIVREAL_REPOS/vivreal-hq/packages/fleet-ops/onboarding/clone-all.js"
node "$VIVREAL_REPOS/vivreal-hq/packages/fleet-ops/onboarding/doctor.js" --repo portal
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
  the moment they run; `npm publish` alone gets the write token; build, test and every other command get none.
  The secret names are keys of the private names file below. The wrapper never prints a token or writes one to a
  file. Never `gh auth token`, which carries your whole GitHub access. In your own terminal, run npm commands
  through the agent. A token you set yourself is used for installs and publish only.
- **Private names** (secret and parameter prefixes, the database secret): keys of
  `${VIVREAL_REPOS}/vivreal-hq/.vivreal/private-names.json`, which the hq clone carries. Where a skill writes a
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
