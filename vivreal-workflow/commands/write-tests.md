---
description: Write comprehensive e2e tests for a feature, component, or page. Applies the Vivreal test quality standard — edge cases, error states, numeric safety, accessibility, breakpoints, and interaction coverage.
argument-hint: <feature-name or component-path>
---

You are writing Playwright e2e tests for the Vivreal Portal. The user invoked `/write-tests` with: **$ARGUMENTS**

## Step 1 — Understand the target

Read the following before writing any tests:
1. `e2e/TESTING.md` — fixtures, patterns, critical gotchas (especially SSR/hydration)
2. the `shared-standards` skill — project-wide quality rules
3. The component/page identified by `$ARGUMENTS` — read every file that renders the UI being tested
4. Any existing spec file for this feature — don't duplicate, gap-fill

Identify:
- Which fixture to use (`global-setup` for public pages, `auth-setup` for authenticated)
- Which API endpoints the component calls (browser-side calls can be mocked via `page.route()`)
- Which `data-testid` attributes exist (add them to the component if missing)
- Whether the page is SSR-rendered (server fetches bypass `page.route()` — document workaround)

## Step 2 — Apply the test quality checklist

For every component/feature, work through each category and write at least one test per applicable item. Skip items with a comment explaining why they don't apply.

### A. Render correctness
- [ ] Page/component mounts without crashing
- [ ] All expected headings, labels, and static copy are visible
- [ ] Data-testid attributes exist for all interactive and observable elements
- [ ] Loading/skeleton state renders while async data is in flight
- [ ] Empty state renders with correct message (not blank, not error)
- [ ] Populated state renders all expected items when data is present

### B. Numeric and data display safety
- [ ] No `NaN`, `undefined`, `Infinity`, or raw `-1` appears in rendered output when API returns zero/null values
- [ ] Percentages computed from quota/total handle `quota=0` without division-by-zero
- [ ] Bytes/file sizes format as human-readable strings (KB/MB/GB), not raw integers
- [ ] Counts render as `0` (not blank or NaN) when used=0 but quota>0
- [ ] Unlimited quotas (`quota=-1`) render "Unlimited", not "-1"
- [ ] Not-included quotas (`quota=0`) render "--" or "Not included", not "0/0" or "NaN%"
- [ ] Numbers that overflow 100% clamp to 100%, not 101%+

### C. Error and exception states
- [ ] API 500 error: component renders graceful fallback, not crash/blank
- [ ] API 401 error: triggers expected behavior (redirect to login or error message)
- [ ] Completely missing fields (null/undefined props): component renders with safe defaults
- [ ] Network timeout / empty response: component shows error or empty state, not frozen spinner
- [ ] Form submission failure: error message visible, form not cleared

### D. Interaction and user flows
- [ ] Primary action (create/save/submit button) triggers the correct API call
- [ ] API request body contains the expected fields and values
- [ ] Success path: UI updates to reflect the confirmed change (dialog closes, item appears/disappears)
- [ ] Cancel/dismiss: no API call is made, state is unchanged
- [ ] Destructive action (delete/reject): confirmation step exists before API call fires

### E. Accessibility (WAI-ARIA)
Follow [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/) for all role/property expectations.

**Interactive element names**
- [ ] All buttons, links, and inputs have an accessible name — test with `getByRole('button', { name: /…/ })` or assert `aria-label` attribute
- [ ] Icon-only buttons have an explicit `aria-label` (e.g., close, delete, toggle icons)
- [ ] Links have descriptive text — avoid "click here" or "read more" without context

**Landmark roles and structure**
- [ ] Page has a primary landmark (`<main>` or `role="main"`)
- [ ] Heading hierarchy is logical (h1 → h2 → h3); no skipped levels on a single page
- [ ] Navigation regions use `<nav>` with a distinct `aria-label` (e.g., `aria-label="Primary"`)

**Form accessibility**
- [ ] Every form input is associated with a `<label>` via `for`/`id` or `aria-label`
- [ ] Required fields use `aria-required="true"` or the `required` attribute
- [ ] Validation error messages are linked to their input via `aria-describedby`
- [ ] Submit buttons are not disabled via CSS alone — use the `disabled` attribute

**Widget roles and states (ARIA patterns)**
- [ ] Progress bars: `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- [ ] Toggle buttons: `aria-pressed="true/false"` reflects current state
- [ ] Dialogs: focus is trapped inside the dialog and restored on close; `role="dialog"` with `aria-labelledby`
- [ ] Expandable sections: `aria-expanded="true/false"` on the trigger matches visibility of the panel
- [ ] Checkboxes / radios: `aria-checked` or native `checked` matches visual state
- [ ] Tabs: `role="tablist"` + `role="tab"` with `aria-selected`; active panel has `role="tabpanel"`
- [ ] Menus: `role="menu"` + `role="menuitem"`; keyboard navigation (arrow keys, Escape) works

**Live regions and dynamic content**
- [ ] Status messages (success toasts, loading state) are in an `aria-live="polite"` region
- [ ] Error messages (form errors, API errors) are in an `aria-live="assertive"` region or auto-focused
- [ ] Loading spinners have `aria-label` or are paired with a visually-hidden status text

**Keyboard navigation**
- [ ] All interactive elements reachable via Tab key (no keyboard traps outside dialogs)
- [ ] Custom widgets follow ARIA keyboard conventions: Enter/Space to activate, Escape to dismiss, arrow keys for composite widgets

**How to write accessibility assertions in Playwright:**
```typescript
// Prefer role-based queries (most reliable against a11y regressions)
await expect(page.getByRole('button', { name: /Submit/i })).toBeVisible();
await expect(page.getByRole('dialog', { name: /Confirm delete/i })).toBeVisible();

