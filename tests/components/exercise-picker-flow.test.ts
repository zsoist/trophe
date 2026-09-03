// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Exercise, MuscleGroup } from '@/lib/types';

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
  supabase: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        'workout.add_exercise': 'Add exercise',
        'workout.search_exercises': 'Search all exercises',
        'workout.picker_choose_area': 'What are you training?',
        'workout.picker_choose_area_hint': 'Choose a body area to see relevant exercises.',
        'workout.picker_recent': 'Recent',
        'workout.picker_options': '{n} options',
        'workout.picker_back_areas': 'Back to muscle groups',
        'workout.picker_result_title': '{area} exercises',
        'workout.picker_result_count': '{n} exercises',
        'workout.picker_none': 'No matching exercises',
        'workout.picker_custom': 'Create custom exercise',
        'workout.picker_custom_hint': "Can't find it?",
        'workout.picker_equipment': 'Equipment',
        'workout.picker_all_equipment': 'All equipment',
        'workout.picker_all_area': 'All {area}',
        'workout.picker_add_named': 'Add {name}',
        'workout.picker_add': 'Add',
        'workout.back_to_workout': 'Back to Workout',
        'workout.exercise_count': '{n} exercises',
        'workout.picker_selected_one': '{n} exercise selected',
        'workout.picker_selected_many': '{n} exercises selected',
        'workout.picker_review_plan': 'Review plan',
        'workout.info_primary': 'Primary',
        'workout.picker_info_named': 'Exercise info: {name}',
        'workout.picker_search_results': 'Search results',
        'workout.picker_clear_search': 'Clear search',
        'workout.compound': 'Compound',
        'workout.info_title': 'Exercise information',
        'workout.custom_cancel': 'Cancel',
        'workout.body_area_chest': 'Chest',
        'workout.body_area_back': 'Back',
        'workout.body_area_shoulders': 'Shoulders',
        'workout.body_area_arms': 'Arms',
        'workout.body_area_legs': 'Legs',
        'workout.body_area_core': 'Core',
        'workout.body_area_full_body': 'Full body',
        'workout.body_area_cardio': 'Cardio',
        'workout.muscle_chest': 'Chest',
        'workout.muscle_back': 'Back',
        'workout.muscle_shoulders': 'Shoulders',
        'workout.muscle_biceps': 'Biceps',
        'workout.muscle_triceps': 'Triceps',
        'workout.muscle_forearms': 'Forearms',
        'workout.muscle_quads': 'Quads',
        'workout.muscle_hamstrings': 'Hamstrings',
        'workout.muscle_glutes': 'Glutes',
        'workout.muscle_calves': 'Calves',
        'workout.muscle_core': 'Core',
        'workout.muscle_full_body': 'Full body',
        'workout.muscle_cardio': 'Cardio',
      };
      return Object.entries(params ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        copy[key] ?? key,
      );
    },
  }),
}));

import ExercisePicker from '@/components/workout/ExercisePicker';

function exercise(id: string, name: string, muscle: MuscleGroup, equipment: string, compound = false): Exercise {
  return {
    id,
    name,
    name_es: null,
    name_el: null,
    muscle_group: muscle,
    secondary_muscles: null,
    equipment,
    is_compound: compound,
    is_template: true,
    created_by: null,
    created_at: '2026-08-24T00:00:00.000Z',
  };
}

const EXERCISES = [
  exercise('bench', 'Bench Press', 'chest', 'barbell', true),
  exercise('fly', 'Cable Fly', 'chest', 'cable'),
  exercise('row', 'Barbell Row', 'back', 'barbell', true),
  exercise('curl', 'Dumbbell Curl', 'biceps', 'dumbbell'),
  exercise('pushdown', 'Triceps Pushdown', 'triceps', 'cable'),
  exercise('wrist', 'Wrist Curl', 'forearms', 'barbell'),
  exercise('squat', 'Back Squat', 'quads', 'barbell', true),
  exercise('rdl', 'Romanian Deadlift', 'hamstrings', 'barbell', true),
  exercise('bridge', 'Glute Bridge', 'glutes', 'bodyweight'),
  exercise('raise', 'Calf Raise', 'calves', 'machine'),
  exercise('plank', 'Plank', 'core', 'bodyweight'),
  exercise('burpee', 'Burpee', 'full_body', 'bodyweight'),
  exercise('run', 'Treadmill Run', 'cardio', 'machine'),
];

