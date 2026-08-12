// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { ParsedFoodItem } from '@/agents/schemas/food-parse';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const motionOnlyProps = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'whileTap']);
  const motionElement = (tag: 'button' | 'div' | 'p') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !motionOnlyProps.has(key))),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: {
      button: motionElement('button'),
      div: motionElement('div'),
      p: motionElement('p'),
    },
    useReducedMotion: () => true,
  };
});

vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span', { 'aria-hidden': true });
  return {
    AlertTriangle: Icon, Camera: Icon, Check: Icon, CornerDownLeft: Icon,
    Minus: Icon, PencilLine: Icon, Plus: Icon, X: Icon,
  };
});

vi.mock('@/components/ui/AnimatedValue', () => ({
  AnimatedValue: ({ value }: { value: number }) => React.createElement('span', null, String(value)),
}));

vi.mock('@/components/food/ProvenanceRing', () => ({
  ProvenanceRing: () => null,
  resolveTier: () => 'lab_verified',
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        'food.amount_input_aria_with_unit': 'Amount in {unit}',
        'food.confirm_all': 'Log All',
        'food.items_found': '{n} item(s) found',
        'food.remove_item_aria': 'Remove {name}',
        'food.stepper_decrease': 'Decrease amount',
        'food.stepper_increase': 'Increase amount',
        'general.cancel': 'Cancel',
      };
      return Object.entries(params ?? {}).reduce(
        (text, [name, value]) => text.replaceAll(`{${name}}`, String(value)),
        copy[key] ?? key,
      );
    },
  }),
}));

import ParsedFoodList from '@/components/food/ParsedFoodList';

const FETA: ParsedFoodItem = {
  raw_text: '100g feta', food_name: 'Feta cheese', name_localized: 'Feta',
  quantity: 100, unit: 'g', grams: 100, calories: 264, protein_g: 14.2,
  carbs_g: 4.1, fat_g: 21.3, fiber_g: 0, sugar_g: 0, confidence: 0.95,
  source: 'local_db', portion_explicit: true, data_quality: 'lab_verified',
};

afterEach(cleanup);

describe('live portion nutrition preview', () => {
  // Regression: ISSUE-001 — typed gram changes left calories and macros stale until blur.
  // Found by /qa on 2026-08-12.
  // Report: .gstack/qa-reports/qa-report-localhost-2026-08-12.md
  it('scales the visible nutrition while the amount field still has focus', () => {
    const onConfirm = vi.fn();
    render(React.createElement(ParsedFoodList, {
      items: [FETA], onConfirm, onCancel: vi.fn(), logging: false,
    }));

    const input = screen.getByRole('spinbutton', { name: 'Amount in g' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '150' } });

    expect(screen.getByText('396 kcal')).toBeTruthy();
    expect(screen.getByText('P: 21.3g')).toBeTruthy();
    expect(screen.getByText('F: 32g')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Log All (1)' }));
    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ grams: 150, calories: 396, protein_g: 21.3, fat_g: 32 }),
    ]);
  });
});
