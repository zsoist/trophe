/**
 * seed-benchmark-coverage.ts
 *
 * Seeds food_aliases, food_unit_conversions, and dish_recipes
 * to improve enterprise benchmark coverage.
 *
 * Run: npx tsx scripts/data/seed-benchmark-coverage.ts
 *
 * Safe: uses ON CONFLICT DO NOTHING / upsert patterns.
 */

import { createClient } from '@supabase/supabase-js';

process.loadEnvFile('.env.local');

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

// ═══════════════════════════════════════════════════
// 1. FOOD ALIASES — Greek/Spanish → English
// ═══════════════════════════════════════════════════

interface Alias {
  search_name_en: string; // Used to find the food_id in foods table
  aliases: string[];       // Greek/Spanish/colloquial names
}

const ALIASES: Alias[] = [
  // ── Greek Dairy ──
  { search_name_en: 'Feta Cheese', aliases: ['φέτα', 'feta', 'τυρί φέτα', 'queso feta'] },
  { search_name_en: 'Greek Yogurt Full Fat', aliases: ['γιαούρτι', 'γιαούρτι 10%', 'γιαούρτι ελληνικό', 'yogur griego', 'greek yogurt'] },
  { search_name_en: 'Halloumi Cheese', aliases: ['χαλούμι', 'halloumi', 'queso halloumi'] },
  { search_name_en: 'Graviera Cheese', aliases: ['γραβιέρα', 'γραβιέρα Κρήτης', 'graviera'] },
  { search_name_en: 'Cheese, cottage, lowfat, 2% milkfat', aliases: ['cottage cheese', 'queso cottage', 'τυρί cottage'] },

  // ── Greek Proteins ──
  { search_name_en: 'Souvlaki Chicken', aliases: ['σουβλάκι', 'σουβλάκι κοτόπουλο', 'souvlaki', 'souvlaki chicken'] },
  { search_name_en: 'Gyros Pork', aliases: ['γύρος', 'γύρο', 'γύρο χοιρινό', 'gyros', 'gyro'] },
  { search_name_en: 'Grilled Octopus', aliases: ['χταπόδι', 'χταπόδι ξιδάτο', 'octopus', 'pulpo'] },
  { search_name_en: 'Grilled Sea Bream', aliases: ['τσιπούρα', 'τσιπούρα ψητή', 'sea bream', 'dorada'] },
  { search_name_en: 'Sardines in Oil', aliases: ['σαρδέλες', 'σαρδέλες ψητές', 'sardinas', 'sardines'] },

  // ── Greek Composite Dishes ──
  { search_name_en: 'Moussaka', aliases: ['μουσακάς', 'μουσακά', 'musaka', 'moussaka'] },
  { search_name_en: 'Pastitsio', aliases: ['παστίτσιο', 'pastitsio', 'pasticcio'] },
  { search_name_en: 'Spanakopita', aliases: ['σπανακόπιτα', 'spanakopita', 'empanada de espinaca'] },
  { search_name_en: 'Tiropita', aliases: ['τυρόπιτα', 'tiropita', 'cheese pie'] },
  { search_name_en: 'Dolmades Stuffed Grape Leaves', aliases: ['ντολμάδες', 'ντολμαδάκια', 'dolmades', 'dolmas'] },
  { search_name_en: 'Fasolada Bean Soup', aliases: ['φασολάδα', 'φασολάδα φακές', 'fasolada', 'sopa de frijoles'] },

  // ── Greek Misc ──
  { search_name_en: 'Honey, strained or extracted', aliases: ['μέλι', 'μέλι Κρήτης', 'miel'] },
  { search_name_en: 'Oil, olive, salad or cooking', aliases: ['ελαιόλαδο', 'aceite de oliva', 'olive oil'] },
  { search_name_en: 'Olives, ripe, canned (small-extra large)', aliases: ['ελιές', 'ελιές Καλαμών', 'aceitunas', 'olives'] },

  // ── Eggs ──
  { search_name_en: 'Egg, whole, raw, fresh', aliases: ['αυγό', 'αυγά', 'huevo', 'huevos', 'eggs'] },

  // ── Bread/Bakery ──
  { search_name_en: 'Bread, whole-wheat, commercially prepared', aliases: ['ψωμί ολικής', 'ψωμί', 'pan integral', 'whole wheat bread'] },

  // ── Fruits ──
  { search_name_en: 'Avocados, raw, California', aliases: ['aguacate', 'avocado', 'αβοκάντο'] },
  { search_name_en: 'Oranges, raw, navels', aliases: ['πορτοκάλι', 'naranja', 'orange'] },
  { search_name_en: 'Bananas, raw', aliases: ['μπανάνα', 'banana', 'plátano', 'banano'] },

  // ── Grains ──
  { search_name_en: 'Oats (Includes foods for USDA\'s Food Distribution Program)', aliases: ['βρώμη', 'oatmeal', 'avena', 'oats', 'porridge'] },
  { search_name_en: 'Sweet potato, raw, unprepared (Includes foods for USDA\'s Food Distribution Program)', aliases: ['γλυκοπατάτα', 'sweet potato', 'batata', 'camote', 'boniato'] },
  { search_name_en: 'Quinoa, uncooked', aliases: ['κινόα', 'quinoa', 'quinua'] },
  { search_name_en: 'Rice, white, long-grain, regular, raw, unenriched', aliases: ['ρύζι', 'arroz', 'rice'] },
  { search_name_en: 'Pasta, dry, unenriched', aliases: ['μακαρόνια', 'pasta', 'spaghetti', 'fideos'] },
  { search_name_en: 'Lentils, raw', aliases: ['φακές', 'lentejas', 'lentils'] },

  // ── Proteins ──
  { search_name_en: 'Chicken, broilers or fryers, breast, skinless, boneless, meat only, raw', aliases: ['κοτόπουλο', 'στήθος κοτόπουλο', 'pollo', 'pechuga de pollo', 'chicken breast'] },
  { search_name_en: 'Beef, ground, 80% lean meat / 20% fat, raw', aliases: ['κιμάς', 'κιμά μοσχαρίσιο', 'carne molida', 'ground beef', 'mince'] },
  { search_name_en: 'Fish, salmon, Atlantic, farmed, raw', aliases: ['σολομός', 'salmon', 'salmón'] },
  { search_name_en: 'Fish, tuna, light, canned in water, drained solids', aliases: ['τόνος', 'atún', 'tuna', 'atún en agua'] },
  { search_name_en: 'Crustaceans, shrimp, mixed species, cooked, moist heat', aliases: ['γαρίδες', 'camarones', 'shrimp', 'gambas'] },
  { search_name_en: 'Mollusks, squid, mixed species, raw', aliases: ['καλαμάρι', 'καλαμάρι τηγανητό', 'calamari', 'squid', 'calamar'] },

  // ── Colombian ──
  { search_name_en: 'Restaurant, Latino, arepa (unleavened corn cake)', aliases: ['arepa', 'arepa con queso'] },
  { search_name_en: 'Restaurant, Latino, empanadas, beef, prepared', aliases: ['empanada', 'empanadas'] },

  // ── Beverages ──
  { search_name_en: 'Coffee, brewed from grounds, prepared with tap water', aliases: ['καφές', 'café', 'coffee'] },
  { search_name_en: 'Beverages, MONSTER ENERGY, low carb', aliases: ['monster', 'monster energy'] },

  // ── Misc common ──
  { search_name_en: 'Beans, black, mature seeds, cooked, boiled, without salt', aliases: ['frijoles', 'frijoles negros', 'φασόλια', 'black beans'] },
  { search_name_en: 'Milk, whole, 3.25% milkfat, with added vitamin D', aliases: ['γάλα', 'leche', 'milk', 'leche entera'] },
  { search_name_en: 'Butter, salted', aliases: ['βούτυρο', 'mantequilla', 'butter'] },
  { search_name_en: 'Nuts, almonds', aliases: ['αμύγδαλα', 'almendras', 'almonds'] },
  { search_name_en: 'Nuts, walnuts, english', aliases: ['καρύδια', 'nueces', 'walnuts'] },
];

