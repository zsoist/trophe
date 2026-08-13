# Trophē Theme, Accessibility, and Responsive-System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a coherent, readable, responsive, motion-safe light and dark experience across every Trophē route, verify all critical flows, and deploy the proven release to production.

**Architecture:** `app/globals.css` becomes the canonical semantic token layer, while `lib/theme.ts` and `ThemeModeProvider` share one validated theme-state contract from pre-paint through runtime navigation. Existing UI primitives, shells, route families, charts, and overlays migrate to semantic roles in reviewable slices; static checks and authenticated browser tests prevent dark-only styling, low contrast, undersized targets, overflow, or inaccessible controls from returning.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5 strict, Tailwind CSS 4, CSS custom properties, Lucide React, Vitest 4, Testing Library, Playwright 1.59, Supabase local auth, Vercel production deployment.

## Global Constraints

- Preserve Trophē's warm black, stone, gold, Inter, Instrument Serif, and JetBrains Mono identity.
- Meet WCAG 2.2 AA contrast for text, meaningful icons, focus indicators, controls, and component boundaries; primary reading text should approach AAA where practical.
- Functional text must be at least 12px; default body copy must be at least 14px; mobile form text uses 16px where necessary to prevent iOS zoom.
- Primary pointer targets and icon-only controls expose at least a 44 by 44 CSS-pixel hit area and an accessible name.
- Verify 390 by 844, 768 by 1024, 1280 by 900, 320px minimum width, landscape mobile, and 200% zoom/reflow.
- Theme selection applies before first paint and persists across navigation, reload, logout, and client/coach/admin/super-admin transitions.
- Theme switching does not remount route trees, refetch data, or add a runtime UI dependency.
- Reduced-motion mode disables nonessential entrance, looping, shimmer, rotating, modal, sheet, and chart animation.
- No database migration, nutrition-calculation change, AI-routing change, or paid AI provider call belongs in this release.
- Every task ends with targeted tests and a reviewable commit; deployment occurs only after the complete verification matrix is green.

## File and Responsibility Map

### New files

- `lib/theme.ts` — pure theme validation, initial-state resolution, DOM application, and metadata color mapping.
- `tests/components/theme-contract.test.ts` — stylesheet token completeness, contrast, focus, text-floor, and reduced-motion gate.
- `tests/components/theme-mode.test.ts` — pure theme helpers and provider source contract.
- `tests/components/ui-accessibility-contract.test.ts` — primitive target, focus, label, surface, and tab contract.
- `tests/enterprise/theme-inventory.test.ts` — static guard for migrated files.
- `components/shared/AppHeader.tsx` — shared authenticated header with theme access.
- `components/admin/AdminShell.tsx` — consistent admin/super frame and responsive actions.
- `lib/auth/recover-browser-session.ts` — one-shot invalid-refresh recovery.
- `tests/auth/browser-session-recovery.test.ts` — stale-token and valid-session recovery contract.
- `e2e/theme-accessibility.spec.ts` — complete public/authenticated theme matrix.
- `e2e/helpers/auth.ts` — reusable role login and local test-user helpers.
- `e2e/helpers/accessibility.ts` — overflow, target-size, accessible-name, and theme checks.
- `scripts/ci/check-theme-inventory.mjs` — deterministic source guard.
- `scripts/ops/canary-theme-readonly.mjs` — production theme canary that blocks paid AI routes.

### Canonical existing files

- `app/globals.css` — semantic tokens, base focus/control/motion recipes, and shrinking legacy aliases.
- `app/layout.tsx` — pre-paint theme script and metadata.
- `components/shared/ThemeMode.tsx` — runtime provider and shared toggle.
- `components/ui/{Button,Card,Tabs,BotNav,ConfirmSheet}.tsx` — shared interactions and surfaces.
- `components/coach/CoachNav.tsx` — responsive coach navigation.
- `app/login/page.tsx` — recoverable password/magic-link/signup entry.
- Route files under `app/dashboard`, `app/coach`, `app/admin`, and `app/super` — route-family consumers; reusable behavior stays in primitives.

---

### Task 1: Semantic Theme Tokens and Contrast Gate

**Files:**
- Modify: `app/globals.css`
- Create: `tests/components/theme-contract.test.ts`
- Test: `tests/components/parsed-food-list-light-mode.test.ts`

**Interfaces:**
- Consumes: existing `:root`, `.light`, `--bg-*`, `--t*`, `--line*`, and appearance palette variables.
- Produces: semantic canvas, surface, content, border, interaction, status, chart, and elevation variables in both themes.

- [ ] **Step 1: Write the failing token and contrast test**

Create a PostCSS-based test with the exact token inventory:

