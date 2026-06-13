/**
 * Seed: daniel@reyes.com account + 15 days of realistic food & water logs.
 *
 * Run:  npx tsx scripts/seed-daniel-15day.ts
 * Env:  NEXT_PUBLIC_SUPABASE_URL  (must point to LOCAL or DEV — never prod)
 *       SUPABASE_SERVICE_ROLE_KEY (bypasses RLS — admin only)
 *
 * Profile: 29yo Colombian male, 68kg, 176cm
 * Targets: 2255 kcal · 82g protein · 329g carbs · 68g fat · 32g fiber
 *
 * Narrative arc across the 15 days:
 *   d14–d10  chaotic baseline (weekend slips, missed protein)
 *   d09–d05  starting to dial in (more whole foods, hits protein 4/5 days)
 *   d04–d00  consistent execution (near-targets, planned weekend treat)
 */

import { createClient } from '@supabase/supabase-js';
import type { MealType } from '../../lib/types';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const EMAIL = 'daniel@reyes.com';
const PASSWORD = process.env.SEED_USER_PASSWORD;

// Hard fail if URL looks like prod — Trophē production is *.trophe.app or the
// hosted supabase.co project. Local supabase always exposes 127.0.0.1 / localhost.
if (!SUPABASE_URL || !SERVICE_KEY || !PASSWORD) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or SEED_USER_PASSWORD');
  process.exit(1);
}
const isLocal = /(127\.0\.0\.1|localhost)/.test(SUPABASE_URL);
if (!isLocal && !process.env.ALLOW_REMOTE_SEED) {
  console.error(`✋ Refusing to seed: ${SUPABASE_URL} does not look local.`);
  console.error('   Set ALLOW_REMOTE_SEED=1 to override (only if you know it is a dev project).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ─────────────────────────────────────────────────
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

type Entry = {
  daysBack: number;
  meal_type: MealType;
  food_name: string;
  quantity: number;
  unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
};

// ─── Food entries: 15 days, oldest → newest ──────────────────
const FOOD_ENTRIES: Entry[] = [
  // ══ d14 — Chaotic baseline. Late breakfast, fast food lunch ══
  { daysBack: 14, meal_type: 'breakfast', food_name: 'Café con leche', quantity: 200, unit: 'ml', calories: 80, protein_g: 4, carbs_g: 9, fat_g: 3, fiber_g: 0 },
  { daysBack: 14, meal_type: 'breakfast', food_name: 'Pandebono', quantity: 2, unit: 'piece', calories: 260, protein_g: 8, carbs_g: 36, fat_g: 10, fiber_g: 1 },
  { daysBack: 14, meal_type: 'lunch', food_name: 'Hamburguesa sencilla', quantity: 1, unit: 'piece', calories: 540, protein_g: 26, carbs_g: 42, fat_g: 28, fiber_g: 2 },
  { daysBack: 14, meal_type: 'lunch', food_name: 'Papas fritas', quantity: 120, unit: 'g', calories: 365, protein_g: 4, carbs_g: 48, fat_g: 17, fiber_g: 4 },
  { daysBack: 14, meal_type: 'lunch', food_name: 'Coca-Cola', quantity: 330, unit: 'ml', calories: 139, protein_g: 0, carbs_g: 35, fat_g: 0, fiber_g: 0 },
  { daysBack: 14, meal_type: 'snack', food_name: 'Bocadillo de guayaba', quantity: 1, unit: 'piece', calories: 130, protein_g: 0.5, carbs_g: 32, fat_g: 0, fiber_g: 1 },
  { daysBack: 14, meal_type: 'dinner', food_name: 'Pizza muzzarella (3 slices)', quantity: 3, unit: 'slices', calories: 720, protein_g: 30, carbs_g: 90, fat_g: 26, fiber_g: 4 },

  // ══ d13 — Skipped breakfast, big dinner ══
  { daysBack: 13, meal_type: 'breakfast', food_name: 'Black coffee', quantity: 1, unit: 'cup', calories: 5, protein_g: 0.3, carbs_g: 1, fat_g: 0, fiber_g: 0 },
  { daysBack: 13, meal_type: 'lunch', food_name: 'Empanadas de carne', quantity: 3, unit: 'piece', calories: 480, protein_g: 18, carbs_g: 48, fat_g: 24, fiber_g: 2 },
  { daysBack: 13, meal_type: 'lunch', food_name: 'Ají picante', quantity: 30, unit: 'g', calories: 15, protein_g: 0.5, carbs_g: 3, fat_g: 0.2, fiber_g: 1 },
  { daysBack: 13, meal_type: 'snack', food_name: 'Galletas Saltinas', quantity: 6, unit: 'piece', calories: 180, protein_g: 4, carbs_g: 30, fat_g: 5, fiber_g: 1 },
  { daysBack: 13, meal_type: 'dinner', food_name: 'Bandeja paisa (partial)', quantity: 1, unit: 'plate', calories: 980, protein_g: 48, carbs_g: 78, fat_g: 52, fiber_g: 12 },
  { daysBack: 13, meal_type: 'snack', food_name: 'Helado de vainilla', quantity: 120, unit: 'g', calories: 240, protein_g: 4, carbs_g: 28, fat_g: 13, fiber_g: 0 },

  // ══ d12 — Weekend brunch, sangría, late ══
  { daysBack: 12, meal_type: 'breakfast', food_name: 'Huevos pericos', quantity: 2, unit: 'eggs', calories: 190, protein_g: 13, carbs_g: 6, fat_g: 12, fiber_g: 1 },
  { daysBack: 12, meal_type: 'breakfast', food_name: 'Arepa con queso', quantity: 1, unit: 'piece', calories: 280, protein_g: 10, carbs_g: 32, fat_g: 12, fiber_g: 2 },
  { daysBack: 12, meal_type: 'breakfast', food_name: 'Jugo de mora', quantity: 250, unit: 'ml', calories: 130, protein_g: 1, carbs_g: 32, fat_g: 0, fiber_g: 2 },
  { daysBack: 12, meal_type: 'lunch', food_name: 'Ajiaco bogotano', quantity: 400, unit: 'ml', calories: 420, protein_g: 28, carbs_g: 38, fat_g: 16, fiber_g: 5 },
  { daysBack: 12, meal_type: 'lunch', food_name: 'Aguacate y alcaparras', quantity: 60, unit: 'g', calories: 110, protein_g: 1.5, carbs_g: 6, fat_g: 10, fiber_g: 4 },
  { daysBack: 12, meal_type: 'snack', food_name: 'Sangría (1 vaso)', quantity: 250, unit: 'ml', calories: 200, protein_g: 0.5, carbs_g: 22, fat_g: 0, fiber_g: 0.5 },
  { daysBack: 12, meal_type: 'dinner', food_name: 'Tacos al pastor (3)', quantity: 3, unit: 'piece', calories: 540, protein_g: 28, carbs_g: 48, fat_g: 24, fiber_g: 4 },

  // ══ d11 — Forgot to log lunch, only 2 meals ══
  { daysBack: 11, meal_type: 'breakfast', food_name: 'Avena con leche y banano', quantity: 350, unit: 'g', calories: 360, protein_g: 14, carbs_g: 58, fat_g: 8, fiber_g: 7 },
  { daysBack: 11, meal_type: 'dinner', food_name: 'Pollo asado (1/4)', quantity: 1, unit: 'portion', calories: 380, protein_g: 42, carbs_g: 0, fat_g: 22, fiber_g: 0 },
  { daysBack: 11, meal_type: 'dinner', food_name: 'Arroz blanco', quantity: 150, unit: 'g', calories: 195, protein_g: 4, carbs_g: 43, fat_g: 0.5, fiber_g: 0.5 },
  { daysBack: 11, meal_type: 'dinner', food_name: 'Ensalada César', quantity: 150, unit: 'g', calories: 220, protein_g: 6, carbs_g: 12, fat_g: 16, fiber_g: 3 },

  // ══ d10 — Trying to dial in: more protein, fewer snacks ══
  { daysBack: 10, meal_type: 'breakfast', food_name: 'Tortilla de claras (4 claras)', quantity: 1, unit: 'piece', calories: 110, protein_g: 22, carbs_g: 1, fat_g: 1, fiber_g: 0 },
  { daysBack: 10, meal_type: 'breakfast', food_name: 'Pan integral tostado', quantity: 2, unit: 'slices', calories: 160, protein_g: 6, carbs_g: 30, fat_g: 2, fiber_g: 4 },
  { daysBack: 10, meal_type: 'breakfast', food_name: 'Aguacate', quantity: 80, unit: 'g', calories: 130, protein_g: 1.5, carbs_g: 7, fat_g: 12, fiber_g: 5 },
  { daysBack: 10, meal_type: 'lunch', food_name: 'Pechuga de pollo a la plancha', quantity: 180, unit: 'g', calories: 297, protein_g: 55, carbs_g: 0, fat_g: 6, fiber_g: 0 },
  { daysBack: 10, meal_type: 'lunch', food_name: 'Quinoa cocida', quantity: 180, unit: 'g', calories: 200, protein_g: 7, carbs_g: 36, fat_g: 3, fiber_g: 4 },
  { daysBack: 10, meal_type: 'lunch', food_name: 'Brócoli al vapor', quantity: 150, unit: 'g', calories: 55, protein_g: 4, carbs_g: 11, fat_g: 0.5, fiber_g: 4 },
  { daysBack: 10, meal_type: 'snack', food_name: 'Yogur griego natural', quantity: 200, unit: 'g', calories: 130, protein_g: 18, carbs_g: 8, fat_g: 4, fiber_g: 0 },
  { daysBack: 10, meal_type: 'dinner', food_name: 'Salmón al horno', quantity: 150, unit: 'g', calories: 270, protein_g: 32, carbs_g: 0, fat_g: 16, fiber_g: 0 },
  { daysBack: 10, meal_type: 'dinner', food_name: 'Espárragos asados', quantity: 120, unit: 'g', calories: 30, protein_g: 3, carbs_g: 5, fat_g: 0.3, fiber_g: 3 },

  // ══ d9 — Workout day, post-workout meal ══
  { daysBack: 9, meal_type: 'breakfast', food_name: 'Overnight oats con proteína', quantity: 320, unit: 'g', calories: 390, protein_g: 28, carbs_g: 50, fat_g: 8, fiber_g: 7 },
  { daysBack: 9, meal_type: 'pre_workout', food_name: 'Banano', quantity: 1, unit: 'medium', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3, fiber_g: 3 },
  { daysBack: 9, meal_type: 'post_workout', food_name: 'Whey protein shake', quantity: 1, unit: 'scoop', calories: 120, protein_g: 24, carbs_g: 4, fat_g: 2, fiber_g: 0 },
  { daysBack: 9, meal_type: 'lunch', food_name: 'Bowl de atún y arroz integral', quantity: 380, unit: 'g', calories: 480, protein_g: 38, carbs_g: 58, fat_g: 10, fiber_g: 5 },
  { daysBack: 9, meal_type: 'snack', food_name: 'Manzana', quantity: 1, unit: 'medium', calories: 80, protein_g: 0.4, carbs_g: 21, fat_g: 0.2, fiber_g: 3.5 },
  { daysBack: 9, meal_type: 'snack', food_name: 'Mantequilla de maní', quantity: 16, unit: 'g', calories: 95, protein_g: 4, carbs_g: 3, fat_g: 8, fiber_g: 1 },
  { daysBack: 9, meal_type: 'dinner', food_name: 'Carne de res (lomo)', quantity: 150, unit: 'g', calories: 260, protein_g: 36, carbs_g: 0, fat_g: 12, fiber_g: 0 },
  { daysBack: 9, meal_type: 'dinner', food_name: 'Batatas asadas', quantity: 180, unit: 'g', calories: 160, protein_g: 3, carbs_g: 37, fat_g: 0.3, fiber_g: 6 },

  // ══ d8 — Office lunch, balanced ══
  { daysBack: 8, meal_type: 'breakfast', food_name: 'Smoothie de fresa y proteína', quantity: 400, unit: 'ml', calories: 310, protein_g: 26, carbs_g: 40, fat_g: 4, fiber_g: 5 },
  { daysBack: 8, meal_type: 'lunch', food_name: 'Ensalada César con pollo', quantity: 350, unit: 'g', calories: 480, protein_g: 38, carbs_g: 18, fat_g: 28, fiber_g: 4 },
  { daysBack: 8, meal_type: 'snack', food_name: 'Almendras', quantity: 30, unit: 'g', calories: 173, protein_g: 6, carbs_g: 6, fat_g: 15, fiber_g: 3 },
  { daysBack: 8, meal_type: 'snack', food_name: 'Té verde', quantity: 240, unit: 'ml', calories: 3, protein_g: 0, carbs_g: 1, fat_g: 0, fiber_g: 0 },
  { daysBack: 8, meal_type: 'dinner', food_name: 'Trucha al horno', quantity: 170, unit: 'g', calories: 300, protein_g: 35, carbs_g: 0, fat_g: 18, fiber_g: 0 },
  { daysBack: 8, meal_type: 'dinner', food_name: 'Arroz integral', quantity: 150, unit: 'g', calories: 165, protein_g: 4, carbs_g: 34, fat_g: 1.5, fiber_g: 2 },
  { daysBack: 8, meal_type: 'dinner', food_name: 'Ensalada verde', quantity: 120, unit: 'g', calories: 50, protein_g: 2, carbs_g: 8, fat_g: 2, fiber_g: 3 },

  // ══ d7..d0 — original 7 days seed pattern (slightly tightened) ══
  // d7 — Saturday relaxed
  { daysBack: 7, meal_type: 'breakfast', food_name: 'Arepa de choclo con huevo', quantity: 1, unit: 'piece', calories: 350, protein_g: 14, carbs_g: 48, fat_g: 12, fiber_g: 3 },
  { daysBack: 7, meal_type: 'breakfast', food_name: 'Black coffee', quantity: 1, unit: 'cup', calories: 5, protein_g: 0.3, carbs_g: 1, fat_g: 0, fiber_g: 0 },
  { daysBack: 7, meal_type: 'lunch', food_name: 'Pechuga de pollo a la plancha', quantity: 150, unit: 'g', calories: 248, protein_g: 46, carbs_g: 0, fat_g: 5, fiber_g: 0 },
  { daysBack: 7, meal_type: 'lunch', food_name: 'Arroz blanco', quantity: 200, unit: 'g', calories: 260, protein_g: 5, carbs_g: 57, fat_g: 1, fiber_g: 0.5 },
  { daysBack: 7, meal_type: 'lunch', food_name: 'Frijoles negros', quantity: 150, unit: 'g', calories: 170, protein_g: 10, carbs_g: 30, fat_g: 1, fiber_g: 7 },
  { daysBack: 7, meal_type: 'lunch', food_name: 'Aguacate', quantity: 75, unit: 'g', calories: 120, protein_g: 1.5, carbs_g: 6, fat_g: 11, fiber_g: 4 },
  { daysBack: 7, meal_type: 'dinner', food_name: 'Sopa de lentejas', quantity: 350, unit: 'ml', calories: 260, protein_g: 16, carbs_g: 40, fat_g: 3, fiber_g: 10 },
  { daysBack: 7, meal_type: 'dinner', food_name: 'Pan integral', quantity: 1, unit: 'piece', calories: 130, protein_g: 4, carbs_g: 24, fat_g: 2, fiber_g: 2 },
  { daysBack: 7, meal_type: 'snack', food_name: 'Banano', quantity: 1, unit: 'medium', calories: 105, protein_g: 1.3, carbs_g: 27, fat_g: 0.3, fiber_g: 3 },
  { daysBack: 7, meal_type: 'snack', food_name: 'Almendras', quantity: 30, unit: 'g', calories: 173, protein_g: 6, carbs_g: 6, fat_g: 15, fiber_g: 3 },

  // d6 — Sunday brunch indulgent
  { daysBack: 6, meal_type: 'breakfast', food_name: 'Huevos pericos', quantity: 2, unit: 'eggs', calories: 190, protein_g: 13, carbs_g: 6, fat_g: 12, fiber_g: 1 },
  { daysBack: 6, meal_type: 'breakfast', food_name: 'Arepa blanca', quantity: 1, unit: 'medium', calories: 160, protein_g: 4, carbs_g: 30, fat_g: 3, fiber_g: 1 },
  { daysBack: 6, meal_type: 'breakfast', food_name: 'Jugo de naranja natural', quantity: 200, unit: 'ml', calories: 90, protein_g: 1, carbs_g: 22, fat_g: 0, fiber_g: 0.5 },
  { daysBack: 6, meal_type: 'lunch', food_name: 'Arroz blanco', quantity: 180, unit: 'g', calories: 234, protein_g: 4.5, carbs_g: 51, fat_g: 0.5, fiber_g: 0.5 },
  { daysBack: 6, meal_type: 'lunch', food_name: 'Frijoles rojos', quantity: 160, unit: 'g', calories: 185, protein_g: 11, carbs_g: 33, fat_g: 1, fiber_g: 8 },
  { daysBack: 6, meal_type: 'lunch', food_name: 'Chicharrón', quantity: 40, unit: 'g', calories: 220, protein_g: 13, carbs_g: 0, fat_g: 18, fiber_g: 0 },
  { daysBack: 6, meal_type: 'lunch', food_name: 'Tajadas de plátano maduro', quantity: 80, unit: 'g', calories: 130, protein_g: 1, carbs_g: 32, fat_g: 0.2, fiber_g: 2 },
  { daysBack: 6, meal_type: 'snack', food_name: 'Chocoramo', quantity: 1, unit: 'piece', calories: 170, protein_g: 2.5, carbs_g: 26, fat_g: 6, fiber_g: 0.5 },
  { daysBack: 6, meal_type: 'dinner', food_name: 'Changua', quantity: 300, unit: 'ml', calories: 210, protein_g: 13, carbs_g: 18, fat_g: 8, fiber_g: 0.5 },
  { daysBack: 6, meal_type: 'dinner', food_name: 'Pandebono', quantity: 1, unit: 'piece', calories: 130, protein_g: 4, carbs_g: 18, fat_g: 5, fiber_g: 0.5 },

  // d5 — Monday high protein
  { daysBack: 5, meal_type: 'breakfast', food_name: 'Overnight oats con proteína', quantity: 300, unit: 'g', calories: 380, protein_g: 28, carbs_g: 48, fat_g: 8, fiber_g: 6 },
  { daysBack: 5, meal_type: 'breakfast', food_name: 'Cold brew coffee', quantity: 240, unit: 'ml', calories: 10, protein_g: 0.5, carbs_g: 2, fat_g: 0, fiber_g: 0 },
  { daysBack: 5, meal_type: 'lunch', food_name: 'Pechuga de pollo a la plancha', quantity: 180, unit: 'g', calories: 297, protein_g: 55, carbs_g: 0, fat_g: 6, fiber_g: 0 },
  { daysBack: 5, meal_type: 'lunch', food_name: 'Arroz integral', quantity: 200, unit: 'g', calories: 220, protein_g: 5, carbs_g: 46, fat_g: 2, fiber_g: 3 },
  { daysBack: 5, meal_type: 'lunch', food_name: 'Ensalada mixta', quantity: 150, unit: 'g', calories: 70, protein_g: 2, carbs_g: 10, fat_g: 3, fiber_g: 3 },
  { daysBack: 5, meal_type: 'snack', food_name: 'Whey protein shake', quantity: 1, unit: 'scoop', calories: 120, protein_g: 24, carbs_g: 4, fat_g: 2, fiber_g: 0 },
  { daysBack: 5, meal_type: 'snack', food_name: 'Manzana', quantity: 1, unit: 'medium', calories: 80, protein_g: 0.4, carbs_g: 21, fat_g: 0.2, fiber_g: 3.5 },
  { daysBack: 5, meal_type: 'dinner', food_name: 'Pasta con atún', quantity: 280, unit: 'g', calories: 420, protein_g: 32, carbs_g: 52, fat_g: 8, fiber_g: 3 },
  { daysBack: 5, meal_type: 'dinner', food_name: 'Ensalada caprese', quantity: 100, unit: 'g', calories: 140, protein_g: 7, carbs_g: 5, fat_g: 10, fiber_g: 1 },

  // d4 — Balanced Tuesday
  { daysBack: 4, meal_type: 'breakfast', food_name: 'Yogur griego con granola', quantity: 200, unit: 'g', calories: 320, protein_g: 18, carbs_g: 42, fat_g: 8, fiber_g: 3 },
  { daysBack: 4, meal_type: 'breakfast', food_name: 'Mango', quantity: 150, unit: 'g', calories: 98, protein_g: 1.4, carbs_g: 25, fat_g: 0.4, fiber_g: 2.5 },
  { daysBack: 4, meal_type: 'lunch', food_name: 'Sudado de pollo', quantity: 200, unit: 'g', calories: 310, protein_g: 36, carbs_g: 14, fat_g: 10, fiber_g: 2.5 },
  { daysBack: 4, meal_type: 'lunch', food_name: 'Arroz blanco', quantity: 180, unit: 'g', calories: 234, protein_g: 4.5, carbs_g: 51, fat_g: 0.5, fiber_g: 0.5 },
  { daysBack: 4, meal_type: 'lunch', food_name: 'Aguapanela', quantity: 250, unit: 'ml', calories: 110, protein_g: 0, carbs_g: 28, fat_g: 0, fiber_g: 0 },
  { daysBack: 4, meal_type: 'snack', food_name: 'Mix de nueces', quantity: 30, unit: 'g', calories: 180, protein_g: 5, carbs_g: 7, fat_g: 15, fiber_g: 2 },
  { daysBack: 4, meal_type: 'dinner', food_name: 'Tostada de aguacate con huevo', quantity: 2, unit: 'slices', calories: 380, protein_g: 14, carbs_g: 36, fat_g: 20, fiber_g: 7 },

  // d3 — Best day, hit targets
  { daysBack: 3, meal_type: 'breakfast', food_name: 'Huevos revueltos', quantity: 3, unit: 'large', calories: 210, protein_g: 18, carbs_g: 2, fat_g: 15, fiber_g: 0 },
  { daysBack: 3, meal_type: 'breakfast', food_name: 'Arepa de maíz', quantity: 1, unit: 'medium', calories: 150, protein_g: 4, carbs_g: 28, fat_g: 3, fiber_g: 2 },
  { daysBack: 3, meal_type: 'breakfast', food_name: 'Ensalada de frutas', quantity: 150, unit: 'g', calories: 85, protein_g: 1.5, carbs_g: 20, fat_g: 0.3, fiber_g: 2.5 },
  { daysBack: 3, meal_type: 'lunch', food_name: 'Salmón a la plancha', quantity: 200, unit: 'g', calories: 350, protein_g: 40, carbs_g: 0, fat_g: 22, fiber_g: 0 },
  { daysBack: 3, meal_type: 'lunch', food_name: 'Quinoa cocida', quantity: 200, unit: 'g', calories: 222, protein_g: 8, carbs_g: 40, fat_g: 4, fiber_g: 5 },
  { daysBack: 3, meal_type: 'lunch', food_name: 'Ensalada de aguacate y tomate', quantity: 120, unit: 'g', calories: 165, protein_g: 2, carbs_g: 10, fat_g: 14, fiber_g: 4.5 },
  { daysBack: 3, meal_type: 'snack', food_name: 'Barra de proteína', quantity: 1, unit: 'bar', calories: 200, protein_g: 20, carbs_g: 22, fat_g: 6, fiber_g: 3 },
  { daysBack: 3, meal_type: 'dinner', food_name: 'Sopa de lentejas con vegetales', quantity: 350, unit: 'ml', calories: 280, protein_g: 18, carbs_g: 42, fat_g: 4, fiber_g: 10 },
  { daysBack: 3, meal_type: 'dinner', food_name: 'Pan integral', quantity: 1, unit: 'piece', calories: 130, protein_g: 4, carbs_g: 25, fat_g: 2, fiber_g: 2.5 },
  { daysBack: 3, meal_type: 'snack', food_name: 'Chocolate negro 85%', quantity: 20, unit: 'g', calories: 118, protein_g: 2, carbs_g: 8, fat_g: 9, fiber_g: 2 },

  // d2 — Thursday
  { daysBack: 2, meal_type: 'breakfast', food_name: 'Smoothie bowl con bayas', quantity: 300, unit: 'g', calories: 320, protein_g: 11, carbs_g: 55, fat_g: 7, fiber_g: 6 },
  { daysBack: 2, meal_type: 'breakfast', food_name: 'Café con leche', quantity: 200, unit: 'ml', calories: 80, protein_g: 4, carbs_g: 9, fat_g: 3, fiber_g: 0 },
  { daysBack: 2, meal_type: 'lunch', food_name: 'Pollo en salsa de tomate', quantity: 160, unit: 'g', calories: 310, protein_g: 38, carbs_g: 12, fat_g: 10, fiber_g: 2 },
  { daysBack: 2, meal_type: 'lunch', food_name: 'Arroz blanco', quantity: 180, unit: 'g', calories: 234, protein_g: 4.5, carbs_g: 51, fat_g: 0.5, fiber_g: 0.5 },
  { daysBack: 2, meal_type: 'lunch', food_name: 'Patacones', quantity: 2, unit: 'piece', calories: 180, protein_g: 1.5, carbs_g: 36, fat_g: 4, fiber_g: 2.5 },
  { daysBack: 2, meal_type: 'snack', food_name: 'Bocadillo con queso', quantity: 1, unit: 'piece', calories: 190, protein_g: 6, carbs_g: 28, fat_g: 6, fiber_g: 1.5 },
  { daysBack: 2, meal_type: 'dinner', food_name: 'Wrap de pavo y vegetales', quantity: 1, unit: 'wrap', calories: 350, protein_g: 28, carbs_g: 36, fat_g: 10, fiber_g: 4 },
  { daysBack: 2, meal_type: 'snack', food_name: 'Chocolate negro', quantity: 20, unit: 'g', calories: 118, protein_g: 2, carbs_g: 8, fat_g: 9, fiber_g: 2 },

  // d1 — Yesterday
  { daysBack: 1, meal_type: 'breakfast', food_name: 'Overnight oats con chía', quantity: 280, unit: 'g', calories: 340, protein_g: 14, carbs_g: 52, fat_g: 7, fiber_g: 8 },
  { daysBack: 1, meal_type: 'breakfast', food_name: 'Cold brew coffee', quantity: 240, unit: 'ml', calories: 10, protein_g: 0.5, carbs_g: 2, fat_g: 0, fiber_g: 0 },
  { daysBack: 1, meal_type: 'lunch', food_name: 'Ensalada Niçoise con atún', quantity: 300, unit: 'g', calories: 380, protein_g: 32, carbs_g: 18, fat_g: 20, fiber_g: 6 },
  { daysBack: 1, meal_type: 'lunch', food_name: 'Pan de masa madre', quantity: 2, unit: 'slices', calories: 160, protein_g: 6, carbs_g: 30, fat_g: 2, fiber_g: 1.5 },
  { daysBack: 1, meal_type: 'snack', food_name: 'Banano con mantequilla de maní', quantity: 1, unit: 'portion', calories: 220, protein_g: 7, carbs_g: 30, fat_g: 10, fiber_g: 3.5 },
  { daysBack: 1, meal_type: 'dinner', food_name: 'Tilapia al limón', quantity: 170, unit: 'g', calories: 220, protein_g: 36, carbs_g: 0, fat_g: 8, fiber_g: 0 },
  { daysBack: 1, meal_type: 'dinner', food_name: 'Vegetales asados', quantity: 200, unit: 'g', calories: 130, protein_g: 4, carbs_g: 22, fat_g: 4, fiber_g: 6 },

  // d0 — Today, partial log
  { daysBack: 0, meal_type: 'breakfast', food_name: 'Huevos revueltos con espinaca', quantity: 1, unit: 'plate', calories: 240, protein_g: 20, carbs_g: 4, fat_g: 16, fiber_g: 1 },
  { daysBack: 0, meal_type: 'breakfast', food_name: 'Tostada integral con aguacate', quantity: 1, unit: 'piece', calories: 210, protein_g: 6, carbs_g: 22, fat_g: 12, fiber_g: 5 },
  { daysBack: 0, meal_type: 'breakfast', food_name: 'Black coffee', quantity: 240, unit: 'ml', calories: 5, protein_g: 0.3, carbs_g: 1, fat_g: 0, fiber_g: 0 },
  { daysBack: 0, meal_type: 'lunch', food_name: 'Bowl de pollo y arroz integral', quantity: 400, unit: 'g', calories: 520, protein_g: 42, carbs_g: 58, fat_g: 12, fiber_g: 6 },
  { daysBack: 0, meal_type: 'snack', food_name: 'Yogur griego con miel', quantity: 170, unit: 'g', calories: 160, protein_g: 16, carbs_g: 14, fat_g: 4, fiber_g: 0 },
];

// ─── Water (ml/day, ~9-10 glasses of 250ml target = 2380ml) ──
const WATER_PER_DAY: Record<number, number> = {
  14: 1500, 13: 1750, 12: 2000, 11: 1750, 10: 2250,
   9: 2750,  8: 2380,  7: 2250,  6: 2000,  5: 2750,
   4: 2380,  3: 2500,  2: 2250,  1: 2500,  0: 1250,
};

// ─── Resolve / create the daniel@reyes.com auth user + profile ──
async function ensureUser(): Promise<string> {
  // 1) Look for an existing auth user by email.
  const { data: list, error: listErr } = await supabase.auth.admin.listUsers({ perPage: 200 });
  if (listErr) throw new Error(`listUsers: ${listErr.message}`);

  let userId = list.users.find(u => u.email?.toLowerCase() === EMAIL)?.id;

  if (!userId) {
    console.log(`👤 Creating auth user ${EMAIL}…`);
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: 'Daniel Reyes', locale: 'es-CO' },
    });
    if (createErr) throw new Error(`createUser: ${createErr.message}`);
    userId = created.user!.id;
    console.log(`  ✓ Created auth user ${userId}`);
  } else {
    console.log(`👤 Found existing auth user ${userId} for ${EMAIL}`);
  }

  // 2) Upsert profile row. (Trigger on auth.users may have already inserted it.)
  const { error: profileErr } = await supabase
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: EMAIL,
        full_name: 'Daniel Reyes',
        role: 'client',
      },
      { onConflict: 'id' },
    );
  if (profileErr) {
    // Profile schema varies — soft-warn rather than fail the whole seed.
    console.warn(`  ⚠ profile upsert: ${profileErr.message} (continuing)`);
  } else {
    console.log('  ✓ Profile row ensured');
  }

  return userId;
}

