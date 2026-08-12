# Trophē Theme, Accessibility, and Responsive-System Design

**Date:** 2026-08-12  
**Status:** Approved design direction; written specification awaiting user review  
**Owner:** Trophē product engineering  
**Target:** All public, authentication, onboarding, client, coach, admin, and super-admin surfaces

## 1. Outcome

Trophē will provide a coherent, fast, and readable light and dark experience across every route without changing its black, stone, and gold identity or disrupting nutrition and coaching workflows.

The implementation will replace the current mix of semantic variables, hardcoded dark Tailwind classes, and global light-mode compatibility overrides with one explicit semantic theme contract. Shared primitives will consume that contract, and route families will migrate to the primitives in controlled passes.

The release is complete only when the critical route matrix passes in both themes at mobile, tablet, desktop, keyboard, reduced-motion, and 200% zoom conditions, the normal repository verification suite passes, and the deployed production canary confirms the same behavior.

## 2. Success Criteria

### 2.1 Accessibility target

- WCAG 2.2 AA contrast for normal text, large text, meaningful icons, focus indicators, form controls, and component boundaries.
- Primary reading text should approach AAA contrast where this does not damage hierarchy or brand expression.
- Supporting text must not rely on opacity or muted color combinations that fall below AA.
- Functional text must be at least 12px. Ten- and eleven-pixel text is reserved for decorative or redundant metadata only and must remain readable.
- All primary pointer targets and icon-only controls must expose at least a 44 by 44 CSS-pixel hit area. Dense data-table controls may use a 24px visible icon inside a 44px interactive wrapper.
- Every icon-only control needs an accessible name, visible hover/focus feedback, and a persistent or contextual affordance that communicates its purpose.
- Keyboard focus must be visible in both themes and must not be clipped by overflow containers.
- Content must reflow at 200% browser zoom without hidden actions or two-dimensional scrolling, except for genuinely tabular data that is placed in an explicitly scrollable region with a mobile alternative.
- Reduced-motion users receive no nonessential entrance, looping, parallax, shimmer, or rotating motion.

### 2.2 Product quality target

- Theme selection is available and synchronized across authenticated layouts, including coach, admin, and super-admin.
- The selected theme applies before first paint and persists across navigation, reload, logout, and role-area transitions.
- Light mode contains no accidental dark islands. Deliberately dark media, camera, barcode, or image-preview canvases are allowed when their surrounding controls remain theme-correct.
- Dark mode contains no unreadable muted text, invisible borders, or low-contrast inactive states.
- Navigation, tabs, filters, tables, sheets, dialogs, toasts, forms, charts, empty states, and loading states use the same theme rules.
- All controls required for a workflow remain reachable at 390 by 844, 768 by 1024, and 1280 by 900 viewports.
- Layout changes introduce no new runtime UI dependency and no new blocking request.
- Theme switching is CSS-variable driven and does not remount route trees or refetch data.
- A stale or invalid browser session cannot leave the login route blank; the app clears unusable local auth state and presents a recoverable login screen.

## 3. Current-State Evidence

The 2026-08-12 local audit captured authenticated client, coach, admin, and super-admin routes in the in-app browser at 390 by 844 and 1280 by 900. Accepted screenshots were saved under `.gstack/design-audit/current/` and visually inspected during the run.

Confirmed issues include:

- Client light mode retains a nearly black bottom navigation while the main page is white.
- Client and coach screens use many 9–11px labels and low-contrast muted colors.
- Client food-log date controls, water controls, profile tabs, coach filters, admin controls, and other interactive elements often expose hit areas below 44px.
- Several icon-only water controls have no accessible name.
- Coach mobile navigation makes later destinations difficult to discover because the horizontal overflow has no clear continuation affordance.
- The coach client-detail page places a floating action tray over chart content.
- Admin organizations uses a desktop table that clips columns on mobile instead of presenting a readable mobile card/list representation.
- Admin and super-admin surfaces do not provide their own reachable theme switch even though their layouts mount the theme provider.
- Theme styling is distributed across semantic CSS variables, more than a thousand hardcoded stone text utilities, hundreds of arbitrary color declarations, and a large `.light` compatibility section in `app/globals.css`.
- Production login produced a blank surface when the browser held an invalid refresh token. This is an authentication recovery problem, not a color-only problem, and belongs in this usability release.

