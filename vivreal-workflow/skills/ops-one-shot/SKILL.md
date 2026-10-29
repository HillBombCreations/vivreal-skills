---
name: ops-one-shot
description: 'Use when building, reviewing or running a one-shot production data script (a backfill, repair, reconcile, cleanup or repoint written against the live database or AWS), covering where it lives, the dry run that shares one planner with the apply, the --expect pin of counts plus a sha256 of the planned set, the fsynced snapshot and per-write journal, compare-and-set writes with read-back, the exact revert of only what was taken, database-side counter guards, refusals tied to the deployed code, the site.updated event after a site write, real-mongod ALLOW and REFUSE tests with a kept mutation red proof, and who runs the owner-approved apply.'
---

# Ops one-shot: the production data-step pattern

v7 and v7.1 built a dozen of these. Every first review found the same defects, and every one was
learned from a BLOCK. This skill is that list, so the next builder starts where the last one ended.
Worked examples, generic and without data: `references/worked-examples.md`. The red proof rule is
form (c) in `vivreal-workflow:shared-standards`; the false-green traps are in
`vivreal-workflow:verification-discipline`.

## Where it lives, and what it is not

- **Outside every repository**, in `${VIVREAL_REPOS}/_ops/<release>-<slug>/` (owner rule). A one-shot in a
  repo reads as a supported tool and invites a rerun. Never commit one, not even to a pushed branch.
  The durable fix belongs in service code; the script only repairs data the fix can no longer reach.
- **One folder per script**: `<slug>.js` (the I/O half: read, apply, revert, CLI), `lib.js` (the PURE
  half: rules, plan, the expect line, the revert state), `test/`, `redproof.js` with its dated log,
  dated dry-run logs, and `runs/` (snapshots, journals, run records).
- **The header is the spec.** The top of `lib.js` states what goes, what stays and why, each rule with
  the code commit and the data read that justify it, and every rule as a named reason
  (`DELETE_DUPLICATE`, `KEEP_ORPHAN`, `KEEP_MALFORMED`, ...). A reviewer reads the rules there first.

## The rails (all of them, every time)

1. **Dry run by default.** No flag writes nothing. `--apply` is required to write, and an unknown
   flag is an error, never a quiet dry run.
2. **Dry run and apply call the same planner.** One `plan()` in `lib.js`, the same state and guard
   functions, no stubs. A dry run on different predicates proves nothing about the apply (a 54-test
   script once stopped after 8 of 38 writes this way). Ask of every script: what does the dry run skip
   that the apply runs?
3. **`--expect` pins the reviewed plan.** The dry run prints one line: the counts per kind (and per
   database or group where it matters), the totals it will move, and a sha256 over the canonical,
   sorted planned set (ids plus the fields each write depends on). `--apply` without `--expect`
   refuses; `--apply` whose live plan hashes differently refuses with "rerun the dry run and review
   again". `parseExpect` accepts only the exact shape. A separate pin per part when a script has two.
4. **Snapshot before the first write: create-exclusive, fsynced, read back byte for byte**, its sha256
   recorded in the journal header. Open with `wx`, write all bytes, `fsync`, close, re-read and compare.
5. **Read and write BSON exactly.** Read with `{ promoteValues: false, bsonRegExp: true }` and
   serialise with canonical EJSON (`relaxed: false`), so Int32, Double, Decimal128 and string ids round
   trip unchanged and a revert is byte identical. Journal amounts as strings. Compare documents through
   one canonical function, never `===` on a loaded number.
6. **A journal line before and after every write, appended and fsynced.** Intent goes down before the
   write (`takes`, `counter`), the outcome after (`taken`, `counter-done`). The outcome line is written
   in a `finally`, so a throw part way still records exactly what landed. A torn last line reads as
   never written; any other unparseable line stops the revert.
7. **Compare-and-set writes.** Every write's filter carries `_id`, the tenant key (`groupID`) and each
   field the plan read (`size`, `updatedAt`, `__v`, the stage the operator saw). `findOneAndDelete` or
   `updateOne` with that filter; no match means someone else moved it, so skip it, record it as
   not-matched, and never count it. Check the returned document canonically against the snapshot.
8. **Guards that must hold under concurrency live in the database filter.** A counter that must not go
   below zero is `{ _id, 'dataUsage.totalSize': { $gte: <amount> } }` with `$inc: -amount`, and
   `matchedCount: 0` is a refusal. A read-then-`$inc` is not a guard. Release only what this run took,
   in one `$inc` per group (an `$inc` commutes with live traffic; a recomputed `$set` does not).
9. **Read back after each write**, and stop at the first surprise, saying how far it got and printing
   the revert command.
10. **The revert is exact.** It reads the journal, verifies the snapshot's sha256, and puts back ONLY
    what the journal says was taken (the outcome line; the intent line stands in only for a group that
    crashed mid-take, which by construction has no counter line). It re-inserts with `insertOne`, never
    a replace, so a unique index refuses a row that took the key since, then reads each one back. A
    counter write announced but never confirmed is an anomaly for a person to decide. Any anomaly
    refuses the whole revert apply, but only rows the run actually changed can be anomalies. The revert
    has its own dry run.