// ─── Main ────────────────────────────────────────────────────
async function main() {
  console.log(`🎯 Target: ${SUPABASE_URL}`);
  console.log(`📅 Seeding 15 days: ${daysAgo(14)} → ${daysAgo(0)}\n`);

  const userId = await ensureUser();

  // Clear existing logs in the 15-day window for idempotency.
  const cutoff = daysAgo(14);
  console.log(`\n🧹 Clearing food_log + water_log from ${cutoff} onward…`);
  const { error: delFoodErr } = await supabase
    .from('food_log')
    .delete()
    .eq('user_id', userId)
    .gte('logged_date', cutoff);
  if (delFoodErr) console.error('  ✗ food_log delete:', delFoodErr.message);
  else console.log('  ✓ food_log cleared');

  const { error: delWaterErr } = await supabase
    .from('water_log')
    .delete()
    .eq('user_id', userId)
    .gte('logged_date', cutoff);
  if (delWaterErr) console.error('  ✗ water_log delete:', delWaterErr.message);
  else console.log('  ✓ water_log cleared');

  // Insert food log
  console.log('\n🍽️  Inserting food log entries…');
  const foodPayload = FOOD_ENTRIES.map(e => ({
    user_id: userId,
    logged_date: daysAgo(e.daysBack),
    meal_type: e.meal_type,
    food_name: e.food_name,
    quantity: e.quantity,
    unit: e.unit,
    calories: e.calories,
    protein_g: e.protein_g,
    carbs_g: e.carbs_g,
    fat_g: e.fat_g,
    fiber_g: e.fiber_g,
    source: 'natural_language',
  }));
  const { data: foodData, error: foodErr } = await supabase
    .from('food_log')
    .insert(foodPayload)
    .select('id');
  if (foodErr) console.error('  ✗ food insert:', foodErr.message);
  else console.log(`  ✓ Inserted ${foodData?.length ?? 0} food entries`);

  // Insert water log — split into 250ml glasses
  console.log('\n💧 Inserting water log…');
  const waterEntries: { user_id: string; logged_date: string; amount_ml: number }[] = [];
  for (const [daysBackStr, totalMl] of Object.entries(WATER_PER_DAY)) {
    const date = daysAgo(Number(daysBackStr));
    const glasses = Math.floor(totalMl / 250);
    const remainder = totalMl % 250;
    for (let i = 0; i < glasses; i++) {
      waterEntries.push({ user_id: userId, logged_date: date, amount_ml: 250 });
    }
    if (remainder > 0) waterEntries.push({ user_id: userId, logged_date: date, amount_ml: remainder });
  }
  const { data: waterData, error: waterErr } = await supabase
    .from('water_log')
    .insert(waterEntries)
    .select('id');
  if (waterErr) console.error('  ✗ water insert:', waterErr.message);
  else console.log(`  ✓ Inserted ${waterData?.length ?? 0} water entries`);

  // Day-by-day macro summary
  console.log('\n📊 Day-by-day totals (kcal · P · C · F · fiber):');
  const byDay: Record<number, Entry[]> = {};
  for (const e of FOOD_ENTRIES) (byDay[e.daysBack] ??= []).push(e);
  for (const k of Object.keys(byDay).map(Number).sort((a, b) => b - a)) {
    const t = byDay[k].reduce(
      (a, e) => ({ k: a.k + e.calories, p: a.p + e.protein_g, c: a.c + e.carbs_g, f: a.f + e.fat_g, fi: a.fi + e.fiber_g }),
      { k: 0, p: 0, c: 0, f: 0, fi: 0 },
    );
    const water = WATER_PER_DAY[k] ?? 0;
    console.log(
      `  d-${String(k).padStart(2, '0')} ${daysAgo(k)} | ${String(Math.round(t.k)).padStart(4)} kcal · ${String(Math.round(t.p)).padStart(3)}P · ${String(Math.round(t.c)).padStart(3)}C · ${String(Math.round(t.f)).padStart(3)}F · ${String(Math.round(t.fi)).padStart(2)}fib · ${water}ml`,
    );
  }

  console.log(`\n✅ Done. Login: ${EMAIL} / ${PASSWORD}`);
  console.log('   Targets: 2255 kcal · 82g P · 329g C · 68g F · 32g fiber · 2380ml water');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
