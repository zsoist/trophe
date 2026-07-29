import { describe, it, expect } from 'vitest';
import { mifflinStJeor, katchMcArdle, tdeeFromBmr, targetCalories, macroSplit, computeBaseline, baselineInputIssue } from '@/lib/food/calorie-equations';

describe('calorie-equations', () => {
  it('Mifflin-St Jeor — male & female', () => {
    expect(mifflinStJeor('male', 30, 80, 180)).toBe(1780);   // 10*80+6.25*180-5*30+5
    expect(mifflinStJeor('female', 30, 60, 165)).toBe(1320); // ...-161, rounded
  });

  it('Katch-McArdle uses lean mass', () => {
    expect(katchMcArdle(80, 20)).toBe(1752); // 370 + 21.6*(80*0.8)
  });

  it('TDEE applies the activity factor', () => {
    expect(tdeeFromBmr(1780, 'moderate')).toBe(2759); // 1780*1.55
    expect(tdeeFromBmr(1780, 'sedentary')).toBe(2136); // *1.2
  });

  it('goal adjusts calories ~15%/+10%', () => {
    expect(targetCalories(2000, 'lose')).toBe(1700);
    expect(targetCalories(2000, 'maintain')).toBe(2000);
    expect(targetCalories(2000, 'gain')).toBe(2200);
  });

  it('macroSplit is Atwater-consistent', () => {
    const s = macroSplit(2000, 80, 2.0);
    expect(s.protein_g).toBe(160); // 2 g/kg
    expect(s.protein_capped).toBe(false);
    // calories recomputed from the split (4/4/9) ≈ input
    expect(s.protein_g * 4 + s.carbs_g * 4 + s.fat_g * 9).toBe(s.calories);
    expect(Math.abs(s.calories - 2000)).toBeLessThanOrEqual(5);
  });

  it('caps an impossible protein target instead of exceeding the calorie ceiling', () => {
    const s = macroSplit(1200, 150, 2.0);

    expect(s.protein_capped).toBe(true);
    expect(s.protein_g).toBeLessThan(300);
    expect(s.fat_g).toBeGreaterThan(0);
    expect(s.calories).toBeLessThanOrEqual(1200);
    expect(1200 - s.calories).toBeLessThan(4);
    expect(s.protein_g * 4 + s.carbs_g * 4 + s.fat_g * 9).toBe(s.calories);
  });

  it('computeBaseline picks Katch when body fat is known, else Mifflin', () => {
    const withBf = computeBaseline({ sex: 'male', ageYears: 30, weightKg: 80, heightCm: 180, bodyFatPct: 18, activity: 'moderate', goal: 'maintain' });
    expect(withBf.formula).toBe('katch_mccardle');
    const noBf = computeBaseline({ sex: 'male', ageYears: 30, weightKg: 80, heightCm: 180, activity: 'moderate', goal: 'maintain' });
    expect(noBf.formula).toBe('mifflin_st_jeor');
    expect(noBf.tdee).toBeGreaterThan(noBf.bmr);
    expect(noBf.target.protein_g).toBeGreaterThan(0);
  });

  it('rejects unsupported body data before calculating a baseline', () => {
    const valid = {
      sex: 'male' as const,
      ageYears: 30,
      weightKg: 80,
      heightCm: 180,
      bodyFatPct: 18,
      activity: 'moderate' as const,
      goal: 'maintain' as const,
    };

    expect(baselineInputIssue(valid)).toBeNull();
    expect(baselineInputIssue({ ...valid, ageYears: -1 })).toBe('age');
    expect(baselineInputIssue({ ...valid, weightKg: 0 })).toBe('weight');
    expect(baselineInputIssue({ ...valid, heightCm: 999 })).toBe('height');
    expect(baselineInputIssue({ ...valid, bodyFatPct: 101 })).toBe('body_fat');
    expect(() => computeBaseline({ ...valid, bodyFatPct: 101 })).toThrow(
      'Unsupported baseline input: body_fat',
    );
  });
});
