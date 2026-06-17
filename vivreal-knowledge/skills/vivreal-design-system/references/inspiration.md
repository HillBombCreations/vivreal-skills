# Mobile-first SaaS UI — distilled craft & inspiration

Curated from June-2026 research (full source with URLs: `Vivreal_Portal_Mobile/docs/projects/vivreal-skills-global-agents/research-inspiration.md` §1). Opinionated, applied to a mobile-first enterprise SaaS CMS portal for non-technical SMB founders.

## Layout & mobile patterns

- **Mobile is the primary layout, not an afterthought** — over half of SaaS logins happen on mobile ([Devian](https://www.devian.in/blogs/saas-dashboard-design-trends)). Design the phone view first, then expand.
- **Card/tile grids + stat tiles** are the dominant dashboard primitive: scannable KPI tiles at top, then activity feed/lists, then secondary panels. Group related tiles with **whitespace (Law of Proximity)**, not dividers. (Vivreal's `StatTile`/`ActivityFeed` already follow this.)
- **Usage/quota panels**: current-vs-limit progress bar + plain-language "X of Y used" + a contextual upgrade CTA when near the cap. Treat "near limit" as a **peak moment** (see ux-psychology peak-end). (Vivreal's `UsagePanel` is exactly this.)
- **Promo/announcement banners**: one at a time, dismissible, above the fold but below primary stats; auto-rotating carousels need a **Pause/Play control (WCAG 2.2.2)** ([codetheorem](https://codetheorem.co/blogs/saas-dashboard-ux/)). (Vivreal's dash `PromoBanner` follows this.)
- **Minimal scrolling, touch-first** on mobile; use progressive disclosure — collapse secondary detail behind expanders/sheets on small screens.

## Breakpoints, touch targets & thumb zones

- **Bottom nav beats top nav on mobile** for primary navigation — relocating nav to the thumb zone measurably increases feature discovery and reduces nav errors ([thumb-zone study](https://webdesignerindia.medium.com/thumb-zone-optimization-mobile-navigation-patterns-9fbc54418b81)).
- **The thumb zone is the bottom ~25-40% of the screen** — ~96% tap accuracy there vs ~61% in the top "stretch" zone. Put primary actions + nav low; reserve the top for titles/status.
- **3-5 primary tabs** in a bottom nav. More increases cognitive load and cramps targets.
- **Touch targets 44-48px** (Material = 48px), **≥8px spacing** between targets; WCAG 2.2 AA hard floor is **24×24 CSS px** ([garanord](https://garanord.md/touch-target-optimization-designing-finger-friendly-interfaces-for-mobile-devices/), [Level Access](https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/)). Design to 44-48, never below 24.

## What to borrow (Linear / Stripe / Vercel teardown)

([Mantlr](https://mantlr.com/blog/stripe-linear-vercel-premium-ui), [Pixeldarts](https://www.pixeldarts.com/en/post/four-design-principles-behind-stripe-linear-and-vercel))

| Product | Borrow specifically |
|---|---|
| **Linear** | Quiet interface; accent rationed to a **single primary action** per view. Cards get presence from **1px inset borders + soft shadows**, not fills (Vivreal `StatTile` = `border border-black/10` + soft shadow — same DNA). Dense, instrument-panel typography. |
| **Stripe** | One anchored brand typeface everywhere ("reads as considered"); measured accent on neutral grounds; **color = meaning, not decoration**. |
| **Vercel** | High-contrast monochrome foundation; blueprint-grid structural rigor; restrained mono/sans pairing. |
| **Height / Notion** | Calm density, generous line-height in content areas, restrained chrome so content is the hero. |

## Shared craft rules

- **Type**: one family, **4-6 sizes max** (Vivreal's semantic scale is 10/11/12/13/14/15/18/24 — use the classes, don't add half-steps). No decorative mixing.
- **Spacing**: one **8-based scale** (8/12/16/24/32) used exclusively. "Take the spacing that feels like enough, then double it."
- **Color**: neutrals + **2-3 semantic colors** (danger/success/primary). Define meaning before hex. In Vivreal, those are tokens, runtime-injected.
- **Elevation/glass**: in **dark mode, elevation = a lighter surface over a darker bg**, not heavy shadows ([Chyshkala](https://chyshkala.com/blog/why-linear-design-systems-break-in-dark-mode-and-how-to-fix-them)). Don't default backgrounds to pure `#000` — use `#1A1A1A`/`#2A2A2A`. (Vivreal has `.bg-glass`; use it for layered surfaces.)
- **Motion**: define **named easings + fixed durations** (Vivreal: `--motion-fast/base/slow`); **<100ms reads as instant**; animate **from a directional origin** (dropdown grows from trigger, modal enters with weight); stagger lists for intent. Never ship browser-default transitions on repeated interactions.
- **Microstates**: every interactive element ships **6 states** — default, hover, focus (keyboard), active, disabled, loading. **Skeletons that match the real layout**, not generic spinners (Vivreal `Loader.tsx` + `animate-pulse` tiles).
- **Anti-pattern**: unmodified shadcn/Radix defaults read as "templated." Premium lives in the **tuning to your brand**, not the polished default — Vivreal's non-templated identity depends on this.

## The 12 opinionated "do this" rules

1. Design mobile-first; primary nav + primary CTA in the **bottom thumb zone**.
2. Cap bottom nav at **3-5 tabs**.
3. Touch targets **44-48px**, **≥8px** apart; **never < 24px**.
4. KPI **stat tiles top**, activity/lists middle, secondary panels last; group by proximity.
5. **One accent color, one primary action** per view (Linear rule).
6. **One type family, ≤6 sizes**; one **8-based spacing scale**, used exclusively.
7. Color encodes **meaning**, not decoration; semantic palette of 2-3.
8. Dark mode via **lighter surfaces**, not muddy shadows; no pure-black bg.
9. Every interactive element ships **6 states** + a designed focus ring.
10. Motion: named easings + durations; **<100ms = instant**; animate from origin; stagger lists.
11. Usage/quota panels: progress bar + plain-language "X of Y" + contextual upgrade CTA.
12. Skeletons matching layout; **never blank** loading states.

## Accessibility musts (WCAG 2.2 AA) for dashboards/forms

([TestParty](https://testparty.ai/blog/wcag-22-new-success-criteria), [Level Access](https://www.levelaccess.com/blog/wcag-2-2-aa-summary-and-checklist-for-website-owners/))

- **2.5.8 Target Size (Min)** ≥ 24×24px. **2.4.11 Focus Not Obscured** (sticky headers/cookie bars must not cover focused fields). **2.4.13 Focus Appearance** (visible high-contrast focus ring on every interactive element — design it). **3.3.7 Redundant Entry** (autofill/pre-fill, don't re-ask). **3.3.8 Accessible Authentication** (allow paste, password managers, passkeys — Vivreal has WebAuthn). **3.2.6 Consistent Help.**
- Contrast **4.5:1 text / 3:1 large text & UI components**; **never rely on color alone** for state.
