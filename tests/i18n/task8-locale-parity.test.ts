import { describe, expect, it } from 'vitest';
import { fr } from '@/lib/locales/fr';
import { de } from '@/lib/locales/de';
import { it as italian } from '@/lib/locales/it';
import { pt } from '@/lib/locales/pt';
import { nl } from '@/lib/locales/nl';

const task8Keys = [
  'workout.plate_total_label', 'workout.plate_bar_label', 'workout.plate_inventory_label', 'workout.plate_inventory_help',
  'workout.plate_left_side', 'workout.plate_right_side', 'workout.plate_exact', 'workout.plate_nearest', 'workout.plate_impossible',
  'workout.warmup_explanation', 'workout.warmup_no_ramp', 'workout.add_warmup_sets', 'workout.add_warmup_sets_saving', 'workout.add_warmup_sets_failed',
  'painflag.exercise', 'painflag.current_exercise', 'painflag.body_part_label', 'painflag.severity_mild', 'painflag.severity_moderate', 'painflag.severity_stop', 'painflag.notes_label', 'painflag.coach_disclosure',
];

describe('Task 8 overlay locale parity', () => {
  it('provides every new pain and plate string in every overlay locale', () => {
    for (const locale of [fr, de, italian, pt, nl]) {
      for (const key of task8Keys) expect(locale[key]).toMatch(/\S/);
    }
  });
});
