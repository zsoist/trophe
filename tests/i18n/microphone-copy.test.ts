// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import {
  I18nProvider,
  MICROPHONE_COPY_KEYS,
  useI18n,
} from '@/lib/i18n';
import type { Language } from '@/lib/types';

const TestI18nProvider = I18nProvider as React.ComponentType<React.PropsWithChildren<{
  defaultLang?: Language;
}>>;

function CopyProbe() {
  const { t } = useI18n();
  return React.createElement(
    'div',
    null,
    MICROPHONE_COPY_KEYS.map(key => React.createElement('span', { key, 'data-testid': key }, t(key))),
  );
}

describe('microphone copy coverage', () => {
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

  it.each(['en', 'es', 'el', 'fr', 'de', 'it', 'pt', 'nl'] as Language[])(
    'renders every microphone state in %s without key fallback',
    async language => {
      render(React.createElement(TestI18nProvider, { defaultLang: language }, React.createElement(CopyProbe)));

      await waitFor(() => {
        for (const key of MICROPHONE_COPY_KEYS) {
          const text = screen.getByTestId(key).textContent?.trim();
          expect(text).toBeTruthy();
          expect(text).not.toBe(key);
        }
      });
    },
  );
});
