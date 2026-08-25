# Task 8A report — Real-consumer warm-up verification closure

## Status

Complete. Tests only; no product defect was reproduced and no production code changed.

## Coverage added

- The real `LiveWorkout` → `ExerciseSetLogger` → `PlateCalculator` flow now stores a 220 lb ramp as exact kilogram payloads: 40.82, 58.97, and 79.38 kg.
- A completed working set visibly rejects a later warm-up insertion without another persistence write.
- Two successful intentional live ramps receive distinct logical set numbers 1–3 then 4–6.
- Typed, uncompleted planned and extra working-row values remain on their stable rows after a warm-up prefix shifts their displayed set numbers.
- Refresh composition uses the real `recoverLiveExtraRows`: persisted warm-ups 1–3 plus work 4 produce exactly four rows, while a genuine set 5 produces exactly one extra row.
- The real retrospective logger and calculator save the exact seven-row lb payload for two ramp blocks and the shifted 220 lb working set, with no `arrayContaining` allowance for extras.

The consumer components and recovery function remain real. Test doubles are limited to the persistence transport and workspace boundary so payloads, pending outcomes, and recovery fixtures are controlled at the domain/network edge.

## RED / GREEN evidence

- RED: the strengthened tests initially exposed test-environment setup gaps (browser storage is disabled in this Vitest worker) and an incorrect hand-derived 60% lb rack result. They were corrected by preserving the real conversion helper and using the actual reachable 130 lb / 58.97 kg plate load. No assertion reproduced a production defect, so no production change was warranted.
- GREEN: `npx vitest run tests/components/live-workout-plate-real-consumer.test.tsx tests/components/live-workout.test.tsx tests/components/retrospective-workout-logger.test.tsx tests/workout/live-session.test.ts tests/components/plate-calculator-v2.test.tsx tests/workout/plates.test.ts tests/components/exercise-set-logger.test.tsx tests/components/live-cardio.test.tsx tests/components/finish-workout-dialog.test.tsx tests/workout/workout-persistence.test.ts` — 10 files, 93 tests passed.

## Verification

- `npm run typecheck` — passed.
- Scoped ESLint for the two modified component tests — passed with no warnings.
- `git diff --check` — passed.
