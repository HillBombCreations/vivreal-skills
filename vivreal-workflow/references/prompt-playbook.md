# Vivreal Skills — Prompt Playbook

A set of reusable prompt templates for invoking the `vivreal-skills` plugin ecosystem
correctly and getting optimal routing. Copy a template, fill the **[brackets]**, and send.

> This file is the **canonical** playbook. It ships inside the `vivreal-workflow` plugin (at
> `references/prompt-playbook.md`) so the `/promptify` command can read it at runtime, even when the
> plugin is installed in another repo. A human-facing pointer lives at `docs/prompt-playbook.md`.

## How routing actually works

The ecosystem has **three routing layers**. Good prompts exploit them rather than just
saying "use the applicable skills":

1. **Deterministic slash commands** — you type them (`/coordinator`, `/plan`, `/design`,
   `/orchestrate`, `/reviewer`, `/vuln-fix`, `/db-query`, …). Most predictable.
2. **Workflow role-agents** — `researcher` → `architect` → `coder` → `reviewer`, chained
   through artifacts in `docs/bugs/<slug>/` or `docs/projects/<slug>/`.
3. **Auto-invoked specialists** — keyed on **trigger words** (nouns and symptoms), e.g.
   a Sentry ID → `sentry`, `VR_Secure_API` billing → the `secure-api` expert,
   "churn"/"funnel" → `growth-advisor`.

> **"Please use the applicable skills" is a weak trigger.** Auto-invocation keys on
> concrete nouns and symptoms (system names, Sentry IDs, "proxy route", "gross margin"),
> not on meta-instructions. Name the artifacts and the routing falls out.

**Three habits that make every prompt land better:**

1. **Name the repo/system** whenever you know it — strongest single trigger (pulls the right expert).
2. **State the phase you want** — investigate-only, plan-then-stop, or plan-and-implement.
3. **State the definition of done and the approval gate** — "show me the plan first",
   "until the scan is clean", "lint + type-check passes". Turns a vague request into a checkable contract.

---

## 1. Diagnosing and fixing a bug / issue

> I'm hitting this issue: **[describe symptom: what you did, what you expected, what happened]**.
> **[If applicable: Sentry issue ID/URL is `____`; affected group/tenant is `____`; repo/service is `____` (e.g. VR_Secure_API, the portal).]**
> Investigate it end-to-end across the stack, find the root cause (not just the symptom), then write a fix plan and implement it.
> Cite file:line for the root cause, pull Sentry telemetry if a trace ID is given, and run lint + type-check before you call it done. Pause and show me the plan before making changes if the blast radius is non-trivial.

Naming the **Sentry ID** auto-pulls the `sentry` agent; naming the **service** pulls its expert;
"root cause not symptom" + "cite file:line" matches the researcher contract. Deterministic
equivalent: **`/coordinator`** (full bug pipeline with a review gate).

---

## 2. Planning and implementing a new feature

