// @vitest-environment jsdom

// Regression: ISSUE — the meal-card quantity field coerced every keystroke with
// `parseFloat(value) || 1`, so a client could never type a portion below 1
// (typing "0" snapped the field to "1") and clearing the field silently became
// 1. The draft is now kept verbatim and validated on save.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    clear: () => values.clear(),
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  } satisfies Storage);
});

const mutate = vi.hoisted(() => vi.fn(async () => ({})));

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const motionProps = new Set(['animate', 'exit', 'layout', 'transition', 'whileTap']);
  const motionElement = (tag: 'button' | 'div' | 'span') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key))),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: motionElement('button'), div: motionElement('div'), span: motionElement('span') },
    useReducedMotion: () => true,
  };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) => Object.entries(params ?? {})
      .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), ({
        'food.edit.quantity_aria': 'Quantity in {unit}',
        'food.edit.saveQuantity': 'Save quantity',
        'food.edit.invalid': 'Check the edited values before saving',
        'food.edit.failed': 'This edit was not saved — try again',
        'general.cancel': 'Cancel',
      } as Record<string, string>)[key] ?? key),
  }),
}));

vi.mock('@/lib/trpc/client', () => ({
  trpc: { food: { log: { edit: { useMutation: () => ({ mutateAsync: mutate }) } } } },
}));

vi.mock('@/components/food/QuickFoodInput', () => ({
  default: () => React.createElement('div', { 'data-testid': 'quick-food-input' }),
}));

import MealSlotCard from '@/components/meals/MealSlotCard';
import type { FoodLogEntry } from '@/lib/types';

const ENTRY = {
  id: 'entry-1', user_id: 'user', logged_date: '2026-08-12', meal_type: 'breakfast',
  food_name: 'Oats', quantity: 2, unit: 'serving', calories: 300, protein_g: 10,
  carbs_g: 50, fat_g: 8, fiber_g: 4, sugar_g: 6, source: 'natural_language',
  created_at: '2026-08-12T08:00:00.000Z',
} as unknown as FoodLogEntry;

function renderCard() {
  render(React.createElement(MealSlotCard, {
    slot: { id: 'breakfast', mealType: 'breakfast', label: 'Breakfast', icon: 'i-sun', order: 0 },
    entries: [ENTRY], userId: 'user', date: '2026-08-12', skipped: false, locked: false,
    favorites: [], onLogged: vi.fn(), onSkip: vi.fn(), onUndoSkip: vi.fn(),
    onLock: vi.fn(), onUnlock: vi.fn(), onDeleteEntry: vi.fn(), onToggleFavorite: vi.fn(),
  }));
}

function openQuantityEditor() {
  fireEvent.click(screen.getByRole('button', { name: /Breakfast/ }));
  fireEvent.click(screen.getByText('Oats'));
  const input = screen.getByRole('spinbutton', { name: 'Quantity in serving' }) as HTMLInputElement;
  return input;
}

afterEach(() => { cleanup(); mutate.mockClear(); });

describe('meal-card quantity editing', () => {
  it('lets a client enter a fractional portion below one', () => {
    renderCard();
    const input = openQuantityEditor();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.change(input, { target: { value: '0.5' } });

    expect(input.value).toBe('0.5');
    fireEvent.click(screen.getByRole('button', { name: 'Save quantity' }));
    expect(mutate).toHaveBeenCalledWith({ entryId: 'entry-1', quantity: 0.5 });
  });

  it('refuses to save an empty quantity instead of silently logging 1', () => {
    renderCard();
    const input = openQuantityEditor();

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save quantity' }));

    expect(mutate).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toBe('Check the edited values before saving');
  });
});
