// @vitest-environment jsdom
import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Exercise } from '@/lib/types';

vi.mock('@/lib/workout/units', () => ({
  useWeightUnit: () => ['kg'],
  kgToDisplay: (value: number) => value,
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { I18nProvider } from '@/lib/i18n';
import { supabase } from '@/lib/supabase';

const base = {
  id: 'bench',
  name: 'Barbell Bench Press',
  name_es: null,
  name_el: null,
  muscle_group: 'chest',
  secondary_muscles: ['triceps'],
  equipment: 'barbell',
  is_compound: true,
  instructions: 'Plant your feet firmly. Press the bar with control.',
  instructions_es: null,
  instructions_el: null,
  is_template: true,
  created_by: null,
  created_at: '2026-08-24T00:00:00.000Z',
} as Exercise;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function pendingQuery() {
  const query = { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(), then: () => undefined };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  query.limit.mockReturnValue(query);
  return query;
}

it('never paints the previous exercise history while the next request is pending', async () => {
  const first = Promise.resolve({ data: [{ weight_kg: 100, reps: 5, workout_sessions: { session_date: '2026-08-24' } }], error: null });
  const firstQuery = Object.assign(first, { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() });
  firstQuery.select.mockReturnValue(firstQuery);
  firstQuery.eq.mockReturnValue(firstQuery);
  firstQuery.order.mockReturnValue(firstQuery);
  firstQuery.limit.mockReturnValue(firstQuery);
  vi.mocked(supabase.from)
    .mockReturnValueOnce(firstQuery as never)
    .mockReturnValueOnce(pendingQuery() as never);

  const view = render(<I18nProvider defaultLang="en"><ExerciseDetail exercise={base} userId="user-1" /></I18nProvider>);
  expect(await screen.findByText('100kg × 5')).toBeTruthy();

  view.rerender(<I18nProvider defaultLang="en"><ExerciseDetail exercise={{ ...base, id: 'row', name: 'Seated Cable Row' }} userId="user-1" /></I18nProvider>);

  // The pending identity shows the loading state, never the row from the previous exercise.
  expect(screen.getByText('Loading training history…')).toBeTruthy();
  expect(screen.queryByText('100kg × 5')).toBeNull();
});
