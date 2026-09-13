// @vitest-environment jsdom

// Regression: the portion-review save bar left Cancel live while a save was in
// flight. Tapping it reset the review and dismissed the list, yet the insert had
// already been sent — the entry logged anyway and a success card popped up over an
// empty screen. Cancel must be disabled until the save settles.

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ParsedFoodItem } from '@/agents/schemas/food-parse';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'transition', 'whileTap']);
  const element = (tag: 'button' | 'div' | 'p') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
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
  useI18n: () => ({ lang: 'en', t: (key: string) => ({ 'general.cancel': 'Cancel' } as Record<string, string>)[key] ?? key }),
}));

import ParsedFoodList from '@/components/food/ParsedFoodList';

const FETA: ParsedFoodItem = {
  raw_text: '100g feta', food_name: 'Feta cheese', name_localized: 'Feta',
  quantity: 100, unit: 'g', grams: 100, calories: 264, protein_g: 14.2,
  carbs_g: 4.1, fat_g: 21.3, fiber_g: 0, sugar_g: 0, confidence: 0.95,
  source: 'local_db', portion_explicit: true, data_quality: 'lab_verified',
};

afterEach(cleanup);

describe('portion-review cancel during save', () => {
  it('disables Cancel while the save is in flight', () => {
    render(React.createElement(ParsedFoodList, {
      items: [FETA], onConfirm: vi.fn(), onCancel: vi.fn(), logging: true,
    }));
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps Cancel available when no save is running', () => {
    render(React.createElement(ParsedFoodList, {
      items: [FETA], onConfirm: vi.fn(), onCancel: vi.fn(), logging: false,
    }));
    expect((screen.getByRole('button', { name: 'Cancel' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
