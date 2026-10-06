---
description: Draft a LinkedIn post in Justin's founder voice, vertical video or PDF carousel (records footage first if needed)
argument-hint: topic, e.g. the publish-once story | add "carousel" to force PDF mode
---

Produce a LinkedIn draft about: $ARGUMENTS

You are the top-level session, so run the two-step flow yourself:

1. **Coverage check.** Read every `content/footage/*/footage-manifest.json`. If the
   job needs video and no session covers the topic, dispatch the `footage-recorder`
   agent (run_in_background: false) and wait. On `auth_expired`, stop and show the
   user the refresh command. (A carousel-only job needs no footage.)
2. **Edit.** Dispatch the `linkedin-editor` agent with the topic, the mode
   (video by default; pdf-carousel if the prompt says carousel/checklist/step-by-step),
   and `outputRoot: content/social/<today>-<slug>/`.
3. Relay the editor's summary: asset path, the first-210-characters hook, self-check
   result, and any "Verify before posting" items. Never publish anything.
