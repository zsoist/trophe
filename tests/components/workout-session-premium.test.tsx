// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';

const push = vi.hoisted(() => vi.fn());
const workspace = vi.hoisted(() => ({
  state: { stage: 'draft', draft: null as WorkoutDraft | null, startRequest: null, retrospectiveRequest: null },
  updateDraftName: vi.fn(), updateCardioDraft: vi.fn(), updateDraftExercise: vi.fn(),
  reorderDraftExercise: vi.fn(), removeDraftExercise: vi.fn(), replaceDraftExercise: vi.fn(),
  goToReview: vi.fn(), startLive: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/components/workout/workspace/WorkoutWorkspaceProvider', () => ({ useWorkoutWorkspace: () => workspace }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ lang: 'en', t: (key: string, params: Record<string, string | number> = {}) => ({
    'workout.draft_not_started': 'Draft · Not started', 'workout.name': 'Workout name',
    'workout.exercise_position': `Exercise ${params.current} of ${params.total}`,
    'workout.pause_workout': 'Pause workout', 'workout.resume_workout': 'Resume workout',
    'workout.pause': 'Pause', 'workout.resume': 'Resume', 'workout.technique_media': 'technique',
    'workout.current_target_label': 'Target', 'workout.current_target': `Target: ${params.sets} × ${params.reps}`,
    'workout.previous_values_label': 'Previous', 'workout.active_duration': 'Active duration',
    'workout.up_next_named': `Up next: ${params.name}`,
    'workout.motion_play': 'Play demonstration', 'workout.motion_pause': 'Pause demonstration',
    'workout.motion_playing': 'Demonstration playing', 'workout.motion_paused': 'Demonstration paused',
    'workout.motion_session_paused': 'Workout paused. Demonstration paused.',
    'workout.motion_session_paused_action': 'Resume workout to play demonstration',
    'workout.motion_reduced': 'Demonstration reduced', 'workout.motion_no_exact': 'No exact demonstration',
    'workout.target_sets': 'Sets', 'workout.target_reps': 'Reps', 'workout.rest_seconds': 'Rest', 'workout.target_rpe': 'Target RPE',
    'workout.notes_optional': 'Notes', 'workout.add_exercise': 'Add exercise',
    'workout.save_plan': 'Save plan', 'workout.review_workout': 'Review workout',
    'workout.target_sets_named': `Target sets for ${params.name}`, 'workout.target_reps_named': `Target reps for ${params.name}`,
    'workout.rest_seconds_named': `Rest seconds for ${params.name}`, 'workout.target_rpe_named': `Target RPE for ${params.name}`,
    'workout.notes_named': `Notes for ${params.name}`, 'workout.more_exercise_options': 'More exercise options',
    'workout.drag_named': `Drag ${params.name} to reorder`, 'workout.move_named_earlier': `Move ${params.name} earlier`,
    'workout.move_named_later': `Move ${params.name} later`, 'workout.replace_named': `Replace ${params.name}`,
    'workout.technique_named': `View ${params.name} technique`, 'workout.remove_named': `Remove ${params.name}`,
    'workout.replace_exercise': 'Replace', 'workout.technique': 'Technique', 'workout.remove_exercise': 'Remove',
    'workout.move_earlier': 'Earlier', 'workout.move_later': 'Later',
    'workout.equipment_label': `Equipment: ${params.equipment}`, 'workout.equipment_barbell': 'Barbell', 'workout.equipment_dumbbell': 'Dumbbell',
    'workout.picker_exact_poster_alt': `${params.name} technique poster`, 'workout.picker_anatomy_poster_alt': `Anatomy reference for ${params.name}`,
    'workout.detail_fallback_poster_alt': `Exercise placeholder for ${params.name}`,
    'workout.plan_summary_line': `${params.exercises} exercises · ${params.sets} working sets`,
    'workout.plan_estimated_duration': `Estimated ${params.minutes} min`, 'workout.plan_muscle_balance': 'Muscle balance',
    'workout.plan_load_basis': 'Based on sets', 'workout.plan_no_muscle_evidence': 'No evidence', 'workout.plan_missing_evidence': 'Missing evidence',
    'workout.plan_balance_concentrated': 'Concentrated', 'workout.invalid_prescription': 'Invalid prescription',
    'workout.plan_save_scope': 'Saved routines include name, order, sets and reps.',
    'workout.weight_in_unit': `Weight in ${params.unit}`, 'workout.reps': 'Reps', 'workout.rpe_optional': 'RPE optional',
    'workout.set_number': `Set ${params.n}`, 'workout.more': 'More', 'workout.complete_set': 'Complete set', 'workout.undo_set': 'Undo set',
    'workout.saving': 'Saving…', 'workout.warmup': 'Warm-up', 'workout.resting': 'Resting', 'workout.rest_timer_label': 'Rest timer',
    'workout.rest_complete': 'Rest complete', 'workout.rest_started': 'Rest started', 'workout.rest_target': 'Rest target',
  } as Record<string, string>)[key] ?? key }),
}));

