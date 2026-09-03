# Task 11 fix round 1 — integration review closure

## Scope

This round closes the three Important and one Minor finding in `task-11-review.md` without changing workout persistence, generated media, migrations, or unrelated files.

## RED evidence

Focused regression tests were added before production edits and run against the review baseline (`97ae4c6`). The first run reported 4 failing files and 6 failing tests:

- `workout-route-focus.test.tsx`: Builder and Review each moved focus to their `main` during initial hydration.
- `client-shell-navigation.test.ts`: four-route navigation had no equal four-column geometry.
- `exercise-route-provider.test.tsx`: Spanish and Greek routed replacement actions used the canonical English name.
- `workout-workspace-navigation.test.tsx`: secondary route classification was unavailable, so history/analytics/form-check could not produce deterministic indices.

## GREEN evidence

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  tests/i18n/workout-atlas-copy.test.ts \
  tests/i18n/i18n-provider.test.tsx \
  tests/components/workout-route-transition.test.tsx \
  tests/components/workout-route-focus.test.tsx \
  tests/components/workout-accessibility-v3.test.tsx \
  tests/components/client-shell-navigation.test.ts \
  tests/components/client-secondary-theme-contract.test.ts
```

Result: 7 files passed, 35 tests passed.

The focused review regression set also passes: 5 files, 61 tests.

## Fix behavior

- `WorkoutRouteTransition` owns post-client-navigation focus. Builder and Review keep their standalone mount focus behavior, but routed children receive a focus-suppression context and therefore do not steal focus during initial hydration.
- `exerciseDisplayName` now resolves Spanish and Greek display names when present and uses the canonical name as a complete fallback. Routed replacement ARIA names use that same display name, so visible and accessible exercise names stay coherent.
- `BotNav` computes `repeat(n, minmax(0, 1fr))` from `routes.length`. The five-route client geometry remains the authored five-column class; coach four-route navigation now divides the bar into four equal columns. Labels remain available through `aria-label` while visible labels stay hidden below 431px.
- Workout route kinds are explicit: `home`, `discovery`, `detail`, `build`, `review`, `live`, `history`, `analytics`, and `form-check`. Route indices are stable and query-insensitive; query-only changes preserve the same transition surface/key and do not trigger remount, animation, or destination focus. Cardio is a draft kind rather than a dedicated route.

## Verification gates

The remaining requested gates were run after the focused suite: `npm run guard:theme`, `npx tsc --noEmit`, targeted ESLint, and `git diff --check`. The Impeccable detector was not run.
