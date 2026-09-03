# Task 9 report — training analytics

## Implemented

- Added semantic calendar, role-weighted muscle load, exercise-progress, and summary-metric primitives.
- Replaced the stats route with an authenticated analytics surface backed by workout sessions, logged sets, and joined exercises.
- Grouped history sessions by descending calendar month and changed recent-session expansion to an accessible set table.
- Removed the prior decorative history sparkline. Calendar scheduling is explicitly empty because this route has no authenticated assignment source; body weight is explicitly unavailable because no verified measurement source is queried.

## TDD evidence

- RED: `npx vitest run tests/components/workout-analytics.test.tsx tests/components/workout-history-v3.test.tsx` failed before implementation: the requested analytics modules could not resolve and the history grouping function was absent.
- RED (range boundary): the newly added range test failed because `filterMuscleLoadEntries` did not yet exist.
- GREEN: `npx vitest run tests/components/workout-analytics.test.tsx tests/components/workout-history-v3.test.tsx tests/i18n/workout-analytics-copy.test.ts` passed with 9 tests.

## Verification

- `npx tsc --noEmit --pretty false` passed.
- Targeted ESLint passed for all Task 9 source and test files.
- `git diff --check` passed.
- Focused analytics/history/theme/load run: analytics, history, workout theme, and muscle-load tests passed (29/31); `client-secondary-theme-contract` has two pre-existing failures in `WorkoutBuilder.tsx`, outside Task 9.

## Data and performance notes

- Persisted set rows are treated as logged evidence at the data-boundary and passed as `completed: true` into Task 1's existing `calculateMuscleLoad()` contract; warmup and role weighting remain in that function.
- The analytics surface indexes sessions by id and groups exercise/date evidence once with memoized maps. Rendered chart geometry is bounded by fetched evidence and values always have a table/text equivalent.
- No scheduled-workout or body-weight data is fabricated.

## Files changed

- `components/workout/analytics/*`
- `app/dashboard/workout/stats/page.tsx`
- `app/dashboard/workout/history/page.tsx`
- `components/workout/RecentSessionCard.tsx`
- `tests/components/workout-analytics.test.tsx`
- `tests/components/workout-history-v3.test.tsx`

## Concern

- The analytics primitives retain existing English fallback labels; the new RecentSessionCard visible/ARIA wording is localized with parity coverage in all eight dictionaries.

## Review fix round 1

- Added the terminal `completed_at` session field and filters, selected-date calendar controls, local date range anchoring, real authenticated program schedule expansion, authenticated body-weight measurements, and preferred-unit summary display.
- The selected-month program recurrence currently expands from active `workout_program_days` while respecting `starts_on`; measurement query errors remain distinct from an empty measurement history.
- GREEN: focused analytics/history/i18n tests and typecheck passed after the data-boundary changes.

## Review fix continuation

- Added testable terminal-session page exhaustion/deduplication and safe id chunking; analytics now uses them for unbounded terminal-session and set retrieval.
- History now filters terminal sessions and has a recoverable visible error state; it builds a session-to-sets map in one pass.

## Review fix round 1 completion — 2026-09-03

### Production completion

- Replaced the partial data wiring with `loadWorkoutAnalyticsData`, a deterministic production loader used by the real analytics surface. It scopes terminal sessions to the authenticated user, exhausts stable pages beyond 1,000 rows, deduplicates overlapping page rows, orders ties by session date/completion/id, and batches set ids safely.
- The loader queries authenticated body-weight measurements and active client programs plus weekday recurrence. Schedule expansion follows the displayed month and respects `starts_on`. Schedule and measurement query failures remain separately classified from valid no-record states while core workout evidence stays visible and retryable.
- The surface now cancels superseded loads and ignores stale/unmounted completions. Authentication redirects before any data query. Its one-pass indexes produce session sets, muscle-load entries, exercise names, and progress evidence without per-session global scans or copied grouping arrays.
- Calendar selection now drives Week/Month anchors and schedule month. Last uses the actual newest terminal session date, including cardio and unresolved sessions, and explicitly reports when that latest session has no resolved strength evidence.
- Exercise progress now uses the best valid working set per completed session, preserves deterministic chronological order for date ties, exposes exact table evidence, honors the preferred kg/lb unit, and omits null weight/repetition evidence instead of manufacturing zeroes. Summary metrics and body weight use the same preferred unit and active-locale number/date formatting.
- All new visible, loading, error, retry, empty, date, unit, navigation, table, and ARIA copy is routed through the active locale. The exact Task 9 copy contract covers new and reused keys across en/es/el/fr/de/it/pt/nl; rendered Spanish, Greek, and German component checks prevent mixed-English UI (canonical exercise names remain valid evidence).
- Workout History now retries initial session or set failures in place with `finally` cleanup, paginates terminal sessions, safely batches sets, guards stale state, groups months in one pass, localizes dates/navigation/copy, honors preferred units, and renders missing weight/reps honestly. RecentSessionCard keeps lazy failures distinct from empty results, retries in place, localizes its date/table/ARIA copy, and no longer turns null values into zero.
- Task 9 production/test changes were committed as `6bdfea2` (`fix(workout): complete analytics evidence gate`). Unrelated and untracked files were preserved; no detector was run.

### TDD evidence