Evidence limits:

- Screenshots identify visible contrast, hierarchy, clipping, and affordance risks but do not prove numeric WCAG compliance.
- Numeric color contrast, keyboard navigation, screen-reader names, motion preference behavior, zoom/reflow, and runtime performance require automated and hands-on verification after implementation.
- The initial statement that admin/super routes were forcibly dark was corrected after source inspection: their layouts mount the theme provider, but they lack an in-area theme control and cross-layout persistence is not yet proven.

## 4. Chosen Architecture

### 4.1 Semantic token contract

`app/globals.css` remains the canonical token source. It will define theme-independent semantic roles instead of encoding a dark surface in each component.

Required roles:

| Category | Roles |
| --- | --- |
| Canvas | `--canvas`, `--canvas-subtle`, `--canvas-inverse` |
| Surface | `--surface-1`, `--surface-2`, `--surface-3`, `--surface-hover`, `--surface-active`, `--surface-overlay` |
| Content | `--content-primary`, `--content-secondary`, `--content-muted`, `--content-inverse`, `--content-disabled` |
| Border | `--border-subtle`, `--border-default`, `--border-strong`, `--border-focus` |
| Interaction | `--action-primary`, `--action-primary-hover`, `--action-on-primary`, `--action-secondary`, `--focus-ring` |
| Status | foreground, surface, and border roles for success, warning, danger, and information |
| Data | calorie, protein, carbohydrate, fat, fiber, sugar, and neutral chart roles with theme-specific accessible values |
| Elevation | low, medium, high shadow recipes that remain visible but quiet in both themes |

Legacy aliases such as `--bg-primary`, `--t1`, and `--text-secondary` may temporarily map to semantic roles during migration. New component edits must use the semantic roles or shared primitives. The broad selectors that reinterpret arbitrary dark Tailwind classes under `.light` are temporary compatibility only and will shrink as routes migrate.

### 4.2 Theme state and first paint

`ThemeModeProvider` remains the runtime owner, but the initial value will be derived from the same source as the inline pre-paint script so React state and the `<html>` class cannot disagree.

The contract is:

1. The root inline script validates `trophe_theme_mode` as `light` or `dark` and applies exactly one class before paint.
2. The provider initializes from the already-applied class or the validated storage value without a second corrective render.
3. Toggling updates React state, storage, `<html>.light|dark`, `color-scheme`, and `meta[name=theme-color]` in one operation.
4. A shared `ThemeModeToggle` with a 44px hit area appears in the client, coach, admin, and super-admin shells or headers.
5. Public/auth pages follow the saved theme and provide a reachable toggle wherever the page is interactive for more than a transient state.

### 4.3 Shared UI primitives

The migration will establish or normalize a small shared layer rather than building route-specific substitutes:

- `Button` and `IconButton`: semantic variants, minimum hit areas, disabled and pending states, focus ring, accessible-label enforcement for icon-only use.
- `Card` and `Panel`: semantic surface, border, elevation, and selected state.
- `Input`, `Textarea`, `Select`, and field wrapper: labels, help/error text, autofill, placeholder contrast, focus/error states, and minimum control height.
- `Tabs` and segmented controls: scroll behavior, selected-state semantics, focus management, and mobile continuation affordance.
- `Dialog` and bottom sheet: theme-correct overlay/surface, focus trap, escape behavior, safe-area padding, and reduced motion.
- `Badge`, `Metric`, `EmptyState`, `Skeleton`, `Toast`, and chart tooltip/legend recipes.
- `AppHeader`, `BottomNav`, coach navigation, admin header, and super-admin header using the same navigation token contract.

Existing components will be adapted when they already provide the right behavior. New primitives are allowed only when they remove repeated styling or accessibility logic.

## 5. Responsive and Reachability Design

### 5.1 Viewport contract

- **Mobile:** 390 by 844 is the primary authored viewport; also test down to 320px and safe-area insets.
- **Tablet:** 768 by 1024 verifies reflow, modal sizing, and navigation transition behavior.
- **Desktop:** 1280 by 900 verifies readable line lengths, column balance, table density, and fixed controls.
- **Zoom:** 200% at a 1280px browser window must behave like a narrow layout rather than clipping desktop-only controls.

