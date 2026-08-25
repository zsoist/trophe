# Workout Workspace V2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a draft-first, routed Workout workspace with explicit live and paused states, premium theme-safe visuals, anatomically responsible local assets, clear logging controls, and recoverable persistence.

**Architecture:** A persistent client provider mounted at `app/dashboard/workout/layout.tsx` owns a versioned user-scoped draft and live clock while route pages render Home, Build, Review, Live, exercise browser, and exercise detail stages. Existing Supabase workout helpers remain the persistence boundary; a database session is created only by explicit live start or confirmed retrospective logging. Shared visual and utility components replace the monolithic workout-page presentation while retaining existing history, PR, routine, set, and RLS behavior.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Supabase, Framer Motion, Lucide React, Vitest + Testing Library, Playwright, Next Image, Sharp, built-in Imagegen.

**Spec:** `docs/superpowers/specs/2026-08-24-workout-workspace-v2-design.md`

## Global Constraints

- Preserve Personal Best, existing Supabase schema, RLS behavior, exercise history, programs, routines, PRs, supersets, units, and localized exercise data.
- Browsing, selecting a template, adding an exercise, or editing a target must never create a database workout session.
- Starting live is explicit; finishing is confirmed and verified before recovery state is cleared.
- Light and dark text/background pairs meet WCAG AA; targets are at least 44×44 CSS pixels.
- Static artwork is bundled locally and introduces no runtime image API cost.
- Exercise artwork uses contained composition; generic anatomy must not be represented as movement technique.
- ClientShell remains the only bottom-navigation owner.
- All feature and bugfix work follows red-green-refactor TDD.

---

### Task 1: Define the Draft and Live State Model

**Files:**
- Create: `lib/workout/workspace-state.ts`
- Test: `tests/workout/workspace-state.test.ts`

**Interfaces:**
- Produces: `WorkoutWorkspaceState`, `WorkoutWorkspaceEvent`, `workoutWorkspaceReducer`, `createEmptyDraft`, `elapsedActiveMs`, `WORKOUT_DRAFT_VERSION`.
- Consumes: `Exercise` from `@/lib/types` only as an identity payload; no browser or database dependency.

- [ ] **Step 1: Write failing reducer tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  createInitialWorkspaceState,
  elapsedActiveMs,
  workoutWorkspaceReducer,
} from '@/lib/workout/workspace-state';

describe('workout workspace state', () => {
  it('builds a draft without starting a session', () => {
    const state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created',
      payload: { name: 'Push', kind: 'strength', templateKey: 'push' },
    });
    expect(state.stage).toBe('draft');
    expect(state.sessionId).toBeNull();
    expect(state.clock).toBeNull();
  });

  it('starts, pauses, and resumes active time without counting paused time', () => {
    let state = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Push', kind: 'strength' },
    });
    state = workoutWorkspaceReducer(state, {
      type: 'live.started', payload: { sessionId: 'session-1', now: 1_000 },
    });
    state = workoutWorkspaceReducer(state, { type: 'live.paused', payload: { now: 11_000 } });
    expect(elapsedActiveMs(state.clock, 31_000)).toBe(10_000);
    state = workoutWorkspaceReducer(state, { type: 'live.resumed', payload: { now: 41_000 } });
    expect(elapsedActiveMs(state.clock, 46_000)).toBe(15_000);
  });

  it('requires a session id before entering live state', () => {
    const initial = createInitialWorkspaceState();
    expect(() => workoutWorkspaceReducer(initial, {
      type: 'live.started', payload: { sessionId: '', now: 1_000 },
    })).toThrow(/session id/i);
  });
});
```

- [ ] **Step 2: Run tests and confirm red**

Run: `npx vitest run tests/workout/workspace-state.test.ts`

Expected: FAIL because `@/lib/workout/workspace-state` does not exist.

- [ ] **Step 3: Implement the pure state machine**

```ts
export type WorkoutStage = 'home' | 'draft' | 'review' | 'live' | 'paused' | 'finishing' | 'completed';
export type WorkoutKind = 'strength' | 'cardio';

export interface DraftExercise {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
}

interface WorkoutDraftBase {
  version: 2;
  name: string;
  templateKey?: string;
  updatedAt: number;
}

export interface StrengthDraft extends WorkoutDraftBase {
  kind: 'strength';
  exercises: DraftExercise[];
}

export interface CardioDraft extends WorkoutDraftBase {
  kind: 'cardio';
  activity: 'walk' | 'run' | 'cycle' | 'hiit' | 'swim' | 'other';
  durationMinutes: number;
  distanceKm: number | null;
  effort: number | null;
}

export type WorkoutDraft = StrengthDraft | CardioDraft;

export interface LiveClock {
  runningSince: number | null;
  accumulatedMs: number;
}

export interface WorkoutWorkspaceState {
  stage: WorkoutStage;
  draft: WorkoutDraft | null;
  sessionId: string | null;
  clock: LiveClock | null;
}

export const WORKOUT_DRAFT_VERSION = 2 as const;

