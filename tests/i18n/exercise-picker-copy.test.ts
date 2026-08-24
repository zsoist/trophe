// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EXERCISE_PICKER_COPY_KEYS, I18nProvider, useI18n } from '@/lib/i18n';

function CopyProbe() {
  const { t } = useI18n();
  return React.createElement(
    'div',
    null,
    EXERCISE_PICKER_COPY_KEYS.map((key) => React.createElement('span', { key, 'data-testid': key }, t(key, {
      area: 'Arms',
      name: 'Bench Press',
      n: 12,
    }))),
  );
}

describe('exercise picker copy coverage', () => {
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

  it('renders every visible picker state without leaking translation keys', () => {
    render(React.createElement(I18nProvider, null, React.createElement(CopyProbe)));

    for (const key of EXERCISE_PICKER_COPY_KEYS) {
      const text = screen.getByTestId(key).textContent?.trim();
      expect(text).toBeTruthy();
      expect(text).not.toBe(key);
    }
  });
});
