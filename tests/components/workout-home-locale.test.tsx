// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { push, lang } = vi.hoisted(() => ({ push: vi.fn(), lang: { value: 'es' } }));

vi.mock('@/lib/workout/live-session', () => ({
  startLiveSession: vi.fn(),
  savePreparedRetrospectiveWorkout: vi.fn(),
  discardEmptyLiveSession: vi.fn(),
  validateRetrospectiveWorkoutInput: vi.fn(() => true),
}));
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() } } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: new Proxy({}, { get: (_target, tag: string) => ({ children, ...props }: React.HTMLAttributes<HTMLElement>) => React.createElement(tag, props, children) }),
  useReducedMotion: () => true,
}));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: lang.value,
    t: (key: string, params?: Record<string, string | number>) => ({
      'workout.preview_named': `Preview ${params?.name}`,
      'workout.preview': 'Preview',
      'workout.exercise_count': `${params?.n} exercises`,
      'workout.use_template': 'Use this template',
      'general.cancel': 'Cancel',
      'workout.muscle_chest': 'Chest',
      'workout.muscle_shoulders': 'Shoulders',
    }[key] ?? key),
  }),
}));

import { WorkoutWorkspaceProvider } from '@/components/workout/workspace/WorkoutWorkspaceProvider';
import { WorkoutHome, type WorkoutHomeTemplate } from '@/components/workout/workspace/WorkoutHome';
import type { Exercise } from '@/lib/types';

class MemoryStorage {
  private readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

const exercises: Exercise[] = [
  { id: 'bench', name: 'Bench Press', name_es: 'Press de banca', name_el: 'Πιέσεις πάγκου', muscle_group: 'chest', secondary_muscles: null, equipment: 'barbell', is_compound: true, is_template: true, created_by: null, created_at: '' },
  { id: 'press', name: 'Shoulder Press', name_es: 'Press de hombros', name_el: null, muscle_group: 'shoulders', secondary_muscles: null, equipment: 'dumbbell', is_compound: true, is_template: true, created_by: null, created_at: '' },
];

const routines: WorkoutHomeTemplate[] = [
  { templateKey: 'split:push', templateId: null, name: 'Push', muscleSummary: ['chest', 'shoulders'], exercises: [
    // Draft rows carry the canonical English name, exactly as the workspace persists them.
    { exerciseId: 'bench', exerciseName: 'Bench Press', muscleGroup: 'chest', targetSets: 3, targetReps: '8' },
    { exerciseId: 'press', exerciseName: 'Shoulder Press', muscleGroup: 'shoulders', targetSets: 3, targetReps: '8' },
  ] },
];

function renderHome() {
  return render(
    <WorkoutWorkspaceProvider userId="nik" storage={new MemoryStorage()}>
      <WorkoutHome exercises={exercises} program={null} recents={[]} routines={routines} />
    </WorkoutWorkspaceProvider>,
  );
}

afterEach(() => { cleanup(); push.mockReset(); lang.value = 'es'; });

describe('WorkoutHome template preview follows the exercise-name house rule', () => {
  it('shows Spanish names for a Spanish user even though the draft stores English', async () => {
    renderHome();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Push' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Push' }));

    expect(screen.getByText('Press de banca')).toBeTruthy();
    expect(screen.getByText('Press de hombros')).toBeTruthy();
    expect(screen.queryByText('Bench Press')).toBeNull();
  });

  it('keeps English names for a Greek user', async () => {
    lang.value = 'el';
    renderHome();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Preview Push' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Preview Push' }));

    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.queryByText('Πιέσεις πάγκου')).toBeNull();
  });
});