const benchMedia = {
  slug: 'bench-press',
  canonicalNames: ['Barbell Bench Press'],
  equipment: ['Barbell'],
  posterSrc: '/workout-v3/posters/bench-press.webp',
  motionSrc: '/workout-v3/motion/bench-press.webm',
  motionType: 'video/webm' as const,
  tier: 'verified-technique' as const,
  activations: [],
  phases: [],
  provenance: { kind: 'generated' as const, source: 'test', reviewedOn: '2026-09-03' },
};

vi.mock('@/lib/workout/exercise-media', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/workout/exercise-media')>()),
  resolveExerciseMedia: () => benchMedia,
}));

import { LiveExerciseStage } from '@/components/workout/workspace/LiveExerciseStage';
import { ExerciseSetLogger } from '@/components/workout/workspace/ExerciseSetLogger';
import { WorkoutBuilder } from '@/components/workout/workspace/WorkoutBuilder';

const exercise = { id: 'bench', name: 'Barbell Bench Press', equipment: 'Barbell', muscle_group: 'chest' as const };

const renderStage = (paused: boolean) => render(
  <LiveExerciseStage
    exercise={exercise}
    displayName="Barbell Bench Press"
    position={1}
    total={2}
    targetSets={3}
    targetReps="8"
    previous="60 kg × 8"
    paused={paused}
    onPause={vi.fn()}
    onResume={vi.fn()}
  ><div>logger</div></LiveExerciseStage>,
);

beforeEach(() => {
  vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  workspace.state.draft = null;
});

describe('LiveExerciseStage explicit media play', () => {
  it('never plays before the athlete asks, then plays only on the explicit control', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    renderStage(false);

    await waitFor(() => expect(screen.getByTestId('exercise-motion-video')).toBeTruthy());
    // Causal: mounting the live stage alone must not start the demonstration.
    expect(play).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Play demonstration' }));
    await waitFor(() => expect(play).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Pause demonstration' })).toBeTruthy();
  });

  it('keeps the session pause disabling playback without autoplay intent', async () => {
    const play = vi.mocked(HTMLMediaElement.prototype.play);
    renderStage(true);

    expect(await screen.findByText('Workout paused. Demonstration paused.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Resume workout to play demonstration' })).toBeNull();
    expect(play).not.toHaveBeenCalled();
  });
});

describe('ExerciseSetLogger rest and units', () => {
  it('derives the thin rest track from the real snapshot elapsed time', () => {
    render(
      <ExerciseSetLogger
        exercise={{ id: 'bench', name: 'Barbell Bench Press' }}
        setNumber={1}
        unit="kg"
        initialSetId="set-1"
        initialCompletedAt={new Date().toISOString()}
        restTargetSeconds={90}
        restSnapshot={{ elapsedMs: 30_000, capturedAt: Date.now(), running: false }}
        onComplete={async () => 'set-2'}
      />,
    );

    const timer = screen.getByRole('timer');
    expect(timer.textContent).toContain('30s / 90s');
    const fill = document.querySelector('.exercise-set-logger__rest-fill') as HTMLElement | null;
    expect(fill).toBeTruthy();
    // 30s of a 90s target => 33% (Math.round), derived from the snapshot, not a new clock.
    expect(fill!.style.width).toBe('33%');
  });

  it('keeps the unit outside the editable value', () => {
    render(
      <ExerciseSetLogger
        exercise={{ id: 'bench', name: 'Barbell Bench Press' }}
        setNumber={1}
        unit="lb"
        onComplete={async () => 'set-1'}
      />,
    );

    const input = screen.getByLabelText('Weight in lb') as HTMLInputElement;
    expect(input.value).toBe('');
    const unit = document.querySelector('.exercise-set-logger__field .wsp-unit');
    expect(unit?.textContent).toBe('lb');
    expect(input.parentElement?.contains(unit as Node)).toBe(true);
  });
});

describe('WorkoutBuilder featured inline row', () => {
  const draft: WorkoutDraft = {
    version: 2, kind: 'strength', name: 'Push', updatedAt: 1,
    exercises: [
      { exerciseId: 'bench', targetSets: 3, targetReps: '8' },
      { exerciseId: 'press', targetSets: 3, targetReps: '10' },
    ],
  };
  const exercises = [
    { id: 'bench', name: 'Barbell Bench Press', muscle_group: 'chest' as const, equipment: 'Barbell' },
    { id: 'press', name: 'Shoulder Press', muscle_group: 'shoulders' as const, equipment: 'Dumbbell' },
  ];

  it('opens one row by default and expands a calm row on demand without losing the draft', () => {
    workspace.state.draft = draft;
    render(<WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />);

    const toggles = screen.getAllByRole('button', { name: 'More exercise options' });
    expect(toggles).toHaveLength(2);
    expect(toggles[0].getAttribute('aria-expanded')).toBe('true');
    expect(toggles[1].getAttribute('aria-expanded')).toBe('false');
    const pressDetails = document.getElementById('plan-exercise-press-details') as HTMLElement;
    expect(pressDetails.hidden).toBe(true);

    fireEvent.click(toggles[1]);
    expect(document.getElementById('plan-exercise-press-details')!.hidden).toBe(false);
    expect(workspace.updateDraftExercise).not.toHaveBeenCalled();
  });
});
