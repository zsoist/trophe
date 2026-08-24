// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { createWorkoutSession, push } = vi.hoisted(() => ({ createWorkoutSession: vi.fn(), push: vi.fn() }));

vi.mock('@/components/workout/workout-persistence', () => ({ createWorkoutSession }));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ lang: 'en', t: (key: string, params?: Record<string, string | number>) => ({
    'workout.strength': 'Strength', 'workout.strength_sub': 'Build sets and rep targets',
    'workout.cardio': 'Cardio', 'workout.cardio_sub': 'Plan time, distance, and effort',
    'workout.build_strength': 'Build strength workout', 'workout.build_cardio': 'Build cardio workout',
    'workout.templates': 'Workout templates', 'workout.preview_named': `Preview ${params?.name}`,
    'workout.split_push': 'Push', 'workout.split_pull': 'Pull', 'workout.split_legs': 'Legs',
    'workout.split_upper': 'Upper body', 'workout.split_chest_tri': 'Chest & Triceps',
    'workout.split_back_bi': 'Back & Biceps', 'workout.split_full': 'Full body',
    'workout.muscle_chest': 'Chest', 'workout.muscle_shoulders': 'Shoulders', 'workout.muscle_triceps': 'Triceps',
    'workout.muscle_back': 'Back', 'workout.muscle_biceps': 'Biceps', 'workout.muscle_forearms': 'Forearms',
    'workout.muscle_quads': 'Quads', 'workout.muscle_hamstrings': 'Hamstrings', 'workout.muscle_glutes': 'Glutes',
    'workout.muscle_calves': 'Calves', 'workout.muscle_full_body': 'Full body',
    'workout.preview': 'Preview', 'workout.exercise_count': `${params?.n} exercises`,
    'workout.use_template': 'Use this template', 'general.cancel': 'Cancel',
    'workout.review_today': 'Review today’s workout', 'workout.program_today': `${params?.program} · Today`,
    'workout.draft_not_started': 'Draft · Not started', 'workout.name': 'Workout name',
    'workout.activity': 'Activity', 'workout.duration_minutes': 'Duration in minutes',
    'workout.distance_optional': 'Distance optional', 'workout.effort': 'Effort',
    'workout.save_plan': 'Save plan', 'workout.review_workout': 'Review workout',
    'workout.empty_strength_hint': 'Add an exercise to review this workout.',
    'workout.empty_cardio_hint': 'Add a duration to review this workout.',
    'workout.add_exercise': 'Add Exercise', 'workout.target_sets': 'Target sets',
    'workout.target_reps': 'Target reps', 'workout.remove_exercise': 'Remove exercise',
    'workout.move_up': 'Move up', 'workout.move_down': 'Move down',
    'workout.move_named_up': `Move ${params?.name} up`, 'workout.move_named_down': `Move ${params?.name} down`,
    'workout.remove_named': `Remove ${params?.name}`, 'workout.target_sets_named': `Target sets for ${params?.name}`,
    'workout.target_reps_named': `Target reps for ${params?.name}`,
    'workout.review_title': 'Review workout', 'workout.start_live': 'Start live workout',
    'workout.log_completed': 'Log completed workout',
    'workout.start_live_explanation': 'Starting live starts the active timer and creates your workout session.',
    'workout.start_live_failed': 'Workout could not start. Try again.',
    'workout.program_load_failed': 'Your workout program could not be loaded.',
  }[key] ?? key) }),
}));

