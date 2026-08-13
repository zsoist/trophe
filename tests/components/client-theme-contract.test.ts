// @vitest-environment jsdom

import React from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const CLIENT_CORE_SOURCES = [
  'app/dashboard/page.tsx',
  'app/dashboard/log/page.tsx',
  'app/dashboard/progress/page.tsx',
  'app/dashboard/profile/page.tsx',
  'components/meals/MealSlotCard.tsx',
  'components/meals/MealSlotConfig.tsx',
  'components/progress/CustomizeSheet.tsx',
  'components/progress/DayComparison.tsx',
  'components/shared/ThemePicker.tsx',
] as const;

const source = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const appearanceMocks = vi.hoisted(() => ({ setPrefs: vi.fn(), toggleMode: vi.fn() }));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const motionProps = new Set(['animate', 'exit', 'layout', 'transition', 'whileTap']);
  const motionElement = (tag: 'button' | 'div' | 'span') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, initial, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key))),
      'data-initial': JSON.stringify(initial),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      button: motionElement('button'),
      div: motionElement('div'),
      span: motionElement('span'),
    },
    useReducedMotion: () => true,
  };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string) => ({
      'food.skip_meal': 'Skip',
      'appearance.accent_gold': 'Gold',
      'appearance.accent_ember': 'Ember',
      'appearance.accent_jade': 'Jade',
      'appearance.accent_sky': 'Sky',
      'appearance.accent_plum': 'Plum',
      'appearance.accent_rose': 'Rose',
    })[key] ?? key,
  }),
}));

vi.mock('@/lib/trpc/client', () => ({
  trpc: { food: { log: { edit: { useMutation: () => ({ mutateAsync: vi.fn() }) } } } },
}));

vi.mock('@/components/food/QuickFoodInput', () => ({
  default: () => React.createElement('div', { 'data-testid': 'quick-food-input' }),
}));

vi.mock('@/components/shared/AppearanceProvider', () => ({
  useAppearance: () => ({
    prefs: { accent: 'gold', palette: 'classic', density: 'comfortable', panels: {}, panelOrder: [] },
    setPrefs: appearanceMocks.setPrefs,
  }),
}));

vi.mock('@/components/shared/ThemeMode', () => ({
  useThemeMode: () => ({ mode: 'dark', toggleMode: appearanceMocks.toggleMode }),
}));

import MealSlotCard from '@/components/meals/MealSlotCard';
import MealSlotConfig from '@/components/meals/MealSlotConfig';
import ThemePicker from '@/components/shared/ThemePicker';

afterEach(() => cleanup());

