# Premium Workout Muscle Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a premium, mobile-first Workout system led by an accurate interactive muscle atlas, controllable exercise motion, explicit plan/review/live states, deterministic recommendations, and useful progress evidence.

**Architecture:** Preserve the existing `WorkoutWorkspaceProvider` and atomic draft/live persistence. Add a pure typed anatomy/media/recommendation domain beneath focused visual components, then replace each route composition without changing its durable state-machine responsibilities. Canonical anatomy is code-native SVG; technique motion is a controllable media layer with static posters and honest fallbacks.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind/CSS variables, Framer Motion 12, Lucide, Supabase/Postgres with Drizzle, tRPC, Vitest/Testing Library, Playwright, WebM/WebP/SVG media.

**Spec:** `docs/superpowers/specs/2026-09-02-premium-workout-muscle-atlas-design.md`

## Global Constraints

- Preserve the existing routed Workout provider and `idle → draft → review → starting → live ↔ paused → finishing → completed` persistence contract.
- Adding an exercise never creates or starts a live session.
- Every moving visual has a visible pause/replay control and a complete `prefers-reduced-motion` poster state.
- Exact exercise/equipment identity is required for technique media; uncovered exercises use a labeled anatomy or neutral fallback.
- Personal Best tokens remain the visual authority in light and dark mode.
- English is the development source of truth; unsupported localized exercise guidance falls back coherently to English.
- Mobile Safari at 320–430 CSS pixels is first-class; 44px controls, 16px inputs, safe-area padding, and bottom-navigation clearance are mandatory.
- No recurring paid inference is required for recommendations or media rendering.
- Existing coach/client authorization, RLS, audit behavior, retries, idempotency, and offline recovery remain intact.
- A deployment is allowed only after targeted tests, full bounded verification, visual review, and production canaries pass.

---

### Task 1: Typed anatomy, muscle-load, and media contracts

**Files:**
- Create: `lib/workout/anatomy.ts`
- Create: `lib/workout/exercise-media.ts`
- Create: `lib/workout/muscle-load.ts`
- Modify: `lib/workout-assets.ts`
- Test: `tests/workout/anatomy.test.ts`
- Test: `tests/workout/exercise-media.test.ts`
- Test: `tests/workout/muscle-load.test.ts`
- Modify: `tests/components/workout-asset-resolver.test.ts`

**Interfaces:**
- Produces: `AnatomyMuscleId`, `MuscleRole`, `MuscleActivation`, `ExerciseMediaRecord`, `resolveExerciseMedia()`, `resolveMuscleActivations()`, `calculateMuscleLoad()`.
- Consumes: existing `Exercise`, `MuscleGroup`, and `/workout-v2` assets.

- [ ] **Step 1: Write failing contract tests**

```ts
import { resolveMuscleActivations } from '@/lib/workout/anatomy';
import { resolveExerciseMedia } from '@/lib/workout/exercise-media';

it('maps bench press to curated primary and secondary muscles', () => {
  expect(resolveMuscleActivations({ name: 'Barbell Bench Press', equipment: 'Barbell' })).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: 'pectoralis-major', role: 'primary', view: 'front' }),
      expect.objectContaining({ id: 'triceps-brachii', role: 'secondary' }),
      expect.objectContaining({ id: 'anterior-deltoid', role: 'secondary' }),
    ]),
  );
});

it('never returns mismatched technique media', () => {
  expect(resolveExerciseMedia({ name: 'Landmine Press', equipment: 'Barbell', muscleGroup: 'chest' }).tier)
    .not.toBe('verified-technique');
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/workout/anatomy.test.ts tests/workout/exercise-media.test.ts tests/workout/muscle-load.test.ts tests/components/workout-asset-resolver.test.ts`

Expected: FAIL because the new domain modules and resolver tiers do not exist.

- [ ] **Step 3: Implement the pure domain**

```ts
export type MuscleRole = 'primary' | 'secondary' | 'stabilizer';
export type AnatomyView = 'front' | 'back';
export interface MuscleActivation {
  id: AnatomyMuscleId;
  label: string;
  role: MuscleRole;
  view: AnatomyView;
}

export interface ExerciseMediaRecord {
  slug: string;
  canonicalNames: string[];
  equipment: string[];
  posterSrc: string;
  motionSrc?: string;
  motionType?: 'video/webm' | 'video/mp4';
  tier: 'verified-technique' | 'verified-anatomy' | 'honest-fallback';
  activations: MuscleActivation[];
  phases: Array<{ id: 'setup' | 'work' | 'finish'; label: string; cue: string }>;
  provenance: { kind: 'repo-vector' | 'generated' | 'sourced'; source: string; reviewedOn: string };
}
```

