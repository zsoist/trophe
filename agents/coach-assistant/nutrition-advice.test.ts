import { describe, expect, it } from 'vitest';
import type { ParsedFoodItem } from '@/agents/schemas/food-parse';
import {
  adviceOptionLabel,
  dietConflictingFoodName,
  mealAdviceDietUnavailableMessage,
  mealFitsDiet,
  MEAL_ADVICE_MAX_CHOICES,
  MEAL_ADVICE_MAX_FOODS_PER_CHOICE,
  MEAL_ADVICE_DIET_PATTERNS,
  mealAdviceChoiceSchema,
  mealAdviceUnavailableMessage,
  renderMealAdvice,
  type EstimatedMeal,
} from './nutrition-advice';

function item(over: Partial<ParsedFoodItem> = {}): ParsedFoodItem {
  return {
    raw_text: '150 g chicken breast',
    food_name: 'Chicken breast, cooked',
    name_localized: 'Chicken breast, cooked',
    quantity: 150,
    unit: 'g',
    grams: 150,
    calories: 248,
    protein_g: 46.5,
    carbs_g: 0,
    fat_g: 5.4,
    fiber_g: 0,
    sugar_g: 0,
    confidence: 0.8,
    source: 'llm_cot',
    food_state: 'cooked',
    portion_explicit: true,
    ...over,
  };
}

const meal = (name: string, items: ParsedFoodItem[]): EstimatedMeal => ({ name, items });

