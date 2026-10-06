---
description: Produce the next Vivreal help-centre page from the backlog, verify-first, fixing or filing every defect it turns up
argument-hint: optional topic or backlog row; omit to let it pick the next best one
---

Produce a help-centre page for: $ARGUMENTS

If that is empty, the agent picks the next best row from
`docs/projects/help-center-expansion/guide-backlog.md` itself and says why.

Dispatch the `help-page-producer` agent (run_in_background: false). It owns the
whole loop: re-verify the backlog Note against running code, fix or file every
disagreement as a defect, record and stage footage only if the page needs it,
write and register the MDX in both places, regenerate all four corpus artifacts
and re-read them, update `guide-backlog.md` and `defects-log.md`, add any new
topics it discovered to the backlog, and commit locally.

Relay its report table in full, and lead with two things:

1. **Defects found**, fixed versus filed. That is the reason the run was worth
   doing, and a run with zero findings is a signal something went unverified.
2. **Anything PAIRED**, meaning the page cannot publish until a named product
   branch merges and deploys.

Remind the user nothing is pushed and no PR is open, per the standing rule.
