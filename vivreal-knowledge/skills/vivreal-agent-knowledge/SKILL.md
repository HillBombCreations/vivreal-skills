---
name: vivreal-agent-knowledge
description: 'Use when working on the Vivreal AI agent surface, the cross-repo assistant that is now RETIRED everywhere except the Studio AiRail (the global AI FAB, its drawer and the /agent page were deleted 2026-09-24; the Studio rail retirement is decided, not built), spanning the portal (Studio AiRail, EditPlan drafts) and VR_Secure_API''s agent Lambda (intent router, model routing, tool policy, proposeSiteEdits, progress ticker). Covers the access-gating chain (featureFlags.aiActionsEnabled → login payload → useAgentAccess), the tier gates (agentActions quota + aiSiteEditing/aiComponentGen capability flags, tier-quotas), the EditPlan digest contract, and why there is no token streaming. Triggers on: AI agent, agent drawer, AI FAB, AI assistant retired, AiRail, useAgentAccess, EditPlan, proposeSiteEdits, agent/execute, agentProgress, agentActions quota, aiActionsEnabled, aiSiteEditing, aiComponentGen, intent router, agent capability gating, "AI assistant not showing". Sources of truth: Vivreal_Portal_Mobile (src/components/Agent/, src/contexts/AgentContext.tsx, src/hooks/use-agent-access.ts) + VR_Secure_API (src/agent/).'
---

# Vivreal AI agent: cross-repo knowledge digest

Last synced: 2026-10-04

**The assistant is RETIRED (2026-09-24, portal `939c27ed`).** The floating button (`Agent/AgentFab`), the drawer shell (`Agent/AgentDrawer/index.tsx`), the `/agent` usage page (`(app)/agent/*`, `Agent/TasksPage`) and their proxy matcher lines are deleted, and `aiActionsEnabled` is cleared on every business, so those entry points had already painted for nobody. **What survives, on purpose:** the Studio `LeftRail/AiRail.tsx` panel, the `AgentContext` provider it reads through `useAgentAccess()` (pulling the provider throws on every Studio render, `(app)/layout.tsx:57-69`), and `POST /api/proxy/agent/execute` with its rate-limit matcher line. Retiring the Studio rail is DECIDED and NOT BUILT (vivreal-hq `docs/projects/shipped-ledger.md`, "Not shipped"). Treat "the assistant is not showing" as the expected state, not a bug.

The assistant was ONE feature spanning two repos: the **portal** owned every entry point and the draft/EditPlan UX; **VR_Secure_API's `agent` Lambda** owns classification, model routing, tool policy, and execution. Shipped dark behind a feature flag in July 2026.

## The access-gating chain (the #1 "it's invisible" debug path)

1. **`group.featureFlags.aiActionsEnabled`**, written exclusively by Vivreal operators (`requireGlobalAdmin` in VR_Secure_API's `updateFeatureFlags.js`; `ALLOWED_FLAGS` is `['aiActionsEnabled', 'dashboardInsightsEnabled', 'navRedesignEnabled']` at `src/updateGroup/services/updateFeatureFlags.js:38`). **The portal's `/admin/flags` console is DELETED** (2026-09-28, `5ac18a32`, internal-admin-app phase 6); the console now lives in the internal admin app, `vivreal-hq/packages/admin-app` (`src/app/flags`, `src/app/api/flags/route.ts`), which writes the same `PUT /api/group/featureFlags`. Declared in schemas 1.29.0 (`strict:false` sub-schema).
2. **The login payload**, VR_Main_API's `handleSettingUpGroups` must serialize `featureFlags` into the login group payload. It once didn't: `AuthContext.groups` arrived with `featureFlags` undefined and **every client gate evaluated false, the assistant was invisible to every group, including Mongo-enabled ones**. Both projections (`userLoginService` + `userLoginSSO`) now carry it. If the FAB is missing for an enabled group, check this seam first.
3. **`useAgentAccess()`** (`src/hooks/use-agent-access.ts`), the SINGLE portal gate. Consumers render `null` unless `ready && hasAccess`: entry points **hide, never disable**, and never re-derive access inline. Absence of AI in a group's UI is the expected default, not a bug.
4. **Tier gates.** Two dimensions: the metered `agentActions` quota, and the binary capability flags `aiSiteEditing` / `aiComponentGen`, read through `TIER_FLAGS` and `lowestTierWithFlag()`. The Secure agent policy derives each tool requiredTier from `TIER_FLAGS`, never a hardcoded ladder. **Read the current numbers from `Vivreal-Tier-Quotas` `src/tierQuotas.ts` before asserting any of them.** They have moved by whole orders of magnitude, one tier has been retired outright, and an allowance that reads as generous in any copy of this file can be zero in the package.

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
- **`getAgentContext`** uses intent-scoped query projections, and **every group projection carries `dbKey`** (a projection without `dbKey` makes `resolvePlacement` THROW, which is the point: it fails loudly rather than rerouting the tenant).

## Cost / quota framing

Agent actions are metered against `agentActions` with the spending-cap and overage machinery (see `vivreal-unit-economics`). What separates the paid plans is the capability flags rather than the quota. **Check the live values before telling anyone what they get.** A refusal message that names a remedy which does not exist is worse than no message, and that has shipped.

## Companions

- `vivreal-portal-knowledge`, the portal-side proxy/auth conventions around these surfaces.
- `vivreal-secure-api-knowledge`, the full Secure Lambda roster the agent Lambda lives in.
- `vivreal-unit-economics` / `finance-auditor`, the margin math behind agentActions quotas and caps.