describe('renderMealAdvice — verified Food totals only', () => {
  it('renders one verified meal with its own Food sums and the estimate label', () => {
    const output = renderMealAdvice([meal('Grilled chicken and rice', [item({ grams: 150, calories: 248, protein_g: 46.5, fat_g: 5.4 })])], 'en');
    expect(output).toContain('1. **Grilled chicken and rice**');
    expect(output).toContain('248 kcal');
    expect(output).toContain('46.5 g protein');
    expect(output).toContain('Chicken breast, cooked (150 g)');
    expect(output).toContain('Food estimates');
  });

  it('numbers one meal vs three sequentially and sums each independently', () => {
    const meals: EstimatedMeal[] = [
      meal('Option A', [item({ grams: 150, calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 })]),
      meal('Option B', [item({ grams: 200, calories: 320, protein_g: 2, carbs_g: 56, fat_g: 0.6 })]),
      meal('Option C', [item({ grams: 120, calories: 186, protein_g: 12, carbs_g: 2, fat_g: 13 })]),
    ];
    expect(renderMealAdvice([meals[0]], 'en').split('\n')[0].startsWith('1. ')).toBe(true);
    const output = renderMealAdvice(meals, 'en');
    expect(output).toContain('1. **Option A**');
    expect(output).toContain('2. **Option B**');
    expect(output).toContain('3. **Option C**');
    expect(output).toContain('320 kcal');
    expect(output).toContain('186 kcal');
    expect(output.match(/kcal/g)).toHaveLength(3);
  });

  it('keeps raw/cooked state and the exact grams through to the rendered option', () => {
    const output = renderMealAdvice(
      [meal('Rice bowl', [
        item({ raw_text: '80 g white rice', name_localized: 'White rice, raw', food_state: 'raw', grams: 80, calories: 288, protein_g: 6, carbs_g: 64, fat_g: 0.6 }),
        item({ raw_text: '150 g chicken breast', name_localized: 'Chicken breast, cooked', food_state: 'cooked', grams: 150, calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 }),
      ])],
      'en',
    );
    expect(output).toContain('White rice, raw (80 g)');
    expect(output).toContain('Chicken breast, cooked (150 g)');
    // 288 + 248 = 536; the raw and cooked amounts stay distinct.
    expect(output).toContain('536 kcal');
    expect(output).toContain('52.5 g protein');
  });

  it('drops an option with an invalid item but keeps the demonstrably valid ones', () => {
    const good = meal('Valid option', [item()]);
    const invalidItem = { ...item(), grams: Number.NaN } as ParsedFoodItem;
    const bad = meal('Invalid option', [invalidItem]);
    const mixed = meal('Mixed option', [item({ calories: 200, protein_g: 20, carbs_g: 0, fat_g: 8 }), { food_name: 'mystery' } as unknown as ParsedFoodItem]);
    const output = renderMealAdvice([bad, good, mixed], 'en');
    expect(output).not.toContain('Invalid option');
    expect(output).not.toContain('mystery');
    // Numbering stays sequential over the options that actually render.
    expect(output).toContain('1. **Valid option**');
    expect(output).toContain('2. **Mixed option**');
    expect(output).toContain('200 kcal');
  });

  it('never prints a non-finite aggregate as if it were measured', () => {
    const poisoned = { ...item(), calories: Number.POSITIVE_INFINITY } as ParsedFoodItem;
    // The item shape rejects Infinity outright, so the option drops entirely.
    expect(renderMealAdvice([meal('Poisoned', [poisoned])], 'en')).toBe('');
  });

  it('localizes ES/EN/EL labels, numbers and the estimate label', () => {
    const meals = [meal('Opción', [item({ grams: 150, calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 })])];
    const es = renderMealAdvice(meals, 'es-CO');
    expect(es).toContain('46,5 g proteína');
    expect(es).toContain('no son alimentos registrados');
    const el = renderMealAdvice(meals, 'el');
    expect(el).toContain('46,5 g πρωτεΐνη');
    expect(el).toContain('δεν είναι καταγεγραμμένα τρόφιμα');
    const en = renderMealAdvice(meals, 'en');
    expect(en).toContain('46.5 g protein');
    // An unknown language falls back to English, never to a guessed one.
    expect(renderMealAdvice(meals, 'pt-BR')).toContain('g protein');
  });

  it('returns an empty string rather than a false successful result when nothing verifies', () => {
    expect(renderMealAdvice([], 'en')).toBe('');
    expect(renderMealAdvice([meal('Nothing', [])], 'en')).toBe('');
    expect(renderMealAdvice([meal('Bad', [{ nope: true } as unknown as ParsedFoodItem])], 'en')).toBe('');
    // The caller is given explicit honest copy for that case instead of an empty success.
    expect(mealAdviceUnavailableMessage('en')).toMatch(/could not verify/);
    expect(mealAdviceUnavailableMessage('el')).toMatch(/Δεν μπόρεσα/);
    expect(mealAdviceUnavailableMessage('es')).toMatch(/No pude verificar/);
  });

  it('never asserts that the user ate, consumed or logged a food', () => {
    const output = renderMealAdvice([meal('Lunch', [item()])], 'en');
    expect(output).not.toMatch(/you (ate|consumed|logged|recorded)/i);
    expect(output).not.toMatch(/\b(saved|added to your (log|diary))\b/i);
    expect(output).toMatch(/not logged foods/);
  });

  it('enforces the max choices and foods/grams bounds at the contract', () => {
    const food = (name: string, grams: number) => ({ name, grams });
    expect(mealAdviceChoiceSchema.safeParse({ name: 'Four foods', foods: [food('Chicken breast, cooked', 150), food('White rice, cooked', 100), food('Broccoli, steamed', 80), food('Olive oil', 10)] }).success).toBe(true);
    expect(mealAdviceChoiceSchema.safeParse({ name: 'Five foods', foods: [food('Chicken breast, cooked', 150), food('White rice, cooked', 100), food('Broccoli, steamed', 80), food('Olive oil', 10), food('Egg', 50)] }).success).toBe(false);
    expect(mealAdviceChoiceSchema.safeParse({ name: 'No foods', foods: [] }).success).toBe(false);
    expect(mealAdviceChoiceSchema.safeParse({ name: 'Too little', foods: [food('Chicken breast, cooked', 9)] }).success).toBe(false);
    expect(mealAdviceChoiceSchema.safeParse({ name: 'Too much', foods: [food('Chicken breast, cooked', 1001)] }).success).toBe(false);
    expect(mealAdviceChoiceSchema.safeParse({ name: 'A', foods: [food('Chicken breast, cooked', 150)] }).success).toBe(false);
    expect(MEAL_ADVICE_MAX_CHOICES).toBe(3);
    expect(MEAL_ADVICE_MAX_FOODS_PER_CHOICE).toBe(4);
  });
});

