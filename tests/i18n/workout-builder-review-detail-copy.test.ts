import { describe, expect, it } from 'vitest';
import { translations } from '@/lib/i18n';
import { de } from '@/lib/locales/de';
import { fr } from '@/lib/locales/fr';
import { it as itLocale } from '@/lib/locales/it';
import { nl } from '@/lib/locales/nl';
import { pt } from '@/lib/locales/pt';

const keys = [
  'workout.save_plan_pending',
  'workout.save_plan_failed',
  'workout.save_plan_success',
  'workout.save_plan_strength_only',
  'workout.review_edit_exercise',
  'workout.review_target_sets',
  'workout.movement_technique_alt',
  'workout.movement_anatomy_alt',
  'workout.movement_cardio_alt',
  'workout.equipment_label',
  'workout.primary_muscle_label',
  'workout.equipment_value',
  'workout.equipment_not_required',
  'workout.history_sets',
] as const;

const overlays = { de, fr, it: itLocale, nl, pt };

describe('Build, Review, and exercise detail localization', () => {
  it('provides native copy for every new UI state in all eight supported locales', () => {
    for (const key of keys) {
      expect(translations[key]?.en).toBeTruthy();
      expect(translations[key]?.es).toBeTruthy();
      expect(translations[key]?.el).toBeTruthy();
      for (const dictionary of Object.values(overlays)) {
        expect(dictionary[key]).toBeTruthy();
        expect(dictionary[key]).not.toBe(key);
      }
    }
  });
});
