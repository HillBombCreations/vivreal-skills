---
description: Draft one help.vivreal.io article, verify-first, filing every disagreement between the product and the plan as a defect
argument-hint: the article key (A1 to A29) or a site-refresh plan or tracker row, for example A3, or "3.1 selling with Stripe"
---

Draft the help site article: $ARGUMENTS

If that is empty, ask which article: a key from plan section 3 of
`docs/projects/help-site-plan/plan.md`, or a row of `docs/projects/site-refresh-after-v5/plan.md`
section 3 or its closeout tracker. Do not pick one. Pass the named rows through in the dispatch:
the dispatch prompt plus those rows is the agent's spec.

Dispatch the `help-page-producer` agent (run_in_background: false), at most 3 at
once. It owns the whole loop for one article: read the article's block in the plan,
verify every claim against the running portal in the installed-app view, file every
disagreement as a defect, and write `knowledge/help-drafts/<article-key>.md` (one
block per band, plan anchors only, media slots left as placeholders) plus
`<article-key>.defects.md`, then run the voice gate.

Relay its report table in full, and lead with three things:

1. **Live text to take down**, if any. That is a main session write and comes first.
2. **Defects found.** That is the reason the run was worth doing, and a run with zero
   findings is a signal something went unverified.
3. **BLOCKED bands**, by defect number. They are not written and not linked.

Remind the user the draft is not published: the main session publishes it through
its own runners, then runs the live checker before any anchor joins the portal
registry. Nothing is committed or pushed.
