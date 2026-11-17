# Browser tool output stays outside every repo

The Playwright MCP (`mcp__plugin_playwright_playwright__*`) saves every file it names itself (page
snapshots, console logs, a screenshot taken with no file name) under `.playwright-mcp/` in its
workspace root, the folder the session started in, which is often an owner's checkout. It creates
that folder by itself whenever its output variable is unset (measured on `@playwright/mcp` 0.0.85).
Release A found and deleted a stray token copy there.

- **Point its output folder outside every repo.** The server reads `PLAYWRIGHT_MCP_OUTPUT_DIR` (its
  `--output-dir`) when it starts, from the environment Claude Code was started in, so it is set on the
  machine before the session (an absolute folder outside every clone and worktree, for example under
  the OS temp folder) and takes effect from the next session.
- **A file you name is not covered by it.** A screenshot or file saved with an explicit name is
  resolved against the workspace root, so give it an absolute path in the session scratchpad.
- **Never save a token, a cookie or a session state through the browser tool**, under any name.

## The check, for every agent that drives the browser tool

**Before the first browser call**, `printenv PLAYWRIGHT_MCP_OUTPUT_DIR` in Bash must print an
absolute folder outside every repository. If it prints nothing, the variable is unset: every
file-writing browser call names an absolute scratchpad path, and the report says the variable is
unset.

**After the run**, the session's folder must hold no `.playwright-mcp/`. Test for the folder itself.
`git status --porcelain` cannot show it, because vivreal-hq's `.gitignore` ignores `.playwright-mcp/`
and `--porcelain` never lists an ignored path, so that check passes with the folder present. Run the
control first, in the same shell, so a check that cannot fire is caught:

```bash
pw_check() { if test -e "$1/.playwright-mcp"; then echo "FOUND $1/.playwright-mcp"; return 1; else echo "clean $1"; fi; }
ctl=$(mktemp -d) && mkdir -p "$ctl/.playwright-mcp" && touch "$ctl/.playwright-mcp/x"
pw_check "$ctl" && echo "CONTROL DID NOT FIRE: stop"; rm -rf "$ctl"
pw_check "<the session's folder, absolute>"
```

The control must print `FOUND`; if it prints `CONTROL DID NOT FIRE`, the check proves nothing. When
the real check prints `FOUND`, move what is there to your scratchpad (it can hold a session's
console logs and screenshots), say so in the report, and never commit it. `git status --porcelain
--ignored` also lists the folder, as `!! .playwright-mcp/`, when you prefer a git form.
