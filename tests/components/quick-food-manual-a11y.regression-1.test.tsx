// @vitest-environment jsdom

// Regression: the manual-entry nutrient fields (kcal / protein / carbs / fat)
// rendered a *visible* localized <label> with no `htmlFor` and gave the input
// no `id` and no `aria-label`. Sighted users read the label; assistive tech saw
// four anonymous spinbuttons. Each label must be programmatically associated
// with its own input, and the ids must stay unique when two instances of the
// component are mounted at once (React `useId`).

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

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
  useI18n: () => ({
    lang: 'en',
    t: (key: string) => ({
      'food.quick_add': 'Quick add',
      'food.manual_kcal_label': 'kcal *',
      'food.edit.protein': 'Protein',
      'food.edit.carbs': 'Carbs',
      'food.edit.fat': 'Fat',
    } as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));
vi.mock('@/lib/trpc/client', () => ({
  trpcClient: { food: { corrections: { captureAdjustment: { mutate: vi.fn() } } } },
}));
vi.mock('@/components/food/ParsedFoodList', () => ({ default: () => null }));
vi.mock('@/components/food/PhotoScanCard', () => ({ default: () => null }));
vi.mock('@/components/food/BarcodeLookupModal', () => ({ default: () => null }));
vi.mock('@/lib/microphone/recording-session', () => ({ startAudioRecordingSession: vi.fn() }));
vi.mock('@/lib/microphone/speech-recognition', () => ({ startSpeechRecognitionSession: vi.fn() }));
vi.mock('@/lib/microphone/transcription-client', () => ({
  transcribeRecording: vi.fn(),
  TranscriptionClientError: class extends Error {},
}));

import QuickFoodInput from '@/components/food/QuickFoodInput';

const FIELDS: Array<[name: string, i18nKey: string]> = [
  ['kcal *', 'food.manual_kcal_label'],
  ['Protein', 'food.edit.protein'],
  ['Carbs', 'food.edit.carbs'],
  ['Fat', 'food.edit.fat'],
];

function renderManual() {
  return render(React.createElement(QuickFoodInput, {
    userId: 'user', mealType: 'breakfast', date: '2026-08-12',
    onLogged: vi.fn(), onSearchMode: vi.fn(), manualOnly: true,
  }));
}

afterEach(cleanup);

describe('manual-entry nutrient fields expose an accessible name', () => {
  it.each(FIELDS)('associates the "%s" label with its spinbutton', (name) => {
    renderManual();
    const input = screen.getByRole('spinbutton', { name }) as HTMLInputElement;
    expect(input).toBeTruthy();

    const label = input.labels?.[0];
    expect(label?.tagName).toBe('LABEL');
    expect(label?.textContent).toBe(name);
    expect(input.id).toBeTruthy();
  });

  it('keeps each field a distinct, uniquely-named control', () => {
    renderManual();
    const names = FIELDS.map(([name]) => screen.getByRole('spinbutton', { name }).id);
    expect(new Set(names).size).toBe(FIELDS.length);
  });

  it('generates unique ids across two simultaneously mounted instances', () => {
    renderManual();
    renderManual();
    for (const [name] of FIELDS) {
      const inputs = screen.getAllByRole('spinbutton', { name }) as HTMLInputElement[];
      expect(inputs).toHaveLength(2);
      expect(inputs[0].id).not.toBe(inputs[1].id);
      // Each mount's label still resolves to its own input.
      expect(inputs[0].labels?.[0]?.textContent).toBe(name);
      expect(inputs[1].labels?.[0]?.textContent).toBe(name);
    }
  });
});
