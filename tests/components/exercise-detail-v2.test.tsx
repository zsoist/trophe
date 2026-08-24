// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '@/lib/types';

vi.mock('next/image', () => ({
  default: ({ priority: _priority, ...props }: Record<string, unknown>) => React.createElement('img', props),
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  return {
    motion: {
      div: ReactModule.forwardRef<HTMLDivElement, Record<string, unknown>>(({ children, ...props }, ref) =>
        ReactModule.createElement('div', {
          ...Object.fromEntries(Object.entries(props).filter(([key]) => !['animate', 'exit', 'initial', 'transition'].includes(key))),
          ref,
        }, children as React.ReactNode)),
    },
    useReducedMotion: () => true,
  };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string, params?: Record<string, string | number>) => ({
      'workout.custom_cancel': 'Close',
      'workout.compound': 'Compound',
      'workout.info_technique': 'Technique',
      'workout.info_muscles_worked': 'Muscles worked',
      'workout.info_primary': 'Primary',
      'workout.info_secondary': 'Secondary',
      'workout.info_setup': 'Setup',
      'workout.info_execution': 'Execution',
      'workout.info_breathing': 'Breathing',
      'workout.info_common_mistakes': 'Common mistakes',
      'workout.info_safety': 'Safety note',
      'workout.info_not_provided': 'No specific guidance is available.',
      'workout.info_safety_unavailable': 'No exercise-specific safety note is available.',
      'workout.info_pr': 'Personal best',
      'workout.info_last': 'Recent sessions',
      'workout.info_no_history': 'No history yet',
      'workout.picker_add_named': `Add ${params?.name ?? ''}`,
      'workout.exercise_added_named': `${params?.name ?? ''} added`,
      'workout.muscle_chest': 'Chest',
      'workout.muscle_triceps': 'Triceps',
    }[key] ?? key),
  }),
}));

vi.mock('@/lib/workout/units', () => ({
  useWeightUnit: () => ['kg'],
  kgToDisplay: (value: number) => value,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import ExerciseInfoSheet from '@/components/workout/ExerciseInfoSheet';

const machinePress = {
  id: 'machine-press',
  name: 'Iso-Lateral Machine Press',
  name_es: null,
  name_el: null,
  muscle_group: 'chest',
  secondary_muscles: ['triceps'],
  equipment: 'machine',
  is_compound: true,
  instructions: 'Plant your feet firmly. Press the handles with control. Exhale as you press. Avoid lifting your shoulders.',
  instructions_es: null,
  instructions_el: null,
  is_template: true,
  created_by: null,
  created_at: '2026-08-24T00:00:00.000Z',
} as Exercise;

afterEach(cleanup);

describe('full exercise detail', () => {
  it('renders honest fallback semantics and all guidance sections without invented safety facts', () => {
    render(<ExerciseInfoSheet exercise={machinePress} userId={null} onClose={vi.fn()} />);

    expect(screen.getByText('Muscles worked')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /technique/i })).toBeNull();
    for (const heading of ['Primary', 'Secondary', 'Setup', 'Execution', 'Breathing', 'Common mistakes', 'Safety note', 'Personal best', 'Recent sessions']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(screen.getByText('No exercise-specific safety note is available.')).toBeTruthy();
  });

  it('uses a sticky Add action and switches to Added after the draft accepts it', () => {
    const onAdd = vi.fn();
    const { rerender } = render(
      <ExerciseInfoSheet exercise={machinePress} userId={null} onClose={vi.fn()} onAdd={onAdd} isAdded={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Iso-Lateral Machine Press' }));
    expect(onAdd).toHaveBeenCalledWith(machinePress);

    rerender(
      <ExerciseInfoSheet exercise={machinePress} userId={null} onClose={vi.fn()} onAdd={onAdd} isAdded />,
    );
    expect(screen.getByRole('button', { name: 'Iso-Lateral Machine Press added' }).hasAttribute('disabled')).toBe(true);
  });
});