export function elapsedActiveMs(clock: LiveClock | null, now: number): number {
  if (!clock) return 0;
  return clock.accumulatedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince));
}
```

The reducer must reject invalid transitions, preserve the draft through `live` and `paused`, and clear session recovery only after `completed.acknowledged`.

- [ ] **Step 4: Run the focused test**

Run: `npx vitest run tests/workout/workspace-state.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workout/workspace-state.ts tests/workout/workspace-state.test.ts
git commit -m "feat(workout): define draft and live state machine"
```

### Task 2: Add Versioned User-Scoped Recovery

**Files:**
- Create: `lib/workout/workspace-storage.ts`
- Test: `tests/workout/workspace-storage.test.ts`

**Interfaces:**
- Consumes: `WorkoutWorkspaceState`, `WORKOUT_DRAFT_VERSION` from Task 1.
- Produces: `workspaceStorageKey(userId)`, `loadWorkspaceState(storage, userId)`, `saveWorkspaceState(storage, userId, state)`, `clearWorkspaceState(storage, userId)`.

- [ ] **Step 1: Write failing storage tests**

```ts
import { describe, expect, it } from 'vitest';
import { loadWorkspaceState, saveWorkspaceState, workspaceStorageKey } from '@/lib/workout/workspace-storage';
import { createInitialWorkspaceState, workoutWorkspaceReducer } from '@/lib/workout/workspace-state';

describe('workout workspace recovery', () => {
  it('isolates recovery by user id', () => {
    const storage = new MapStorage();
    const draft = workoutWorkspaceReducer(createInitialWorkspaceState(), {
      type: 'draft.created', payload: { name: 'Legs', kind: 'strength' },
    });
    saveWorkspaceState(storage, 'nik', draft);
    expect(loadWorkspaceState(storage, 'nik')?.draft?.name).toBe('Legs');
    expect(loadWorkspaceState(storage, 'daniel')).toBeNull();
    expect(workspaceStorageKey('nik')).not.toBe(workspaceStorageKey('daniel'));
  });

  it('rejects malformed and obsolete payloads', () => {
    const storage = new MapStorage();
    storage.setItem(workspaceStorageKey('nik'), JSON.stringify({ version: 1, stage: 'live' }));
    expect(loadWorkspaceState(storage, 'nik')).toBeNull();
  });
});
```

Define `MapStorage` in the test with `getItem`, `setItem`, and `removeItem` so the module remains browser-independent.

- [ ] **Step 2: Run tests and confirm red**

Run: `npx vitest run tests/workout/workspace-storage.test.ts`

Expected: FAIL because the storage module does not exist.

- [ ] **Step 3: Implement strict parsing and write-through recovery**

Use a Zod schema or explicit type guards. Persist only fields needed to recover draft/session/clock; never persist full Supabase user or exercise rows. On parse/version failure, remove the corrupted key and return `null`.

- [ ] **Step 4: Run state and storage tests**

Run: `npx vitest run tests/workout/workspace-state.test.ts tests/workout/workspace-storage.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/workout/workspace-storage.ts tests/workout/workspace-storage.test.ts
git commit -m "feat(workout): persist recoverable user-scoped drafts"
```

### Task 3: Mount the Workspace Provider and Route Contract

**Files:**
- Create: `app/dashboard/workout/layout.tsx`
- Create: `components/workout/workspace/WorkoutWorkspaceProvider.tsx`
- Create: `components/workout/workspace/WorkoutWorkspaceHeader.tsx`
- Create: `lib/workout/workspace-routes.ts`
- Test: `tests/components/workout-workspace-provider.test.tsx`
- Test: `tests/components/workout-workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: reducer/storage interfaces from Tasks 1–2; `createWorkoutSession` from `components/workout/workout-persistence.ts`.
- Produces: `useWorkoutWorkspace()`, `WorkoutWorkspaceProvider`, `WORKOUT_ROUTES`, `workoutRouteForStage(stage)`.

- [ ] **Step 1: Write failing provider tests**

```tsx
it('does not call createWorkoutSession when creating or editing a draft', async () => {
  render(<ProviderHarness userId="nik" />);
  await userEvent.click(screen.getByRole('button', { name: 'Create Push draft' }));
  await userEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
  expect(createWorkoutSession).not.toHaveBeenCalled();
  expect(screen.getByText('Draft · Not started')).toBeVisible();
});

it('creates one session only after explicit live start', async () => {
  createWorkoutSession.mockResolvedValue('session-1');
  render(<ProviderHarness userId="nik" />);
  await userEvent.click(screen.getByRole('button', { name: 'Start live workout' }));
  expect(createWorkoutSession).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Live')).toBeVisible();
});
```

- [ ] **Step 2: Run tests and confirm red**

Run: `npx vitest run tests/components/workout-workspace-provider.test.tsx tests/components/workout-workspace-navigation.test.tsx`

Expected: FAIL because the provider and route contract do not exist.

- [ ] **Step 3: Implement provider API**

```ts
export interface WorkoutWorkspaceContextValue {
  state: WorkoutWorkspaceState;
  createDraft(input: { name: string; kind: WorkoutKind; templateKey?: string }): void;
  addDraftExercise(exerciseId: string): void;
  removeDraftExercise(exerciseId: string): void;
  updateDraftExercise(exerciseId: string, patch: Partial<Pick<DraftExercise, 'targetSets' | 'targetReps'>>): void;
  goToReview(): void;
  startLive(): Promise<boolean>;
  pause(now?: number): void;
  resume(now?: number): void;
  requestFinish(): void;
  acknowledgeCompleted(): void;
  discardDraft(): void;
}
```

Provider initialization loads the authenticated user-scoped recovery state after auth resolves, writes state changes to local storage, and exposes a loading skeleton until ownership is known. `startLive()` awaits one idempotent `createWorkoutSession` call and dispatches `live.started` only when a non-empty id is returned.

- [ ] **Step 4: Add route constants and header behavior**

```ts
export const WORKOUT_ROUTES = {
  home: '/dashboard/workout',
  build: '/dashboard/workout/build',
  review: '/dashboard/workout/review',
  live: '/dashboard/workout/live',
  exercises: '/dashboard/workout/exercises',
} as const;
```

