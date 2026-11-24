# Help and marketing pages: drafted during the release, published after its deploy

The main thread's steps for the help site and vivreal.io marketing pages a release makes untrue or
adds (P-post-release-help, as amended by the owners' HELP-MKT-IN-PLAN). The owner, Justin,
2026-11-24T15:00:51Z: "The help and marketing are suppsoed to be apart of the rlease planning ...
Similar to howwe do dev docs an dskills updates after a release to make sure they're all up to date
and accurate we need to do the same for the help site pages and marketing site pages".

## In the plan

Every release plan carries the section "Help and marketing this release makes untrue or adds"
(`vivreal-workflow:vivreal-writing-plans`): one row per public help page and one per vivreal.io
marketing page (home, pricing, features, comparison and the like) that a release change made
untrue, and one per new page a new feature or changed screen needs, each its own row. A release plan
without it goes back (SKILL.md section 1a, item 6).

## During the release: drafting is release work, not after-work

From the plan's approval, each row takes a free slot DURING the release, as the dev docs and skills
passes do (SKILL.md section 2, side work): `vivreal-content:help-page-producer` drafts it against the
approved head (verify-first, one page per run), `vivreal-product:marketing-auditor` voice-passes it,
and the reviewer passes it. Release C drafted only M-09 and M-10 during the release and left 28 help
pages, 3 new pages and M-01 to M-08 for after (L-C-36).

## After the deploy: only the publish

The post-release list (`post-release-list.json`) holds one `HELP:` row per page of either kind,
copied from the plan's section. Each page is published under an owner GO through the producer's
PUBLISH mode, after an ADD in Studio or the content editor for a new page or section. Only the
publish sits on this list: a page for a screen that changes at a deploy publishes after that
deploy, and a row still undrafted at the deploy is a slip to record as a lesson. A draft that finds
the feature off, or not buildable as written, STOPs and becomes a backlog row, never a page
describing what an owner cannot do.

## Every help draft's defects file is triaged the same day (L-B-36)

Each find becomes a backlog row with an owner placement question, or joins its repo's running batch
when it fails a walk row. Help work is a product audit: release B's drafts and the regular-user
question pass found eleven product defects, a lost paid sign-up among them (F537, F539, F540, F542
to F549).
