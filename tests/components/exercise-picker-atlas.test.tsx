// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '@/lib/types';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'whileTap']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div'), p: element('p') },
    useReducedMotion: () => true,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getUser: vi.fn() }, from: vi.fn() },
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        'workout.add_exercise': 'Add exercise',
        'workout.picker_title': 'Add exercise',
        'workout.picker_close': 'Close exercise picker',
        'workout.search_exercises': 'Search all exercises',
        'workout.picker_choose_area': 'What are you training?',
        'workout.picker_choose_area_hint': 'Choose a muscle group to see relevant exercises.',
        'workout.picker_options': '{n} options',
        'workout.picker_back_areas': 'Back to muscle groups',
        'workout.picker_result_title': '{area} exercises',
        'workout.picker_result_count': '{n} exercises',
        'workout.picker_recent': 'Recent',
        'workout.picker_equipment': 'Equipment',
        'workout.picker_all_equipment': 'All equipment',
        'workout.picker_add': 'Add',
        'workout.picker_add_named': 'Add {name}',
        'workout.picker_info_named': 'Exercise info: {name}',
        'workout.picker_custom': 'Create custom exercise',
        'workout.picker_custom_hint': "Can't find it?",
        'workout.picker_selected_one': '{n} exercise selected',
        'workout.picker_selected_many': '{n} exercises selected',
        'workout.picker_review_plan': 'Review plan',
        'workout.picker_exact_poster': 'Exact technique poster',
        'workout.info_primary': 'Primary',
        'workout.compound': 'Compound',
        'workout.body_area_chest': 'Chest',
        'workout.body_area_back': 'Back',
        'workout.body_area_shoulders': 'Shoulders',
        'workout.body_area_arms': 'Arms',
        'workout.body_area_legs': 'Legs',
        'workout.body_area_core': 'Core',
        'workout.body_area_full_body': 'Full body',
        'workout.body_area_cardio': 'Cardio',
        'workout.muscle_chest': 'Chest',
      };
      return Object.entries(params ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        copy[key] ?? key,
      );
    },
  }),
}));

import ExercisePicker from '@/components/workout/ExercisePicker';

const EXERCISES: Exercise[] = [
  {
    id: 'bench',
    name: 'Barbell Bench Press',
    name_es: null,
    name_el: null,
    muscle_group: 'chest',
    secondary_muscles: ['triceps'],
    equipment: 'barbell',
    is_compound: true,
    is_template: true,
    created_by: null,
    created_at: '2026-09-02T00:00:00.000Z',
  },
  {
    id: 'fly',
    name: 'Standing Cable Chest Fly',
    name_es: null,
    name_el: null,
    muscle_group: 'chest',
    secondary_muscles: null,
    equipment: 'cable',
    is_compound: false,
    is_template: true,
    created_by: null,
    created_at: '2026-09-02T00:00:00.000Z',
  },
];

function renderPicker() {
  const onAddToDraft = vi.fn();
  const onReturnToBuild = vi.fn();
  const view = render(<ExercisePicker
    presentation="page"
    exercises={EXERCISES}
    recentIds={['fly']}
    addedExerciseIds={[]}
    onAddToDraft={onAddToDraft}
    onReturnToBuild={onReturnToBuild}
    onSelect={vi.fn()}
    onClose={vi.fn()}
    onInfo={vi.fn()}
    lang="en"
  />);
  return { ...view, onAddToDraft, onReturnToBuild };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('exercise discovery atlas and plan tray', () => {
  it('starts from a selectable atlas without revealing the full exercise catalogue', () => {
    renderPicker();

    expect(screen.getByRole('heading', { name: 'What are you training?' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Muscle activation atlas' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /pectoralis major.*primary muscle/i })).toBeTruthy();
    expect(screen.queryByText('Barbell Bench Press')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /pectoralis major.*primary muscle/i }));
    expect(screen.getByRole('heading', { name: 'Chest exercises' })).toBeTruthy();
  });

  it('uses exact resolver media and labels its coaching role without substituting another movement', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));

    const row = screen.getByTestId('exercise-result-bench');
    const poster = within(row).getByRole('img', { name: /barbell bench press technique poster/i });
    expect(poster.getAttribute('src')).toBe('/workout-v2/exercises/bench-press.webp');
    expect(row.getAttribute('data-media-tier')).toBe('verified-technique');
    expect(within(row).getByText('Exact technique poster')).toBeTruthy();
    expect(within(row).getByText('Primary')).toBeTruthy();
    expect(within(row).getByText('Barbell')).toBeTruthy();
  });

  it('keeps optimistic multi-add selection in a persistent tray and reviews without starting live', () => {
    const { onAddToDraft, onReturnToBuild } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Barbell Bench Press' }));

    expect(onAddToDraft).toHaveBeenCalledWith('bench');
    expect(screen.getByText('1 exercise selected')).toBeTruthy();
    expect(screen.queryByText(/live workout/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Back to muscle groups' }));
    expect(screen.getByRole('heading', { name: 'What are you training?' })).toBeTruthy();
    expect(screen.getByText('1 exercise selected')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Review plan' }));
    expect(onReturnToBuild).toHaveBeenCalledTimes(1);
  });
});
