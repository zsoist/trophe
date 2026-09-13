// @vitest-environment jsdom

// Regression: A parse review belongs to the day+meal it was started on. Switching
// the selected day left the open review mounted (MealSlotCard is not re-keyed by
// date), so tapping "Log All" after a date change wrote the previous day's items
// into the newly selected date, and an in-flight parse could settle onto the wrong
// day. QuickFoodInput must abandon the review and invalidate any in-flight request
// when `date`/`mealType` changes.

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

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
    motion: { button: element('button'), div: element('div'), p: element('p'), span: element('span') },
    useReducedMotion: () => true,
  };
});

vi.mock('lucide-react', async () => {
  const ReactModule = await import('react');
  const Icon = () => ReactModule.createElement('span', { 'aria-hidden': true });
  return {
    Barcode: Icon, Camera: Icon, CheckCircle2: Icon, HelpCircle: Icon, Loader2: Icon,
    Mic: Icon, MicOff: Icon, Plus: Icon, RotateCcw: Icon, Send: Icon, X: Icon,
  };
});

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ lang: 'en', t: (key: string) => key }),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpcClient: { food: { corrections: { captureAdjustment: { mutate: vi.fn() } } } },
}));
vi.mock('@/components/food/PhotoScanCard', () => ({ default: () => null }));
vi.mock('@/components/food/BarcodeLookupModal', () => ({ default: () => null }));
vi.mock('@/lib/microphone/recording-session', () => ({ startAudioRecordingSession: vi.fn() }));
vi.mock('@/lib/microphone/speech-recognition', () => ({ startSpeechRecognitionSession: vi.fn() }));
vi.mock('@/lib/microphone/transcription-client', () => ({
  transcribeRecording: vi.fn(),
  TranscriptionClientError: class extends Error {},
}));

// The review surface is observed through this probe — presence means a review is
// open for the currently selected day.
vi.mock('@/components/food/ParsedFoodList', () => ({
  default: ({ items }: { items: unknown[] }) => React.createElement('div', {
    'data-testid': 'parsed-food-list',
    'data-count': String(items.length),
  }),
}));

import QuickFoodInput from '@/components/food/QuickFoodInput';

const FETA = {
  raw_text: '100g feta', food_name: 'Feta cheese', name_localized: 'Feta',
  quantity: 100, unit: 'g', grams: 100, calories: 264, protein_g: 14.2,
  carbs_g: 4.1, fat_g: 21.3, fiber_g: 0, sugar_g: 0, confidence: 0.95,
  source: 'local_db', portion_explicit: true, data_quality: 'lab_verified',
};

let pending: ((value: unknown) => void) | null = null;

function parseResponse(body: unknown) {
  return { ok: true, status: 200, headers: { get: () => null }, json: async () => body };
}

beforeEach(() => {
  pending = null;
  vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { pending = resolve; })));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function renderInput(date: string) {
  return render(React.createElement(QuickFoodInput, {
    userId: 'user-1', mealType: 'breakfast', date,
    onLogged: vi.fn(), onSearchMode: vi.fn(),
  }));
}

function startParse() {
  const textarea = screen.getByRole('textbox');
  fireEvent.change(textarea, { target: { value: '100g feta' } });
  fireEvent.keyDown(textarea, { key: 'Enter' });
}

describe('QuickFoodInput review is scoped to the selected day', () => {
  it('shows the review while the day is unchanged', async () => {
    renderInput('2026-08-12');
    startParse();
    pending?.(parseResponse({ items: [FETA], warnings: [] }));
    expect(await screen.findByTestId('parsed-food-list')).toBeTruthy();
  });

  it('discards an open review when the selected day changes', async () => {
    const { rerender } = renderInput('2026-08-12');
    startParse();
    pending?.(parseResponse({ items: [FETA], warnings: [] }));
    expect(await screen.findByTestId('parsed-food-list')).toBeTruthy();

    rerender(React.createElement(QuickFoodInput, {
      userId: 'user-1', mealType: 'breakfast', date: '2026-08-13',
      onLogged: vi.fn(), onSearchMode: vi.fn(),
    }));

    await waitFor(() => expect(screen.queryByTestId('parsed-food-list')).toBeNull());
  });

  it('drops an in-flight parse that resolves after the day changes', async () => {
    const { rerender } = renderInput('2026-08-12');
    startParse();

    rerender(React.createElement(QuickFoodInput, {
      userId: 'user-1', mealType: 'breakfast', date: '2026-08-13',
      onLogged: vi.fn(), onSearchMode: vi.fn(),
    }));

    // The old request settles only now — it must not open a review for the new day.
    pending?.(parseResponse({ items: [FETA], warnings: [] }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId('parsed-food-list')).toBeNull();
  });
});


describe('Food photo admission identity', () => {
  function photoSetup() {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: vi.fn() } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,aGVsbG8=');
  }
  function upload(container: HTMLElement, file: File) {
    fireEvent.change(container.querySelector('input[type="file"]')!, { target: { files: [file] } });
  }
  it('sends valid operation UUIDs and keeps them on an explicit retry', async () => {
    photoSetup();
    const { container } = renderInput('2026-09-13');
    const file = new File(['image'], 'plate.jpg', { type: 'image/jpeg' });
    upload(container, file);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const first = vi.mocked(fetch).mock.calls[0][1]!.headers as Record<string, string>;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(first['x-coach-conversation-id']).toMatch(uuid);
    expect(first['x-coach-turn-id']).toMatch(uuid);
    pending?.({ ok: false, status: 503, headers: { get: () => null }, json: async () => ({ error: 'Unavailable' }) });
    fireEvent.click(await screen.findByRole('button', { name: 'food.retry' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[1][1]!.headers).toEqual(first);
  });
  it('drops stale photo results and rotates identity when the owner changes', async () => {
    photoSetup();
    const props = { userId: 'user-1', mealType: 'breakfast' as const, date: '2026-09-13', onLogged: vi.fn(), onSearchMode: vi.fn() };
    const { container, rerender } = render(<QuickFoodInput {...props} />);
    const file = new File(['image'], 'plate.jpg', { type: 'image/jpeg' });
    upload(container, file);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const old = pending;
    const first = vi.mocked(fetch).mock.calls[0][1]!.headers;
    rerender(<QuickFoodInput {...props} userId="user-2" />);
    old?.(parseResponse({ foods: [] }));
    upload(container, file);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(vi.mocked(fetch).mock.calls[1][1]!.headers).not.toEqual(first);
    expect(screen.queryByTestId('parsed-food-list')).toBeNull();
  });
});
