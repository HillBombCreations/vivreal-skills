# Audit Readiness — handoff to the deferred cross-repo audit (sub-project 4)

**Date:** 2026-06-19
**Branch:** `workflow-self-sufficiency`

This is the handoff doc for sub-project 4 (the full cross-repo audit), which is a
separate cycle that runs AFTER sub-projects 1–3 land and dogfoods the new
auto-reviewing planner.

## What's ready (sub-projects 1–3)

| Capability | Where | Status |
|---|---|---|
| `vivreal-brainstorming` skill (fork, no superpowers dep) | `vivreal-workflow/skills/vivreal-brainstorming/SKILL.md` | ✅ done |
| `vivreal-writing-plans` skill (fork + auto-review terminal step) | `vivreal-workflow/skills/vivreal-writing-plans/SKILL.md` | ✅ done |
| Architect points at the fork | `vivreal-workflow/agents/architect.md` | ✅ done |
| Reviewer artifact mode (plan/design/research rubric) | `vivreal-workflow/agents/reviewer.md` | ✅ done |
| Coder + `/implement` auto-dispatch reviewer | `vivreal-workflow/agents/coder.md`, `commands/implement.md` | ✅ done |
| `/plan` chain (research → plan → auto-review) | `vivreal-workflow/commands/plan.md` | ✅ done |
| `vivreal-db` MCP activation triggers + cross-link | `vivreal-knowledge/skills/vivreal-db/SKILL.md`, `shared-standards` | ✅ done |
| **Live Mongo schema reconciliation** | `vivreal-db` / `db-query` | ⏳ **BLOCKED — see below** |

## ⏳ Pending prerequisite: live Mongo schema validation (Task 7 steps 1–4)

The MongoDB MCP server (`mcp__mongodb__*`) was **not connected** in the session
where this work was done — neither the main loop nor a dispatched agent could
reach it. So the documented schema was **not** verified against live Mongo. Do
this before (or early in) the audit, since the audit touches schemas/shared:

**To run it:** open a session with the MongoDB MCP server configured + authenticated
(read-only Atlas user), then run these read-only calls and reconcile any drift into
`vivreal-knowledge/skills/vivreal-db/SKILL.md` and `vivreal-db-explorer/commands/db-query.md`:

| Step | Tool | Args |
|---|---|---|
| 1 | `mcp__mongodb__list-databases` | (none) — confirm `Vivreal`, `general_shared`, `pro_plus`; note extras |
| 2 | `mcp__mongodb__list-collections` | per DB — confirm documented collection inventory; note drift |
| 3 | `mcp__mongodb__collection-schema` + `find` limit 1 (redact secrets) | `general_shared.collection_objects`: `collectionObj.refID` String, `groupID` String, `publishDate` Date/null. `Vivreal.groups`: `tier` ∈ {free,basic,pro,proplus}, `key` exists, `_id` ObjectId |

### ⚠️ Known contradiction to resolve during validation

`vivreal-workflow/skills/shared-standards/SKILL.md` currently states (line ~73)
"MongoDB multi-tenant — each group has its own DB identified by `dbKey`" and
(line ~102) describes a "slugified groupName (enterprise)" dbKey. This
**contradicts** the `vivreal-db` skill, which is emphatic that there is **NO
per-group database** — only three shared DBs (`Vivreal`, `general_shared`,
`pro_plus`). One of them is wrong (or there's an undocumented enterprise tier).
This was NOT edited because it can't be verified without live Mongo / backend
source. Resolve it during the validation pass and make both docs consistent.

## How to launch the audit (sub-project 4)

After the Mongo validation above:

```
/orchestrate "audit recent cross-repo changes (schemas/shared, client API, portal, outreach, secure, CMS, main) for correctness, multi-tenancy safety, and regressions from the recent updates" --workflow=audit
```

**Scope (recent-change blast radius, per the user):** essentially everything —
Vivreal-Schemas / shared packages, VR_Client_API (site-render client API),
Vivreal_Portal_Mobile (portal), VR_Outreach_API (outreach), VR_Secure_API,
VR_CMS_API, VR_Main_API.

Run it through the new machinery: the orchestrate investigate→design phases now
use `vivreal-writing-plans` (auto-reviewed plans), and any fixes go through the
coder's auto-review. This is the dogfooding the design called for.
