// @vitest-environment jsdom

// Regression: BarcodeLookupModal.lookup ignored res.ok/status and treated every
// response without { found, per100g } as "product absent" (-> manual label step).
// The DS2 /api/food/barcode route now returns HTTP 502 for provider failure and
// 401/403/malformed payloads are possible, so a temporary error masqueraded as a
// missing product and pushed the user into manual entry. Only a genuine 404 may
// offer label/manual entry; any other failure must stay recoverable with the
// localized lookup error and no blind auto-retry.
//
// Second regression: lookupBusyRef/loading were not scoped to the modal
// lifecycle — closing and reopening while a fetch was pending left a stale
// response able to populate the fresh modal (and a stale finally able to unlock
// it). A late response/finally from a previous session must not touch a newer
// modal or request.

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

// Real i18n falls back to the key when no provider is mounted; assert on the
// stable keys so the test does not depend on translated copy.
vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ lang: 'en', t: (key: string) => key }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { from: () => ({ insert: () => ({ select: () => ({ maybeSingle: async () => ({ data: { id: 'x' }, error: null }) }) }) }) },
}));

import BarcodeLookupModal from '@/components/food/BarcodeLookupModal';

const fetchMock = vi.fn();

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

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

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BarcodeLookupModal error handling', () => {
  it('keeps a 502 recoverable and lets the user retry successfully', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(502, { found: false, error: 'Open Food Facts unavailable' }))
      .mockResolvedValueOnce(jsonResponse(200, VALID_PRODUCT));

    renderModal();
    await typeAndLookup('8412345678905');

    // Temporary failure surfaces the localized lookup error and does NOT fall
    // through to the manual-label step.
    await waitFor(() => expect(screen.getByText('barcode.err_lookup')).toBeTruthy());
    expect(screen.queryByText(/barcode\.not_in_db/)).toBeNull();
    // The barcode field is still there so the user can retry with the same code.
    expect(screen.getByRole('textbox')).toBeTruthy();

    // User-initiated retry succeeds — no automatic retry happened (still 2 calls).
    fireEvent.click(screen.getByRole('button', { name: /barcode\.look_up/ }));
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('treats a genuine 404 as "not in database" and offers manual label entry', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(404, { found: false, error: 'Not found in Open Food Facts' }));

    renderModal();
    await typeAndLookup('8412345678905');

    await waitFor(() => expect(screen.getByText(/barcode\.not_in_db/)).toBeTruthy());
    expect(screen.queryByText('barcode.err_lookup')).toBeNull();
  });

  it('treats a malformed 200 (no found/per100g) as a recoverable error, not a miss', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { unexpected: true }));

    renderModal();
    await typeAndLookup('8412345678905');

    await waitFor(() => expect(screen.getByText('barcode.err_lookup')).toBeTruthy());
    expect(screen.queryByText(/barcode\.not_in_db/)).toBeNull();
  });
});

describe('BarcodeLookupModal resolves against a stale session', () => {
  it('ignores a pending response from a closed modal and stays usable after reopen', async () => {
    const stale = deferred<ReturnType<typeof jsonResponse>>();
    fetchMock
      .mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce(jsonResponse(200, VALID_PRODUCT));

    const { rerender, props } = renderModal();
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // Close while the fetch is still pending, then reopen.
    rerender(React.createElement(BarcodeLookupModal, { ...props, isOpen: false }));
    rerender(React.createElement(BarcodeLookupModal, { ...props, isOpen: true }));

    // The stale response resolves after the session changed — it must not
    // populate the fresh modal.
    stale.resolve(jsonResponse(200, VALID_PRODUCT));
    await waitFor(() => expect(screen.getByRole('button', { name: /barcode\.photo/ })).toBeTruthy());
    expect(screen.queryByText('Test Yogurt')).toBeNull();

    // And the stale finally must not have left the single-flight lock held: a
    // fresh lookup works.
    await typeAndLookup('8412345678905');
    await waitFor(() => expect(screen.getByText('Test Yogurt')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

it('AG4 ignores a stale body that completes after close and reopen',async()=>{
 const body=deferred<unknown>();const readBody=vi.fn(()=>body.promise);
 fetchMock.mockResolvedValueOnce({ok:true,status:200,json:readBody});
 const {rerender,props}=renderModal();await typeAndLookup('8412345678905');
 await waitFor(()=>expect(readBody).toHaveBeenCalledTimes(1));
 rerender(React.createElement(BarcodeLookupModal,{...props,isOpen:false}));
 rerender(React.createElement(BarcodeLookupModal,{...props,isOpen:true}));
 body.resolve(VALID_PRODUCT);
 await new Promise(resolve=>setTimeout(resolve,0));
 expect(screen.queryByText('Test Yogurt')).toBeNull();
});
