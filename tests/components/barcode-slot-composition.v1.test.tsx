// @vitest-environment jsdom

// Focal DS2 composition regression: BarcodeLookupModal's direct inserts must
// persist an explicit `meal_slot` that is consistent with `meal_type`.
//
// Contract (lib/food/meal-slot.ts): every log carries the slot the user tapped.
// The barcode modal:
//   • stamps the context default slot into EVERY direct insert (product + manual
//     label) as `meal_slot`;
//   • defaults to the explicit `defaultMealSlot` when it is consistent with the
//     coarse `defaultMealType`, else to that coarse meal type;
//   • re-derives a consistent slot when the user picks another coarse meal —
//     the coarse "Snack" option stores the generic `'snack'`, never an invented
//     AM/PM;
//   • resets the consistent defaults when the modal is reopened / its context
//     changes, so a later log can't inherit the previous context's slot;
//   • never writes a `meal_type`/`meal_slot` mismatch.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { mealSlotMatchesMealType, type CanonicalMealSlot } from '@/lib/food/meal-slot';
import type { MealType } from '@/lib/types';

vi.mock('framer-motion', async () => {
  const ReactModule = await import('react');
  const ignored = new Set(['animate', 'exit', 'initial', 'layout', 'layoutId', 'transition', 'whileTap']);
  const element = (tag: string) => ReactModule.forwardRef<HTMLElement, Record<string, unknown>>(
    ({ children, ...props }, ref) => ReactModule.createElement(tag, {
      ...Object.fromEntries(Object.entries(props).filter(([key]) => !ignored.has(key))),
      ref,
    }, children as React.ReactNode),
  );
  return {
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    motion: { button: element('button'), div: element('div'), p: element('p'), span: element('span') },
    useReducedMotion: () => true,
  };
});

vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span', { 'aria-hidden': true });
  return { Barcode: Icon, Camera: Icon, ChevronLeft: Icon, Keyboard: Icon, Loader2: Icon, RotateCcw: Icon, X: Icon };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ lang: 'en', t: (key: string) => key }),
}));

interface InsertPayload {
  meal_type: MealType;
  meal_slot: CanonicalMealSlot;
  [key: string]: unknown;
}
const hoisted = vi.hoisted(() => ({ inserts: [] as InsertPayload[] }));

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      insert: (payload: InsertPayload) => {
        hoisted.inserts.push(payload);
        return { select: () => ({ maybeSingle: async () => ({ data: { id: 'x' }, error: null }) }) };
      },
    }),
  },
}));

import BarcodeLookupModal from '@/components/food/BarcodeLookupModal';

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body };
}

const VALID_PRODUCT = {
  found: true, name: 'Test Yogurt', brand: 'Brand', barcode: '8412345678905',
  source: 'off',
  per100g: { kcal: 60, protein: 4, carbs: 5, fat: 2, fiber: null, sugar: null },
};

function renderModal(overrides: Record<string, unknown> = {}) {
  const props = {
    userId: 'user-1', selectedDate: '2026-08-12', isOpen: true,
    onClose: vi.fn(), onLogged: vi.fn(), ...overrides,
  };
  const view = render(React.createElement(BarcodeLookupModal, props));
  return { ...view, props };
}

async function typeAndLookup(code: string) {
  fireEvent.click(screen.getByRole('button', { name: /barcode\.input/ }));
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: code } });
  fireEvent.keyDown(input, { key: 'Enter' });
}

function lastInsert(): InsertPayload {
  const payload = hoisted.inserts.at(-1);
  if (!payload) throw new Error('no insert captured');
  return payload;
}

beforeEach(() => {
  hoisted.inserts.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BarcodeLookupModal meal_slot composition', () => {
  it('stamps the explicit context slot into a barcode direct insert', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VALID_PRODUCT));
    renderModal({ defaultMealType: 'snack', defaultMealSlot: 'snack_am' });
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /barcode\.add_to_log/ }));
    await waitFor(() => expect(hoisted.inserts).toHaveLength(1));

    const payload = lastInsert();
    expect(payload.meal_type).toBe('snack');
    expect(payload.meal_slot).toBe('snack_am');
    expect(mealSlotMatchesMealType(payload.meal_slot, payload.meal_type)).toBe(true);
  });

  it('updates the slot consistently when the user picks another coarse meal', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VALID_PRODUCT));
    renderModal({ defaultMealType: 'snack', defaultMealSlot: 'snack_pm' });
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'food.lunch' }));
    fireEvent.click(screen.getByRole('button', { name: /barcode\.add_to_log/ }));
    await waitFor(() => expect(hoisted.inserts).toHaveLength(1));

    const payload = lastInsert();
    expect(payload.meal_type).toBe('lunch');
    expect(payload.meal_slot).toBe('lunch');
    expect(mealSlotMatchesMealType(payload.meal_slot, payload.meal_type)).toBe(true);
  });

  it('stores the generic snack — never an invented AM/PM — when the coarse Snack option is chosen', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VALID_PRODUCT));
    renderModal({ defaultMealType: 'snack', defaultMealSlot: 'snack_am' });
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'food.snack' }));
    fireEvent.click(screen.getByRole('button', { name: /barcode\.add_to_log/ }));
    await waitFor(() => expect(hoisted.inserts).toHaveLength(1));

    expect(lastInsert().meal_slot).toBe('snack');
  });

  it('carries the slot into the manual-label insert too', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { found: false, error: 'Not found in Open Food Facts' }));
    renderModal({ defaultMealType: 'dinner', defaultMealSlot: 'dinner' });
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText(/barcode\.not_in_db/)).toBeTruthy());

    fireEvent.change(screen.getByPlaceholderText('barcode.product_name'), { target: { value: 'Label Yogurt' } });
    fireEvent.click(screen.getByRole('button', { name: /barcode\.add_to_log/ }));
    await waitFor(() => expect(hoisted.inserts).toHaveLength(1));

    const payload = lastInsert();
    expect(payload.meal_type).toBe('dinner');
    expect(payload.meal_slot).toBe('dinner');
  });

  it('resets the consistent defaults when the modal is reopened with a new context', async () => {
    fetchMock
      .mockResolvedValue(jsonResponse(200, VALID_PRODUCT));

    const { rerender, props } = renderModal({ defaultMealType: 'lunch', defaultMealSlot: 'lunch' });
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());
    // User overrides the meal to breakfast before abandoning this context.
    fireEvent.click(screen.getByRole('button', { name: 'food.breakfast' }));

    // Reopen in a DIFFERENT context (afternoon snack slot).
    rerender(React.createElement(BarcodeLookupModal, { ...props, isOpen: false }));
    rerender(React.createElement(BarcodeLookupModal, { ...props, defaultMealType: 'snack', defaultMealSlot: 'snack_pm', isOpen: true }));

    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /barcode\.add_to_log/ }));
    await waitFor(() => expect(hoisted.inserts).toHaveLength(1));

    const payload = lastInsert();
    expect(payload.meal_type).toBe('snack');
    expect(payload.meal_slot).toBe('snack_pm');
    expect(mealSlotMatchesMealType(payload.meal_slot, payload.meal_type)).toBe(true);
  });

  it('falls back to the coarse meal type when no explicit slot is supplied', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, VALID_PRODUCT));
    renderModal({ defaultMealType: 'breakfast' });
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /barcode\.add_to_log/ }));
    await waitFor(() => expect(hoisted.inserts).toHaveLength(1));

    const payload = lastInsert();
    expect(payload.meal_type).toBe('breakfast');
    expect(payload.meal_slot).toBe('breakfast');
  });
});