```ts
const requiredTokens = [
  '--canvas', '--canvas-subtle', '--canvas-inverse',
  '--surface-1', '--surface-2', '--surface-3', '--surface-hover', '--surface-active', '--surface-overlay',
  '--content-primary', '--content-secondary', '--content-muted', '--content-inverse', '--content-disabled',
  '--border-subtle', '--border-default', '--border-strong', '--border-focus',
  '--action-primary', '--action-primary-hover', '--action-on-primary', '--action-secondary', '--focus-ring',
  '--status-success-fg', '--status-success-bg', '--status-success-border',
  '--status-warning-fg', '--status-warning-bg', '--status-warning-border',
  '--status-danger-fg', '--status-danger-bg', '--status-danger-border',
  '--status-info-fg', '--status-info-bg', '--status-info-border',
  '--data-calories', '--data-protein', '--data-carbs', '--data-fat', '--data-fiber', '--data-sugar', '--data-neutral',
  '--shadow-low', '--shadow-medium', '--shadow-high',
] as const;

for (const selector of [':root', '.light']) {
  for (const token of requiredTokens) expect(declaration(selector, token)).toBeTruthy();
  expect(contrast(selector, '--content-primary', '--canvas')).toBeGreaterThanOrEqual(7);
  expect(contrast(selector, '--content-secondary', '--canvas')).toBeGreaterThanOrEqual(4.5);
  expect(contrast(selector, '--content-muted', '--canvas')).toBeGreaterThanOrEqual(4.5);
  expect(contrast(selector, '--action-on-primary', '--action-primary')).toBeGreaterThanOrEqual(4.5);
}
```

- [ ] **Step 2: Run the focused tests and confirm the new contract fails**

```bash
npx vitest run tests/components/theme-contract.test.ts tests/components/parsed-food-list-light-mode.test.ts
```

Expected: the new test fails on absent tokens; the existing portion-review contract remains green.

- [ ] **Step 3: Add dark and light semantic token blocks**

Use opaque colors for tested foreground pairs and map legacy aliases to the new roles:

```css
:root {
  --canvas: #0A0A0A;
  --canvas-subtle: #111111;
  --surface-1: #141414;
  --surface-2: #1A1A1A;
  --surface-3: #242424;
  --content-primary: #FAFAF9;
  --content-secondary: #D6D3D1;
  --content-muted: #A8A29E;
  --action-primary: #D4A853;
  --action-on-primary: #1C1917;
  --focus-ring: #E8C078;
}
.light {
  --canvas: #FAFAF9;
  --canvas-subtle: #F5F5F4;
  --surface-1: #FFFFFF;
  --surface-2: #F5F5F4;
  --surface-3: #E7E5E4;
  --content-primary: #1C1917;
  --content-secondary: #44403C;
  --content-muted: #57534E;
  --action-primary: #8B6E2B;
  --action-on-primary: #FFFFFF;
  --focus-ring: #7C5C19;
}
```

Change a token value rather than weakening the test when a pair misses contrast.

- [ ] **Step 4: Add global focus and reduced-motion recipes**

Add a two-pixel `:focus-visible` outline with offset, native/ARIA disabled parity, and a reduced-motion block that disables `.toast-in`, `.toast-bar`, `.theme-icon-in`, `.skeleton::after`, smooth scrolling, modal/sheet transforms, and nonessential transitions.

- [ ] **Step 5: Run the focused tests until green**

```bash
npx vitest run tests/components/theme-contract.test.ts tests/components/parsed-food-list-light-mode.test.ts
```

- [ ] **Step 6: Commit the semantic foundation**

```bash
git add app/globals.css tests/components/theme-contract.test.ts
git diff --cached --stat
git commit -m "feat(theme): establish accessible semantic tokens"
```

---

### Task 2: First-Paint Theme State and Runtime Synchronization

**Files:**
- Create: `lib/theme.ts`
- Create: `tests/components/theme-mode.test.ts`
- Modify: `components/shared/ThemeMode.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/manifest.ts`

**Interfaces:**
- Consumes: `trophe_theme_mode` and Task 1 tokens.
- Produces: `ThemeMode = 'dark' | 'light'`, `isThemeMode(value: unknown): value is ThemeMode`, `resolveInitialTheme(storageValue: string | null, rootClass: string): ThemeMode`, `applyThemeMode(mode: ThemeMode, document: Document): void`, and a synchronized provider.

- [ ] **Step 1: Write failing pure-function and provider tests**

```ts
expect(isThemeMode('light')).toBe(true);
expect(isThemeMode('sepia')).toBe(false);
expect(resolveInitialTheme('light', 'font-vars h-full light')).toBe('light');
expect(resolveInitialTheme('dark', 'font-vars h-full light')).toBe('light');
expect(resolveInitialTheme('sepia', 'font-vars h-full')).toBe('dark');
```

Assert `applyThemeMode` leaves one theme class, updates `style.colorScheme`, updates `meta[name="theme-color"]`, and the toggle source contains `min-h-11 min-w-11`.

- [ ] **Step 2: Verify the test fails**

```bash
npx vitest run tests/components/theme-mode.test.ts
```

- [ ] **Step 3: Implement the pure theme module**

```ts
export type ThemeMode = 'dark' | 'light';
export const THEME_STORAGE_KEY = 'trophe_theme_mode';
export const THEME_COLOR: Record<ThemeMode, string> = { dark: '#0A0A0A', light: '#FAFAF9' };
export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'dark' || value === 'light';
}
```

`applyThemeMode` removes both classes, adds one, sets `colorScheme`, and updates the theme-color meta element.

- [ ] **Step 4: Lazy-initialize the provider from the pre-painted DOM**

Initialize state with `resolveInitialTheme(readStorage(), document.documentElement.className)`, guard browser storage failures, remove mount-time correction, and make the toggle 44px with semantic focus/hover states.

- [ ] **Step 5: Synchronize the pre-paint script and metadata**

Keep the inline script as the only allowed `dangerouslySetInnerHTML`, validate only light/dark, remove stale theme classes, set `color-scheme`, and update theme-color before paint.

- [ ] **Step 6: Run theme and invariant tests**

