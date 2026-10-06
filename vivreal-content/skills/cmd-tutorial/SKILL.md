---
description: Make a how-to tutorial for ordinary owners, shot at desktop AND phone from one script, with the control highlighted and zoomed
argument-hint: <topic> [help|site|social] [--only=desktop|phone], e.g. "connect your Instagram account" help
---

Make a tutorial: $ARGUMENTS

Dispatch the `tutorial-maker` agent (run_in_background: false) with the topic, the
destination (`help` by default), a kebab-case slug derived from the topic, and any
`--only` flag from the arguments.

**Both passes run by default, and that is the point.** One script, shot at desktop
(1440x810, cuts to 16:9) and at phone (540x960, cuts to 9:16). Only pass `--only`
when the user explicitly asked for a single viewport.

Relay its JSON result: slug, session path, the per-pass status, the voice-check
verdict, and what it says remains.

Two things to tell the user rather than let them discover:

1. **The first run on this machine is `--login`.** The browser profile starts empty;
   `npm run tutorial -- --login` signs it in and records nothing. It must be the demo
   tenant, never an account that can see real customers.
2. **A failed pass fails the run.** If one viewport came back `failed`, the tutorial
   is not done. Offer to fix the script and reshoot that pass rather than shipping
   the half that worked.

On `status: blocked`, show which surface the agent refused to film and why. The
"Currently unsafe to film" table in `.claude/agents/footage-recorder.md` is dated
per row, so a block may just be stale: offer to re-check that row before re-planning
the topic.
