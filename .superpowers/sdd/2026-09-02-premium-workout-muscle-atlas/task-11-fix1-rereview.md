# Task 11 fix round 1 — independent re-review

**Reviewed:** `b4b08aa` and the full Task 11 range `01a2ebf..b4b08aa`.

## Verdict: CLEAN

The three Important findings and one Minor finding from `task-11-review.md` are closed. This re-review found no regression or new Task 11 integration defect.

## Reproduced contracts

- **Focus:** routed Builder and Review receive the route-focus suppression context, so initial hydration preserves existing focus. Their standalone mount effect remains available when no route provider is present. `WorkoutRouteTransition` alone focuses the incoming `main` after a changed pathname with `preventScroll`; its first effect pass does not focus.
- **Localized replacement controls:** routed exercise detail resolves the ES/EL display name through `exerciseDisplayName` before interpolating `workout.replace_with_named`. Missing localized names use the canonical name as a complete fallback, preventing mixed-language visible or accessible labels.
- **Bottom navigation:** `BotNav` uses `repeat(routes.length, minmax(0, 1fr))` for four, five, and other route counts. Links retain 56px minimum height, localized `aria-label`, fixed physical bottom alignment, and safe-area padding. Visible labels remain icon-only through 430px without ellipsis or clipped semantic meaning.
- **Routes and transition ownership:** all real Workout destinations resolve to stable ordered kinds: home, discovery, detail, build, review, live, history, analytics, and form-check. Query strings do not alter route identity; unknown paths intentionally resolve to home. The outer client transition remains keyed to `/dashboard/workout`, leaving nested Workout motion and focus to the inner transition only.
- **Prior contracts:** default/stored locale handling, storage-denial safety, `html[lang]`, all-eight-locale copy/fallback behavior, mobile 16px inputs, theme tokens, and focused accessibility contracts remain green.

## Verification

```sh
NODE_OPTIONS=--no-experimental-webstorage npx vitest run \
  tests/i18n/workout-atlas-copy.test.ts \
  tests/i18n/i18n-provider.test.tsx \
  tests/components/workout-route-transition.test.tsx \
  tests/components/workout-route-focus.test.tsx \
  tests/components/workout-accessibility-v3.test.tsx \
  tests/components/client-shell-navigation.test.ts \
  tests/components/client-secondary-theme-contract.test.ts \
  tests/components/exercise-route-provider.test.tsx \
  tests/components/workout-workspace-navigation.test.tsx
```

Result: **9 files passed, 82 tests passed**. The run emitted pre-existing jsdom media-play and third-party sourcemap warnings, but no test failures.

```sh
npm run guard:theme
git diff --name-only 01a2ebf..b4b08aa -- '*.ts' '*.tsx' | xargs npx eslint
npx tsc --noEmit
git diff --check 01a2ebf..b4b08aa
```

Result: all commands passed with exit code 0. The Impeccable detector was not run.
