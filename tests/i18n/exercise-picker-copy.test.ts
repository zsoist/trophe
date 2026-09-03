// @vitest-environment jsdom

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { EXERCISE_PICKER_COPY_KEYS, I18nProvider, translations, useI18n } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as itLocale } from '@/lib/locales/it';
import { nl } from '@/lib/locales/nl';
import { pt } from '@/lib/locales/pt';

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

  it('localizes newly exposed atlas and media chrome in all eight locales', () => {
    const visibleChromeKeys = [
      'workout.atlas_label',
      'workout.atlas_focus_hint',
      'workout.atlas_show_back',
      'workout.atlas_roles_label',
      'workout.atlas_more_highlighted',
      'workout.atlas_summary_front',
      'workout.atlas_summary_back',
      'workout.atlas_side_front',
      'workout.atlas_side_back',
      'workout.atlas_role_action_front',
      'workout.atlas_role_action_back',
      'workout.atlas_surface_contour',
      'workout.atlas_deep_guide',
      'workout.atlas_deep_marker',
      'workout.atlas_deep_guide_detail',
      'workout.atlas_today_target',
      'workout.atlas_primary_target',
      'workout.atlas_supporting_target',
      'workout.atlas_stabilizing_target',
      'workout.atlas_empty_strength',
      'workout.atlas_empty_cardio',
      'workout.atlas_cardio_target',
      'workout.atlas_no_target',
      'workout.media_anatomy_reference',
      'workout.media_no_exact_demo_detail',
      'workout.picker_anatomy_poster_alt',
      'workout.info_stabilizer',
    ] as const;
    const locales = {
      en: Object.fromEntries(visibleChromeKeys.map((key) => [key, translations[key].en])),
      es: Object.fromEntries(visibleChromeKeys.map((key) => [key, translations[key].es])),
      el: Object.fromEntries(visibleChromeKeys.map((key) => [key, translations[key].el])),
      de,
      fr,
      it: itLocale,
      nl,
      pt,
    };

    for (const [locale, copy] of Object.entries(locales)) {
      for (const key of visibleChromeKeys) {
        expect(copy[key], `${locale}:${key}`).toBeTruthy();
        expect(copy[key], `${locale}:${key}`).not.toBe(key);
        if (locale !== 'en') expect(copy[key], `${locale}:${key}`).not.toBe(locales.en[key]);
      }
    }
  });

});
