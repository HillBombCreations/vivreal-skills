---
description: "Write or refresh REFERENCE documentation describing how something works now, with diagrams, reading the deployed code rather than the existing document. Not /document, which writes up a finished bug: this writes the standing docs a person or an agent opens cold."
argument-hint: <what to document, or the path of a document that has gone stale>
---

You are dispatching the `system-doc-writer` agent. The user invoked `/write-docs`
with: **$ARGUMENTS**

## Setup

1. Work out from `$ARGUMENTS` which of the three jobs this is, and say which you
   picked:
   - **Refresh.** A named document has gone stale because something shipped.
   - **New.** A path or subsystem has no document at all.
   - **Fix.** A document exists and is accurate, but a reader cannot find or
     follow it.
2. Find the documentation set's index and read it, because it states the rules
   that set is held to and those rules govern the work. If there is no index,
   say so: creating one is usually the highest value thing available, and it
   should be proposed rather than assumed.
3. Establish the **deployed** ref for every repository in play, and prove each
   tip rather than trusting a local checkout. Most checkouts on a working
   machine sit on a stale feature branch. Pass the proven refs into the dispatch,
   because an agent that resolves them itself may resolve them differently.
4. Tell the user which documents you expect to be touched, before dispatching.

## Dispatch

```
description: Document <subject>
subagent_type: system-doc-writer
prompt: |
  <the job, in one sentence>

  Read <the documentation index> first. It states the rules this set is held to
  and they govern this work.

  The deployed refs, already proven, are: <repo>=<ref> for each repository. Read
  every claim off those, never off a working tree.

  What is true now, as a pointer to where to look rather than as the source of
  truth: <the specific mechanisms, with the files that implement them>. Verify
  each one yourself from source and correct me where I am wrong.

  Documents to update: <list>. Then search the rest of the set for anything else
  made stale by the same change, and report what you found.

  Update any diagram the above makes wrong, and add one where a picture carries
  structure or sequence better than prose. Validate every diagram against a real
  parser with a must-fail control, and check its semantics against the code as
  well, because a diagram that renders is not a diagram that is true.

  Do not commit and do not push.
```

Include in the prompt every specific mechanism you already know, **as a pointer,
not as fact**, and tell the agent to verify each one and contradict you where you
are wrong. A brief that asserts too confidently produces a document that repeats
your mistakes; one that names where to look produces a document that corrects
them. More than one finding in this repository has come from an agent refusing a
premise it was handed.

## The rule to restate in the dispatch every time

**No history.** No commit hashes, no release tags, no version numbers, no defect
identifiers, no "this used to", "was fixed", "previously", "as of". Present
tense, describing the current design as though it had always been this way. A
reader wants the system in front of them, and the history lives in the working
documents and in version control.

Restate this even though the agent's own definition carries it. It is the rule
most often lost when a brief is long, and a single history sentence in an
otherwise clean document teaches the next reader that the convention is
optional.

## Post-dispatch

1. Verify each document the agent claims to have changed actually changed, and
   read the diff rather than trusting the report.
2. **Sweep for history that crept back in.** Search the touched documents for
   commit hashes, release tags and the phrases above. This check has caught
   real regressions, so run it rather than assuming.
3. Check the dash scan was run with a poison control, and re-run it yourself if
   the report does not say so.
4. If the agent reported a `[GAP: ...]`, surface it to the user rather than
   leaving it in the file for someone to find later.
5. If the agent found something stale that nobody listed, that is a finding in
   its own right. Report it up, because it usually means a shipped change that
   nothing else caught.

## What this command does not do

It does not write the record of what changed. If the work turned up something
that belongs in a history or a register, report it and let the caller put it
there. Mixing the two is what makes a reference document unreadable.