```bash
npx vitest run tests/components/theme-mode.test.ts tests/enterprise/invariants.test.ts
```

- [ ] **Step 7: Commit synchronized theme state**

```bash
git add lib/theme.ts tests/components/theme-mode.test.ts components/shared/ThemeMode.tsx app/layout.tsx app/manifest.ts
git diff --cached --stat
git commit -m "fix(theme): synchronize first paint and runtime mode"
```

---

### Task 3: Accessible UI Primitive Contract

**Files:**
- Modify: `components/ui/Button.tsx`
- Modify: `components/ui/Card.tsx`
- Modify: `components/ui/Tabs.tsx`
- Modify: `components/ui/ConfirmSheet.tsx`
- Modify: `components/ui/index.ts`
- Create: `tests/components/ui-accessibility-contract.test.ts`

**Interfaces:**
- Consumes: Task 1 tokens.
- Produces: semantic `Button`, required-label `IconButton`, backward-compatible `BtnGold`/`BtnGhost`, `Card`, keyboard tabs, and accessible confirmation sheet.

- [ ] **Step 1: Write failing primitive contracts**

```ts
expect(buttonSource).toContain("variant?: 'primary' | 'secondary' | 'ghost' | 'danger'");
expect(buttonSource).toContain('min-h-11');
expect(buttonSource).toContain('min-w-11');
expect(buttonSource).toContain('type IconButtonProps');
expect(cardSource).toContain('var(--surface-1)');
expect(tabsSource).toContain('aria-controls');
expect(tabsSource).toContain('onKeyDown');
expect(tabsSource).toContain('min-h-11');
```

- [ ] **Step 2: Verify failures**

```bash
npx vitest run tests/components/ui-accessibility-contract.test.ts
```

- [ ] **Step 3: Implement Button and IconButton**

All button sizes keep `min-h-11`; `IconButton` requires `aria-label: string` and uses `min-h-11 min-w-11`. Keep existing exports as wrappers so route migration can be incremental.

- [ ] **Step 4: Convert Card and ConfirmSheet to semantic roles**

Use semantic surfaces/borders/elevation. Wire `role="alertdialog"`, title, description, Escape, focus return, safe-area padding, and motion reduction for confirmations.

- [ ] **Step 5: Add keyboard-correct tabs**

Give tabs stable ids, `aria-controls`, roving `tabIndex`, ArrowLeft/ArrowRight/Home/End behavior, 44px height, 12px text, and mobile edge-fade overflow affordance.

- [ ] **Step 6: Run tests and TypeScript**

```bash
npx vitest run tests/components/ui-accessibility-contract.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit primitives**

```bash
git add components/ui tests/components/ui-accessibility-contract.test.ts
git diff --cached --stat
git commit -m "feat(ui): enforce accessible interaction primitives"
```

---

### Task 4: Authenticated Shells and Reachable Navigation

**Files:**
- Create: `components/shared/AppHeader.tsx`
- Create: `components/admin/AdminShell.tsx`
- Modify: `components/ui/BotNav.tsx`
- Modify: `components/coach/CoachNav.tsx`
- Modify: `app/dashboard/layout.tsx`
- Modify: `app/coach/layout.tsx`
- Modify: `app/admin/layout.tsx`
- Modify: `app/super/layout.tsx`
- Modify: `app/coach/page.tsx`
- Create: `tests/components/navigation-accessibility.test.ts`

**Interfaces:**
- Consumes: theme toggle, IconButton, semantic roles.
- Produces: shared headers, theme-correct bottom nav, explicit coach More menu, and admin/super shells.

- [ ] **Step 1: Write failing navigation tests**

Assert bottom-nav links have 44px targets and semantic surfaces, coach nav has `More coach destinations`, admin/super layouts render `AdminShell`, and every role area exposes the theme toggle.

- [ ] **Step 2: Confirm current failures**

```bash
npx vitest run tests/components/navigation-accessibility.test.ts
```

- [ ] **Step 3: Implement AppHeader and AdminShell**

`AppHeader` accepts `title`, `eyebrow`, `backHref`, and `actions`, renders skip target, 44px theme control, semantic sticky surface, and safe-area padding. `AdminShell` accepts title/eyebrow/children/actions and provides a readable responsive container.

- [ ] **Step 4: Fix bottom navigation**

Replace forced black with semantic overlay/border/content/action roles; make links at least 56px high; keep safe-bottom; replace spring scale with color/opacity and no transform under reduced motion.

- [ ] **Step 5: Make coach destinations explicit**

Show Clients, Calendar, Inbox, and Habits below 768px. Put Protocols, Foods, Templates, and Intake in a keyboard/Escape-safe More disclosure. Render the full row on wider screens.

- [ ] **Step 6: Mount shell-level theme access**

Add shared headers to all role layouts, remove the duplicate coach-page-only toggle, and preserve feedback/install providers.

- [ ] **Step 7: Run navigation regressions**

```bash
npx vitest run tests/components/navigation-accessibility.test.ts tests/components/profile-persistence.test.ts tests/components/install-card-hydration.regression-1.test.ts
npm run typecheck
```

- [ ] **Step 8: Commit shells and navigation**

```bash
git add components/shared/AppHeader.tsx components/admin/AdminShell.tsx components/ui/BotNav.tsx components/coach/CoachNav.tsx app/dashboard/layout.tsx app/coach/layout.tsx app/admin/layout.tsx app/super/layout.tsx app/coach/page.tsx tests/components/navigation-accessibility.test.ts
git diff --cached --stat
git commit -m "fix(navigation): make every role theme-aware and reachable"
```

---

### Task 5: Public, Authentication, Onboarding, and Session Recovery

**Files:**
- Create: `lib/auth/recover-browser-session.ts`
- Create: `tests/auth/browser-session-recovery.test.ts`
- Modify: `app/login/page.tsx`
- Modify: `app/activate/page.tsx`
- Modify: `app/signup/page.tsx`
- Modify: `app/onboarding/page.tsx`
- Modify: `app/offline/page.tsx`
- Modify: `components/landing/LandingPage.tsx`
- Modify: `app/pricing/page.tsx`
- Modify: `app/trust/page.tsx`
- Modify: `app/es/page.tsx`
- Modify: `app/el/page.tsx`
- Modify: `e2e/core-flows.spec.ts`
- Modify: `e2e/public-language.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces: `recoverInvalidBrowserSession(error: unknown, signOut: () => Promise<unknown>): Promise<'recovered' | 'unchanged'>` and themed public/auth flows.

