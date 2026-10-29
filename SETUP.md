# Setting up a co-owner machine

This is for a Vivreal co-owner's own machine (Windows 11 is the reference; macOS and Linux work with the POSIX forms).
It holds no values, no tokens and no account ids. Every secret comes from AWS Secrets Manager through the onboarding
scripts in vivreal-hq, never from chat and never copied between machines.

## Tools

Git, Node.js 22 LTS, the GitHub CLI (`gh`), the AWS CLI v2, `uv` (for `uvx`), Claude Code, and the MongoDB MCP server:

```bash
winget install Git.Git OpenJS.NodeJS.LTS GitHub.cli Amazon.AWSCLI astral-sh.uv
npm i -g mongodb-mcp-server
```

Keep Git for Windows' default `core.autocrlf=true` and set `git config --global core.longpaths true`.

## Environment

- **`VIVREAL_REPOS`**: the folder that holds every Vivreal clone, with forward slashes. Set it as a user environment
  variable (`setx VIVREAL_REPOS <folder>`) AND in the `env` block of `~/.claude/settings.json`. Every agent resolves
  cross-repo paths through it (see the `shared-standards` skill, "Path resolution").
- **`NODE_AUTH_TOKEN`**: a GitHub token with `read:packages` only (add `write:packages` only on a machine that
  publishes), stored as a user environment variable. It lets `npm ci` install the private `@hillbombcreations/*`
  packages. Set it without echoing it, and never paste it into a chat.
- **`gh` scopes**: `gh auth login`, then `gh auth refresh -s read:packages,write:packages,workflow`.
- **AWS**: `aws configure` with your OWN identity as the `default` profile, region `us-east-1`. Never a shared key.

## Clone

Clone vivreal-hq first, then let it clone the rest:

```bash
gh repo clone HillBombCreations/vivreal-hq "$VIVREAL_REPOS/vivreal-hq"
node "$VIVREAL_REPOS/vivreal-hq/packages/fleet-ops/onboarding/clone-all.js"
```

## Secrets

`.env.local` files come from Secrets Manager through `fetch-env-local.js` in
`vivreal-hq/packages/fleet-ops/onboarding/`. It prints names, never values. Never put a secret in a chat, a commit or
a PR body.

## Plugins

```bash
claude plugin marketplace add HillBombCreations/vivreal-skills
claude plugin install <name>@vivreal-skills --scope user
```

Install `vivreal-principal`, `vivreal-workflow`, `vivreal-knowledge`, `vivreal-infra`, `vivreal-sentry`,
`vivreal-ops`, `vivreal-product`, `vivreal-fullstack`, `vivreal-proxy-factory`, `vivreal-db-explorer`,
`vivreal-growth-analytics`, `vivreal-cms` and `vivreal-agent-review`; and `context7`, `playwright`, `sentry` and
`frontend-design` from `claude-plugins-official`. Install the plugins before the first hq clone, so the infra
guard hooks are present from the start.

### Owner-operated plugins

`vivreal-content`, `vivreal-leadgen` and `vivreal-site-migrator` run production fleets on real accounts (social
channels, outreach, live sites). Install them only on a machine where you run that work.

## Doctor

```bash
node "$VIVREAL_REPOS/vivreal-hq/packages/fleet-ops/onboarding/doctor.js" --repo portal
```

Every line should PASS, including plugin versions equal to `origin/main`'s.

## MCPs

- `uvx` runs the AWS documentation MCP where a project declares it.
- `mongodb-mcp-server` reads `MDB_MCP_CONNECTION_STRING_RO` and `MDB_MCP_CONNECTION_STRING_RW`, set as user
  environment variables (by vivreal-hq's onboarding scripts, not by hand).
- `/db-query` reads the `vivreal/prod/main-api` secret through the `default` profile. That database user can WRITE,
  so `/db-query` stays read-only by its own guards, not by its credential.
