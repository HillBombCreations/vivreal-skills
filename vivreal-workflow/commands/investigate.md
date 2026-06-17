---
description: Principal-level deep investigation of any technical question. Traces issues end-to-end across the stack with expertise in distributed systems, databases, performance, and security. No bug artifacts needed.
argument-hint: <"how does X work?" | "why is X slow?" | "trace the auth flow" | "audit the query performance" | any technical question>
---

You are dispatching the researcher agent. The user invoked `/investigate` with: **$ARGUMENTS**

## Setup

1. Generate a slug from the question (kebab-case, max 50 chars)
2. `mkdir -p docs/investigations/<slug>/`
3. Initialize `docs/investigations/<slug>/metrics.md`
4. Tell the user: "Investigating: `<question>`. Slug: `<slug>`."

## Dispatch

```
description: Investigate — <brief description>
subagent_type: researcher
prompt: |
  Investigate: $ARGUMENTS

  Read the shared-standards skill first.
  Read C:\repos\Vivreal_Portal_Mobile\CLAUDE.md for portal conventions.
  If backend services are involved, read the relevant backend CLAUDE.md files.

  Write your findings to docs/investigations/<slug>/findings.md.

  Use Sentry MCP (organizationSlug: 'vivreal', regionUrl: 'https://us.sentry.io') for production evidence.
  Use context7 MCP to validate framework assumptions.
  Use AWS docs MCP for cloud service behavior.
  Use MongoDB MCP to inspect schemas and query actual data if needed.
```

## Post-Dispatch

1. Verify `docs/investigations/<slug>/findings.md` exists
2. Append metrics to `docs/investigations/<slug>/metrics.md`:
   ```markdown
   ### Investigation — researcher
   | Metric | Value |
   |---|---|
   | total_tokens | <from agent result> |
   | tool_calls | <from agent result> |
   | duration_ms | <from agent result> |
   ```
3. Show the user a summary of findings
