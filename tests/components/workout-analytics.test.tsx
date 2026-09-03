// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return { ...actual, useI18n: () => ({ lang: 'en', t: (key: string, params?: Record<string, string | number>) => (actual.translations[key]?.en ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`)) }) };
});
import { WorkoutCalendar } from '@/components/workout/analytics/WorkoutCalendar';
import { filterMuscleLoadEntries, MuscleLoadChart } from '@/components/workout/analytics/MuscleLoadChart';
import { aggregateExerciseProgress, ExerciseProgressChart } from '@/components/workout/analytics/ExerciseProgressChart';
import { WorkoutSummaryMetrics } from '@/components/workout/analytics/WorkoutSummaryMetrics';

afterEach(cleanup);

describe('workout analytics evidence surfaces', () => {
  it('uses the most recent completed session for Last and local calendar boundaries for Week and Month', () => {
    const entries = [
      { sessionId: 'session-1', date: '2026-08-31', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] },
      { sessionId: 'session-2', date: '2026-09-01', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] },
      { sessionId: 'session-3', date: '2026-09-03', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] },
    ];
    expect(filterMuscleLoadEntries(entries, 'last', '2026-09-03', 'session-3').map((entry) => entry.date)).toEqual(['2026-09-03']);
    expect(filterMuscleLoadEntries(entries, 'week', '2026-09-03').map((entry) => entry.date)).toEqual(['2026-08-31', '2026-09-01', '2026-09-03']);
    expect(filterMuscleLoadEntries(entries, 'month', '2026-09-03').map((entry) => entry.date)).toEqual(['2026-09-01', '2026-09-03']);
  });

  it('keeps Last honest when the latest completed session has no resolved strength evidence', () => {
    const entries = [{ sessionId: 'strength-session', date: '2026-09-03', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] }];

    expect(filterMuscleLoadEntries(entries, 'last', '2026-09-04', 'cardio-session')).toEqual([]);
  });

  it('includes only the exact latest strength session when another session shares its date', () => {
    const entries = [
      { sessionId: 'earlier-strength', date: '2026-09-03', exercise: { name: 'Barbell Row' }, sets: [{ completed: true }] },
      { sessionId: 'latest-strength', date: '2026-09-03', exercise: { name: 'Barbell Bench Press' }, sets: [{ completed: true }] },
    ];

    expect(filterMuscleLoadEntries(entries, 'last', '2026-09-03', 'latest-strength').map((entry) => entry.sessionId)).toEqual(['latest-strength']);
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
      sessionId: 'strength-session',
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
    expect(aggregateExerciseProgress([
      { sessionId: 'session-a', date: '2026-09-01', weightKg: 70, reps: 10 },
      { sessionId: 'session-a', date: '2026-09-01', weightKg: 75, reps: 5 },
      { sessionId: 'session-b', date: '2026-09-01', weightKg: 80, reps: 3 },
      { sessionId: 'session-c', date: '2026-09-02', weightKg: null, reps: 8 },
    ])).toEqual([
      { sessionId: 'session-a', date: '2026-09-01', weightKg: 75, reps: 5 },
      { sessionId: 'session-b', date: '2026-09-01', weightKg: 80, reps: 3 },
    ]);
  });

  it('formats progress in the preferred unit without inventing missing weight or reps', () => {
    render(<ExerciseProgressChart exerciseName="Barbell Bench Press" unit="lb" data={[
      { sessionId: 'session-a', date: '2026-08-27', weightKg: 100, reps: 2 },
      { sessionId: 'session-b', date: '2026-09-03', weightKg: 110, reps: 1 },
      { sessionId: 'session-c', date: '2026-09-03', weightKg: null, reps: 8 },
    ]} />);

    expect(screen.getByText('220.5 lb')).toBeTruthy();
    expect(screen.queryByText('0 lb')).toBeNull();
    expect(screen.getByLabelText(/220\.5 lb, 2 reps, 440\.9 lb volume/i)).toBeTruthy();
  });

  it('bounds dense progress visuals and detail rows on long histories', () => {
    const data = Array.from({ length: 100 }, (_, index) => ({
      sessionId: `session-${index}`,
      date: `2026-${String(Math.floor(index / 28) + 1).padStart(2, '0')}-${String((index % 28) + 1).padStart(2, '0')}`,
      weightKg: 50 + index,
      reps: 5,
    }));

    const { container } = render(<ExerciseProgressChart exerciseName="Barbell Bench Press" data={data} />);

    expect(container.querySelectorAll('svg circle').length).toBeLessThanOrEqual(48);
    expect(container.querySelectorAll('tbody tr').length).toBeLessThanOrEqual(12);
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