`resolveExerciseMedia()` must require both canonical name and compatible equipment before returning `verified-technique`. `calculateMuscleLoad()` must weight completed working sets as primary `1`, secondary `0.5`, stabilizer `0.2`, and warmups `0.25` of the applicable role.

- [ ] **Step 4: Verify GREEN and regression scope**

Run: `npx vitest run tests/workout/anatomy.test.ts tests/workout/exercise-media.test.ts tests/workout/muscle-load.test.ts tests/components/workout-asset-resolver.test.ts tests/components/workout-asset-quality.test.ts`

Expected: PASS with no warnings.

- [ ] **Step 5: Commit**

```bash
git add lib/workout/anatomy.ts lib/workout/exercise-media.ts lib/workout/muscle-load.ts lib/workout-assets.ts tests/workout tests/components/workout-asset-resolver.test.ts
git commit -m "feat(workout): add verified anatomy and media contracts"
```

### Task 2: Accessible interactive atlas and motion player

**Files:**
- Create: `components/workout/MuscleAtlas.tsx`
- Create: `components/workout/ExerciseMotion.tsx`
- Create: `components/workout/ExerciseMediaBadge.tsx`
- Modify: `app/globals.css`
- Test: `tests/components/muscle-atlas.test.tsx`
- Test: `tests/components/exercise-motion.test.tsx`
- Test: `tests/components/exercise-media-badge.test.tsx`

**Interfaces:**
- Consumes: `MuscleActivation`, `ExerciseMediaRecord` from Task 1.
- Produces: `<MuscleAtlas activations selected onSelect compact />`, `<ExerciseMotion media alt autoplay />`, and a tier badge that labels anatomy/fallback honestly.

- [ ] **Step 1: Write failing interaction and accessibility tests**

```tsx
render(<MuscleAtlas activations={benchActivations} selected="pectoralis-major" onSelect={onSelect} />);
await user.click(screen.getByRole('button', { name: /pectoralis major.*primary/i }));
expect(onSelect).toHaveBeenCalledWith('pectoralis-major');
expect(screen.getByText('Primary')).toBeVisible();

render(<ExerciseMotion media={benchMedia} alt="Bench press demonstration" autoplay />);
expect(screen.getByRole('button', { name: /pause demonstration/i })).toBeVisible();
await user.click(screen.getByRole('button', { name: /pause demonstration/i }));
expect(screen.getByTestId('exercise-motion-video')).toHaveProperty('paused', true);
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/muscle-atlas.test.tsx tests/components/exercise-motion.test.tsx tests/components/exercise-media-badge.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: Implement focused visual primitives**

The atlas must render named SVG regions as semantic buttons over deterministic front/back figures, expose role labels outside the graphic, preserve focus, and switch views without layout movement. The motion component must use a poster-first `<video muted loop playsInline preload="metadata">`, pause when offscreen or hidden, and render only the poster under reduced motion.

```tsx
<video
  ref={videoRef}
  poster={media.posterSrc}
  muted
  loop
  playsInline
  preload="metadata"
  aria-label={alt}
  data-testid="exercise-motion-video"
>
  {media.motionSrc ? <source src={media.motionSrc} type={media.motionType} /> : null}
