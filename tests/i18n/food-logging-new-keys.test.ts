import { describe, expect, it } from 'vitest';
import { foodLoggingTranslations as translations } from '@/lib/locales/food-logging';

// Regression: `BarcodeLookupModal` read `t('barcode.close')` for its close
// button, but no dictionary defined the key, so the aria-label rendered the
// literal string "barcode.close" in every locale. The same pass replaced the
// hard-coded English copy in the barcode/recipe/quick-add surfaces.
const newKeys = [
  'barcode.close',
  'food.action_photo',
  'food.action_barcode',
  'food.back',
  'food.recipe_paste_label',
  'food.recipe_servings_yielded',
  'food.recipe_analyzing',
  'food.recipe_analyze_action',
  'food.recipe_close_aria',
  'food.recipe_heading',
  'food.recipe_meta',
  'food.recipe_total',
  'food.recipe_show_breakdown',
  'food.recipe_hide_breakdown',
  'food.recipe_servings_question',
  'food.recipe_meal_label',
  'food.recipe_edit',
  'food.recipe_log',
  'food.err_manual_calories_range',
  'food.err_manual_macro_range',
  'food.err_manual_name_long',
  'food.err_item_amount',
] as const;

const placeholders = (value: string) => [...value.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).sort();

describe('new food logging keys', () => {
  it('exist with copy in every core language', () => {
    for (const key of newKeys) {
      const entry = translations[key];
      expect(entry, key).toBeTruthy();
      for (const lang of ['en', 'es', 'el'] as const) {
        expect(entry[lang], `${lang}:${key}`).toMatch(/\S/);
      }
    }
  });

  it('keeps interpolation placeholders identical across core languages', () => {
    for (const key of newKeys) {
      const en = placeholders(translations[key].en);
      expect(placeholders(translations[key].es), `es:${key}`).toEqual(en);
      expect(placeholders(translations[key].el), `el:${key}`).toEqual(en);
    }
  });
});
