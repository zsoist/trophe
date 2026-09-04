// @vitest-environment jsdom

import React from 'react';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Exercise } from '@/lib/types';

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
      lang: 'en',
      t: (key: string, params?: Record<string, string | number>) => {
        const source = actual.translations[key]?.en ?? key;
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

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ExerciseInfoSheet', () => {
  it('leads with the movement visual and practical technique guidance', () => {
    const exercise = {
      id: 'bench',
      name: 'Barbell Bench Press',
      name_es: null,
      name_el: null,
      muscle_group: 'chest',
      secondary_muscles: [],
      equipment: 'barbell',
      is_compound: true,
      instructions: 'Plant your feet, brace, and lower the bar with control.',
      instructions_es: null,
      instructions_el: null,
      is_template: true,
      created_by: null,
      created_at: '2026-08-24T00:00:00.000Z',
    } as Exercise;

    render(React.createElement(ExerciseInfoSheet, { exercise, userId: null, onClose: vi.fn() }));

    expect(screen.getByLabelText('Barbell Bench Press technique demonstration')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pause demonstration' })).toBeTruthy();
    expect(screen.queryByText('No exact demo yet')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Technique guidance' })).toBeTruthy();
    expect(screen.getByText(/Plant your feet/)).toBeTruthy();
  });

  it('labels fallback anatomy as a muscle group estimate instead of technique or verified anatomy', () => {
    const exercise = {
      id: 'machine-press',
      name: 'Iso-Lateral Machine Press',
      name_es: null,
      name_el: null,
      muscle_group: 'chest',
      secondary_muscles: ['triceps'],
      equipment: 'machine',
      is_compound: true,
      instructions: 'Press the handles with control.',
      instructions_es: null,
      instructions_el: null,
      is_template: true,
      created_by: null,
      created_at: '2026-08-24T00:00:00.000Z',
    } as Exercise;

    render(React.createElement(ExerciseInfoSheet, { exercise, userId: null, onClose: vi.fn() }));

    expect(screen.getByText('Muscle group estimate')).toBeTruthy();
    expect(screen.queryByText('Anatomy reference')).toBeNull();
    expect(screen.queryByRole('img', { name: /technique/i })).toBeNull();
  });

  it('closes on Escape, locks background scroll, and returns focus on unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const onClose = vi.fn();
    const exercise = {
      id: 'bench',
      name: 'Barbell Bench Press',
      name_es: null,
      name_el: null,
      muscle_group: 'chest',
      secondary_muscles: [],
      equipment: 'barbell',
      is_compound: true,
      instructions: 'Plant your feet and lower the bar with control.',
      instructions_es: null,
      instructions_el: null,
      is_template: true,
      created_by: null,
      created_at: '2026-08-24T00:00:00.000Z',
    } as Exercise;

    const view = render(React.createElement(ExerciseInfoSheet, { exercise, userId: null, onClose }));

    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    view.unmount();
    expect(document.activeElement).toBe(trigger);
    expect(document.body.style.overflow).toBe('');
    trigger.remove();
  });

  it('keeps child focus across callback-identity rerenders and wraps focus in both directions', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const restoreFocus = vi.spyOn(trigger, 'focus');
    const firstClose = vi.fn();
    const latestClose = vi.fn();
    const exercise = {
      id: 'bench', name: 'Barbell Bench Press', name_es: null, name_el: null,
      muscle_group: 'chest', secondary_muscles: [], equipment: 'barbell', is_compound: true,
      instructions: 'Plant your feet and lower the bar with control.', instructions_es: null, instructions_el: null,
      is_template: true, created_by: null, created_at: '2026-08-24T00:00:00.000Z',
    } as Exercise;

    const view = render(React.createElement(ExerciseInfoSheet, { exercise, userId: null, onClose: firstClose }));
    const dialog = screen.getByRole('dialog', { name: 'Barbell Bench Press' });
    const selectedChild = within(dialog).getByRole('button', { name: 'Work phase' });
    selectedChild.focus();

    view.rerender(React.createElement(ExerciseInfoSheet, { exercise, userId: null, onClose: latestClose }));

    expect(document.activeElement).toBe(selectedChild);
    expect(restoreFocus).not.toHaveBeenCalled();
    const focusableButtons = within(dialog).getAllByRole('button').filter((button) => !button.hasAttribute('disabled'));
    const first = focusableButtons[0];
    const last = focusableButtons.at(-1)!;
    first.focus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(firstClose).not.toHaveBeenCalled();
    expect(latestClose).toHaveBeenCalledOnce();
    fireEvent.click(dialog.parentElement!);
    expect(latestClose).toHaveBeenCalledTimes(2);
    view.unmount();
    expect(restoreFocus).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
});
