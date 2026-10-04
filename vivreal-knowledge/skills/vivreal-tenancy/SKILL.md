---
name: vivreal-tenancy
description: 'Use when a task touches which DATABASE a tenant lives in, rather than what is inside it: reading or writing group.dbKey, resolvePlacement, choosePlacementForNewGroup, isKnownPlacement or isRoutablePlacement, the pod rename, the tenant-placement plus mongo-connection package merge, a group whose site returns 403 because it has no usable placement, a tier change somebody expects to move data, or any question shaped like "should this tenant get its own database yet". Teaches what is TRUE TODAY against what is only PLANNED, the placement-versus-slug confusion that fails silently everywhere, and why the document-count threshold was never set and cannot be. Triggers on: dbKey, placement, resolvePlacement, pod_01, pod_02, general_shared, pro_plus, tenant database, tenancy, pod rename, tenant-placement, mongo-connection, tenant-db, PLACEMENT_MISSING, PlacementMissingError, which database does this group use, split a tenant out, new pod, placement_weights.'
---

**This skill states pointers and mechanisms, not values.** Every census, count and roster below is
something a query produces in seconds. A number here that a query could have produced is a defect in
this file. Report it rather than quoting it.

# Tenant placement: which database a group lives in

This skill is about **routing a tenant to a database**. For querying once you are in the right
database (collection shapes, join rules, the `publishDate` gate) use `vivreal-db`. For cluster
capacity, connection arithmetic and pool hygiene use `vivreal-atlas-topology`.

---

## The single most important distinction in this whole area

`dbKey` and `group.key` are **different fields with different jobs**, and they look alike enough
that they have been swapped by hand more than once.

| Field | What it names | Used for |
|---|---|---|
| `group.dbKey` | the **tenant database** | selecting the database, read via `resolvePlacement(group)` |
| `group.key` | the group's URL **slug** | the S3 bucket name, CDN media paths |
| `group._id` | the group | the `groupID` filter on every tenant document |

Confusing the first two points every media URL at a bucket that does not exist, and **it fails
silently everywhere**: no error, no alarm, just missing images. Going the other way strands the
tenant's entire database.

**The unique index does not protect you.** A group holding a placement name in its slug satisfies
uniqueness perfectly. No constraint catches this class of mistake, which is why the repair is a
runbook rather than a one-line fix.

---

## What is TRUE TODAY

Read this section as the state of the world, and the next one as a plan that has not run.

- **The pod rename HAS HAPPENED (2026-09-23).** There are **two tenant databases, `pod_01` and
  `pod_02`**, alongside the `Vivreal` control plane and the `outreach` service database. Every
  stored placement was repointed (`groups.dbKey`, the legacy `groups.database`, `domainOrders.dbKey`)
  and the `placement_weights` rows keyed by the old names were deleted
  (`vivreal-hq/docs/projects/tenancy-architecture/migration-run-2026-09-23.md`). Census them rather
  than quoting a roster: group `Vivreal.groups` by `dbKey`.
- **`general_shared` and `pro_plus` are GONE as placements.** `@hillbombcreations/tenant-db` puts
  both on its forbidden list, with `test` beside them (`src/placement/placementNames.ts:80-96` in
  `Vivreal-Mongo-Connection`, package 1.0.6), so a connect to either name is refused. The first drop
  attempt stopped at a red gate the same day; a live database listing on 2026-09-28 showed only
  `Vivreal`, `outreach`, `pod_01`, `pod_02`, `admin` and `local`. **A script that still hardcodes
  `general_shared` gets ZERO documents, not an error**, which reads as "the record was deleted".
  Pair every lookup with a positive control.
- **Who is where:** `pod_01` holds every customer group and the Vivreal group; `pod_02` holds only
  the Vivreal Content group (`6a68169fe1457c2f3fd04530`), placed there deliberately to keep
  Vivreal's own content tenant off the shared placement. Tier does NOT decide placement.
- **`DEFAULT_PLACEMENT` for a new group is `pod_01`** (`src/placement/choosePlacement.ts:19`). The
  retired `@hillbombcreations/tenant-placement` package still says `general_shared`; anything that
  imports it is the bug.
- **No database name tells you a tier**, and no tier tells you a database name. The old names
  were already fossils (the `pro_plus` database never held a group on that retired tier), which is why they went.
- **Placement is stored, never derived.** `deriveDbKey()` is deleted from every repository, and so
  is the `databaseDict[group.tier]` ladder, which is gone for the same reason. An inline ladder
  from a tier to a database IS the bug. Report it rather than copying it.
