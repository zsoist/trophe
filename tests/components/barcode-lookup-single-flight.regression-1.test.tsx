// @vitest-environment jsdom

// Regression: BarcodeLookupModal.putLookup had no in-flight guard. The "Look up"
// button is disabled while loading, but pressing Enter in the barcode field (and
// repeated camera decode callbacks) bypassed it, firing several concurrent
// /api/food/barcode requests — a slower earlier response could overwrite the
// product the user actually scanned. The request itself must be single-flight.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'x' }, error: null }) }) }) }) },
}));

import BarcodeLookupModal from '@/components/food/BarcodeLookupModal';

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => new Promise(() => { /* stays in flight */ }));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BarcodeLookupModal lookup is single-flight', () => {
  it('ignores a second Enter while the first lookup is still in flight', async () => {
    render(React.createElement(BarcodeLookupModal, {
      userId: 'user-1', selectedDate: '2026-08-12', isOpen: true,
      onClose: vi.fn(), onLogged: vi.fn(),
    }));

    fireEvent.click(screen.getByRole('button', { name: /barcode\.input/ }));
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '8412345678905' } });

    fireEvent.keyDown(input, { key: 'Enter' });
    fireEvent.keyDown(input, { key: 'Enter' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});
