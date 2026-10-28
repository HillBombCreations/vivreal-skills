---
description: Film once, edit for every platform, coordinates footage-recorder plus the TikTok, Instagram, and LinkedIn editors
argument-hint: topic [--platforms=tiktok,instagram,linkedin] [--row=<calendar>.md:<id>] [--week=<YYYY-Www>]
---

Run the full social-video batch flow for: $ARGUMENTS

Dispatch the `social-video-director` agent (run_in_background: false) with the topic and
any `--platforms`, `--row`, or `--week` flag from the arguments. Pass them through as
written; the director's Modes table already defines each one.

It owns the whole playbook: the footage coverage check and reuse, the blocking
`footage-recorder` run, the parallel editor fan-out, the `REVIEW.md` roll-up, and the
single repurpose-tracker write. Do not re-implement any of those steps here, and do not
dispatch the editors yourself. One playbook, in one file, is the point.

Then relay what comes back:

- **Success.** Print the director's summary line verbatim (it already carries the asset
  count, the footage session and whether it was reused, per-platform duration and status,
  and the review folder path). Add the "Verify before posting" items from the rolled-up
  `REVIEW.md` and the review folder path as a clickable line. Never publish anything.
- **`auth_expired`.** The demo-tenant session timed out and nothing was recorded. Stop and
  show the user the refresh command the recorder returned.
- **A topic that failed or was blocked.** The director continues other topics and notes the
  failure. Surface which topic failed and why; do not silently report a partial batch as a
  clean run.
- **`"degraded":"inline-sequential"` in the notes.** The director found no `Agent` tool and
  did the work itself, one platform at a time. The output is still valid. Mention it, since
  it means the run was slower than it should have been and is worth a look.

Before 2026-08-06 this command inlined the director's playbook instead of dispatching it,
because the director's own file wrongly claimed subagents cannot spawn subagents. They can,
within the configured nesting depth, so main → director → editors → footage-recorder fits.
Dispatching keeps the playbook in one place.