- [ ] **Step 1: Write failing recovery tests**

```ts
await expect(recoverInvalidBrowserSession(
  { name: 'AuthApiError', message: 'Invalid Refresh Token: Refresh Token Not Found' },
  signOut,
)).resolves.toBe('recovered');
expect(signOut).toHaveBeenCalledTimes(1);
await expect(recoverInvalidBrowserSession(new Error('Failed to fetch'), signOut)).resolves.toBe('unchanged');
```

- [ ] **Step 2: Confirm the test fails**

```bash
npx vitest run tests/auth/browser-session-recovery.test.ts
```

- [ ] **Step 3: Implement one-shot recovery**

Only recognized invalid-refresh signatures call `supabase.auth.signOut({ scope: 'local' })`; guard against loops; render the form without reload; never clear a valid session or convert network errors into sign-out.

- [ ] **Step 4: Migrate auth and onboarding surfaces**

Replace dark-only colors, 10px/11px functional copy, 36px controls, and dark inputs with semantic canvas/card/content/field recipes. Add labels or accessible names and a reachable theme toggle.

- [ ] **Step 5: Migrate public/localized/offline surfaces**

Preserve artwork and typography while converting section/card/footer states to semantic roles and 44px public navigation/CTA targets.

- [ ] **Step 6: Expand public browser tests**

Loop `/`, `/es`, `/el`, `/pricing`, `/trust`, `/login`, `/signup`, `/activate`, `/onboarding`, and `/offline` through both themes at 390px; assert one theme class, no horizontal overflow, visible toggle, and readable interactive text.

- [ ] **Step 7: Run public/auth tests**

```bash
npx vitest run tests/auth/browser-session-recovery.test.ts tests/auth/callback-login-contract.test.ts tests/auth/signup-destination.test.ts
npx playwright test e2e/core-flows.spec.ts e2e/public-language.spec.ts --project=mobile-chromium
```

- [ ] **Step 8: Commit public/auth migration**

```bash
git add lib/auth/recover-browser-session.ts tests/auth/browser-session-recovery.test.ts app/login app/activate app/signup app/onboarding app/offline components/landing app/pricing app/trust app/es app/el e2e/core-flows.spec.ts e2e/public-language.spec.ts
git diff --cached --stat
git commit -m "fix(auth): recover stale sessions and theme public flows"
```

---

### Task 6: Client Core Routes

**Files:**
- Modify: `app/dashboard/page.tsx`
- Modify: `app/dashboard/log/page.tsx`
- Modify: `app/dashboard/progress/page.tsx`
- Modify: `app/dashboard/profile/page.tsx`
- Modify: `components/meals/MealSlotCard.tsx`
- Modify: `components/meals/MealSlotConfig.tsx`
- Modify: `components/progress/CustomizeSheet.tsx`
- Modify: `components/progress/DayComparison.tsx`
- Modify: `components/shared/ThemePicker.tsx`
- Modify: `e2e/settings-flows.spec.ts`
- Create: `tests/components/client-theme-contract.test.ts`

**Interfaces:**
- Consumes: semantic primitives and synchronized theme state.
- Produces: theme-correct home, log, progress, and profile routes with reachable water, date, meal, appearance, and progress controls.

- [ ] **Step 1: Write a failing client-core inventory test**

Scan the listed files for `bg-stone-9`, `text-stone-[1-6]`, `bg-white/[`, `border-white/[`, functional 9px/10px/11px text, and unlabeled water buttons. Allow a dark camera/media canvas only when marked `data-theme-exempt="media-canvas"`.

- [ ] **Step 2: Run the inventory and record failures**

```bash
npx vitest run tests/components/client-theme-contract.test.ts
```

- [ ] **Step 3: Migrate dashboard home**

Convert macro, training, habit, water, quick action, coach message, loading, and empty states to semantic roles. Give droplets names such as `Log water cup 1`, 44px wrappers, and pressed state; reserve safe bottom-nav space.

- [ ] **Step 4: Migrate food log and meal slots**

Make previous/next date, Today, day chips, meal cards, Skip, Analyze recipe, close, portion, and save actions meet target/text floors without changing food persistence or parsing behavior.

- [ ] **Step 5: Migrate progress/profile/appearance surfaces**

