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
  'workout.add_warmup_sets': 'Add warm-up sets', 'workout.add_warmup_sets_saving': 'Adding warm-up sets…',
  'workout.add_warmup_sets_failed': 'Warm-up sets could not be added. Retry.', 'workout.plate_inventory_help': 'Use semicolons.',
  'workout.warmup_no_ramp': 'No ramp available.', 'workout.custom_cancel': 'Close',
}[key] ?? key) }) }));

import PlateCalculator from '@/components/workout/PlateCalculator';

afterEach(cleanup);

describe('PlateCalculator', () => {
  it('labels both mirrored sides and explains that warm-ups are suggestions', () => {
    render(<PlateCalculator weightKg={100} unit="kg" />);

    expect(screen.getByText('Left side')).toBeTruthy();
    expect(screen.getByText('Right side')).toBeTruthy();
    expect(screen.getByText(/Suggestions based on your working weight/i)).toBeTruthy();
    expect(screen.getByLabelText('Total weight (kg)')).toBeTruthy();
    expect(screen.getByLabelText('Bar weight (kg)')).toBeTruthy();
    expect(screen.getByLabelText('Available plates per side')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add warm-up sets' })).toBeNull();
    expect(screen.getByText('Left side').className).toContain('text-xs');
    const plate = screen.getAllByText('25')[0];
    expect(plate.className).toContain('text-xs');
    expect(plate.className).toContain('font-mono');
    expect(screen.getByLabelText('Total weight (kg)').className).toContain('font-mono');
  });

  it('makes every load input editable and only offers verified warm-up insertion with exercise context', async () => {
    let resolveInsert!: (value: boolean) => void;
    const onAddWarmupSets = vi.fn(() => new Promise<boolean>((resolve) => { resolveInsert = resolve; }));
    render(<PlateCalculator
      weightKg={100}
      unit="kg"
      exerciseContext={{ exerciseId: 'bench', mode: 'live' }}
      onAddWarmupSets={onAddWarmupSets}
    />);

    fireEvent.change(screen.getByLabelText('Total weight (kg)'), { target: { value: '80' } });
    fireEvent.change(screen.getByLabelText('Bar weight (kg)'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Available plates per side'), { target: { value: '15; 10; 5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Adding warm-up sets…' }));

    expect(onAddWarmupSets).toHaveBeenCalledTimes(1);
    expect(onAddWarmupSets).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ percentage: 40, reps: 10 })]),
      { exerciseId: 'bench', mode: 'live' },
    );
    expect(screen.getByRole('button', { name: 'Adding warm-up sets…' }).hasAttribute('disabled')).toBe(true);
    resolveInsert(false);
    expect((await screen.findByRole('alert')).textContent).toBe('Warm-up sets could not be added. Retry.');
    expect((screen.getByLabelText('Total weight (kg)') as HTMLInputElement).value).toBe('80');
  });

  it('keeps sequential decimal-comma typing intact and blocks every close path while insertion is pending', () => {
    let resolveInsert!: (value: boolean) => void;
    const onClose = vi.fn();
    render(<PlateCalculator weightKg={100} unit="kg" onClose={onClose} exerciseContext={{ exerciseId: 'bench', mode: 'live' }} onAddWarmupSets={() => new Promise<boolean>((resolve) => { resolveInsert = resolve; })} />);
    const total = screen.getByLabelText('Total weight (kg)');
    fireEvent.change(total, { target: { value: '80,' } });
    fireEvent.change(total, { target: { value: '80,5' } });
    expect((total as HTMLInputElement).value).toBe('80,5');
    fireEvent.click(screen.getByRole('button', { name: 'Add warm-up sets' }));
    expect((screen.getByLabelText('Total weight (kg)') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Bar weight (kg)') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Available plates per side') as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Adding warm-up sets…' }).hasAttribute('disabled')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(document.querySelector('.fixed')!);
    expect(onClose).not.toHaveBeenCalled();
    resolveInsert(true);
  });

  it('treats bar-only equal and above-bar loads as achievable, but below-bar loads as impossible', () => {
    render(<PlateCalculator weightKg={21} unit="kg" />);
    fireEvent.change(screen.getByLabelText('Bar weight (kg)'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Available plates per side'), { target: { value: '' } });
    expect(screen.getByText(/Nearest achievable load/)).toBeTruthy();
    cleanup();
    render(<PlateCalculator weightKg={20} unit="kg" />);
    expect(screen.getByText(/Exact load/)).toBeTruthy();
    cleanup();
    render(<PlateCalculator weightKg={19} unit="kg" />);
    expect(screen.getByText(/No achievable load/)).toBeTruthy();
  });
});