- RED command: `npx vitest run tests/workout/analytics-data.test.ts tests/i18n/workout-analytics-copy.test.ts tests/components/workout-analytics.test.tsx tests/components/workout-analytics-locales.test.tsx tests/components/workout-analytics-route.test.tsx tests/components/workout-history-retry.test.tsx tests/components/recent-session-card-retry.test.tsx`
- RED result before production changes: 7 failed files, 15 failed tests, 9 passed tests. Failures covered absent loader/query integration, incomplete locale copy/rendering, latest-session honesty, preferred-unit/null output, partial-query retry, stale loads, History reload retry, and RecentSession failed-load misclassification. Two matcher ambiguities discovered in that run were corrected without weakening the behavioral assertions; the isolated History/RecentSession RED rerun retained the two intended recovery failures.
- Loader GREEN: `npx vitest run tests/workout/analytics-data.test.ts` — 1 file passed, 4 tests passed.
- Integrated loader/i18n/surface/route GREEN: `npx vitest run tests/workout/analytics-data.test.ts tests/i18n/workout-analytics-copy.test.ts tests/components/workout-analytics.test.tsx tests/components/workout-analytics-locales.test.tsx tests/components/workout-analytics-route.test.tsx` — 5 files passed, 22 tests passed.
- History/RecentSession GREEN: `npx vitest run tests/components/workout-history-retry.test.tsx tests/components/recent-session-card-retry.test.tsx tests/components/workout-history-v3.test.tsx` — 3 files passed, 3 tests passed.
- Expanded Task 9 GREEN: `npx vitest run tests/workout/analytics-data.test.ts tests/workout/muscle-load.test.ts tests/components/workout-analytics.test.tsx tests/components/workout-analytics-locales.test.tsx tests/components/workout-analytics-route.test.tsx tests/components/workout-history-retry.test.tsx tests/components/workout-history-v3.test.tsx tests/components/recent-session-card-retry.test.tsx tests/components/workout-home-data-flows.test.tsx tests/i18n/workout-analytics-copy.test.ts tests/i18n/task8-locale-parity.test.ts tests/lib/overlay-locale-coverage.test.ts tests/components/workout-theme-v2.test.ts` — 13 files passed, 52 tests passed.
- Expanded run including the known broader theme contract: 13 files passed and 1 file failed; 65 tests passed and 2 failed out of 67.

### Static verification

- `npx tsc --noEmit` passed.
- Targeted ESLint over all Task 9 source, locale, loader, and added test files passed with no errors or warnings.
- `git diff --check` and the staged equivalent passed.

### External residual

- The only expanded-suite failures are the two previously identified Task 7 assertions in `tests/components/client-secondary-theme-contract.test.ts`, both targeting `components/workout/workspace/WorkoutBuilder.tsx`: `keeps mobile input, textarea, and select text at 16px` (five builder controls), and `keeps exercise toolbar controls outside the collapse button and names owned icon controls` (expected named move/remove ARIA source contract). Neither file is part of Task 9 and neither was changed here.

### Files completed in this round

- `app/dashboard/workout/history/page.tsx`
- `components/workout/RecentSessionCard.tsx`
- `components/workout/analytics/{ExerciseProgressChart,MuscleLoadChart,WorkoutAnalyticsSurface,WorkoutCalendar,WorkoutSummaryMetrics}.tsx` and `components/workout/analytics/history-grouping.ts`
- `lib/workout/analytics-data.ts`, `lib/i18n-locale.ts`, `lib/i18n.tsx`, `lib/locales/workout-analytics.ts`, and the five overlay locale modules
- `tests/workout/analytics-data.test.ts`, `tests/i18n/workout-analytics-copy.test.ts`, and the Task 9 analytics/locale/route/history/RecentSession component tests

## Review fix round 2 — exact Last-session identity

- Corrected the round-1 date-level Last association: every muscle-load entry now carries its terminal `sessionId`, the surface passes `data.sessions[0].id`, and Last filters only that exact session. Week and Month remain selected-date anchored; All remains unchanged.
- Because `loadWorkoutAnalyticsData` sorts terminal sessions by `session_date`, then `completed_at`, then `id` descending, `data.sessions[0]` is deterministic. The loader regression now explicitly proves the final id tie-break.
- Added same-calendar-date regressions for both cases: a later cardio/unresolved terminal session hides an earlier strength session from Last and renders the localized no-strength state; a latest strength session includes only its own muscle-load entries, not another same-day strength session.
- RED: `npx vitest run tests/components/workout-analytics.test.tsx tests/components/workout-analytics-route.test.tsx` — 2 failed, 13 passed. The primitive returned no exact-id match while the route leaked the earlier same-day strength evidence into Last.
- GREEN: `npx vitest run tests/components/workout-analytics.test.tsx tests/components/workout-analytics-route.test.tsx tests/workout/analytics-data.test.ts` — 3 files passed, 19 tests passed.
- Static checks passed: `npx tsc --noEmit`; targeted ESLint for the two production files and three focused test files; `git diff --check`.
- Files changed: `components/workout/analytics/MuscleLoadChart.tsx`, `components/workout/analytics/WorkoutAnalyticsSurface.tsx`, `tests/components/workout-analytics.test.tsx`, `tests/components/workout-analytics-route.test.tsx`, and `tests/workout/analytics-data.test.ts`.
- The Task 11 `setLang` observation was intentionally left unchanged as directed. No new external residual was introduced.
