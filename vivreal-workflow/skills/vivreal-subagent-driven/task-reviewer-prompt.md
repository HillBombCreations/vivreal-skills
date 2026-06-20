# Task Reviewer (reviewer) Dispatch Template

Use this when dispatching a `reviewer` subagent to gate ONE task. The reviewer
reads the task's diff package once and returns two verdicts: spec compliance and
code quality. This is a task-scoped gate — the broad 8-dimension whole-branch
review happens separately at the end (dispatch `reviewer` in its standard mode on
the `MERGE_BASE..HEAD` package, `model: opus`).

```
Agent tool:
  subagent_type: reviewer
  description: "Review Task N (spec + quality)"
  model: [MODEL — REQUIRED: scale to the diff. sonnet is the floor; opus for a
          subtle concurrency / security / multi-tenancy change. An omitted model
          silently inherits the session's most expensive one.]
  prompt: |
    Read the `shared-standards` skill FIRST. You are reviewing ONE task's
    implementation: first whether it matches its requirements, then whether it is
    well-built. This is a task-scoped gate, not a merge review.

    ## What was requested
    Read the task brief: [BRIEF_FILE]

    Global constraints from the spec/plan that bind this task (copied verbatim):
    [GLOBAL_CONSTRAINTS]

    ## What the implementer claims they built
    Read the coder's report: [REPORT_FILE]

    ## Diff under review
    Base: [BASE_SHA]   Head: [HEAD_SHA]   Package: [DIFF_FILE]
    Read the diff package once — it has the commit list, stat summary, and full
    diff with context. The context lines ARE the changed files: do not Read a
    changed file separately unless a hunk you must judge is cut off mid-function
    (say so if it is). Do not re-run git or crawl the broader codebase. Inspect
    code outside the diff only to evaluate a concrete risk you can name — one
    focused check per named risk, and name both in your report. Cross-cutting
    changes are legitimate named risks: a change to a proxy contract, a shared
    query helper, lock ordering, or tenant scoping warrants checking call sites.
    Your review is read-only on this checkout — do not mutate the tree, index, or
    HEAD.

    ## Do not trust the report
    Treat the report as unverified claims. Verify them against the diff. A stated
    rationale ("left it per YAGNI", "kept it simple") is the implementer grading
    their own work — it never downgrades a finding's severity.

    ## Tests
    The coder already ran the tests and reported results with TDD evidence for
    exactly this code — do not re-run the suite to confirm. Run a focused test
    only when reading the code raises a specific doubt no existing run answers
    (never a package-wide suite or repeated high-count loop). Warnings/noise in
    the reported output are findings — output should be pristine.

    ## Part 1 — Spec compliance
    Compare the diff against What Was Requested:
    - Missing: requirements skipped or claimed-but-not-implemented.
    - Extra: features not requested, over-engineering, unneeded "nice to haves".
    - Misunderstood: right feature built wrong, or wrong problem solved.
    If a requirement can't be verified from this diff alone (lives in unchanged
    code or spans tasks), report it as a ⚠️ item — don't broaden your search.

    ## Part 2 — Code quality
    - Clean separation of concerns; proper error handling (errors never
      swallowed); DRY without premature abstraction; edge cases handled.
    - Tests verify real behavior (not mocks); the task's edge cases covered.
    - Structure: each file one clear responsibility; units testable
      independently; follows the plan's file structure. Flag only what THIS change
      contributed to file bloat, not pre-existing size.
    - Vivreal fit: proxy-factory usage, `createAuthAxios`/`publicAxios` choice,
      signed-URL media via `/api/proxy/get-media`, multi-tenant query scoping,
      CSRF and hydration conventions — flag any violation with file:line.
    Cite file:line for every finding and for any check you'd otherwise answer with
    a bare "yes". Begin your final message directly with the spec-compliance
    verdict — every line is a verdict, a finding with file:line, or a check you
    ran. No preamble, no process narration.

    ## Calibration
    Categorize by actual severity — not everything is Critical. Important = the
    task can't be trusted until fixed: incorrect/fragile behavior, a missed
    requirement, swallowed errors, tests that assert nothing, verbatim duplication
    of a logic block, a tenant-scoping leak. "Coverage could be broader" and
    polish are Minor. If the plan/brief explicitly mandates something this rubric
    calls a defect, that IS a finding — report it Important, labeled
    plan-mandated; the human decides. Acknowledge what was done well before
    listing issues.

    ## Output format
    ### Spec Compliance
    - ✅ Spec compliant | ❌ Issues found: [missing/extra/misunderstood, file:line]
    - ⚠️ Cannot verify from diff: [what, and what the controller should check]
    ### Strengths
    [specific]
    ### Issues
    #### Critical (Must Fix)
    #### Important (Should Fix)
    #### Minor (Nice to Have)
    For each: file:line, what's wrong, why it matters, how to fix if not obvious.
    ### Assessment
    Task quality: [Approved | Needs fixes]
    Reasoning: [1-2 sentences]
```

**Placeholders:** `[MODEL]` (required), `[BRIEF_FILE]` (same file the coder
worked from), `[GLOBAL_CONSTRAINTS]` (binding requirements copied verbatim from
the plan's Global Constraints — exact values, formats, relationships; NOT process
rules), `[REPORT_FILE]`, `[BASE_SHA]`, `[HEAD_SHA]`, `[DIFF_FILE]` (the package
path you wrote — never enters your context).

A single fix dispatch can address spec gaps and quality findings together;
re-review after fixes covers both verdicts.