// ═══════════════════════════════════════════════════
// 2. UNIT CONVERSIONS — Missing common units
// ═══════════════════════════════════════════════════

interface UnitConv {
  search_name_en: string;
  conversions: Array<{ unit: string; qualifier?: string; grams_per_unit: number }>;
}

const UNIT_CONVERSIONS: UnitConv[] = [
  // Greek Yogurt — cup, bowl
  { search_name_en: 'Greek Yogurt Full Fat', conversions: [
    { unit: 'cup', grams_per_unit: 245 },
    { unit: 'bowl', grams_per_unit: 200 },
    { unit: 'serving', grams_per_unit: 150 },
    { unit: 'μπολ', grams_per_unit: 200 },
    { unit: 'κουταλιά', grams_per_unit: 15 },
  ]},
  // Feta — more units
  { search_name_en: 'Feta Cheese', conversions: [
    { unit: 'piece', grams_per_unit: 30 },
    { unit: 'crumble', grams_per_unit: 15 },
    { unit: 'cup', grams_per_unit: 150 },
    { unit: 'φέτα', grams_per_unit: 30 },
    { unit: 'κομμάτι', grams_per_unit: 30 },
  ]},
  // Halloumi
  { search_name_en: 'Halloumi Cheese', conversions: [
    { unit: 'slice', grams_per_unit: 30 },
    { unit: 'piece', grams_per_unit: 30 },
    { unit: 'serving', grams_per_unit: 60 },
    { unit: 'φέτα', grams_per_unit: 30 },
  ]},
  // Eggs — already standard but ensure
  { search_name_en: 'Egg, whole, raw, fresh', conversions: [
    { unit: 'piece', grams_per_unit: 50 },
    { unit: 'large', grams_per_unit: 50 },
    { unit: 'medium', grams_per_unit: 44 },
  ]},
  // Avocado
  { search_name_en: 'Avocados, raw, California', conversions: [
    { unit: 'piece', grams_per_unit: 170 },
    { unit: 'medium', grams_per_unit: 150 },
    { unit: 'half', grams_per_unit: 75 },
    { unit: 'serving', grams_per_unit: 50 },
  ]},
  // Orange
  { search_name_en: 'Oranges, raw, navels', conversions: [
    { unit: 'piece', grams_per_unit: 140 },
    { unit: 'medium', grams_per_unit: 140 },
    { unit: 'large', grams_per_unit: 184 },
    { unit: 'small', grams_per_unit: 96 },
  ]},
  // Banana
  { search_name_en: 'Bananas, raw', conversions: [
    { unit: 'piece', grams_per_unit: 118 },
    { unit: 'medium', grams_per_unit: 118 },
    { unit: 'large', grams_per_unit: 136 },
    { unit: 'small', grams_per_unit: 81 },
  ]},
  // Oats
  { search_name_en: 'Oats (Includes foods for USDA\'s Food Distribution Program)', conversions: [
    { unit: 'cup', grams_per_unit: 81 },
    { unit: 'cup', qualifier: 'cooked', grams_per_unit: 234 },
    { unit: 'serving', grams_per_unit: 40 },
    { unit: 'bowl', grams_per_unit: 234 },
    { unit: 'μπολ', grams_per_unit: 234 },
  ]},
  // Sweet potato
  { search_name_en: 'Sweet potato, raw, unprepared (Includes foods for USDA\'s Food Distribution Program)', conversions: [
    { unit: 'piece', grams_per_unit: 130 },
    { unit: 'medium', grams_per_unit: 130 },
    { unit: 'large', grams_per_unit: 180 },
    { unit: 'cup', qualifier: 'baked', grams_per_unit: 200 },
  ]},
  // Quinoa
  { search_name_en: 'Quinoa, uncooked', conversions: [
    { unit: 'cup', grams_per_unit: 170 },
    { unit: 'cup', qualifier: 'cooked', grams_per_unit: 185 },
    { unit: 'serving', grams_per_unit: 45 },
  ]},
  // Tuna can
  { search_name_en: 'Fish, tuna, light, canned in water, drained solids', conversions: [
    { unit: 'can', grams_per_unit: 165 },
    { unit: 'lata', grams_per_unit: 165 },
    { unit: 'serving', grams_per_unit: 85 },
    { unit: 'κουτί', grams_per_unit: 165 },
  ]},
  // Cottage cheese
  { search_name_en: 'Cheese, cottage, lowfat, 2% milkfat', conversions: [
    { unit: 'cup', grams_per_unit: 226 },
    { unit: 'serving', grams_per_unit: 113 },
  ]},
  // Salmon
  { search_name_en: 'Fish, salmon, Atlantic, farmed, raw', conversions: [
    { unit: 'fillet', grams_per_unit: 170 },
    { unit: 'piece', grams_per_unit: 170 },
    { unit: 'serving', grams_per_unit: 170 },
  ]},
  // Chicken breast
  { search_name_en: 'Chicken, broilers or fryers, breast, skinless, boneless, meat only, raw', conversions: [
    { unit: 'piece', grams_per_unit: 174 },
    { unit: 'breast', grams_per_unit: 174 },
    { unit: 'serving', grams_per_unit: 140 },
    { unit: 'medium', grams_per_unit: 174 },
    { unit: 'στήθος', grams_per_unit: 174 },
  ]},
  // Ground beef
  { search_name_en: 'Beef, ground, 80% lean meat / 20% fat, raw', conversions: [
    { unit: 'serving', grams_per_unit: 113 },
    { unit: 'patty', grams_per_unit: 113 },
    { unit: 'cup', grams_per_unit: 240 },
  ]},
  // Shrimp
  { search_name_en: 'Crustaceans, shrimp, mixed species, cooked, moist heat', conversions: [
    { unit: 'piece', grams_per_unit: 6 },
    { unit: 'serving', grams_per_unit: 85 },
    { unit: 'μερίδα', grams_per_unit: 150 },
  ]},
  // Calamari
  { search_name_en: 'Mollusks, squid, mixed species, raw', conversions: [
    { unit: 'serving', grams_per_unit: 150 },
    { unit: 'μερίδα', grams_per_unit: 200 },
    { unit: 'piece', grams_per_unit: 200 },
  ]},
  // Sardines
  { search_name_en: 'Sardines in Oil', conversions: [
    { unit: 'piece', grams_per_unit: 25 },
    { unit: 'κομμάτι', grams_per_unit: 25 },
    { unit: 'serving', grams_per_unit: 150 },
    { unit: 'μερίδα', grams_per_unit: 150 },
  ]},
  // Sea bream
  { search_name_en: 'Grilled Sea Bream', conversions: [
    { unit: 'piece', grams_per_unit: 250 },
    { unit: 'serving', grams_per_unit: 250 },
    { unit: 'μερίδα', grams_per_unit: 250 },
  ]},
  // Octopus
  { search_name_en: 'Grilled Octopus', conversions: [
    { unit: 'serving', grams_per_unit: 200 },
    { unit: 'μερίδα', grams_per_unit: 200 },
  ]},
  // Gyros
  { search_name_en: 'Gyros Pork', conversions: [
    { unit: 'piece', grams_per_unit: 280 },
    { unit: 'wrap', grams_per_unit: 280 },
    { unit: 'serving', grams_per_unit: 280 },
  ]},
  // Souvlaki
  { search_name_en: 'Souvlaki Chicken', conversions: [
    { unit: 'skewer', grams_per_unit: 100 },
    { unit: 'wrap', grams_per_unit: 250 },
    { unit: 'piece', grams_per_unit: 250 },
  ]},
  // Spanakopita
  { search_name_en: 'Spanakopita', conversions: [
    { unit: 'piece', grams_per_unit: 130 },
    { unit: 'slice', grams_per_unit: 130 },
    { unit: 'κομμάτι', grams_per_unit: 130 },
    { unit: 'μερίδα', grams_per_unit: 130 },
  ]},
  // Tiropita
  { search_name_en: 'Tiropita', conversions: [
    { unit: 'piece', grams_per_unit: 100 },
    { unit: 'κομμάτι', grams_per_unit: 100 },
    { unit: 'μερίδα', grams_per_unit: 100 },
  ]},
  // Moussaka
  { search_name_en: 'Moussaka', conversions: [
    { unit: 'μερίδα', grams_per_unit: 260 },
  ]},
  // Pastitsio
  { search_name_en: 'Pastitsio', conversions: [
    { unit: 'μερίδα', grams_per_unit: 280 },
  ]},
  // Rice
  { search_name_en: 'Rice, white, long-grain, regular, raw, unenriched', conversions: [
    { unit: 'cup', qualifier: 'cooked', grams_per_unit: 186 },
    { unit: 'serving', grams_per_unit: 186 },
    { unit: 'πιάτο', grams_per_unit: 250 },
    { unit: 'μερίδα', grams_per_unit: 186 },
  ]},
  // Pasta
  { search_name_en: 'Pasta, dry, unenriched', conversions: [
    { unit: 'cup', qualifier: 'cooked', grams_per_unit: 140 },
    { unit: 'serving', grams_per_unit: 140 },
    { unit: 'μερίδα', grams_per_unit: 200 },
    { unit: 'πιάτο', grams_per_unit: 200 },
  ]},
  // Lentils
  { search_name_en: 'Lentils, raw', conversions: [
    { unit: 'cup', qualifier: 'cooked', grams_per_unit: 198 },
    { unit: 'serving', grams_per_unit: 198 },
    { unit: 'μερίδα', grams_per_unit: 300 },
    { unit: 'πιάτο', grams_per_unit: 350 },
  ]},
  // Beans
  { search_name_en: 'Beans, black, mature seeds, cooked, boiled, without salt', conversions: [
    { unit: 'cup', grams_per_unit: 172 },
    { unit: 'serving', grams_per_unit: 172 },
    { unit: 'μερίδα', grams_per_unit: 200 },
  ]},
  // Milk
  { search_name_en: 'Milk, whole, 3.25% milkfat, with added vitamin D', conversions: [
    { unit: 'cup', grams_per_unit: 244 },
    { unit: 'glass', grams_per_unit: 244 },
    { unit: 'ποτήρι', grams_per_unit: 244 },
  ]},
  // Olive oil
  { search_name_en: 'Oil, olive, salad or cooking', conversions: [
    { unit: 'tbsp', grams_per_unit: 14 },
    { unit: 'κουταλιά', grams_per_unit: 14 },
    { unit: 'drizzle', grams_per_unit: 7 },
  ]},
  // Honey
  { search_name_en: 'Honey, strained or extracted', conversions: [
    { unit: 'tbsp', grams_per_unit: 21 },
    { unit: 'tsp', grams_per_unit: 7 },
    { unit: 'κουταλιά', grams_per_unit: 21 },
    { unit: 'κουταλάκι', grams_per_unit: 7 },
  ]},
  // Empanada
  { search_name_en: 'Restaurant, Latino, empanadas, beef, prepared', conversions: [
    { unit: 'piece', grams_per_unit: 100 },
    { unit: 'serving', grams_per_unit: 100 },
  ]},
  // Arepa
  { search_name_en: 'Restaurant, Latino, arepa (unleavened corn cake)', conversions: [
    { unit: 'piece', grams_per_unit: 100 },
    { unit: 'serving', grams_per_unit: 100 },
  ]},
  // Olives
  { search_name_en: 'Olives, ripe, canned (small-extra large)', conversions: [
    { unit: 'piece', grams_per_unit: 4 },
    { unit: 'serving', grams_per_unit: 30 },
    { unit: 'κομμάτι', grams_per_unit: 4 },
  ]},
  // Bread
  { search_name_en: 'Bread, whole-wheat, commercially prepared', conversions: [
    { unit: 'slice', grams_per_unit: 33 },
    { unit: 'φέτα', grams_per_unit: 33 },
    { unit: 'piece', grams_per_unit: 33 },
  ]},
  // Almonds
  { search_name_en: 'Nuts, almonds', conversions: [
    { unit: 'handful', grams_per_unit: 30 },
    { unit: 'χούφτα', grams_per_unit: 30 },
    { unit: 'serving', grams_per_unit: 28 },
  ]},
  // Walnuts
  { search_name_en: 'Nuts, walnuts, english', conversions: [
    { unit: 'handful', grams_per_unit: 30 },
    { unit: 'χούφτα', grams_per_unit: 30 },
    { unit: 'serving', grams_per_unit: 28 },
  ]},
];