Use semantic chart, card, accordion, tab, and input states. Replace hardcoded-dark ThemePicker, make tabs keyboard reachable and 44px, prevent last-tab clipping, and retain accent/chart/density persistence.

- [ ] **Step 6: Extend client browser coverage**

Add light/dark persistence across the four routes; assert bottom nav changes theme, toggle stays visible, profile tabs remain reachable at 390px, and water buttons all have names and 44px boxes.

- [ ] **Step 7: Run client regressions**

```bash
npx vitest run tests/components/client-theme-contract.test.ts tests/components/parsed-food-list-light-mode.test.ts tests/components/profile-persistence.test.ts tests/components/food-log-load-consistency.test.ts tests/components/food-log-delete-persistence.test.ts
npx playwright test e2e/settings-flows.spec.ts --project=mobile-chromium
```

- [ ] **Step 8: Commit client core migration**

```bash
git add app/dashboard/page.tsx app/dashboard/log/page.tsx app/dashboard/progress/page.tsx app/dashboard/profile/page.tsx components/meals components/progress components/shared/ThemePicker.tsx e2e/settings-flows.spec.ts tests/components/client-theme-contract.test.ts
git diff --cached --stat
git commit -m "fix(client): migrate core routes to accessible themes"
```

---

### Task 7: Client Secondary Routes, Food, Workout, and Global Overlays

**Files:**
- Modify: `app/dashboard/book/page.tsx`
- Modify: `app/dashboard/checkin/page.tsx`
- Modify: `app/dashboard/intake/page.tsx`
- Modify: `app/dashboard/messages/page.tsx`
- Modify: `app/dashboard/supplements/page.tsx`
- Modify: `app/dashboard/workout/page.tsx`
- Modify: `app/dashboard/workout/history/page.tsx`
- Modify: `app/dashboard/workout/stats/page.tsx`
- Modify: `app/dashboard/workout/form-check/page.tsx`
- Modify: `components/food/*.tsx`
- Modify: `components/workout/*.tsx`
- Modify: `components/health/*.tsx`
- Modify: `components/shared/ChatThread.tsx`
- Modify: `components/shared/CalendarView.tsx`
- Create: `tests/components/client-secondary-theme-contract.test.ts`

**Interfaces:**
- Consumes: Task 6 media-canvas exemption and semantic primitives.
- Produces: all remaining client workflows and shared food/workout/health surfaces in both themes.

- [ ] **Step 1: Write the failing secondary inventory**

Scan exact files/globs for dark-only colors, functional text below 12px, fixed overlays without `safe-bottom`, close buttons below 44px, and icon buttons without names.

- [ ] **Step 2: Run and group failures by route family**

```bash
npx vitest run tests/components/client-secondary-theme-contract.test.ts
```

- [ ] **Step 3: Migrate booking, check-in, intake, messages, and supplements**

Preserve persistence logic while applying semantic forms, validation, calendars, message bubbles, protocols, empty/pending states, and named 44px voice/submit controls.

- [ ] **Step 4: Migrate workout routes/components**

Theme session cards, exercise picker, history, stats, form-check, pain dialog, and guided controls. Black video/camera remains only under `data-theme-exempt="media-canvas"`; surrounding controls use semantic roles.

- [ ] **Step 5: Migrate food, health, chat, and calendar overlays**

Replace hardcoded sheet/dropdown/tooltip/progress/macro recipes. Every sheet gets safe area, semantic overlay/surface, Escape, visible focus, named close control, and reduced motion.

- [ ] **Step 6: Run secondary functional tests**

```bash
npx vitest run tests/components/client-secondary-theme-contract.test.ts tests/components/chat-send-failure.test.ts tests/components/chat-voice-note.test.ts tests/components/intake-voice.test.ts tests/components/quick-food-input-boundaries.test.ts tests/components/portion-controls.test.ts tests/workout/workout-write-verification.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit remaining client surfaces**

```bash
git add app/dashboard/book app/dashboard/checkin app/dashboard/intake app/dashboard/messages app/dashboard/supplements app/dashboard/workout components/food components/workout components/health components/shared/ChatThread.tsx components/shared/CalendarView.tsx tests/components/client-secondary-theme-contract.test.ts
git diff --cached --stat
git commit -m "fix(client): theme secondary nutrition and workout flows"
```

---

### Task 8: Coach Roster and Client Workspace

**Files:**
- Modify: `app/coach/page.tsx`
- Modify: `app/coach/client/[id]/page.tsx`
- Modify: `app/coach/client/[id]/plan/page.tsx`
- Modify: `app/coach/client/[id]/memory/page.tsx`
- Modify: `components/coach/ClientViewSettings.tsx`
- Modify: `components/coach/CustomizePanelsBar.tsx`
- Modify: `components/coach/MealPatternView.tsx`
- Modify: `components/coach/ClientFoodHeatmap.tsx`
- Modify: `components/coach/CoachInsightPanel.tsx`
- Create: `tests/components/coach-core-theme-contract.test.ts`

**Interfaces:**
- Consumes: responsive CoachNav, AppHeader, semantic primitives.
- Produces: readable roster/search/filter and client assessment/plan/memory workspace without obscuring trays.

- [ ] **Step 1: Write the failing coach-core inventory**

Reject functional text below 12px, dark-only colors, a fixed action bar without matching content bottom inset, and client filter/actions below 44px.

- [ ] **Step 2: Confirm current failures**

```bash
npx vitest run tests/components/coach-core-theme-contract.test.ts
```

- [ ] **Step 3: Migrate roster/search/filters/business summary/client cards**

Use semantic panels, input, badges, text-plus-icon statuses, and 44px actions. Preserve roster queries, search, inline notes, comparison, batch actions, and large-text preference.

- [ ] **Step 4: Migrate client assessment/dashboard panels**

Theme assessment, plan badge, macro cards, adherence, notes, edit targets, and charts. Replace the overlapping tray with a sticky action region and `padding-bottom: calc(var(--coach-action-height) + env(safe-area-inset-bottom))`.

- [ ] **Step 5: Migrate plan and memory**

Keep desktop density and provide single-column mobile reflow, 44px save/delete/reorder controls, semantic cards/tables, readable timestamps, and unclipped keyboard focus.

- [ ] **Step 6: Run coach-core regressions**

```bash
npx vitest run tests/components/coach-core-theme-contract.test.ts tests/components/coach-plan-load-boundary.test.ts tests/components/coach-plan-save-feedback.test.ts tests/components/coach-habit-action-feedback.test.ts tests/components/coach-insight-panel.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit coach core**

