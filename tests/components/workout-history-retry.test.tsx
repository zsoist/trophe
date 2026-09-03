// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  push: vi.fn(),
  sessionFailure: true,
  calls: [] as Array<{ table: string; steps: Array<[string, ...unknown[]]> }>,
}));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const element = (tag: 'div') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => ReactModule.createElement(tag, {
    ...Object.fromEntries(Object.entries(props).filter(([key]) => !['animate', 'exit', 'initial', 'layout', 'transition'].includes(key))),
    ref,
  }, props.children as React.ReactNode));
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { div: element('div') } };
});
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard/workout/history', useRouter: () => harness }));
vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return { ...actual, useI18n: () => ({ lang: 'en', t: (key: string, params?: Record<string, string | number>) => (actual.translations[key]?.en ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`)) }) };
});
vi.mock('@/lib/workout/units', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/units')>();
  return { ...actual, useWeightUnit: () => ['lb', vi.fn()] };
});
vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from: vi.fn((table: string) => {
      const call = { table, steps: [] as Array<[string, ...unknown[]]> };
      harness.calls.push(call);
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'not', 'order', 'limit', 'in', 'range']) query[method] = vi.fn((...args: unknown[]) => { call.steps.push([method, ...args]); return query; });
      const result = () => table === 'workout_sessions'
        ? harness.sessionFailure
          ? { data: null, error: new Error('sessions unavailable') }
          : { data: [{ id: 'session-1', user_id: 'user-1', session_date: '2026-09-03', completed_at: '2026-09-03T12:00:00Z', name: 'Recovered session', duration_minutes: 45, pain_flags: [] }], error: null }
        : { data: [
          { id: 'set-1', session_id: 'session-1', exercise_id: 'bench', set_number: 1, weight_kg: 100, reps: 2, rpe: 8, is_warmup: false, is_pr: false, exercise: { id: 'bench', name: 'Barbell Bench Press', name_es: null, name_el: null } },
          { id: 'set-2', session_id: 'session-1', exercise_id: 'bench', set_number: 2, weight_kg: null, reps: null, rpe: null, is_warmup: false, is_pr: false, exercise: { id: 'bench', name: 'Barbell Bench Press', name_es: null, name_el: null } },
        ], error: null };
      query.then = (resolve: (value: ReturnType<typeof result>) => unknown) => Promise.resolve(result()).then(resolve);
      return query;
    }),
  },
}));

import WorkoutHistoryPage from '@/app/dashboard/workout/history/page';

afterEach(() => {
  cleanup();
  harness.push.mockReset();
  harness.sessionFailure = true;
  harness.calls.length = 0;
});

describe('Workout history recovery and honest set evidence', () => {
  it('retries initial query failures in place and recovers with preferred-unit/null rendering', async () => {
    render(<WorkoutHistoryPage />);

    expect((await screen.findByRole('alert')).textContent).toMatch(/history could not load/i);
    expect(screen.queryByText(/No workouts yet/i)).toBeNull();
    harness.sessionFailure = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

    const card = await screen.findByRole('button', { name: /Recovered session/i });
    const recentEvidence = screen.getByRole('complementary', { name: 'Recent progress' });
    expect(within(recentEvidence).getByText('Recovered session')).toBeTruthy();
    expect(within(recentEvidence).getByRole('link', { name: 'Training progress' }).getAttribute('href')).toBe('/dashboard/workout/stats');
    expect(screen.getByTestId('workout-history-canvas').className).toContain('bg-[var(--workout-canvas)]');
    expect(screen.getByTestId('workout-history-layout')).toBeTruthy();
    expect(harness.calls.filter((call) => call.table === 'workout_sessions')).toHaveLength(2);
    expect(harness.calls[1].steps).toContainEqual(['eq', 'user_id', 'user-1']);
    expect(harness.calls[1].steps).toContainEqual(['not', 'completed_at', 'is', null]);
    fireEvent.click(card);
    await waitFor(() => expect(screen.getByText('220.5 lb')).toBeTruthy());
    expect(screen.getAllByText('Not recorded')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('0kg');
  });
});
