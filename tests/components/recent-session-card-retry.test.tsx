// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ fails: true, calls: 0 }));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const element = (tag: 'button' | 'div') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>((props, ref) => ReactModule.createElement(tag, {
    ...Object.fromEntries(Object.entries(props).filter(([key]) => !['animate', 'exit', 'initial', 'transition', 'whileTap'].includes(key))), ref,
  }, props.children as React.ReactNode));
  return { AnimatePresence: ({ children }: { children: React.ReactNode }) => children, motion: { button: element('button'), div: element('div') } };
});
vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return { ...actual, useI18n: () => ({ lang: 'es', t: (key: string, params?: Record<string, string | number>) => (actual.translations[key]?.es ?? key).replace(/\{(\w+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`)) }) };
});
vi.mock('@/lib/workout/units', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/workout/units')>();
  return { ...actual, useWeightUnit: () => ['lb', vi.fn()] };
});
vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => {
      const query: Record<string, unknown> = {};
      for (const method of ['select', 'eq', 'order']) query[method] = vi.fn(() => query);
      query.then = (resolve: (value: unknown) => unknown) => {
        harness.calls += 1;
        const result = harness.fails
          ? { data: null, error: new Error('sets unavailable') }
          : { data: [{ id: 'set-1', exercise_id: 'bench', set_number: 1, weight_kg: null, reps: null, rpe: null, is_warmup: false, is_pr: false, exercise: { name: 'Barbell Bench Press', name_es: null, name_el: null, muscle_group: 'chest' } }], error: null };
        return Promise.resolve(result).then(resolve);
      };
      return query;
    }),
  },
}));

import RecentSessionCard from '@/components/workout/RecentSessionCard';

afterEach(() => { cleanup(); harness.fails = true; harness.calls = 0; });

describe('RecentSessionCard lazy recovery', () => {
  it('does not misclassify a failed load as empty and retries with localized honest values', async () => {
    render(<RecentSessionCard lang="es" session={{
      id: 'session-1', user_id: 'user-1', session_date: '2026-09-03', name: 'Sesión', template_id: null,
      duration_minutes: 45, notes: null, pain_flags: [], completed_at: '2026-09-03T12:00:00Z', created_at: '2026-09-03T10:00:00Z',
    }} />);

    fireEvent.click(screen.getByRole('button', { name: /Sesión/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('No se pudieron cargar los detalles de las series.');
    expect(screen.queryByText(/sin series/i)).toBeNull();

    harness.fails = false;
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    await waitFor(() => expect(harness.calls).toBe(2));
    expect(screen.getByRole('table', { name: 'Series completadas de Barbell Bench Press' })).toBeTruthy();
    expect(screen.getAllByText('No registrado')).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(/Thu|Set|Type|Weight|Reps|Personal record/);
  });
});
