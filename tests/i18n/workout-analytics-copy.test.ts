import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as italian } from '@/lib/locales/it';
import { pt } from '@/lib/locales/pt';
import { nl } from '@/lib/locales/nl';

const keys = ['workout.history_minutes', 'workout.history_show_set_details', 'workout.history_hide_set_details', 'workout.history_warmup', 'workout.history_working', 'workout.history_pr'];

describe('workout analytics history copy', () => {
  it('provides each new history detail string across all eight locales', () => {
    for (const locale of [
      Object.fromEntries(keys.map((key) => [key, translations[key].en])),
      Object.fromEntries(keys.map((key) => [key, translations[key].es])),
      Object.fromEntries(keys.map((key) => [key, translations[key].el])),
      de, fr, italian, pt, nl,
    ]) for (const key of keys) expect(locale[key]).toMatch(/\S/);
  });
});