function renderPicker(overrides: Partial<React.ComponentProps<typeof ExercisePicker>> = {}) {
  const onSelect = vi.fn();
  const onClose = vi.fn();
  const onInfo = vi.fn();
  const view = render(React.createElement(ExercisePicker, {
    exercises: EXERCISES,
    recentIds: ['fly', 'row'],
    onSelect,
    onClose,
    onInfo,
    lang: 'en',
    ...overrides,
  }));
  return { ...view, onSelect, onClose, onInfo };
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('muscle-group-first exercise picker', () => {
  it('moves focus without scrolling routed workout chrome out of view', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderPicker({ presentation: 'page' });

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('keeps routed selection open for multiple additions and returns only from the plan tray', () => {
    const addDraftExercise = vi.fn();
    const returnToBuild = vi.fn();
    const { onClose, onSelect } = renderPicker({
      presentation: 'page',
      onAddToDraft: addDraftExercise,
      onReturnToBuild: returnToBuild,
    } as never);

    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add Bench Press' }));

    expect(addDraftExercise).toHaveBeenCalledWith('bench');
    expect(returnToBuild).not.toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    expect(screen.getByText('1 exercise selected')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review plan' }));
    expect(returnToBuild).toHaveBeenCalledTimes(1);
  });

  it('opens on eight body-area choices instead of the full exercise catalogue', async () => {
    renderPicker();

    expect(screen.getByRole('heading', { name: 'What are you training?' })).toBeTruthy();
    const areaGroup = screen.getByRole('group', { name: 'What are you training?' });
    for (const area of ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body', 'Cardio']) {
      expect(within(areaGroup).getByRole('button', { name: new RegExp(`^${area}`) })).toBeTruthy();
    }
    expect(screen.getByRole('region', { name: 'Muscle activation atlas' })).toBeTruthy();
    expect(screen.queryByText('Bench Press')).toBeNull();
    expect(screen.queryByText(/13 exercises|178 exercises/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(within(areaGroup).getByRole('button', { name: /^Chest/ })));
  });

  it('shows only the chosen body area and uses one explicit add action', () => {
    const { onSelect, onClose } = renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));

    expect(screen.getByRole('heading', { name: 'Chest exercises' })).toBeTruthy();
    expect(screen.getByText('Bench Press')).toBeTruthy();
    expect(screen.getByText('Cable Fly')).toBeTruthy();
    expect(screen.queryByText('Barbell Row')).toBeNull();

    const addBench = screen.getByRole('button', { name: 'Add Bench Press' });
    expect(addBench.textContent).toContain('Add');
    fireEvent.click(addBench);
    expect(onSelect).toHaveBeenCalledWith(EXERCISES[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('groups arm muscles together and progressively reveals specific filters', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Arms/ }));

    expect(screen.getByText('Dumbbell Curl')).toBeTruthy();
    expect(screen.getByText('Triceps Pushdown')).toBeTruthy();
    expect(screen.getByText('Wrist Curl')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Biceps' }));
    expect(screen.getByText('Dumbbell Curl')).toBeTruthy();
    expect(screen.queryByText('Triceps Pushdown')).toBeNull();
    expect(screen.queryByText('Wrist Curl')).toBeNull();
  });

  it('searches the full catalogue without forcing a body-area choice', () => {
    renderPicker();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search all exercises' }), {
      target: { value: 'romanian' },
    });

    expect(screen.getByRole('heading', { name: 'Search results' })).toBeTruthy();
    expect(screen.getByText('Romanian Deadlift')).toBeTruthy();
    expect(screen.queryByText('Bench Press')).toBeNull();
  });

  it('offers equipment filtering only after a body-area choice', () => {
    renderPicker();
    expect(screen.queryByRole('button', { name: /Equipment/ })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Equipment, All equipment' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cable' }));
    expect(screen.getByText('Cable Fly')).toBeTruthy();
    expect(screen.queryByText('Bench Press')).toBeNull();
  });

  it('ranks recent exercises before the rest of the selected area', () => {
    renderPicker({ recentIds: ['fly'] });
    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));

    const addActions = screen.getAllByRole('button').filter((button) => button.getAttribute('aria-label')?.startsWith('Add '));
    expect(addActions.map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add Cable Fly',
      'Add Bench Press',
    ]);
  });

  it('puts workout-relevant body areas first without hiding the others', () => {
    renderPicker({ presetMuscles: ['quads', 'hamstrings'] });
    const areaGroup = screen.getByRole('group', { name: 'What are you training?' });
    const areas = within(areaGroup).getAllByRole('button');
    expect(areas[0].textContent).toContain('Legs');
    expect(within(areaGroup).getByRole('button', { name: /^Chest/ })).toBeTruthy();
  });

  it('returns to body areas and clears search without losing the simple entry state', () => {
    renderPicker();
    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to muscle groups' }));
    expect(screen.getByRole('heading', { name: 'What are you training?' })).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search all exercises' }), {
      target: { value: 'romanian' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(screen.getByRole('heading', { name: 'What are you training?' })).toBeTruthy();
  });

  it('keeps recent exercises as a quiet shortcut and separates info from add', () => {
    const { onInfo, onSelect } = renderPicker();
    const recent = screen.getByRole('region', { name: 'Recent' });
    expect(within(recent).getByRole('button', { name: 'Add Cable Fly' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /^Chest/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Exercise info: Bench Press' }));
    expect(onInfo).toHaveBeenCalledWith(EXERCISES[0]);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('restores focus to the invoking control after Escape closes the picker', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open picker';
    document.body.appendChild(trigger);
    trigger.focus();

    const { onClose, unmount } = renderPicker();
    await waitFor(() => expect(document.activeElement).not.toBe(trigger));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
