---
description: Turn footage into a blog draft, or fill an existing blog draft's screenshot slots, stops at a voice-checked draft (help articles are /help-page)
argument-hint: fill-slots knowledge/draft-for-restaurants.md [session], or new-draft 20 content/footage/<session>
---

Produce or unblock a guide: $ARGUMENTS

If the topic is a how-to, a feature guide or troubleshooting for existing owners, it is a help
article: offer `/help-page` instead and stop. `guide-writer` is blog only.

Dispatch the `guide-writer` agent (run_in_background: false) with the mode, draft/brief, and
session from the arguments, and relay its JSON result: draft path, slots filled, voice-check
verdict, status. On `needs_footage`, show the per-slot shot specs it returns and offer to run
`/record` with them.

Remind the user of the remaining manual steps from its notes: upload the listed images, publish
the post with the full objectValue, render the cover, record the Object ID in the calendar.