// ═══════════════════════════════════════════════════
// 3. DISH RECIPES — Composite dishes for cache
// ═══════════════════════════════════════════════════

interface DishRecipe {
  dish_name: string;
  dish_name_localized?: string;
  lang: string;
  region: string[];
  total_grams: number;
  total_kcal: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  total_fiber: number;
  ingredients: Array<{ food_name: string; grams: number }>;
  source: string;
  confidence: number;
  per_piece_grams?: number;
}

const DISH_RECIPES: DishRecipe[] = [
  // Greek dishes
  {
    dish_name: 'σουτζουκάκια με ρύζι',
    dish_name_localized: 'σουτζουκάκια με ρύζι',
    lang: 'el', region: ['GR'],
    total_grams: 400, total_kcal: 520, total_protein: 30, total_carbs: 45, total_fat: 22, total_fiber: 3,
    ingredients: [{ food_name: 'ground beef', grams: 150 }, { food_name: 'rice cooked', grams: 180 }, { food_name: 'tomato sauce', grams: 70 }],
    source: 'manual', confidence: 0.82, per_piece_grams: 400,
  },
  {
    dish_name: 'γεμιστά',
    dish_name_localized: 'γεμιστά',
    lang: 'el', region: ['GR'],
    total_grams: 350, total_kcal: 320, total_protein: 8, total_carbs: 40, total_fat: 15, total_fiber: 5,
    ingredients: [{ food_name: 'tomato', grams: 150 }, { food_name: 'rice', grams: 100 }, { food_name: 'olive oil', grams: 20 }, { food_name: 'herbs', grams: 10 }],
    source: 'manual', confidence: 0.80, per_piece_grams: 350,
  },
  {
    dish_name: 'μπριάμ',
    dish_name_localized: 'μπριάμ',
    lang: 'el', region: ['GR'],
    total_grams: 350, total_kcal: 280, total_protein: 5, total_carbs: 30, total_fat: 16, total_fiber: 6,
    ingredients: [{ food_name: 'zucchini', grams: 100 }, { food_name: 'potato', grams: 80 }, { food_name: 'eggplant', grams: 80 }, { food_name: 'tomato', grams: 60 }, { food_name: 'olive oil', grams: 20 }],
    source: 'manual', confidence: 0.80, per_piece_grams: 350,
  },
  {
    dish_name: 'χόρτα βραστά',
    dish_name_localized: 'χόρτα βραστά με λαδολέμονο',
    lang: 'el', region: ['GR'],
    total_grams: 250, total_kcal: 160, total_protein: 4, total_carbs: 8, total_fat: 14, total_fiber: 5,
    ingredients: [{ food_name: 'greens boiled', grams: 200 }, { food_name: 'olive oil', grams: 20 }, { food_name: 'lemon juice', grams: 15 }],
    source: 'manual', confidence: 0.80,
  },
  {
    dish_name: 'γαρίδες σαγανάκι',
    dish_name_localized: 'γαρίδες σαγανάκι',
    lang: 'el', region: ['GR'],
    total_grams: 300, total_kcal: 350, total_protein: 28, total_carbs: 12, total_fat: 20, total_fiber: 2,
    ingredients: [{ food_name: 'shrimp', grams: 180 }, { food_name: 'tomato sauce', grams: 80 }, { food_name: 'feta cheese', grams: 40 }],
    source: 'manual', confidence: 0.80,
  },
  {
    dish_name: 'αρνί ψητό',
    dish_name_localized: 'αρνί ψητό',
    lang: 'el', region: ['GR'],
    total_grams: 200, total_kcal: 440, total_protein: 38, total_carbs: 0, total_fat: 30, total_fiber: 0,
    ingredients: [{ food_name: 'lamb roasted', grams: 200 }],
    source: 'manual', confidence: 0.85, per_piece_grams: 100,
  },
  {
    dish_name: 'μπουγάτσα κρέμα',
    dish_name_localized: 'μπουγάτσα κρέμα',
    lang: 'el', region: ['GR'],
    total_grams: 180, total_kcal: 450, total_protein: 8, total_carbs: 48, total_fat: 25, total_fiber: 1,
    ingredients: [{ food_name: 'phyllo dough', grams: 80 }, { food_name: 'custard cream', grams: 100 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 180,
  },
  {
    dish_name: 'γαλακτομπούρεκο',
    dish_name_localized: 'γαλακτομπούρεκο',
    lang: 'el', region: ['GR'],
    total_grams: 150, total_kcal: 420, total_protein: 7, total_carbs: 52, total_fat: 20, total_fiber: 1,
    ingredients: [{ food_name: 'phyllo dough', grams: 50 }, { food_name: 'semolina custard', grams: 80 }, { food_name: 'sugar syrup', grams: 20 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 150,
  },
  {
    dish_name: 'μελομακάρονο',
    dish_name_localized: 'μελομακάρονο',
    lang: 'el', region: ['GR'],
    total_grams: 60, total_kcal: 230, total_protein: 3, total_carbs: 30, total_fat: 11, total_fiber: 1,
    ingredients: [{ food_name: 'flour', grams: 25 }, { food_name: 'olive oil', grams: 10 }, { food_name: 'honey syrup', grams: 15 }, { food_name: 'walnuts', grams: 5 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 60,
  },
  {
    dish_name: 'τσουρέκι',
    dish_name_localized: 'τσουρέκι',
    lang: 'el', region: ['GR'],
    total_grams: 80, total_kcal: 290, total_protein: 7, total_carbs: 42, total_fat: 10, total_fiber: 1,
    ingredients: [{ food_name: 'enriched bread', grams: 80 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 80,
  },
  {
    dish_name: 'κουλούρι θεσσαλονίκης',
    dish_name_localized: 'κουλούρι Θεσσαλονίκης',
    lang: 'el', region: ['GR'],
    total_grams: 80, total_kcal: 240, total_protein: 8, total_carbs: 42, total_fat: 4, total_fiber: 2,
    ingredients: [{ food_name: 'bread ring sesame', grams: 80 }],
    source: 'manual', confidence: 0.85, per_piece_grams: 80,
  },
  {
    dish_name: 'λουκουμάδες',
    dish_name_localized: 'λουκουμάδες',
    lang: 'el', region: ['GR'],
    total_grams: 30, total_kcal: 100, total_protein: 2, total_carbs: 14, total_fat: 4, total_fiber: 0,
    ingredients: [{ food_name: 'fried dough ball', grams: 25 }, { food_name: 'honey', grams: 5 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 30,
  },
  {
    dish_name: 'παστέλι',
    dish_name_localized: 'παστέλι',
    lang: 'el', region: ['GR'],
    total_grams: 40, total_kcal: 180, total_protein: 4, total_carbs: 22, total_fat: 9, total_fiber: 1,
    ingredients: [{ food_name: 'sesame seeds', grams: 20 }, { food_name: 'honey', grams: 20 }],
    source: 'manual', confidence: 0.82, per_piece_grams: 40,
  },
  {
    dish_name: 'κουλουράκια βουτύρου',
    dish_name_localized: 'κουλουράκια βουτύρου',
    lang: 'el', region: ['GR'],
    total_grams: 25, total_kcal: 110, total_protein: 2, total_carbs: 14, total_fat: 5, total_fiber: 0,
    ingredients: [{ food_name: 'butter cookies', grams: 25 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 25,
  },
  // Colombian dishes
  {
    dish_name: 'changua bogotana',
    dish_name_localized: 'changua bogotana',
    lang: 'es', region: ['CO'],
    total_grams: 350, total_kcal: 220, total_protein: 14, total_carbs: 12, total_fat: 12, total_fiber: 0,
    ingredients: [{ food_name: 'milk', grams: 200 }, { food_name: 'egg', grams: 50 }, { food_name: 'bread', grams: 30 }, { food_name: 'scallion', grams: 10 }],
    source: 'manual', confidence: 0.78,
  },
  {
    dish_name: 'lechona tolimense',
    dish_name_localized: 'lechona tolimense',
    lang: 'es', region: ['CO'],
    total_grams: 300, total_kcal: 580, total_protein: 35, total_carbs: 25, total_fat: 38, total_fiber: 2,
    ingredients: [{ food_name: 'pork roasted', grams: 180 }, { food_name: 'rice', grams: 80 }, { food_name: 'peas', grams: 30 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'buñuelo',
    dish_name_localized: 'buñuelo',
    lang: 'es', region: ['CO'],
    total_grams: 60, total_kcal: 180, total_protein: 5, total_carbs: 18, total_fat: 10, total_fiber: 0,
    ingredients: [{ food_name: 'cheese dough fried', grams: 60 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 60,
  },
  {
    dish_name: 'bandeja paisa',
    dish_name_localized: 'bandeja paisa',
    lang: 'es', region: ['CO'],
    total_grams: 600, total_kcal: 1100, total_protein: 55, total_carbs: 95, total_fat: 52, total_fiber: 12,
    ingredients: [{ food_name: 'rice', grams: 150 }, { food_name: 'beans', grams: 120 }, { food_name: 'ground beef', grams: 100 }, { food_name: 'plantain fried', grams: 80 }, { food_name: 'egg', grams: 50 }, { food_name: 'arepa', grams: 60 }, { food_name: 'avocado', grams: 40 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'sudado de pescado',
    dish_name_localized: 'sudado de pescado',
    lang: 'es', region: ['CO'],
    total_grams: 350, total_kcal: 280, total_protein: 30, total_carbs: 18, total_fat: 10, total_fiber: 3,
    ingredients: [{ food_name: 'white fish', grams: 200 }, { food_name: 'tomato', grams: 60 }, { food_name: 'potato', grams: 60 }, { food_name: 'onion', grams: 20 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'sopa de lentejas',
    dish_name_localized: 'sopa de lentejas con plátano',
    lang: 'es', region: ['CO'],
    total_grams: 400, total_kcal: 320, total_protein: 18, total_carbs: 48, total_fat: 6, total_fiber: 10,
    ingredients: [{ food_name: 'lentils', grams: 120 }, { food_name: 'plantain', grams: 80 }, { food_name: 'carrot', grams: 30 }, { food_name: 'potato', grams: 50 }],
    source: 'manual', confidence: 0.75,
  },
  // International composites
  {
    dish_name: 'pad thai chicken',
    dish_name_localized: 'pad thai chicken',
    lang: 'en', region: ['US'],
    total_grams: 400, total_kcal: 550, total_protein: 30, total_carbs: 60, total_fat: 20, total_fiber: 3,
    ingredients: [{ food_name: 'rice noodles', grams: 150 }, { food_name: 'chicken', grams: 120 }, { food_name: 'egg', grams: 50 }, { food_name: 'peanuts', grams: 15 }, { food_name: 'oil', grams: 15 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'chicken fajitas',
    dish_name_localized: 'chicken fajitas',
    lang: 'en', region: ['US'],
    total_grams: 350, total_kcal: 420, total_protein: 35, total_carbs: 30, total_fat: 18, total_fiber: 4,
    ingredients: [{ food_name: 'chicken', grams: 150 }, { food_name: 'tortilla', grams: 60 }, { food_name: 'peppers', grams: 80 }, { food_name: 'onion', grams: 40 }, { food_name: 'oil', grams: 10 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'beef burrito',
    dish_name_localized: 'beef burrito',
    lang: 'en', region: ['US'],
    total_grams: 400, total_kcal: 550, total_protein: 30, total_carbs: 50, total_fat: 24, total_fiber: 6,
    ingredients: [{ food_name: 'tortilla', grams: 80 }, { food_name: 'ground beef', grams: 120 }, { food_name: 'rice', grams: 80 }, { food_name: 'beans', grams: 60 }, { food_name: 'cheese', grams: 30 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'mushroom risotto',
    dish_name_localized: 'mushroom risotto',
    lang: 'en', region: ['US'],
    total_grams: 350, total_kcal: 420, total_protein: 12, total_carbs: 55, total_fat: 16, total_fiber: 3,
    ingredients: [{ food_name: 'arborio rice', grams: 160 }, { food_name: 'mushrooms', grams: 100 }, { food_name: 'parmesan', grams: 20 }, { food_name: 'butter', grams: 15 }, { food_name: 'onion', grams: 30 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'spaghetti bolognese',
    dish_name_localized: 'spaghetti bolognese',
    lang: 'en', region: ['US'],
    total_grams: 400, total_kcal: 520, total_protein: 28, total_carbs: 55, total_fat: 18, total_fiber: 4,
    ingredients: [{ food_name: 'pasta cooked', grams: 200 }, { food_name: 'ground beef', grams: 120 }, { food_name: 'tomato sauce', grams: 80 }],
    source: 'manual', confidence: 0.78,
  },
  {
    dish_name: 'fish and chips',
    dish_name_localized: 'fish and chips',
    lang: 'en', region: ['US'],
    total_grams: 400, total_kcal: 600, total_protein: 30, total_carbs: 50, total_fat: 30, total_fiber: 4,
    ingredients: [{ food_name: 'battered fish', grams: 200 }, { food_name: 'french fries', grams: 200 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'blt sandwich',
    dish_name_localized: 'BLT sandwich',
    lang: 'en', region: ['US'],
    total_grams: 200, total_kcal: 400, total_protein: 16, total_carbs: 30, total_fat: 24, total_fiber: 2,
    ingredients: [{ food_name: 'bread', grams: 60 }, { food_name: 'bacon', grams: 30 }, { food_name: 'lettuce', grams: 20 }, { food_name: 'tomato', grams: 40 }, { food_name: 'mayo', grams: 15 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'turkey sandwich',
    dish_name_localized: 'turkey sandwich on wheat bread',
    lang: 'en', region: ['US'],
    total_grams: 220, total_kcal: 350, total_protein: 25, total_carbs: 32, total_fat: 12, total_fiber: 4,
    ingredients: [{ food_name: 'wheat bread', grams: 66 }, { food_name: 'turkey breast', grams: 85 }, { food_name: 'lettuce', grams: 15 }, { food_name: 'tomato', grams: 30 }, { food_name: 'mustard', grams: 10 }],
    source: 'manual', confidence: 0.75,
  },
  {
    dish_name: 'cheeseburger',
    dish_name_localized: 'cheeseburger',
    lang: 'en', region: ['US'],
    total_grams: 200, total_kcal: 480, total_protein: 28, total_carbs: 32, total_fat: 26, total_fiber: 1,
    ingredients: [{ food_name: 'beef patty', grams: 113 }, { food_name: 'bun', grams: 50 }, { food_name: 'cheese', grams: 28 }, { food_name: 'ketchup', grams: 10 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 200,
  },
  {
    dish_name: 'pepperoni pizza',
    dish_name_localized: 'pepperoni pizza',
    lang: 'en', region: ['US'],
    total_grams: 120, total_kcal: 310, total_protein: 14, total_carbs: 30, total_fat: 14, total_fiber: 2,
    ingredients: [{ food_name: 'pizza dough', grams: 60 }, { food_name: 'tomato sauce', grams: 20 }, { food_name: 'mozzarella', grams: 25 }, { food_name: 'pepperoni', grams: 15 }],
    source: 'manual', confidence: 0.78, per_piece_grams: 120,
  },
  // Greek composite additions
  {
    dish_name: 'χωριάτικη σαλάτα',
    dish_name_localized: 'χωριάτικη σαλάτα',
    lang: 'el', region: ['GR'],
    total_grams: 350, total_kcal: 360, total_protein: 10, total_carbs: 12, total_fat: 30, total_fiber: 4,
    ingredients: [{ food_name: 'tomato', grams: 120 }, { food_name: 'cucumber', grams: 80 }, { food_name: 'feta', grams: 60 }, { food_name: 'olive oil', grams: 25 }, { food_name: 'olives', grams: 30 }, { food_name: 'onion', grams: 20 }],
    source: 'manual', confidence: 0.82,
  },
  {
    dish_name: 'τζατζίκι',
    dish_name_localized: 'τζατζίκι',
    lang: 'el', region: ['GR'],
    total_grams: 100, total_kcal: 75, total_protein: 5, total_carbs: 4, total_fat: 4, total_fiber: 0,
    ingredients: [{ food_name: 'yogurt strained', grams: 80 }, { food_name: 'cucumber', grams: 15 }, { food_name: 'garlic', grams: 2 }, { food_name: 'olive oil', grams: 3 }],
    source: 'manual', confidence: 0.82,
  },
];

// ═══════════════════════════════════════════════════
// EXECUTION
// ═══════════════════════════════════════════════════

async function findFoodId(nameEn: string): Promise<string | null> {
  const { data } = await sb.from('foods').select('id').ilike('name_en', nameEn).limit(1);
  return data?.[0]?.id || null;
}

function detectLang(text: string): string {
  // Greek Unicode range: U+0370–U+03FF, U+1F00–U+1FFF
  if (/[Ͱ-Ͽἀ-῿]/.test(text)) return 'el';
  // Spanish accented chars or common Spanish words
  if (/[áéíóúñ¿¡ü]/i.test(text)) return 'es';
  return 'en';
}

async function seedAliases() {
  console.log('\n═══ SEEDING ALIASES ═══');
  let inserted = 0, skipped = 0, notFound = 0;

  for (const entry of ALIASES) {
    const foodId = await findFoodId(entry.search_name_en);
    if (!foodId) {
      console.log(`  ⚠ Food not found: ${entry.search_name_en}`);
      notFound++;
      continue;
    }

    for (const aliasText of entry.aliases) {
      const lang = detectLang(aliasText);
      const row = { food_id: foodId, alias: aliasText.toLowerCase(), lang, preferred: false };
      const { error } = await sb.from('food_aliases').insert(row);
      if (error?.code === '23505') { skipped++; }
      else if (error) { console.log(`  ✗ ${aliasText}: ${error.message}`); }
      else { inserted++; }
    }
  }
  console.log(`  ✓ Aliases: ${inserted} inserted, ${skipped} skipped, ${notFound} foods not found`);
}

async function seedConversions() {
  console.log('\n═══ SEEDING UNIT CONVERSIONS ═══');
  let inserted = 0, skipped = 0, notFound = 0;

  for (const entry of UNIT_CONVERSIONS) {
    const foodId = await findFoodId(entry.search_name_en);
    if (!foodId) {
      console.log(`  ⚠ Food not found: ${entry.search_name_en}`);
      notFound++;
      continue;
    }

    for (const conv of entry.conversions) {
      const row = {
        food_id: foodId,
        unit: conv.unit,
        qualifier: conv.qualifier || null,
        grams_per_unit: conv.grams_per_unit,
        source: 'manual',
      };
      const { error } = await sb.from('food_unit_conversions').insert(row);
      if (error?.code === '23505') { skipped++; }
      else if (error) { console.log(`  ✗ ${conv.unit} for ${entry.search_name_en}: ${error.message}`); }
      else { inserted++; }
    }
  }
  console.log(`  ✓ Conversions: ${inserted} inserted, ${skipped} skipped, ${notFound} foods not found`);
}

async function seedRecipes() {
  console.log('\n═══ SEEDING DISH RECIPES ═══');
  let inserted = 0, skipped = 0;

  for (const recipe of DISH_RECIPES) {
    const row = {
      dish_name: recipe.dish_name.toLowerCase(),
      dish_name_localized: recipe.dish_name_localized || recipe.dish_name,
      lang: recipe.lang,
      region: recipe.region,
      total_grams: recipe.total_grams,
      total_kcal: recipe.total_kcal,
      total_protein: recipe.total_protein,
      total_carbs: recipe.total_carbs,
      total_fat: recipe.total_fat,
      total_fiber: recipe.total_fiber,
      ingredients: recipe.ingredients,
      source: recipe.source,
      confidence: recipe.confidence,
    };

    const { error } = await sb.from('dish_recipes').insert(row);
    if (error?.code === '23505') { skipped++; }
    else if (error) { console.log(`  ✗ ${recipe.dish_name}: ${error.message}`); }
    else { inserted++; }
  }
  console.log(`  ✓ Recipes: ${inserted} inserted, ${skipped} skipped`);
}

async function main() {
  console.log('🌱 seed-benchmark-coverage.ts');
  console.log('==============================');

  await seedAliases();
  await seedConversions();
  await seedRecipes();

  // Print totals
  const { count: fc } = await sb.from('foods').select('*', { count: 'exact', head: true });
  const { count: cc } = await sb.from('food_unit_conversions').select('*', { count: 'exact', head: true });
  const { count: rc } = await sb.from('dish_recipes').select('*', { count: 'exact', head: true });
  const { count: ac } = await sb.from('food_aliases').select('*', { count: 'exact', head: true });
  console.log(`\n📊 DB totals: ${fc} foods | ${cc} conversions | ${rc} recipes | ${ac} aliases`);
  console.log('Done!');
}

main().catch(console.error);
