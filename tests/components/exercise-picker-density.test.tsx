// @vitest-environment jsdom

/**
 * Final picker polish regressions (Add Exercise sheet density).
 *
 * These assert the user-visible counterexamples from the approved delta:
 * typed search text is never under the icon, the results header is one compact
 * utility row that still carries the live count and the equipment filter, the
 * category rail keeps horizontal scrolling without a gray scrollbar band, and
 * a result row stays dense (64px thumbnail, 44px add) with quiet provenance.
 */

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import postcss from 'postcss';
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

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const imageProps = { ...props };
    delete imageProps.priority;
    return React.createElement('img', imageProps);
  },
}));

vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getUser: vi.fn() }, from: vi.fn() } }));

vi.mock('@/lib/i18n', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/i18n')>();
  return {
    ...actual,
    useI18n: () => ({
      lang: 'en',
      t: (key: string, params?: Record<string, string | number>) => {
        const source = actual.translations[key]?.en ?? key;
        return Object.entries(params ?? {}).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
          source,
        );
      },
    }),
  };
});

import ExercisePicker from '@/components/workout/ExercisePicker';

const EXERCISES: Exercise[] = [
  {
    id: 'bench',
    name: 'Barbell Bench Press',
    name_es: null,
    name_el: null,
    muscle_group: 'chest',
    secondary_muscles: null,
    equipment: 'barbell',
    is_compound: true,
    is_template: true,
    created_by: null,
    created_at: '2026-09-02T00:00:00.000Z',
  },
  {
    id: 'fly',
    name: 'Cable Fly',
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

const css = readFileSync(join(process.cwd(), 'components/workout/workout-exploration-v2.css'), 'utf8');
const cssRoot = postcss.parse(css);

function declarationsFor(selector: string, property: string): string[] {
  const values: string[] = [];
  cssRoot.walkRules((rule) => {
    if (rule.selectors.includes(selector)) {
      rule.walkDecls(property, (declaration) => { values.push(declaration.value); });
    }
  });
  return values;
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

describe('final picker density polish', () => {
  it('reserves 48px for a 22px/16px inset search icon so typed text never sits under it', () => {
    render(<ExercisePicker exercises={EXERCISES} recentIds={[]} onSelect={vi.fn()} onClose={vi.fn()} lang="en" />);

    const input = screen.getByRole('searchbox', { name: 'Search exercises...' });
    expect(input.classList.contains('workout-picker-search__input')).toBe(true);

    const wrapper = input.closest('.workout-picker-search');
    expect(wrapper).toBeTruthy();
    const icon = wrapper?.querySelector('.workout-picker-search__icon');
    expect(icon?.classList.contains('lucide-search')).toBe(true);
    expect(icon?.getAttribute('width')).toBe('22');
    expect(icon?.getAttribute('aria-hidden')).toBe('true');

    // The dedicated rule must beat the shared `.input-dark` padding in both themes.
    const padding = declarationsFor('.wk2 .workout-picker-search .workout-picker-search__input.input-dark', 'padding-inline-start');
    expect(padding).toContain('48px');
    expect(declarationsFor('.wk2 .workout-picker-search__icon', 'left')).toContain('16px');
    expect(declarationsFor('.wk2 .workout-picker-search__icon', 'width')).toContain('22px');

    fireEvent.change(input, { target: { value: 'cable' } });
    expect((input as HTMLInputElement).value).toBe('cable');
  });

  it('combines title, live count and equipment filter into one 48px utility row', () => {
    const { container } = render(
      <ExercisePicker
        presentation="page"
        exercises={EXERCISES}
        recentIds={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onAddToDraft={vi.fn()}
        onReturnToBuild={vi.fn()}
        lang="en"
      />,
    );

    fireEvent.click(within(screen.getByRole('group', { name: 'What are you training?' })).getByRole('button', { name: /^Chest/ }));

    const utility = container.querySelector('.workout-picker-utility');
    expect(utility).toBeTruthy();
    expect(within(utility as HTMLElement).getByRole('heading', { name: 'Chest exercises' })).toBeTruthy();
    expect(within(utility as HTMLElement).getByText('2 exercises')).toBeTruthy();
    expect(within(utility as HTMLElement).getByRole('button', { name: 'Equipment, All equipment' })).toBeTruthy();
    // The uppercase eyebrow is gone; the label survives as the accessible name.
    expect((utility as HTMLElement).querySelector('.equipment-filter__label')).toBeNull();

    expect(declarationsFor('.wk2 .workout-picker-utility', 'min-height')).toContain('48px');
  });

  it('keeps the live category rail horizontally scrollable without a gray scrollbar band', () => {
    render(
      <ExercisePicker
        exercises={EXERCISES}
        recentIds={[]}
        liveSession
        onSelect={vi.fn()}
        onClose={vi.fn()}
        lang="en"
      />,
    );

    const rail = document.querySelector('.workout-live-picker__groups');
    expect(rail).toBeTruthy();
    expect(rail?.querySelectorAll('button').length).toBeGreaterThan(1);
    expect(within(rail as HTMLElement).getByRole('button', { name: 'All' })).toBeTruthy();

    expect(declarationsFor('.workout-live-picker__groups', 'overflow-x')).toContain('auto');
    expect(declarationsFor('.workout-live-picker__groups::-webkit-scrollbar', 'height')).toContain('4px');
    expect(declarationsFor('.workout-live-picker__groups::-webkit-scrollbar-track', 'background')).toContain('transparent');
  });

  it('renders a 64px thumbnail with a 44px add control and quiet provenance detail', () => {
    const { container } = render(
      <ExercisePicker
        presentation="page"
        exercises={EXERCISES}
        recentIds={[]}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onAddToDraft={vi.fn()}
        onReturnToBuild={vi.fn()}
        lang="en"
      />,
    );
    fireEvent.click(within(screen.getByRole('group', { name: 'What are you training?' })).getByRole('button', { name: /^Chest/ }));

    const row = screen.getByTestId('exercise-result-bench');
    const poster = row.querySelector('img');
    expect(poster?.getAttribute('width')).toBe('64');
    expect(poster?.getAttribute('height')).toBe('64');
    expect(poster?.classList.contains('h-16')).toBe(true);

    const add = within(row).getByRole('button', { name: 'Add Barbell Bench Press' });
    expect(add.classList.contains('min-h-11')).toBe(true);
    expect(add.classList.contains('min-w-11')).toBe(true);

    // Secondary detail stays truthful: equipment + primary muscle + provenance label.
    expect(within(row).getByText('Barbell')).toBeTruthy();
    expect(within(row).getByText('Primary: Chest')).toBeTruthy();
    expect(row.querySelector('.exercise-media-badge')).toBeTruthy();

    expect(declarationsFor('.wk2 .exercise-results .exercise-media-badge', 'text-transform')).toContain('none');
    expect(declarationsFor('.wk2.exercise-results > article', 'min-height')).toContain('4.5rem');
    expect(container.querySelectorAll('[data-testid^="exercise-result-"]').length).toBe(2);
  });
});
