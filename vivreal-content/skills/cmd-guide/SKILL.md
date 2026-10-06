---
description: Turn footage into a guide draft (blog or docs), or fill an existing draft's screenshot slots, stops at a voice-checked draft
argument-hint: fill-slots knowledge/draft-for-restaurants.md [session], new-draft 20 content/footage/<session>, or new-draft docs <backlog item> [session]
---

Produce or unblock a guide: $ARGUMENTS

Dispatch the `guide-writer` agent (run_in_background: false) with the mode,
destination (`blog` default; `docs` when the arguments say docs or the topic
is help-centre content), draft/brief, and session from the arguments, and
relay its JSON result: destination, draft path, slots filled, voice-check
verdict, status. On `needs_footage`, show the per-slot shot specs it returns
and offer to run `/record` with them.

Remind the user of the remaining manual steps from its notes, which differ by
destination. Blog: push the landing repo, seed via MCP with the full
objectValue, record the Object ID in the calendar. Docs: review the branch in
`C:/repos/Vivreal_Docs` (page, meta.json, images, regenerated artifacts),
then commit, push, and open the PR, no CMS step.