- **The two tenancy packages have MERGED, and the tenant-placement package is retired.**
  It and mongo-connection became `@hillbombcreations/tenant-db`, which is what the consumer
  repositories depend on now. Import the placement half from the
  `@hillbombcreations/tenant-db/placement` subpath: it pulls in no driver, so it is safe inside a
  bundle. The root re-exports the same members but needs mongo. **The retired package cannot be
  deprecated on this registry**, the command is rejected and its failure reads as success, so
  installing it warns nobody. Somebody writing the old name is the only signal there is, which is
  why a pasteable snippet naming it is worse than a sentence that merely mentions it.

```js
const { resolvePlacement } = require('@hillbombcreations/tenant-db/placement');
const dbKey = resolvePlacement(group); // throws PlacementMissingError if absent or unroutable
```

- **A tier change does not move data.** Nothing in the platform relocates a tenant on upgrade or
  downgrade, and nothing is expected to.
- **Placement is stored in more places than the group document.** Before assuming `groups.dbKey` is
  the only copy: `Vivreal.domainOrders` carries a `dbKey`, and `Vivreal.placement_weights` stores
  the placement name **as `_id`**, which is immutable and therefore cannot be repointed by a field
  update. Scan for the name rather than assuming where it lives.
- **The `group.database` legacy fallback is populated on at least one group.** The placement
  package's own source comment says this field "is already undefined on the one group anybody
  thought still needed it". That comment is wrong. Do not rely on the field being empty, and note
  that `Vivreal_Site_Migrator`'s `expectedDbKeyForGroup` still falls through to it.

---

## What is only PLANNED, and has NOT happened

**Plan and runbook: `vivreal-hq/docs/projects/tenancy-architecture/`.** If you are about to tell
somebody about pods, read the status line at the top of `pod-rename-migration.md` first.

**Both items this section used to list have now happened**: the package merge, and the pod rename
(2026-09-23, phase 2 run; see "What is TRUE TODAY"). Do not describe either in the future tense.

Still only planned or open, as of 2026-10-04:

- **A third pod.** Nothing needs one (see "Should this tenant get its own database" below), and an
  empty pod still costs its collections and indexes against the per-node data-file budget.
- **Memory and docs that still say `general_shared`.** Several notes and the 2026-09-16 precedent
  scripts were written before the move and carry the old name; treat any hardcoded `general_shared`
  or `pro_plus` database name as stale on sight.

An agent that describes a finished change in the future tense sends the next person to redo it; one
that describes a plan in the present tense sends them looking for something that is not there.
Check the run records before saying either.

### Why the merge is the substantive half, not the cosmetic one

The rename is naming. The merge closes a real enforcement hole: **the validator and the thing it
validates live in different packages**, so the per-group allowlist is advisory everywhere and
mandatory nowhere. Measured in `VR_CMS_API`: many controllers route a database open on a
caller-supplied key, and only one of them calls the allowlist `isKnownPlacement`. The shared tenant
wrapper imports the weaker structural check `isRoutablePlacement` only, and mentions the allowlist
in a comment. So a **structurally legal name that no longer exists gets created on first write**
rather than refused. That is the mechanism that produced a database literally named `undefined`.

This is `enforcement-check-the-caller` in its natural habitat: a manifest row claiming the allowlist
exists is only true if the path the product actually calls runs it.

**One trap the plan records:** naively wiring `isRoutablePlacement` into the connection function
takes `VR_Outreach_API` offline, because it opens a service-global database that is deliberately not
a tenant placement. A guard installed at the wrong layer is an outage.

---

## The session cookie is a cache of the placement, and it outlives the cookie

The portal mints a signed context cookie carrying `groupID`, `dbKey` and `bucketname`, and the proxy
injects that `dbKey` into every upstream call. **The silent refresh carries `dbKey` over verbatim
and does not re-read the group document.** The refresh token's validity is measured in weeks, so
without a deliberate intervention a stale placement survives far longer than the short context TTL
suggests.

The invariant the portal source states for itself, which any migration inherits:

> nothing may mutate `group.dbKey` outside a deliberate ops migration, and that migration's runbook
> must force session invalidation so these carried-over claims cannot outlive the move.

**So a change to a stored placement is incomplete until sessions are invalidated.** Read the current
TTLs off the source and the Cognito app client rather than trusting any number written in prose,
here or anywhere else.

---

## When a group has no usable placement

Two distinct failure reasons, needing different repairs:

| `reason` | Means |
|---|---|
| `absent` | no `dbKey`, or it is null, empty, or not a string |
| `unroutable` | a `dbKey` that can never name a tenant database: a coercion accident, a forbidden name, or a retired name after a migration |

**Symptoms, and why they mislead:**

- The public site returns **403 with a generic error page** naming no account, no cause and no fix.
  No banner, no status page entry, no email.
