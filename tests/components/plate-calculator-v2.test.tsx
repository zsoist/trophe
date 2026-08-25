// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  motion: { div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => <div {...props}>{children}</div> },
  useReducedMotion: () => true,
}));
vi.mock('@/lib/i18n', () => ({ useI18n: () => ({ t: (key: string) => ({
  'workout.plate_title': 'Plate calculator', 'workout.plate_total_label': 'Total weight',
  'workout.plate_bar_label': 'Bar weight', 'workout.plate_inventory_label': 'Available plates per side',
  'workout.plate_left_side': 'Left side', 'workout.plate_right_side': 'Right side',
  'workout.plate_per_side': 'Plates are listed per side', 'workout.plate_exact': 'Exact load',
  'workout.plate_nearest': 'Nearest achievable load', 'workout.plate_impossible': 'No achievable load',
  'workout.warmup_title': 'Warm-up ramp', 'workout.warmup_explanation': 'Suggestions based on your working weight.',
  'workout.add_warmup_sets': 'Add warm-up sets', 'workout.custom_cancel': 'Close',
}[key] ?? key) }) }));

import PlateCalculator from '@/components/workout/PlateCalculator';

afterEach(cleanup);

describe('PlateCalculator', () => {
  it('labels both mirrored sides and explains that warm-ups are suggestions', () => {
    render(<PlateCalculator weightKg={100} unit="kg" />);

    expect(screen.getByText('Left side')).toBeTruthy();
    expect(screen.getByText('Right side')).toBeTruthy();
    expect(screen.getByText(/Suggestions based on your working weight/i)).toBeTruthy();
    expect(screen.getByLabelText('Total weight')).toBeTruthy();
    expect(screen.getByLabelText('Bar weight')).toBeTruthy();
    expect(screen.getByLabelText('Available plates per side')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add warm-up sets' })).toBeNull();
  });

  it('makes every load input editable and only offers warm-up insertion with exercise context', () => {
    const onAddWarmupSets = vi.fn();
    render(<PlateCalculator
      weightKg={100}
      unit="kg"
      exerciseContext={{ exerciseId: 'bench', mode: 'live' }}
      onAddWarmupSets={onAddWarmupSets}
    />);

    fireEvent.change(screen.getByLabelText('Total weight'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Bar weight'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Available plates per side'), { target: { value: '15, 10, 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));

    expect(onAddWarmupSets).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ percentage: 40, reps: 10 })]),
      { exerciseId: 'bench', mode: 'live' },
    );
  });
});
