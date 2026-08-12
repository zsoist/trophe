// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import React from 'react';
import type { ParsedFoodItem } from '@/agents/schemas/food-parse';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const motionOnlyProps = new Set([
    'animate', 'exit', 'initial', 'layout', 'transition', 'whileTap',
  ]);
  const motionElement = (tag: 'button' | 'div' | 'p') => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => {
      const domProps = Object.fromEntries(
        Object.entries(props).filter(([key]) => !motionOnlyProps.has(key)),
      );
      return ReactModule.createElement(tag, { ...domProps, ref }, children as React.ReactNode);
    },
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
    AlertTriangle: Icon,
    Camera: Icon,
    Check: Icon,
    CornerDownLeft: Icon,
    Minus: Icon,
    PencilLine: Icon,
    Plus: Icon,
    X: Icon,
  };
});

vi.mock('@/components/ui/AnimatedValue', () => ({
  AnimatedValue: ({ value, decimals = 0 }: { value: number; decimals?: number }) => (
    React.createElement('span', null, value.toFixed(decimals))
  ),
}));

vi.mock('@/components/food/ProvenanceRing', () => ({
  ProvenanceRing: () => null,
  resolveTier: () => 'estimated',
}));

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    lang: 'en',
    t: (key: string, params?: Record<string, string | number>) => {
      const copy: Record<string, string> = {
        'food.amount_input_aria': 'Food amount',
        'food.amount_input_aria_with_unit': 'Amount in {unit}',
        'food.confirm_all': 'Log All',
        'food.enter_amount': 'Enter amount',
        'food.estimated_portion_count': '{n} estimated portion(s)',
        'food.items_found': '{n} item(s) found',
        'food.portion_large': 'Large',
        'food.portion_medium': 'Medium',
        'food.portion_gram_equivalence': '{amount} {unit} ≈ {grams} g',
        'food.portion_small': 'Small',
        'food.remove_item_aria': 'Remove {name}',
        'food.stepper_decrease': 'Decrease amount',
        'food.stepper_increase': 'Increase amount',
        'food.unit.bowl_one': 'bowl',
        'food.unit.bowl_other': 'bowls',
        'food.unit.serving_one': 'serving',
        'food.unit.serving_other': 'servings',
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

const AJIACO: ParsedFoodItem = {
  raw_text: 'ajiaco santafereño',
  food_name: 'ajiaco santafereño',
  name_localized: 'ajiaco santafereño',
  quantity: 1,
  unit: 'bowl',
  grams: 550,
  calories: 385,
  protein_g: 24.8,
  carbs_g: 44,
  fat_g: 13.8,
  fiber_g: 7.8,
  sugar_g: 0,
  confidence: 0.72,
  source: 'ai_estimate',
  portion_explicit: true,
};

const QUESTION = 'What portion size of ajiaco did you have (for example, a bowl or grams)?';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderAjiaco(onConfirm = vi.fn()) {
  render(React.createElement(ParsedFoodList, {
    items: [AJIACO],
    clarificationQuestion: QUESTION,
    onConfirm,
    onCancel: vi.fn(),
    logging: false,
  }));
  return onConfirm;
}

describe('ajiaco soup portion review', () => {
  it('offers bowl-sized choices and confirms the selected small bowl amount', () => {
    const onConfirm = renderAjiaco();
    const input = screen.getByRole('spinbutton', { name: 'Amount in bowl' }) as HTMLInputElement;

    expect(input.value).toBe('1');
    expect(screen.getByRole('button', { name: 'Remove ajiaco santafereño' })).toBeTruthy();
    expect(screen.getByText(QUESTION)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Small/ }));
    expect(screen.queryByText(QUESTION)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log All (1)' }));

    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ grams: 385, quantity: 0.7, portion_explicit: true }),
    ]);
  });

  it('accepts an exact decimal bowl amount instead of forcing grams', () => {
    const onConfirm = renderAjiaco();
    const input = screen.getByRole('spinbutton', { name: 'Amount in bowl' }) as HTMLInputElement;

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: '1.25' } });
    fireEvent.blur(input);

    expect(input.value).toBe('1.25');
    expect(screen.queryByText(QUESTION)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Log All (1)' }));

    expect(onConfirm).toHaveBeenCalledWith([
      expect.objectContaining({ grams: 687.5, quantity: 1.25, portion_explicit: true }),
    ]);
  });

  it('explains bowl amounts and every size choice with gram equivalents', () => {
    renderAjiaco();

    expect(screen.getByText('1 bowl ≈ 550 g')).toBeTruthy();
    expect(screen.getByText('0.7 bowls · 385 g')).toBeTruthy();
    expect(screen.getByText('1 bowl · 550 g')).toBeTruthy();
    expect(screen.getByText('1.4 bowls · 770 g')).toBeTruthy();
  });

  it('explains a generic serving with its gram anchor', () => {
    render(React.createElement(ParsedFoodList, {
      items: [{ ...AJIACO, unit: 'serving' }],
      clarificationQuestion: QUESTION,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      logging: false,
    }));

    expect(screen.getByText('1 serving ≈ 550 g')).toBeTruthy();
  });

  it('keeps the fixed save bar outside transformed meal-card ancestors on iPhone', () => {
    const { unmount } = render(React.createElement(
      'div',
      { 'data-testid': 'transformed-meal', style: { transform: 'translateY(0)' } },
      React.createElement(ParsedFoodList, {
        items: [AJIACO],
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
        logging: false,
      }),
    ));

    const transformedMeal = screen.getByTestId('transformed-meal');
    const saveShell = document.body.querySelector('.portion-review-save-shell');

    expect(saveShell).not.toBeNull();
    expect(transformedMeal.contains(saveShell)).toBe(false);

    unmount();
    expect(document.body.querySelector('.portion-review-save-shell')).toBeNull();
  });

  it('tracks the rendered fixed bar height so translated notes cannot cover the last item', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: 194,
      height: 194,
      left: 0,
      right: 320,
      top: 0,
      width: 320,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });

    class ResizeObserverMock {
      constructor(private readonly callback: ResizeObserverCallback) {}
      observe(target: Element) {
        this.callback([{
          target,
          // Deliberately smaller than the rendered border box. The component
          // must include the save bar's padding and border in its inset.
          contentRect: { height: 170 } as DOMRectReadOnly,
          borderBoxSize: [] as unknown as ResizeObserverSize[],
          contentBoxSize: [] as unknown as ResizeObserverSize[],
          devicePixelContentBoxSize: [] as unknown as ResizeObserverSize[],
        }], this as unknown as ResizeObserver);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);

    const { container } = render(React.createElement(ParsedFoodList, {
      items: [{ ...AJIACO, calories: 400, protein_g: 2, carbs_g: 80 }],
      clarificationQuestion: QUESTION,
      onConfirm: vi.fn(),
      onCancel: vi.fn(),
      logging: false,
    }));

    expect((container.querySelector('.portion-review-list') as HTMLElement).style.paddingBottom)
      .toBe('206px');
  });
});
