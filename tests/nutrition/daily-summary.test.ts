import { describe, expect, it } from 'vitest';
import {
  buildDailyNutritionNote,
  summarizeSugar,
} from '@/lib/nutrition/daily-summary';

const entry = (overrides: Record<string, unknown> = {}) => ({
  food_name: 'Chicken breast',
  protein_g: 30,
  fiber_g: 2,
  sugar_g: 0,
  ...overrides,
});

describe('daily sugar completeness', () => {
  it('does not turn an unknown day into zero sugar', () => {
    expect(summarizeSugar([{ sugar_g: null }])).toEqual({
      totalGrams: null,
      completeness: 'unknown',
      missingEntries: 1,
    });
  });

  it('marks mixed known and unknown rows partial', () => {
    expect(summarizeSugar([{ sugar_g: 8 }, { sugar_g: null }])).toEqual({
      totalGrams: 8,
      completeness: 'partial',
      missingEntries: 1,
    });
  });

  it('accepts a known zero as complete', () => {
    expect(summarizeSugar([{ sugar_g: 0 }])).toEqual({
      totalGrams: 0,
      completeness: 'complete',
      missingEntries: 0,
    });
  });
});

describe("Today's deterministic nutrition note", () => {
  it('invites the first log without using AI', () => {
    expect(buildDailyNutritionNote({
      entries: [], targetProteinG: 150, waterMl: 0, hour: 12,
    }).text).toBe('Log your first meal to start today’s nutrition feedback.');
  });

  it('explains incomplete sugar instead of treating missing values as zero', () => {
    const note = buildDailyNutritionNote({
      entries: [entry({ sugar_g: 8 }), entry({ sugar_g: null })],
      targetProteinG: 150,
      waterMl: 1_000,
      hour: 16,
    });
    expect(note.text).toMatch(/sugar.*incomplete/i);
  });

  it('celebrates a reached protein target', () => {
    const note = buildDailyNutritionNote({
      entries: [entry({ protein_g: 80 }), entry({ protein_g: 75 })],
      targetProteinG: 150,
      waterMl: 1_000,
      hour: 20,
    });
    expect(note.text).toMatch(/protein target/i);
  });

  it('never presents total sugar as an added-sugar medical threshold', () => {
    const note = buildDailyNutritionNote({
      entries: [entry({ sugar_g: 60 }), entry({ sugar_g: 40 })],
      targetProteinG: 0,
      waterMl: 1_000,
      hour: 20,
    });
    expect(note.text).not.toMatch(/too much sugar|WHO|limit|excess/i);
  });
});


it('does not call incomplete fiber a low daily total', () => {
  const note = buildDailyNutritionNote({ entries: [entry({ fiber_g: null }), entry({ fiber_g: 0 }), entry({ fiber_g: 0 })], targetProteinG: 0, waterMl: 1000, hour: 12 });
  expect(note.text).not.toMatch(/Fiber is|Add beans/);
});


it('reports legacy unreferenced estimate zeros as incomplete without changing the rows', () => {
 const legacy = { sugar_g: 0, source: 'natural_language', food_id: null };
 const verified = { sugar_g: 0, source: 'natural_language', food_id: 'canonical-food' };
 expect(summarizeSugar([legacy, verified])).toEqual({totalGrams:0,completeness:'partial',missingEntries:1});
 expect(summarizeSugar([verified, {sugar_g:0,source:'custom',food_id:null}]).completeness).toBe('complete');
 expect(legacy.sugar_g).toBe(0);
 const note = buildDailyNutritionNote({entries:[entry({...legacy,fiber_g:0}),entry({...verified,fiber_g:0}),entry({...verified,fiber_g:0})],targetProteinG:0,waterMl:1000,hour:12});
 expect(note.text).toMatch(/incomplete/);
 expect(note.text).not.toMatch(/Fiber is/);
});
