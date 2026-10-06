---
description: Draft an Instagram Reel about a topic (records portal footage first if the library lacks coverage)
argument-hint: topic or vibe, e.g. how the calendar keeps you organized
---

Produce an Instagram Reel draft about: $ARGUMENTS

You are the top-level session, so run the two-step flow yourself:

1. **Coverage check.** Read every `content/footage/*/footage-manifest.json`. If no
   session covers the topic, dispatch the `footage-recorder` agent
   (run_in_background: false) and wait. On `auth_expired`, stop and show the user
   the refresh command.
2. **Edit.** Dispatch the `short-form-editor` agent with:
   `{"platform":"instagram","topic":"$ARGUMENTS","source":"direct-prompt","audioMode":"captions-only","styleDna":"auto","outputRoot":"content/social/<today>-<slug>/"}`
3. Relay the editor's summary: asset path, duration, self-check result, and any
   "Verify before posting" items. Never publish anything.
