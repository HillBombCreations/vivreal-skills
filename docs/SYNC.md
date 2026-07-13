# Docs-sync log

One row per sync of the vivreal-skills docs against the source repos. The `/skills-sync` command reads the **latest date in this table** as the baseline for its drift audit. Add a row every time a sync lands.

| Date | Skills commit | Scope |
|---|---|---|
| 2026-06-24 | 4c5698a | Expert/knowledge/infra docs synced to code; promptify shipped |
| 2026-07-13 | (this sync) | Full sync: 8 source-repo CLAUDE.mds refreshed (Outreach CLAUDE.md created); portal/outreach/secure/cms/main/client/renderer/templates docs updated; 4 new knowledge skills (analytics, outreach-mcp, content, migrator); brand-voice merged with vivreal-content 01-voice-and-rules (canonical); prompt playbook +2 scenarios; proxy-factory manual allowlist 18→28; /skills-sync guardrail added |

## Conventions established 2026-07-13

- Every expert agent + knowledge skill that embeds source-repo facts carries a `Last synced: YYYY-MM-DD` line near the top of its body.
- Expert/knowledge docs cite **function/route/file names, not line numbers** — `src/foo.js:123` citations rot within weeks; `findEnrollmentByMessageRefs` doesn't.
- The canonical brand-voice source is `C:\repos\vivreal-content\knowledge\01-voice-and-rules.md`; the `vivreal-brand-voice` skill mirrors it.
