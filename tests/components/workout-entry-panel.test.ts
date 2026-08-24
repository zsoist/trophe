// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkoutEntryPanel from '@/components/workout/WorkoutEntryPanel';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => React.createElement('img', props),
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => ({
      'workout.strength': 'Strength',
      'workout.strength_sub': 'Build sets and rep targets',
      'workout.cardio': 'Cardio',
      'workout.cardio_sub': 'Plan time, distance, and effort',
      'workout.build_strength': 'Build strength workout',
      'workout.build_cardio': 'Build cardio workout',
      'workout.templates': 'Workout templates',
      'workout.preview_named': `Preview ${params?.name}`,
      'workout.split_push': 'Push',
      'workout.split_pull': 'Pull',
      'workout.split_legs': 'Legs',
      'workout.split_upper': 'Upper body',
      'workout.split_chest_tri': 'Chest & Triceps',
      'workout.split_back_bi': 'Back & Biceps',
      'workout.split_full': 'Full body',
    }[key] ?? key),
  }),
}));

afterEach(cleanup);

describe('WorkoutEntryPanel', () => {
  it('offers restrained draft-first strength and cardio choices', () => {
    render(React.createElement(WorkoutEntryPanel, { disabled: false, onStrength: vi.fn(), onCardio: vi.fn(), onSplit: vi.fn() }));

    expect(screen.getByRole('button', { name: 'Build strength workout' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Build cardio workout' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Workout templates' })).toBeTruthy();
  });

  it('previews a split instead of starting it', () => {
    const onSplit = vi.fn();
    render(React.createElement(WorkoutEntryPanel, { disabled: false, onStrength: vi.fn(), onCardio: vi.fn(), onSplit }));

    fireEvent.click(screen.getByRole('button', { name: 'Preview Push' }));

    expect(onSplit).toHaveBeenCalledWith('push');
  });
});
