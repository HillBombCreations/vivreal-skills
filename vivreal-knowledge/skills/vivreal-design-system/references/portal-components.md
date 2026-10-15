# Vivreal portal: REAL component: layout & token conventions

Last synced: 2026-10-15 against portal `origin/stable` v0.36.0 (the Dashboard section rewritten; the admin and AI sections are history)

This is the as-built Vivreal portal design system, mined from source. Match these patterns; don't invent parallel ones. All paths are under `C:\repos\Vivreal_Portal_Mobile\`.

## Stack conventions

- **Next.js 16 App Router, React 19, TypeScript strict.** Server Components by default; `'use client'` only for interactivity. Feature pattern per surface: `Client.tsx` (interactive) / `Loader.tsx` (skeleton) / `Dialog.tsx` (CRUD modals).
- **Tailwind CSS 4** via `@tailwindcss/postcss` + `@theme inline` (not the old `tailwind.config.js` utility style). CSS-variable-driven utilities.
- **Radix UI** wrappers live in `src/components/UI/` (Button, Dialog, Input, Separator, …). Compose these, do NOT pull in Material/Chakra/etc. Radix `Dialog` already gives focus trap + ESC dismiss + inert background; don't hand-roll.
- **Lucide React** icons only, sizes **16/20/24** (`w-5 h-5` is the dashboard default). No mixed icon libraries.
- **Framer Motion v12** is installed, use it for motion, don't reintroduce CSS-only animation helpers.
- `basePath: '/app'` (`next.config.ts`), internal links start with `/app/...`.
- **SSR-safe**: guard `window`/`document` (e.g. `UsagePanel` `loadVisible()` checks `typeof window === 'undefined'`, `src/components/Dashboard/UsagePanel/index.tsx`).

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

**Motion scale**, use these, not ad-hoc durations: `--motion-fast: 150ms` (hover/press), `--motion-base: 250ms` (dialogs/dropdowns), `--motion-slow: 400ms` (page entrances). (`globals.css:99-104`)

**Type scale**, semantic classes; prefer over `text-[Npx]` literals, and do NOT add half-step sizes (10.5/11.5/12.5/13.5/14.5px): `.text-micro 10` / `.text-caption 11` / `.text-small 12` / `.text-label 13` / `.text-body 14` / `.text-body-lg 15` / `.text-heading 18 (600)` / `.text-display 24 (700, -0.01em)`. (`globals.css:106-149`) Body font is **Inter**.

