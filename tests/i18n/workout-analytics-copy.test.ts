import { describe, expect, it } from 'vitest';
import { translations, WORKOUT_ANALYTICS_COPY_KEYS } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as italian } from '@/lib/locales/it';
import { pt } from '@/lib/locales/pt';
import { nl } from '@/lib/locales/nl';

describe('workout analytics history copy', () => {
  it('provides the exact complete Task 9 copy contract across all eight locales', () => {
    const locales = [
      Object.fromEntries(WORKOUT_ANALYTICS_COPY_KEYS.map((key) => [key, translations[key]?.en])),
      Object.fromEntries(WORKOUT_ANALYTICS_COPY_KEYS.map((key) => [key, translations[key]?.es])),
      Object.fromEntries(WORKOUT_ANALYTICS_COPY_KEYS.map((key) => [key, translations[key]?.el])),
      de, fr, italian, pt, nl,
    ];

    expect(new Set(WORKOUT_ANALYTICS_COPY_KEYS).size).toBe(WORKOUT_ANALYTICS_COPY_KEYS.length);
    for (const locale of locales) {
      const taskCopy = Object.fromEntries(WORKOUT_ANALYTICS_COPY_KEYS.map((key) => [key, locale[key]]));
      expect(Object.keys(taskCopy).sort()).toEqual([...WORKOUT_ANALYTICS_COPY_KEYS].sort());
      for (const value of Object.values(taskCopy)) expect(value).toMatch(/\S/);
    }
  });
});
