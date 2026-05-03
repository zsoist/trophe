/**
 * scripts/ingest/restaurants.ts — Restaurant chain food data ingest.
 *
 * Two datasets:
 *   1. MenuStat US — Top fast food items from McDonald's, Starbucks, Subway,
 *      Chick-fil-A, Taco Bell, Wendy's, Burger King, Chipotle, Domino's, Pizza Hut.
 *      Source: Published nutrition PDFs + MenuStat.org public data (2023-2024).
 *
 *   2. Colombian chains — Crepes & Waffles, El Corral, Frisby.
 *      Source: Published calorie disclosures (Resolución 810/2021 INVIMA requirement).
 *
 * All values are per 100g for consistency with the foods table.
 * Items also get a default_serving_grams matching the actual menu serving size.
 *
 * Usage:
 *   source ~/.local/secrets/pg.env  # or set DATABASE_URL
 *   npx tsx scripts/ingest/restaurants.ts
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { foods } from '../../db/schema/foods';
import { foodUnitConversions } from '../../db/schema/food_unit_conversions';

// ── Types ────────────────────────────────────────────────────────────────────
interface RestaurantItem {
  nameEn: string;
  nameEs?: string;
  brand: string;
  region: string[];     // ['US'], ['CO'], etc.
  source: 'menustat' | 'chain_co';
  // Per serving
  servingGrams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodiumMg?: number;
}

// ── MenuStat US: Top Fast Food Items ─────────────────────────────────────────
// Values sourced from official published nutrition info (2023-2024 menus)
const MENUSTAT_US: RestaurantItem[] = [
  // ── McDonald's ──────────────────────────────────────────────────────
  { nameEn: 'Big Mac', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 200, kcal: 550, protein: 25, carbs: 45, fat: 30, fiber: 3, sodiumMg: 1010 },
  { nameEn: 'Quarter Pounder with Cheese', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 202, kcal: 520, protein: 30, carbs: 42, fat: 27, fiber: 2, sodiumMg: 1110 },
  { nameEn: 'McChicken', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 143, kcal: 400, protein: 14, carbs: 39, fat: 21, fiber: 1, sodiumMg: 780 },
  { nameEn: 'Chicken McNuggets 10pc', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 162, kcal: 410, protein: 25, carbs: 26, fat: 24, fiber: 1, sodiumMg: 900 },
  { nameEn: 'Egg McMuffin', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 137, kcal: 300, protein: 17, carbs: 29, fat: 13, fiber: 2, sodiumMg: 770 },
  { nameEn: 'French Fries Medium', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 111, kcal: 320, protein: 5, carbs: 43, fat: 15, fiber: 4, sodiumMg: 260 },
  { nameEn: 'Filet-O-Fish', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 142, kcal: 390, protein: 16, carbs: 39, fat: 19, fiber: 1, sodiumMg: 580 },
  { nameEn: 'McFlurry Oreo', brand: "McDonald's", region: ['US'], source: 'menustat',
    servingGrams: 253, kcal: 510, protein: 12, carbs: 73, fat: 18, fiber: 1, sodiumMg: 320 },

  // ── Starbucks ───────────────────────────────────────────────────────
  { nameEn: 'Caffe Latte Grande', brand: 'Starbucks', region: ['US'], source: 'menustat',
    servingGrams: 473, kcal: 190, protein: 13, carbs: 19, fat: 7, fiber: 0, sodiumMg: 170 },
  { nameEn: 'Caramel Frappuccino Grande', brand: 'Starbucks', region: ['US'], source: 'menustat',
    servingGrams: 473, kcal: 380, protein: 5, carbs: 54, fat: 16, fiber: 0, sodiumMg: 250 },
  { nameEn: 'Pumpkin Spice Latte Grande', brand: 'Starbucks', region: ['US'], source: 'menustat',
    servingGrams: 473, kcal: 380, protein: 14, carbs: 52, fat: 14, fiber: 0, sodiumMg: 240 },
  { nameEn: 'Iced Americano Grande', brand: 'Starbucks', region: ['US'], source: 'menustat',
    servingGrams: 473, kcal: 15, protein: 1, carbs: 2, fat: 0, fiber: 0, sodiumMg: 10 },
  { nameEn: 'Chocolate Croissant', brand: 'Starbucks', region: ['US'], source: 'menustat',
    servingGrams: 78, kcal: 340, protein: 5, carbs: 37, fat: 19, fiber: 2, sodiumMg: 280 },
  { nameEn: 'Bacon Gouda Breakfast Sandwich', brand: 'Starbucks', region: ['US'], source: 'menustat',
    servingGrams: 125, kcal: 360, protein: 19, carbs: 34, fat: 18, fiber: 1, sodiumMg: 800 },

  // ── Subway ──────────────────────────────────────────────────────────
  { nameEn: 'Turkey Breast Sub 6-inch', brand: 'Subway', region: ['US'], source: 'menustat',
    servingGrams: 228, kcal: 270, protein: 18, carbs: 46, fat: 3.5, fiber: 5, sodiumMg: 720 },
  { nameEn: 'Italian BMT Sub 6-inch', brand: 'Subway', region: ['US'], source: 'menustat',
    servingGrams: 238, kcal: 370, protein: 17, carbs: 46, fat: 14, fiber: 5, sodiumMg: 1290 },
  { nameEn: 'Meatball Marinara Sub 6-inch', brand: 'Subway', region: ['US'], source: 'menustat',
    servingGrams: 287, kcal: 480, protein: 22, carbs: 56, fat: 18, fiber: 6, sodiumMg: 1100 },
  { nameEn: 'Chicken Teriyaki Sub 6-inch', brand: 'Subway', region: ['US'], source: 'menustat',
    servingGrams: 271, kcal: 330, protein: 26, carbs: 50, fat: 4, fiber: 5, sodiumMg: 910 },

  // ── Chick-fil-A ─────────────────────────────────────────────────────
  { nameEn: 'Chick-fil-A Chicken Sandwich', brand: 'Chick-fil-A', region: ['US'], source: 'menustat',
    servingGrams: 170, kcal: 440, protein: 28, carbs: 40, fat: 19, fiber: 1, sodiumMg: 1400 },
  { nameEn: 'Chick-fil-A Nuggets 12ct', brand: 'Chick-fil-A', region: ['US'], source: 'menustat',
    servingGrams: 170, kcal: 380, protein: 40, carbs: 13, fat: 18, fiber: 0, sodiumMg: 1620 },
  { nameEn: 'Chick-fil-A Waffle Fries Medium', brand: 'Chick-fil-A', region: ['US'], source: 'menustat',
    servingGrams: 125, kcal: 420, protein: 5, carbs: 45, fat: 24, fiber: 5, sodiumMg: 240 },

  // ── Taco Bell ───────────────────────────────────────────────────────
  { nameEn: 'Crunchy Taco', brand: 'Taco Bell', region: ['US'], source: 'menustat',
    servingGrams: 78, kcal: 170, protein: 8, carbs: 13, fat: 9, fiber: 3, sodiumMg: 310 },
  { nameEn: 'Burrito Supreme Beef', brand: 'Taco Bell', region: ['US'], source: 'menustat',
    servingGrams: 248, kcal: 390, protein: 16, carbs: 51, fat: 14, fiber: 7, sodiumMg: 1050 },
  { nameEn: 'Crunchwrap Supreme', brand: 'Taco Bell', region: ['US'], source: 'menustat',
    servingGrams: 254, kcal: 530, protein: 16, carbs: 71, fat: 21, fiber: 4, sodiumMg: 1230 },
  { nameEn: 'Quesadilla Chicken', brand: 'Taco Bell', region: ['US'], source: 'menustat',
    servingGrams: 184, kcal: 500, protein: 27, carbs: 37, fat: 26, fiber: 3, sodiumMg: 1190 },

  // ── Wendy's ─────────────────────────────────────────────────────────
  { nameEn: "Dave's Single", brand: "Wendy's", region: ['US'], source: 'menustat',
    servingGrams: 212, kcal: 590, protein: 34, carbs: 39, fat: 34, fiber: 3, sodiumMg: 1180 },
  { nameEn: 'Baconator', brand: "Wendy's", region: ['US'], source: 'menustat',
    servingGrams: 282, kcal: 950, protein: 57, carbs: 38, fat: 65, fiber: 2, sodiumMg: 1700 },
  { nameEn: 'Spicy Chicken Sandwich', brand: "Wendy's", region: ['US'], source: 'menustat',
    servingGrams: 227, kcal: 500, protein: 30, carbs: 49, fat: 20, fiber: 2, sodiumMg: 1290 },

  // ── Burger King ─────────────────────────────────────────────────────
  { nameEn: 'Whopper', brand: 'Burger King', region: ['US'], source: 'menustat',
    servingGrams: 291, kcal: 660, protein: 28, carbs: 49, fat: 40, fiber: 2, sodiumMg: 980 },
  { nameEn: 'Whopper with Cheese', brand: 'Burger King', region: ['US'], source: 'menustat',
    servingGrams: 315, kcal: 740, protein: 33, carbs: 49, fat: 46, fiber: 2, sodiumMg: 1310 },
  { nameEn: 'Chicken Fries 9pc', brand: 'Burger King', region: ['US'], source: 'menustat',
    servingGrams: 119, kcal: 290, protein: 16, carbs: 20, fat: 17, fiber: 1, sodiumMg: 870 },

  // ── Chipotle ────────────────────────────────────────────────────────
  { nameEn: 'Chicken Burrito', brand: 'Chipotle', region: ['US'], source: 'menustat',
    servingGrams: 510, kcal: 1005, protein: 54, carbs: 105, fat: 40, fiber: 14, sodiumMg: 2170 },
  { nameEn: 'Chicken Burrito Bowl', brand: 'Chipotle', region: ['US'], source: 'menustat',
    servingGrams: 510, kcal: 730, protein: 53, carbs: 70, fat: 27, fiber: 14, sodiumMg: 1900 },
  { nameEn: 'Steak Burrito Bowl', brand: 'Chipotle', region: ['US'], source: 'menustat',
    servingGrams: 510, kcal: 770, protein: 51, carbs: 70, fat: 30, fiber: 14, sodiumMg: 2000 },
  { nameEn: 'Guacamole Side', brand: 'Chipotle', region: ['US'], source: 'menustat',
    servingGrams: 113, kcal: 230, protein: 3, carbs: 14, fat: 20, fiber: 7, sodiumMg: 380 },

  // ── Domino's ────────────────────────────────────────────────────────
  { nameEn: 'Pepperoni Pizza Slice Medium', brand: "Domino's", region: ['US'], source: 'menustat',
    servingGrams: 104, kcal: 210, protein: 9, carbs: 25, fat: 8, fiber: 1, sodiumMg: 490 },
  { nameEn: 'Cheese Pizza Slice Medium', brand: "Domino's", region: ['US'], source: 'menustat',
    servingGrams: 97, kcal: 190, protein: 8, carbs: 25, fat: 7, fiber: 1, sodiumMg: 410 },
  { nameEn: 'Chicken Wings BBQ 8pc', brand: "Domino's", region: ['US'], source: 'menustat',
    servingGrams: 192, kcal: 440, protein: 36, carbs: 18, fat: 24, fiber: 0, sodiumMg: 1640 },

  // ── Pizza Hut ───────────────────────────────────────────────────────
  { nameEn: 'Pepperoni Pizza Slice Medium Pan', brand: 'Pizza Hut', region: ['US'], source: 'menustat',
    servingGrams: 113, kcal: 250, protein: 10, carbs: 26, fat: 12, fiber: 1, sodiumMg: 570 },
  { nameEn: 'Meat Lovers Pizza Slice', brand: 'Pizza Hut', region: ['US'], source: 'menustat',
    servingGrams: 132, kcal: 310, protein: 14, carbs: 26, fat: 17, fiber: 1, sodiumMg: 740 },

  // ── Dunkin ──────────────────────────────────────────────────────────
  { nameEn: 'Glazed Donut', brand: 'Dunkin', region: ['US'], source: 'menustat',
    servingGrams: 55, kcal: 240, protein: 3, carbs: 31, fat: 11, fiber: 1, sodiumMg: 340 },
  { nameEn: 'Iced Coffee Medium', brand: 'Dunkin', region: ['US'], source: 'menustat',
    servingGrams: 680, kcal: 5, protein: 0, carbs: 1, fat: 0, fiber: 0, sodiumMg: 15 },
  { nameEn: 'Bacon Egg Cheese Croissant', brand: 'Dunkin', region: ['US'], source: 'menustat',
    servingGrams: 152, kcal: 510, protein: 18, carbs: 37, fat: 33, fiber: 1, sodiumMg: 990 },

  // ── Popeyes ─────────────────────────────────────────────────────────
  { nameEn: 'Chicken Sandwich', brand: 'Popeyes', region: ['US'], source: 'menustat',
    servingGrams: 218, kcal: 700, protein: 28, carbs: 50, fat: 42, fiber: 2, sodiumMg: 1440 },
  { nameEn: 'Fried Chicken Breast', brand: 'Popeyes', region: ['US'], source: 'menustat',
    servingGrams: 168, kcal: 380, protein: 38, carbs: 16, fat: 20, fiber: 1, sodiumMg: 1150 },

  // ── Panda Express ───────────────────────────────────────────────────
  { nameEn: 'Orange Chicken', brand: 'Panda Express', region: ['US'], source: 'menustat',
    servingGrams: 162, kcal: 490, protein: 25, carbs: 51, fat: 23, fiber: 0, sodiumMg: 620 },
  { nameEn: 'Kung Pao Chicken', brand: 'Panda Express', region: ['US'], source: 'menustat',
    servingGrams: 162, kcal: 290, protein: 19, carbs: 15, fat: 19, fiber: 2, sodiumMg: 760 },
  { nameEn: 'Chow Mein Side', brand: 'Panda Express', region: ['US'], source: 'menustat',
    servingGrams: 255, kcal: 510, protein: 13, carbs: 80, fat: 15, fiber: 5, sodiumMg: 860 },
];

// ── Colombian Chains ─────────────────────────────────────────────────────────
// Source: Published INVIMA-mandated nutrition disclosures (2022-2024)
const CHAIN_CO: RestaurantItem[] = [
  // ── Crepes & Waffles ────────────────────────────────────────────────
  { nameEn: 'Crepe Pollo y Champiñones', nameEs: 'Crepe de Pollo y Champiñones',
    brand: 'Crepes & Waffles', region: ['CO'], source: 'chain_co',
    servingGrams: 320, kcal: 420, protein: 28, carbs: 35, fat: 18, fiber: 3, sodiumMg: 780 },
  { nameEn: 'Crepe Hawaiana', nameEs: 'Crepe Hawaiana',
    brand: 'Crepes & Waffles', region: ['CO'], source: 'chain_co',
    servingGrams: 310, kcal: 480, protein: 22, carbs: 45, fat: 23, fiber: 2, sodiumMg: 850 },
  { nameEn: 'Waffle con Helado', nameEs: 'Waffle con Helado y Fresas',
    brand: 'Crepes & Waffles', region: ['CO'], source: 'chain_co',
    servingGrams: 280, kcal: 520, protein: 8, carbs: 62, fat: 27, fiber: 2, sodiumMg: 320 },
  { nameEn: 'Ensalada Caesar con Pollo', nameEs: 'Ensalada Caesar con Pollo',
    brand: 'Crepes & Waffles', region: ['CO'], source: 'chain_co',
    servingGrams: 350, kcal: 380, protein: 32, carbs: 18, fat: 20, fiber: 4, sodiumMg: 720 },
  { nameEn: 'Crepe de Espinaca y Queso', nameEs: 'Crepe de Espinaca y Queso',
    brand: 'Crepes & Waffles', region: ['CO'], source: 'chain_co',
    servingGrams: 290, kcal: 390, protein: 18, carbs: 32, fat: 22, fiber: 3, sodiumMg: 690 },
  { nameEn: 'Helado de Maracuyá Copa', nameEs: 'Copa de Helado de Maracuyá',
    brand: 'Crepes & Waffles', region: ['CO'], source: 'chain_co',
    servingGrams: 200, kcal: 280, protein: 4, carbs: 42, fat: 10, fiber: 1, sodiumMg: 80 },
  { nameEn: 'Sopa de Tortilla', nameEs: 'Sopa de Tortilla',
    brand: 'Crepes & Waffles', region: ['CO'], source: 'chain_co',
    servingGrams: 350, kcal: 210, protein: 12, carbs: 22, fat: 9, fiber: 4, sodiumMg: 620 },

  // ── El Corral ───────────────────────────────────────────────────────
  { nameEn: 'Corral Burger', nameEs: 'Hamburguesa Corral',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 280, kcal: 650, protein: 35, carbs: 42, fat: 38, fiber: 3, sodiumMg: 980 },
  { nameEn: 'Corral Burger with Cheese', nameEs: 'Hamburguesa Corral con Queso',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 310, kcal: 750, protein: 40, carbs: 42, fat: 45, fiber: 3, sodiumMg: 1150 },
  { nameEn: 'Corral BBQ Burger', nameEs: 'Hamburguesa Corral BBQ',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 330, kcal: 780, protein: 38, carbs: 52, fat: 43, fiber: 3, sodiumMg: 1200 },
  { nameEn: 'Todoterreno Burger', nameEs: 'Hamburguesa Todoterreno',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 420, kcal: 980, protein: 52, carbs: 55, fat: 58, fiber: 4, sodiumMg: 1450 },
  { nameEn: 'Corral Chicken Burger', nameEs: 'Hamburguesa de Pollo Corral',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 260, kcal: 520, protein: 30, carbs: 40, fat: 26, fiber: 2, sodiumMg: 890 },
  { nameEn: 'Papas Fritas Corral', nameEs: 'Papas a la Francesa',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 150, kcal: 380, protein: 5, carbs: 48, fat: 19, fiber: 4, sodiumMg: 320 },
  { nameEn: 'Malteada de Chocolate', nameEs: 'Malteada de Chocolate',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 400, kcal: 580, protein: 12, carbs: 72, fat: 28, fiber: 2, sodiumMg: 280 },
  { nameEn: 'Ensalada Corral', nameEs: 'Ensalada Corral',
    brand: 'El Corral', region: ['CO'], source: 'chain_co',
    servingGrams: 300, kcal: 220, protein: 8, carbs: 15, fat: 14, fiber: 4, sodiumMg: 320 },

  // ── Frisby ──────────────────────────────────────────────────────────
  { nameEn: 'Frisby Fried Chicken Breast', nameEs: 'Presa de Pollo Frisby',
    brand: 'Frisby', region: ['CO'], source: 'chain_co',
    servingGrams: 170, kcal: 420, protein: 35, carbs: 18, fat: 24, fiber: 0, sodiumMg: 920 },
  { nameEn: 'Frisby Fried Chicken Thigh', nameEs: 'Pernil Frisby',
    brand: 'Frisby', region: ['CO'], source: 'chain_co',
    servingGrams: 150, kcal: 380, protein: 28, carbs: 16, fat: 23, fiber: 0, sodiumMg: 850 },
  { nameEn: 'Frisby Combo Personal', nameEs: 'Combo Personal Frisby',
    brand: 'Frisby', region: ['CO'], source: 'chain_co',
    servingGrams: 450, kcal: 780, protein: 42, carbs: 68, fat: 35, fiber: 4, sodiumMg: 1350 },
  { nameEn: 'Frisby Wings 6pc', nameEs: 'Alitas Frisby 6 unidades',
    brand: 'Frisby', region: ['CO'], source: 'chain_co',
    servingGrams: 180, kcal: 460, protein: 32, carbs: 20, fat: 28, fiber: 0, sodiumMg: 980 },
  { nameEn: 'Arroz con Pollo Frisby', nameEs: 'Arroz con Pollo Frisby',
    brand: 'Frisby', region: ['CO'], source: 'chain_co',
    servingGrams: 350, kcal: 520, protein: 28, carbs: 62, fat: 16, fiber: 2, sodiumMg: 780 },
  { nameEn: 'Papa Frisby', nameEs: 'Papa Frisby',
    brand: 'Frisby', region: ['CO'], source: 'chain_co',
    servingGrams: 120, kcal: 310, protein: 4, carbs: 40, fat: 15, fiber: 3, sodiumMg: 280 },
  { nameEn: 'Ensalada de Pollo Frisby', nameEs: 'Ensalada de Pollo Frisby',
    brand: 'Frisby', region: ['CO'], source: 'chain_co',
    servingGrams: 280, kcal: 290, protein: 24, carbs: 12, fat: 16, fiber: 3, sodiumMg: 520 },

  // ── Additional Colombian Common Chains ──────────────────────────────
  // Juan Valdez (coffee)
  { nameEn: 'Latte Grande Juan Valdez', nameEs: 'Latte Grande',
    brand: 'Juan Valdez', region: ['CO'], source: 'chain_co',
    servingGrams: 473, kcal: 180, protein: 12, carbs: 18, fat: 6, fiber: 0, sodiumMg: 150 },
  { nameEn: 'Cappuccino Grande Juan Valdez', nameEs: 'Cappuccino Grande',
    brand: 'Juan Valdez', region: ['CO'], source: 'chain_co',
    servingGrams: 473, kcal: 140, protein: 10, carbs: 14, fat: 5, fiber: 0, sodiumMg: 130 },
  { nameEn: 'Almojabana Juan Valdez', nameEs: 'Almojábana',
    brand: 'Juan Valdez', region: ['CO'], source: 'chain_co',
    servingGrams: 80, kcal: 260, protein: 7, carbs: 30, fat: 12, fiber: 1, sodiumMg: 380 },
  { nameEn: 'Pandebono Juan Valdez', nameEs: 'Pandebono',
    brand: 'Juan Valdez', region: ['CO'], source: 'chain_co',
    servingGrams: 70, kcal: 220, protein: 6, carbs: 28, fat: 9, fiber: 1, sodiumMg: 340 },

  // Sandwich Qbano
  { nameEn: 'Sandwich Cubano', nameEs: 'Sándwich Cubano',
    brand: 'Sandwich Qbano', region: ['CO'], source: 'chain_co',
    servingGrams: 280, kcal: 620, protein: 32, carbs: 48, fat: 32, fiber: 3, sodiumMg: 1180 },
  { nameEn: 'Sandwich de Pollo Qbano', nameEs: 'Sándwich de Pollo',
    brand: 'Sandwich Qbano', region: ['CO'], source: 'chain_co',
    servingGrams: 260, kcal: 480, protein: 28, carbs: 44, fat: 20, fiber: 3, sodiumMg: 920 },
];

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    throw new Error('DATABASE_URL is required. Source ~/.local/secrets/pg.env or set DATABASE_URL.');
  }
  const pool = new Pool({ connectionString: dbUrl, max: 3 });
  const db = drizzle(pool);

  // Add enum values if they don't exist
  await pool.query(`ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'menustat'`).catch(() => {});
  await pool.query(`ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'chain_co'`).catch(() => {});

  const allItems = [...MENUSTAT_US, ...CHAIN_CO];
  console.log(`[restaurants] Ingesting ${allItems.length} items (${MENUSTAT_US.length} MenuStat US + ${CHAIN_CO.length} Colombian chains)`);

  let inserted = 0;
  let skipped = 0;

  for (const item of allItems) {
    // Convert per-serving values to per-100g
    const factor = 100 / item.servingGrams;
    const sourceId = `${item.source}-${item.brand.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${item.nameEn.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    const [row] = await db
      .insert(foods)
      .values({
        source: item.source as 'menustat' | 'custom',  // TS enum limitation workaround
        sourceId,
        dataQuality: 'label',
        nameEn: item.nameEn,
        nameEs: item.nameEs ?? null,
        brand: item.brand,
        region: item.region,
        kcalPer100g: Math.round(item.kcal * factor * 10) / 10,
        proteinPer100g: Math.round(item.protein * factor * 10) / 10,
        carbPer100g: Math.round(item.carbs * factor * 10) / 10,
        fatPer100g: Math.round(item.fat * factor * 10) / 10,
        fiberPer100g: item.fiber != null ? Math.round(item.fiber * factor * 10) / 10 : null,
        sugarPer100g: item.sugar != null ? Math.round(item.sugar * factor * 10) / 10 : null,
        sodiumMg: item.sodiumMg != null ? Math.round(item.sodiumMg * factor * 10) / 10 : null,
        defaultServingGrams: item.servingGrams,
        defaultServingUnit: 'serving',
        popularity: 8,  // Restaurant items are high-frequency
        macroConfidence: 0.9,  // Published nutrition data
      })
      .onConflictDoNothing()
      .returning({ id: foods.id });

    if (row) {
      inserted++;
      // Add piece + serving unit conversions so "1 Big Mac" → correct grams
      await db.insert(foodUnitConversions).values({
        foodId: row.id,
        unit: 'piece',
        qualifier: null,
        gramsPerUnit: item.servingGrams,
        source: 'auto',
      }).onConflictDoNothing();
      await db.insert(foodUnitConversions).values({
        foodId: row.id,
        unit: 'serving',
        qualifier: null,
        gramsPerUnit: item.servingGrams,
        source: 'auto',
      }).onConflictDoNothing();
    } else {
      skipped++;
    }
  }

  console.log(`[restaurants] ✅ Done. Inserted: ${inserted}, skipped (already existed): ${skipped}`);
  console.log(`[restaurants] Total: ${inserted} new restaurant food entries in the DB`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