**Utility classes that already exist** (don't recreate): `.bg-glass` (white 80% + `blur(20px)`), `.hover-lift` (translateY -0.25rem + shadow on hover, 300ms cubic-bezier), `.text-balance`, `.content-grid` (full/breakout/content column system), `.pwa-layout` / `.browser-layout` (safe-area-aware app shells). (`globals.css:222-282`)

**Light-only styling (no dark mode).** The portal has **no dark theme**: no `.dark` block, no `@custom-variant dark`, no `prefers-color-scheme` block, `globals.css` says "LIGHT ONLY … Do NOT add `dark:` utilities." In Tailwind v4 with no `@custom-variant dark` declared, a bare `dark:` utility resolves against the **OS** `prefers-color-scheme`, so it renders dark styles on this permanently-light surface for OS-dark users (in-repo trap: `Outreach/OutboundQueue/QueueItemView.tsx`). The banked `--viz-*` dark token column in `globals.css` is **validated but INERT**, not read by any selector; it activates only as a token swap if a real dark theme ever ships (re-validate if the dark surface moves off `#141a22`).

**Data-viz palette (`--viz-*`)**, brand-independent categorical palette in `globals.css`, deliberately never derived from `--primary` (which is tenant-controlled), validated with the dataviz skill's `validate_palette.js`; used by the Group usage donuts (`CollectionUsage`/`MediaUsage`, the "readable usage donuts" fix). Tokens: `--viz-surface`, `--viz-card`, `--viz-row-hover`, `--viz-ink`, plus the categorical series. Chart colors come from these, never from the brand tokens.

## Dashboard patterns (the canonical primitives)

`src/components/Dashboard/` is a **today-first feed** for non-technical owners (`5ee2c91a3`, 2026-08-10): `TodayBand`, `WeekBand`, `SetupBand`, `HealthBand`, `GrowthBand`, `SuggestionsBand`, `WorthDoing`, `QuickActions`, `SiteTiles`, `FeedbackPrompt`, with the `Client`/`Loader` split (`Loader` is the skeleton matching the real layout, `Client` the hydrated dashboard). List the directory before citing a band; it changes.

- **`StatTile`, `PromoBanner`, `ActivityFeed` and `ActiveGroup` are DELETED.** Do not build from them, and do not reintroduce their shape.
- **No summary-tile rows (owner 2026-09-18).** Never draw a row of 3 or 4 summary tiles across the top of a page with the real content underneath: the strip nearly always repeats a number the destinations already carry. **A number lives on the thing it counts, and nowhere else.**
- **Usage: `UsagePanel` + `Group/UsageRow`** show used-vs-limit; near-limit is a peak moment (see ux-psychology peak-end). Reuse the Group usage flags (`pctOfQuota` / `nearQuota` / `overQuota`), never recompute percentages client-side.
- Carousels, wherever they appear, MUST have a Pause/Play control (WCAG 2.2.2).

## Shape, theme and installed-app rules (measured, easy to get wrong)

- **`rounded-md` is 10px, not 6px.** `--radius: 0.75rem` (`globals.css`) and `tailwind.config.ts` derive `lg` = 12px (cards), `md` = 10px (buttons, inputs, selects), `sm` = 8px. There is no 6px utility, which is why chips and state labels are written `rounded-[6px]` by hand.
- **Light-only.** A bare `dark:` utility is a bug: with no `@custom-variant dark`, Tailwind v4 resolves it against the OS `prefers-color-scheme` and paints dark styles on a permanently light surface (see "Light-only styling" above).
- **Design every change for the installed app (PWA standalone) as well as the mobile browser.** In standalone there is no browser chrome, so the top inset is the notch and the bottom inset the home indicator; padding right in one mode is wrong in the other, and only a real device shows it. The installed app is the main mobile view (owner 2026-10-06).
- **The app shell is `position: fixed`**, so an inline `position: fixed` overlay sits under the header and tab bar whatever its z-index. Portal every overlay, drawer, sheet and wizard to `document.body` (Radix dialogs already do).
- **iOS 26 and `black-translucent`.** With `apple-mobile-web-app-status-bar-style` `black-translucent` plus `viewport-fit=cover`, iOS 26.1+ keeps the status bar opaque and shrinks the web view (WebKit 301994), lifting every bottom bar about 57 pt with nothing CSS can reach. `src/app/layout.tsx` uses `content="default"`; never reintroduce black-translucent without a real-device test. A bottom-spacing bug the simulator does not reproduce is a device question first.

## Tier gating & overage patterns

- **Gate on the package helpers, never a hand-rolled tier set.** The quota-gate components (`CollectionObjects/Client`, `CollectionObjects/Wrapper`, `Integrations/Client`, `Sites/Client`, `Universal/SchemaFormDialog/Create` + `Update`) use `isUnlimited` from the tier-quotas package (read the declared pin from `package.json` and the installed one from the lockfile; they have disagreed before, and an old installed copy reads the capability flags as absent), **renamed from `isUnlimitedQuota`**; a local `<0` helper still named `isUnlimitedQuota` survives only in `src/lib/usage/format.ts`, `src/components/Group/UsagePanel`, and `src/components/Group/UsageRow`, don't "fix" those to the package name or vice versa.
- **`src/components/Group/OverageBillingSection/index.tsx`** + **`SpendingCapSection.tsx`**, the overage billing surface: auto-enroll disclosure copy plus a spending cap control with a "Default cap" badge. Copy this shape for any billing-disclosure panel (disclosure text adjacent to the control it explains, cap state as a badge not color alone).
- **Group `UsagePanel` free-tier upgrade banner**, near/over-quota state driven by the Group usage flags (cdn/api/agent buckets, each `pctOfQuota`/`nearQuota`/`overQuota`). This is the near-limit peak-moment upgrade CTA (see ux-psychology peak-end) implemented in practice, reuse the flags, don't recompute percentages client-side.
- **Studio `FooterEditor`** (`src/components/Sites/Studio/LeftRail/chrome/FooterEditor.tsx`) calls the package `canHidePoweredBy()` (which includes Basic) instead of a local tier set, so the permitted set lives in one place. **Read that set from the package rather than from here**: it has changed, and the renderer keeps a deliberate second copy for a build-token reason, so the two can drift. Tier copy accuracy matters: a tooltip once promised a multiple of the agent-action quota on the top plan when the two paid plans in fact shared one, and it was removed. **Read the quota from the package before writing any tier copy**, and remember the ladder itself has since changed shape, verify quota copy against tier-quotas before shipping it.

## Outreach list/detail conventions

`src/app/(app)/outreach/`, `companies/`, `contacts/`, `queue/`, `senders/`, `suppressions/`, `reach-out/` (the renamed cold-call console, channel `SegmentedControl` Calls/LinkedIn/Email; `cold-call/` survives as a redirect-only page) each as a route, plus `[id]/` for detail, a shared `layout.tsx`, `loading.tsx`, `error.tsx`. This is the **list-of-entities → detail** convention: a sectioned layout wrapper, per-entity list routes, a dynamic `[id]` detail, and admin-gated sub-sections. Mirror this structure for new multi-entity admin surfaces (list route + `[id]` detail + shared layout + loading/error boundaries).

## Admin tabbed-analytics pattern

> **DELETED from the portal 2026-09-28** (`e9262ba7`, the five admin analytics surfaces; `5ac18a32`, the flag console): operator tooling now lives in `vivreal-hq/packages/admin-app`, a separate app with its own dark theme. The pattern below is history; do not build a new internal surface in the portal from it.

`src/app/(app)/admin/page.tsx`, a `force-dynamic` server page that reads `active_ctx` from cookies, renders a header (icon chip `grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary` + `{...privacyUnmask}` title/subtitle) and a `<Suspense key={activeCtx}>` around the resolved `AdminTabs` client component. The `void activeCtx` + `Suspense key` is the intentional "remount on profile switch to force re-fetch" idiom. Constraint container is `max-w-6xl mx-auto px-4 ... `. Use this header+chip+tabs shape for new internal dashboards. The page is gated client-side (`usePermissions().canViewAttribution`) AND server-side (`ADMIN_EMAILS` fail-closed), internal pages need both. `src/components/Admin/` now also carries `EngagementPanel`, `FunnelPanel`, `TrafficPanel`, `StudioDemoVisitsPanel`, `shared.tsx`.

**Feature-flag console (DELETED 2026-09-28, see above)**, was a second internal surface: `src/app/(app)/admin/flags/page.tsx` + `src/components/Admin/FeatureFlagsPanel/`, gated by `usePermissions().canManageFeatureFlags` (`isGlobalAdmin`, **no** cohort/group condition, an operator must reach every group). The flag registry pattern (`defaultOn` + `confirmOff`) is deliberately retained even with one live flag (`aiActionsEnabled`), this is the internal-control-surface pattern for future flags.

## AI surfaces (`src/components/Agent/`)

> **The FAB, the drawer shell and `TasksPage` were DELETED 2026-09-24** (`939c27ed`, the assistant is retired); only the Studio `AiRail` and the drawer parts it reuses remain. See `vivreal-agent-knowledge`.

`AgentFab/`, `AgentDrawer/` (`ChatInput`, `MessageBubble`, `QuotaIndicator`, `ToolCallLog`), `StatusTicker.tsx`, `ConfirmationCard.tsx`, `TasksPage/{Client,Loader}`. Design rules: **hide, never disable** gated entry points (`useAgentAccess()` is the single access source); the FAB additionally hides on immersive routes (`isImmersiveRoute()`, Studio owns its own `AiRail`) and while the drawer is open; progress is a phrase-per-phase ticker (`StatusTicker`), never a token stream, and phrases never name a tool.

## Sites hub component vocabulary

`SiteCard/` (three-state logo skeleton fixing the "generic C" flash in `useSiteLogo`), `SiteAvatar.tsx` (adopts renderer `BrandMark`, **never crop a logo**; wide wordmarks fall back to a letter-mark or favicon), `SiteStatStrip`, `DomainBundleBanner`, `SiteManageHeader`/`SiteManageTabs` (centered manage tabs), `BuildProgress/` + `DeploymentStatusBadge` (watch-progress deploy checklist with a **monotonic stage ratchet**, status can only advance, never regress, regardless of event ordering). The `/social` hub layout runs health strip → cross-platform feed → schedule timeline → drafts.

## Responsive breakpoints

Tailwind defaults: `sm:640 md:768 lg:1024 xl:1280 2xl:1536`. The mobile bottom nav is visible below `md`; `--app-nav-height` drops to 0 at `md+` (`globals.css:118-122`). PWA: respect `env(safe-area-inset-*)` (the `.pwa-layout` shell already does `padding-top: env(safe-area-inset-top)`).

## Privacy masking (design-visible)

From `@/lib/privacy`: `{...privacyUnmask}` drives both Sentry Replay (`data-sentry-unmask`) and Clarity (`data-clarity-unmask`) in one spread. Everything is masked by default. Apply unmask ONLY to static, hardcoded chrome (nav labels, button text, tab labels, empty-state copy, hardcoded titles, see the admin page title/subtitle). NEVER unmask elements that render user-supplied or API-sourced data. Design for the masked state too, Replay will show blocks where sensitive data lives.
