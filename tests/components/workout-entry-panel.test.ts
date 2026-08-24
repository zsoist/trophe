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
    t: (key: string) => ({
      'workout.strength': 'Strength',
      'workout.strength_sub': 'Weights · sets · PRs',
      'workout.cardio': 'Cardio',
      'workout.cardio_sub': 'Run · cycle · HIIT',
      'workout.quick_start': 'Quick start',
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
  it('starts with two clear training modes and keeps split presets collapsed', () => {
    render(React.createElement(WorkoutEntryPanel, {
      disabled: false,
      onStrength: vi.fn(),
      onCardio: vi.fn(),
      onSplit: vi.fn(),
    }));

    expect(screen.getByRole('button', { name: /Start strength workout/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log cardio workout/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quick start', expanded: false })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Push' })).toBeNull();
  });

  it('reveals split presets only after the user asks for them', () => {
    const onSplit = vi.fn();
    render(React.createElement(WorkoutEntryPanel, {
      disabled: false,
      onStrength: vi.fn(),
      onCardio: vi.fn(),
      onSplit,
    }));

    fireEvent.click(screen.getByRole('button', { name: 'Quick start' }));
    fireEvent.click(screen.getByRole('button', { name: 'Push' }));

    expect(screen.getByRole('button', { name: 'Quick start', expanded: true })).toBeTruthy();
    expect(onSplit).toHaveBeenCalledWith('push');
  });
});
