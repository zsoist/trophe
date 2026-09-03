# Task 6 report — Instruction-first exercise detail

## Outcome

Recomposed the routed exercise detail into a media-first, instruction-led full screen. The screen now presents truthful exact motion or static fallback media, exercise identity and equipment, Setup/Work/Finish controls, the shared front/back `MuscleAtlas` with named activation roles, organized setup/technique/breathing/mistake guidance, safety, RLS-scoped PR/history states, and the existing contextual Add/draft-routing action.

The compatibility sheet now uses the same complete detail composition at a usable mobile full-screen height. It traps focus, closes on Escape, restores focus, locks background scrolling, respects reduced motion, and keeps its action above the safe area. Routed actions clear the fixed client navigation at 320–430px through the shared shell height and safe-area variables.

Exact-media honesty remains binding: technique motion and play/pause are rendered only for `tier="verified-technique"` records with a `motionSrc`. Exact posters without motion are explicitly static; anatomy and unmatched fallbacks never claim to be technique demonstrations. All newly visible and ARIA copy is localized in all eight supported dictionaries, including motion status/control text, phase controls, loading/error recovery, English-instruction fallback, close copy, and anatomy empty state.

Commit: `3de55b8 feat(workout): add instructive exercise detail`

Round 1 fix commit: `b04fabb fix(workout): preserve detail focus and playback state`

Round 2 proof commit: `45bdf0a test(workout): prove live detail focus states`

Round 3 proof commit: `60b647d test(workout): observe clock tick after focus`

## Round 1 review fixes

- Split the sheet lifecycle into a mount-scoped focus/scroll-lock effect and a separate latest-callback ref update. Inline `onClose` identities can now change every LiveWorkout clock render without restoring focus or focusing the dialog again. Escape, backdrop, and close actions call the latest callback; unmount restores the original opener once.
- Threaded `playbackDisabled` from paused `LiveWorkout` state through `ExerciseInfoSheet` and `ExerciseDetail` to `ExerciseMotion`. Exact verified motion now calls `pause()`, exposes a disabled localized recovery action and paused status, never plays while the workout is paused, and resumes the preserved autoplay intent only when the workout resumes. Viewport, page-visibility, reduced-motion, and exact-media gates remain intact.
- Scoped PR state to the exercise/user/retry request identity. A previous PR disappears synchronously when the exercise or user changes, remains absent for a null user, and is cleared on history failure.
- Extended the authenticated workout Playwright journey with a focused two-theme test. Both light and dark exercise-detail routes and paused live sheets are exercised at 320, 375, 390, and 430px. Assertions cover final-section reachability, action/nav separation, sheet viewport containment and internal scrolling, bidirectional focus wrap, Escape close, and opener focus restoration. Round 2 separates the running-clock focus proof described below from this paused-layout pass.
- Inspected stabilizing LiveWorkout's inline close handler with `useCallback`. It would not prevent the un-memoized sheet from rerendering and would leave other live callers vulnerable, so the lifecycle fix is intentionally owned by the sheet.

### Round 1 RED

The focused regressions failed on the intended boundaries before implementation:

```text
npx vitest run tests/components/exercise-info-sheet.test.ts
Test Files  1 failed (1)
Tests       1 failed | 3 passed (4)
```

The rerender moved focus from the selected Work phase back to the original opener. The accompanying focused matrix also exposed the other expected failures: paused exact motion never called `pause()`, LiveWorkout passed an active media state while paused, `100 kg` remained visible after an exercise identity change, and both new session-pause locale keys were absent.

### Round 1 GREEN

```text
npx vitest run tests/components/exercise-detail-v3.test.tsx \
  tests/components/exercise-detail-v2.test.tsx \
  tests/components/exercise-info-sheet.test.ts \
  tests/components/personal-best-primitives.test.ts \
  tests/components/exercise-motion.test.tsx \
  tests/components/muscle-atlas.test.tsx \
  tests/components/exercise-media-badge.test.tsx \
  tests/components/exercise-route-provider.test.tsx \
  tests/components/live-workout.test.tsx

Test Files  9 passed (9)
Tests       79 passed (79)
```

Authenticated browser verification used disposable loopback-Supabase users and blocked paid capabilities:

```text
npm run test:e2e:local-auth -- e2e/workout-workspace-v2.spec.ts \
  --project=mobile-chromium \
  -g "routed detail and paused live sheet"

Tests  2 passed (2)
```

The final run passed light in 9.2s and dark in 4.6s across all four viewport widths. The first focused browser attempt correctly revealed that direct exercise discovery cannot search until a strength draft exists; the test now creates that draft through the real UI, adds the selected exercise, starts an empty live session, and discards it during cleanup. There is no browser environment blocker.

```text
npm run typecheck
# exit 0

npx eslint <all Round 1 source, component test, and Playwright files>
# exit 0, no warnings

git diff --cached --check
# exit 0
```

## Round 2 browser-proof fix

The focused authenticated browser case now opens the exercise sheet before pausing, while the live workout clock has a `Pause` control and a truthy `runningSince`. It focuses the Work phase control and explicitly asserts that the control owns focus before capturing the displayed clock baseline. It then waits for a different value through LiveWorkout's real one-second interval and proves the selected child still owns focus after that observed rerender. Escape then closes the running sheet and restores focus to its Technique opener, exercising the sheet's latest-callback path after the rerender. The pre-baseline focus assertion prevents a tick during sheet opening or focus transfer from satisfying the poll before the focus-under-rerender condition has actually begun.

