import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { foodLoggingTranslations as translations } from '@/lib/locales/food-logging';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as italian } from '@/lib/locales/it';
import { nl } from '@/lib/locales/nl';
import { pt } from '@/lib/locales/pt';

// Regression: the manual quick-add form, the parse/photo failure copy, and the
// review aria labels shipped as hard-coded English, so Spanish/Greek clients
// saw English mid-flow and every overlay locale fell back to English.
const keys = [
  'food.manual_name_placeholder',
  'food.manual_kcal_label',
  'food.quick_add_fallback',
  'food.parse_failed_connection',
  'food.photo_timeout',
  'food.photo_failed_connection',
  'food.photo_invalid_type',
  'food.photo_pick_aria',
  'food.barcode_scan_aria',
  'food.answer_aria',
  'food.answer_submit_aria',
  'food.add_more',
  'food.add_note_placeholder',
  'food.add_note_aria',
  'food.community_data',
] as const;

const placeholders = (value: string) => [...value.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();

describe('food logging localization inventory', () => {
  it('ships every manual-logging string in all eight locales with matching placeholders', () => {
    const overlays: Array<Record<string, string>> = [de, fr, italian, nl, pt];
    for (const key of keys) {
      const english = translations[key]?.en;
      expect(english, `en:${key}`).toMatch(/\S/);
      expect(placeholders(translations[key]?.es ?? ''), `es:${key}`).toEqual(placeholders(english ?? ''));
      expect(placeholders(translations[key]?.el ?? ''), `el:${key}`).toEqual(placeholders(english ?? ''));
      for (const [index, overlay] of overlays.entries()) {
        expect(overlay[key], `overlay ${index}:${key}`).toMatch(/\S/);
        expect(placeholders(overlay[key] ?? ''), `overlay ${index}:${key} placeholders`)
          .toEqual(placeholders(english ?? ''));
      }
    }
  });

  it('leaves no hard-coded English copy in the owned food components', () => {
    const sources = ['components/food/QuickFoodInput.tsx', 'components/food/ParsedFoodList.tsx']
      .map((file) => readFileSync(join(process.cwd(), file), 'utf8'))
      .join('\n');

    for (const literal of [
      'Failed to parse food — check your connection',
      'Failed to analyze photo — check your connection',
      'Photo analysis timed out — try again',
      'Please choose an image file.',
      'Food name (optional)',
      'Quick add — ',
    ]) {
      expect(sources).not.toContain(literal);
    }
  });
});
