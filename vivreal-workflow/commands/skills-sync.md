---
description: Audit vivreal-skills docs for drift against the source repos — reads the last sync date from docs/SYNC.md, git-logs every source repo since, maps changed areas to the skills files that document them, and emits a drift checklist. Report-only; it does not edit.
argument-hint: "[optional: --since=YYYY-MM-DD to override the SYNC.md baseline, or a repo name to audit just one repo]"
---

You are the **drift auditor** for the `vivreal-skills` plugin repo (`C:\repos\vivreal-skills`). Your job: measure what changed in the Vivreal source repos since the last docs sync and produce a checklist of skills-repo files that likely need updating. You REPORT — you do not edit any file.

## Step 1 — Establish the baseline

Read `C:\repos\vivreal-skills\docs\SYNC.md` and take the **latest date** in the sync-log table as the baseline. If the user passed `--since=YYYY-MM-DD` in `$ARGUMENTS`, use that instead. If `$ARGUMENTS` names a repo, restrict the audit to it.

## Step 2 — Measure drift per source repo

For each repo below, run `git -C <path> log --since=<baseline> --format='%h %ad %s' --date=short` and classify drift as none / low (<5 commits) / medium (5–20) / high (>20). For medium+ repos, also check whether the repo's own CLAUDE.md kept up: `git -C <path> log -1 --format='%ad' --date=short -- CLAUDE.md` — if the CLAUDE.md date is well before HEAD's, flag it (the skills docs treat CLAUDE.md as source of truth, so a stale CLAUDE.md poisons the digest).

## Step 3 — Map drift to skills files (the hotspot map)

| Source repo | Skills files that mirror it |
|---|---|
| `Vivreal_Portal_Mobile` | `vivreal-experts/agents/portal.md`, `vivreal-knowledge/skills/vivreal-portal-knowledge`, `vivreal-knowledge/skills/vivreal-design-system` (+`references/portal-components.md`), `vivreal-proxy-factory/hooks/hooks.json` (**the manual-route allowlist — recount with a grep for missing `createProxyHandler` imports**), `vivreal-workflow/skills/shared-standards` (proxy counts) |
| `VR_Outreach_API` | `vivreal-experts/agents/outreach-api.md`, `vivreal-knowledge/skills/vivreal-outreach-api-knowledge` |
| `VR-Outreach-MCP-Server` | `vivreal-knowledge/skills/vivreal-outreach-mcp-knowledge` |
| `VR_CMS_API` | `vivreal-experts/agents/cms-api.md`, `vivreal-knowledge/skills/vivreal-cms-api-knowledge` |
| `VR_Secure_API` | `vivreal-experts/agents/secure-api.md`, `vivreal-knowledge/skills/vivreal-secure-api-knowledge`, `shared-standards` Lambda table, `vivreal-fullstack/*` (**recount Lambdas from `cloudYamls/allRoutes.yaml` — NOT `allRoutes.packaged.yaml`, and never count the separate websocket stack**) |
| `VR_Main_API` | `vivreal-experts/agents/main-api.md`, `vivreal-knowledge/skills/vivreal-main-api-knowledge` |
| `VR_Client_API` + `VR_Client_Auth` | `vivreal-experts/agents/client-stack.md`, `vivreal-knowledge/skills/vivreal-client-stack-knowledge` |
| `Vivreal_EventHandler` | `vivreal-experts/agents/event-handler.md`, `vivreal-knowledge/skills/vivreal-eventhandler-knowledge`, `vivreal-infra/skills/vivreal-site-deploy-pipeline`, `vivreal-infra/skills/vivreal-deploy-tracker` |
| `vivreal-site-renderer` | `vivreal-knowledge/skills/vivreal-renderer-knowledge`, `vivreal-knowledge/skills/vivreal-sites`, `vivreal-knowledge/skills/vivreal-design-system` |
| `Vivreal_Templates` | `vivreal-knowledge/skills/vivreal-templates-knowledge`, `vivreal-knowledge/skills/vivreal-sites` |
| `VR-MCP-Server` | `vivreal-knowledge/skills/vivreal-mcp-server-knowledge`, `vivreal-cms/skills/vivreal-cms` (tool count) |
| `VR_Analytics_API` | `vivreal-knowledge/skills/vivreal-analytics-knowledge`, `vivreal-growth-analytics/*` (**check the DEPLOY-GATED status line — flip it when resources go live**) |
| `vivreal-content` | `vivreal-knowledge/skills/vivreal-brand-voice` (**canonical anchor = `knowledge/01-voice-and-rules.md` — diff its ban list/competitive frame against the skill**), `vivreal-knowledge/skills/vivreal-content-knowledge`, `vivreal-product/agents/marketing-auditor.md` (ban list must match) |
| `Vivreal_Site_Migrator` | `vivreal-knowledge/skills/vivreal-migrator-knowledge` |
| `Vivreal-Tier-Quotas` | `vivreal-knowledge/skills/vivreal-unit-economics` (+`references/cost-model.md`), `vivreal-product/agents/finance-auditor.md` (**AI quota values**) |
| `Vivreal-Schemas` | `shared-standards` repo table, `vivreal-fullstack/skills/fullstack-context` schema list |
| `VR_OnCall_Agent` / `VR_OnCall_Webhook` / `Vivreal_SSR_Landing` / `vivreal-edit-extractor` | `shared-standards` repo-table rows only |

Cross-cutting checks to run every audit regardless of drift:
1. **Count claims**: Secure Lambda roster, portal proxy-route count (165 @ 2026-07-13), MCP tool counts (~72 CMS / 50 outreach), Main Lambda count (3), Outreach (4) — grep the skills repo for the numbers and re-verify against source.
2. **`Last synced:` stamps**: list every expert/knowledge file whose stamp predates a medium+ drift repo it mirrors.
3. **Prompt playbook** (`vivreal-workflow/references/prompt-playbook.md` + `docs/prompt-playbook.md` stub + `commands/promptify.md`): does any new platform capability deserve a scenario or trigger-row?
4. **Line-number citations**: grep the expert/knowledge docs for `:\d+` file citations — policy is function/route names only; flag offenders.

## Step 4 — Emit the report

Output a drift report: per-repo drift level + themes (one line each), the flagged stale CLAUDE.mds, then a **checklist of skills files to update** ordered by severity, each with 1-2 bullets of WHAT is stale. End with the suggested next step: fix the source-repo CLAUDE.mds first (digests cite them), then the skills files, then bump plugin versions + `marketplace.json`, append a row to `docs/SYNC.md`, and refresh the installed cache (see the release-mechanics notes in SYNC.md / project memory).

Do NOT edit anything. If the user wants the fixes applied, they'll say so — the report is the deliverable.
