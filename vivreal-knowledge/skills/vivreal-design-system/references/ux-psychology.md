# UX psychology, friction reduction & the critique rubric

Curated from June-2026 research (full source with URLs: `Vivreal_Portal_Mobile/docs/projects/vivreal-skills-global-agents/research-inspiration.md` §3). This is the grounding for the **`ux-critic`** agent and the UX-review lens of `designer`/`principal-designer`.

## Canonical UX laws → concrete Vivreal portal moves

([Laws of UX](https://lawsofux.com/), [UXtweak](https://blog.uxtweak.com/ux-laws-and-principles/), [UX Design Institute](https://www.uxdesigninstitute.com/blog/laws-of-ux/))

| Law | What it says | Portal move |
|---|---|---|
| **Hick's Law** | decision time grows with options | Cap menus/nav at ~5-7; split dense forms into steps; hide power-features behind progressive disclosure |
| **Fitts's Law** | acquisition = f(distance, size) | Primary buttons large + near the relevant content; primary CTA in the **thumb zone** on mobile; bigger destructive-confirm targets |
| **Miller's Law** | ~7±2 in working memory | Group settings/features into chunks of 5-9; never 20 ungrouped options |
| **Jakob's Law** | users expect your app to work like others | Conventional icons (hamburger, gear, cart), standard form layouts, expected nav placement — don't reinvent learned patterns |
| **Tesler's Law** | irreducible complexity lives somewhere | Absorb it into the system: **smart defaults, automation, pre-filled config** instead of asking the user to decide |
| **Doherty Threshold** | productivity soars when response < **400ms** | Optimistic UI, instant feedback, skeletons matching layout; keep perceived response < 400ms (relevant to the portal's `force-dynamic`/edge-proxy latency budget) |
| **Peak-End Rule** | judged by peak + end | Engineer a delightful **peak** (first successful publish) and a satisfying **end** (clean success screen) — and a near-limit usage moment is a peak too; don't end flows on a dead "done" page |
| **Zeigarnik Effect** | unfinished tasks pull attention | Progress bars, "X of Y steps," resumable setup checklists drive completion |
| **Von Restorff Effect** | the different item is remembered | Make the **one** primary action / recommended tier visually distinct |
| **Aesthetic-Usability Effect** | pretty is perceived as more usable | Polish typography/spacing — it buys trust and tolerance for minor friction |
| **Law of Proximity** | near things read as grouped | Cluster related fields/controls; use whitespace, not lines, to group |
| **Recognition over recall** (Nielsen) | show options, don't make users remember | Visible nav labels, recently-used items, inline help; avoid hidden commands |

## Friction-reduction techniques

([UserGuiding](https://userguiding.com/blog/saas-onboarding-ux-analysis), [Guidejar](https://www.guidejar.com/blog/7-saas-onboarding-best-practices-for-2025-that-actually-work), [SaaSFactor](https://www.saasfactor.co/blogs/the-science-of-saas-onboarding-a-comprehensive-framework-for-reducing-friction-improving-activation-and-preventing-churn))

- **Smart defaults + progressive configuration** raise activation; ship a pre-populated environment so day-one isn't a blank slate.
- **Inline validation** in real time (validate on blur, not just on submit) cuts form friction.
- **Minimize form fields** — each extra field costs ~10-15% completion.
- **Empty states are onboarding** — every empty list/dashboard explains the feature + offers a first action + reinforces confidence. Never ship a bare "No data."
- **Onboarding flow**: tours **< 90 seconds**, **3-5 steps**, always skippable/exitable.
- **Navigation findability**: a non-technical user must answer "how do I get to X?" within one scan — consistent labels, predictable placement, search as fallback.
- **Reduce clicks/steps**: collapse multi-step where a smart default removes a decision; bulk actions; sensible "back" and resumability.

## The dual-lens critique rubric

### (a) Naive non-technical-user lens — ask out loud, on the screen

1. Do I understand **what this screen is for** in 5 seconds?
2. Can I find **how to do the main task** without scrolling/hunting?
3. **Where is X?** (the thing I came for) — is it where I'd expect (Jakob)?
4. Is anything **confusing/jargon** I wouldn't say myself?
5. If I make a mistake, will I **know** and be able to **recover**?
6. Does the empty/blank state tell me **what to do first**?

### (b) UX-designer lens

1. **Click count** to the primary task — can it drop?
2. **Cognitive load** — options ≤ 7? chunked (Miller)? clear hierarchy?
3. **Discoverability** — primary action distinct (Von Restorff) and reachable (Fitts/thumb zone)?
4. **Error prevention** — inline validation, confirms on destructive actions, smart defaults (Tesler)?
5. **Feedback latency** — < 400ms perceived (Doherty); skeletons not spinners?
6. **Consistency** — patterns/labels match the rest of the app and platform conventions (Jakob)?
7. **Peak/End** — a delightful peak and a satisfying close?

## The 12-point usability-audit checklist

1. Primary task reachable in **minimum clicks** / one screen scan.
2. Menu/option count **≤ 7**, chunked (Hick/Miller).
3. Primary action **visually distinct** and **thumb-reachable** (Von Restorff/Fitts).
4. Conventional patterns/icons (Jakob) — nothing reinvented without reason.
5. **Smart defaults / pre-fill** remove avoidable decisions (Tesler).
6. **Inline, real-time validation**; errors recoverable and clear.
7. Forms **minimized**; no redundant re-entry (WCAG 3.3.7).
8. **Empty states** teach + offer a first action.
9. Onboarding **≤ 90s, 3-5 steps, skippable**.
10. Perceived response **< 400ms**; skeletons match layout (Doherty).
11. Progress indicators on multi-step flows (Zeigarnik); flows resumable.
12. **Peak + satisfying end** designed; no dead-end "done" screens.

## Vivreal-specific application notes

- ICP is **non-technical SMB founders** — the naive-user lens is not a courtesy, it's the primary buyer's actual experience. Jargon that a developer skims past ("integrations manifest", "collection objects") is a real comprehension wall for them.
- The portal's runtime theme-flash, masked Replay (sensitive data appears as blocks), and `force-dynamic` latency budget all interact with the Doherty/aesthetic laws — account for them when judging perceived speed and polish.
- For customer-SITE screens (Templates/renderer output, not the portal) the same laws apply, but the data/authoring model lives in the `vivreal-sites` skill — pair the two when critiquing a site flow.
