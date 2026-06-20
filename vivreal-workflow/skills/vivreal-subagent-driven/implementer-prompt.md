# Implementer (coder) Dispatch Template

Use this when dispatching a `coder` subagent to implement one task. Fill every
placeholder. Hand requirements over as the brief file — do not paste the plan.

```
Agent tool:
  subagent_type: coder
  description: "Implement Task N: [task name]"
  model: [MODEL — REQUIRED: haiku for transcription / single-file mechanical,
          sonnet for prose-spec or multi-file, opus for judgment. An omitted
          model silently inherits the session's most expensive one.]
  prompt: |
    Read the `shared-standards` skill FIRST, then [REPO]/CLAUDE.md. You are
    implementing Task N of an approved Vivreal plan.

    ## Task description
    Read your task brief first — it is your requirements, with the exact values
    to use verbatim: [BRIEF_FILE]  (docs/projects/<slug>/task-N-brief.md)

    ## Context
    [Scene-setting: where this task fits in the project, dependencies, and the
    interfaces/decisions from earlier tasks that the brief cannot know — exact
    signatures, names, and types neighboring tasks rely on. Plus your resolution
    of any ambiguity you spotted in the brief.]

    ## Before you begin
    If anything about the requirements, approach, dependencies, or acceptance
    criteria is unclear — ask now, before starting. Don't guess.

    ## Your job
    1. Implement exactly what the task specifies — nothing more (YAGNI).
    2. Write tests (follow TDD if the task says to). Test real behavior, not mocks.
    3. Verify it works. While iterating, run the focused test for what you're
       changing; run the full suite once before committing, not after every edit.
    4. Run `npm run lint`; run `npm run build` if you touched TS or Next config.
    5. Commit your work (frequent, focused commits).
    6. Self-review (below), then report back.

    Work from: [DIRECTORY]

    ## Vivreal conventions (non-negotiable — see shared-standards)
    - Proxy routes: use the `createProxyHandler` factory unless the route sets
      cookies; `createAuthAxios` for authed calls, `publicAxios` for public.
    - Media: signed URLs via `/api/proxy/get-media` — never raw bucket URLs.
    - Multi-tenancy: scope every query by the active context (dbKey/groupID);
      never leak across tenants.
    - Follow existing patterns in the files you touch. Improve code you're
      touching the way a good engineer would, but don't restructure outside your
      task. If a file you're creating grows beyond the plan's intent, stop and
      report DONE_WITH_CONCERNS — don't split files on your own.

    ## When you're in over your head
    It is always OK to stop and say "this is too hard." Bad work is worse than no
    work — you will not be penalized for escalating. STOP and report BLOCKED or
    NEEDS_CONTEXT when the task needs architectural decisions with multiple valid
    approaches, you can't find the clarity you need, or you're reading file after
    file without progress. Say specifically what you're stuck on and what help
    you need.

    ## Self-review before reporting (fresh eyes)
    - Completeness: every requirement implemented? edge cases handled?
    - Quality: clear names (match what things do)? clean and maintainable?
    - Discipline: only what was requested (YAGNI)? followed existing patterns?
    - Testing: tests verify behavior not mocks? TDD evidence if required? output
      pristine (no stray warnings)?
    Fix anything you find now, before reporting.

    ## After review findings (fix mode)
    If the reviewer returns issues and you fix them, re-run the tests covering the
    amended code and append the results to your report file — reviewers will not
    re-run tests for you; your report is the test evidence.

    ## Report format
    Write your FULL report to [REPORT_FILE] (docs/projects/<slug>/task-N-report.md):
    what you implemented, what you tested + results, TDD evidence (RED command +
    failing output and why expected; GREEN command + passing output) if TDD was
    required, files changed, self-review findings, concerns.

    Then return ONLY (under 15 lines — detail lives in the report file):
    - Status: DONE | DONE_WITH_CONCERNS | BLOCKED | NEEDS_CONTEXT
    - Commits created (short SHA + subject)
    - One-line test summary (e.g. "14/14 passing, output pristine")
    - lint/build result
    - Concerns, if any
    - The report file path
    If BLOCKED or NEEDS_CONTEXT, put the specifics in this final message — the
    controller acts on it directly.
```

**Placeholders:** `[MODEL]` (required), `[BRIEF_FILE]`, `[REPO]`/`[DIRECTORY]`,
`[REPORT_FILE]`. Exact values, magic strings, signatures, and test cases appear
only in the brief file — never duplicated into this prompt.
