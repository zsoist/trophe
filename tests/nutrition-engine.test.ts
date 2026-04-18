import { describe, it, expect } from 'vitest';
import {
  calculateBMR,
  calculateTDEE,
  calculateTargetCalories,
  calculateMacroTargets,
  calculateFullProfile,
  proteinPerMeal,
  macroPercentage,
  caloriesFromSteps,
  remainingMacros,
} from '@/lib/nutrition-engine';

// Reference case — Daniela-like profile (drove the ChatGPT comparison incident).
// 35-year-old female, 65 kg, 165 cm, moderate activity, fat_loss.
const DANIELA = { weight_kg: 65, height_cm: 165, age: 35, sex: 'female' as const };
// Reference case — Michael-like profile.
const MICHAEL = { weight_kg: 85, height_cm: 180, age: 38, sex: 'male' as const };

describe('calculateBMR (Mifflin-St Jeor)', () => {
  it('male formula adds 5', () => {
    // 10*85 + 6.25*180 - 5*38 + 5 = 850 + 1125 - 190 + 5 = 1790
    expect(calculateBMR(85, 180, 38, 'male')).toBe(1790);
  });

  it('female formula subtracts 161', () => {
    // 10*65 + 6.25*165 - 5*35 - 161 = 650 + 1031.25 - 175 - 161 = 1345.25 → 1345
    expect(calculateBMR(65, 165, 35, 'female')).toBe(1345);
  });

  it('scales linearly with weight', () => {
    const a = calculateBMR(70, 175, 30, 'male');
    const b = calculateBMR(80, 175, 30, 'male');
    expect(b - a).toBe(100); // 10 kg * 10 = 100 kcal
  });

  it('decreases 5 kcal per year of age', () => {
    const young = calculateBMR(80, 180, 25, 'male');
    const older = calculateBMR(80, 180, 45, 'male');
    expect(young - older).toBe(100);
  });
});

describe('calculateTDEE', () => {
  it('sedentary = BMR * 1.2', () => {
    expect(calculateTDEE(1500, 'sedentary')).toBe(1800);
  });

  it('very_active = BMR * 1.9', () => {
    expect(calculateTDEE(1500, 'very_active')).toBe(2850);
  });
});

describe('calculateTargetCalories (goal adjustments)', () => {
  it('fat_loss applies 20% deficit', () => {
    expect(calculateTargetCalories(2500, 'fat_loss')).toBe(2000);
  });

  it('muscle_gain adds 300 kcal surplus', () => {
    expect(calculateTargetCalories(2500, 'muscle_gain')).toBe(2800);
  });

  it('maintenance unchanged', () => {
    expect(calculateTargetCalories(2500, 'maintenance')).toBe(2500);
  });

  it('recomp applies 5% deficit', () => {
    expect(calculateTargetCalories(2000, 'recomp')).toBe(1900);
  });
});

describe('calculateMacroTargets (ISSN-grade ratios)', () => {
  it('fat_loss protein = 2.2 g/kg (ISSN upper for cut)', () => {
    const t = calculateMacroTargets(
      MICHAEL.weight_kg,
      MICHAEL.height_cm,
      MICHAEL.age,
      MICHAEL.sex,
      'moderate',
      'fat_loss',
    );
    expect(t.protein_g).toBe(Math.round(2.2 * 85)); // 187
  });

  it('maintenance protein = 1.6 g/kg', () => {
    const t = calculateMacroTargets(
      DANIELA.weight_kg,
      DANIELA.height_cm,
      DANIELA.age,
      DANIELA.sex,
      'moderate',
      'maintenance',
    );
    expect(t.protein_g).toBe(Math.round(1.6 * 65)); // 104
  });

  it('fiber = 14g per 1000 kcal (IOM)', () => {
    const t = calculateMacroTargets(70, 175, 30, 'male', 'moderate', 'maintenance');
    expect(t.fiber_g).toBe(Math.round((t.calories / 1000) * 14));
  });

  it('water = 35 ml/kg body weight', () => {
    const t = calculateMacroTargets(80, 180, 30, 'male', 'moderate', 'maintenance');
    expect(t.water_ml).toBe(80 * 35);
  });

  it('carbs fill remaining calories after protein + fat', () => {
    const t = calculateMacroTargets(
      MICHAEL.weight_kg,
      MICHAEL.height_cm,
      MICHAEL.age,
      MICHAEL.sex,
      'moderate',
      'fat_loss',
    );
    // calories = protein*4 + fat*9 + carbs*4 (within rounding)
    const reconstructed = t.protein_g * 4 + t.fat_g * 9 + t.carbs_g * 4;
    expect(Math.abs(t.calories - reconstructed)).toBeLessThanOrEqual(4);
  });

  it('never returns negative carbs (protein+fat cannot exceed target)', () => {
    // Extreme fat_loss tiny person — carbs must stay >= 0
    const t = calculateMacroTargets(45, 150, 25, 'female', 'sedentary', 'fat_loss');
    expect(t.carbs_g).toBeGreaterThanOrEqual(0);
  });
});

describe('calculateFullProfile', () => {
  it('returns bmr + tdee + macro targets', () => {
    const p = calculateFullProfile(
      MICHAEL.weight_kg,
      MICHAEL.height_cm,
      MICHAEL.age,
      MICHAEL.sex,
      'moderate',
      'maintenance',
    );
    expect(p.bmr).toBeGreaterThan(0);
    expect(p.tdee).toBeGreaterThan(p.bmr);
    expect(p.protein_g).toBeGreaterThan(0);
    expect(p.calories).toBe(p.tdee); // maintenance = tdee
  });
});

describe('proteinPerMeal', () => {
  it('splits total protein across meals', () => {
    expect(proteinPerMeal(160, 4)).toBe(40);
  });

  it('defaults to 4 meals', () => {
    expect(proteinPerMeal(120)).toBe(30);
  });
});

describe('macroPercentage', () => {
  it('protein 40g at 4 kcal/g in 1600 kcal = 10%', () => {
    expect(macroPercentage(40, 4, 1600)).toBe(10);
  });

  it('fat 80g at 9 kcal/g in 1800 kcal = 40%', () => {
    expect(macroPercentage(80, 9, 1800)).toBe(40);
  });
});

describe('caloriesFromSteps', () => {
  it('10k steps @ 70kg ≈ 400 kcal', () => {
    expect(caloriesFromSteps(10000, 70)).toBe(400);
  });

  it('scales linearly with body weight', () => {
    const light = caloriesFromSteps(10000, 60);
    const heavy = caloriesFromSteps(10000, 90);
    expect(heavy).toBeGreaterThan(light);
  });
});

describe('remainingMacros', () => {
  const targets = { calories: 2000, protein_g: 150, carbs_g: 200, fat_g: 70, fiber_g: 28, water_ml: 2500 };

  it('subtracts consumed from targets', () => {
    const consumed = { calories: 500, protein_g: 40, carbs_g: 50, fat_g: 20, fiber_g: 5, water_ml: 500 };
    const r = remainingMacros(targets, consumed);
    expect(r.calories).toBe(1500);
    expect(r.protein_g).toBe(110);
    expect(r.water_ml).toBe(2000);
  });

  it('clamps at zero (never negative when consumed exceeds target)', () => {
    const consumed = { calories: 3000, protein_g: 200, carbs_g: 300, fat_g: 100, fiber_g: 50, water_ml: 3000 };
    const r = remainingMacros(targets, consumed);
    expect(r.calories).toBe(0);
    expect(r.protein_g).toBe(0);
    expect(r.water_ml).toBe(0);
  });
});
