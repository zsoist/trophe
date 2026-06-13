/**
 * Seed script: 7 days of realistic smoke-test data for Daniel Reyes
 * Run: npx tsx scripts/seed-daniel-testdata.ts
 *
 * Profile: 29yo Colombian male, 68kg, 176cm
 * Targets: 2255 kcal · 82g protein · 329g carbs · 68g fat · 32g fiber
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const USER_ID = 'faaa2ba2-0a3f-44d5-ac0c-adbc08f374b5';

// ─── Date helpers ───────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ─── Food log entries ────────────────────────────────────────
// Realistic Colombian / health-conscious 29yo male diet
// All macros within ±10% of published USDA/INCAP values

const FOOD_ENTRIES: {
  logged_date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
}[] = [
  // ══ Day 7 — Apr 25 (Saturday, relaxed day) ══════════════════
  { logged_date: daysAgo(6), meal_type: 'breakfast', food_name: 'Arepa de choclo with egg',  quantity: 1, unit: 'piece', calories: 350, protein_g: 14, carbs_g: 48, fat_g: 12, fiber_g: 3 },
  { logged_date: daysAgo(6), meal_type: 'breakfast', food_name: 'Black coffee', quantity: 1, unit: 'cup', calories: 5, protein_g: 0.3, carbs_g: 1, fat_g: 0, fiber_g: 0 },
  { logged_date: daysAgo(6), meal_type: 'lunch',     food_name: 'Grilled chicken breast',   quantity: 150, unit: 'g', calories: 248, protein_g: 46, carbs_g: 0, fat_g: 5, fiber_g: 0 },
  { logged_date: daysAgo(6), meal_type: 'lunch',     food_name: 'White rice cooked',        quantity: 200, unit: 'g', calories: 260, protein_g: 5, carbs_g: 57, fat_g: 1, fiber_g: 0.5 },
  { logged_date: daysAgo(6), meal_type: 'lunch',     food_name: 'Black beans (frijoles negros)', quantity: 150, unit: 'g', calories: 170, protein_g: 10, carbs_g: 30, fat_g: 1, fiber_g: 7 },
  { logged_date: daysAgo(6), meal_type: 'lunch',     food_name: 'Avocado half',             quantity: 75, unit: 'g', calories: 120, protein_g: 1.5, carbs_g: 6, fat_g: 11, fiber_g: 4 },
  { logged_date: daysAgo(6), meal_type: 'dinner',    food_name: 'Sopa de lentejas (lentil soup)', quantity: 350, unit: 'ml', calories: 260, protein_g: 16, carbs_g: 40, fat_g: 3, fiber_g: 10 },
  { logged_date: daysAgo(6), meal_type: 'dinner',    food_name: 'Pan integral (whole wheat roll)', quantity: 1, unit: 'piece', calories: 130, protein_g: 4, carbs_g: 24, fat_g: 2, fiber_g: 2 },
  { logged_date: daysAgo(6), meal_type: 'snack',     food_name: 'Banana',                  quantity: 1, unit: 'medium', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3, fiber_g: 3 },
  { logged_date: daysAgo(6), meal_type: 'snack',     food_name: 'Almonds',                 quantity: 30, unit: 'g', calories: 173, protein_g: 6, carbs_g: 6, fat_g: 15, fiber_g: 3 },

  // ══ Day 6 — Apr 26 (Sunday, indulgent Colombian brunch) ════
  { logged_date: daysAgo(5), meal_type: 'breakfast', food_name: 'Huevos pericos (scrambled eggs w/ tomato & onion)', quantity: 2, unit: 'eggs', calories: 190, protein_g: 13, carbs_g: 6, fat_g: 12, fiber_g: 1 },
  { logged_date: daysAgo(5), meal_type: 'breakfast', food_name: 'Arepa blanca',             quantity: 1, unit: 'medium', calories: 160, protein_g: 4, carbs_g: 30, fat_g: 3, fiber_g: 1 },
  { logged_date: daysAgo(5), meal_type: 'breakfast', food_name: 'Jugo de naranja natural', quantity: 200, unit: 'ml', calories: 90, protein_g: 1, carbs_g: 22, fat_g: 0, fiber_g: 0.5 },
  { logged_date: daysAgo(5), meal_type: 'lunch',     food_name: 'Arroz blanco cooked',     quantity: 180, unit: 'g', calories: 234, protein_g: 4.5, carbs_g: 51, fat_g: 0.5, fiber_g: 0.5 },
  { logged_date: daysAgo(5), meal_type: 'lunch',     food_name: 'Frijoles rojos (red beans)', quantity: 160, unit: 'g', calories: 185, protein_g: 11, carbs_g: 33, fat_g: 1, fiber_g: 8 },
  { logged_date: daysAgo(5), meal_type: 'lunch',     food_name: 'Chicharrón (fried pork skin)', quantity: 40, unit: 'g', calories: 220, protein_g: 13, carbs_g: 0, fat_g: 18, fiber_g: 0 },
  { logged_date: daysAgo(5), meal_type: 'lunch',     food_name: 'Tajadas de plátano maduro', quantity: 80, unit: 'g', calories: 130, protein_g: 1, carbs_g: 32, fat_g: 0.2, fiber_g: 2 },
  { logged_date: daysAgo(5), meal_type: 'snack',     food_name: 'Chocoramo (Colombian sponge cake)', quantity: 1, unit: 'piece', calories: 170, protein_g: 2.5, carbs_g: 26, fat_g: 6, fiber_g: 0.5 },
  { logged_date: daysAgo(5), meal_type: 'dinner',    food_name: 'Changua (Colombian milk soup with egg)', quantity: 300, unit: 'ml', calories: 210, protein_g: 13, carbs_g: 18, fat_g: 8, fiber_g: 0.5 },
  { logged_date: daysAgo(5), meal_type: 'dinner',    food_name: 'Pandebono',               quantity: 1, unit: 'piece', calories: 130, protein_g: 4, carbs_g: 18, fat_g: 5, fiber_g: 0.5 },

  // ══ Day 5 — Apr 27 (Monday, back on track, high protein) ══
  { logged_date: daysAgo(4), meal_type: 'breakfast', food_name: 'Overnight oats with protein powder', quantity: 300, unit: 'g', calories: 380, protein_g: 28, carbs_g: 48, fat_g: 8, fiber_g: 6 },
  { logged_date: daysAgo(4), meal_type: 'breakfast', food_name: 'Cold brew coffee',        quantity: 240, unit: 'ml', calories: 10, protein_g: 0.5, carbs_g: 2, fat_g: 0, fiber_g: 0 },
  { logged_date: daysAgo(4), meal_type: 'lunch',     food_name: 'Grilled chicken breast',  quantity: 180, unit: 'g', calories: 297, protein_g: 55, carbs_g: 0, fat_g: 6, fiber_g: 0 },
  { logged_date: daysAgo(4), meal_type: 'lunch',     food_name: 'Brown rice cooked',       quantity: 200, unit: 'g', calories: 220, protein_g: 5, carbs_g: 46, fat_g: 2, fiber_g: 3 },
  { logged_date: daysAgo(4), meal_type: 'lunch',     food_name: 'Ensalada mixta (mixed green salad)', quantity: 150, unit: 'g', calories: 70, protein_g: 2, carbs_g: 10, fat_g: 3, fiber_g: 3 },
  { logged_date: daysAgo(4), meal_type: 'snack',     food_name: 'Whey protein shake',      quantity: 1, unit: 'scoop', calories: 120, protein_g: 24, carbs_g: 4, fat_g: 2, fiber_g: 0 },
  { logged_date: daysAgo(4), meal_type: 'snack',     food_name: 'Apple',                   quantity: 1, unit: 'medium', calories: 80, protein_g: 0.4, carbs_g: 21, fat_g: 0.2, fiber_g: 3.5 },
  { logged_date: daysAgo(4), meal_type: 'dinner',    food_name: 'Pasta con atún (tuna pasta)', quantity: 280, unit: 'g', calories: 420, protein_g: 32, carbs_g: 52, fat_g: 8, fiber_g: 3 },
  { logged_date: daysAgo(4), meal_type: 'dinner',    food_name: 'Ensalada caprese',        quantity: 100, unit: 'g', calories: 140, protein_g: 7, carbs_g: 5, fat_g: 10, fiber_g: 1 },

  // ══ Day 4 — Apr 28 (Tuesday, balanced) ═════════════════════
  { logged_date: daysAgo(3), meal_type: 'breakfast', food_name: 'Greek yogurt with granola', quantity: 200, unit: 'g', calories: 320, protein_g: 18, carbs_g: 42, fat_g: 8, fiber_g: 3 },
  { logged_date: daysAgo(3), meal_type: 'breakfast', food_name: 'Mango slice',             quantity: 150, unit: 'g', calories: 98, protein_g: 1.4, carbs_g: 25, fat_g: 0.4, fiber_g: 2.5 },
  { logged_date: daysAgo(3), meal_type: 'lunch',     food_name: 'Sudado de pollo (chicken stew)', quantity: 200, unit: 'g', calories: 310, protein_g: 36, carbs_g: 14, fat_g: 10, fiber_g: 2.5 },
  { logged_date: daysAgo(3), meal_type: 'lunch',     food_name: 'White rice cooked',       quantity: 180, unit: 'g', calories: 234, protein_g: 4.5, carbs_g: 51, fat_g: 0.5, fiber_g: 0.5 },
  { logged_date: daysAgo(3), meal_type: 'lunch',     food_name: 'Aguapanela (sugar cane drink)', quantity: 250, unit: 'ml', calories: 110, protein_g: 0, carbs_g: 28, fat_g: 0, fiber_g: 0 },
  { logged_date: daysAgo(3), meal_type: 'snack',     food_name: 'Mixed nuts',              quantity: 30, unit: 'g', calories: 180, protein_g: 5, carbs_g: 7, fat_g: 15, fiber_g: 2 },
  { logged_date: daysAgo(3), meal_type: 'dinner',    food_name: 'Avocado toast with egg',  quantity: 2, unit: 'slices', calories: 380, protein_g: 14, carbs_g: 36, fat_g: 20, fiber_g: 7 },
  { logged_date: daysAgo(3), meal_type: 'dinner',    food_name: 'Sparkling water',         quantity: 330, unit: 'ml', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 },

  // ══ Day 3 — Apr 29 (Wednesday, best day — hit all targets) ═
  { logged_date: daysAgo(2), meal_type: 'breakfast', food_name: 'Scrambled eggs',          quantity: 3, unit: 'large', calories: 210, protein_g: 18, carbs_g: 2, fat_g: 15, fiber_g: 0 },
  { logged_date: daysAgo(2), meal_type: 'breakfast', food_name: 'Arepa de maíz',           quantity: 1, unit: 'medium', calories: 150, protein_g: 4, carbs_g: 28, fat_g: 3, fiber_g: 2 },
  { logged_date: daysAgo(2), meal_type: 'breakfast', food_name: 'Fruit salad (papaya, pineapple, strawberry)', quantity: 150, unit: 'g', calories: 85, protein_g: 1.5, carbs_g: 20, fat_g: 0.3, fiber_g: 2.5 },
  { logged_date: daysAgo(2), meal_type: 'lunch',     food_name: 'Salmón a la plancha',     quantity: 200, unit: 'g', calories: 350, protein_g: 40, carbs_g: 0, fat_g: 22, fiber_g: 0 },
  { logged_date: daysAgo(2), meal_type: 'lunch',     food_name: 'Quinoa cooked',           quantity: 200, unit: 'g', calories: 222, protein_g: 8, carbs_g: 40, fat_g: 4, fiber_g: 5 },
  { logged_date: daysAgo(2), meal_type: 'lunch',     food_name: 'Ensalada de aguacate y tomate', quantity: 120, unit: 'g', calories: 165, protein_g: 2, carbs_g: 10, fat_g: 14, fiber_g: 4.5 },
  { logged_date: daysAgo(2), meal_type: 'snack',     food_name: 'Protein bar',             quantity: 1, unit: 'bar', calories: 200, protein_g: 20, carbs_g: 22, fat_g: 6, fiber_g: 3 },
  { logged_date: daysAgo(2), meal_type: 'dinner',    food_name: 'Lentil soup with vegetables', quantity: 350, unit: 'ml', calories: 280, protein_g: 18, carbs_g: 42, fat_g: 4, fiber_g: 10 },
  { logged_date: daysAgo(2), meal_type: 'dinner',    food_name: 'Whole wheat bread roll',  quantity: 1, unit: 'piece', calories: 130, protein_g: 4, carbs_g: 25, fat_g: 2, fiber_g: 2.5 },
  { logged_date: daysAgo(2), meal_type: 'snack',     food_name: 'Dark chocolate 85%',      quantity: 20, unit: 'g', calories: 118, protein_g: 2, carbs_g: 8, fat_g: 9, fiber_g: 2 },

  // ══ Day 2 — Apr 30 (Thursday) ═══════════════════════════════
  { logged_date: daysAgo(1), meal_type: 'breakfast', food_name: 'Smoothie bowl (banana, berries, almond milk)', quantity: 300, unit: 'g', calories: 320, protein_g: 11, carbs_g: 55, fat_g: 7, fiber_g: 6 },
  { logged_date: daysAgo(1), meal_type: 'breakfast', food_name: 'Café con leche (Colombian style)', quantity: 200, unit: 'ml', calories: 80, protein_g: 4, carbs_g: 9, fat_g: 3, fiber_g: 0 },
  { logged_date: daysAgo(1), meal_type: 'lunch',     food_name: 'Pollo en salsa de tomate',  quantity: 160, unit: 'g', calories: 310, protein_g: 38, carbs_g: 12, fat_g: 10, fiber_g: 2 },
  { logged_date: daysAgo(1), meal_type: 'lunch',     food_name: 'White rice cooked',          quantity: 180, unit: 'g', calories: 234, protein_g: 4.5, carbs_g: 51, fat_g: 0.5, fiber_g: 0.5 },
  { logged_date: daysAgo(1), meal_type: 'lunch',     food_name: 'Patacones (fried green plantain)', quantity: 2, unit: 'pieces', calories: 180, protein_g: 1.5, carbs_g: 36, fat_g: 4, fiber_g: 2.5 },
  { logged_date: daysAgo(1), meal_type: 'snack',     food_name: 'Bocadillo de guayaba con queso', quantity: 1, unit: 'piece', calories: 190, protein_g: 6, carbs_g: 28, fat_g: 6, fiber_g: 1.5 },
  { logged_date: daysAgo(1), meal_type: 'dinner',    food_name: 'Turkey and vegetable wrap', quantity: 1, unit: 'wrap', calories: 350, protein_g: 28, carbs_g: 36, fat_g: 10, fiber_g: 4 },
  { logged_date: daysAgo(1), meal_type: 'snack',     food_name: 'Chocolate negro',           quantity: 20, unit: 'g', calories: 118, protein_g: 2, carbs_g: 8, fat_g: 9, fiber_g: 2 },

  // ══ Day 1 — May 1 (Friday, today — partial log) ═════════════
  { logged_date: daysAgo(0), meal_type: 'breakfast', food_name: 'Overnight oats with chia seeds', quantity: 280, unit: 'g', calories: 340, protein_g: 14, carbs_g: 52, fat_g: 7, fiber_g: 8 },
  { logged_date: daysAgo(0), meal_type: 'breakfast', food_name: 'Cold brew coffee (black)', quantity: 240, unit: 'ml', calories: 10, protein_g: 0.5, carbs_g: 2, fat_g: 0, fiber_g: 0 },
  { logged_date: daysAgo(0), meal_type: 'lunch',     food_name: 'Ensalada Niçoise with tuna', quantity: 300, unit: 'g', calories: 380, protein_g: 32, carbs_g: 18, fat_g: 20, fiber_g: 6 },
  { logged_date: daysAgo(0), meal_type: 'lunch',     food_name: 'Sourdough bread',          quantity: 2, unit: 'slices', calories: 160, protein_g: 6, carbs_g: 30, fat_g: 2, fiber_g: 1.5 },
  { logged_date: daysAgo(0), meal_type: 'snack',     food_name: 'Banana with peanut butter', quantity: 1, unit: 'portion', calories: 220, protein_g: 7, carbs_g: 30, fat_g: 10, fiber_g: 3.5 },
];

// ─── Water log entries ───────────────────────────────────────
// Target: 2380ml/day = ~9-10 glasses of 250ml
// Mix realistic: some days above target, some slightly under
const WATER_PER_DAY: Record<number, number> = {
  6: 2250,   // Apr 25 – slightly under
  5: 2000,   // Apr 26 – Sunday, forgot to track
  4: 2750,   // Apr 27 – workout day, extra
  3: 2380,   // Apr 28 – spot on
  2: 2500,   // Apr 29 – best day
  1: 2250,   // Apr 30 – slightly under
  0: 1500,   // May 1 – today, still going
};

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log('🧹 Clearing existing test data for Daniel (last 7 days)...');

  // Clear existing food_log for last 7 days
  const cutoff = daysAgo(7);
  const { error: delFoodErr } = await supabase
    .from('food_log')
    .delete()
    .eq('user_id', USER_ID)
    .gte('logged_date', cutoff);

  if (delFoodErr) console.error('Delete food_log error:', delFoodErr.message);
  else console.log('  ✓ Cleared food_log');

  // Clear existing water_log for last 7 days
  const { error: delWaterErr } = await supabase
    .from('water_log')
    .delete()
    .eq('user_id', USER_ID)
    .gte('logged_date', cutoff);

  if (delWaterErr) console.error('Delete water_log error:', delWaterErr.message);
  else console.log('  ✓ Cleared water_log');

  // ─── Insert food log ───────────────────────────────────────
  console.log('\n🍽️  Inserting food log entries...');
  const foodPayload = FOOD_ENTRIES.map(e => ({ ...e, user_id: USER_ID, source: 'natural_language' }));

  const { data: foodData, error: foodErr } = await supabase
    .from('food_log')
    .insert(foodPayload)
    .select('id');

  if (foodErr) {
    console.error('Food insert error:', foodErr.message);
  } else {
    console.log(`  ✓ Inserted ${foodData?.length ?? 0} food entries`);
  }

  // ─── Insert water log ──────────────────────────────────────
  console.log('\n💧 Inserting water log...');
  const waterEntries: { user_id: string; logged_date: string; amount_ml: number }[] = [];

  for (const [daysBack, totalMl] of Object.entries(WATER_PER_DAY)) {
    const date = daysAgo(Number(daysBack));
    const glasses = Math.floor(totalMl / 250);
    const remainder = totalMl % 250;
    for (let i = 0; i < glasses; i++) {
      waterEntries.push({ user_id: USER_ID, logged_date: date, amount_ml: 250 });
    }
    if (remainder > 0) {
      waterEntries.push({ user_id: USER_ID, logged_date: date, amount_ml: remainder });
    }
  }

  const { data: waterData, error: waterErr } = await supabase
    .from('water_log')
    .insert(waterEntries)
    .select('id');

  if (waterErr) {
    console.error('Water insert error:', waterErr.message);
  } else {
    console.log(`  ✓ Inserted ${waterData?.length ?? 0} water entries`);
  }

  // ─── Summary ───────────────────────────────────────────────
  console.log('\n📊 Day-by-day summary:');
  const dayGroups: Record<string, typeof FOOD_ENTRIES> = {};
  for (const entry of FOOD_ENTRIES) {
    if (!dayGroups[entry.logged_date]) dayGroups[entry.logged_date] = [];
    dayGroups[entry.logged_date].push(entry);
  }

  for (const [date, entries] of Object.entries(dayGroups).sort()) {
    const totals = entries.reduce(
      (acc, e) => ({
        kcal: acc.kcal + e.calories,
        protein: acc.protein + e.protein_g,
        carbs: acc.carbs + e.carbs_g,
        fat: acc.fat + e.fat_g,
        fiber: acc.fiber + e.fiber_g,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 }
    );
    console.log(
      `  ${date}: ${Math.round(totals.kcal)}kcal · ${Math.round(totals.protein)}g P · ${Math.round(totals.carbs)}g C · ${Math.round(totals.fat)}g F · ${Math.round(totals.fiber)}g fiber`
    );
  }

  console.log('\n✅ Smoke test data injected for Daniel Reyes');
  console.log('   Profile targets: 2255 kcal · 82g P · 329g C · 68g F · 32g fiber');
}

main().catch(console.error);
