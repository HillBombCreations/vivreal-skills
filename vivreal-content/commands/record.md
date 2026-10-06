---
description: Record portal footage into the shared library (no editing), one session per topic
argument-hint: topic, e.g. the sites studio editing flow
---

Capture a footage session about: $ARGUMENTS

Dispatch the `footage-recorder` agent (run_in_background: false) with the topic and
relay its JSON result: session path, clips captured, status. On `auth_expired`,
show the user the refresh command it returns. Remind the user the session lands in
`content/footage/` and gets reused by every later edit.
