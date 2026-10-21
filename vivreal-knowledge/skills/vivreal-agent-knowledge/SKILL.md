---
name: vivreal-agent-knowledge
description: 'Use when working on, writing about, or debugging Vivreal AI. The AI offering is connecting an AI agent through the Vivreal MCP server (VR-MCP-Server, plan flag mcpAccess, metered in mcpToolCalls), and nothing else: the in-app assistant is RETIRED (owner 2026-10-07, agentActions 0 on every tier; the global FAB, drawer and /agent page were deleted 2026-09-24) and only dead code survives in the portal (Studio AiRail, EditPlan) and VR_Secure_API''s agent Lambda. Covers the copy rule ("AI agent", never assistant or a model name), the real gates, and the retired surface''s archaeology. Triggers on: AI agent, MCP, connect an AI agent, AI assistant, AI assistant not showing, agentActions, aiActionsEnabled, aiSiteEditing, aiComponentGen, mcpAccess, mcpToolCalls, AiRail, useAgentAccess, EditPlan, proposeSiteEdits, agent/execute, agentProgress. Sources: VR-MCP-Server, Vivreal-Tier-Quotas src/tierQuotas.ts.'
---

# Vivreal AI agent: cross-repo knowledge digest

Last synced: 2026-10-21 (VR-MCP-Server `origin/main` 3285303, portal `origin/stable` v0.37.1, Secure `origin/stable` v2.22.5)

## Read this first: AI is the MCP server, and only the MCP server

**Owner, 2026-10-07: "The AI actions isnt used any more ... we use the mcp only."** The Vivreal AI offering is an owner connecting an AI agent to their business through **VR-MCP-Server** (`vivreal-mcp-server-knowledge`; operating it is the `vivreal-cms` skill). Its gates are the `mcpAccess` plan flag (`canUseMcp`, read which plans carry it from `src/tierQuotas.ts`), the `mcpToolCalls` allowance (a hard stop), and the per-connection area grants the owner chooses on Allow access.

- **`agentActions` is `0` on every tier because the in-app feature is gone**, not because something is waiting to ship. `aiSiteEditing` / `aiComponentGen` still read true on some tiers; they gate dead code. Do not claim either as a feature, and do not file `agentActions: 0` as a gap.
- **Copy rule (owner 2026-10-08):** in plans, help, the portal and marketing it is **"an AI agent"** ("connect an AI agent to run Vivreal for you"). Never "AI assistant" (retired term) and never a model or vendor name. Pairs with `brand/voice.md` (`vivreal-brand-voice`).
- **Everything below is archaeology**, kept because the code still deploys and a grep will find it.

## The retired in-app assistant

**Retired 2026-09-24 (portal `939c27ed`).** The floating button (`Agent/AgentFab`), the drawer shell (`Agent/AgentDrawer/index.tsx`), the `/agent` usage page (`(app)/agent/*`, `Agent/TasksPage`) and their proxy matcher lines are deleted, and `aiActionsEnabled` is cleared on every business, so those entry points had already painted for nobody. **What survives, on purpose:** the Studio `LeftRail/AiRail.tsx` panel, the `AgentContext` provider it reads through `useAgentAccess()` (pulling the provider throws on every Studio render, `(app)/layout.tsx:57-69`), and `POST /api/proxy/agent/execute` with its rate-limit matcher line. Retiring the Studio rail's code is DECIDED and NOT BUILT (vivreal-hq `docs/projects/shipped-ledger.md`, "Not shipped"). Treat "the assistant is not showing" as the expected state, not a bug.

The assistant was ONE feature spanning two repos: the **portal** owned every entry point and the draft/EditPlan UX; **VR_Secure_API's `agent` Lambda** owns classification, model routing, tool policy, and execution. Shipped dark behind a feature flag in July 2026.

## The access-gating chain (the #1 "it's invisible" debug path)

