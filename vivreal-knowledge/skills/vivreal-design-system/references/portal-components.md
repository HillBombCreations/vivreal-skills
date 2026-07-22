# Vivreal portal — REAL component, layout & token conventions

Last synced: 2026-07-21

This is the as-built Vivreal portal design system, mined from source. Match these patterns; don't invent parallel ones. All paths are under `C:\repos\Vivreal_Portal_Mobile\`.

## Stack conventions

- **Next.js 16 App Router, React 19, TypeScript strict.** Server Components by default; `'use client'` only for interactivity. Feature pattern per surface: `Client.tsx` (interactive) / `Loader.tsx` (skeleton) / `Dialog.tsx` (CRUD modals).
- **Tailwind CSS 4** via `@tailwindcss/postcss` + `@theme inline` (not the old `tailwind.config.js` utility style). CSS-variable-driven utilities.
- **Radix UI** wrappers live in `src/components/UI/` (Button, Dialog, Input, Separator, …). Compose these — do NOT pull in Material/Chakra/etc. Radix `Dialog` already gives focus trap + ESC dismiss + inert background; don't hand-roll.
- **Lucide React** icons only, sizes **16/20/24** (`w-5 h-5` is the dashboard default). No mixed icon libraries.
- **Framer Motion v12** is installed — use it for motion, don't reintroduce CSS-only animation helpers.
- `basePath: '/app'` (`next.config.ts`) — internal links start with `/app/...`.
- **SSR-safe**: guard `window`/`document` (e.g. `UsagePanel` `loadVisible()` checks `typeof window === 'undefined'`, `src/components/Dashboard/UsagePanel/index.tsx:38-49`).

## Design tokens (`src/styles/globals.css`)

Defined in `@layer base :root`, overridable at runtime by `Providers` from `siteData`. **Never hardcode hex; reference the token.**

| Token | Default | Use |
|---|---|---|
| `--primary` / `--hover` | `#365b99` / `#2a4473` | the single accent / primary-action color, and its hover |
| `--surface` / `--surface-alt` | `#f6f8fc` / `#e9eff7` | card/panel backgrounds (tiles use `bg-[var(--surface,#fff)]`) |
| `--text-primary` / `--text-secondary` / `--text-inverse` | `#1a2433` / `#5c6e88` / `#fff` | body, muted, on-accent text |
| `--background` / `--foreground` / `--card` / `--border` / `--ring` / `--destructive` | see file | base theme tokens consumed by Radix wrappers |
| `--radius` | `0.75rem` | corner radius base (tiles use `rounded-2xl`) |
| `--app-nav-height` | `5.5rem` (0 on `md+`) | space reserved above the safe-area for the mobile bottom nav |

**Motion scale** — use these, not ad-hoc durations: `--motion-fast: 150ms` (hover/press), `--motion-base: 250ms` (dialogs/dropdowns), `--motion-slow: 400ms` (page entrances). (`globals.css:99-104`)

**Type scale** — semantic classes; prefer over `text-[Npx]` literals, and do NOT add half-step sizes (10.5/11.5/12.5/13.5/14.5px): `.text-micro 10` / `.text-caption 11` / `.text-small 12` / `.text-label 13` / `.text-body 14` / `.text-body-lg 15` / `.text-heading 18 (600)` / `.text-display 24 (700, -0.01em)`. (`globals.css:106-149`) Body font is **Inter**.

