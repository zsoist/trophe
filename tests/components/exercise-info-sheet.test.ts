// @vitest-environment jsdom

import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '@/lib/types';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', props),
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
    t: (key: string) => ({
      'workout.custom_cancel': 'Close',
      'workout.compound': 'Compound',
      'workout.info_cue': 'Technique',
      'workout.info_pr': 'Personal best',
      'workout.info_last': 'Recent results',
      'workout.info_no_history': 'No history yet',
      'workout.muscle_chest': 'Chest',
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

afterEach(cleanup);

describe('ExerciseInfoSheet', () => {
  it('leads with the movement visual and practical technique guidance', () => {
    const exercise = {
      id: 'bench',
      name: 'Bench Press',
      name_es: null,
      name_el: null,
      muscle_group: 'chest',
      secondary_muscles: [],
      equipment: 'barbell',
      is_compound: true,
      instructions: 'Plant your feet, brace, and lower the bar with control.',
      instructions_es: null,
      instructions_el: null,
      is_template: true,
      created_by: null,
      created_at: '2026-08-24T00:00:00.000Z',
    } as Exercise;

    render(React.createElement(ExerciseInfoSheet, { exercise, userId: null, onClose: vi.fn() }));

    expect(screen.getByRole('img', { name: 'Bench Press technique' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Technique' })).toBeTruthy();
    expect(screen.getByText(/Plant your feet/)).toBeTruthy();
  });
});