import { WorkoutWorkspaceProvider, useWorkoutWorkspace } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { WorkoutHome, type WorkoutHomeProgram } from '@/components/workout/workspace/WorkoutHome';
import { WorkoutBuilder } from '@/components/workout/workspace/WorkoutBuilder';
import { WorkoutReview } from '@/components/workout/workspace/WorkoutReview';
import type { Exercise } from '@/lib/types';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const exercises: Exercise[] = [
  { id: 'bench', name: 'Bench Press', name_es: null, name_el: null, muscle_group: 'chest', secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' },
  { id: 'press', name: 'Shoulder Press', name_es: null, name_el: null, muscle_group: 'shoulders', secondary_muscles: null, equipment: 'dumbbell', is_compound: true, is_template: true, created_by: null, created_at: '' },
  { id: 'pushdown', name: 'Triceps Pushdown', name_es: null, name_el: null, muscle_group: 'triceps', secondary_muscles: null, equipment: 'cable', is_compound: false, is_template: true, created_by: null, created_at: '' },
];

const coachProgram: WorkoutHomeProgram = {
  programName: 'Strength Base',
  todayTemplate: {
    templateKey: 'template:11111111-1111-4111-8111-111111111111',
    templateId: '11111111-1111-4111-8111-111111111111', name: 'Coach Push', muscleSummary: ['chest', 'shoulders', 'triceps'],
    exercises: [
      { exerciseId: 'bench', targetSets: 4, targetReps: '6-8' },
      { exerciseId: 'press', targetSets: 3, targetReps: '8-10' },
    ],
  },
  alsoToday: [],
};

function WorkoutHomeHarness({ program = null, programLoading = false, programError = false }: {
  program?: WorkoutHomeProgram | null;
  programLoading?: boolean;
  programError?: boolean;
}) {
  return (
    <WorkoutWorkspaceProvider userId="nik" storage={new MemoryStorage()}>
      <RoutedWorkspace program={program} programLoading={programLoading} programError={programError} />
    </WorkoutWorkspaceProvider>
  );
}

function RoutedWorkspace(props: { program: WorkoutHomeProgram | null; programLoading: boolean; programError: boolean }) {
  const { state } = useWorkoutWorkspace();
  if (state.stage === 'draft') return <WorkoutBuilder exercises={exercises} onSavePlan={vi.fn()} />;
  if (state.stage === 'review') return <WorkoutReview exercises={exercises} onSavePlan={vi.fn()} onLogCompleted={vi.fn()} />;
  return <WorkoutHome {...props} exercises={exercises} recents={[]} routines={[]} />;
}

afterEach(() => { cleanup(); createWorkoutSession.mockReset(); push.mockReset(); });

describe('WorkoutHome', () => {
  it('previews Push without starting or opening the exercise picker', async () => {
    render(<WorkoutHomeHarness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Push' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Push' }));

    expect(screen.getByRole('heading', { name: 'Push' })).toBeTruthy();
    expect(screen.getByText('Chest · Shoulders · Triceps')).toBeTruthy();
    expect(screen.getByText('3 exercises')).toBeTruthy();
    expect(createWorkoutSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'Add exercise' })).toBeNull();
  });

  it('creates the template draft only after the user confirms the preview', async () => {
    render(<WorkoutHomeHarness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Push' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Push' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this template' }));

    expect(await screen.findByText('Draft · Not started')).toBeTruthy();
    expect(screen.getByDisplayValue('Push')).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('takes Preview Push through review and starts live without persisting the built-in key as template_id', async () => {
    createWorkoutSession.mockResolvedValue('session-push');
    render(<WorkoutHomeHarness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Push' }).hasAttribute('disabled')).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Preview Push' }));
    fireEvent.click(screen.getByRole('button', { name: 'Use this template' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Review workout' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start live workout' }));

    await waitFor(() => expect(createWorkoutSession).toHaveBeenCalledTimes(1));
    expect(createWorkoutSession).toHaveBeenCalledWith('nik', 'Push', null);
  });

  it('turns a coach program into a reviewable draft instead of auto-starting guided mode', async () => {
    render(<WorkoutHomeHarness program={coachProgram} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review today’s workout' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Review today’s workout' }));

    expect(await screen.findByRole('heading', { name: 'Review workout' })).toBeTruthy();
    expect(screen.getByText('Coach Push')).toBeTruthy();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('keeps coach-resolved exercise metadata through review when the client library cannot resolve the id', async () => {
    const customProgram: WorkoutHomeProgram = {
      programName: 'Custom block',
      todayTemplate: {
        templateKey: 'template:22222222-2222-4222-8222-222222222222',
        templateId: '22222222-2222-4222-8222-222222222222',
        name: 'Coach custom day',
        muscleSummary: ['chest'],
        exercises: [{
          exerciseId: '33333333-3333-4333-8333-333333333333',
          exerciseName: 'Coach Tempo Press',
          muscleGroup: 'chest',
          targetSets: 3,
          targetReps: '10',
        }],
      },
      alsoToday: [],
    };
    render(<WorkoutHomeHarness program={customProgram} />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Review today’s workout' }).hasAttribute('disabled')).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: 'Review today’s workout' }));

    expect(await screen.findByText('Coach Tempo Press')).toBeTruthy();
    expect(screen.queryByText('33333333-3333-4333-8333-333333333333')).toBeNull();
  });

  it('builds cardio as an editable draft', async () => {
    render(<WorkoutHomeHarness />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Build cardio workout' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Build cardio workout' }));

    expect(screen.getByLabelText('Activity')).toBeTruthy();
    expect(screen.getByLabelText('Duration in minutes')).toBeTruthy();
    expect(screen.getByLabelText('Distance optional')).toBeTruthy();
    expect(createWorkoutSession).not.toHaveBeenCalled();
  });

  it('keeps a deterministic browse surface during program errors', async () => {
    render(<WorkoutHomeHarness programError />);
    expect((await screen.findByRole('alert')).textContent).toMatch(/program/i);
    expect(screen.getByRole('heading', { name: 'Workout templates' })).toBeTruthy();
  });
});
