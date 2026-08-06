---
description: Review Claude Code definition files — the agent, skill, command, and plugin .md/.json files that configure Claude Code itself. Dispatches the definition-reviewer subagent and returns only the verdict. Read-only; it never edits the files it reviews.
argument-hint: <path to a plugin dir, repo root, or .claude/ dir | plugin name | --policy=agency | --mode=b | (no args = current repo)>
---

You are dispatching the definition-reviewer agent. The user invoked
`/definition-review` with: **$ARGUMENTS**

## Input Detection

1. **No arguments** → the target is the current working directory.
2. **A path** → use it as the target.
3. **A plugin name** matching a `plugins[].name` in `.claude-plugin/marketplace.json`
   → resolve that entry's `source` to an absolute path.
4. **`--policy=agency`** → pass through; enables the Agency policy rule bundle,
   which is OFF by default.
5. **`--mode=b`** → pass through; the agent offers the Mode B scripted runbook
   instead of only mentioning it at the end.

Flags may be combined with any target form.

## Setup

1. **Resolve the target to an ABSOLUTE path before dispatching** (`pwd` for the
   no-argument case). Never pass the literal string `.` — profile detection joins
   the target with `.claude-plugin/plugin.json`, and a relative target resolves
   against the subagent's working directory, not yours. A relative target is how
   you get a confident review of the wrong directory.
2. Confirm the path exists. If it does not, stop and say so — do not dispatch.
3. Tell the user the resolved absolute target before dispatching.

## Dispatch

```
description: Definition review — <target name>
subagent_type: vivreal-agent-review:definition-reviewer
prompt: |
  Review the Claude Code definition files at this target.

  Target (absolute): <resolved absolute path>
  Policy posture: <off (default) | agency>
  Mode: <A (agent-native, default) | offer Mode B>

  Detect the profile first and print it in the header. Apply your full procedure.
  Report read-only findings in your mandatory output format. Do not edit anything.
```

## Post-Dispatch

1. Show the `VERDICT:` line, the counts line, and every ERROR verbatim.
2. If errors exist, name the highest-leverage fix first — a load failure (a `:` in
   an agent `name`, unparseable frontmatter) outranks everything else, because those
   files are not loading at all.
3. If clean, state which checks did NOT run — the policy bundle when off, Stage 0
   on a Profile B target, and the agent field-level rules that Stage 0 never covers.
4. Never apply the fixes yourself as part of this command. The reviewer is
   read-only by design; route edits through a normal coding pass so they are
   reviewable.
