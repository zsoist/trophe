// @vitest-environment jsdom

import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('framer-motion', () => ({
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  motion: {
    div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, drag: _d, dragConstraints: _dc, dragElastic: _de, onDragEnd: _oe, ...props }: React.HTMLAttributes<HTMLDivElement> & { [k: string]: unknown }) => { void _i; void _a; void _e; void _t; void _d; void _dc; void _de; void _oe; return <div {...props}>{children}</div>; },
    button: ({ children, whileTap: _w, initial: _i, animate: _a, exit: _e, transition: _t, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { [k: string]: unknown }) => { void _w; void _i; void _a; void _e; void _t; return <button {...props}>{children}</button>; },
  },
  useReducedMotion: () => true,
}));
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) } }));
vi.mock('@/components/workout/workout-persistence', () => ({
  loadLastSetsMap: vi.fn().mockResolvedValue({}),
  loadPrMap: vi.fn().mockResolvedValue({}),
  createWorkoutSession: vi.fn().mockResolvedValue('session-1'),
  insertWorkoutSet: vi.fn().mockResolvedValue('set-1'), finishWorkoutSession: vi.fn(), deleteWorkoutSet: vi.fn(),
}));
vi.mock('@/lib/workout/units', () => ({ useWeightUnit: () => ['kg', vi.fn()], kgToDisplay: (value: number) => value, displayToKg: (value: number) => value }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string, values?: Record<string, unknown>) => ({
      'workout.rest_target': 'Rest target', 'workout.rest_seconds_named': `Rest seconds for ${values?.name}`,
      'workout.save_failed': 'Workout not saved', 'workout.complete_set': 'Complete set', 'workout.undo_set': 'Undo set',
      'workout.resting': 'Resting', 'workout.rested_go': 'Rested — go', 'workout.rest_dismiss_hint': 'Dismiss rest',
      'workout.next_exercise': 'Next exercise', 'workout.prev_exercise': 'Previous exercise', 'workout.ready': 'Ready',
    }[key] ?? key),
  }),
}));

import GuidedSession, { type GuidedExerciseInfo, type GuidedTemplate } from '@/components/workout/GuidedSession';

const STORAGE_KEY = 'trophe_rest_targets';
const readStorage = () => JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '{}') as Record<string, number>;
const checked = (name: string) => screen.getByRole('radio', { name }).getAttribute('aria-checked') === 'true';

const template: GuidedTemplate = {
  id: 'tpl-1', name: 'Upper', dayLabel: null, difficulty: null,
  exercises: [{ exercise_id: 'bench', target_sets: 1, target_reps: '8' }],
};

const renderGuided = () => render(
  <GuidedSession userId="user-1" programName="Upper" template={template} exerciseInfo={{}} onExit={vi.fn()} />,
);

beforeEach(() => { window.localStorage.clear(); });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('GuidedSession per-exercise rest target', () => {
  it('sets, reflects and re-reads the canonical per-exercise rest override', async () => {
    const first = renderGuided();
    // No curated info → unknown compound → isolation default.
    expect(await screen.findByRole('radio', { name: '90s' })).toBeTruthy();
    expect(checked('90s')).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: '60s' }));
    expect(checked('60s')).toBe(true);
    expect(readStorage()).toEqual({ bench: 60 });
    first.unmount();

    renderGuided();
    expect(await screen.findByRole('radio', { name: '60s' })).toBeTruthy();
    expect(checked('60s')).toBe(true);
    expect(readStorage()).toEqual({ bench: 60 });
  });
});

// ── In-flight rest is bound to its ORIGINATING exercise ──────────────────────
// Regression for WORKOUT-SESSION-001: while a rest ran, reading the *browsed*
// exercise's target let a shorter target on the next row fire `rested_go`
// prematurely (Bench 150 accepted, 61s elapsed, next row 60, +500ms → rested).

const twoExerciseTemplate: GuidedTemplate = {
  id: 'tpl-2', name: 'Upper', dayLabel: null, difficulty: null,
  exercises: [
    { exercise_id: 'bench', target_sets: 1, target_reps: '8' },
    { exercise_id: 'row', target_sets: 1, target_reps: '10' },
  ],
};

const info = (id: string, name: string, isCompound: boolean): GuidedExerciseInfo => ({
  id, name, nameEs: null, nameEl: null, muscleGroup: 'chest', equipment: 'barbell', isCompound,
});

const twoExerciseInfo: Record<string, GuidedExerciseInfo> = {
  bench: info('bench', 'Bench Press', true), // compound → 150s default
  row: info('row', 'Dumbbell Row', false),   // isolation; override 60s
};

const renderTwoExercises = () => render(
  <GuidedSession userId="user-1" programName="Upper" template={twoExerciseTemplate} exerciseInfo={twoExerciseInfo} onExit={vi.fn()} />,
);

const flushMicrotasks = () => act(async () => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
});

const restLabel = () => screen.getByText(/^(Resting|Rested — go)$/).textContent;

describe('GuidedSession in-flight rest ownership', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-12T00:00:00Z')); });
  afterEach(() => { vi.useRealTimers(); });

  it('keeps the running rest on its originating target through forward/back browsing', async () => {
    // The next row carries a 60s override; the active rest must ignore it.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ row: 60 }));
    renderTwoExercises();

    // Bench is compound → its rest target defaults to 150s.
    expect(checked('150s')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Complete set' }));
    await flushMicrotasks();
    expect(restLabel()).toBe('Resting');

    // 61s elapsed — still short of the originating 150s.
    await act(async () => { vi.advanceTimersByTime(61_000); });
    expect(screen.getByText('1:01')).toBeTruthy();

    // Browse to the next row (target 60s) and let the clock tick again.
    fireEvent.click(screen.getByRole('button', { name: /Next exercise/ }));
    await act(async () => { vi.advanceTimersByTime(500); });

    // Must stay Resting: the 60s row target must NOT retarget the running rest.
    expect(restLabel()).toBe('Resting');
    expect(screen.queryByText('Rested — go')).toBeNull();
    // Elapsed survives the card transition (no flash back to 0:00).
    expect(screen.getByText('1:01')).toBeTruthy();

    // Browse back to the originating exercise and intentionally shorten ITS target.
    fireEvent.click(screen.getByRole('button', { name: /Previous exercise/ }));
    expect(checked('150s')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: '60s' }));
    expect(readStorage()).toEqual({ row: 60, bench: 60 });

    // An intentional change to the ORIGINATING exercise now completes the rest.
    await act(async () => { vi.advanceTimersByTime(1_000); });
    expect(restLabel()).toBe('Rested — go');
  });

  it('leaves the paused session clock at Ready while browsing with no logged set', async () => {
    window.localStorage.clear();
    renderTwoExercises();
    expect(screen.getByText('Ready')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Next exercise/ }));
    fireEvent.click(screen.getByRole('button', { name: /Previous exercise/ }));
    await act(async () => { vi.advanceTimersByTime(5_000); });
    // No set completed → the session clock stays paused (never fabricates elapsed time).
    expect(screen.getByText('Ready')).toBeTruthy();
  });
});