> I want to build this feature: **[what it does, who it's for, the user-visible behavior]**.
> Constraints: **[anything fixed — must reuse X, can't touch Y, tier-gated to Pro, etc.]**.
> First research how similar things work today in **[repo/area]**, then design 2–3 approaches with tradeoffs and recommend one. Once I approve the design, implement it following existing conventions, add tests, and self-review before reporting done.

Maps onto **`/orchestrate`** (investigate → design → approve → implement → review for non-bug
work). For a big feature, type **`/plan`** first (produces `docs/projects/<slug>/{research,plan}.md`),
review it, then **`/implement`**.

---

## 3. Production incident / "what actually happened"

> Something broke in production: **[what the user/customer reported]**.
> **[Sentry issue `____` / it started around `____` / affects group `____`.]**
> Trace the request end-to-end from the telemetry — browser → proxy → backend Lambda → MongoDB → WebSocket — and tell me where it failed and why. If the cause looks like infrastructure (throttling, Atlas saturation, timeouts), confirm it against the live AWS/Atlas metrics.

"Trace end-to-end from telemetry" + a Sentry ID triggers `sentry`; the "if infra, confirm against
live metrics" clause chains into `vivreal-ops`. Automated by **`/sentry-to-aws`**.

---

## 4. Understand a feature / cross-repo data flow

> Explain how **[feature, e.g. "media signing for live sites" or "publish gating"]** works end-to-end. Trace the full path: frontend component → proxy route → backend controller → service → MongoDB. Cite file:line and flag any gotchas or footguns I should know before changing it. Don't edit anything — this is read-only.

"Trace the full path … frontend → proxy → backend → Mongo" + "read-only" is the `fullstack-tracer`
contract. "Don't edit" keeps it in investigation mode.

---

## 5. Architecture / design decision (before any code)

> I need to decide how to build **[X]**: **[the problem and the forces — scale, cost, latency, simplicity]**.
> Give me 2–3 options with explicit tradeoffs and one recommendation. Consider data model, API shape, and migration path. Stop at any judgment call that's really mine to make — don't just pick.

"2–3 options + tradeoffs + one recommendation + stop at judgment calls" is the `principal-architect`
contract. Deterministic equivalent: **`/design`**.

---

## 6. Final review before shipping

> Review this diff before I ship it: **[branch / unstaged changes / PR #]**.
> Go adversarial — correctness, security, performance, multi-tenancy (dbKey/groupID scoping), CSRF, error handling, and edge/failure modes. Rate each finding by severity and explain *why* it matters. Don't approve until the real issues are addressed.

"Adversarial," "rate each finding," "explain why," "don't approve until fixed" maps to
`principal-reviewer` / the workflow `reviewer` (12-point PASS/FAIL gate). Deterministic equivalents:
**`/reviewer`** or **`/bug-review`**.

---

## 7. Database investigation

> In **[which DB/tenant — give the group key or dbKey if you know it]**, I need to **[answer this question / check this data]**: **[the question]**.
> Query MongoDB safely (read-only, tenant-scoped), show me the relevant schema and a sample document, and explain how the collections link if it spans more than one.

Naming the tenant/dbKey is what makes the query safe and correctly scoped — the multi-tenant routing
rule is the #1 footgun. Wrapped by **`/db-query`** and **`/db-schema`**.

---

## 8. Growth / analytics report

> Give me a growth read on **[signups / a specific funnel stage / acquisition channel / churn]** for **[time window]**. Pull real numbers from GA4, PostHog, and MongoDB, cross-reference them, and give week-over-week deltas plus the 2–3 actions that would move the metric most.

Naming the metric + "pull real numbers from GA4/PostHog/Mongo" triggers `growth-advisor`
(quantitative) rather than the strategy-lens `principal-growth-auditor`. Commands:
**`/growth-report`**, **`/funnel-analysis`**.

---

## 9. UX / usability critique

> Critique this screen/flow: **[URL or page, e.g. the site-creation flow]**.
> Walk it as (a) a non-technical user — where would they get stuck or confused? — and (b) a UX designer — clicks, friction, cognitive load, findability of the primary action. Check it at mobile and desktop widths. Read-only; just tell me what to fix and route the fix, don't redesign it.

The dual-lens phrasing triggers `ux-critic`, which can walk the running screen via Playwright.
"Read-only, don't redesign" keeps it out of `principal-designer` build mode.

---

## 10. Dependency vulnerability / shared-package bump

> **[Vuln fix:]** Scan for vulnerable dependencies in **[repo]**, research each, propose a fix plan for my approval, then patch until the scan is clean (0 vulns).
>
> **— or —**
>
> **[Package bump:]** Bump **[@hillbombcreations/____]** to **[version]** across every consumer repo — detect version skew, clean-reinstall, build/test each, and open PRs.

Map 1:1 to **`/vuln-fix`** and **`/bump-package`**, which already encode the multi-repo discovery +
clean-reinstall + PR steps.

---

## 11. Refactor / audit (non-bug, planned work)

> Audit **[area/module]** for **[concern — dead code, perf, inconsistent patterns, security]** and fix what's genuinely worth fixing. Investigate first, show me what you found and what you propose to change, get my sign-off, then implement and self-review. No scope creep beyond what we agree on.

"Audit … fix what's worth fixing … investigate → propose → approve → implement" is the
`principal-coordinator` / **`/orchestrate`** (audit mode) contract. "No scope creep" keeps an
audit from becoming a rewrite.

---

## 12. Migrating an external website into Vivreal

> Migrate **[URL]** into Vivreal for **[customer/group]**.
> Follow the full pipeline — crawl → ingest → collections/integrations → site → assemble → audit — with the parity standard, both audit passes (live-DOM sweep + local render vs live), and stop at each human gate (pre-flight, pre-creation, cutover) for my approval.

Migration is operated FROM `C:\repos\Vivreal_Site_Migrator` — open a session there and run
**`/migrate <url>`** (its in-repo command with the 3 approval gates). From any other repo, the
`vivreal-migrator-knowledge` skill supplies the pipeline map, heuristics, and the renderer
capability manifest (`capabilities/CAPABILITIES.md`).

The same repo also owns the sibling **`/template <exemplar-url>`** track (added 2026-07): 1:1
DESIGN/LAYOUT parity with placeholder content and a fictional brand, producing a reusable
renderer **identity kit** for the portal template picker (scout → design gate → build → validate,
driven by the `kit-designer` / `component-builder` / `page-confirm` agents). Ask for that when the
goal is a reusable template, not a customer's real content.

---

## 13. Content planning / production (social, posts, calendars)

> **[Plan:]** Plan next week's content calendar — **[N posts across IG/LinkedIn/X/TikTok, theme if you have one]**.
>
> **— or —**
>
> **[Produce:]** Expand **[calendar row / this brief]** into platform-ready drafts with per-platform limits and the on-voice self-check.

Content work is operated FROM `C:\repos\vivreal-content` — its in-repo `content-planner` /
`content-creator` agents own calendars, drafts, and rendered assets (the tooling moved out of the
portal 2026-06-25). From anywhere else: voice/copy *critique* routes to `marketing-auditor`, and
the `vivreal-brand-voice` + `vivreal-content-knowledge` skills carry the voice rules and the
knowledge-base map (strategy, posting playbook, earned media, niche verticals).

---

## Trigger cheat-sheet — the words that route the request

| You want… | Put this in the prompt | Routes to |
|---|---|---|
| A specific backend's gotchas | The repo name (`VR_Secure_API`, `VR_CMS_API`, `VR_Client_API`, `VR_Main_API`, `VR_Outreach_API`, `Vivreal_EventHandler`, the portal) | the matching read-only **expert** |
| Production telemetry | A **Sentry ID/URL**, "trace end-to-end", "what happened when I…" | `sentry` |
| Live infra state | "throttling", "Atlas saturation", "Step Functions execution", "reserved concurrency" | `vivreal-ops` |
| Cost/margin | "gross margin", "can we afford", "cost at N customers" | `finance-auditor` |
| Funnel/conversion numbers | "signups", "churn", "funnel", "WoW", "acquisition" | `growth-advisor` |
| Copy/voice critique | "is this on-brand", "audit this copy/email/headline" | `marketing-auditor` |
| Usability of a screen | "is this confusing", "fewer clicks", "walk this as a new user" | `ux-critic` |
| Site-visitor stats | "site traffic", "page views", "analytics beacon", "per-site dashboard" | `vivreal-analytics-knowledge` (+ `growth-advisor` for interpretation) |
| Payments provider (Stripe/Square) | "Square", "checkout", "payment link", "payments provider" | `cms-api` / `secure-api` / `client-stack` experts (Square spans all three) |
| Site migration | "migrate this site", "cutover", "parity audit", a source-site URL | `vivreal-migrator-knowledge`; operate from `Vivreal_Site_Migrator` via `/migrate` |
| Reusable template / identity kit | "build a template from", "identity kit", "template picker variant", an exemplar URL | `vivreal-migrator-knowledge`; operate from `Vivreal_Site_Migrator` via `/template` |
| Content planning/production | "content calendar", "posting playbook", "draft posts for the week" | `vivreal-content-knowledge`; operate from `vivreal-content` |

## Slash-command quick reference

| Command | Use it for |
|---|---|
| `/coordinator` | Full bug fix: research → plan → approve → implement → review → document → PR |
| `/research` | Research a bug end-to-end (produces `research.md`) |
| `/investigate` | Deep investigation of any technical question (no artifacts needed) |
| `/plan` | Research + write implementation plan + auto-review the plan |
| `/design` | Architecture decision — 2–3 options with tradeoffs + recommendation |
| `/orchestrate` | Non-bug work: features, refactors, audits, migrations |
| `/implement` | Principal-level implementation of an approved plan |
| `/reviewer` / `/bug-review` | Final adversarial review gate |
| `/test` / `/write-tests` | Regression / e2e tests |
| `/vuln-fix` | Dependency vulnerability resolution (0-vuln gate) |
| `/bump-package` | Bump a shared dep across all consumer repos |
| `/db-query` / `/db-schema` | Safe tenant-scoped MongoDB query / schema lookup |
| `/sentry-trace` / `/sentry-to-aws` | Telemetry tracing; chain into live AWS/Atlas metrics |
| `/growth-report` / `/funnel-analysis` | Analytics dashboards and funnel drop-off analysis |
| `/deploy-status` | Live deploy status of a customer site |
| `/proxy-route` | Generate a factory-based portal proxy route |
| `/fullstack` | Scaffold an end-to-end feature checklist across the stack |