```bash
git add app/coach/page.tsx app/coach/client components/coach tests/components/coach-core-theme-contract.test.ts
git diff --cached --stat
git commit -m "fix(coach): migrate roster and client workspace themes"
```

---

### Task 9: Coach Operational Routes and Modal Library

**Files:**
- Modify: `app/coach/calendar/page.tsx`
- Modify: `app/coach/foods/page.tsx`
- Modify: `app/coach/habits/page.tsx`
- Modify: `app/coach/inbox/page.tsx`
- Modify: `app/coach/inbox/[clientId]/page.tsx`
- Modify: `app/coach/invite/page.tsx`
- Modify: `app/coach/protocols/page.tsx`
- Modify: `app/coach/questionnaires/page.tsx`
- Modify: `app/coach/templates/page.tsx`
- Modify: remaining `components/coach/*.tsx`
- Create: `tests/components/coach-secondary-theme-contract.test.ts`

**Interfaces:**
- Consumes: coach shell/navigation and semantic primitives.
- Produces: all coach operational routes, sheets, modals, dropdowns, charts, and states in both themes.

- [ ] **Step 1: Write the failing coach-secondary inventory**

Reject hardcoded dark colors, 9px/10px/11px functional labels, modal/dropdown controls below 44px, overlays without reduced motion, and hidden primary destinations.

- [ ] **Step 2: Confirm failure list**

```bash
npx vitest run tests/components/coach-secondary-theme-contract.test.ts
```

- [ ] **Step 3: Migrate calendar, inbox/thread, invite, questionnaires**

Theme date inputs, availability, messages, empty states, invitation fields, question editors, validation, and actions at 320px without abbreviated sub-12px copy.

- [ ] **Step 4: Migrate foods, habits, protocols, templates**

Theme search/filter/create/edit/delete states, libraries, dropdowns, builder rows, exercise editors, and confirmations while preserving CRUD/feedback behavior.

- [ ] **Step 5: Migrate remaining coach panels and modals**

Convert BatchHabitAssign, ShoppingListModal, MacroRollupModal, MealSuggestPicker, ProtocolTemplateLibrary, planners, charts, and analysis cards; enforce safe-bottom, focus, Escape, metadata floor, and reduced motion.

- [ ] **Step 6: Run coach route regressions**