### 5.2 Navigation

- Bottom navigation uses a theme-correct elevated surface, 44px minimum links, safe-area padding, and clear active/inactive contrast.
- Coach top navigation either wraps into a two-row layout or presents an explicit `More` menu on narrow screens; silently clipped or discoverability-dependent horizontal scrolling is not acceptable for primary destinations.
- Admin and super-admin routes gain consistent back/home/theme actions without consuming table width.
- Fixed or sticky action trays reserve layout space and must not cover charts, forms, or the bottom navigation.

### 5.3 Dense information

- Data that compares columns remains a semantic table on desktop.
- At narrow widths, admin organizations, cost data, audit logs, and similar tables render each row as a labeled card or definition list. Horizontal table scrolling is a fallback only when column comparison is the task.
- Charts use theme-aware axes, grid lines, legends, and tooltips. Nonessential fine print is consolidated instead of rendered at 9px.
- Long email addresses, food names, and client names wrap or truncate with an accessible full-value affordance.

## 6. Visual Language

- Preserve the current warm black/stone foundation, Instrument Serif moments, Inter UI text, mono operational labels, and gold accent.
- Light mode uses warm off-white canvas and white elevated surfaces rather than flat pure white everywhere.
- Dark mode uses distinct but close surface levels rather than opacity-only boundaries.
- Gold communicates brand and selected/primary actions. It does not carry all semantic meaning and must remain readable on both backgrounds.
- Status colors include text, surface, and border combinations. Status is never communicated by color alone.
- Borders and shadows establish hierarchy; muted text is not used as the only method of de-emphasis.
- Default body copy is at least 14px; form text is at least 16px on mobile where needed to prevent iOS zoom; metadata is 12px or larger unless redundant.

## 7. Motion and Performance

- Theme transitions are limited to background, border, color, opacity, and shadow, generally 150–220ms.
- The theme switch itself may animate the icon but must not animate the whole page geometry.
- `prefers-reduced-motion: reduce` disables toast entrance transforms, skeleton sheen, icon rotation, modal/sheet transforms, and nonessential chart animation.
- Loading feedback remains visible without relying on motion alone.
- Theme state changes CSS variables in place and must not trigger data refetches, route reloads, or provider remounts.
- No new animation or component framework will be added.
- Performance validation compares representative route navigation and theme-toggle responsiveness before and after the change, and confirms no material bundle increase from this work.

## 8. Authentication Recovery

The login route must render even when an old refresh cookie or browser session is invalid.

- Auth initialization distinguishes an invalid/expired refresh token from a network or server error.
- Invalid local session state is cleared once, then the normal login form renders with a concise recovery message if useful.
- Recovery cannot loop, repeatedly refresh, or erase a valid session.
- The route remains theme-correct during recovery and never exposes a blank body.
- Automated coverage includes a stale-token fixture and a valid-session regression.

## 9. Migration Sequence

1. Establish semantic tokens, theme initialization, focus/motion defaults, and shared primitive contracts.
2. Migrate global shells: public/auth, client, coach, admin, super-admin, bottom navigation, headers, feedback and install overlays.
3. Migrate authentication, activation, signup, onboarding, offline, pricing, trust, and localized public routes.
4. Migrate client route family: home, log, progress, profile, workout and subroutes, intake, messages, booking, check-in, and supplements.
5. Migrate coach route family: roster, client detail and plan/memory, inbox, calendar, foods, habits, protocols, templates, questionnaires, and invite.
6. Migrate admin and super-admin route families, including mobile alternatives for dense tables.
7. Migrate shared charts, food modals, workout modals, coaching panels, toasts, loading/empty/error states, and remaining hardcoded theme exceptions.
8. Remove obsolete compatibility selectors only after static inventory and browser coverage prove no consumer remains.

Each migration pass must leave the app buildable and testable. Business logic, database queries, nutrition calculations, and AI routing are out of scope unless a visual or session-recovery fix requires a narrowly targeted change.

## 10. Testing Strategy

