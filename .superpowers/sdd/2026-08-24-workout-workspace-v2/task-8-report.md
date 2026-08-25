# Task 8 report — Pain reporting and plate utilities

## Status

Complete. Commit: `feat(workout): clarify pain and plate utilities`.

## Delivered

- `PainFlagModal` now identifies the exercise, accepts a suggested but editable body region, uses a native radio group for all five severity levels, explains coach visibility, and retains values when the existing durable save returns an error.
- Added pure `calculatePlateLoad`, `nearestPlateLoad`, and `buildWarmupRamp` utilities. The loading result is symmetric per side and never exceeds the requested total when a nearest result is needed.
- `PlateCalculator` now supports editable total, bar weight, and plate inventory; labels both mirrored sides; reports exact/nearest/impossible states; explains its warm-up suggestions; and exposes `onAddWarmupSets` only when supplied with a live/draft exercise context.
- Added localized copy using the existing core-language translation model and semantic theme-token classes only.

## TDD evidence

- RED: `npx vitest run tests/components/pain-flag-modal.test.tsx tests/components/plate-calculator-v2.test.tsx tests/workout/plates.test.ts` failed before implementation: missing `lib/workout/plates`, missing side/field labels, and non-radio pain controls.
- GREEN: the same focused command passes: 3 files, 8 tests.

## Verification

- `npm run typecheck` — pass.
- Targeted ESLint — pass with no warnings.
- `npm run lint` — no errors; 46 pre-existing warnings outside Task 8 (primarily `react-hooks/set-state-in-effect`).
- `git diff --check` — pass.

## Files

- `components/workout/PainFlagModal.tsx`
- `components/workout/PlateCalculator.tsx`
- `lib/workout/plates.ts`
- `lib/i18n.tsx`
- `tests/components/pain-flag-modal.test.tsx`
- `tests/components/plate-calculator-v2.test.tsx`
- `tests/workout/plates.test.ts`

## Concerns

- The newly exposed warm-up callback is intentionally opt-in; current legacy callers do not pass exercise context, so no set insertion or Task 7 persistence behavior changed.
- Existing callers that only provide `exerciseId` retain compatibility; they can supply a human-readable `exerciseName` and suggested region as their live/draft context becomes available.

---

## Fix round 1

All seven Important review findings are addressed.

- Plate search now has fixed, realistic bounds (`2,000` total, `100` bar/denomination, `12` denominations, `32` plates per side), rejects absurd finite input before allocation, and chooses true absolute nearest load with a lower-load tie-break.
- Warm-up ramps omit duplicates and unsafe loads, include actual achieved percentages, and return no ramp when the working load is at or below the bar.
- The calculator guards insertion with pending/disabled/error states and retains editable input after a verified callback failure. It accepts decimal commas and uses semicolon-separated inventory tokens.
- Live insertion converts display values to kilogram storage, uses the existing `runMutation` finish barrier and logical set numbering, and retains set-number allocation across retries. Retrospective insertion creates local warm-up rows only.
- Live, retrospective, and guided pain callers now supply a human exercise name and body-region suggestion; the fallback is a localized generic label, never a raw id.
- Modal close handlers use refs so interval or inline-callback rerenders do not restore focus or re-focus the dialog.
- New Task 8 strings are present in EN/ES/EL and in every lazy overlay dictionary (FR/DE/IT/PT/NL), with a parity test.

Fix-round verification:

```sh
npx vitest run tests/components/pain-flag-modal.test.tsx tests/components/live-workout.test.tsx tests/components/retrospective-workout-logger.test.tsx tests/workout/live-session.test.ts tests/components/plate-calculator-v2.test.tsx tests/workout/plates.test.ts tests/i18n/task8-locale-parity.test.ts
# 7 files, 64 tests passed

npm run typecheck
# pass

npm run lint
# exit 0; 46 pre-existing warnings, 0 errors
```

## Fix round 2