1. **`group.featureFlags.aiActionsEnabled`**, written exclusively by Vivreal operators (`requireGlobalAdmin` in VR_Secure_API's `updateFeatureFlags.js`; read `ALLOWED_FLAGS` there, four flags as of v6). **The portal's `/admin/flags` console is DELETED** (2026-09-28, `5ac18a32`, internal-admin-app phase 6); the console now lives in the internal admin app, `vivreal-hq/packages/admin-app` (`src/app/flags`, `src/app/api/flags/route.ts`), which writes the same `PUT /api/group/featureFlags`. Declared as a `strict:false` sub-schema.
2. **The login payload**, VR_Main_API's `handleSettingUpGroups` must serialize `featureFlags` into the login group payload. It once didn't: `AuthContext.groups` arrived with `featureFlags` undefined and **every client gate evaluated false, the assistant was invisible to every group, including Mongo-enabled ones**. Both projections (`userLoginService` + `userLoginSSO`) now carry it. If the FAB is missing for an enabled group, check this seam first.
3. **`useAgentAccess()`** (`src/hooks/use-agent-access.ts`), the SINGLE portal gate. Consumers render `null` unless `ready && hasAccess`: entry points **hide, never disable**, and never re-derive access inline. Absence of AI in a group's UI is the expected default, not a bug.
4. **Tier gates (now closed on every tier).** Two dimensions: the metered `agentActions` quota (`0` everywhere), and the binary capability flags `aiSiteEditing` / `aiComponentGen`, read through `TIER_FLAGS` and `lowestTierWithFlag()`. The Secure agent policy derives each tool requiredTier from `TIER_FLAGS`, never a hardcoded ladder. **Read the current numbers from `Vivreal-Tier-Quotas` `src/tierQuotas.ts` before asserting any of them.** They have moved by whole orders of magnitude, one tier has been retired outright, and an allowance that reads as generous in any copy of this file can be zero in the package.

## Portal surfaces

- One `AgentContext` (`src/contexts/AgentContext.tsx`), ONE remaining surface: the Studio **`LeftRail/AiRail.tsx`**. The global `AgentFab`, the drawer shell and the `/agent` page are gone (see the top of this file); the per-page `AgentTriggerButton` was retired before them.
- Components still present under `src/components/Agent/`: the `AgentDrawer/` parts the rail reuses (`ChatInput`, `MessageBubble`, `ToolCallLog`, `assistantProse`), `ConfirmationCard.tsx`, `SuggestedActions.tsx`. Confirm a file exists on `origin/stable` before citing it.
- Backend call: `POST /api/proxy/agent/execute` (factory route). Progress arrives on the **`agentProgress` socket channel** → `StatusTicker`, a phrase-per-phase ticker (4 beats: pre-classifier / intent-specific / per-tool-call / post-tool-results), phrases never name a tool. **No token streaming in v1**, the Lambda sits behind REST API Gateway, which buffers.

## EditPlan (Studio draft edits)

- **Hashing is portal-only.** `baseDigest` is the request's `draftDigest.hash` echoed back VERBATIM by the backend (`proposeSiteEdits` Joi treats `catalog`/`draftDigest` as OPTIONAL, confirmation rounds send neither). Recomputing the digest JS-side permanently lights the staleness banner.
- Digest-guarded draft apply: validate → apply → digest; zero-token edits apply deterministically without a model call.

## Secure agent Lambda (`src/agent/`)

- **`router.js`**, one forced-tool Haiku classification per user turn (`cache_control` on the static prefix, `maxRetries 0`); **fails OPEN** to `{question, complex, siteId:null}` so a classifier outage can't break a conversation. Model routing via `AnthropicModelOverride`/`AnthropicModelFast`/`AnthropicModelComplex` (cloudformation/base.yaml → agent.yaml).
- **`transcript.js`**, `normalizeHistory` (shifts leading assistant entries, merges same-role runs, drops trailing user) + `composeTurnMessages`. `<group_context>` stays in the **USER** role with its `cache_control`, moving it to system would break the audited C4 injection control.
- **`tools/policy.js`**, capability per tool via tier-quotas `TIER_FLAGS`, checked at definition time AND in `executeTool`; `v1Disabled` on `writeSiteFile` ONLY (`triggerSiteDeploy` stays live).
- **`siteComposeTools.js`**, reuse-first `matchCatalogComponents` (deterministic total ordering over the REQUEST-supplied catalog), `getDraftOutline`, `proposeSiteEdits`. Zero matches → logs `{event:'agent.catalogGap'}` + graceful decline. **No codegen path in v1.**
- **The agent's `updateCollectionObject` MERGES** a partial value onto the stored one (`mergeObjectValue` in `src/agent/services/tools/collectionObjectTools.js`: top-level keys, `null` clears, no `__proto__`, no `_system`). It is unreachable today, because `agentActions` is 0 on every tier.
- **A rename through the agent's site tools or MCP `update-site`** goes through VR_Secure_API's `renameIdentity.js`, so kit-shaped page titles and an exactly matching sender name follow the new name (`vivreal-product-rules`).
- **`getAgentContext`** uses intent-scoped query projections, and **every group projection carries `dbKey`** (a projection without `dbKey` makes `resolvePlacement` THROW, which is the point: it fails loudly rather than rerouting the tenant).

## Cost / quota framing

The cost line for AI is MCP tool calls (`mcpToolCalls`, no overage rate), not agent actions. `agentActions` overage machinery still exists in the package and the Secure billing code, metering nothing. **Check the live values in `src/tierQuotas.ts` before telling anyone what a plan includes.**

## Companions

- `vivreal-mcp-server-knowledge` and `vivreal-cms`, the live AI offering.
- `vivreal-portal-knowledge`, the portal-side proxy/auth conventions around these surfaces, and the Allow access screen.
- `vivreal-secure-api-knowledge`, the full Secure Lambda roster the agent Lambda lives in.
- `vivreal-unit-economics` / `finance-auditor`, the margin math behind the MCP allowance.
