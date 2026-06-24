# Mobile interaction patterns — the decision catalog

The validated, component-level answer to "how should this behave on mobile?" The other references cover *principles* (thumb zones, targets, craft); this one covers *patterns* — when a specific mobile problem appears, reach for the named pattern here instead of improvising. Every row is grounded in a primary source (Apple HIG, Material, NN/g, WCAG 2.2). Curated June-2026.

> **Why this file exists:** principles alone produced a weak call once — a crowded editor toolbar was "solved" with horizontal scroll. The principle (mobile-first) was right; the *pattern* was wrong. This catalog closes that gap with explicit problem → pattern → anti-pattern mappings.

## The governing principle: one design, adaptive patterns

The 2026 consensus (Google, [NN/g], [UXPin](https://www.uxpin.com/studio/blog/responsive-vs-adaptive-design-whats-best-choice-designers/)) is **a responsive base with adaptive *interaction-pattern* swaps at key breakpoints** — NOT two separately-authored designs. The aesthetics stay constant (one token set, one type + spacing scale, one component identity); the **interaction pattern adapts by device mode**. Same brand, device-appropriate behavior.

Reason about which mode you're designing for — they have genuinely different rules:

| Dimension | Desktop (`md+`, pointer) | Mobile (`<md`, touch) |
|---|---|---|
| Input | precise cursor, hover, right-click | fat finger, no hover, no right-click |
| Reach | whole screen equal | thumb zone (bottom ~25-40%) easy; top = stretch |
| Width | wide, multi-column | one column |
| Density | can be dense (dashboards) | breathable; progressive disclosure |
| Navigation | persistent sidebar / top nav | bottom tab bar; sheets |
| Disclosure | hover, popover, tooltip | tap → sheet / expand / push route |
| Primary action | top-right / inline is fine | full-width or thumb-anchored |

If a "mobile design" is just the desktop layout scaled down, it's wrong. Adapt the *pattern*, keep the *identity*.

## App-like is the Vivreal default (not a shrunk website)

The portal's default mobile direction is **native-app**, applied broadly — this is what reads as "modern, updated, organized," and it's a deliberate standard, not case-by-case. Concretely, the mobile default reaches for:

- **Bottom tab bar** for primary nav (thumb zone, 3-5 destinations)
- **Sheet-based** menus and dialogs (bottom sheets / action sheets) instead of centered desktop modals
- **Card lists** instead of tables
- **App-style headers** (large title + contextual actions, collapsing to compact on scroll)
- **Segmented controls** for in-context view switches
- **Full-width, thumb-reachable** primary actions
- **Generous rounded surfaces** (`--radius`/`rounded-2xl`) and **spring motion**

Why it works, not just looks good: users already know these patterns from every app on their phone (**Jakob's Law**), they put the action in the thumb zone (**Fitts's Law**), and they cut per-screen density (**Miller / Hick**). The same patterns also satisfy the accessibility floor (large targets, no hover dependence).

## The pattern catalog — problem → use → never

| Mobile problem | Use this pattern | NOT this | Why / source |
|---|---|---|---|
| **Too many toolbar/header actions for one row** | Keep the 3-5 most-used inline; move the rest into a **"More" (⋯) overflow menu or bottom sheet** | Horizontal-scroll the toolbar | Essential controls behind an off-edge scroll have weak information scent; "essential content should not be placed behind a horizontal scroll" — [NN/g horizontal scrolling](https://www.nngroup.com/articles/horizontal-scrolling/); overflow-menu is the design-system standard ([Zendesk Garden](https://garden.zendesk.com/patterns/rich-text-editor/)) |
| **Contextual actions on an item/selection** | **Action sheet / bottom sheet** — modal, visible Close (X), back-button dismiss, never stacked | Desktop right-click menu, or tiny inline icon cluster | [NN/g bottom sheet](https://www.nngroup.com/articles/bottom-sheet/) — quick contextual actions; always a visible Close, never stack |
| **Wide data table** | **Row → stacked card** (key fields + expandable detail), or column-collapse with "view more" | Pinch-zoom; naked horizontal scroll as the primary view | Convert rows to cards showing key fields with expandable detail ([responsive tables](https://medium.com/appnroll-publication/5-practical-solutions-to-make-responsive-data-tables-ff031c48b122)). H-scroll with a *frozen first column* only as a last resort for genuinely tabular comparison |
| **Primary navigation (3-5 destinations)** | **Bottom tab bar** in the thumb zone | Hamburger / hidden drawer for *primary* nav | Bottom nav puts primary options in thumb reach ([Material navigation](https://m1.material.io/patterns/navigation.html)); hidden nav measurably cuts discoverability (NN/g) |
| **Switch views *within* one screen** (List/Grid, Drafts/Published) | **Segmented control** — 2-5 connected options | A separate nav tab, or a dropdown | Segmented controls switch views within a single context; tabs/bottom-nav are for navigating *between sections* ([Apple HIG / Fluent](https://fluent2.microsoft.design/components/ios/core/segmentedcontrol/usage)) |
| **Secondary form / filters / settings panel** | **Bottom sheet** (expandable nonmodal → modal) or full-screen route | Desktop popover / hover menu | No hover on touch; sheets sit in thumb reach (NN/g bottom sheet) |
| **Long form** | One column, grouped sections (5-9 fields/group), **sticky primary action in the thumb zone**, inline validation | Multi-column desktop form scaled down | Miller's Law (chunking) + Fitts (thumb-zone CTA) |
| **Dialog / modal** | **Bottom sheet or full-screen**, visible Close (X), back-gesture dismiss | Centered desktop modal with a tiny corner X | NN/g bottom sheet — a corner-only X is an accessibility/discoverability barrier |
| **Reveal detail / secondary info** | Tap → **expand-in-place / accordion / push to detail route** | Hover-reveal or tooltip-only | Touch has no hover; hover-dependent info is invisible on mobile |
| **Destructive confirm** | Larger target, **separated** from the primary action, clear action-sheet labels | Same-size button next to the primary | Fitts — bigger/farther targets for destructive actions reduce mis-taps |

## Hard anti-patterns (never on mobile)

1. **Horizontal scroll for essential controls or content.** Weak information scent — users don't discover what's off-edge ([NN/g](https://www.nngroup.com/articles/horizontal-scrolling/)). H-scroll is acceptable *only* for clearly-peeking, non-essential galleries/carousels with a visible "there's more" affordance.
2. **Hover-dependent flows.** No hover exists on touch — any action or info reachable only by hover is invisible.
3. **Hamburger / hidden nav for primary destinations.** Out of sight = out of mind; use a bottom tab bar.
4. **Targets < 44px, or < 8px apart** (and never below the **24×24** WCAG 2.2 AA floor — SC 2.5.8).
5. **Desktop popovers / right-click menus on touch.** Replace with a bottom sheet or action sheet.
6. **Corner-X-only dialogs and stacked bottom sheets.** Visible Close + back-gesture; never stack sheets.
7. **Pinch-zoom-to-read tables.** Convert to cards.

## App-like component → Vivreal implementation map

Spec these concretely against the existing stack (don't invent parallels):

| App-like pattern | Build it with |
|---|---|
| **Bottom tab bar** | The existing mobile bottom nav; `--app-nav-height: 5.5rem` (0 on `md+`); 3-5 tabs; pad for `env(safe-area-inset-bottom)` |
| **Bottom sheet / action sheet** | Compose a Radix `Dialog` in `src/components/UI/` (focus trap + ESC + inert background are free — don't hand-roll); Framer Motion v12 spring entrance from the bottom edge; visible Close (X); bottom safe-area padding |
| **Card list (tables → cards)** | Reuse `StatTile` DNA — `rounded-2xl`, `border border-black/10`, soft shadow `shadow-[0_4px_10px_rgba(0,0,0,0.04)]`; render row-as-card below `md` |
| **App-style header** | The admin-page header shape (icon chip `grid h-9 w-9 place-items-center rounded-xl bg-primary/10`); large title + contextual actions; collapse to compact on scroll |
| **Segmented control** | A connected-track toggle in `src/components/UI/` (2-5 options); active segment uses `--primary`; Lucide 16/20 icons |
| **Rounded surfaces / glass** | `--radius` (0.75rem) / `rounded-2xl`; `.bg-glass` for layered sheets |
| **Motion** | `--motion-base 250ms` sheet entrance, spring feel; honor `prefers-reduced-motion` (keep opacity, drop transform) |

## Worked example — the editor toolbar that started this

**Problem:** an editor toolbar with ~18 formatting controls. On mobile they don't fit one row.

- **Wrong (what was shipped first):** horizontal-scroll the toolbar row. Hides most controls behind a low-discoverability gesture that competes with text scrolling — fails the "essential content must not hide behind horizontal scroll" rule.
- **Right:** keep the 3-5 most-used controls inline (bold / italic / link / list); move the rest into a **"More" / Format bottom sheet**. The editor already ships two of the three recommended mobile affordances — the **selection bubble** (floating toolbar on selection) and the **slash menu** (block insertion) — so lean on those for inline-format and block-insert, and let the persistent toolbar shrink to essentials + overflow.

This is just **catalog row 1** applied. Essentials visible + a labeled affordance with strong information scent always beats a scroll edge.

## Sources

- [NN/g — Horizontal Scrolling](https://www.nngroup.com/articles/horizontal-scrolling/) · [NN/g — Bottom Sheets](https://www.nngroup.com/articles/bottom-sheet/)
- [Material Design — Navigation](https://m1.material.io/patterns/navigation.html) · [Material — Bottom sheets](https://m2.material.io/components/sheets-bottom)
- [Apple HIG — Accessibility / targets](https://developer.apple.com/design/human-interface-guidelines/accessibility) (44pt) · [Material touch target](https://m2.material.io/develop/web/supporting/touch-target) (48dp + 8dp)
- [W3C — WCAG 2.2 SC 2.5.8 Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) (24px floor)
- [Fluent 2 — iOS Segmented control usage](https://fluent2.microsoft.design/components/ios/core/segmentedcontrol/usage)
- [Zendesk Garden — Rich text editor (overflow standard)](https://garden.zendesk.com/patterns/rich-text-editor/)
- [Responsive data tables — 5 solutions](https://medium.com/appnroll-publication/5-practical-solutions-to-make-responsive-data-tables-ff031c48b122)
- [UXPin — Responsive vs Adaptive](https://www.uxpin.com/studio/blog/responsive-vs-adaptive-design-whats-best-choice-designers/)
