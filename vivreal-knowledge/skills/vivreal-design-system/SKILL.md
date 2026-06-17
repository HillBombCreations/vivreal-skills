---
name: vivreal-design-system
description: Use when designing, building, or reviewing any Vivreal portal UI/UX — new screens, components, layouts, dashboards, forms, mobile views, or design-system/accessibility decisions. Teaches the REAL Vivreal component & layout conventions (Dashboard stat-tile/usage-panel/activity-feed patterns, outreach list/detail, admin tabbed analytics), the globals.css design tokens (--primary/--surface/--text-primary, .bg-glass, .hover-lift, the type + motion + spacing scales), the mobile-first + dark-mode + Radix/Tailwind4/Framer/Lucide stack rules, the WCAG 2.2 AA musts, and the borrowed-from-Linear/Stripe/Vercel craft rules + UX-psychology laws. Triggers on: portal UI, design a screen/component, dashboard layout, stat tile, usage panel, activity feed, mobile-first, thumb zone, touch target, dark mode, design tokens, CSS variables, --primary, --surface, bg-glass, hover-lift, WCAG, accessibility audit, empty state, loading skeleton, Radix, Tailwind, Framer Motion, Lucide, UX critique, friction, cognitive load. The `designer`/`principal-designer` agents and the `ux-critic` agent should consult this skill. For the site PRODUCT/authoring model use vivreal-sites; for portal API/proxy internals use vivreal-portal-knowledge.
---

# Vivreal Design System — portal UI/UX knowledge

The opinionated rules + REAL conventions for any Vivreal portal interface work. This is a lean selector; the depth lives in the three references — read the one your task needs. Grounded in the actual portal source (cited paths below) and curated June-2026 design/UX research.

## The strongest rules (internalize these even before opening a reference)

1. **Mobile-first, thumb-first.** Design the 360px view first, enhance up. Over half of SaaS logins are on mobile. Primary nav + the primary action live in the bottom **thumb zone** (bottom ~25-40% of the screen, ~96% tap accuracy vs ~61% at the top). The portal reserves `--app-nav-height: 5.5rem` for the mobile bottom nav (0 on `md+`). Cap a bottom nav at **3-5 tabs** (`src/styles/globals.css:95-96`).
2. **Touch targets 44-48px, ≥8px apart; NEVER below 24×24** (WCAG 2.2 AA hard floor — 2.5.8).
3. **One accent, one primary action per view** (Linear rule). Color encodes **meaning**, not decoration — semantic tokens only, never hardcoded hex.
4. **Semantic tokens, never literals.** Use `--primary`, `--surface`, `--text-primary`, `--text-secondary`, etc. — they are injected at runtime from `siteData` in `Providers` (`useEffect`), so there is a brief theme-flash on first load; design with neutral placeholders, not branded colors that swap. Every choice must work in **both** light and dark mode (`class` strategy).
5. **One type scale, one spacing scale.** Use the portal's semantic type utilities (`.text-body`, `.text-heading`, `.text-display`, …) over `text-[Npx]` literals; do NOT invent half-step sizes. Spacing is 8-based.
6. **Every interactive element ships 6 states** — default, hover, focus (keyboard, visible high-contrast ring), active, disabled, loading. Skeletons that **match the real layout**, never bare spinners or blank "No data".
7. **Motion has a reason and a budget.** Use the motion tokens (`--motion-fast 150ms`, `--motion-base 250ms`, `--motion-slow 400ms`). Animate from a directional origin. Always honor `prefers-reduced-motion` (keep opacity, drop transforms).
8. **SSR-safe + privacy-aware.** Guard `window`/`document`. `{...privacyUnmask}` ONLY on static chrome (nav labels, button text, empty-state copy) — NEVER on user/API data (collection names, group names, author info), which stays masked in Sentry Replay + Clarity.

## The three references — read the one you need

- **`references/portal-components.md`** — the REAL Vivreal patterns: Dashboard `StatTile`/`UsagePanel`/`PromoBanner`/`ActivityFeed`/`ActiveGroup` (cited files), outreach list/detail layout, the admin tabbed-analytics page, the full `globals.css` token set (`--primary`/`--surface`/`--text-primary`, `.bg-glass`, `.hover-lift`, the type/motion/typography scales), mobile breakpoints, dark-mode strategy, the Radix + Tailwind 4 + Framer + Lucide stack conventions. **Read this when building/reviewing a portal screen or component.**
- **`references/inspiration.md`** — distilled mobile-first SaaS UI craft: thumb zones, bottom-nav rules, 44-48px targets, one-accent/one-primary-action, the 8-based spacing scale, dark-mode-via-lighter-surfaces, the 6 designed states, and the specific "what to borrow" notes from Linear / Stripe / Vercel. **Read this when making visual/layout/craft decisions or pushing past "templated" defaults.**
- **`references/ux-psychology.md`** — the canonical UX laws (Hick, Fitts, Miller, Jakob, Tesler, Doherty, Peak-End, Zeigarnik, Von Restorff, Aesthetic-Usability, Proximity, Recognition-over-recall) mapped to concrete portal moves, plus the dual-lens (naive-user + designer) critique rubric and the 12-point usability checklist. **Read this when critiquing usability, reducing friction/clicks, or doing a UX review. This is also the `ux-critic` agent's grounding.**

## WCAG 2.2 AA musts (non-negotiable floor)

- **2.5.8 Target Size** ≥ 24×24px (design to 44-48). **2.4.11 Focus Not Obscured** (sticky headers must not hide the focused field). **2.4.13 Focus Appearance** (design the focus ring; don't ship the browser default). **3.3.7 Redundant Entry** (pre-fill, don't re-ask). **3.3.8 Accessible Authentication** (allow paste/password managers/passkeys — the portal has WebAuthn, good). **3.2.6 Consistent Help.**
- Contrast **4.5:1** body text / **3:1** large text & UI components, verified against the actual token values. **Never** rely on color alone for state — pair with icon + text.

## Who consults this skill

- The **`designer`** and **`principal-designer`** agents — they DESIGN and BUILD; this skill is their Vivreal-specific token/pattern grounding.
- The **`ux-critic`** agent — it CRITIQUES usability read-only; `references/ux-psychology.md` is its primary lens.
- Companions: `vivreal-sites` (the customer-site product/authoring model — distinct from portal chrome), `vivreal-portal-knowledge` (the portal's API/proxy/auth internals).

Sources of truth (read for depth): `C:\repos\Vivreal_Portal_Mobile\src\styles\globals.css` (tokens), `src/components/Dashboard/*` + `src/app/(app)/outreach/*` + `src/app/(app)/admin/page.tsx` (patterns), `C:\repos\Vivreal_Portal_Mobile\CLAUDE.md` (Styling + Privacy sections), and the `.claude/agents/designer.md` protocol.
