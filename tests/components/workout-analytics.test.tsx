// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkoutCalendar } from '@/components/workout/analytics/WorkoutCalendar';
import { filterMuscleLoadEntries, MuscleLoadChart } from '@/components/workout/analytics/MuscleLoadChart';
import { aggregateExerciseProgress, ExerciseProgressChart } from '@/components/workout/analytics/ExerciseProgressChart';
import { WorkoutSummaryMetrics } from '@/components/workout/analytics/WorkoutSummaryMetrics';

afterEach(cleanup);

describe('workout analytics evidence surfaces', () => {
  it('uses the most recent completed session for Last and local calendar boundaries for Week and Month', () => {
    const entries = [
      { date: '2026-08-31', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] },
      { date: '2026-09-01', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] },
      { date: '2026-09-03', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] },
    ];
    expect(filterMuscleLoadEntries(entries, 'last', '2026-09-03').map((entry) => entry.date)).toEqual(['2026-09-03']);
    expect(filterMuscleLoadEntries(entries, 'week', '2026-09-03').map((entry) => entry.date)).toEqual(['2026-08-31', '2026-09-01', '2026-09-03']);
    expect(filterMuscleLoadEntries(entries, 'month', '2026-09-03').map((entry) => entry.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('describes a scheduled and completed calendar day without relying on colour', () => {
    render(<WorkoutCalendar month="2026-09" scheduled={['2026-09-03']} completed={['2026-09-03']} today="2026-09-03" />);

    expect(screen.getByLabelText(/september 3.*scheduled.*completed.*today/i)).toBeTruthy();
    expect(screen.getByText(/scheduled and completed/i)).toBeTruthy();
  });

  it('supports month navigation with labelled controls', () => {
    render(<WorkoutCalendar month="2026-09" scheduled={[]} completed={[]} />);
    fireEvent.click(screen.getByRole('button', { name: /previous month/i }));
    expect(screen.getByRole('heading', { name: /august 2026/i })).toBeTruthy();
  });

  it('renders role-weighted weekly muscle load with a readable equivalent', () => {
    render(<MuscleLoadChart range="week" data={[{
      date: '2026-09-03',
      exercise: { name: 'Barbell Bench Press', equipment: 'Barbell' },
      sets: [{ completed: true, isWarmup: false }, { completed: true, isWarmup: false }, { completed: true, isWarmup: true }],
    }]} now="2026-09-03" />);

    expect(screen.getByRole('img', { name: /weekly muscle load/i })).toBeTruthy();
    expect(screen.getByLabelText(/pectoralis major 100%/i)).toBeTruthy();
    expect(screen.getByRole('table', { name: /weekly muscle load values/i })).toBeTruthy();
  });

  it('explains which completed evidence is required when muscle load is empty', () => {
    render(<MuscleLoadChart range="month" data={[]} now="2026-09-03" />);
    expect(screen.getByText(/completed strength sets with a resolved exercise/i)).toBeTruthy();
  });

  it('renders explicit progress evidence and identifies insufficient history', () => {
    const { rerender } = render(<ExerciseProgressChart exerciseName="Barbell Bench Press" data={[{ date: '2026-09-03', weightKg: 80, reps: 5 }]} />);
    expect(screen.getByText(/need at least two completed weighted sets/i)).toBeTruthy();

    rerender(<ExerciseProgressChart exerciseName="Barbell Bench Press" data={[
      { date: '2026-08-27', weightKg: 75, reps: 5 },
      { date: '2026-09-03', weightKg: 80, reps: 5 },
    ]} />);
    expect(screen.getByRole('table', { name: /barbell bench press progress values/i })).toBeTruthy();
    expect(screen.getByLabelText(/80 kg, 5 reps, 400 kg volume/i)).toBeTruthy();
  });

  it('uses one best completed evidence point per session', () => {
    expect(aggregateExerciseProgress([{ date: '2026-09-01', weightKg: 70, reps: 10 }, { date: '2026-09-01', weightKg: 75, reps: 5 }, { date: '2026-09-02', weightKg: null, reps: 8 }])).toEqual([{ date: '2026-09-01', weightKg: 75, reps: 5 }]);
  });

  it('calculates summary metrics only from completed working-set evidence', () => {
    render(<WorkoutSummaryMetrics sessions={[{
      id: 'session-1', durationMinutes: 45,
      sets: [
        { completed: true, isWarmup: false, weightKg: 60, reps: 8, isPr: true },
        { completed: true, isWarmup: true, weightKg: 20, reps: 10 },
        { completed: false, isWarmup: false, weightKg: 100, reps: 1 },
      ],
    }]} />);

    expect(screen.getByText('45 min')).toBeTruthy();
    expect(screen.getByText('1 working set')).toBeTruthy();
    expect(screen.getByText('480 kg')).toBeTruthy();
    expect(screen.getByText('1 PR')).toBeTruthy();
  });
});