// Verify ARIA attributes
await expect(page.locator('[role="progressbar"]')).toHaveAttribute('aria-valuenow');
await expect(page.getByRole('button', { name: /Close/i })).toHaveAttribute('aria-label');

// Verify disabled state (not just opacity)
await expect(page.getByRole('button', { name: /Submit/i })).toBeDisabled();

// Verify aria-expanded on a trigger
await expect(page.getByRole('button', { name: /Expand/i })).toHaveAttribute('aria-expanded', 'false');
await page.getByRole('button', { name: /Expand/i }).click();
await expect(page.getByRole('button', { name: /Expand/i })).toHaveAttribute('aria-expanded', 'true');

// Check heading exists with correct level
await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

// Verify live region present
await expect(page.locator('[aria-live]')).toBeAttached();
```

### F. Responsive / breakpoint behavior
- [ ] At mobile width (375px): no horizontally overflowing content, all controls reachable
- [ ] At tablet width (768px): layout switches correctly (e.g., side-by-side vs stacked)
- [ ] At desktop width (1280px): full layout renders without collapsed/hidden primary content
- [ ] Tab-only UI elements (hidden mobile / hidden desktop): test via URL deep-link, not click

### G. Permission / role gating
- [ ] Admin/owner-gated UI is hidden when `canApprove`/`canManage` is false
- [ ] Admin/owner-gated UI is visible when permissions are true (auth fixture seeds `isOwner: true, isAdmin: true`)
- [ ] Feature-gated UI (paid-tier only): free-tier gate renders correctly in default SSR state

### H. Real-time / WebSocket injection
- [ ] If the feature listens to `socket:*` events, wait for `__reactProps` hydration before dispatching
- [ ] Injected item appears in the list without page reload
- [ ] Injected item with edge-case data (missing fields) renders without crash

## Step 3 — Write the spec file

Follow these conventions from `e2e/TESTING.md`:

```typescript
import { test, expect } from './fixtures/auth-setup'; // or global-setup for public
// NEVER import from '@playwright/test' directly

test.describe.configure({ mode: 'serial', timeout: 90_000 });

// Group tests logically — one describe per state/view
test.describe('Feature — state/scenario', () => {
  test('description of the specific assertion', async ({ page }) => {
    // Setup: mock APIs before navigation
    // Action: navigate, wait for element, interact
    // Assert: specific, minimal, targeted check
  });
});
```

### Required patterns

**Hydration wait before clicking or injecting:**
```typescript
await page.waitForFunction(
  () => {
    const el = document.querySelector('[data-testid="my-element"]');
    return !!el && Object.keys(el).some((k) => k.startsWith('__reactProps'));
  },
  { timeout: 10_000 },
);
```

**postDataJSON (synchronous — use try/catch, not .catch()):**
```typescript
let body: Record<string, unknown> | null = null;
try { body = route.request().postDataJSON() as Record<string, unknown>; } catch { /* no body */ }
```

**SSR-dependent mock with graceful skip:**
```typescript
const hasMockedData = await page.locator('text=Expected Value').first().isVisible().catch(() => false);
if (!hasMockedData) {
  // SSR timing limitation — assert NaN guard still holds
  const text = await page.locator('[data-testid="my-panel"]').first().textContent();
  expect(text).not.toContain('NaN');
  return;
}
// Full assertions when SSR mock landed
```

**NaN/exception guard test:**
```typescript
// Use innerText() not textContent() — textContent() includes Next.js inline <script>
// serialization which contains the literal word "undefined", causing false positives.
const panelText = await page.locator('[data-testid="my-panel"]').first().innerText();
expect(panelText).not.toContain('NaN');
expect(panelText).not.toContain('undefined');
expect(panelText).not.toContain('Infinity');
```

**Responsive breakpoint test:**
```typescript
await page.setViewportSize({ width: 375, height: 812 }); // mobile
// ... assert layout
await page.setViewportSize({ width: 1280, height: 720 }); // desktop
// ... assert layout
```

## Step 4 — Run and verify

```bash
PLAYWRIGHT_EXTERNAL_WEBSERVER=1 npx playwright test --project=chromium e2e/your-feature.spec.ts
```

Tests MUST:
- FAIL on the current code if they're regression guards for a known bug
- PASS on the fixed/current code
- NOT use `waitForTimeout` except as a last resort (prefer `waitFor`, `toBeVisible`, `waitForFunction`)

## Step 5 — Update test infrastructure if needed

If new mock functions are needed, add them to `e2e/fixtures/api-mocks.ts`.
If new test data is needed, add exports to `e2e/fixtures/test-data.ts`.
Update the file count in `e2e/TESTING.md` and the File Structure table.

## Output

1. The complete spec file at `e2e/your-feature.spec.ts`
2. Any additions to `api-mocks.ts` and `test-data.ts`
3. Test run output showing pass/fail
4. A list of any checklist items skipped and why