### 10.1 Static and unit coverage

- Token contract tests verify every semantic role exists in both theme definitions.
- Theme provider tests cover validation, first-paint synchronization, persistence, route/layout transitions, `color-scheme`, and reduced motion.
- Component tests cover keyboard focus, accessible icon labels, pending/disabled states, and 44px wrapper classes.
- A static theme inventory prevents new raw dark-only surface/text utilities in migrated directories unless explicitly allowlisted.
- Auth recovery tests cover stale refresh state and protect valid sessions.

### 10.2 Browser matrix

For each role and critical flow, test light and dark modes at mobile and desktop. Tablet and 200% zoom are required for representative high-density screens.

| Area | Critical routes/flows |
| --- | --- |
| Public/auth | `/`, localized landing routes, pricing, trust, login password/magic link, signup, activation, onboarding, offline |
| Client | dashboard, meal log and food-entry modal, progress, profile/appearance, workout, intake, messages, booking, check-in, supplements |
| Coach | roster/search/filter, client detail, plan, memory, inbox/thread, calendar, foods CRUD, habits, protocols, templates, questionnaires, invite |
| Admin | organizations and costs, including empty, populated, loading, error, and narrow-width states |
| Super-admin | overview tabs, costs, users, runs, data, audit, recent failures, and cross-role navigation |

Browser checks include:

- Screenshot comparison after current-run capture and visual inspection.
- Keyboard traversal and visible focus.
- Automated accessibility scan, supplemented by manual checks for semantics not captured by the scanner.
- Target-size inventory, overflow/offscreen inventory, DOM accessible-name inspection, and console error inspection.
- Reduced-motion emulation.
- 200% zoom/reflow and landscape mobile checks.
- Theme persistence across reload and cross-layout navigation.
- No blank route during stale-session recovery.

### 10.3 Repository gates

Required before deployment:

```text
npm run typecheck
npm run lint
npm test
npm run readiness
npm run build
npm run test:e2e
```

The AI/food accuracy suite must remain green, but no paid provider call is required for this theme release. Existing ignored local canary artifacts must not be included in paid-tool static scans.

## 11. Deployment and Rollback

1. Implement on `codex/theme-accessibility-system`, based on the latest `origin/main`.
2. Commit in reviewable migration slices with passing targeted tests.
3. Push the branch, open a pull request, and wait for required CI.
4. Review the final diff for secrets, generated artifacts, accidental nutrition/business-logic changes, and stale compatibility rules.
5. Merge only when CI and browser evidence are green.
6. Allow the normal Vercel production deployment from `main`.
7. Run production canaries for public login, client, coach, admin, and super-admin critical routes in both themes without invoking paid AI providers.
8. Monitor route errors, console failures, authentication recovery, and representative responsiveness immediately after deployment.

Rollback is the merge commit revert if a critical accessibility or workflow regression reaches production. Token migration commits remain isolated enough to revert without database rollback. This project adds no migration and changes no persistent business data.

## 12. Explicit Non-Goals

- Rebranding Trophē or replacing its typography and gold identity.
- Redesigning nutrition methodology, coach workflows, database structure, or AI behavior.
- Claiming WCAG conformance based only on screenshots or automated scans.
- Adding a new third-party UI framework.
- Maintaining exact legacy pixel values when they conflict with readability, reachability, or reflow requirements.

## 13. Acceptance Evidence

Completion requires all of the following authoritative evidence:

- Source inventory shows migrated routes use semantic tokens/shared primitives and remaining exceptions are documented.
- Numeric contrast results cover every semantic foreground/background pair and representative component states.
- Browser screenshots from the final build show accepted light and dark states for every route family.
- Automated accessibility, target-size, overflow, keyboard, reduced-motion, and theme-persistence checks pass on the critical route matrix.
- Typecheck, lint, unit/integration tests, readiness, production build, and end-to-end tests pass on the final commit.
- Pull request and required CI are green and merged.
- Vercel reports a successful production deployment from the merged main commit.
- Production canaries confirm the public/auth, client, coach, admin, and super-admin critical flows without paid AI calls.

The goal is not complete while any route family remains unverified, any critical action is hidden or unreachable, or any deployment evidence is missing.
