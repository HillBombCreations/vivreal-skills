# Docs-sync log

One row per sync of the vivreal-skills docs against the source repos. The `/skills-sync` command reads the **latest date in this table** as the baseline for its drift audit. Add a row every time a sync lands.

| Date | Skills commit | Scope |
|---|---|---|
| 2026-06-24 | 4c5698a | Expert/knowledge/infra docs synced to code; promptify shipped |
| 2026-07-13 | (this sync) | Full sync: 8 source-repo CLAUDE.mds refreshed (Outreach CLAUDE.md created); portal/outreach/secure/cms/main/client/renderer/templates docs updated; 4 new knowledge skills (analytics, outreach-mcp, content, migrator); brand-voice merged with vivreal-content 01-voice-and-rules (canonical); prompt playbook +2 scenarios; proxy-factory manual allowlist 18→28; /skills-sync guardrail added |
| 2026-07-15 | (this sync) | Targeted branch-model sweep after site-provisioning Phase 2 shipped: per-site branches → shared `stable` channel + promote-stable release workflow. Updated: site-deploy-pipeline, deploy-tracker, deploy-nudge hook, eventhandler-knowledge, templates-knowledge, renderer-knowledge, vivreal-sites (+2 refs), experts event-handler (agent+skill). `sync_conflict`/`templateSyncWebhook`/auto-sync references marked dead |
| 2026-07-21 | (this sync) | Full sync after ~360-commit drift burst (tier-quotas v3.0.0 sentinel scheme + overage billing; client.vivreal.io CloudFront edge CDN; migrator `/template` identity-kit pipeline + 3 new agents; analytics LIVE; outreach prospects store). Counts re-verified: portal 165→180 routes (149+31), Secure 11→12 Lambdas, EventHandler →27, CMS MCP ~72→69 tools, Outreach MCP 50→58, renderer 1.29.3→1.35.1, schemas →1.25.0. All experts + knowledge skills re-stamped; shared-standards repo/Lambda/secrets tables rewritten (hb-api-secrets retired → vivreal/prod/*); proxy-guard manual allowlist 28→31; playbook + trigger row for `/template`. BUGFIX: `vivreal-writing-plans`/`vivreal-brainstorming`/`vivreal-subagent-driven` invocation references now plugin-qualified (`vivreal-workflow:` prefix) — bare names return "Unknown skill". Same-day follow-up: all 8 stale source CLAUDE.mds refreshed and pushed (Portal 84d20c2, Secure d20cd14, renderer d2c282b, CMS 0502a91, Client 7323e7b, Main 0deae94, EventHandler 4b110ed, Templates branch-model 5595b5e); skills-doc staleness caveats swept to "refreshed 2026-07-21"; corrections: flat `siteData.motionPreset`, EventHandler 27 = 11+1+9+6. Still no CLAUDE.md (intentional, README/docs are truth): Outreach API, Analytics, Schemas, Migrator. Known-thin: CMS CLAUDE.md Routes list |

## Conventions established 2026-07-13

- Every expert agent + knowledge skill that embeds source-repo facts carries a `Last synced: YYYY-MM-DD` line near the top of its body.
- Expert/knowledge docs cite **function/route/file names, not line numbers** — `src/foo.js:123` citations rot within weeks; `findEnrollmentByMessageRefs` doesn't.
- The canonical brand-voice source is `C:\repos\vivreal-content\knowledge\01-voice-and-rules.md`; the `vivreal-brand-voice` skill mirrors it.