```bash
npx vitest run tests/components/coach-secondary-theme-contract.test.ts tests/components/coach-meal-plan-save-feedback.test.ts tests/components/macro-suggestion-feedback.test.ts tests/api/coach-shopping-list-safety.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit coach operations**

```bash
git add app/coach components/coach tests/components/coach-secondary-theme-contract.test.ts
git diff --cached --stat
git commit -m "fix(coach): theme operational routes and overlays"
```

---

### Task 10: Admin and Super-Admin Responsive Surfaces

**Files:**
- Modify: `app/admin/orgs/page.tsx`
- Modify: `app/admin/costs/page.tsx`
- Modify: `app/super/page.tsx`
- Modify: `components/super/*.tsx`
- Modify: `components/admin/PrivacyRequests.tsx`
- Create: `tests/components/admin-theme-contract.test.ts`

**Interfaces:**
- Consumes: AdminShell, semantic data/status tokens, synchronized theme state.
- Produces: mobile definition-list cards, desktop semantic tables, reachable theme actions, and readable operations dashboards.

- [ ] **Step 1: Write failing admin responsive contracts**

Assert organizations contains a mobile `dl` and desktop table, top-level controls are 44px, all files use semantic roles, and no narrow table is clipped by `overflow-hidden`.

- [ ] **Step 2: Confirm failures**

```bash
npx vitest run tests/components/admin-theme-contract.test.ts
```

- [ ] **Step 3: Implement responsive organizations**

Keep the table at `md` and above. Below `md`, render each organization as a Card containing Org, Plan, Subscription, Billing, Status, and actions in a `dl`; wrap long identifiers; fit empty state; make All costs a 44px action.

- [ ] **Step 4: Theme costs and privacy**

Use semantic metrics/status/axes/legends. Retain API and calculations. Make window/back/action controls 44px and prevent charts/endpoint lists from clipping.

- [ ] **Step 5: Theme/reflow command center**

Make Overview/Costs/Users/Runs/Data/Audit keyboard tabs with 44px targets; use responsive grids, 12px labels, semantic failure cards, and theme-aware charts.

- [ ] **Step 6: Run admin and role tests**

```bash
npx vitest run tests/components/admin-theme-contract.test.ts tests/auth/role-gate.test.ts tests/components/privacy-requests.test.ts
npm run typecheck
```

- [ ] **Step 7: Commit admin/super migration**

```bash
git add app/admin app/super components/super components/admin tests/components/admin-theme-contract.test.ts
git diff --cached --stat
git commit -m "fix(admin): add responsive light and dark operations views"
```

---

### Task 11: Shared Charts, Overlays, Inventory Guard, and Compatibility Removal

**Files:**
- Modify: `components/charts/*.tsx`
- Modify: `components/progress/*.tsx`
- Modify: `components/summary/*.tsx`
- Modify: `components/habits/*.tsx`
- Modify: `components/shared/Toast.tsx`
- Modify: `components/shared/ShortcutsModal.tsx`
- Modify: `components/shared/FeedbackWidget.tsx`
- Modify: `components/shared/InstallCard.tsx`
- Modify: `components/shared/Skeleton.tsx`
- Modify: `app/globals.css`
- Create: `scripts/ci/check-theme-inventory.mjs`
- Create: `tests/enterprise/theme-inventory.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete route migration.
- Produces: theme-aware visualization/overlay library and `npm run guard:theme`.

- [ ] **Step 1: Write the failing repository inventory guard**

Scan `app/**/*.{ts,tsx}` and `components/**/*.{ts,tsx}`. Reject dark-only presentation utilities, arbitrary white/black rgba presentation, and functional `text-[8px]` through `text-[11px]`. Allow only named media canvases and redundant chart ticks whose accessible equivalent is present.

- [ ] **Step 2: Add the script and prove the current inventory fails**

Add to `package.json`:

```json
"guard:theme": "node scripts/ci/check-theme-inventory.mjs"
```

Run:

```bash
npx vitest run tests/enterprise/theme-inventory.test.ts
npm run guard:theme
```

- [ ] **Step 3: Migrate charts, summary, progress, and habits**

Use `--data-*` plus semantic content/border/surface roles for SVG labels, axes, grids, legends, tooltips, rails, radar/heatmap cells, empty states, and accordions. Retain 10px redundant chart ticks only when the same value has an accessible label/table summary.

- [ ] **Step 4: Migrate global overlays/loading states**

Theme toast, shortcuts, feedback, install, and skeleton surfaces; enforce 44px close/actions, focus, semantic status, safe areas, and reduced motion.

- [ ] **Step 5: Remove obsolete broad light compatibility selectors**

Delete global `.light .bg-stone-*`, `.light .text-stone-*`, `.light .border-white/*`, and similar reinterpretations only after no consumer remains. Keep a component-specific exception only when named and tested.

- [ ] **Step 6: Run inventory, component tests, and lint**

```bash
npm run guard:theme
npx vitest run tests/enterprise/theme-inventory.test.ts tests/components/theme-contract.test.ts tests/components/ui-accessibility-contract.test.ts
npm run lint
```

Expected: no lint error and no new warning from changed files.

- [ ] **Step 7: Commit shared sweep and guard**

```bash
git add components/charts components/progress components/summary components/habits components/shared app/globals.css scripts/ci/check-theme-inventory.mjs tests/enterprise/theme-inventory.test.ts package.json
git diff --cached --stat
git commit -m "chore(theme): enforce semantic styling across shared UI"
```

---

### Task 12: Authenticated Browser Accessibility and Reflow Matrix

**Files:**
- Create: `e2e/helpers/auth.ts`
- Create: `e2e/helpers/accessibility.ts`
- Create: `e2e/theme-accessibility.spec.ts`
- Modify: `e2e/authenticated-role-flows.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `scripts/test/run-local-auth-e2e.mjs`

**Interfaces:**
- Consumes: local disposable role users and every migrated route.
- Produces: `loginAs(page: Page, role: 'client' | 'coach' | 'admin'): Promise<void>`, `setTheme(page: Page, mode: ThemeMode): Promise<void>`, `assertNoPageOverflow(page: Page): Promise<void>`, `assertNamedInteractiveControls(page: Page): Promise<void>`, `assertMinimumTargets(page: Page, minimumPx: number): Promise<void>`, `assertTheme(page: Page, mode: ThemeMode): Promise<void>`, and the critical route matrix.

- [ ] **Step 1: Write DOM assertion helpers**

`assertMinimumTargets` checks visible controls, allows inline prose links, and reports label/dimensions/DOM path. `assertNamedInteractiveControls` rejects empty accessible names. `assertNoPageOverflow` permits one CSS pixel and reports offscreen interactive controls.

- [ ] **Step 2: Add public light/dark/reduced-motion cases**

Set storage before navigation, assert one theme class, save a stable screenshot, run helpers, emulate reduced motion, and assert zero animation for theme icon, skeleton, modal, and sheet surfaces.

- [ ] **Step 3: Add authenticated client matrix**

Cover dashboard, log plus food modal, progress, profile/appearance, workout, intake, messages, booking, check-in, and supplements in both themes/mobile/desktop. Use a 640px viewport for 200% reflow equivalence and assert no hidden primary action.

- [ ] **Step 4: Add coach matrix**

Cover roster/search/filter, client detail, plan, memory, inbox/thread, calendar, foods, habits, protocols, templates, questionnaires, invite. Verify More exposes all destinations and the client tray never overlaps final content.

- [ ] **Step 5: Add admin/super matrix**

Cover organizations, costs, overview, and costs/users/runs/data/audit tabs, with local empty/populated states, theme toggling, and mobile card/table behavior.

- [ ] **Step 6: Add stale-session browser regression**

Seed invalid refresh state before `/login`; assert form renders, no blank body/reload loop occurs, and valid sign-in still succeeds afterward.

- [ ] **Step 7: Run the local authenticated matrix**

```bash
npm run test:e2e:local-auth
npx playwright test e2e/theme-accessibility.spec.ts --project=mobile-chromium --project=desktop-chromium
```

Inspect every current-run screenshot; reject blank, loading, cropped, or wrong-state images.

- [ ] **Step 8: Commit browser verification**

```bash
git add e2e playwright.config.ts scripts/test/run-local-auth-e2e.mjs
git diff --cached --stat
git commit -m "test(theme): cover role accessibility and responsive matrix"
```

---

### Task 13: Performance, Full Verification, Pull Request, Deployment, and Production Canary

**Files:**
- Modify: `scripts/perf/measure-web.mjs`
- Modify: `tests/performance/measurement-harness.test.ts`
- Create: `scripts/ops/canary-theme-readonly.mjs`
- Modify: `package.json`
- Evidence only: `.gstack/design-audit/final/`, Playwright reports, CI, GitHub PR, Vercel deployment.

**Interfaces:**
- Consumes: final branch and local/production role accounts.
- Produces: performance evidence, paid-route-blocking production canary, merged PR, READY Vercel deployment, and completion audit.

- [ ] **Step 1: Add theme performance measurements**

Measure `/login`, `/dashboard`, `/coach`, `/super` navigation and 20 no-network toggles; record median/p95; assert zero navigation, zero Supabase refetch, zero provider remount, and no more than 5% navigation regression from baseline.

- [ ] **Step 2: Write/test the read-only production canary**

Accept base URL and role credentials from env, visit every role family, toggle theme, and check controls/overflow/blank pages. Abort any request matching `/api/ai/`, `/api/food/parse`, `/api/food/recipe-analyze`, or another paid-provider route.

Add:

```json
"canary:theme": "node scripts/ops/canary-theme-readonly.mjs"
```

- [ ] **Step 3: Run targeted theme/performance gates**

```bash
npm run guard:theme
npx vitest run tests/components/theme-contract.test.ts tests/components/theme-mode.test.ts tests/components/ui-accessibility-contract.test.ts tests/components/navigation-accessibility.test.ts tests/components/client-theme-contract.test.ts tests/components/client-secondary-theme-contract.test.ts tests/components/coach-core-theme-contract.test.ts tests/components/coach-secondary-theme-contract.test.ts tests/components/admin-theme-contract.test.ts tests/enterprise/theme-inventory.test.ts tests/performance/measurement-harness.test.ts
npm run perf:measure
npm run perf:budget
```

- [ ] **Step 4: Run complete repository verification**

Start local Supabase, provide only local env values, leave paid AI keys empty, then run:

```bash
npm run typecheck
npm run lint
npm test
npm run readiness
npm run build
npm run test:e2e
npm run test:e2e:local-auth
```

Every command must exit zero; changed files introduce no warning.

- [ ] **Step 5: Audit final source/evidence**

```bash
git status --short
git diff origin/main...HEAD --stat
git diff origin/main...HEAD --check
git diff origin/main...HEAD | rg '(sk-ant-|sk-proj-|sbp_|AIza|SUPABASE_SERVICE_ROLE_KEY=)'
```

Require a clean worktree, no whitespace/secret match, no migration, no staged `.gstack`, and direct evidence for each specification item.

- [ ] **Step 6: Commit performance/canary support**

```bash
git add scripts/perf/measure-web.mjs tests/performance/measurement-harness.test.ts scripts/ops/canary-theme-readonly.mjs package.json
git diff --cached --stat
git commit -m "test(release): add theme performance and production canary"
```

- [ ] **Step 7: Push and open the pull request**

```bash
git push -u origin codex/theme-accessibility-system
gh pr create --base main --head codex/theme-accessibility-system --title "Theme and accessibility system across Trophē" --body-file docs/superpowers/specs/2026-08-12-theme-accessibility-system-design.md
```

Review the file list and wait for every required check. Fix only evidence-backed failures and rerun affected gates.

- [ ] **Step 8: Merge and verify Vercel production**

After green CI and scoped diff:

```bash
gh pr merge --merge --delete-branch
```

Confirm the merge on `origin/main`, find its Vercel production deployment, and wait for `READY`.

- [ ] **Step 9: Run production canaries and inspect final screenshots**

```bash
PLAYWRIGHT_BASE_URL=https://trophe.app npm run canary:theme
npm run canary:prod
```

The theme canary makes no paid call. Inspect stable light/dark public/auth/client/coach/admin/super screenshots and require no blank recovery, overflow, unnamed icon, hidden action, console error, or failed critical request.

- [ ] **Step 10: Complete only after requirement-by-requirement proof**

Map Sections 2–13 of the design spec to an exact source file, test output, browser assertion/screenshot, PR/CI result, Vercel deployment, or production-canary result. If any item lacks direct evidence, keep the goal active.