The header renders a labeled Back action, the current title, `Workout Home`, and a `Draft`, `Live`, or `Paused` status. Use Lucide icons at one consistent stroke width; no Unicode icons.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/workout/workspace-*.test.ts tests/components/workout-workspace-*.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/workout/layout.tsx components/workout/workspace lib/workout/workspace-routes.ts tests/components/workout-workspace-provider.test.tsx tests/components/workout-workspace-navigation.test.tsx
git commit -m "feat(workout): mount routed workspace provider"
```

### Task 4: Fix Active-Tab Reselection and Bottom Safe Area

**Files:**
- Modify: `components/ui/BotNav.tsx`
- Modify: `components/shared/ClientShell.tsx`
- Modify: `app/globals.css`
- Test: `tests/components/client-shell-navigation.test.ts`
- Test: `tests/components/client-shell-layout.test.ts`

**Interfaces:**
- Consumes: `WORKOUT_ROUTES.home` from Task 3.
- Produces: `onActiveRouteSelect?: (href: string) => void` behavior in `BotNav` and stable ClientShell safe-area geometry.

- [ ] **Step 1: Extend navigation tests first**

```tsx
it('reselects the active Workout tab and returns to Workout Home', async () => {
  mockPathname('/dashboard/workout/live');
  render(<BotNav routes={clientRoutes} />);
  await userEvent.click(screen.getByRole('link', { name: /Workout/i }));
  expect(mockRouterReplace).toHaveBeenCalledWith('/dashboard/workout');
});

it('keeps one shell-owned nav at the safe-area edge', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  expect(css).toContain('bottom: env(safe-area-inset-bottom)');
  expect(css).not.toContain('bottom: max(0.5rem, env(safe-area-inset-bottom))');
});
```

- [ ] **Step 2: Run tests and confirm red**

Run: `npx vitest run tests/components/client-shell-navigation.test.ts tests/components/client-shell-layout.test.ts`

Expected: FAIL on active reselect and outdated bottom gap.

- [ ] **Step 3: Implement active route reselection**

On a Workout link whose pathname is already inside `/dashboard/workout`, prevent the same-path no-op and call `router.replace('/dashboard/workout')`. Preserve a recoverable live session in the provider; only the presented route resets.

- [ ] **Step 4: Correct safe-area ownership**

Set the mobile nav to the safe-area edge, keep 12–16px horizontal gutters, cap it at 36rem, and calculate `.client-shell__content` bottom padding from the actual nav height plus safe area plus 8px. Verify no page renders another BotNav inside ClientShell.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/components/client-shell-navigation.test.ts tests/components/client-shell-layout.test.ts tests/components/navigation-accessibility.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add components/ui/BotNav.tsx components/shared/ClientShell.tsx app/globals.css tests/components/client-shell-navigation.test.ts tests/components/client-shell-layout.test.ts
git commit -m "fix(navigation): reset Workout and anchor mobile nav"
```

### Task 5: Build Workout Home, Template Preview, Draft, and Review

**Files:**
- Rewrite: `app/dashboard/workout/page.tsx`
- Create: `app/dashboard/workout/build/page.tsx`
- Create: `app/dashboard/workout/review/page.tsx`
- Create: `components/workout/workspace/WorkoutHome.tsx`
- Create: `components/workout/workspace/WorkoutBuilder.tsx`
- Create: `components/workout/workspace/WorkoutReview.tsx`
- Modify: `components/workout/WorkoutEntryPanel.tsx`
- Modify: `components/workout/TodayProgramCard.tsx`
- Modify: `lib/i18n.tsx`
- Modify: `lib/locales/de.ts`
- Modify: `lib/locales/fr.ts`
- Modify: `lib/locales/it.ts`
- Modify: `lib/locales/nl.ts`
- Modify: `lib/locales/pt.ts`
- Test: `tests/components/workout-home-v2.test.tsx`
- Test: `tests/components/workout-builder.test.tsx`
- Test: `tests/components/workout-review.test.tsx`
- Test: `tests/i18n/workout-workspace-copy.test.ts`

**Interfaces:**
- Consumes: `useWorkoutWorkspace`, route constants, `WORKOUT_SPLITS`, current program/recents/routine queries.
- Produces: draft-only Strength/Cardio/template entry, editable Build stage, explicit Review decision.

- [ ] **Step 1: Replace old Quick Start expectations with preview-first tests**