- Overlay Task 8 additions are one property per line and pass the repository's regex-based overlay coverage invariant.
- Calculator input retains raw decimal-comma text, blocks close/editing while a warm-up insertion is pending, and treats bar-only nearest results as valid.
- The fixed search cap also constrains returned candidates to the advertised maximum total.
- Successful live insertions clear their retry-only logical-number cache; raw `full_body` and `cardio` suggestions are suppressed while known muscle groups are localized.

Verification: overlay coverage + Task 8 parity + live/retrospective/Task 7 regression command passed (8 files, 69 tests); typecheck and scoped lint passed; diff check passed.

## Fix round 3

- Live row construction now places each exercise's warm-up prefix before its planned working rows. Live insertion is refused once a working set for that exercise exists, avoiding historical identity rewrites.
- An unresolved warm-up payload keeps its allocated logical identities only for an exact retry; a changed payload is rejected. Successful insertion clears that retry cache so a later intentional ramp receives fresh identities.
- Added localized mappings for concrete muscle tokens and suppresses non-anatomical `full_body`/`cardio` suggestions.
- Retrospective row construction now inserts warm-ups before the selected exercise’s working rows, shifts local working identities deterministically, and persists the warm-up prefix with its exercise-local set numbers. Its regression test opens the real plate calculator rather than a null component mock.

RED/GREEN evidence: the new retrospective placement test first failed with `Bench, Row, Bench, Bench`; it passes after exercise-local prefix construction. The new anatomical-token test first failed because `biceps` was shown raw; it passes after localized token mapping.

Verification: overlay coverage, parity, focused Task 8, and affected Task 7 commands passed (8 files, 71 tests); `npm run typecheck` passed; full `npm run lint` exited 0 with 46 existing warnings and no errors; `git diff --check` passed.

## Fix rounds 4–5

- Logger rows now use stable local identities (`planned`, `extra`, `warmup`, or persisted set id); logical `setNumber` is derived solely for UI/persistence ordering. Prefixing warm-ups therefore retains typed and completed working-row state instead of transferring it to warm-up row 1.
- Live extra rows are retained by stable identity and reindexed after the warm-up prefix, so they are not filtered out when their former number collides with the shifted planned range.
- Retrospective completion values are keyed by stable row identity and resolved against each row’s current logical number at final save.
- Added real PlateCalculator consumer coverage for live insertion, finish barrier blocking, changed-ramp rejection, and exact retry identity reuse. An isolated live-consumer test uses the real ExerciseSetLogger and calculator controls to verify the persisted 40/60/80 kg warm-up payloads; component coverage now includes sequential decimal-comma input, pending close/input locks, bar-only states, and allocation-bound output.

RED/GREEN evidence: retrospective working value preservation initially failed after insertion (`''` instead of `80` for the shifted working row); it passes with stable row identities. The existing live calculator regression exercises the real callback and confirms its first retry reuses logical set `1` after a partial write.

Verification: focused Task 8/Task 7 suite passed (9 files, 77 tests); `npm run typecheck` passed; scoped ESLint and `git diff --check` passed.

## Final fix round 5

- Refresh recovery now counts each exercise’s persisted warm-up prefix before determining the first genuine extra row. A target of one with warm-ups 1–3 and working set 4 reconstructs four rows, while a genuine set 5 remains an extra.
- The real live consumer suite also verifies this recovered row order. The locale matrix now checks all eight dictionaries for concrete biceps/quads/glutes/forearms mappings and the full-body/cardio generic prompt, with no raw-token fallback.
- Boundary plate allocation coverage now asserts the exact 2,000 kg load composition rather than only an upper bound.

RED/GREEN evidence: recovery initially returned phantom extras 2–4 for a warm-up-prefixed working set; it now returns only genuine extra set 5. The eight-locale token matrix initially caught English raw `forearms`/`glutes`; it now uses anatomical-region copy.

Final verification: focused Task 8 + affected Task 7 command passed (9 files, 80 tests); `npm run typecheck` passed; full `npm run lint` exited 0 with 46 pre-existing warnings and no errors; `git diff --check` passed.