</video>
```

- [ ] **Step 4: Verify GREEN, focus, and reduced motion**

Run: `npx vitest run tests/components/muscle-atlas.test.tsx tests/components/exercise-motion.test.tsx tests/components/exercise-media-badge.test.tsx tests/components/workout-theme-v2.test.ts`

Expected: PASS; no unlabeled controls and no direct hardcoded theme colors outside the Personal Best mapping.

- [ ] **Step 5: Commit**

```bash
git add components/workout/MuscleAtlas.tsx components/workout/ExerciseMotion.tsx components/workout/ExerciseMediaBadge.tsx app/globals.css tests/components
git commit -m "feat(workout): add accessible muscle atlas and motion player"
```

### Task 3: Workout preferences and deterministic recommendation engine

**Files:**
- Create: `drizzle/0082_workout_preferences.sql`
- Modify: `db/schema/profiles.ts`
- Modify: `lib/types.ts`
- Create: `lib/workout/preferences.ts`
- Create: `lib/workout/recommendation.ts`
- Modify: `lib/trpc/routers/workouts.ts`
- Test: `tests/workout/recommendation.test.ts`
- Test: `tests/trpc/workouts-preferences.test.ts`
- Test: `tests/db/rls.test.ts`

**Interfaces:**
- Produces: `WorkoutPreferences`, `WorkoutRecommendation`, `buildWorkoutRecommendation()`, `workouts.preferences.mine`, `workouts.preferences.update`, and `workouts.recommendation.mine`.
- Consumes: existing goal/activity profile data, exercise library, recent completed sets, active program, and pain flags.

- [ ] **Step 1: Write failing recommendation and authorization tests**

```ts
it('returns a reviewable equipment-compatible draft without replacing coach work', () => {
  const result = buildWorkoutRecommendation({
    preferences: { experience: 'beginner', equipment: ['dumbbell', 'bench'], durationMinutes: 30, daysPerWeek: 3, location: 'home' },
    profileGoal: 'muscle_gain',
    exercises,
    recentSets: [],
    painRegions: [],
    activeCoachTemplate: coachTemplate,
  });
  expect(result.source).toBe('coach');
  expect(result.exercises.every((item) => ['Dumbbell', 'Bench', 'Bodyweight'].includes(item.equipment))).toBe(true);
  expect(result.liveSessionId).toBeUndefined();
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/workout/recommendation.test.ts tests/trpc/workouts-preferences.test.ts tests/db/rls.test.ts`

Expected: FAIL because preference persistence and recommendation APIs are absent.

- [ ] **Step 3: Implement migration, schema, pure ranking, and protected routes**

Migration `0082` adds `client_profiles.workout_preferences jsonb NOT NULL DEFAULT '{}'::jsonb` plus a JSON-object constraint. The update route validates a versioned payload with Zod and permits only the authenticated client or their assigned coach through existing table RLS. The recommendation route returns source, reasons, estimated duration, equipment, muscle distribution, and draft exercises; it does not write a session.

```ts
export interface WorkoutPreferences {
  version: 1;
  experience: 'beginner' | 'intermediate' | 'advanced';
  equipment: Array<'bodyweight' | 'dumbbell' | 'barbell' | 'bench' | 'cable' | 'machine' | 'cardio'>;
  durationMinutes: 20 | 30 | 45 | 60;
  daysPerWeek: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  location: 'home' | 'gym' | 'both';
}
```

- [ ] **Step 4: Verify GREEN and migration safety**

Run: `npx vitest run tests/workout/recommendation.test.ts tests/trpc/workouts-preferences.test.ts tests/db/rls.test.ts && npm run typecheck`

Expected: PASS; recommendation calls create no workout session rows.

- [ ] **Step 5: Commit**

```bash
git add drizzle/0082_workout_preferences.sql db/schema/profiles.ts lib/types.ts lib/workout/preferences.ts lib/workout/recommendation.ts lib/trpc/routers/workouts.ts tests/workout/recommendation.test.ts tests/trpc/workouts-preferences.test.ts tests/db/rls.test.ts
git commit -m "feat(workout): add coach-governed recommendations"
```

### Task 4: Replace Workout home with today rail, atlas, and schedule evidence

**Files:**
- Create: `components/workout/workspace/WorkoutTodayRail.tsx`
- Create: `components/workout/workspace/WorkoutScheduleStrip.tsx`
- Create: `components/workout/workspace/WorkoutAtlasHome.tsx`
- Rewrite: `components/workout/workspace/WorkoutHome.tsx`
- Modify: `app/dashboard/workout/page.tsx`
- Modify: `components/dashboard/BottomNav.tsx`
- Test: `tests/components/workout-home-v3.test.tsx`
- Modify: `tests/components/workout-home-v2.test.tsx`
- Modify: `tests/components/dashboard-nik-feedback.test.ts`

**Interfaces:**
- Consumes: current `WorkoutHomeProgram`, recommendation response, recents, routines, `MuscleAtlas`, workspace stage.
- Produces: premium home with explicit `Review plan`, `Build workout`, `Resume workout`, and stable Workout-tab reselection behavior.

- [ ] **Step 1: Write failing home and navigation tests**

```tsx
render(<WorkoutHomeHarness program={coachProgram} recommendation={recommendation} />);
expect(screen.getByText(/assigned by coach/i)).toBeVisible();
expect(screen.getByRole('button', { name: /review plan/i })).toBeEnabled();
expect(screen.queryByRole('button', { name: /finish workout/i })).not.toBeInTheDocument();
expect(screen.getByRole('button', { name: /pectoralis major/i })).toBeVisible();

await user.click(screen.getByRole('link', { name: 'Workout' }));
expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/workout');
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/workout-home-v3.test.tsx tests/components/workout-home-v2.test.tsx tests/components/dashboard-nik-feedback.test.ts`

Expected: FAIL because the v3 hierarchy and atlas home are missing.

- [ ] **Step 3: Implement the approved first viewport**

Recompose home as: stage recovery banner when required; compact header; today/source/readiness rail; selectable atlas with current target; singular CTA; schedule strip; recent progress and secondary destinations. Remove the old Strength/Cardio hero mannequins and ambiguous Quick Start grid. Preserve existing draft-replacement confirmation behavior.

- [ ] **Step 4: Verify GREEN and route persistence**

Run: `npx vitest run tests/components/workout-home-v3.test.tsx tests/components/workout-home-v2.test.tsx tests/components/workout-workspace-navigation.test.tsx tests/components/dashboard-nik-feedback.test.ts`

Expected: PASS; Workout tab returns home while the provider retains a recoverable draft/live state.

- [ ] **Step 5: Commit**

```bash
git add components/workout/workspace app/dashboard/workout/page.tsx components/dashboard/BottomNav.tsx tests/components
git commit -m "feat(workout): launch interactive atlas home"
```

### Task 5: Muscle-first discovery and persistent plan tray

**Files:**
- Create: `components/workout/ExerciseResults.tsx`
- Create: `components/workout/WorkoutPlanTray.tsx`
- Rewrite: `components/workout/ExercisePicker.tsx`
- Modify: `components/workout/workspace/ExerciseBrowser.tsx`
- Modify: `app/dashboard/workout/exercises/page.tsx`
- Test: `tests/components/exercise-picker-atlas.test.tsx`
- Modify: `tests/components/exercise-picker-flow.test.ts`
- Modify: `tests/components/exercise-picker-layering.test.ts`

**Interfaces:**
- Consumes: Task 1 media resolver, Task 2 atlas, current multi-select callbacks.
- Produces: muscle-first/search-first discovery, equipment filters, exact media badges, multi-add plan tray, and non-destructive back navigation.

- [ ] **Step 1: Write failing discovery tests**

```tsx
renderPicker();
await user.click(screen.getByRole('button', { name: /chest/i }));
expect(screen.getByRole('heading', { name: /chest exercises/i })).toBeVisible();
await user.click(screen.getByRole('button', { name: /add barbell bench press/i }));
expect(screen.getByText(/1 exercise selected/i)).toBeVisible();
expect(screen.queryByText(/live workout/i)).not.toBeInTheDocument();
await user.click(screen.getByRole('button', { name: /back to muscle groups/i }));
expect(screen.getByRole('heading', { name: /what are you training/i })).toBeVisible();
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/exercise-picker-atlas.test.tsx tests/components/exercise-picker-flow.test.ts tests/components/exercise-picker-layering.test.ts`

Expected: FAIL because atlas discovery and the new tray are absent.

- [ ] **Step 3: Implement discovery without auto-start**

The first state shows atlas/body-area choices plus search and recent movements. A selected area shows compact result rows with poster, name, equipment, role badge, detail action, and Add. The tray summarizes selected exercise posters and navigates to `/dashboard/workout/build`; it never creates a session.

- [ ] **Step 4: Verify GREEN at narrow widths**

Run: `npx vitest run tests/components/exercise-picker-atlas.test.tsx tests/components/exercise-picker-flow.test.ts tests/components/exercise-picker-layering.test.ts tests/components/client-secondary-theme-contract.test.ts`

Expected: PASS; tray and navigation occupy distinct safe-area layers.

- [ ] **Step 5: Commit**

```bash
git add components/workout/ExerciseResults.tsx components/workout/WorkoutPlanTray.tsx components/workout/ExercisePicker.tsx components/workout/workspace/ExerciseBrowser.tsx app/dashboard/workout/exercises/page.tsx tests/components
git commit -m "feat(workout): make exercise discovery muscle-first"
```

### Task 6: Full exercise detail with motion, anatomy, phases, and evidence

**Files:**
- Rewrite: `components/workout/ExerciseDetail.tsx`
- Modify: `components/workout/ExerciseInfoSheet.tsx`
- Modify: `components/workout/workspace/RoutedExerciseDetail.tsx`
- Modify: `app/dashboard/workout/exercises/[id]/page.tsx`
- Test: `tests/components/exercise-detail-v3.test.tsx`
- Modify: `tests/components/exercise-detail-v2.test.tsx`
- Modify: `tests/components/exercise-info-sheet.test.ts`

**Interfaces:**
- Consumes: `resolveExerciseMedia()`, `ExerciseMotion`, `MuscleAtlas`, existing history query.
- Produces: exact media hero, phase selector, role legend, organized cues, safety, PR/history, and add/replace action.

- [ ] **Step 1: Write failing detail tests**

```tsx
render(<ExerciseDetail exercise={bench} userId={null} onAdd={onAdd} />);
expect(screen.getByRole('button', { name: /pause demonstration/i })).toBeVisible();
expect(screen.getByRole('button', { name: /setup phase/i })).toBeVisible();
expect(screen.getByText(/pectoralis major/i)).toBeVisible();
expect(screen.getByText(/primary/i)).toBeVisible();
expect(screen.getByText(/barbell/i)).toBeVisible();
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/exercise-detail-v3.test.tsx tests/components/exercise-detail-v2.test.tsx tests/components/exercise-info-sheet.test.ts`

Expected: FAIL because motion, phases, and named anatomy roles are absent.

- [ ] **Step 3: Recompose detail around instruction**

Place media and play/pause first, followed by exercise identity, phase controls, front/back atlas, role explanation, equipment/setup, guidance, safety, evidence, and a nonoverlapping contextual CTA. Keep data loading and localized instruction fallback behavior.

- [ ] **Step 4: Verify GREEN and fallback honesty**

Run: `npx vitest run tests/components/exercise-detail-v3.test.tsx tests/components/exercise-detail-v2.test.tsx tests/components/exercise-info-sheet.test.ts tests/components/personal-best-primitives.test.ts`

Expected: PASS; unmatched exercises render `Anatomy reference` or `No exact demo yet`, never `Technique demonstration`.

- [ ] **Step 5: Commit**

```bash
git add components/workout/ExerciseDetail.tsx components/workout/ExerciseInfoSheet.tsx components/workout/workspace/RoutedExerciseDetail.tsx app/dashboard/workout/exercises tests/components
git commit -m "feat(workout): add instructive exercise detail"
```

### Task 7: Premium plan editor and explicit review

**Files:**
- Create: `components/workout/workspace/PlanExerciseCard.tsx`
- Create: `components/workout/workspace/PlanMuscleSummary.tsx`
- Rewrite: `components/workout/workspace/WorkoutBuilder.tsx`
- Rewrite: `components/workout/workspace/WorkoutReview.tsx`
- Modify: `app/dashboard/workout/build/page.tsx`
- Modify: `app/dashboard/workout/review/page.tsx`
- Test: `tests/components/workout-builder-v3.test.tsx`
- Test: `tests/components/workout-review-v3.test.tsx`
- Modify: `tests/components/workout-builder.test.tsx`
- Modify: `tests/components/workout-review.test.tsx`

**Interfaces:**
- Consumes: typed media, atlas summary, current workspace mutations and save-plan callback.
- Produces: reorderable plan blocks, target/rest controls, replacement, muscle distribution, conflict warnings, explicit Start and Log completed actions.

- [ ] **Step 1: Write failing editor/review tests**

```tsx
render(<WorkoutBuilder exercises={exercises} onSavePlan={onSavePlan} />);
expect(screen.getByText(/3 exercises.*9 working sets/i)).toBeVisible();
await user.click(screen.getByRole('button', { name: /move dumbbell row earlier/i }));
expect(screen.getAllByTestId('plan-exercise')[0]).toHaveTextContent('Dumbbell Row');

render(<WorkoutReview exercises={exercises} />);
expect(screen.getByRole('button', { name: /start workout/i })).toBeEnabled();
expect(screen.getByRole('button', { name: /log completed workout/i })).toBeEnabled();
expect(screen.queryByRole('button', { name: /finish workout/i })).not.toBeInTheDocument();
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/workout-builder-v3.test.tsx tests/components/workout-review-v3.test.tsx tests/components/workout-builder.test.tsx tests/components/workout-review.test.tsx`

Expected: FAIL because premium plan cards and summaries are missing.

- [ ] **Step 3: Implement editor and review composition**

Use discrete move earlier/later buttons plus pointer reordering where supported; never require drag precision. Show exact posters, target sets/reps, rest, RPE, notes, substitution, and muscle balance. Start remains the only path that creates the live session.

- [ ] **Step 4: Verify GREEN and workspace state transitions**

Run: `npx vitest run tests/components/workout-builder-v3.test.tsx tests/components/workout-review-v3.test.tsx tests/components/workout-builder.test.tsx tests/components/workout-review.test.tsx tests/workout/workspace-state.test.ts`

Expected: PASS; editor mutations remain draft-only and review actions enter distinct start/retrospective persistence paths.

- [ ] **Step 5: Commit**

```bash
git add components/workout/workspace app/dashboard/workout/build app/dashboard/workout/review tests/components
git commit -m "feat(workout): make plans reviewable and explicit"
```

### Task 8: Focused live-session experience

**Files:**
- Create: `components/workout/workspace/LiveExerciseStage.tsx`
- Create: `components/workout/workspace/LiveSessionPath.tsx`
- Modify: `components/workout/workspace/ExerciseSetLogger.tsx`
- Rewrite: `components/workout/workspace/LiveWorkout.tsx`
- Modify: `components/workout/workspace/LiveCardio.tsx`
- Modify: `components/workout/PlateCalculator.tsx`
- Modify: `components/workout/PainFlagModal.tsx`
- Test: `tests/components/live-workout-v3.test.tsx`
- Modify: `tests/components/live-workout.test.tsx`
- Modify: `tests/components/live-workout-plate-real-consumer.test.tsx`

**Interfaces:**
- Consumes: existing atomic persistence functions, media primitives, draft structure, pause/resume/finish methods.
- Produces: one-exercise live stage, visible path/progress, large set controls, rest state, technique access, pause, pain, and confirmed finish.

- [ ] **Step 1: Write failing live-flow tests**

```tsx
render(<LiveWorkout userId="nik" exercises={[bench, row]} />);
expect(screen.getByText(/exercise 1 of 2/i)).toBeVisible();
expect(screen.getByRole('button', { name: /pause workout/i })).toBeVisible();
expect(screen.getByRole('button', { name: /complete set/i })).toBeEnabled();
await user.click(screen.getByRole('button', { name: /complete set/i }));
expect(screen.getByText(/rest/i)).toBeVisible();
expect(screen.getByText(/up next.*dumbbell row/i)).toBeVisible();
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx`

Expected: FAIL because the one-exercise stage and session path are absent.

- [ ] **Step 3: Implement focused live composition without changing persistence semantics**

Render current exercise media, exact target/previous values, large numeric fields, Complete set, rest timer, next exercise, and a compact session path. Pause stops workout time and media. High-severity pain uses the existing durable mutation and auto-pause. Finish stays behind `FinishWorkoutDialog`; empty sessions offer discard rather than save.

- [ ] **Step 4: Verify GREEN, offline recovery, and terminal authority**

Run: `npx vitest run tests/components/live-workout-v3.test.tsx tests/components/live-workout.test.tsx tests/components/live-workout-plate-real-consumer.test.tsx tests/workout/live-session.test.ts tests/workout/workout-persistence.test.ts`

Expected: PASS with existing idempotency and recovery assertions unchanged.

- [ ] **Step 5: Commit**

```bash
git add components/workout/workspace components/workout/PlateCalculator.tsx components/workout/PainFlagModal.tsx tests/components tests/workout
git commit -m "feat(workout): focus the live training experience"
```

### Task 9: Schedule, muscle-load, weight, and exercise-progress analytics

**Files:**
- Create: `components/workout/analytics/WorkoutCalendar.tsx`
- Create: `components/workout/analytics/MuscleLoadChart.tsx`
- Create: `components/workout/analytics/ExerciseProgressChart.tsx`
- Create: `components/workout/analytics/WorkoutSummaryMetrics.tsx`
- Rewrite: `app/dashboard/workout/stats/page.tsx`
- Modify: `app/dashboard/workout/history/page.tsx`
- Modify: `components/workout/RecentSessionCard.tsx`
- Test: `tests/components/workout-analytics.test.tsx`
- Test: `tests/components/workout-history-v3.test.tsx`

**Interfaces:**
- Consumes: `calculateMuscleLoad()`, sessions/sets/measurements already accessible to the authenticated user.
- Produces: scheduled/completed calendar, time-range muscle load, exercise progress, monthly history grouping, and legible empty/error states.

- [ ] **Step 1: Write failing analytics tests**

```tsx
render(<MuscleLoadChart data={load} range="week" />);
expect(screen.getByRole('img', { name: /weekly muscle load/i })).toBeVisible();
expect(screen.getByText(/chest.*80%/i)).toBeVisible();

render(<WorkoutCalendar month="2026-09" scheduled={['2026-09-03']} completed={['2026-09-03']} />);
expect(screen.getByLabelText(/september 3.*scheduled.*completed/i)).toBeVisible();
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/workout-analytics.test.tsx tests/components/workout-history-v3.test.tsx`

Expected: FAIL because the analytics primitives do not exist.

- [ ] **Step 3: Implement semantic charts and grouped history**

Charts must include text summaries and table-equivalent values rather than canvas-only meaning. Range controls use `Last`, `Week`, `Month`, and `All time`; the empty state explains which logged evidence creates the chart. Calendar cells distinguish scheduled, completed, and both by icon/pattern plus accessible text.

- [ ] **Step 4: Verify GREEN and theme contrast**

Run: `npx vitest run tests/components/workout-analytics.test.tsx tests/components/workout-history-v3.test.tsx tests/components/workout-theme-v2.test.ts tests/components/client-secondary-theme-contract.test.ts`

Expected: PASS in light/dark render contracts.

- [ ] **Step 5: Commit**

```bash
git add components/workout/analytics app/dashboard/workout/stats/page.tsx app/dashboard/workout/history/page.tsx components/workout/RecentSessionCard.tsx tests/components
git commit -m "feat(workout): add useful training analytics"
```

### Task 10: Produce verified premium media cohort and provenance

**Files:**
- Create: `assets/workout-v3/sources/*`
- Create: `assets/workout-v3/masters/*`
- Create: `public/workout-v3/posters/*`
- Create: `public/workout-v3/motion/*`
- Create: `public/workout-v3/manifest.json`
- Create: `scripts/visual/build-workout-v3-media.mjs`
- Modify: `.vercelignore`
- Test: `tests/components/workout-v3-asset-quality.test.ts`

**Interfaces:**
- Consumes: canonical slugs/equipment/activations from Task 1.
- Produces: 4K masters, responsive posters, short controlled WebM loops, prompt/source sidecars, checksums, safe-margin metadata, and manifest entries for the initial verified cohort.

- [ ] **Step 1: Write the failing asset-quality test**

```ts
it.each(requiredTechniqueSlugs)('%s has a 4K source, poster, motion loop, and provenance', (slug) => {
  const item = manifest.assets[slug];
  expect(item.master.width * item.master.height).toBeGreaterThanOrEqual(8_000_000);
  expect(item.poster.src).toMatch(/^\/workout-v3\/posters\/.+\.webp$/);
  expect(item.motion.src).toMatch(/^\/workout-v3\/motion\/.+\.webm$/);
  expect(item.provenance.promptOrOrigin).not.toHaveLength(0);
  expect(item.review.exerciseIdentity).toBe(true);
  expect(item.review.equipmentIdentity).toBe(true);
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/components/workout-v3-asset-quality.test.ts`

Expected: FAIL because the v3 cohort and manifest are absent.

- [ ] **Step 3: Produce and validate the initial cohort**

Cover the existing exact technique slugs: bench press, incline dumbbell press, smith bench press, machine chest press, floor press, pec deck, cable fly, push-up, dip, pull-up, row, overhead press, curl, triceps extension, squat, and deadlift. Every frame keeps the full movement and equipment inside a neutral-light plate. Generated frames remain illustrative until the manifest’s identity/equipment/phase review booleans are recorded true; an unverified asset remains anatomy-only.

Build script converts masters to WebP posters and WebM loops, captures dimensions/checksums, and rejects missing provenance. Source/master assets remain excluded from Vercel; optimized display media ships.

- [ ] **Step 4: Verify GREEN, size budget, and provenance scan**

Run: `node scripts/visual/build-workout-v3-media.mjs --check && npx vitest run tests/components/workout-v3-asset-quality.test.ts tests/components/workout-asset-quality.test.ts && node /Users/daniel_serverm4/.codex/skills/impeccable/scripts/embed-prompt.mjs --scan public/workout-v3 assets/workout-v3`

Expected: PASS; no missing source/prompt metadata and no display asset outside its declared byte budget.

- [ ] **Step 5: Commit**

```bash
git add assets/workout-v3 public/workout-v3 scripts/visual/build-workout-v3-media.mjs .vercelignore tests/components/workout-v3-asset-quality.test.ts
git commit -m "feat(workout): add verified premium motion media"
```

### Task 11: Translation, route-motion, and accessibility integration

**Files:**
- Modify: `lib/i18n.tsx`
- Modify: `lib/locales/es.ts`
- Modify: `lib/locales/el.ts`
- Modify: `lib/locales/fr.ts`
- Modify: `lib/locales/de.ts`
- Modify: `lib/locales/it.ts`
- Modify: `lib/locales/pt.ts`
- Modify: `lib/locales/nl.ts`
- Create: `components/workout/workspace/WorkoutRouteTransition.tsx`
- Modify: `app/dashboard/workout/layout.tsx`
- Test: `tests/i18n/workout-atlas-copy.test.ts`
- Test: `tests/components/workout-route-transition.test.tsx`
- Test: `tests/components/workout-accessibility-v3.test.tsx`

**Interfaces:**
- Consumes: all new UI copy and routes.
- Produces: locale parity, English fallback without mixed sentences, direction-aware transitions, static reduced-motion behavior.

- [ ] **Step 1: Write failing parity, transition, and accessibility tests**

```ts
for (const locale of locales) {
  expect(locale['workout.atlas_primary']).toBeTruthy();
  expect(locale['workout.review_plan']).toBeTruthy();
  expect(locale['workout.pause_demonstration']).toBeTruthy();
}
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/i18n/workout-atlas-copy.test.ts tests/components/workout-route-transition.test.tsx tests/components/workout-accessibility-v3.test.tsx`

Expected: FAIL because the new keys and route-transition shell do not exist.

- [ ] **Step 3: Add coherent copy and restrained motion**

Translate whole UI units across supported locales. Exercise-specific instructions continue to fall back to English as one complete block. Route transitions use a 180–240ms directional translate/fade and become an immediate swap under reduced motion. Preserve focus after navigation and dialog close.

- [ ] **Step 4: Verify GREEN and theme inventory**

Run: `npx vitest run tests/i18n/workout-atlas-copy.test.ts tests/components/workout-route-transition.test.tsx tests/components/workout-accessibility-v3.test.tsx && npm run guard:theme`

Expected: PASS with complete key parity and no inaccessible auto-motion.

- [ ] **Step 5: Commit**

```bash
git add lib/i18n.tsx lib/locales components/workout/workspace/WorkoutRouteTransition.tsx app/dashboard/workout/layout.tsx tests/i18n tests/components
git commit -m "feat(workout): integrate accessible motion and copy"
```

### Task 12: Full verification, Impeccable finish review, merge, deploy, and canary

**Files:**
- Modify: `docs/superpowers/specs/2026-09-02-premium-workout-muscle-atlas-design.md`
- Modify: `DESIGN.md` only through the required Impeccable documenter after final correction
- Create/replace: `.impeccable/review/workout-*.png`
- Create: `tests/e2e/workout-atlas.spec.ts`

**Interfaces:**
- Consumes: the complete implementation and approved comp `.impeccable/mocks/decision/workout-muscle-atlas.webp`.
- Produces: verified release evidence, reviewer verdict, documentation, PR, production deployment, and canary result.

- [ ] **Step 1: Add failing end-to-end journey before final wiring**

```ts
test('atlas to explicit live session to summary', async ({ page }) => {
  await page.goto('/dashboard/workout');
  await page.getByRole('button', { name: /chest/i }).click();
  await page.getByRole('button', { name: /add barbell bench press/i }).click();
  await page.getByRole('button', { name: /review plan/i }).click();
  await expect(page.getByRole('button', { name: /start workout/i })).toBeVisible();
  await page.getByRole('button', { name: /start workout/i }).click();
  await expect(page.getByText(/exercise 1 of/i)).toBeVisible();
});
```

- [ ] **Step 2: Run targeted and full automated verification**

Run:

```bash
npx vitest run tests/workout tests/components/workout-* tests/components/exercise-* tests/components/live-* tests/i18n/workout-*
npm run typecheck
npm run lint
npm run verify:bounded
npm run build
npx playwright test tests/e2e/workout-atlas.spec.ts
```

Expected: PASS with no new warnings.

- [ ] **Step 3: Capture and inspect the approved surface**

Capture light/dark at 320, 390, 430, 768, and 1280 widths for home, discovery, detail, review, live, and analytics. Store valid screenshots under `.impeccable/review/`, inspect each file, then run the one allowed detector pass:

```bash
node /Users/daniel_serverm4/.codex/skills/impeccable/scripts/detect.mjs --json app/dashboard/workout components/workout
```

Fix mechanical findings in one batch and recapture once.

- [ ] **Step 4: Run required fresh finish reviewer and documenter**

Spawn `impeccable_finish_reviewer` with the original request, approved spec, artifact paths, all screenshot paths, direction contract, detector findings, approved comp, and craft-floor reference. Act on its disposition. After the last correction, spawn `impeccable_documenter` to reconcile `DESIGN.md`, the sidecar, and this surface’s documented rules.

- [ ] **Step 5: Merge, deploy, and verify production**

Run the repository release workflow, merge the reviewed PR, wait for Vercel production, then run:

```bash
npm run canary:prod
npm run canary:theme
```

Verify production routes, media headers, authentication redirects, theme boot, and service-worker freshness. Report the exact merge commit, deployment URL, automated results, reviewer disposition, and any scoped residual risk.

## Self-review

- Spec coverage: product model, six route jobs, anatomy, motion, fidelity tiers, recommendations, accessibility, analytics, media provenance, light/dark/mobile verification, and deploy gates each have an owning task.
- Placeholder scan: the plan contains no deferred implementation markers; initial media cohort and exact interfaces are named.
- Type consistency: Tasks 2, 4–9 consume the Task 1 contracts; Task 3 recommendations return drafts only; Tasks 7–8 preserve distinct review/start/live state transitions.