- **The portal symptom is inconsistent by design.** Several call sites catch the placement error and
  degrade quietly; everywhere else it propagates as a 500. Some screens go empty and some throw.
  **Never use "the portal looks fine" as evidence that a tenant is healthy.**
- **The authorizer result is cached.** Read the live `authorizerResultTtlInSeconds` off the REST API
  before re-testing a repair. A source comment in `VR_Client_Auth` understates it by a large factor,
  and anyone trusting that comment re-tests inside the cache window, reads the cached refusal, and
  concludes a correct repair failed. **A code comment is not evidence**, and this is the place where
  believing one costs an outage.

**The repair is a runbook, not an improvisation:**
`vivreal-hq/docs/projects/tenancy-architecture/runbook-missing-dbkey.md`. Its own uncomfortable
finding: the repair it describes, a hand-written single-field write to a group document with `dbKey`
and `key` both on screen, **is the exact act that caused a previous incident**. Follow it, do not
freehand it.

---

## Should this tenant get its own database? Almost certainly not

This arrives as "are we near a limit". It has been worked out and written down, and **the reasoning
matters more than the verdict**, because the verdict will change and the reasoning will not.

**The threshold in the placement package was never set, and could not have been.** It thresholds on
**document count**, and the vendor publishes no document-count limit at any scope or any tier. From
the MongoDB manual, verbatim:

> "MongoDB does not impose a hard limit on collection or database sizes. The maximum size of a
> collection or database depends on the file system of the host server."

**A threshold has to be a fraction of a ceiling.** This one is a fraction of a ceiling that does not
exist, which is exactly why nobody could pick the number: there was nothing to pick it as a fraction
of. Recognising that shape is the transferable part. When a threshold resists being chosen for
months, check that the quantity it bounds is bounded at all.

Two further independent reasons document count is the wrong axis, either sufficient alone:

- **A document is not a unit of anything.** Measured average object size varies by three orders of
  magnitude between collections in the same database, so a database that "fills up" on document
  count can be nearly empty on disk.
- **It would meter the wrong party.** Most documents belong to internal groups that publish
  constantly, so a document threshold on a shared database is largely a threshold on how much
  Vivreal's own marketing team publishes, not on how many customers share the database.

**What actually bounds a managed MongoDB deployment**, in the order it bites:

1. **Working set against cache, and resident memory.** The real ceiling, and on the current tier it
   is **not measurable**: `serverStatus` returns no storage-engine block and resident memory reads
   zero.
2. **Data files per node**, counting collections and indexes, each stored as a separate file. The
   vendor recommends a ceiling per node for multi-tenant deployments and publishes a recommended
   maximum per tier. This is the constraint that decides how many databases you can afford, and it
   is the one to do arithmetic against.
3. **Connections**, and **operations per second**. See `vivreal-atlas-topology`.

**The honest position:** the thing that matters is unmeasurable on this tier, everything measurable
has substantial headroom, and document count is a third thing that is not a limit at all.

**Rules that follow:**

- **Two databases for the current tenant count is correct. Nothing needs splitting.**
- **Do not set a document threshold "for now".** There is a band of plausible values that routes the
  next new customer into the nearly-empty legacy database, because selection sorts by measured
  weight and then by name. A threshold picked to look harmless is the one that misroutes a real
  signup.
- **Do not open a pod to prove the mechanism works.** An empty pod still costs its collections and
  indexes against the per-node data-file budget, permanently, for zero tenants.
- **Setting the threshold today breaks signup.** Two group-creation paths call the policy with an
  empty weight table. While the threshold is null that is harmless by design; the moment it is a
  number, both paths throw. "Just set the threshold" is not a one-line change, whatever a README
  says.
- If a threshold is eventually wanted, **threshold on tenants per database**, which is the quantity a
  database boundary actually buys something against.

---

## Checklist before you touch placement at all

1. **Census first, with a control.** Group `Vivreal.groups` by `dbKey` and pair it with a query that
   must return zero, such as a deliberately misspelled placement name. A placement query returning
   nothing looks identical to a placement that is not there. See `verification-discipline`.
2. **Scan for the name, do not assume one holder.** `groups.dbKey`, `groups.database`,
   `domainOrders.dbKey` and `placement_weights._id` have each held one.
3. **Say "today" or "planned".** The pods, the merged package and the `pod_01` default are TODAY;
   `general_shared` and `pro_plus` are retired database names. Re-read the run records before restating either.
4. **If you are changing a stored placement, sessions must be invalidated**, or the old value keeps
   arriving from signed cookies.
5. **Never hand-write a single field** into a group document with `dbKey` and `key` both on screen.
   That is the incident, not the fix.
