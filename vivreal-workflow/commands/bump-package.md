---
description: Bump a shared dependency across all Vivreal consumer repos (esp. private @hillbombcreations/* GitHub Packages). Dispatches the package-publisher agent, which discovers consumers on GitHub, publishes first when needed, patches each consumer's lockfile surgically and opens the PRs.
argument-hint: <package> [target-version] [<package> [target-version] ...]  e.g. @hillbombcreations/schemas <target-version>
disable-model-invocation: true
---

Dispatch `vivreal-workflow:package-publisher` in the foreground with: **$ARGUMENTS**

If more than one shared package has a pending release, name every package and target version in this one dispatch:
the agent publishes all of them first and runs ONE bump pass, one commit per consumer (owner, 2026-10-19). If no
target version was given, it proposes one from the package's CHANGELOG and confirms with the user.

Relay its report: the registry confirmation, each consumer's resolved pin before and after, the PR URLs, and any
consumer still needing Actions access or a delta review.
