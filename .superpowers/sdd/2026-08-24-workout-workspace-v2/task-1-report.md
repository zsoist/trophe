# Task 1 report: Draft and live state model

## RED/GREEN evidence

- RED: `npx vitest run tests/workout/workspace-state.test.ts` failed because `@/lib/workout/workspace-state` did not exist.
- GREEN: The same focused command passes: 3 tests passed.
- Additional verification: `npx tsc --noEmit` passes; ESLint passes for both changed source/test files; `git diff --check` is clean.

## Files changed

- `lib/workout/workspace-state.ts`: pure discriminated strength/cardio draft model, workspace state/event types, elapsed active-time calculation, and reducer transition validation.
- `tests/workout/workspace-state.test.ts`: draft creation, pause/resume elapsed-time, and required session-id coverage.

## Self-review

- Draft data is preserved across live, paused, finishing, and completed stages.
- Paused intervals are excluded from active elapsed time; backwards timestamps cannot reduce elapsed time.
- Invalid transitions throw, and an empty session id is rejected before live state is entered.
- Completion recovery state is retained until `completed.acknowledged`, which resets the workspace to home.
- The implementation has no browser, database, or side-effect dependencies.

## Concerns

- The brief did not define the full event surface or default values for empty cardio/strength drafts. Defaults are conservative (`walk`, zero duration, empty strength exercises) and can be adjusted if downstream task contracts specify otherwise.

## Fix round 1

### RED

Command: `npx vitest run tests/workout/workspace-state.test.ts`

Result: 1 failed, 3 passed. The new terminal-recovery regression expected 15,000 ms at finishing, but received 69,000 ms because the running clock was not frozen.

### GREEN

Commands and results:

- `npx vitest run tests/workout/workspace-state.test.ts` — 4 tests passed.
- `npx tsc --noEmit` — passed.
- `npx eslint lib/workout/workspace-state.ts tests/workout/workspace-state.test.ts` — passed.

### Fix files changed

- `lib/workout/workspace-state.ts`: `live.finishing` now requires `{ now }` and snapshots active time with `runningSince: null` before entering finishing.
- `tests/workout/workspace-state.test.ts`: verifies draft/session/clock recovery across live, paused, resumed, finishing, and completed; confirms elapsed time is frozen and only acknowledgement clears recovery.
