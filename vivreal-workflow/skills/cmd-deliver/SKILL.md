---
description: "Run a change end to end across the portal and a backend, from research to checked in, shipping the backend first so the portal can be validated against it, then validating in a browser and getting owner-level feedback before the portal PR. Not /orchestrate, which is the phase gated planning workflow with approval stops: this one carries the release steps and the validation through to done."
argument-hint: <what to build or fix, and whether to promote the portal or just check it in>
---

You are dispatching the `delivery-orchestrator` agent. The user invoked
`/deliver` with: **$ARGUMENTS**

## Before you dispatch

1. **Read the `fleet-concurrency` skill.** The orchestrator owns the commit gate
   for this batch, and that only works if you have told it so.
2. Work out from `$ARGUMENTS` whether the portal should be **promoted** or only
   **checked in**. If it is not stated, ask. Do not guess: promoting a portal
   change nobody asked to promote is not recoverable by apologising, and checking
   in a change somebody expected live means they will believe it shipped.
3. Establish and prove the deployed refs for every repository likely in play, and
   pass them in. An agent that resolves them itself may resolve them differently,
   and most checkouts on this machine sit on stale feature branches.
4. **Sweep for orphans before starting.** List what is listening on the fixed
   ports, find runner and browser processes whose parent has exited, and kill what
   nobody owns. Starting a batch on a machine already loaded is how a run hangs an
   hour in.

## Dispatch

```
description: Deliver <change>
subagent_type: delivery-orchestrator
prompt: |
  <the change, in one sentence>

  Read the fleet-concurrency skill first. You own the commit gate for this batch.

  Deployed refs, already proven: <repo>=<ref> for each. Read every claim off
  those, never a working tree.

  Portal disposition: <promote | check in only>.

  Run the phases in order and do not advance past a gate that only looks done.
  Ship the backend half and PROVE it live before validating the portal, because
  the portal cannot be validated against an API that has not deployed.

  Validate against a LOCAL build carrying the portal changes, assembled from
  every portal branch in this batch, then freeze the tree while validation runs.
  Identify the server by path, never by the package banner.

  Report what each phase refuted as well as what it confirmed.
```

## The instruction to restate every time

**Portal coders write the tests their change needs and run none.** They run lint
and the type check on their own files, and nothing else. The suite runs once, at
the end, over the accumulated diff, by the orchestrator.

Restate it even though the agent definition carries it. It is the instruction
most often lost in a long brief, and losing it is expensive in a specific way:
several agents running end-to-end suites at once contend for the processor and
for the fixed ports, and the outcome is not a slow pass but a hang, plus green
runs that were made against another worktree's code.

## Post-dispatch

1. **Check what is actually live**, from stack state and the deployed refs, not
   from the report. A green workflow is not a deploy.
2. **Check what is NOT live.** If the portal was checked in rather than promoted,
   say so in your own words to the user, because a long successful report reads
   as "it shipped".
3. Surface every refuted premise. Those are usually the most useful thing the run
   produced.
4. Sweep for orphans again and confirm the machine is back to a healthy load.
5. If the run left an integration branch or a frozen build, say where it is and
   whether it is still needed, rather than leaving it for someone to find.

## What this command does not do

It does not decide whether to promote. That is the user's call and it is asked
for up front.

It does not replace a design approval. If the change needs a human to agree what
it should look like before it is built, get that first; this command builds what
was decided.
