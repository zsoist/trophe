# Task 6 re-review 3 — settled focus before a live clock tick

**Commit reviewed:** `a0c92e94e0e4d452b1c9a18daef05897d54439a3`
**Verdict:** `CLEAN`

The remaining proof gap is closed. The Playwright sequence now establishes the
required order without relying on timing during sheet opening or focus transfer:

1. it programmatically focuses the `Work phase` control;
2. it positively asserts that this control owns focus;
3. only then does it capture the currently rendered live-workout clock value;
4. it polls until that same clock has a different value; and
5. it verifies that the `Work phase` control still owns focus after the change.

This is a genuine parent-rerender proof rather than a cosmetic clock check.
`LiveWorkout` installs a one-second interval while `state.clock.runningSince` is
truthy, calls `setNow(Date.now())`, derives `elapsedMs` from that state, and
renders the clock from `elapsedMs`. Therefore the observed text change requires
a `LiveWorkout` state update and render while the open `ExerciseInfoSheet`
remains in its tree. The sheet receives a new inline `onClose` identity on that
render, so retaining child focus specifically exercises the lifecycle boundary
fixed in `b04fabb`.

The new pre-baseline `toBeFocused()` assertion also removes the last race in
`60b647d`: a tick before focus settled can no longer satisfy the poll, because
the baseline is read after confirmed focus ownership. A tick between that
assertion and the baseline read is harmless; it merely becomes the new baseline
and the poll waits for the following tick.

## Independent verification

- `npm run typecheck` — passed.
- `npx eslint e2e/workout-workspace-v2.spec.ts` — passed with no output.
- `NODE_OPTIONS=--no-experimental-webstorage npx vitest run tests/components/exercise-info-sheet.test.ts -t "keeps child focus across callback-identity rerenders and wraps focus in both directions"` — passed: 1 test, 3 skipped.
- `git diff a0c92e9^ a0c92e9 --check` — passed.
- Diff inspection confirmed that the executable E2E change is only the added
  pre-baseline focus assertion plus clearer baseline naming; no production code
  changed in this commit.

The exact authenticated Playwright filter was rerun for both themes. Both tests
timed out at `e2e/workout-workspace-v2.spec.ts:430`, before reaching the clock
proof, because the current workout-home heading/navigation layout intercepts
pointer events on `Find an exercise`. This exactly matches the report and is a
separate broader layout regression, not a failure of the corrected proof.

The wider two-file component run produced 22 passes and one separate stale V2
media assertion: `exercise-info-sheet.test.ts` expects a static technique poster
while the current accepted V3 resolver supplies verified motion. This also
matches the report's disclosed media mismatch and does not affect the focused
callback-identity/focus test.

## Scope

Concurrent Task 10b test edits and the existing untracked Impeccable/media files
were left untouched. This review adds only this report.