11. **Usage counters move with the documents.** Deleting items, lists or usage rows without releasing
    (or deliberately not releasing) their bytes and entries leaves the quota wrong forever. State in the
    header which counters move and which never do, and test both.
12. **Refuse unless the deployed code carries the fix the script depends on.** Where a script is only
    safe after a fix ships, check the DEPLOYED artifact, not git: read each function at its `live` alias
    (`$LATEST` where none), take only the code location, never the configuration or its environment,
    and look for the fix in the bundle. At least one bundle must define the function, or the check
    proves nothing; an unreadable or reshaped bundle refuses. Fix the detector against the new artifact;
    never bypass it.
13. **Positive controls on every read that can come back empty.** A known-present row found by the
    same query shape the check uses, a list count above zero, audit rows seen. If a control cannot fire,
    refuse. A control with a different query shape from the check is not a control.
14. **Identity is checked, never assumed.** Ids as 24 lowercase hex; search both `ObjectId` and string
    `_id` forms; a group whose database cannot be placed exactly (padded, wrong case, not a pod) is kept
    with a reason, never guessed at.
15. **Secrets and connections.** The cluster URL comes from Secrets Manager into memory only, never
    printed, logged or written; every message passes a redactor keyed on the secret's own value (and on
    email shape). One `MongoClient`, `maxPoolSize: 1`, bounded timeouts, closed in `finally` and on
    `SIGINT`. Logs carry id prefixes and counts, never a business name, an email or content.
16. **A run record** (JSON, beside the journal) names the actor, the script and lib sha256, the pin,
    each group's outcome and the final status, and is written on success, failure and `SIGINT`.

## Site-affecting writes

- **A native-driver write is invisible to a live site and to every open browser.** It sends no
  `site.updated`, moves no `updatedAt` (that stamp is Mongoose's), emits no socket event and drops no
  cache. After a write that changes what a site serves, send ONE `site.updated` per affected site, with
  the body Secure's `emitWebhookEvent` sends, to the webhook delivery queue resolved by name and checked
  against the account before any write. Journal each send before and after, also for writes that landed
  before a stop, and have the revert re-emit for what it restored.
- **Then confirm delivery** with a bounded wait on the delivery worker's own `webhook_deliveries` rows,
  and a served check of one site. Unconfirmed delivery is reported, never fatal: the writes stand and
  the cache backstop catches up.
- **Know what the event costs.** Every active subscription for the group receives every event, and the
  worker auto-disables a subscription after a run of failures, so check subscription health just before
  a large apply.
- A delete of data no live site renders needs no event; say so in the header.

## Tests and red proof

- **A real mongod** (`mongodb-memory-server`) with production's unique indexes and production's value
  shapes (string sizes, Decimal128 counters, Int32 entries, both `_id` forms). A stubbed driver hides the
  filter, the index and the type errors that matter here.
- **Every guard has a paired ALLOW and REFUSE test**, named so the red proof can find it. Drive the
  forward loop end to end through every step kind, and test the revert from a REAL snapshot file plus a
  non-empty journal, including a row another writer took first (which must stay absent after the revert).
- **Concurrency and crash seams**: inject a writer or a throw between plan and take, take and release,
  check and insert. That is how the not-matched, crash-mid-group and no-overwrite paths get proved.
- **Red proof, form (c)**: `redproof.js` copies the folder to a scratch directory outside every working
  tree, first proves the unmutated copy passes, then for each guard replaces exactly one occurrence of
  its line in the COPY (refused unless it occurs once), runs the suite, and requires that guard's named
  test to fail. Keep the harness and its dated log with the script. Never mutate the real folder.
- **Oracles from the cited commits.** Where a detector or rule mirrors product code, build its fixtures
  from that code at the cited commit (and the deployed bundle), byte for byte, not from memory.

## Who runs it, and when

1. A coder builds it to this pattern; `vivreal-principal:reviewer` reviews it (the dry run log, the
   tests run once, the red proof record, and "what does the dry run skip").
2. The owner approves the exact pin line from the reviewed dry run, and the run order (for example,
   only after the fix it depends on is deployed and served).
3. **The coordinator runs the apply itself, in the main thread.** A write agent refuses a go relayed
   to it mid-task, correctly (see `vivreal-workflow:fleet-concurrency`). A fresh dry run comes first,
   right before the apply; if its pin differs from the approved one, stop and re-review.
4. After the apply: the read-back lines, then a dry run that plans nothing left, then the served
   check. Hand the read-back to the agent that owns the area.
5. Keep `runs/` (snapshot, journal, run record) off the machine as well until the revert window
   closes. Record what ran, when, and the pin in the release log, never in the script's repo.

## The defects that keep recurring (check each before review)

- dry run and apply on different predicates; a dry run that stubs a state;
- numbers promoted on snapshot read, so the revert is not byte identical;
- no `--expect`, or a pin over counts only, not the planned set;
- no per-write journal, or an intent-only journal that makes the revert re-insert rows another writer
  took;
- a counter guard as read-then-`$inc`; counters forgotten entirely;
- a revert that refuses wholesale because of a row the run never changed;
- a positive control on a different query shape from the check;
- a release rule resting on a premise the data contradicts (check the premise per group, and keep the
  evidence rows when it does not hold);
- a red-proof harness written, run and then deleted.
