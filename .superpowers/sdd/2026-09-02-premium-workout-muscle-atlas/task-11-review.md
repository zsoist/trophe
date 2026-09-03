# Task 11 independent integration review

**Reviewed commit:** `afb4a12` against `01a2ebf`
**Verdict:** NOT CLEAN — three Important findings and one Minor finding.

## Important findings

1. **Initial hydration can still steal focus on Build and Review.**
   - **Evidence:** `components/workout/workspace/WorkoutBuilder.tsx:43` and `components/workout/workspace/WorkoutReview.tsx:34` each unconditionally focus their `<main>` on mount. `components/workout/workspace/WorkoutRouteTransition.tsx:26-35` only suppresses its *own* focus work on first hydration, so it cannot prevent the child effects.
   - **Reproduce:** focus any external control, then hydrate a persisted draft directly at `/dashboard/workout/build` (or an existing review at `/dashboard/workout/review`). The mounted Builder/Review effect moves focus to its `main`, contrary to the Task 11 contract that initial hydration preserves user focus.
   - **Why the new test misses it:** `workout-route-transition.test.tsx` mounts a plain `Destination`, not either real surface.

2. **The direct exercise-detail replacement action uses the English canonical exercise name in non-English ARIA labels.**
   - **Evidence:** `components/workout/workspace/RoutedExerciseDetail.tsx:30` passes `exercise.name` to `workout.replace_with_named`; the detail itself correctly derives the localized display name via `exerciseDisplayName(exercise, lang)` at `components/workout/ExerciseDetail.tsx:111`. In Spanish/Greek, an exercise with `name_es`/`name_el` therefore displays a translated name but exposes an English exercise name in the replacement control’s accessible name.
   - **Reproduce:** open `/dashboard/workout/exercises/<localized-exercise-id>?replace=<draft-exercise-id>&return=build` with Spanish or Greek active and an exercise that has `name_es` or `name_el`. Inspect the replacement button: the localized verb is combined with `exercise.name`, not the visible localized exercise name.
   - **Impact:** violates the exercise-specific localized-control contract and creates the mixed-language accessible name the task was intended to remove.

3. **Hard-coding five grid columns regresses every four-route coach bottom navigation.**
   - **Evidence:** `components/ui/BotNav.tsx:42` now always applies `grid-cols-[repeat(5,minmax(0,1fr))]`, while real coach surfaces still pass four routes, for example `app/coach/page.tsx:1522-1527` and the `COACH_NAV` consumers. The component’s own documentation says it serves both client and coach apps.
   - **Reproduce:** visit `/coach` at a mobile width. Four links occupy the first four fifths of the bar and the final fifth is empty, so the four available targets no longer divide their actual navigation evenly or remain visually centered.
   - **Fix direction:** preserve five equal columns only for the five-item client route set; derive the column count from `routes.length` (or give the client shell a five-slot-only variant).

## Minor finding

1. **Secondary real Workout routes have no direction classification.**
   - **Evidence:** `components/workout/workspace/WorkoutRouteTransition.tsx:7-13` enumerates only home, exercises, build, review, and live. `/dashboard/workout/history`, `/dashboard/workout/stats`, and `/dashboard/workout/form-check` all resolve to index `1`. A history-to-stats navigation (including browser Back/Forward between them) produces `data-route-direction="none"` and no directional entry animation.
   - **Impact:** the core build flow works, but the stated all-workout-routes directional transition contract is incomplete for genuine nested destinations.

## Verified clean areas

- `I18nProvider` honors the default language, restores supported storage values, safely survives denied storage, accepts explicit language selection, and synchronizes `html[lang]`.
- The all-eight-locale workout-key inventory and complete English exercise-prose fallback pass.
- The core Home/Exercises/Build/Review/Live route transition uses one 220ms, 18px directional surface; reduced motion removes transform and delay. The outer client transition remains keyed by the top-level dashboard section, so it does not double-animate normal nested Workout navigation.
- Workout text inputs, textareas, and selects are at least 16px; the focused exercise icon actions include localized exercise names in the plan-card path.
- The five-item client shell nav is physically bottom-aligned, retains safe-area padding, exposes labels through `aria-label`, hides long visible labels through 430px, and preserves Workout-tab reselect to `/dashboard/workout`.

## Commands run

All commands were run in the reviewed worktree with no Impeccable detector invocation.

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  tests/i18n/workout-atlas-copy.test.ts \
  tests/i18n/i18n-provider.test.tsx \
  tests/components/workout-route-transition.test.tsx \
  tests/components/workout-accessibility-v3.test.tsx \
  tests/components/client-shell-navigation.test.ts \
  tests/components/client-secondary-theme-contract.test.ts
```

Result: **6 files passed, 31 tests passed**.

```sh
npm run guard:theme
npx tsc --noEmit
npx eslint <all changed Task 11 TypeScript/TSX sources and tests>
git diff --check 01a2ebf..afb4a12
```

Result: all passed with exit code 0.
