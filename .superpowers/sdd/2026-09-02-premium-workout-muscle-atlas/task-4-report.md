# Task 4 report — Workout home atlas

## Outcome

Replaced Workout home with a compact today/source/readiness rail, an interactive instructional muscle atlas, one contextual primary action, schedule evidence, recent progress, and secondary exercise/cardio/history/stats destinations. Coach assignments take precedence over deterministic recommendations. Draft/live/paused/finishing/completed recovery continues through the existing persisted workspace provider.

The old Strength/Cardio mannequin heroes and Quick Start template grid are no longer rendered by `WorkoutHome`. A live or paused session alone receives **Resume workout**; assigned/recommended plans receive **Review plan**; an empty home receives **Build workout**. No home action starts a live session.

Workout-tab reselection required no production change in this task: the current `ClientShell` + `BotNav` interface at HEAD already calls `router.replace('/dashboard/workout')` for an active nested Workout route, and the required navigation regression remains green.

## TDD evidence

### RED

Command:

```text
npx vitest run tests/components/workout-home-v3.test.tsx tests/components/workout-home-v2.test.tsx tests/components/dashboard-nik-feedback.test.ts
```

Exact failing summary:

```text
❯ tests/components/dashboard-nik-feedback.test.ts (3 tests | 1 failed)
    × marks workout planning placeholders so release screenshots wait for real evidence
❯ tests/components/workout-home-v3.test.tsx (5 tests | 5 failed)
    × makes a coach assignment, plan readiness, target, and review action immediately explicit
    × presents a deterministic recommendation for review without starting a live session
    × uses one build action when no assigned or recommended plan exists
    × uses Resume workout only for a recoverable live session
    × uses Resume workout only for a recoverable paused session
❯ tests/components/workout-home-v2.test.tsx (16 tests | 12 failed)
    × offers one dominant recovery action for live and hides new-workout actions
    × offers one dominant recovery action for paused and hides new-workout actions
    × previews Push without starting or opening the exercise picker
    × opens the body-area exercise browser before showing an empty strength draft
    × keeps Push on Cancel and replaces it with Pull only after named confirmation
    × replaces an existing routine with the named coach plan before entering Review
    × creates the template draft only after the user confirms the preview
    × takes Preview Push through review and starts live without persisting the built-in key as template_id
    × turns a coach program into a reviewable draft instead of auto-starting guided mode
    × keeps coach-resolved exercise metadata through review when the client library cannot resolve the id
    × builds cardio as an editable draft
    × keeps a deterministic browse surface during program errors

Test Files  3 failed (3)
     Tests  18 failed | 6 passed (24)
  Duration  8.98s
```

The failures were the expected missing-v3 failures: no assigned/recommended source evidence, no atlas home, no singular v3 action, old entry controls still present, and no recommendation loading wiring.

### GREEN

Required command:

```text
npx vitest run tests/components/workout-home-v3.test.tsx tests/components/workout-home-v2.test.tsx tests/components/workout-workspace-navigation.test.tsx tests/components/dashboard-nik-feedback.test.ts
```

Exact output:

```text
RUN  v4.1.10 /Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/premium-nik-20260902

(node:41959) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(Use `node --trace-deprecation ...` to show where the warning was created)

Test Files  4 passed (4)
     Tests  47 passed (47)
  Duration  1.08s
```

## Regression evidence

```text
NODE_OPTIONS=--localstorage-file=/tmp/trophe-task4-components-final-localstorage.json npx vitest run tests/components

Test Files  84 passed (84)
     Tests  627 passed (627)
  Duration  6.09s
```

```text
npm run typecheck

> trophe@0.1.1 typecheck
> tsc --noEmit
```

```text
npm run lint

Exit 0. Existing react-hooks warnings remain in unrelated coach/admin files; Task 4 files have no lint findings.
```

`git diff --check` also passed.

## Files

- `components/workout/workspace/WorkoutTodayRail.tsx` — source, workflow readiness, workload, duration, and next-action evidence.
- `components/workout/workspace/WorkoutAtlasHome.tsx` — selectable compact atlas with a textual role explanation.
- `components/workout/workspace/WorkoutScheduleStrip.tsx` — today/later/next schedule rows.
- `components/workout/workspace/WorkoutHome.tsx` — new home composition and existing replacement/recovery behavior.
- `app/dashboard/workout/page.tsx` — deterministic recommendation query and home wiring.
- `tests/components/workout-home-v3.test.tsx` — v3 hierarchy, source, CTA, atlas, and no-auto-start coverage.
- `tests/components/workout-home-v2.test.tsx` — persistence/confirmation paths adapted to the new home controls.
- `tests/components/workout-home-data-flows.test.tsx` — page recommendation mock and new Review plan label.
- `tests/components/client-secondary-theme-contract.test.ts` — new controls retained in auth/route/accessibility journeys.
- `tests/components/dashboard-nik-feedback.test.ts` — recommendation loading evidence gate.

## Self-review

- Coach assignment wins over an adaptive recommendation and is labeled explicitly.
- Recommendation conversion preserves exercise identity, muscle group, targets, RPE, duration evidence, and the review-only boundary.
- Atlas activations come from the deterministic Task 1 anatomy registry; selected muscle role is stated in text, so color is not the only signal.
- The home uses opaque Personal Best surfaces, one-pixel rails, existing theme tokens, one low-elevation atlas surface, no gradients, and no hardcoded theme colors.
- Primary/secondary controls and atlas targets remain at least 44px; links and buttons have visible focus treatment.
- Narrow rails collapse from three columns to two plus a full-width next-step row below 390px, with truncation on schedule rows rather than horizontal overflow.
- Pending start and retrospective envelopes still short-circuit to their exact safe retry/review action. Draft replacement still requires the named `ConfirmSheet` confirmation.
- Live/paused routes recover with **Resume workout**; finishing remains **Continue workout** and completed remains **View workout summary**, avoiding an inaccurate resume claim.
- The compact evidence rail now repeats the actual primary-action label as its next-step evidence, including saved drafts and cardio.

## Concerns

- On the repository's current Node runtime, running the broad component suite without a `--localstorage-file` emits `ExperimentalWarning: localStorage is not available` and causes six unrelated admin/live tests to fail. The same 84-file suite is 627/627 with an explicit test-localStorage file, and the Task 4 required suite passes without it.
- Authenticated real-device visual QA at 320/375/390/430 widths and both themes remains a release-level browser check; the component, responsive-class, theme-token, keyboard, and DOM interaction checks are green here.
