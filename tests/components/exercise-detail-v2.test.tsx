// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '@/lib/types';

let activeLang = 'en';

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.priority;
    return React.createElement('img', imageProps);
  },
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

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      lang: activeLang,
      t: (key: string, params?: Record<string, string | number>) => {
        const language = activeLang === 'es' || activeLang === 'el' ? activeLang : 'en';
        const source = actual.translations[key]?.[language] ?? actual.translations[key]?.en ?? key;
        return Object.entries(params ?? {}).reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), source);
      },
    }),
  };
});

vi.mock('@/lib/workout/units', () => ({
  useWeightUnit: () => ['kg'],
  kgToDisplay: (value: number) => value,
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import ExerciseInfoSheet from '@/components/workout/ExerciseInfoSheet';
import { ExerciseDetail } from '@/components/workout/ExerciseDetail';
import { supabase } from '@/lib/supabase';

const machinePress = {
  id: 'machine-press',
  name: 'Iso-Lateral Machine Press',
  name_es: null,
  name_el: null,
  muscle_group: 'chest',
  secondary_muscles: ['triceps'],
  equipment: 'machine',
  is_compound: true,
  instructions: 'Plant your feet firmly. Press the handles with control. Exhale as you press. Avoid lifting your shoulders.',
  instructions_es: null,
  instructions_el: null,
  is_template: true,
  created_by: null,
  created_at: '2026-08-24T00:00:00.000Z',
} as Exercise;

afterEach(() => { cleanup(); activeLang = 'en'; });

describe('full exercise detail', () => {
  it('renders honest fallback semantics and all guidance sections without invented safety facts', () => {
    render(<ExerciseInfoSheet exercise={machinePress} userId={null} onClose={vi.fn()} />);

    expect(screen.getByText('Anatomy reference')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /technique/i })).toBeNull();
    for (const heading of ['Equipment & setup', 'Setup', 'Technique guidance', 'Execution', 'Breathing', 'Common mistakes', 'Safety note', 'Training evidence', 'Personal record', 'Recent sessions']) {
      expect(screen.getByRole('heading', { name: heading })).toBeTruthy();
    }
    expect(screen.getByText('No exercise-specific safety note is available.')).toBeTruthy();
  });

  it('distinguishes a recoverable history error from an empty history', async () => {
    const result = Promise.resolve({ data: null, error: { message: 'offline' } });
    const query = Object.assign(result, {
      select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn(),
    });
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.limit.mockReturnValue(query);
    vi.mocked(supabase.from).mockReturnValue(query as never);

    render(<ExerciseDetail exercise={machinePress} userId="user-1" />);
    expect(await screen.findByText('Recent sessions could not be loaded. Try again later.')).toBeTruthy();
    expect(screen.queryByText(/No history yet/)).toBeNull();
  });

  it('hides stale personal records across exercise, null-user, and failed-user request identities', async () => {
    const firstResult = Promise.resolve({
      data: [{ weight_kg: 100, reps: 5, workout_sessions: { session_date: '2026-08-24' } }],
      error: null,
    });
    const secondResult = Promise.resolve({
      data: [{ weight_kg: 90, reps: 6, workout_sessions: { session_date: '2026-08-25' } }],
      error: null,
    });
    const failedResult = Promise.resolve({ data: null, error: { message: 'offline' } });
    const queryFor = (result: Promise<unknown>) => {
      const query = Object.assign(result, { select: vi.fn(), eq: vi.fn(), order: vi.fn(), limit: vi.fn() });
      query.select.mockReturnValue(query);
      query.eq.mockReturnValue(query);
      query.order.mockReturnValue(query);
      query.limit.mockReturnValue(query);
      return query;
    };
    vi.mocked(supabase.from)
      .mockReturnValueOnce(queryFor(firstResult) as never)
      .mockReturnValueOnce(queryFor(secondResult) as never)
      .mockReturnValueOnce(queryFor(failedResult) as never);

    const view = render(<ExerciseDetail exercise={machinePress} userId="user-1" />);
    expect(await screen.findByText('100 kg')).toBeTruthy();
    view.rerender(<ExerciseDetail exercise={{ ...machinePress, id: 'machine-press-2', name: 'Second Press' }} userId="user-1" />);
    expect(screen.queryByText('100 kg')).toBeNull();
    expect(await screen.findByText('90 kg')).toBeTruthy();

    view.rerender(<ExerciseDetail exercise={{ ...machinePress, id: 'machine-press-2', name: 'Second Press' }} userId={null} />);
    expect(screen.queryByText('90 kg')).toBeNull();

    view.rerender(<ExerciseDetail exercise={{ ...machinePress, id: 'machine-press-2', name: 'Second Press' }} userId="user-2" />);
    expect(await screen.findByText('Recent sessions could not be loaded. Try again later.')).toBeTruthy();
    expect(screen.queryByText('90 kg')).toBeNull();
  });

  it('uses a sticky Add action and switches to Added after the draft accepts it', () => {
    const onAdd = vi.fn();
    const { rerender } = render(
      <ExerciseInfoSheet exercise={machinePress} userId={null} onClose={vi.fn()} onAdd={onAdd} isAdded={false} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add Iso-Lateral Machine Press' }));
    expect(onAdd).toHaveBeenCalledWith(machinePress);

    rerender(
      <ExerciseInfoSheet exercise={machinePress} userId={null} onClose={vi.fn()} onAdd={onAdd} isAdded />,
    );
    expect(screen.getByRole('button', { name: 'Iso-Lateral Machine Press added' }).hasAttribute('disabled')).toBe(true);
  });

  it('localizes visual alternatives, equipment, and session evidence without English chrome fallback', () => {
    activeLang = 'es';
    render(<ExerciseDetail exercise={machinePress} userId={null} />);

    expect(screen.getByRole('img', { name: 'Referencia anatómica de Iso-Lateral Machine Press' })).toBeTruthy();
    expect(screen.getAllByText('machine')).toHaveLength(2);
    expect(screen.queryByAltText(/muscles worked anatomy/i)).toBeNull();
  });
});
