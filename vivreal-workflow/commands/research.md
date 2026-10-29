---
description: Research a bug end-to-end across the Vivreal stack, or investigate any technical question (this replaced /investigate). Creates the bug or investigation directory, dispatches the researcher agent, and records metrics. Bug output is compatible with /coordinator (it skips Phase 1 if research.md exists).
argument-hint: '<inbox #N | "description of the bug" | gh:owner/repo#N | sentry URL | "how does X work?"> [--slug <slug>]'
---

You are dispatching the researcher agent directly. The user invoked `/research` with: **$ARGUMENTS**

## Phase 0: Setup

Parse the input using the same detection as /coordinator:

1. **Inbox reference** (`inbox #N` or `#N`): Read `docs/bugs/_inbox.md`, pull issue N, generate slug from title
2. **GitHub issue** (`gh:owner/repo#N` or `gh:#N`): Fetch via `mcp__github__get_issue`, generate slug from title
3. **Sentry URL** (contains `sentry.io/issues/`): Fetch via Sentry MCP, generate slug from title
4. **Free text describing a bug**: Generate slug from first ~6 meaningful words
5. **A technical question that is not a bug** ("how does X work?", "why is X slow?", "trace the auth flow"): the **question mode** below.

`--slug <slug>` overrides the generated slug in every mode.

Then, for a bug:
1. `mkdir -p docs/bugs/<slug>/`
2. Write `docs/bugs/<slug>/issue.md` with the verbatim issue text and source
3. Initialize `docs/bugs/<slug>/metrics.md`:
   ```markdown
   # Metrics: <slug>
   **Date:** <today>
   **Source:** <inbox #N | gh:owner/repo#N | sentry | user input>
   ```
4. Tell the user: "Slug: `<slug>`. Dispatching researcher."

## Dispatch

```
description: Research <slug>
subagent_type: researcher
prompt: Research the bug at docs/bugs/<slug>/issue.md. Slug is <slug>. Read the shared-standards skill first. Trace the full path from UI to DB. Cite file:line for every claim. Check Sentry MCP for any reported errors. Write your findings to docs/bugs/<slug>/research.md. Do not propose fixes, that's the architect's job.
```

Include relevant ecosystem docs based on the bug area (same routing table as coordinator):
- Frontend: `docs/ecosystem/FRONTEND_APPLICATION.md`, `docs/ecosystem/ARCHITECTURE.md`
- Backend: `docs/ecosystem/BACKEND_APIS.md`, `docs/ecosystem/CROSS_API_DEBUGGING_GUIDE.md`
- Database: `docs/ecosystem/DATABASE.md`
- Sites: `docs/ecosystem/SITE_CREATION_PIPELINE.md`

Also include relevant backend CLAUDE.md paths if backend repos are involved.

## Question mode (no bug artifacts)

1. Slug from the question (kebab-case, max 50 chars) unless `--slug` names one.
2. `mkdir -p docs/investigations/<slug>/` and initialize `docs/investigations/<slug>/metrics.md`.
3. Tell the user: "Investigating: `<question>`. Slug: `<slug>`."
4. Dispatch:

```
description: Investigate, <brief description>
subagent_type: researcher
prompt: |
  Investigate: <the question>

  Read the shared-standards skill first.
  Read the CLAUDE.md of every repo involved, resolved through ${VIVREAL_REPOS}.
  Write your findings to docs/investigations/<slug>/findings.md.

  Use the Sentry MCP for production evidence, context7 to validate framework assumptions,
  the AWS docs MCP for cloud service behavior, and the MongoDB MCP for schemas and data.
```

5. Verify `findings.md` exists, append the metrics block below to `docs/investigations/<slug>/metrics.md` under `### Investigation: researcher`, and show the user a summary.

## Post-Dispatch (bug mode)

1. Verify `docs/bugs/<slug>/research.md` exists
2. Append metrics to `docs/bugs/<slug>/metrics.md`:
   ```markdown
   ### Research: researcher
   | Metric | Value |
   |---|---|
   | total_tokens | <from agent result> |
   | tool_calls | <from agent result> |
   | duration_ms | <from agent result> |
   ```
3. Show the user a 2-3 sentence summary of findings + the path to research.md
4. Suggest next steps:
   - "Run `/architect <slug>` to generate a fix plan"
   - "Run `/coordinator trace:<slug>` to skip research and go straight to full workflow"

## GitHub Issue Creation (optional)

If the research identifies a clear root cause with file:line citations, ask the user:
"Want me to create a GitHub issue from these findings? This enables the `/coordinator gh:` handoff flow."

If yes, create the issue in the repo where the fix lives using `mcp__github__create_issue` with:
- Title: `[researched] <slug description>`
- Body: Root cause, files involved, recommended fixes from research.md
- Labels: `researched`
