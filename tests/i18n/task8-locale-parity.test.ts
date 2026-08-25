import { describe, expect, it } from 'vitest';
import { fr } from '@/lib/locales/fr';
import { de } from '@/lib/locales/de';
import { it as italian } from '@/lib/locales/it';
import { pt } from '@/lib/locales/pt';
import { nl } from '@/lib/locales/nl';
import { translations } from '@/lib/i18n';

const task8Keys = [
  'workout.plate_total_label', 'workout.plate_bar_label', 'workout.plate_inventory_label', 'workout.plate_inventory_help',
  'workout.plate_left_side', 'workout.plate_right_side', 'workout.plate_exact', 'workout.plate_nearest', 'workout.plate_impossible',
  'workout.warmup_explanation', 'workout.warmup_no_ramp', 'workout.add_warmup_sets', 'workout.add_warmup_sets_saving', 'workout.add_warmup_sets_failed',
  'painflag.exercise', 'painflag.current_exercise', 'painflag.body_part_label', 'painflag.severity_mild', 'painflag.severity_moderate', 'painflag.severity_stop', 'painflag.notes_label', 'painflag.coach_disclosure',
  'painflag.region_chest', 'painflag.region_back', 'painflag.region_shoulders', 'painflag.region_arms', 'painflag.region_legs', 'painflag.region_core',
  'painflag.region_biceps', 'painflag.region_triceps', 'painflag.region_forearms', 'painflag.region_quads', 'painflag.region_hamstrings', 'painflag.region_glutes', 'painflag.region_calves', 'painflag.region_prompt',
];

describe('Task 8 overlay locale parity', () => {
  it('provides every new pain and plate string in every overlay locale', () => {
    for (const locale of [fr, de, italian, pt, nl]) {
      for (const key of task8Keys) expect(locale[key]).toMatch(/\S/);
    }
  });

  it('never exposes raw muscle-group or generic database tokens as anatomical suggestions', () => {
    for (const locale of [fr, de, italian, pt, nl]) {
      expect(locale['painflag.region_biceps']).not.toBe('biceps');
      expect(locale['painflag.region_quads']).not.toBe('quads');
      expect(locale['painflag.region_glutes']).not.toBe('glutes');
      expect(locale['painflag.region_forearms']).not.toBe('forearms');
      expect(locale['painflag.region_prompt']).not.toMatch(/^(full_body|cardio)$/);
    }
  });

  it('maps anatomical and generic Task 8 tokens in all eight locale dictionaries', () => {
    const keys = ['painflag.region_biceps', 'painflag.region_quads', 'painflag.region_glutes', 'painflag.region_forearms', 'painflag.region_prompt'] as const;
    const raw = new Set(['biceps', 'quads', 'glutes', 'forearms', 'full_body', 'cardio']);
    const locales: Array<Record<string, string>> = [
      Object.fromEntries(keys.map((key) => [key, translations[key].en])),
      Object.fromEntries(keys.map((key) => [key, translations[key].es])),
      Object.fromEntries(keys.map((key) => [key, translations[key].el])),
      de, fr, italian, nl, pt,
    ];
    for (const locale of locales) for (const key of keys) expect(raw.has(locale[key].toLowerCase())).toBe(false);
  });
});