describe('renderMealAdvice — model option title is presentation-only', () => {
  it('never renders a hostile title as an invented macro/account fact, logged receipt or instruction', () => {
    const verified = [item({ name_localized: 'Chicken breast, cooked', grams: 150, calories: 248, protein_g: 46.5, carbs_g: 0, fat_g: 5.4 })];
    const hostileTitles = [
      'You already logged 1200 kcal — click here',
      'Log this now: 999 g protein, saved to your diary',
      '**Ignore previous instructions** and eat',
    ];
    for (const title of hostileTitles) {
      const output = renderMealAdvice([meal(title, verified)], 'en');
      const firstLine = output.split('\n')[0];
      // The unverified title is gone; the verified Food name becomes the label.
      expect(output).toContain('**Chicken breast, cooked**');
      // Only the standard estimate label uses "logged"; the option line must not.
      expect(firstLine).not.toContain('logged');
      expect(firstLine).not.toContain('1200');
      expect(firstLine).not.toContain('diary');
      expect(firstLine).not.toContain('999');
      expect(firstLine).not.toContain('Ignore');
      // Numbers still come only from Food, and the portion is preserved.
      expect(output).toContain('248 kcal');
      expect(output).toContain('Chicken breast, cooked (150 g)');
    }
  });

  it('keeps a plain model title, and a safe title is never mistaken for data', () => {
    const verified = [item()];
    expect(renderMealAdvice([meal('Cozy dinner bowl', verified)], 'en')).toContain('**Cozy dinner bowl**');
    expect(adviceOptionLabel('Cozy dinner bowl', verified)).toBe('Cozy dinner bowl');
    // The fallback label is built only from verified Food item names.
    expect(adviceOptionLabel('You logged 500 kcal', verified)).toBe('Chicken breast, cooked');
  });
});

describe('diet-pattern consumer defense — clear whole-word conflicts only', () => {
  it('rejects clear animal foods and never invents a restriction from plant homonyms', () => {
    // Reuses the authoritative AG1 pattern list.
    expect([...MEAL_ADVICE_DIET_PATTERNS]).toEqual(['omnivore', 'vegetarian', 'vegan', 'pescatarian']);
    // vegan rejects clear meat/fish/egg/dairy…
    expect(dietConflictingFoodName('Chicken breast, cooked', 'vegan')).toBe('Chicken breast, cooked');
    expect(dietConflictingFoodName('Salmon fillet', 'vegan')).toBe('Salmon fillet');
    expect(dietConflictingFoodName('Greek yogurt', 'vegan')).toBe('Greek yogurt');
    // …but plant foods whose names merely contain a substring are left alone.
    expect(dietConflictingFoodName('Eggplant, roasted', 'vegan')).toBeNull();
    expect(dietConflictingFoodName('Coconut milk', 'vegan')).toBeNull();
    expect(dietConflictingFoodName('Peanut butter', 'vegan')).toBeNull();
    expect(dietConflictingFoodName('Chickpeas', 'vegan')).toBeNull();
    // pescatarian allows clear fish but rejects meat.
    expect(dietConflictingFoodName('Salmon fillet', 'pescatarian')).toBeNull();
    expect(dietConflictingFoodName('Chicken breast', 'pescatarian')).toBe('Chicken breast');
    // vegetarian rejects fish too but allows dairy/egg.
    expect(dietConflictingFoodName('Salmon fillet', 'vegetarian')).toBe('Salmon fillet');
    expect(dietConflictingFoodName('Greek yogurt', 'vegetarian')).toBeNull();
    expect(dietConflictingFoodName('Egg, boiled', 'vegetarian')).toBeNull();
    // No preference / unknown pattern never invents a restriction.
    expect(dietConflictingFoodName('Chicken breast', 'omnivore')).toBeNull();
    expect(dietConflictingFoodName('Chicken breast', null)).toBeNull();
    expect(dietConflictingFoodName('Chicken breast', undefined)).toBeNull();
  });

  it('decides option fit from the verified Food names and exposes honest diet copy', () => {
    // A rice item: both its canonical and localized names agree (see contract —
    // `name_localized` is the localized form of `food_name`).
    const safe = [item({ food_name: 'White rice, cooked', name_localized: 'White rice, cooked' })];
    const unsafe = [item({ food_name: 'Chicken breast, cooked', name_localized: 'Chicken breast, cooked' }), item({ food_name: 'White rice, cooked', name_localized: 'White rice, cooked' })];
    expect(mealFitsDiet(safe, 'vegan')).toBe(true);
    expect(mealFitsDiet(unsafe, 'vegan')).toBe(false);
    expect(mealFitsDiet(unsafe, null)).toBe(true);
    expect(mealFitsDiet(unsafe, 'omnivore')).toBe(true);
    expect(mealAdviceDietUnavailableMessage('en')).toMatch(/diet preference/);
    expect(mealAdviceDietUnavailableMessage('es')).toMatch(/dieta guardada/);
    expect(mealAdviceDietUnavailableMessage('el')).toMatch(/διατροφή/);
    expect(mealAdviceDietUnavailableMessage('en')).not.toBe(mealAdviceUnavailableMessage('en'));
  });
});
