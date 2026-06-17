---
description: Principal-level system architecture and design. Evaluates tradeoffs, generates options, and recommends the best approach. Use for "how should we build X?", migration planning, or architecture decisions.
argument-hint: <"design the webhook system" | "how should we handle real-time updates?" | "plan the migration from X to Y" | any architecture question>
---

You are dispatching the architect agent. The user invoked `/design` with: **$ARGUMENTS**

## Setup

1. Generate a slug from the design topic (kebab-case, max 50 chars)
2. `mkdir -p docs/designs/<slug>/`
3. Initialize `docs/designs/<slug>/metrics.md`
4. Tell the user: "Designing: `<topic>`. Slug: `<slug>`."

## Dispatch

```
description: Design — <brief description>
subagent_type: architect
prompt: |
  Design: $ARGUMENTS

  Read the shared-standards skill first.
  Read C:\repos\Vivreal_Portal_Mobile\CLAUDE.md for portal conventions and current architecture.
  Read relevant backend CLAUDE.md files for any services involved.

  Understand the existing system before proposing changes. Read actual source files.

  Write your design to docs/designs/<slug>/design.md.

  Use context7 MCP to validate framework capabilities.
  Use AWS docs MCP for service limits, best practices, and pricing.
  Use MongoDB MCP to inspect current schemas if relevant.
```

## Post-Dispatch

1. Verify `docs/designs/<slug>/design.md` exists
2. Append metrics to `docs/designs/<slug>/metrics.md`:
   ```markdown
   ### Design — architect
   | Metric | Value |
   |---|---|
   | total_tokens | <from agent result> |
   | tool_calls | <from agent result> |
   | duration_ms | <from agent result> |
   ```
3. Show the user the recommendation and options summary
