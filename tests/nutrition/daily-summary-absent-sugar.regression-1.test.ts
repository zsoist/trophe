import { describe, expect, it } from 'vitest';
import {
  buildDailyNutritionNote,
  summarizeSugar,
} from '@/lib/nutrition/daily-summary';

// A row can arrive with the sugar column absent (undefined) — e.g. an older /
// partially-selected row, or a favorite created from an entry whose sugar was
// unknown. That is a MISSING nutrient, not a measured zero.
const absent = undefined as unknown as null;
const notANumber = Number.NaN as unknown as null;

describe('daily sugar completeness — absent value is not zero', () => {
  it('does not sum an undefined sugar value as zero', () => {
    expect(summarizeSugar([{ sugar_g: absent }])).toEqual({
      totalGrams: null,
      completeness: 'unknown',
      missingEntries: 1,
    });
  });

  it('treats a non-finite sugar value as missing, never as a measured amount', () => {
    expect(summarizeSugar([{ sugar_g: notANumber }])).toEqual({
      totalGrams: null,
      completeness: 'unknown',
      missingEntries: 1,
    });
  });

  it('marks a day partial when one row has no sugar value at all', () => {
    expect(summarizeSugar([{ sugar_g: 8 }, { sugar_g: absent }])).toEqual({
      totalGrams: 8,
      completeness: 'partial',
      missingEntries: 1,
    });
  });

  it('surfaces the gap in the daily note instead of reporting a complete total', () => {
    const note = buildDailyNutritionNote({
      entries: [
        { food_name: 'Oats', protein_g: 10, fiber_g: 3, sugar_g: absent },
        { food_name: 'Yogurt', protein_g: 12, fiber_g: 0, sugar_g: absent },
      ],
      targetProteinG: 150,
      waterMl: 1_000,
      hour: 16,
    });
    expect(note.text).toMatch(/sugar.*incomplete/i);
    expect(note.text).not.toMatch(/protein target/i);
  });
});