Only after the running-clock proof does the test pause the workout and reopen a fresh sheet. The paused pass retains the light/dark matrix at 320, 375, 390, and 430px plus final-section reachability, sticky-action/navigation separation, full-height containment, internal scrolling, bidirectional focus wrap, Escape close, and opener restoration. This browser test does not claim video pause behavior because the production media registry intentionally has no `motionSrc`; paused exact-motion behavior remains covered by the direct truthful-fixture component test.

This was a proof-only test correction with no production behavior change, so there was no meaningful product RED cycle: the previous test was green while exercising the wrong paused state. The strengthened characterization passed on its first run.

```text
npm run test:e2e:local-auth -- e2e/workout-workspace-v2.spec.ts \
  --project=mobile-chromium \
  -g "routed detail and paused live sheet"

Tests  2 passed (2)
# light 9.7s, dark 4.4s; 17.6s total

npx vitest run tests/components/exercise-info-sheet.test.ts \
  tests/components/exercise-motion.test.tsx \
  tests/components/live-workout.test.tsx

Test Files  3 passed (3)
Tests       28 passed (28)

npm run typecheck
# exit 0

npx eslint e2e/workout-workspace-v2.spec.ts
# exit 0, no warnings

git diff --check
# exit 0
```

### Round 3 race-proof verification

Round 3 moved the clock baseline read after the Playwright `focus()` call, then waited for the clock to change and checked focus afterward. It did not explicitly assert focus ownership before capturing that baseline; the subsequent review correctly identified that remaining proof gap. Production behavior and media truth were unchanged.

```text
npm run test:e2e:local-auth -- e2e/workout-workspace-v2.spec.ts \
  --project=mobile-chromium \
  -g "routed detail and paused live sheet"

Tests  2 passed (2)
# light 9.1s, dark 4.3s; 16.7s total

npx vitest run tests/components/exercise-info-sheet.test.ts \
  tests/components/exercise-motion.test.tsx \
  tests/components/live-workout.test.tsx

Test Files  3 passed (3)
Tests       28 passed (28)

npm run typecheck
# exit 0

npx eslint e2e/workout-workspace-v2.spec.ts
# exit 0, no warnings

git diff --check
# exit 0
```

### Round 4 settled-focus proof correction

The running-sheet case now explicitly proves the Work phase control is focused before it captures the clock baseline. It polls until the clock differs from that post-focus baseline, demonstrating a real timer-driven rerender, and only then asserts that the same phase control retained focus. This is a proof-only test change with no production implementation change, so there is no product RED claim.

Current focused verification:

```text
npm run typecheck
# exit 0

npx eslint e2e/workout-workspace-v2.spec.ts
# exit 0, no warnings

npx vitest run tests/components/live-workout.test.tsx
# 1 file passed; 19 tests passed

npx vitest run tests/components/exercise-info-sheet.test.ts \
  -t "keeps child focus across callback-identity rerenders and wraps focus in both directions"
# 1 focused test passed; 3 skipped

git diff --check
# exit 0
```

The authenticated Playwright command was also attempted for both themes, but both cases timed out before reaching the clock proof: the workout-home `Find an exercise` link was covered by the current header/navigation layout and Playwright reported intercepted pointer events at line 430. The failure is outside this review-only test correction; no production layout or unrelated test behavior was changed here. The broader three-file component command additionally exposed one current unrelated stale assertion expecting a poster after the media registry began returning a verified motion video.

## RED

Initial command:

```text
npx vitest run tests/components/exercise-detail-v3.test.tsx \
  tests/components/exercise-detail-v2.test.tsx \
  tests/components/exercise-info-sheet.test.ts
```

Result before implementation:

```text
Test Files  1 failed | 2 passed (3)
Tests       4 failed | 6 passed (10)
```

The four new failures proved the missing controlled exact-motion fixture, honest anatomy fallback label, visible English-guidance fallback, and complete eight-locale detail-copy contract. The motion assertion deliberately used a mocked `verified-technique` record with a real `motionSrc`; it did not weaken the production truth gate to make an interim static asset appear animated.

A later anatomy-empty-state TDD cycle failed as expected:

```text
npx vitest run tests/components/exercise-detail-v3.test.tsx
Test Files  1 failed (1)
Tests       2 failed | 3 passed (5)
```

Those failures covered the absent empty state and its absent eight-locale key.

## GREEN

Final focused detail and adjacent-consumer command:

```text
npx vitest run tests/components/exercise-detail-v3.test.tsx \
  tests/components/exercise-detail-v2.test.tsx \
  tests/components/exercise-info-sheet.test.ts \
  tests/components/personal-best-primitives.test.ts \
  tests/components/exercise-motion.test.tsx \
  tests/components/muscle-atlas.test.tsx \
  tests/components/exercise-media-badge.test.tsx \
  tests/components/exercise-route-provider.test.tsx

Test Files  8 passed (8)
Tests       58 passed (58)
```

Static verification:

```text
npm run typecheck
# exit 0

npx eslint <all Task 6 source and test TypeScript files>
# exit 0, no warnings

git diff --cached --check
# exit 0
```

## Self-review and concerns

- Existing draft-only add/replace routing and history persistence/query semantics were preserved; opening detail and adding an exercise do not start a live session.
- The interim repository posters remain intentionally non-4K/static where no verified motion exists. Task 10 can replace the resolver-backed media without changing this layout or its truth gate.
- No database schema, RLS policy, or persistence code was changed.
- The reserved final Impeccable detector was not run during Task 6.