```tsx
it('previews Push without starting or opening the exercise picker', async () => {
  render(<WorkoutHomeHarness />);
  await userEvent.click(screen.getByRole('button', { name: 'Preview Push' }));
  expect(screen.getByRole('heading', { name: 'Push' })).toBeVisible();
  expect(screen.getByText('Chest · Shoulders · Triceps')).toBeVisible();
  expect(createWorkoutSession).not.toHaveBeenCalled();
  expect(screen.queryByRole('dialog', { name: 'Add exercise' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Write Build and Review failing tests**

```tsx
it('never shows Finish Workout in a draft', () => {
  render(<WorkoutBuilderHarness draft={pushDraft} />);
  expect(screen.getByText('Draft · Not started')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Review workout' })).toBeEnabled();
  expect(screen.queryByRole('button', { name: 'Finish workout' })).not.toBeInTheDocument();
});

it('explains persistence before starting live', () => {
  render(<WorkoutReviewHarness draft={pushDraft} />);
  expect(screen.getByText(/starts the active timer/i)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Start live workout' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Log completed workout' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Save plan' })).toBeEnabled();
});

it('turns a coach program into a reviewable draft instead of auto-starting guided mode', async () => {
  render(<WorkoutHomeHarness program={coachProgram} />);
  await userEvent.click(screen.getByRole('button', { name: 'Review today’s workout' }));
  expect(createDraftFromTemplate).toHaveBeenCalledWith(coachProgram.todayTemplate);
  expect(createWorkoutSession).not.toHaveBeenCalled();
});

it('builds cardio as an editable draft', async () => {
  render(<WorkoutHomeHarness />);
  await userEvent.click(screen.getByRole('button', { name: 'Build cardio workout' }));
  expect(screen.getByLabelText('Activity')).toBeVisible();
  expect(screen.getByLabelText('Duration in minutes')).toBeVisible();
  expect(screen.getByLabelText('Distance optional')).toBeVisible();
  expect(createWorkoutSession).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run tests and confirm red**

Run: `npx vitest run tests/components/workout-home-v2.test.tsx tests/components/workout-builder.test.tsx tests/components/workout-review.test.tsx tests/i18n/workout-workspace-copy.test.ts`

Expected: FAIL because the routed components do not exist and Quick Start still starts freestyle.

- [ ] **Step 4: Implement Home and template preview**

Use restrained two-column Strength/Cardio choices with text on a deterministic surface rather than text over uncontrolled image contrast. Rename the section `Workout templates`. Preview exposes muscle summary, exercise count, `Use this template`, and `Cancel`; only `Use this template` creates the local draft and navigates to Build. A coach-authored program follows the same preview/review boundary instead of entering `GuidedSession` immediately. A cardio choice creates an editable draft containing activity, duration, optional distance, and effort; it does not quick-log on selection.

- [ ] **Step 5: Implement Build and Review**

Builder renders draft status, editable name, re-orderable exercise rows, target set/reps inputs, Add Exercise, Save Plan, and Review. Cardio Build renders activity, duration, optional distance, and effort rather than strength set fields. Review renders the appropriate strength or cardio summary and the three persistence choices from the spec. Empty drafts disable Review and teach the next action.

- [ ] **Step 6: Add complete workspace copy**

Add English, Spanish, and Greek copy to `lib/i18n.tsx`, plus parity entries for the five split locale modules. The test must assert keys for Workout templates, Preview, Draft not started, Review workout, Start live workout, Log completed workout, Save plan, Pause, Resume, Report pain, and Finish confirmation exist in every supported locale. English is the safe fallback when a translated exercise instruction is absent; UI chrome itself must not mix languages.

- [ ] **Step 7: Run focused tests**

Run: `npx vitest run tests/components/workout-entry-panel.test.ts tests/components/workout-home-v2.test.tsx tests/components/workout-builder.test.tsx tests/components/workout-review.test.tsx tests/i18n/workout-workspace-copy.test.ts`

Expected: PASS after updating the superseded `workout-entry-panel` contract to `Workout templates` and preview behavior.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/workout/page.tsx app/dashboard/workout/build app/dashboard/workout/review components/workout/WorkoutEntryPanel.tsx components/workout/TodayProgramCard.tsx components/workout/workspace lib/i18n.tsx lib/locales tests/components/workout-entry-panel.test.ts tests/components/workout-home-v2.test.tsx tests/components/workout-builder.test.tsx tests/components/workout-review.test.tsx tests/i18n/workout-workspace-copy.test.ts
git commit -m "feat(workout): add draft-first home and review flow"
```

### Task 6: Route the Exercise Browser and Full Exercise Detail

**Files:**
- Create: `app/dashboard/workout/exercises/page.tsx`
- Create: `app/dashboard/workout/exercises/[id]/page.tsx`
- Modify: `components/workout/ExercisePicker.tsx`
- Rewrite: `components/workout/ExerciseInfoSheet.tsx` as `ExerciseDetail.tsx` or retain a compatibility export.
- Modify: `components/workout/MovementVisual.tsx`
- Modify: `lib/workout-assets.ts`
- Test: `tests/components/exercise-picker-flow.test.ts`
- Test: `tests/components/exercise-detail-v2.test.tsx`
- Test: `tests/components/workout-asset-resolver.test.ts`

**Interfaces:**
- Consumes: draft context/provider, exercise rows from Supabase, local asset manifest from Task 9.
- Produces: route-addressable browser/detail screens and `MovementVisual` variants `anatomy | technique`.

- [ ] **Step 1: Write failing route/detail tests**

```tsx
it('adds an exercise to the draft without closing into a live session', async () => {
  render(<ExerciseBrowserHarness draft={pushDraft} />);
  await userEvent.click(screen.getByRole('button', { name: /^Chest/ }));
  await userEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));
  expect(addDraftExercise).toHaveBeenCalledWith('bench');
  expect(createWorkoutSession).not.toHaveBeenCalled();
  expect(mockRouterPush).toHaveBeenCalledWith('/dashboard/workout/build');
});

it('labels a fallback as muscles worked instead of technique', () => {
  render(<ExerciseDetail exercise={machinePressWithoutTechniqueAsset} />);
  expect(screen.getByText('Muscles worked')).toBeVisible();
  expect(screen.queryByAltText(/technique/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests and confirm red**

Run: `npx vitest run tests/components/exercise-picker-flow.test.ts tests/components/exercise-detail-v2.test.tsx tests/components/workout-asset-resolver.test.ts`

Expected: FAIL on routed return and fallback semantics.

- [ ] **Step 3: Implement semantic asset resolution**

```ts
export interface ResolvedWorkoutAsset {
  src: string;
  kind: 'technique' | 'anatomy';
  fit: 'contain';
  background: 'neutral';
}
```

Specific movement matches return `technique`. Unmatched names return the exercise's `muscle_group` anatomy and `kind: 'anatomy'`. `MovementVisual` always uses contain and exposes the kind so nearby copy can say `Technique` or `Muscles worked` accurately.

- [ ] **Step 4: Implement full route detail**

Render neutral full-width artwork, primary/secondary muscles, setup, execution, breathing, common mistakes, safety note, PR, recent sessions, and a sticky Add/Added action. Where the database contains one instruction paragraph only, split it only on real sentence boundaries; do not fabricate safety facts.

- [ ] **Step 5: Run focused tests**

Run: `npx vitest run tests/components/exercise-picker-*.test.ts tests/components/exercise-detail-v2.test.tsx tests/components/workout-asset-resolver.test.ts tests/components/exercise-info-sheet.test.ts`

Expected: PASS, with old sheet tests either migrated to route detail or retained through a compatibility export.

- [ ] **Step 6: Commit**

```bash
git add app/dashboard/workout/exercises components/workout/ExercisePicker.tsx components/workout/ExerciseDetail.tsx components/workout/ExerciseInfoSheet.tsx components/workout/MovementVisual.tsx lib/workout-assets.ts tests/components/exercise-picker-flow.test.ts tests/components/exercise-detail-v2.test.tsx tests/components/workout-asset-resolver.test.ts
git commit -m "feat(workout): route exercise discovery and detail"
```

### Task 7: Build Live, Pause, Set Logging, and Guarded Finish

**Files:**
- Create: `app/dashboard/workout/live/page.tsx`
- Create: `components/workout/workspace/LiveWorkout.tsx`
- Create: `components/workout/workspace/ExerciseSetLogger.tsx`
- Create: `components/workout/workspace/LiveCardio.tsx`
- Create: `components/workout/workspace/FinishWorkoutDialog.tsx`
- Refactor: persistence code from `app/dashboard/workout/page.tsx` into `lib/workout/live-session.ts`
- Modify: `components/workout/workout-persistence.ts`
- Test: `tests/workout/live-session.test.ts`
- Test: `tests/workout/workout-persistence.test.ts`
- Test: `tests/components/live-workout.test.tsx`
- Test: `tests/components/exercise-set-logger.test.tsx`
- Test: `tests/components/live-cardio.test.tsx`
- Test: `tests/components/finish-workout-dialog.test.tsx`

**Interfaces:**
- Consumes: provider state/actions and existing CRUD helpers.
- Produces: `completeLiveSet`, `finishLiveSession`, labeled set logger, pause/resume, confirmation. Explicit session creation remains owned by the Task 3 provider boundary.

- [ ] **Step 1: Write persistence-boundary failing tests**

```ts
it('completes sets against the provider-owned session without creating another session', async () => {
  await completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 1, weightKg: 60, reps: 8 });
  await completeLiveSet({ sessionId: 'session-1', exerciseId: 'bench', setNumber: 2, weightKg: 60, reps: 8 });
  expect(createWorkoutSession).not.toHaveBeenCalled();
  expect(insertWorkoutSet).toHaveBeenCalledTimes(2);
});

it('does not clear recovery when finish verification fails', async () => {
  finishWorkoutSession.mockResolvedValue(false);
  const result = await finishLiveSession(finishInput);
  expect(result.ok).toBe(false);
  expect(clearWorkspaceState).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write UI failing tests**

```tsx
it('uses explicit set labels and hides secondary tools under More', () => {
  render(<ExerciseSetLogger exercise={bench} />);
  expect(screen.getByLabelText('Weight in kg')).toBeVisible();
  expect(screen.getByLabelText('Reps')).toBeVisible();
  expect(screen.getByLabelText('RPE optional')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Complete set' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'More exercise options' })).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Report pain' })).not.toBeInTheDocument();
});

it('requires confirmation before finishing', async () => {
  render(<LiveWorkoutHarness />);
  await userEvent.click(screen.getByRole('button', { name: 'Finish workout' }));
  expect(finishWorkoutSession).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog', { name: 'Finish workout?' })).toBeVisible();
});

it('supports both live cardio and confirmed retrospective cardio logging', async () => {
  render(<CardioReviewHarness draft={runDraft} />);
  await userEvent.click(screen.getByRole('button', { name: 'Log completed workout' }));
  expect(screen.getByRole('dialog', { name: 'Save completed workout?' })).toBeVisible();
  expect(createWorkoutSession).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Save workout' }));
  expect(createWorkoutSession).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 3: Run tests and confirm red**

Run: `npx vitest run tests/workout/live-session.test.ts tests/components/live-workout.test.tsx tests/components/live-cardio.test.tsx tests/components/exercise-set-logger.test.tsx tests/components/finish-workout-dialog.test.tsx`

Expected: FAIL because the extracted live workflow does not exist.

- [ ] **Step 4: Implement live persistence and clock behavior**

Start live from Review, create exactly one session, and store its id in recovery. Complete/uncomplete sets with the existing verified helpers. Pause dispatches accumulated time; resume sets a new running timestamp. Refresh derives active elapsed time from recovery without double-counting pause periods.

Cardio live mode uses the same explicit start/pause/resume/finish state with activity-specific duration, optional distance, and effort fields. Retrospective strength/cardio logging creates and finishes a session only after the final save confirmation and never starts a live clock.

- [ ] **Step 5: Implement the simplified logger and More menu**

Weight and Reps use the widest fields. RPE is optional. Complete is a labeled action with completed and saving states. Rest timer appears after a completed set. Technique, Pain, Plate Calculator, Superset, and Remove appear under a labeled More disclosure with destructive Remove separated.

- [ ] **Step 6: Implement guarded finish**

Dialog lists duration, completed/pending sets, pain notes, and PRs. `Keep training` closes it. `Save and finish` verifies writes before clearing recovery. An empty session offers `Discard empty workout` and never produces an empty history row.

- [ ] **Step 7: Run focused tests**

Run: `npx vitest run tests/workout/live-session.test.ts tests/components/live-workout.test.tsx tests/components/live-cardio.test.tsx tests/components/exercise-set-logger.test.tsx tests/components/finish-workout-dialog.test.tsx tests/workout/workout-persistence.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/dashboard/workout/live components/workout/workspace lib/workout/live-session.ts components/workout/workout-persistence.ts tests/workout/live-session.test.ts tests/components/live-workout.test.tsx tests/components/live-cardio.test.tsx tests/components/exercise-set-logger.test.tsx tests/components/finish-workout-dialog.test.tsx
git commit -m "feat(workout): add recoverable live logging flow"
```

### Task 8: Redesign Pain Reporting and Plate Calculator

**Files:**
- Modify: `components/workout/PainFlagModal.tsx`
- Modify: `components/workout/PlateCalculator.tsx`
- Create: `lib/workout/plates.ts`
- Test: `tests/components/pain-flag-modal.test.tsx`
- Test: `tests/components/plate-calculator-v2.test.tsx`
- Test: `tests/workout/plates.test.ts`

**Interfaces:**
- Consumes: live exercise context, `WeightUnit`, completed-set insertion from Task 7.
- Produces: accessible `PainFlagModal`; `calculatePlateLoad`, `nearestPlateLoad`, `buildWarmupRamp`.

- [ ] **Step 1: Write failing Pain Flag tests**

```tsx
it('explains severity and coach visibility in light and dark themes', () => {
  render(<PainFlagModal exerciseName="Bench Press" />);
  expect(screen.getByRole('heading', { name: 'Report pain' })).toBeVisible();
  expect(screen.getByText('Bench Press')).toBeVisible();
  expect(screen.getByRole('radio', { name: '1 Mild' })).toBeVisible();
  expect(screen.getByRole('radio', { name: '3 Moderate' })).toBeVisible();
  expect(screen.getByRole('radio', { name: '5 Stop' })).toBeVisible();
  expect(screen.getByText(/shared with your coach/i)).toBeVisible();
});
```

- [ ] **Step 2: Write failing plate math and UI tests**

```ts
it('returns an exact mirrored per-side load', () => {
  expect(calculatePlateLoad({ total: 100, bar: 20, plates: [20, 15, 10, 5, 2.5, 1.25] })).toEqual({
    exact: true,
    perSide: [20, 20],
    achievedTotal: 100,
  });
});

it('labels both sides and explains warm-up percentages', () => {
  render(<PlateCalculator weightKg={100} unit="kg" />);
  expect(screen.getByText('Left side')).toBeVisible();
  expect(screen.getByText('Right side')).toBeVisible();
  expect(screen.getByText(/based on your working weight/i)).toBeVisible();
});
```

- [ ] **Step 3: Run tests and confirm red**

Run: `npx vitest run tests/components/pain-flag-modal.test.tsx tests/components/plate-calculator-v2.test.tsx tests/workout/plates.test.ts`

Expected: FAIL on missing labels and editable load model.

- [ ] **Step 4: Implement Pain Flag hierarchy**

Use a focused dialog with exercise identity, suggested editable body region, native radio-group semantics, labeled severities, notes, disclosure that the coach receives the note, Cancel, and `Save pain note`. Danger contrast may not depend on a pale red outline alone.

- [ ] **Step 5: Extract and implement plate calculations**

Allow editable total/bar/plate inventory, exact or nearest achievable load, mirrored side diagram, and warm-up recommendations. Expose an `Add warm-up sets` callback only when a draft/live exercise is present.

- [ ] **Step 6: Run focused tests**

Run: `npx vitest run tests/components/pain-flag-modal.test.tsx tests/components/plate-calculator-v2.test.tsx tests/workout/plates.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/workout/PainFlagModal.tsx components/workout/PlateCalculator.tsx lib/workout/plates.ts tests/components/pain-flag-modal.test.tsx tests/components/plate-calculator-v2.test.tsx tests/workout/plates.test.ts
git commit -m "feat(workout): clarify pain and plate utilities"
```

### Task 9: Generate, Validate, and Integrate Premium Static Artwork

**Files:**
- Create: `public/workout-v2/body-areas/*.webp`
- Create: `public/workout-v2/exercises/*.webp`
- Create: `public/workout-v2/masters/*`
- Create: `public/workout-v2/manifest.json`
- Modify: `lib/workout-assets.ts`
- Modify: `components/workout/MovementVisual.tsx`
- Modify: `app/globals.css`
- Create: `scripts/visual/optimize-workout-assets.mjs`
- Test: `tests/components/workout-asset-quality.test.ts`

**Interfaces:**
- Consumes: semantic asset resolver from Task 6.
- Produces: locally bundled anatomy/movement assets, optimized derivatives, metadata manifest, theme-neutral visual surface.

- [ ] **Step 1: Write failing quality tests**

```ts
it.each(expectedAssets)('%s has a portrait-safe high-resolution source and optimized derivative', async (slug) => {
  const entry = manifest.assets[slug];
  expect(entry.kind).toMatch(/^(anatomy|technique|cardio)$/);
  expect(entry.masterWidth).toBeGreaterThanOrEqual(2160);
  expect(entry.masterHeight).toBeGreaterThanOrEqual(2160);
  expect(entry.safeMarginPct).toBeGreaterThanOrEqual(8);
  expect((await stat(join(repoRoot, 'public', entry.src))).size).toBeLessThan(450_000);
});
```

Also assert every configured exercise asset exists, all body-area assets exist, and fallback mappings are labeled `anatomy`.

- [ ] **Step 2: Run tests and confirm red**

Run: `npx vitest run tests/components/workout-asset-quality.test.ts tests/components/workout-asset-resolver.test.ts`

Expected: FAIL because the V2 manifest/assets do not exist.

- [ ] **Step 3: Generate body-area masters with built-in Imagegen**

Use one built-in call per distinct body area. Prompt template:

```text
Use case: scientific-educational
Asset type: premium mobile workout body-area card, source master
Primary request: anatomically responsible full adult athletic human figure showing the [BODY AREA] muscle group
Scene/backdrop: seamless warm-white clinical studio background
Subject: complete figure fully inside frame from head to feet, neutral anatomical stance, realistic proportions
Style/medium: premium medical-fitness 3D render, restrained and educational rather than dramatic
Composition/framing: portrait-safe centered composition, at least 12% empty margin around the complete body, no crop
Lighting/mood: soft even studio lighting, calm and serious
Color palette: neutral charcoal body; primary [BODY AREA] muscles highlighted in the Personal Best channel color; secondary muscles at 35% intensity
Constraints: anatomically plausible muscle placement; symmetrical except where anatomy requires otherwise; no text, labels, logo, watermark, gym equipment, black background, glow, veins, gore, or fantasy musculature
Avoid: cropped head or limbs, exaggerated bodybuilding proportions, neon aura, red full-body heat map, medical claims
```

Generate Chest, Back, Shoulders, Arms, Legs, Core, Full Body, and Cardio. Cardio must depict a recognizable running figure with heart/lung emphasis kept subtle and non-diagnostic.

- [ ] **Step 4: Generate technique masters for the mapped exercise set**

Use one built-in call per exercise slug currently mapped in `lib/workout-assets.ts`. Prompt template:

```text
Use case: scientific-educational
Asset type: premium mobile exercise technique image, source master
Primary request: one adult athlete demonstrating the canonical midpoint position of [EXERCISE]
Scene/backdrop: seamless warm-white studio with only the equipment required for the movement
Subject: complete athlete and complete equipment fully inside the frame; correct grip, joint alignment, bar or cable path, and stable setup
Style/medium: high-end natural fitness photography with educational clarity
Composition/framing: landscape-safe centered composition, at least 10% margin around athlete and equipment, no crop
Lighting/mood: soft neutral studio lighting, serious and calm
Color palette: neutral apparel with a restrained cyan overlay on the primary working muscle only
Constraints: no text, logo, watermark, black background, dramatic smoke, neon glow, impossible anatomy, duplicated limbs, or unsafe load
Avoid: cropped feet, hands, bar ends, bench, cable stack, or pull-up bar
```

Cover Bench Press, Incline Press, Overhead Press, Pec Deck, Cable Fly, Pull-up, Deadlift, Squat, Dip, Row, Curl, and Triceps Extension.

- [ ] **Step 5: Inspect every generated master before integration**

Use the image viewer at original detail. Reject any asset with crop, malformed hands/equipment, unsafe technique, ambiguous muscle placement, low contrast on warm white, or flashy/neon styling. Iterate with one targeted correction. Record final prompts and generator mode in `public/workout-v2/manifest.json`.

- [ ] **Step 6: Produce project derivatives**

Implement `scripts/visual/optimize-workout-assets.mjs` with Sharp. Preserve the selected master at a longest edge of at least 2160px; create display WebP derivatives at 960px or 1280px longest edge, quality 82–88, with metadata stripped. Never upscale a rejected low-detail image merely to satisfy dimensions.

- [ ] **Step 7: Integrate theme-neutral containment**

`MovementVisual` uses `object-fit: contain`, `object-position: center`, and a warm-neutral light / raised-graphite dark surface. Text never relies on the image for contrast. Thumbnails and cards use the same aspect ratio rules and internal padding.

- [ ] **Step 8: Run asset tests**

Run: `node scripts/visual/optimize-workout-assets.mjs --check && npx vitest run tests/components/workout-asset-quality.test.ts tests/components/workout-asset-resolver.test.ts`

Expected: PASS with no missing, oversized, cropped-by-CSS, or semantically mislabeled asset.

- [ ] **Step 9: Commit**

```bash
git add public/workout-v2 lib/workout-assets.ts components/workout/MovementVisual.tsx app/globals.css scripts/visual/optimize-workout-assets.mjs tests/components/workout-asset-quality.test.ts tests/components/workout-asset-resolver.test.ts
git commit -m "feat(workout): add premium local anatomy and technique artwork"
```

### Task 10: Apply Impeccable Theme, Icon, Motion, and Responsive Polish

**Files:**
- Modify: `app/globals.css`
- Modify: all V2 files under `components/workout/workspace/`
- Modify: `components/workout/ExercisePicker.tsx`
- Modify: `components/workout/PainFlagModal.tsx`
- Modify: `components/workout/PlateCalculator.tsx`
- Test: `tests/components/workout-theme-v2.test.ts`
- Test: `tests/components/workout-icon-contract.test.ts`
- Test: `e2e/workout-workspace-v2.spec.ts`

**Interfaces:**
- Consumes: all V2 components and Personal Best tokens.
- Produces: one consistent visual grammar across light/dark, mobile widths, and reduced motion.

- [ ] **Step 1: Write failing theme and icon contracts**

Assert there are no raw black card backgrounds, no `object-fit: cover` on workout imagery, no icon-only destructive controls, no duplicate bottom nav, no text over unguarded images, and no Unicode glyph acting as an icon. Assert V2 components use semantic token variables rather than hard-coded low-contrast gray.

- [ ] **Step 2: Add failing Playwright journey**

```ts
test.describe('Workout Workspace V2', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`${theme}: draft to pause and guarded finish`, async ({ page }) => {
      await loginAsClient(page);
      await setTheme(page, theme);
      await page.goto('/dashboard/workout');
      await page.getByRole('button', { name: 'Preview Push' }).click();
      await page.getByRole('button', { name: 'Use this template' }).click();
      await expect(page.getByText('Draft · Not started')).toBeVisible();
      await page.getByRole('button', { name: 'Review workout' }).click();
      await page.getByRole('button', { name: 'Start live workout' }).click();
      await page.getByRole('button', { name: 'Pause workout' }).click();
      await expect(page.getByText('Paused')).toBeVisible();
      await page.getByRole('button', { name: 'Finish workout' }).click();
      await expect(page.getByRole('dialog', { name: 'Finish workout?' })).toBeVisible();
    });
  }
});
```

- [ ] **Step 3: Run tests and confirm red**

Run: `npx vitest run tests/components/workout-theme-v2.test.ts tests/components/workout-icon-contract.test.ts && npx playwright test e2e/workout-workspace-v2.spec.ts --project=chromium`

Expected: FAIL until theme, icons, and responsive layout are complete.

- [ ] **Step 4: Apply the Personal Best craft floor**

Use 12–16px functional radii, rails before shadows, Inter for UI prose, mono only for time/weight/reps, gold only for primary intent, performance colors only for their channel meaning, and 180–240ms state motion. Provide hover/focus/active/disabled/loading/error/empty states. Theme caret, selection, focus ring, and tabular numeric fields.

- [ ] **Step 5: Polish representative widths and motion**

Validate 320×568, 375×812, 390×844, and 430×932 in both themes. Prevent clipping, keyboard obstruction, nav overlap, and sideways scroll. Reduced motion must remove spatial travel.

- [ ] **Step 6: Run focused UI tests**

Run: `npx vitest run tests/components/workout-*.test.ts tests/components/exercise-*.test.ts tests/components/client-shell-*.test.ts tests/components/navigation-accessibility.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/globals.css components/workout e2e/workout-workspace-v2.spec.ts tests/components/workout-theme-v2.test.ts tests/components/workout-icon-contract.test.ts
git commit -m "feat(workout): polish premium responsive workspace"
```

### Task 11: Full Verification, Review, Deploy, and Canary

**Files:**
- Modify as required by verified findings only.
- Update: `docs/superpowers/specs/2026-08-24-workout-workspace-v2-design.md` status to Implemented after verification.
- Update: `DESIGN.md` only if a reusable rule changed.

**Interfaces:**
- Consumes: complete V2 implementation.
- Produces: reviewed main-branch deployment and production evidence.

- [ ] **Step 1: Run formatting and static checks**

Run: `git diff --check && npm run typecheck && npm run lint`

Expected: all commands exit 0.

- [ ] **Step 2: Run focused and full test suites**

Run: `npx vitest run tests/workout tests/components/workout-*.test.ts tests/components/exercise-*.test.ts tests/components/client-shell-*.test.ts && npm run test:vitest`

Expected: all tests pass. If `npm test` requires the local database, run the repository's database preflight and then the full suite rather than bypassing it.

- [ ] **Step 3: Run production build and budgets**

Run: `npm run build && npm run perf:budget && npm run guard:theme && npm run guard:paid-ai-tools`

Expected: build succeeds; performance/theme/paid-tool guards pass.

- [ ] **Step 4: Run authenticated mobile E2E and screenshot review**

Run: `npm run test:e2e:local-auth -- e2e/workout-workspace-v2.spec.ts`

Capture Home, template preview, Build, Exercise Browser, Exercise Detail, Review, Live, Paused, Pain, Plate Calculator, Finish Confirmation, and Completed Summary at 390×844 in light and dark. Inspect at original resolution for crop, contrast, overlap, scroll, and safe-area defects.

- [ ] **Step 5: Review the diff against the approved spec**

Use a pre-landing code review plus an Impeccable visual review. Resolve every high/medium finding and all regressions in state transitions, persistence, localization, accessibility, and theme behavior. Re-run the affected command after every correction.

- [ ] **Step 6: Push, open PR, and require green CI**

```bash
git push -u origin feat/workout-workspace-v2
gh pr create --fill --base main
gh pr checks --watch
```

Expected: PR checks are green and the reviewed head SHA matches the merged SHA.

- [ ] **Step 7: Merge and deploy production**

Use the repository deployment workflow. Verify the production deployment resolves at `https://trophe.app`, has the intended commit SHA, and reports healthy build/runtime status.

- [ ] **Step 8: Run production canary**

Run: `npm run canary:prod && npm run canary:theme`

Expected: authentication entry, Workout Home, static assets, theme tokens, and read-only production probes pass without new errors.

- [ ] **Step 9: Mark the spec implementation-complete before merge**

```bash
git add docs/superpowers/specs/2026-08-24-workout-workspace-v2-design.md DESIGN.md
git commit -m "docs(workout): record workspace v2 release"
```

Record the verified release-candidate SHA and local/CI evidence in the spec before the final PR merge. Record the resulting production deployment URL, deployed SHA, and canary evidence in the goal completion report; do not create an unreviewed code commit on main after deployment.

- [ ] **Step 10: Complete the goal only after production evidence is fresh**

Record the deployed SHA, production URL, test/build results, canary result, and remaining known limitations. Mark the goal complete only when no required work remains.
