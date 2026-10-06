---
description: Draft a slide carousel, Instagram PNG set or a LinkedIn PDF document post
argument-hint: topic [--platform=instagram|linkedin] [--slides=N], e.g. the five-tool stack priced --platform=instagram
---

Produce a carousel draft about: $ARGUMENTS

Dispatch the `carousel-editor` agent (run_in_background: false) with a job block:

```json
{"platform":"<instagram|linkedin, default instagram>","topic":"$ARGUMENTS","source":"direct-prompt","outputRoot":"content/social/<today>-<slug>/"}
```

If the topic maps to an expanded calendar row, pass
`"source":"draft-file:content/drafts/<YYYY-Www>/rNN-<platform>.md"` instead so the agent renders
the planner's `| Slide | Show |` table rather than inventing one.

Relay the editor's summary: the asset path, slide count, self-check result, and any
"Verify before posting" items. A `needs_footage` status means a slide wanted a screenshot the
footage library does not have; show the user the recorder prompt it returns and offer `/record`.
Never publish anything.
