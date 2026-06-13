// ═══════════════════════════════════════════════
// Greek / Mediterranean Foods Seed Data
// For insertion into custom_foods table
// ═══════════════════════════════════════════════

export interface GreekFoodSeed {
  name: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  unit: string;
  category: string;
}

export const GREEK_FOODS: GreekFoodSeed[] = [
  {
    name: 'Souvlaki (Chicken)',
    calories: 240,
    protein_g: 32,
    carbs_g: 2,
    fat_g: 12,
    fiber_g: 0,
    unit: '1 skewer (150g)',
    category: 'greek',
  },
  {
    name: 'Moussaka',
    calories: 350,
    protein_g: 18,
    carbs_g: 22,
    fat_g: 22,
    fiber_g: 3,
    unit: '1 serving (250g)',
    category: 'greek',
  },
  {
    name: 'Greek Salad (Horiatiki)',
    calories: 180,
    protein_g: 6,
    carbs_g: 8,
    fat_g: 14,
    fiber_g: 2,
    unit: '1 serving (200g)',
    category: 'greek',
  },
  {
    name: 'Feta Cheese',
    calories: 264,
    protein_g: 14,
    carbs_g: 4,
    fat_g: 21,
    fiber_g: 0,
    unit: '100g',
    category: 'greek',
  },
  {
    name: 'Tzatziki',
    calories: 55,
    protein_g: 3,
    carbs_g: 4,
    fat_g: 3,
    fiber_g: 0,
    unit: '100g',
    category: 'greek',
  },
  {
    name: 'Spanakopita',
    calories: 280,
    protein_g: 10,
    carbs_g: 22,
    fat_g: 18,
    fiber_g: 2,
    unit: '1 piece (130g)',
    category: 'greek',
  },
  {
    name: 'Gyros (Pork)',
    calories: 520,
    protein_g: 28,
    carbs_g: 42,
    fat_g: 26,
    fiber_g: 2,
    unit: '1 wrap (280g)',
    category: 'greek',
  },
  {
    name: 'Pastitsio',
    calories: 380,
    protein_g: 20,
    carbs_g: 32,
    fat_g: 20,
    fiber_g: 2,
    unit: '1 serving (250g)',
    category: 'greek',
  },
  {
    name: 'Dolmades (Stuffed Grape Leaves)',
    calories: 190,
    protein_g: 4,
    carbs_g: 22,
    fat_g: 10,
    fiber_g: 3,
    unit: '6 pieces (150g)',
    category: 'greek',
  },
  {
    name: 'Baklava',
    calories: 340,
    protein_g: 6,
    carbs_g: 42,
    fat_g: 18,
    fiber_g: 2,
    unit: '1 piece (80g)',
    category: 'greek',
  },
  {
    name: 'Halloumi Cheese',
    calories: 320,
    protein_g: 22,
    carbs_g: 3,
    fat_g: 25,
    fiber_g: 0,
    unit: '100g',
    category: 'greek',
  },
  {
    name: 'Greek Yogurt (Full Fat)',
    calories: 100,
    protein_g: 10,
    carbs_g: 4,
    fat_g: 5,
    fiber_g: 0,
    unit: '100g',
    category: 'greek',
  },
  {
    name: 'Pita Bread',
    calories: 165,
    protein_g: 5.5,
    carbs_g: 33,
    fat_g: 1,
    fiber_g: 1.3,
    unit: '1 pita (60g)',
    category: 'greek',
  },
  {
    name: 'Hummus',
    calories: 166,
    protein_g: 8,
    carbs_g: 14,
    fat_g: 10,
    fiber_g: 6,
    unit: '100g',
    category: 'mediterranean',
  },
  {
    name: 'Tabbouleh',
    calories: 120,
    protein_g: 3,
    carbs_g: 16,
    fat_g: 6,
    fiber_g: 3,
    unit: '100g',
    category: 'mediterranean',
  },
  {
    name: 'Grilled Octopus',
    calories: 164,
    protein_g: 30,
    carbs_g: 4,
    fat_g: 2,
    fiber_g: 0,
    unit: '150g',
    category: 'greek',
  },
  {
    name: 'Fasolada (Bean Soup)',
    calories: 220,
    protein_g: 12,
    carbs_g: 32,
    fat_g: 6,
    fiber_g: 10,
    unit: '1 bowl (300ml)',
    category: 'greek',
  },
  {
    name: 'Horiatiki (Village Salad)',
    calories: 195,
    protein_g: 7,
    carbs_g: 9,
    fat_g: 15,
    fiber_g: 2.5,
    unit: '1 serving (250g)',
    category: 'greek',
  },
  {
    name: 'Loukoumades',
    calories: 290,
    protein_g: 4,
    carbs_g: 38,
    fat_g: 14,
    fiber_g: 1,
    unit: '6 pieces (120g)',
    category: 'greek',
  },
  {
    name: 'Galaktoboureko',
    calories: 310,
    protein_g: 7,
    carbs_g: 36,
    fat_g: 16,
    fiber_g: 0.5,
    unit: '1 piece (120g)',
    category: 'greek',
  },
];

/**
 * SQL INSERT statement for seeding these foods into custom_foods table.
 * Run this in Supabase SQL editor, replacing {COACH_USER_ID} with the coach's UUID.
 */
export function generateSeedSQL(coachUserId: string): string {
  const values = GREEK_FOODS.map(
    (f) =>
      `('${coachUserId}', '${f.name.replace(/'/g, "''")}', ${f.calories}, ${f.protein_g}, ${f.carbs_g}, ${f.fat_g}, ${f.fiber_g}, '${f.unit}', '${f.category}', true)`
  ).join(',\n  ');

  return `INSERT INTO custom_foods (created_by, name, calories, protein_g, carbs_g, fat_g, fiber_g, unit, category, shared)
VALUES
  ${values};`;
}
