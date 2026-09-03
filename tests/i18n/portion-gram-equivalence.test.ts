// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import React from 'react';
import type { Language } from '@/lib/types';
import { I18nProvider, useI18n } from '@/lib/i18n';

const TestI18nProvider = I18nProvider as React.ComponentType<React.PropsWithChildren<{
  defaultLang?: Language;
}>>;

function PortionEquivalenceProbe() {
  const { t } = useI18n();
  return React.createElement('span', null, t('food.portion_gram_equivalence', {
    amount: 1,
    unit: t('food.unit.serving_one'),
    grams: 550,
  }));
}

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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('English beta portion gram equivalence', () => {
  it.each([
    ['en', '1 serving ≈ 550 g'],
    ['es', '1 ración ≈ 550 g'],
    ['el', '1 μερίδα ≈ 550 γρ.'],
    ['fr', '1 portion ≈ 550 g'],
    ['de', '1 Portion ≈ 550 g'],
    ['it', '1 porzione ≈ 550 g'],
    ['pt', '1 dose ≈ 550 g'],
    ['nl', '1 portie ≈ 550 g'],
  ] satisfies Array<[Language, string]>)('keeps a real localized gram anchor when locale %s is requested', async (lang, expected) => {
    render(React.createElement(
      TestI18nProvider,
      { defaultLang: lang },
      React.createElement(PortionEquivalenceProbe),
    ));

    expect(await screen.findByText(expected)).toBeTruthy();
  });
});
