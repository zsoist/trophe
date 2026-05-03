/**
 * scripts/data/wave3-branded-foods-list.ts
 *
 * Wave 3: 25 high-volume branded foods (fast food + beverages) curated
 * to fix WRONG_PORTION bugs where universal piece=80g default was applied
 * to items like Big Mac (215g), McNuggets (17g each), Whopper (316g), etc.
 *
 * Data sources:
 *   - USDA FDC SR Legacy (fast food category)
 *   - USDA FDC Branded Food Products (beverages)
 *   - Official chain nutrition PDFs (weights confirmed against USDA)
 *
 * Structure matches CanonicalFood from canonical-foods-list.ts for reuse
 * with seed-canonical-foods.ts script.
 *
 * Tier 1: 15 fast food items (McDonald's, Burger King, KFC, Chick-fil-A, Subway)
 * Tier 2: 10 beverages (Coca-Cola, Sprite, Pepsi, Fanta, Red Bull, Starbucks, OJ, beer)
 * Tier 3: Colombian chains — documented in GAPS section (no USDA data)
 */

import { type CanonicalFood } from './canonical-foods-list';

export const WAVE3_BRANDED_FOODS: CanonicalFood[] = [
  // ═══════════════════════════════════════════════════════════════════
  // TIER 1: FAST FOOD (15 items)
  // ═══════════════════════════════════════════════════════════════════

  // ── McDonald's ──────────────────────────────────────────────────────
  {
    key: 'mcdonalds_big_mac',
    searchQuery: "McDONALD'S BIG MAC",
    preferredTypes: ['SR Legacy', 'Survey (FNDDS)'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { piece: 215, sandwich: 215, serving: 215 },
    notes: 'USDA FDC 170720. McDonald\'s official: 200g patty+bun, ~215g assembled. 257 kcal/100g → 550 kcal/sandwich.',
  },
  {
    key: 'mcdonalds_chicken_mcnuggets',
    searchQuery: "McDONALD'S Chicken McNUGGETS",
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { piece: 17, '4_piece': 68, '6_piece': 102, '10_piece': 170, '20_piece': 340, serving: 102 },
    notes: 'CRITICAL: piece=17g (one nugget). USDA FDC 173297. 302 kcal/100g → 51 kcal/nugget. Serving=6pc default.',
  },
  {
    key: 'mcdonalds_french_fries_large',
    searchQuery: "McDONALD'S french fries",
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { serving: 154, large: 154, medium: 117, small: 71 },
    notes: 'USDA FDC 170721. 323 kcal/100g. Large=154g (497 kcal), Medium=117g (378 kcal), Small=71g (229 kcal).',
  },
  {
    key: 'mcdonalds_cheeseburger',
    searchQuery: "McDONALD'S Cheeseburger",
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { piece: 119, sandwich: 119, serving: 119 },
    notes: 'USDA FDC 170320. 263 kcal/100g → 313 kcal/sandwich.',
  },
  {
    key: 'mcdonalds_egg_mcmuffin',
    searchQuery: "McDONALD'S Egg McMUFFIN",
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { piece: 137, sandwich: 137, serving: 137 },
    notes: 'USDA FDC 173307. 228 kcal/100g → 312 kcal/sandwich.',
  },

  // ── Burger King ─────────────────────────────────────────────────────
  {
    key: 'burger_king_whopper',
    searchQuery: 'BURGER KING WHOPPER no cheese',
    preferredTypes: ['SR Legacy', 'Survey (FNDDS)'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { piece: 290, sandwich: 290, serving: 290 },
    notes: 'USDA FDC 170727. 233 kcal/100g. Official BK weight 290g (no cheese) → 676 kcal. With cheese: 316g.',
  },
  {
    key: 'burger_king_whopper_cheese',
    searchQuery: 'BURGER KING WHOPPER with cheese',
    preferredTypes: ['Survey (FNDDS)', 'SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { piece: 316, sandwich: 316, serving: 316 },
    notes: 'USDA FDC 170728. 250 kcal/100g → 790 kcal/sandwich.',
  },

  // ── KFC ─────────────────────────────────────────────────────────────
  {
    key: 'kfc_popcorn_chicken',
    searchQuery: 'KFC Popcorn Chicken',
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { serving: 114, large: 170, individual: 99 },
    notes: 'USDA FDC 170737. 351 kcal/100g. Regular serving ~114g (400 kcal).',
  },
  {
    key: 'kfc_crispy_strips',
    searchQuery: 'KFC Crispy Chicken Strips',
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { piece: 47, strip: 47, '3_piece': 141, serving: 141 },
    notes: 'USDA FDC 170341. 274 kcal/100g. One strip ~47g (129 kcal). Serving=3 strips.',
  },

  // ── Chick-fil-A ─────────────────────────────────────────────────────
  {
    key: 'chickfila_chicken_sandwich',
    searchQuery: 'CHICK-FIL-A chicken sandwich',
    preferredTypes: ['SR Legacy'],
    region: ['US'],
    category: 'standard',
    commonUnits: { piece: 182, sandwich: 182, serving: 182 },
    notes: 'USDA FDC 170790. 249 kcal/100g → 440 kcal/sandwich.',
  },
  {
    key: 'chickfila_chicken_strips',
    searchQuery: 'CHICK-FIL-A Chick-n-Strips',
    preferredTypes: ['SR Legacy'],
    region: ['US'],
    category: 'standard',
    commonUnits: { piece: 38, strip: 38, '4_count': 152, serving: 152 },
    notes: 'USDA FDC 170303. 228 kcal/100g. One strip ~38g. 4-count serving=152g (347 kcal).',
  },

  // ── Subway ──────────────────────────────────────────────────────────
  {
    key: 'subway_turkey_breast_sub',
    searchQuery: 'SUBWAY turkey breast sub on white bread',
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { '6_inch': 224, footlong: 448, serving: 224 },
    notes: 'USDA FDC 170711. 147 kcal/100g. 6-inch sub ~224g (329 kcal).',
  },
  {
    key: 'subway_meatball_sub',
    searchQuery: 'SUBWAY meatball marinara sub on white bread',
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { '6_inch': 284, footlong: 568, serving: 284 },
    notes: 'USDA FDC 170708. 219 kcal/100g. 6-inch sub ~284g (622 kcal).',
  },

  // ── Generic fast food (covers unlabeled queries) ────────────────────
  {
    key: 'french_fries_fast_food',
    searchQuery: 'Fast foods potato french fried in vegetable oil',
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { serving: 117, large: 154, medium: 117, small: 71 },
    notes: 'USDA FDC 170698. 312 kcal/100g. Generic fast food fries (not chain-specific).',
  },
  {
    key: 'chicken_nuggets_fast_food',
    searchQuery: "WENDY'S Chicken Nuggets",
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { piece: 17, '4_piece': 68, '6_piece': 102, '10_piece': 170, serving: 102 },
    notes: 'USDA FDC 170725. 326 kcal/100g. Generic nugget weight ~17g each (Wendy\'s reference). Serving=6pc.',
  },

  // ═══════════════════════════════════════════════════════════════════
  // TIER 2: BEVERAGES (10 items)
  // ═══════════════════════════════════════════════════════════════════

  {
    key: 'coca_cola',
    searchQuery: 'COCA-COLA COLA',
    preferredTypes: ['Branded'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { can: 355, '355ml': 355, '500ml': 500, '600ml': 600, bottle: 500, liter: 1000, glass: 240 },
    notes: 'USDA FDC 2678649. 39 kcal/100ml. Can=355ml (138 kcal). Colombian 600ml (234 kcal). Fixes WRONG_FOOD: coca cola→POWERADE.',
  },
  {
    key: 'sprite',
    searchQuery: 'Sprite',
    preferredTypes: ['Branded'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { can: 355, '355ml': 355, '500ml': 500, bottle: 500, liter: 1000, glass: 240 },
    notes: 'USDA FDC 2742330. 39 kcal/100ml. Same caloric density as Coca-Cola.',
  },
  {
    key: 'pepsi_cola',
    searchQuery: 'PEPSI SODA 500 ML',
    preferredTypes: ['Branded'],
    region: ['US', 'CO'],
    category: 'standard',
    commonUnits: { can: 355, '355ml': 355, '500ml': 500, bottle: 500, liter: 1000, glass: 240 },
    notes: 'USDA FDC 1460452. 43 kcal/100ml (slightly more than Coke).',
  },
  {
    key: 'fanta_orange',
    searchQuery: 'FANTA SODA ORANGE ORANGE',
    preferredTypes: ['Branded'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { can: 355, '355ml': 355, '500ml': 500, bottle: 500, glass: 240 },
    notes: 'USDA FDC 1595632. 45 kcal/100ml.',
  },
  {
    key: 'red_bull_energy_drink',
    searchQuery: 'RED BULL ENERGY DRINK',
    preferredTypes: ['Branded'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { can: 250, '250ml': 250, '355ml': 355, '473ml': 473 },
    notes: 'USDA FDC 541366. 45 kcal/100ml. Standard can=250ml (112 kcal).',
  },
  {
    key: 'starbucks_caffe_latte',
    searchQuery: 'CAFFE LATTE ICED ESPRESSO BEVERAGE Starbucks',
    preferredTypes: ['Branded'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { tall: 354, grande: 473, venti: 591, cup: 354 },
    notes: 'USDA FDC 690916. 53 kcal/100ml. Grande (473ml) = 251 kcal. Fixes WRONG_FOOD: latte→platter.',
  },
  {
    key: 'orange_juice_commercial',
    searchQuery: 'TROPICANA 100% JUICE ORANGE',
    preferredTypes: ['Branded', 'SR Legacy'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { glass: 240, cup: 240, '500ml': 500, bottle: 500 },
    notes: 'USDA FDC 2501658. 46 kcal/100ml. Standard glass (240ml) = 110 kcal.',
  },
  {
    key: 'beer_regular',
    searchQuery: 'Alcoholic beverage beer regular all',
    preferredTypes: ['SR Legacy'],
    region: ['US', 'CO', 'GR'],
    category: 'standard',
    commonUnits: { can: 355, bottle: 355, pint: 473, glass: 355, '330ml': 330 },
    notes: 'USDA FDC 168746. 43 kcal/100ml. Standard can/bottle 355ml (153 kcal). Colombian lata 330ml (142 kcal).',
  },
  // corona_beer and postobon_colombiana DROPPED — proxies were misleading.
  // Deferred to Tier 3 Colombian beverages data project.
];

// ═══════════════════════════════════════════════════════════════════════════
// TIER 3 GAPS — Colombian chains (no USDA data, document for future manual seed)
// ═══════════════════════════════════════════════════════════════════════════
export const TIER3_GAPS = [
  { chain: 'Crepes & Waffles', items: ['Crepe de pollo', 'Crepe de champiñones', 'Waffle con helado'], notes: 'Colombian chain, no USDA/OFF data. Need manual nutrition from their menu.' },
  { chain: 'El Corral', items: ['Hamburguesa Corral', 'Hamburguesa BBQ', 'Todoterreno'], notes: 'Colombian burger chain. Could proxy with USDA generic hamburger (170693) + weight adjustment.' },
  { chain: 'Frisby', items: ['Combo personal (2pc + papas)', 'Alitas BBQ'], notes: 'Colombian fried chicken. Proxy with KFC data + 10% adjustment for local preparation.' },
  { chain: 'Postobón', items: ['Colombiana', 'Manzana', 'Uva'], notes: 'Colombian sodas. ~41 kcal/100ml (similar to Fanta). colombiana already added as proxy above.' },
  { chain: 'Juan Valdez', items: ['Café latte', 'Cappuccino', 'Arequipe latte'], notes: 'Colombian coffee chain. Proxy with Starbucks latte (53 kcal/100ml) for basic drinks.' },
];
