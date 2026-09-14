// @vitest-environment jsdom

// Regression: volume rows other than millilitres (l / cl / dl / fl oz) were
// edited on a hard-coded "50 millilitres" step and displayed with integer
// rounding. A half-litre row therefore rendered as "1 l" and one tap of the
// stepper moved the portion by 50 × (grams per display unit) — 50 litres for a
// litre row — which clamped straight to the 5 g floor (or the 15 kg ceiling).
// A 30 ml cola whose grams came back inflated could be driven to the 15 kg /
// 6300 kcal ceiling the same way.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';

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
    motion: { button: motionElement('button'), div: motionElement('div'), p: motionElement('p') },
    useReducedMotion: () => true,
  };
});

vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span', { 'aria-hidden': true });
  return { AlertTriangle: Icon, Camera: Icon, Check: Icon, CornerDownLeft: Icon, Minus: Icon, PencilLine: Icon, Plus: Icon, X: Icon };
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

import ParsedFoodList, { getDisplayQuantity } from '@/components/food/ParsedFoodList';
import type { ParsedFoodItem } from '@/agents/schemas/food-parse';

function volumeItem(unit: string, quantity: number, grams: number, calories: number): ParsedFoodItem {
  return {
    raw_text: `${quantity} ${unit} cola`, food_name: 'Cola', name_localized: 'Cola',
    quantity, unit, grams, calories, protein_g: 0, carbs_g: 12, fat_g: 0,
    fiber_g: 0, sugar_g: 12, confidence: 0.9, source: 'local_db', portion_explicit: true,
  };
}

function renderItem(item: ParsedFoodItem, onConfirm = vi.fn()) {
  render(React.createElement(ParsedFoodList, {
    items: [item], onConfirm, onCancel: vi.fn(), logging: false, showCalories: true,
  }));
  return onConfirm;
}

afterEach(cleanup);

describe('volume portion rows keep their own unit scale', () => {
  it('displays sub-unit volumes instead of rounding them up', () => {
    expect(getDisplayQuantity(volumeItem('l', 0.5, 500, 210))).toBe(0.5);
    expect(getDisplayQuantity(volumeItem('l', 0.33, 330, 138))).toBe(0.33);
    expect(getDisplayQuantity(volumeItem('ml', 450, 464, 186))).toBe(450);
  });

  it('shows a half-litre entry as 0.5 l, not 1 l', () => {
    renderItem(volumeItem('l', 0.5, 500, 210));
    const input = screen.getByRole('spinbutton', { name: 'Amount in l' }) as HTMLInputElement;
    expect(input.value).toBe('0.5');
  });

  // Regression: volume rows legitimately accept fractional amounts (0.5 l,
  // 0.33 l) but shipped `inputMode="numeric"`, which opens a digits-only mobile
  // keyboard with no decimal separator — the value could be displayed but never
  // re-typed. Volume rows must request the decimal keyboard; gram rows (which
  // only accept whole grams) stay numeric.
  it('requests the decimal keyboard for a fractional volume row', () => {
    renderItem(volumeItem('l', 0.5, 500, 210));
    const input = screen.getByRole('spinbutton', { name: 'Amount in l' }) as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('decimal');
  });

  it('keeps the numeric keyboard for whole-gram rows (non-volume behaviour)', () => {
    renderItem({
      raw_text: '150 g rice', food_name: 'Rice', name_localized: 'Rice',
      quantity: 150, unit: 'g', grams: 150, calories: 195, protein_g: 4,
      carbs_g: 43, fat_g: 0.4, fiber_g: 0.6, sugar_g: 0.1,
      confidence: 0.9, source: 'local_db', portion_explicit: true,
    });
    const input = screen.getByRole('spinbutton', { name: 'Amount in g' }) as HTMLInputElement;
    expect(input.getAttribute('inputmode')).toBe('numeric');
  });

  it.each([
    ['l', 0.5, 500, 210, 450],
    ['cl', 30, 300, 126, 250],
    ['ml', 300, 300, 126, 250],
  ])('steps a %s row by a sane ~50 ml and never collapses it', (unit, quantity, grams, calories, expectedGrams) => {
    const onConfirm = renderItem(volumeItem(unit, quantity, grams, calories));
    fireEvent.click(screen.getByRole('button', { name: 'Decrease amount' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log All (1)' }));

    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ grams: expectedGrams }),
    ]);
  });
});