**Utility classes that already exist** (don't recreate): `.bg-glass` (white 80% + `blur(20px)`), `.hover-lift` (translateY -0.25rem + shadow on hover, 300ms cubic-bezier), `.text-balance`, `.content-grid` (full/breakout/content column system), `.pwa-layout` / `.browser-layout` (safe-area-aware app shells). (`globals.css:222-282`)

**Dark mode** = `class` strategy (`html.light` / dark). Elevation in dark mode is a **lighter surface over a darker bg**, not heavy shadows. Pair-preview every color in both modes.

## Dashboard patterns (the canonical primitives)

`src/components/Dashboard/` — the reference implementation of "stat tiles top, panels/feed below."

- **`StatTile/index.tsx`** — the KPI tile primitive. `rounded-2xl p-4`, `border border-black/10`, `bg-[var(--surface,#fff)]`, soft shadow `shadow-[0_4px_10px_rgba(0,0,0,0.04)]`, icon + label + value in a flex row. Skeleton is `animate-pulse bg-black/10` until `useHydrated()` is true (prevents SSR/CSR flash). Optional `href` wraps it in a prefetched `Link`. `labelProps` exists specifically to spread `{...privacyUnmask}` onto the label. **Copy this shape for any new tile.**
- **`UsagePanel/index.tsx`** — quota/usage display: a tile registry (`TILES`) of icon+label+usedKey, user-customizable visible set persisted to `localStorage` (`dash_usage_tiles`) with an SSR-safe loader. Each row is a `UsageRow` (`src/components/Group/UsageRow`) showing used-vs-limit. This is the model for any "X of Y used + upgrade CTA" surface — near-limit is a peak moment (see ux-psychology peak-end), so the upgrade CTA belongs there.
- **`PromoBanner/`** — the lobby-style auto-rotating promo carousel (custom `VivrealGlyph` rail, CSS progress sweep, Pause/Play per WCAG 2.2.2). One announcement at a time. Carousels MUST have a Pause/Play control. Slides fill the card via the Embla viewport `flex-1 min-h-0` pattern.
- **`ActivityFeed/`** — `FeedItem` rows + `ChannelPill` + `WeekSummary`; the "recent activity" list pattern that sits below the stat tiles.
- **`ActiveGroup/`** + **`Client/index.tsx`** + **`Loader/index.tsx`** — the Client/Loader split: `Loader` is the skeleton matching the real layout, `Client` is the hydrated interactive dashboard.

**Dashboard layout order** (also the general SaaS rule): KPI **stat tiles at top** → activity feed / lists in the middle → secondary panels last. Group related tiles with whitespace (Law of Proximity), not dividers.

## Tier gating & overage patterns

- **Gate on the package helpers, never a hand-rolled tier set.** The quota-gate components (`CollectionObjects/Client`, `CollectionObjects/Wrapper`, `Integrations/Client`, `Sites/Client`, `Universal/SchemaFormDialog/Create` + `Update`) use `isUnlimited` from `@hillbombcreations/tier-quotas` (^3.0.0) — **renamed from `isUnlimitedQuota`**; a local `<0` helper still named `isUnlimitedQuota` survives only in `src/lib/usage/format.ts`, `src/components/Group/UsagePanel`, and `src/components/Group/UsageRow` — don't "fix" those to the package name or vice versa.
- **`src/components/Group/OverageBillingSection/index.tsx`** + **`SpendingCapSection.tsx`** — the overage billing surface: auto-enroll disclosure copy plus a spending cap control with a "Default cap" badge. Copy this shape for any billing-disclosure panel (disclosure text adjacent to the control it explains, cap state as a badge not color alone).
- **Group `UsagePanel` free-tier upgrade banner** — near/over-quota state driven by the Group usage flags (cdn/api/agent buckets, each `pctOfQuota`/`nearQuota`/`overQuota`). This is the near-limit peak-moment upgrade CTA (see ux-psychology peak-end) implemented in practice — reuse the flags, don't recompute percentages client-side.
- **Studio `FooterEditor`** (`src/components/Sites/Studio/LeftRail/chrome/FooterEditor.tsx`) calls the package `canHidePoweredBy()` (which includes Basic) instead of a local `TIERS_CAN_HIDE` set — Basic tier gets the "Show Powered by Vivreal" toggle. Tier-copy accuracy matters: the false "Pro Plus = 10x actions" tooltip was removed (Pro and Pro Plus both get 500 agent actions/mo) — verify quota copy against tier-quotas before shipping it.

## Outreach list/detail conventions

`src/app/(app)/outreach/` — `companies/`, `contacts/`, `queue/`, `senders/`, `suppressions/` each as a route, plus `[id]/` for detail, a shared `layout.tsx`, `loading.tsx`, `error.tsx`. This is the **list-of-entities → detail** convention: a sectioned layout wrapper, per-entity list routes, a dynamic `[id]` detail, and admin-gated sub-sections. Mirror this structure for new multi-entity admin surfaces (list route + `[id]` detail + shared layout + loading/error boundaries).

## Admin tabbed-analytics pattern

`src/app/(app)/admin/page.tsx` — a `force-dynamic` server page that reads `active_ctx` from cookies, renders a header (icon chip `grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary` + `{...privacyUnmask}` title/subtitle) and a `<Suspense key={activeCtx}>` around the resolved `AdminTabs` client component. The `void activeCtx` + `Suspense key` is the intentional "remount on profile switch to force re-fetch" idiom. Constraint container is `max-w-6xl mx-auto px-4 ... `. Use this header+chip+tabs shape for new internal dashboards. The page is gated client-side (`usePermissions().canViewAttribution`) AND server-side (`ADMIN_EMAILS` fail-closed) — internal pages need both.

## Responsive breakpoints

Tailwind defaults: `sm:640 md:768 lg:1024 xl:1280 2xl:1536`. The mobile bottom nav is visible below `md`; `--app-nav-height` drops to 0 at `md+` (`globals.css:118-122`). PWA: respect `env(safe-area-inset-*)` (the `.pwa-layout` shell already does `padding-top: env(safe-area-inset-top)`).

## Privacy masking (design-visible)

From `@/lib/privacy`: `{...privacyUnmask}` drives both Sentry Replay (`data-sentry-unmask`) and Clarity (`data-clarity-unmask`) in one spread. Everything is masked by default. Apply unmask ONLY to static, hardcoded chrome (nav labels, button text, tab labels, empty-state copy, hardcoded titles — see the admin page title/subtitle). NEVER unmask elements that render user-supplied or API-sourced data. Design for the masked state too — Replay will show blocks where sensitive data lives.