describe('client core theme and accessibility contract', () => {
  it('contains no hardcoded dark islands, legacy content tokens, or sub-12px labels', () => {
    const forbidden = [
      /bg-stone-9\d\d/g,
      /text-stone-\d{2,3}/g,
      /(?:bg-red-(?:8|9)\d\d|text-red-[12]\d\d)(?:\/[\d.]+)?/g,
      /(?:bg|border)-white\/(?:\[|\d)/g,
      /rgba\(255,\s*255,\s*255/g,
      /var\(--(?:t[1-6]|line(?:-2)?|bg(?:-1)?)(?:[,\)])/g,
      /fontSize:\s*(?:8|9|10|11)(?:[,}])/g,
      /text-\[(?:9|10|11)px\]/g,
    ];
    const violations = CLIENT_CORE_SOURCES.flatMap((file) => forbidden.flatMap((pattern) =>
      (source(file).match(pattern) ?? []).map((match) => `${file}: ${match}`),
    ));

    expect(violations).toEqual([]);
  });

  it('reserves the bottom navigation safe area on every progress page root', () => {
    const roots = source('app/dashboard/progress/page.tsx').match(/<div(?:\s+[^>]*)?\sclassName="min-h-screen[^"]*"/g) ?? [];
    const unsafeRoots = roots.filter((root) => !/pb-\[calc\([^\]]*env\(safe-area-inset-bottom\)/.test(root));

    expect(roots).toHaveLength(2);
    expect(unsafeRoots).toEqual([]);
  });

  it('separates the habit details action from its Done and Skip buttons', () => {
    const dashboard = source('app/dashboard/page.tsx');
    const habitCard = dashboard.match(/\{activeHabit\?\.habit \? \([\s\S]*?\n        \) : \(/)?.[0] ?? '';
    const detailsAction = habitCard.match(/<button[\s\S]*?onClick=\{\(\) => setShowHabitModal\(true\)\}[\s\S]*?<\/button>/)?.[0] ?? '';
    const roleButtonAncestor = habitCard.match(/<[^>]+role="button"[^>]*>[\s\S]*?<button\b/);
    const nestedNativeButton = (habitCard.match(/<button\b[\s\S]*?<\/button>/g) ?? [])
      .find((button) => (button.match(/<button\b/g) ?? []).length > 1);

    expect(habitCard).not.toBe('');
    expect(roleButtonAncestor).toBeNull();
    expect(nestedNativeButton).toBeUndefined();
    expect(detailsAction).toMatch(/aria-label=\{`View \$\{activeHabit\.habit\.name_en\} details`\}/);
    expect(detailsAction).toMatch(/min-h-11/);
    expect(detailsAction).toMatch(/focus-visible:ring-2/);
    expect(detailsAction).not.toContain('handleCheckin');
    expect(habitCard).toMatch(/onClick=\{e => \{ e\.stopPropagation\(\); handleCheckin\(true\); \}\}/);
    expect(habitCard).toMatch(/onClick=\{e => \{ e\.stopPropagation\(\); handleCheckin\(false\); \}\}/);
  });

  it('keeps mobile form controls at a non-zooming base size throughout the owned inventory', () => {
    const controls = CLIENT_CORE_SOURCES.flatMap((file) =>
      ([
        ...(source(file).match(/<(?:input|textarea)\b[\s\S]*?\/>/g) ?? []),
        ...(source(file).match(/<select\b[\s\S]*?<\/select>/g) ?? []),
      ])
        .map((element) => ({ file, element })),
    );
    const undersized = controls.filter(({ element }) =>
      !/className="[^"]*text-base/.test(element) && !/fontSize:\s*(?:1[6-9]|[2-9]\d)/.test(element),
    );

    expect(controls.length).toBeGreaterThan(0);
    expect(undersized.map(({ file, element }) => `${file}: ${element.slice(0, 80)}`)).toEqual([]);
  });

  it('does not activate the empty meal input when Skip receives keyboard input', () => {
    const onSkip = vi.fn();
    render(React.createElement(MealSlotCard, {
      slot: { id: 'breakfast', mealType: 'breakfast', label: 'Breakfast', icon: 'i-sun', order: 0 },
      entries: [], userId: 'user', date: '2026-08-12', skipped: false, locked: false,
      favorites: [], onLogged: vi.fn(), onSkip, onUndoSkip: vi.fn(), onLock: vi.fn(),
      onUnlock: vi.fn(), onDeleteEntry: vi.fn(), onToggleFavorite: vi.fn(),
    }));

    const skip = screen.getByRole('button', { name: 'Skip' });
    fireEvent.keyDown(skip, { key: 'Enter' });

    expect(screen.queryByTestId('quick-food-input')).toBeNull();
  });

  it('reorders meal slots from a keyboard-operable 44px drag control', () => {
    const onSave = vi.fn();
    render(React.createElement(MealSlotConfig, {
      slots: [
        { id: 'breakfast', mealType: 'breakfast', label: 'Breakfast', emoji: 'A', order: 0 },
        { id: 'lunch', mealType: 'lunch', label: 'Lunch', emoji: 'B', order: 1 },
      ],
      onSave,
      onClose: vi.fn(),
    }));

    const reorder = screen.getByRole('button', { name: 'Reorder Breakfast' });
    expect(reorder.className).toContain('min-h-11');
    expect(reorder.className).toContain('min-w-11');
    fireEvent.keyDown(reorder, { key: 'ArrowDown' });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave.mock.calls[0][0].map((slot: { id: string }) => slot.id)).toEqual(['lunch', 'breakfast']);
  });

  it('renders appearance as a reduced-motion modal with explicit selected states and safe targets', () => {
    render(React.createElement(ThemePicker, { onClose: vi.fn() }));

    const dialog = screen.getByRole('dialog', { name: 'Appearance' });
    expect(dialog.getAttribute('data-initial')).toContain('opacity');
    expect(dialog.getAttribute('data-initial')).not.toContain('100%');
    expect(screen.getByRole('button', { name: 'Dark mode' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(appearanceMocks.toggleMode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Done' }).className).toContain('min-h-11');
    expect(screen.getByRole('button', { name: 'Gold' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Ember' }));
    expect(appearanceMocks.setPrefs).toHaveBeenCalledWith(expect.objectContaining({
      accent: 'ember', palette: 'classic', density: 'comfortable',
    }));
  });
});
