# Worked examples: the three v7.1 one-shots

Three scripts built and reviewed on 2026-10-20 under `C:\repos\_ops\` (`v71-orphan-site-lists`,
`v71-usage-reconcile`, `v71-business-timezone`). They are described here by shape only. No id, count,
group, site or address from them belongs in this repository; read the folders themselves when you need
the detail. Each passed review with every guard red by its named test.

## Contents

1. The shared skeleton
2. v71-orphan-site-lists: delete a set, with its children and their usage
3. v71-usage-reconcile: remove duplicate rows and give back only what they still count
4. v71-business-timezone: a two-part field write that a live site must see

---

## 1. The shared skeleton

Command surface, identical across all three:

```
node <slug>.js                                    dry run (default): read, plan, print, write nothing
node <slug>.js --apply --expect <line>            the reviewed plan only
node <slug>.js --revert <journal.jsonl>           revert dry run
node <slug>.js --revert <journal.jsonl> --apply   put back exactly what the run changed
```

The durable write helpers, the same in each script:

```js
/** Create-exclusive, fsynced, read back byte for byte. Returns the sha256 of the bytes written. */
function writeDurably(file, value) {
  const buf = Buffer.from(`${EJSON.stringify(value, null, 2, { relaxed: false })}\n`, 'utf8');
  const fd = fs.openSync(file, 'wx');
  try {
    let off = 0;
    while (off < buf.length) off += fs.writeSync(fd, buf, off, buf.length - off);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  if (!fs.readFileSync(file).equals(buf)) fail(`${file} did not read back byte for byte`);
  return sha256(buf);
}
```

`appendDurably(journal, entry)` is the same with mode `a` (or `wx` for the header) and one canonical
line per entry. Reads use `EXACT_READ = { promoteValues: false, bsonRegExp: true }`.

The apply loop, per group:

```js
appendDurably(journal, { type: 'takes', groupID, rows: planned.map((d) => d.rid) }); // intent first
const taken = [];
try {
  for (const d of planned) {
    const got = await col.findOneAndDelete(rowFilter(d.row), EXACT_READ); // _id, groupID and every field read
    if (!got) { notMatched.push(d.rid); continue; } // another writer moved it: skip, release nothing
    taken.push(d.rid);
    release += d.release;
  }
} finally {
  appendDurably(journal, { type: 'taken', groupID, rows: taken, notMatched }); // outcome, even on a throw
}
if (release > 0) {
  appendDurably(journal, { type: 'counter', groupID, amount: String(release) });
  const w = await groups.updateOne(
    { _id: new ObjectId(groupID), 'dataUsage.totalSize': { $gte: Decimal128.fromString(String(release)) } },
    { $inc: { 'dataUsage.totalSize': Decimal128.fromString(String(-release)) } },
  );
  if (w.matchedCount !== 1) fail('would go below zero (or the group is gone); counter NOT written; stopped');
  appendDurably(journal, { type: 'counter-done', groupID, amount: String(release) });
}
```

The red proof table, one row per guard (`redproof.js`):

```js
{ guard: 'G1 --apply needs --expect', file: MAIN,
  find: "if (!expect) fail('--apply needs --expect", replace: "if (false) fail('--apply needs --expect",
  test: 'REFUSE --apply without --expect' },
```

The harness refuses a `find` that does not occur exactly once, runs the unmutated copy first (it must
pass), and logs `RED <guard>: named test "<test>" FAILED` per row.

---

## 2. v71-orphan-site-lists

**Job.** Delete lists left behind by earlier site deletes, each with all its items and their usage rows,
releasing exactly what those rows recorded (an owner decision on the scope).

**Why the native driver, and what that skips.** The product's list delete refuses a list that holds
items, so the script mirrors the service's own site-delete cleanup instead. The header says what that
does NOT do: no socket push, no `collection.deleted` webhook (no live site renders these lists, a keep
rule proves it), no audit row; the snapshot, journal and run record are the record.

**Rules worth copying.**
- Keep rules with reasons for anything that looks like real content or people, reported and never
  deleted; the dry run prints the evidence for an owner decision.
- An item recount right before each list delete, so a list that gained an item since the plan stays.
- Compare-and-set on `_id, groupID, type, updatedAt, __v`, plus a canonical check of the returned row.
- Entries released per metered item only, and stated as a deliberate difference from the service.

**Review lessons.** The revert refused wholesale when an example item it never deleted had changed
since; exclude rows the run did not change from the anomaly check. A usage control counted by
`groupID` while the check matched on `docKey`; the control must use the check's own query shape.

---

## 3. v71-usage-reconcile

**Job.** Remove legacy usage rows that duplicate a current row, or whose item is gone, and give each
group back exactly the bytes the duplicates still count.

**Why only a delta.** The header shows, from code and from a read of the data, that a group's byte total
is NOT the sum of its rows (public submissions add bytes with no row; an older delete released bytes
whether or not a row matched). Recomputing the total would be wrong in both directions, so the script
prints both sums per group and writes only the delta from rows it actually took.

**Tied to the deployed fix.** Before the service fix shipped, every new delete kept leaking and every
edit minted a new duplicate, so the apply refuses unless the DEPLOYED bundle of each function that
defines the usage update carries the fix (read at its `live` alias, code location only). At least one
bundle must define it, and a bundle the detector cannot read refuses.

**Review lessons (both fixed before the apply).**
- A release rule ("an orphan releases nothing") rested on a premise that held for one group and not
  another: in one the counter already excluded the orphans, in another it equalled the row sum to the
  byte. Orphans of live groups became a keep rule with per-group evidence; only a group that no longer
  exists has its rows deleted with release 0.
- The revert re-inserted from the intent line, so it would have put back rows another writer had taken
  (and released) first, double-counting them on the next delete. It now re-inserts only the outcome
  line's rows. The counter guard moved from read-then-`$inc` into the update filter.

---

## 4. v71-business-timezone

**Job.** Part 1 sets owner-confirmed business time zones on groups; Part 2, behind its own flag and its
own pin (`--apply-zones --expect-zones`), clears kit sample zones from site copies after the owner
approved that list. Both flags together check every pin before any write.

**Site-affecting.** A zone change is invisible to a live site until its cache drops, and a driver write
sends nothing. So after the writes the script sends one `site.updated` per affected site (a site in both
parts gets one), with the body the service sends, to the delivery queue resolved by name and checked
against the account; journals each send before and after, also for writes that landed before a stop;
then waits, bounded, on the delivery rows for every active subscription. The revert re-emits for what
it restored. Unconfirmed delivery is reported, never fatal.

**Run order.** The served field came from a Client API change; applying before that change was live
would store zones no site showed. The apply waited for it, and a fresh dry run was taken right before,
because a portal save in between could move the live plan off the approved pin.

**Review notes.** Check subscription health just before the apply (each event reaches every active
subscription of the group, and repeated failures auto-disable one). A `SIGINT` after some writes and
before the emit leaves those sites on the cache backstop; the journal shows which.
