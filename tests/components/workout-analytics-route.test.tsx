// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  getUser: vi.fn(),
  push: vi.fn(),
  calls: [] as Array<{ table: string; steps: Array<[string, ...unknown[]]> }>,
  scheduleError: false,
  measurementError: false,
  setError: false,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard/workout/stats',
  useRouter: () => harness,
}));
vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      lang: 'en',
      t: (key: string, params?: Record<string, string | number>) => (actual.translations[key]?.en ?? key)
        .replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`)),
    }),
  };
});
vi.mock('@/lib/workout/units', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/units')>();
  return { ...actual, useWeightUnit: () => ['lb', vi.fn()] };
});
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: harness.getUser },
    from: vi.fn((table: string) => {
      const call = { table, steps: [] as Array<[string, ...unknown[]]> };
      harness.calls.push(call);
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'not', 'order', 'in', 'abortSignal']) {
        query[method] = vi.fn((...args: unknown[]) => { call.steps.push([method, ...args]); return query; });
      }
      const result = () => {
        if (table === 'workout_sets') return harness.setError ? { data: null, error: new Error('sets unavailable') } : { data: [{
          id: 'set-1', session_id: 'strength-session', exercise_id: 'bench', set_number: 1,
          weight_kg: 100, reps: 2, rpe: 8, is_warmup: false, is_pr: true,
          exercise: { id: 'bench', name: 'Barbell Bench Press', name_es: null, name_el: null, muscle_group: 'chest', equipment: 'Barbell' },
        }, {
          id: 'set-2', session_id: 'older-strength-session', exercise_id: 'bench', set_number: 1,
          weight_kg: 90, reps: 3, rpe: 8, is_warmup: false, is_pr: false,
          exercise: { id: 'bench', name: 'Barbell Bench Press', name_es: null, name_el: null, muscle_group: 'chest', equipment: 'Barbell' },
        }], error: null };
        if (table === 'measurements') return harness.measurementError
          ? { data: null, error: new Error('measurements unavailable') }
          : { data: [{ measured_date: '2026-09-03', weight_kg: 100 }], error: null };
        if (table === 'workout_programs') return harness.scheduleError
          ? { data: null, error: new Error('schedule unavailable') }
          : { data: [{ starts_on: '2026-09-02', workout_program_days: [{ weekday: 4 }] }], error: null };
        return { data: [], error: null };
      };
      query.range = vi.fn((from: number, to: number) => {
        call.steps.push(['range', from, to]);
        return Promise.resolve({ data: from === 0 ? [
          { id: 'cardio-session', user_id: 'user-1', session_date: '2026-09-03', completed_at: '2026-09-03T12:00:00Z', workout_kind: 'cardio', duration_minutes: 30 },
          { id: 'strength-session', user_id: 'user-1', session_date: '2026-09-03', completed_at: '2026-09-03T11:00:00Z', workout_kind: 'strength', duration_minutes: 45 },
          { id: 'older-strength-session', user_id: 'user-1', session_date: '2026-08-28', completed_at: '2026-08-28T11:00:00Z', workout_kind: 'strength', duration_minutes: null },
        ] : [], error: null });
      });
      query.maybeSingle = vi.fn(() => Promise.resolve(result()));
      query.then = (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve);
      return query;
    }),
  },
}));

import { supabase } from '@/lib/supabase';
import WorkoutAnalyticsSurface from '@/components/workout/analytics/WorkoutAnalyticsSurface';

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date('2026-09-03T12:00:00Z'));
  harness.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  harness.getUser.mockReset();
  harness.push.mockReset();
  harness.calls.length = 0;
  harness.scheduleError = false;
  harness.measurementError = false;
  harness.setError = false;
  vi.mocked(supabase.from).mockClear();
});

describe('WorkoutAnalyticsSurface production data boundary', () => {
  it('redirects unauthenticated visitors before issuing scoped data queries', async () => {
    harness.getUser.mockResolvedValue({ data: { user: null } });

    render(<WorkoutAnalyticsSurface />);

    await waitFor(() => expect(harness.push).toHaveBeenCalledWith('/login'));
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it('queries terminal user evidence and renders schedule, preferred units, and an honest Last range', async () => {
    render(<WorkoutAnalyticsSurface />);

    expect((await screen.findByTestId('training-progress-title')).textContent).toBe('Training progress');
    expect(await screen.findByTestId('training-progress-layout')).toBeTruthy();
    expect(screen.getByTestId('training-progress-canvas').className).toContain('bg-[var(--workout-canvas)]');
    await screen.findByText('220.5 lb');
    expect(screen.getByRole('gridcell', { name: /^September 3:/i })).toBeTruthy();
    const sessionCall = harness.calls.find((call) => call.table === 'workout_sessions');
    expect(sessionCall?.steps).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(sessionCall?.steps).toContainEqual(['not', 'completed_at', 'is', null]);
    expect(sessionCall?.steps.filter(([method]) => method === 'order')).toEqual([
      ['order', 'session_date', { ascending: false }],
      ['order', 'completed_at', { ascending: false }],
      ['order', 'id', { ascending: false }],
    ]);
    expect(harness.calls.find((call) => call.table === 'measurements')?.steps).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(harness.calls.find((call) => call.table === 'workout_programs')?.steps).toContainEqual(['eq', 'client_id', 'user-1']);
    expect(harness.calls.find((call) => call.table === 'workout_sets')?.steps).toContainEqual(['in', 'session_id', ['cardio-session', 'strength-session', 'older-strength-session']]);

    fireEvent.click(screen.getByRole('button', { name: 'Last' }));
    expect(screen.getByText(/latest completed workout has no resolved strength evidence/i)).toBeTruthy();
    expect(screen.getByLabelText(/220\.5 lb, 2 reps/i)).toBeTruthy();
  });

  it('keeps core evidence visible while classifying schedule and measurement failures, then retries in place', async () => {
    harness.scheduleError = true;
    harness.measurementError = true;
    render(<WorkoutAnalyticsSurface />);

    expect(await screen.findByText(/schedule could not load/i)).toBeTruthy();
    expect(screen.getByText(/body-weight measurements could not load/i)).toBeTruthy();
    expect(screen.getByText('75 min')).toBeTruthy();
    const firstSessionCalls = harness.calls.filter((call) => call.table === 'workout_sessions').length;

    harness.scheduleError = false;
    harness.measurementError = false;
    fireEvent.click(screen.getByRole('button', { name: /retry|try again/i }));

    await waitFor(() => expect(harness.calls.filter((call) => call.table === 'workout_sessions')).toHaveLength(firstSessionCalls + 1));
    await waitFor(() => expect(screen.queryByText(/schedule could not load/i)).toBeNull());
  });

  it('does not continue a pending authenticated load after unmount', async () => {
    let resolveAuth!: (value: { data: { user: { id: string } } }) => void;
    harness.getUser.mockReturnValue(new Promise((resolve) => { resolveAuth = resolve; }));
    const view = render(<WorkoutAnalyticsSurface />);
    await waitFor(() => expect(harness.getUser).toHaveBeenCalled());

    view.unmount();
    resolveAuth({ data: { user: { id: 'user-1' } } });
    await Promise.resolve();
    await Promise.resolve();

    expect(supabase.from).not.toHaveBeenCalled();
  });
});
