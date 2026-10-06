---
description: Draft a TikTok video about a topic (records portal footage first if the library lacks coverage)
argument-hint: topic or vibe, e.g. funny take on the content calendar
---

Produce a TikTok draft about: $ARGUMENTS

You are the top-level session, so run the two-step flow yourself:

1. **Coverage check.** Read every `content/footage/*/footage-manifest.json`. If no
   session's clips (`visible`/`action`/`pageKey`) cover the topic, dispatch the
   `footage-recorder` agent (Agent tool, run_in_background: false) with the topic and
   wait for its JSON result. On `auth_expired`, stop and show the user the refresh
   command it returns.
2. **Edit.** Dispatch the `short-form-editor` agent with a job block:
   `{"platform":"tiktok","topic":"$ARGUMENTS","source":"direct-prompt","audioMode":"captions-only","styleDna":"auto","outputRoot":"content/social/<today>-<slug>/"}`
   (pick audioMode `tts` instead if the user asked for narration).
3. Relay the editor's summary: asset path, duration, self-check result, and any
   "Verify before posting" items. Never publish anything.
