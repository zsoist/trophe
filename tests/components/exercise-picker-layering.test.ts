// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/image', () => ({
  default: ({ priority: _priority, ...props }: Record<string, unknown>) => React.createElement('img', props),
}));

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

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() }, from: vi.fn() } }));
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string) => ({
      'workout.add_exercise': 'Add exercise',
      'workout.picker_close': 'Close exercise picker',
      'workout.picker_title': 'Add exercise',
      'workout.search_exercises': 'Search exercises',
      'workout.picker_choose_area': 'What are you training?',
      'workout.picker_choose_area_hint': 'Choose a body area.',
      'workout.picker_recent': 'Recent',
      'workout.picker_custom': 'Create custom exercise',
      'workout.picker_custom_hint': "Can't find it?",
      'workout.body_area_chest': 'Chest',
      'workout.body_area_back': 'Back',
      'workout.body_area_shoulders': 'Shoulders',
      'workout.body_area_arms': 'Arms',
      'workout.body_area_legs': 'Legs',
      'workout.body_area_core': 'Core',
      'workout.body_area_full_body': 'Full body',
      'workout.body_area_cardio': 'Cardio',
    }[key] ?? key),
  }),
}));

import ExercisePicker from '@/components/workout/ExercisePicker';

function renderPicker(presentation: 'dialog' | 'page' = 'dialog') {
  return render(React.createElement(ExercisePicker, {
    presentation,
    exercises: [],
    recentIds: [],
    onSelect: vi.fn(),
    onClose: vi.fn(),
    lang: 'en',
  }));
}

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 1; });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  document.body.style.overflow = '';
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = '';
});

describe('exercise picker presentation layering', () => {
  it('renders dialog presentation as an accessible body-level modal', () => {
    const { container } = renderPicker();
    const dialog = screen.getByRole('dialog', { name: 'Add exercise' });

    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.body.contains(dialog)).toBe(true);
    expect(container.contains(dialog)).toBe(false);
  });

  it('locks scrolling only while dialog presentation is mounted', () => {
    const view = renderPicker();
    expect(document.body.style.overflow).toBe('hidden');

    view.unmount();
    expect(document.body.style.overflow).toBe('');
  });

  it('renders route presentation inline without modal or scroll-lock semantics', () => {
    const { container } = renderPicker('page');

    expect(screen.queryByRole('dialog', { name: 'Add exercise' })).toBeNull();
    expect(container.textContent).toContain('What are you training?');
    expect(document.body.style.overflow).toBe('');
  });

  it('reserves the fixed primary-navigation height for the routed return action', () => {
    render(React.createElement(ExercisePicker, {
      presentation: 'page',
      exercises: [],
      recentIds: [],
      onSelect: vi.fn(),
      onClose: vi.fn(),
      onReturnToBuild: vi.fn(),
      lang: 'en',
    }));

    const returnBar = document.querySelector('[data-exercise-picker-return-bar]');
    expect(returnBar?.className).toContain('exercise-picker__return-bar');
    expect(returnBar?.querySelector('button')?.className).toContain('text-[var(--action-on-primary)]');
    expect(readFileSync('app/globals.css', 'utf8')).toContain('var(--client-shell-nav-base-height, 4.5rem)');
  });
});
