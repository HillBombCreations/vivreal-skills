---
name: vivreal-agent-knowledge
description: Use when working on the Vivreal AI agent surface — the cross-repo assistant spanning the portal (global AI FAB, AgentDrawer, Studio AiRail, EditPlan drafts) and VR_Secure_API's agent Lambda (intent router, model routing, tool policy, proposeSiteEdits, progress ticker). Covers the access-gating chain (featureFlags.aiActionsEnabled → login payload → useAgentAccess), the tier gates (agentActions quota + aiSiteEditing/aiComponentGen capability flags, tier-quotas 3.1.0), the EditPlan digest contract, and why there is no token streaming. Triggers on: AI agent, agent drawer, AI FAB, AiRail, useAgentAccess, EditPlan, proposeSiteEdits, agent/execute, agentProgress, agentActions quota, aiActionsEnabled, aiSiteEditing, aiComponentGen, intent router, agent capability gating, "AI assistant not showing". Sources of truth: Vivreal_Portal_Mobile (src/components/Agent/, src/contexts/AgentContext.tsx, src/hooks/use-agent-access.ts) + VR_Secure_API (src/agent/).
---

# Vivreal AI agent — cross-repo knowledge digest

Last synced: 2026-07-30

The AI assistant is ONE feature spanning two repos: the **portal** owns every entry point and the draft/EditPlan UX; **VR_Secure_API's `agent` Lambda** owns classification, model routing, tool policy, and execution. Shipped dark behind a feature flag in July 2026.

## The access-gating chain (the #1 "it's invisible" debug path)

1. **`group.featureFlags.aiActionsEnabled`** — the ONLY live feature flag; written exclusively by Vivreal operators at the portal's `/admin/flags` (`requireGlobalAdmin` in VR_Secure_API's `updateFeatureFlags.js`; `ALLOWED_FLAGS = ['aiActionsEnabled']`). Declared in schemas 1.29.0 (`strict:false` sub-schema).
2. **The login payload** — VR_Main_API's `handleSettingUpGroups` must serialize `featureFlags` into the login group payload. It once didn't: `AuthContext.groups` arrived with `featureFlags` undefined and **every client gate evaluated false — the assistant was invisible to every group, including Mongo-enabled ones**. Both projections (`userLoginService` + `userLoginSSO`) now carry it. If the FAB is missing for an enabled group, check this seam first.
3. **`useAgentAccess()`** (`src/hooks/use-agent-access.ts`) — the SINGLE portal gate. Consumers render `null` unless `ready && hasAccess`: entry points **hide, never disable**, and never re-derive access inline. Absence of AI in a group's UI is the expected default, not a bug.
4. **Tier gates (tier-quotas 3.1.0)** — two dimensions: the metered **`agentActions` quota** (free 0 = truly denied, basic 50, pro 500, proplus 500, enterprise -1) AND the binary **capability flags** `aiSiteEditing` (pro+) / `aiComponentGen` (proplus+), read via `TIER_FLAGS` + `lowestTierWithFlag()`. The Secure agent's `tools/policy.js` derives each tool's `requiredTier` from `TIER_FLAGS` — never hardcoded.

## Portal surfaces

- One `AgentContext` (`src/contexts/AgentContext.tsx`), two surfaces: the global **`AgentFab` → `AgentDrawer`** on every non-immersive `(app)` page, and the Studio **`LeftRail/AiRail.tsx`** (Sparkles button + `?drawer=ai` deep link). The FAB additionally hides on immersive routes (`isImmersiveRoute()` — Studio owns its own rail) and while the drawer is open. The per-page `AgentTriggerButton` is retired.
- `/agent` is a usage + history page (`TasksPage/{Client,Loader}`), NOT a chat — it routes through the same `useAgentAccess()` gate.
- Components: `AgentDrawer/` (`ChatInput`, `MessageBubble`, `QuotaIndicator`, `ToolCallLog`), `StatusTicker.tsx`, `ConfirmationCard.tsx`. `AgentDrawer`'s `SiteHandoffCard` fetches the site list itself via `GET /api/proxy/sites/get` (AuthContext caches no sites).
- Backend call: `POST /api/proxy/agent/execute` (factory route). Progress arrives on the **`agentProgress` socket channel** → `StatusTicker` — a phrase-per-phase ticker (4 beats: pre-classifier / intent-specific / per-tool-call / post-tool-results), phrases never name a tool. **No token streaming in v1** — the Lambda sits behind REST API Gateway, which buffers.

## EditPlan (Studio draft edits)

- **Hashing is portal-only.** `baseDigest` is the request's `draftDigest.hash` echoed back VERBATIM by the backend (`proposeSiteEdits` Joi treats `catalog`/`draftDigest` as OPTIONAL — confirmation rounds send neither). Recomputing the digest JS-side permanently lights the staleness banner.
- Digest-guarded draft apply: validate → apply → digest; zero-token edits apply deterministically without a model call.

## Secure agent Lambda (`src/agent/`)

- **`router.js`** — one forced-tool Haiku classification per user turn (`cache_control` on the static prefix, `maxRetries 0`); **fails OPEN** to `{question, complex, siteId:null}` so a classifier outage can't break a conversation. Model routing via `AnthropicModelOverride`/`AnthropicModelFast`/`AnthropicModelComplex` (cloudformation/base.yaml → agent.yaml).
- **`transcript.js`** — `normalizeHistory` (shifts leading assistant entries, merges same-role runs, drops trailing user) + `composeTurnMessages`. `<group_context>` stays in the **USER** role with its `cache_control` — moving it to system would break the audited C4 injection control.
- **`tools/policy.js`** — capability per tool via tier-quotas `TIER_FLAGS`, checked at definition time AND in `executeTool`; `v1Disabled` on `writeSiteFile` ONLY (`triggerSiteDeploy` stays live).
- **`siteComposeTools.js`** — reuse-first `matchCatalogComponents` (deterministic total ordering over the REQUEST-supplied catalog), `getDraftOutline`, `proposeSiteEdits`. Zero matches → logs `{event:'agent.catalogGap'}` + graceful decline. **No codegen path in v1.**
- **`getAgentContext`** uses intent-scoped query projections, and **every group projection carries `dbKey`** (sticky-routing rule — a projection without it silently falls back to the tier mapping).

## Cost / quota framing

Agent actions are metered against `agentActions` with the spending-cap/overage machinery (see `vivreal-unit-economics`). Pro vs Pro Plus AI differentiation is the capability flags, not the quota (both 500): `aiComponentGen` is Pro Plus+.

## Companions

- `vivreal-portal-knowledge` — the portal-side proxy/auth conventions around these surfaces.
- `vivreal-secure-api-knowledge` — the full Secure Lambda roster the agent Lambda lives in.
- `vivreal-unit-economics` / `finance-auditor` — the margin math behind agentActions quotas and caps.
