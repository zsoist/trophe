/**
 * scripts/data/canonical-foods-list.ts
 *
 * 150 canonical foods curated for Trophē's three primary user bases:
 *   - Mediterranean / Greek (~50)
 *   - Latin / Colombian (~50)
 *   - Standard Western / fitness (~50)
 *
 * Each entry specifies USDA FDC search query, expected data type preference,
 * region tagging, and common unit conversions (gram weights per portion).
 *
 * Source for gram weights: USDA FDC foodPortions when available,
 * otherwise standard reference values from USDA food composition guides.
 */

export interface CanonicalFood {
  key: string;
  searchQuery: string;
  preferredTypes: string[];
  region: string[];
  category: 'mediterranean' | 'latin' | 'standard';
  commonUnits: Record<string, number>;
  notes?: string;
}

export const CANONICAL_FOODS: CanonicalFood[] = [
  // ═══════════════════════════════════════════════════════════════════
  // MEDITERRANEAN / GREEK (~50)
  // ═══════════════════════════════════════════════════════════════════
  { key: 'egg_chicken_whole_raw', searchQuery: 'egg whole raw fresh', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 50, large: 50, medium: 44, small: 38 }, notes: 'USDA standard large egg = 50g' },
  { key: 'egg_chicken_whole_boiled', searchQuery: 'egg whole cooked hard-boiled', preferredTypes: ['SR Legacy'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 50, large: 50 } },
  { key: 'feta_cheese', searchQuery: 'cheese feta', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR'], category: 'mediterranean', commonUnits: { slice: 30, cup: 150 } },
  { key: 'olive_oil_extra_virgin', searchQuery: 'oil olive salad or cooking', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { tbsp: 14, tsp: 4.5, cup: 216 } },
  { key: 'greek_yogurt_plain_whole', searchQuery: 'yogurt greek plain whole milk', preferredTypes: ['SR Legacy', 'Survey (FNDDS)'], region: ['GR'], category: 'mediterranean', commonUnits: { cup: 245, tbsp: 15 } },
  { key: 'tomato_raw', searchQuery: 'tomatoes red ripe raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 123, medium: 123, large: 182, small: 91, cup: 180 } },
  { key: 'cucumber_raw', searchQuery: 'cucumber with peel raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'US'], category: 'mediterranean', commonUnits: { piece: 301, medium: 201, cup: 119 } },
  { key: 'spinach_raw', searchQuery: 'spinach raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'US'], category: 'mediterranean', commonUnits: { cup: 30, bunch: 340 } },
  { key: 'lentils_cooked', searchQuery: 'lentils mature seeds cooked boiled', preferredTypes: ['SR Legacy'], region: ['GR', 'CO'], category: 'mediterranean', commonUnits: { cup: 198, tbsp: 12 } },
  { key: 'chickpeas_cooked', searchQuery: 'chickpeas mature seeds cooked boiled', preferredTypes: ['SR Legacy'], region: ['GR', 'CO'], category: 'mediterranean', commonUnits: { cup: 164, tbsp: 10 } },
  { key: 'lamb_ground_cooked', searchQuery: 'lamb ground cooked broiled', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { palm: 100 } },
  { key: 'lamb_leg_roasted', searchQuery: 'lamb leg whole lean roasted', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { palm: 100 } },
  { key: 'pita_bread_whole_wheat', searchQuery: 'bread pita whole wheat', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { piece: 64, large: 64, small: 28 } },
  { key: 'hummus', searchQuery: 'hummus commercial', preferredTypes: ['SR Legacy'], region: ['GR', 'US'], category: 'mediterranean', commonUnits: { tbsp: 15, cup: 246 } },
  { key: 'tzatziki', searchQuery: 'dip sour cream base', preferredTypes: ['SR Legacy', 'Survey (FNDDS)'], region: ['GR'], category: 'mediterranean', commonUnits: { tbsp: 15, cup: 227 }, notes: 'USDA lacks exact tzatziki; use yogurt-based dip' },
  { key: 'eggplant_raw', searchQuery: 'eggplant raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR'], category: 'mediterranean', commonUnits: { piece: 458, cup: 82 } },
  { key: 'zucchini_raw', searchQuery: 'squash summer zucchini raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO'], category: 'mediterranean', commonUnits: { piece: 196, medium: 196, cup: 124 } },
  { key: 'bell_pepper_red_raw', searchQuery: 'peppers sweet red raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 119, medium: 119, cup: 149 } },
  { key: 'onion_raw', searchQuery: 'onions raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 110, medium: 110, large: 150, small: 70, cup: 160 } },
  { key: 'garlic_raw', searchQuery: 'garlic raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { clove: 3, head: 40 } },
  { key: 'lemon_raw', searchQuery: 'lemons raw without peel', preferredTypes: ['SR Legacy'], region: ['GR', 'CO'], category: 'mediterranean', commonUnits: { piece: 58, medium: 58, juice_tbsp: 15 } },
  { key: 'olives_kalamata', searchQuery: 'olives ripe canned', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { piece: 4, serving: 28 } },
  { key: 'halloumi_cheese', searchQuery: 'cheese semisoft', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { slice: 30 }, notes: 'USDA lacks halloumi; use semisoft cheese as proxy' },
  { key: 'sardines_canned_oil', searchQuery: 'sardine atlantic canned in oil', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { can: 92, piece: 12 } },
  { key: 'tuna_canned_water', searchQuery: 'fish tuna light canned drained', preferredTypes: ['SR Legacy'], region: ['GR', 'US'], category: 'mediterranean', commonUnits: { can: 165, serving: 85 } },
  { key: 'salmon_atlantic_raw', searchQuery: 'fish salmon atlantic wild raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US', 'GR'], category: 'mediterranean', commonUnits: { fillet: 198, palm: 100 } },
  { key: 'shrimp_cooked', searchQuery: 'crustaceans shrimp cooked', preferredTypes: ['SR Legacy'], region: ['GR', 'CO'], category: 'mediterranean', commonUnits: { piece: 6, serving: 85, cup: 145 } },
  { key: 'white_bread', searchQuery: 'bread white commercially prepared', preferredTypes: ['SR Legacy'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { slice: 25, piece: 25 } },
  { key: 'whole_wheat_bread', searchQuery: 'bread whole wheat commercially prepared', preferredTypes: ['SR Legacy'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { slice: 28, piece: 28 } },
  { key: 'pasta_cooked', searchQuery: 'pasta cooked enriched', preferredTypes: ['SR Legacy'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { cup: 140, serving: 140 } },
  { key: 'honey', searchQuery: 'honey', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { tbsp: 21, tsp: 7 } },
  { key: 'walnuts', searchQuery: 'nuts walnuts english', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'US'], category: 'mediterranean', commonUnits: { cup: 117, handful: 30, piece: 4 } },
  { key: 'almonds', searchQuery: 'nuts almonds', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'US'], category: 'mediterranean', commonUnits: { cup: 143, handful: 30, piece: 1.2 } },
  { key: 'fig_dried', searchQuery: 'figs dried uncooked', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { piece: 8.4, serving: 40 } },
  { key: 'watermelon_raw', searchQuery: 'watermelon raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO'], category: 'mediterranean', commonUnits: { cup: 152, slice: 286 } },
  { key: 'grape_leaves', searchQuery: 'grape leaves canned', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { leaf: 4, serving: 28 } },
  { key: 'oregano_dried', searchQuery: 'spices oregano dried', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { tsp: 1, tbsp: 3 } },
  { key: 'milk_whole', searchQuery: 'milk whole 3.25%', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { cup: 244, glass: 244, tbsp: 15 } },
  { key: 'butter', searchQuery: 'butter salted', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { tbsp: 14, tsp: 5, pat: 5 } },
  { key: 'potato_raw', searchQuery: 'potatoes flesh and skin raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 213, medium: 213, large: 369, small: 170 } },
  { key: 'carrot_raw', searchQuery: 'carrots raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 61, medium: 61, large: 72, cup: 128 } },
  { key: 'lettuce_romaine', searchQuery: 'lettuce cos or romaine raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'US'], category: 'mediterranean', commonUnits: { cup: 47, leaf: 6 } },
  { key: 'apple_raw', searchQuery: 'apples raw with skin', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 182, medium: 182, large: 223, small: 149 } },
  { key: 'orange_raw', searchQuery: 'oranges raw all commercial varieties', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { piece: 131, medium: 131, large: 184, small: 96 } },
  { key: 'strawberry_raw', searchQuery: 'strawberries raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { cup: 152, piece: 12, medium: 12 } },
  { key: 'grape_raw', searchQuery: 'grapes red or green raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR'], category: 'mediterranean', commonUnits: { cup: 151, piece: 5 } },
  { key: 'parsley_fresh', searchQuery: 'parsley fresh', preferredTypes: ['SR Legacy', 'Foundation'], region: ['GR'], category: 'mediterranean', commonUnits: { cup: 60, tbsp: 4, sprig: 1 } },
  { key: 'green_beans_cooked', searchQuery: 'beans snap green cooked boiled', preferredTypes: ['SR Legacy'], region: ['GR'], category: 'mediterranean', commonUnits: { cup: 125 } },
  { key: 'rice_white_cooked', searchQuery: 'rice white long-grain regular cooked', preferredTypes: ['SR Legacy'], region: ['GR', 'CO', 'US'], category: 'mediterranean', commonUnits: { cup: 158, tbsp: 10 } },

  // ═══════════════════════════════════════════════════════════════════
  // LATIN / COLOMBIAN (~50)
  // ═══════════════════════════════════════════════════════════════════
  { key: 'plantain_raw', searchQuery: 'plantains raw', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { piece: 179, medium: 179, cup: 148 } },
  { key: 'plantain_fried', searchQuery: 'plantains cooked fried', preferredTypes: ['SR Legacy', 'Survey (FNDDS)'], region: ['CO'], category: 'latin', commonUnits: { piece: 119, cup: 118 } },
  { key: 'black_beans_cooked', searchQuery: 'beans black mature seeds cooked boiled', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 172, tbsp: 11 } },
  { key: 'red_beans_cooked', searchQuery: 'beans kidney red mature seeds cooked', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 177 } },
  { key: 'white_rice_cooked', searchQuery: 'rice white medium-grain cooked', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 186, tbsp: 12 } },
  { key: 'avocado_raw', searchQuery: 'avocados raw all commercial varieties', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'GR', 'US'], category: 'latin', commonUnits: { piece: 201, medium: 201, half: 100, cup: 146 } },
  { key: 'corn_tortilla', searchQuery: 'tortillas corn ready to bake', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { piece: 26 } },
  { key: 'flour_tortilla', searchQuery: 'tortillas flour ready to bake', preferredTypes: ['SR Legacy'], region: ['CO', 'US'], category: 'latin', commonUnits: { piece: 49, small: 30, large: 64 } },
  { key: 'arepa_corn', searchQuery: 'cornmeal whole grain yellow', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { piece: 65, small: 50, large: 100 }, notes: 'USDA lacks arepa; use cornmeal as base, portion from Colombiana standards' },
  { key: 'ground_beef_cooked', searchQuery: 'beef ground 85% lean 15% fat cooked', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'US'], category: 'latin', commonUnits: { palm: 100, patty: 113, cup: 220 } },
  { key: 'chicken_breast_raw', searchQuery: 'chicken broilers breast meat only raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'GR', 'US'], category: 'latin', commonUnits: { piece: 174, palm: 100, half: 87 } },
  { key: 'chicken_breast_cooked', searchQuery: 'chicken broilers breast meat only roasted', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'GR', 'US'], category: 'latin', commonUnits: { piece: 172, palm: 100 } },
  { key: 'chicken_thigh_cooked', searchQuery: 'chicken thigh meat only cooked roasted', preferredTypes: ['SR Legacy'], region: ['CO', 'GR'], category: 'latin', commonUnits: { piece: 52, serving: 85 } },
  { key: 'pork_loin_cooked', searchQuery: 'pork loin whole lean only cooked roasted', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { palm: 100 } },
  { key: 'cheese_white_queso_fresco', searchQuery: 'cheese white queso blanco', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { slice: 28, cup: 132 } },
  { key: 'panela_cheese', searchQuery: 'cheese cottage lowfat', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { slice: 30, cup: 226 }, notes: 'USDA lacks queso panela; cottage approximation' },
  { key: 'cilantro_raw', searchQuery: 'coriander cilantro leaves raw', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 16, tbsp: 1, sprig: 0.5 } },
  { key: 'lime_raw', searchQuery: 'limes raw', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { piece: 67, medium: 67, juice_tbsp: 15 } },
  { key: 'mango_raw', searchQuery: 'mangos raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO'], category: 'latin', commonUnits: { piece: 336, cup: 165 } },
  { key: 'papaya_raw', searchQuery: 'papayas raw', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 145, piece: 500 } },
  { key: 'passion_fruit_raw', searchQuery: 'passion fruit juice purple raw', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 247 } },
  { key: 'guava_raw', searchQuery: 'guavas common raw', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { piece: 55, cup: 165 } },
  { key: 'banana_raw', searchQuery: 'bananas raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'GR', 'US'], category: 'latin', commonUnits: { piece: 118, medium: 118, large: 136, small: 101 } },
  { key: 'yuca_raw', searchQuery: 'cassava raw', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 206, piece: 304 } },
  { key: 'corn_sweet_cooked', searchQuery: 'corn sweet yellow cooked boiled', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'US'], category: 'latin', commonUnits: { ear: 90, cup: 164 } },
  { key: 'arepas_precooked_flour', searchQuery: 'cornmeal degermed enriched yellow', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 138, tbsp: 9 }, notes: 'Masarepa base; arepa = ~65g dough' },
  { key: 'sugar_white', searchQuery: 'sugars granulated', preferredTypes: ['SR Legacy'], region: ['CO', 'GR', 'US'], category: 'latin', commonUnits: { tsp: 4, tbsp: 12.5, cup: 200 } },
  { key: 'panela_sugar', searchQuery: 'sugars brown', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { tbsp: 14, cup: 220 }, notes: 'USDA lacks panela; brown sugar as proxy' },
  { key: 'coffee_black', searchQuery: 'beverages coffee brewed', preferredTypes: ['SR Legacy'], region: ['CO', 'GR', 'US'], category: 'latin', commonUnits: { cup: 237, tinto: 90 } },
  { key: 'chocolate_milk', searchQuery: 'milk chocolate fluid commercial', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 250 } },
  { key: 'empanada_beef', searchQuery: 'turnover meat and cheese', preferredTypes: ['SR Legacy', 'Survey (FNDDS)'], region: ['CO'], category: 'latin', commonUnits: { piece: 120 }, notes: 'USDA lacks empanada; turnover as proxy for macro reference' },
  { key: 'sour_cream', searchQuery: 'cream sour regular', preferredTypes: ['SR Legacy'], region: ['CO', 'US'], category: 'latin', commonUnits: { tbsp: 12, cup: 230 } },
  { key: 'cream_cheese', searchQuery: 'cheese cream', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'US'], category: 'latin', commonUnits: { tbsp: 14.5, cup: 232 } },
  { key: 'hot_dog_beef', searchQuery: 'frankfurter beef', preferredTypes: ['SR Legacy'], region: ['CO', 'US'], category: 'latin', commonUnits: { piece: 52 } },
  { key: 'white_cheese_cheddar', searchQuery: 'cheese cheddar sharp', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'US'], category: 'latin', commonUnits: { slice: 28, cup: 113 } },
  { key: 'cooking_oil_soy', searchQuery: 'oil soybean salad or cooking', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { tbsp: 14, tsp: 4.5, cup: 218 } },
  { key: 'green_peas_cooked', searchQuery: 'peas green cooked boiled', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'GR'], category: 'latin', commonUnits: { cup: 160 } },
  { key: 'sweet_potato_cooked', searchQuery: 'sweet potato cooked baked in skin', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'US'], category: 'latin', commonUnits: { piece: 114, medium: 114, cup: 200 } },
  { key: 'coconut_milk_canned', searchQuery: 'coconut milk canned', preferredTypes: ['SR Legacy'], region: ['CO'], category: 'latin', commonUnits: { cup: 240, tbsp: 15 } },

  // ═══════════════════════════════════════════════════════════════════
  // STANDARD WESTERN / FITNESS (~50)
  // ═══════════════════════════════════════════════════════════════════
  { key: 'oats_rolled_dry', searchQuery: 'cereals oats regular and quick not fortified dry', preferredTypes: ['SR Legacy'], region: ['US', 'GR'], category: 'standard', commonUnits: { cup: 81, tbsp: 5 } },
  { key: 'peanut_butter', searchQuery: 'peanut butter smooth style with salt', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { tbsp: 16, tsp: 5.3, cup: 258 } },
  { key: 'almond_butter', searchQuery: 'almond butter plain without salt', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { tbsp: 16, tsp: 5.3 } },
  { key: 'whey_protein_powder', searchQuery: 'protein supplement whey based powder', preferredTypes: ['SR Legacy', 'Survey (FNDDS)', 'Branded'], region: ['US', 'GR'], category: 'standard', commonUnits: { scoop: 30, tbsp: 8 }, notes: 'Generic whey isolate; branded varies' },
  { key: 'rice_cake_plain', searchQuery: 'rice cakes brown rice plain unsalted', preferredTypes: ['SR Legacy'], region: ['US', 'GR'], category: 'standard', commonUnits: { piece: 9, cake: 9 } },
  { key: 'broccoli_raw', searchQuery: 'broccoli raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US', 'GR'], category: 'standard', commonUnits: { cup: 91, stalk: 151, piece: 151 } },
  { key: 'mixed_nuts', searchQuery: 'nuts mixed with peanuts oil roasted with salt', preferredTypes: ['SR Legacy'], region: ['US', 'GR'], category: 'standard', commonUnits: { handful: 30, cup: 142, serving: 28 } },
  { key: 'cottage_cheese', searchQuery: 'cheese cottage lowfat 2% milkfat', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { cup: 226, tbsp: 14 } },
  { key: 'mozzarella_cheese', searchQuery: 'cheese mozzarella whole milk', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US', 'GR'], category: 'standard', commonUnits: { slice: 28, cup: 112 } },
  { key: 'tilapia_cooked', searchQuery: 'fish tilapia cooked dry heat', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { fillet: 87, palm: 100 } },
  { key: 'cod_atlantic_cooked', searchQuery: 'fish cod atlantic cooked dry heat', preferredTypes: ['SR Legacy'], region: ['US', 'GR'], category: 'standard', commonUnits: { fillet: 180, palm: 100 } },
  { key: 'ground_turkey', searchQuery: 'turkey ground cooked', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { palm: 100, patty: 113 } },
  { key: 'bacon_pork_cooked', searchQuery: 'pork cured bacon cooked pan-fried', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { slice: 8, piece: 8 } },
  { key: 'canned_tuna_water', searchQuery: 'fish tuna light canned in water drained', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { can: 165, serving: 85 } },
  { key: 'blueberry_raw', searchQuery: 'blueberries raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { cup: 148, serving: 75 } },
  { key: 'raspberry_raw', searchQuery: 'raspberries raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { cup: 123 } },
  { key: 'peach_raw', searchQuery: 'peaches yellow raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { piece: 150, medium: 150, cup: 154 } },
  { key: 'pear_raw', searchQuery: 'pears raw', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { piece: 178, medium: 178 } },
  { key: 'kiwi_raw', searchQuery: 'kiwifruit green raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US', 'GR'], category: 'standard', commonUnits: { piece: 69, medium: 69 } },
  { key: 'pineapple_raw', searchQuery: 'pineapple raw all varieties', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO', 'US'], category: 'standard', commonUnits: { cup: 165, slice: 84 } },
  { key: 'mushroom_white_raw', searchQuery: 'mushrooms white raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { cup: 70, piece: 18, medium: 18 } },
  { key: 'asparagus_cooked', searchQuery: 'asparagus cooked boiled', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { cup: 180, spear: 16 } },
  { key: 'cauliflower_raw', searchQuery: 'cauliflower raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US', 'GR'], category: 'standard', commonUnits: { cup: 107, head: 588 } },
  { key: 'celery_raw', searchQuery: 'celery raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { stalk: 40, cup: 101 } },
  { key: 'quinoa_cooked', searchQuery: 'quinoa cooked', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { cup: 185 } },
  { key: 'brown_rice_cooked', searchQuery: 'rice brown long-grain cooked', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { cup: 195 } },
  { key: 'cheddar_cheese', searchQuery: 'cheese cheddar sharp natural', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { slice: 28, cup: 113 } },
  { key: 'milk_skim', searchQuery: 'milk nonfat fluid', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { cup: 245, glass: 245 } },
  { key: 'tofu_firm', searchQuery: 'tofu firm prepared with calcium sulfate', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { cup: 252, slice: 84 } },
  { key: 'dark_chocolate', searchQuery: 'chocolate dark 70-85% cacao solids', preferredTypes: ['SR Legacy'], region: ['US', 'GR'], category: 'standard', commonUnits: { square: 10, serving: 28, bar: 100 } },
  { key: 'coconut_raw', searchQuery: 'coconut meat raw', preferredTypes: ['SR Legacy', 'Foundation'], region: ['CO'], category: 'standard', commonUnits: { cup: 80, piece: 45 } },
  { key: 'chia_seeds', searchQuery: 'seeds chia seeds dried', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { tbsp: 12, cup: 170 } },
  { key: 'flax_seeds', searchQuery: 'seeds flaxseed', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { tbsp: 7, cup: 155 } },
  { key: 'sunflower_seeds', searchQuery: 'seeds sunflower seed kernels dried', preferredTypes: ['SR Legacy', 'Foundation'], region: ['US'], category: 'standard', commonUnits: { tbsp: 8.5, cup: 140, handful: 30 } },
  { key: 'mayonnaise', searchQuery: 'salad dressing mayonnaise regular', preferredTypes: ['SR Legacy'], region: ['CO', 'US'], category: 'standard', commonUnits: { tbsp: 14, tsp: 5 } },
  { key: 'ketchup', searchQuery: 'catsup', preferredTypes: ['SR Legacy'], region: ['CO', 'US'], category: 'standard', commonUnits: { tbsp: 15, tsp: 5, packet: 6 } },
  { key: 'mustard_yellow', searchQuery: 'mustard prepared yellow', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { tsp: 5, tbsp: 15 } },
  { key: 'soy_sauce', searchQuery: 'soy sauce made from soy', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { tbsp: 16, tsp: 5 } },
  { key: 'balsamic_vinegar', searchQuery: 'vinegar balsamic', preferredTypes: ['SR Legacy'], region: ['GR', 'US'], category: 'standard', commonUnits: { tbsp: 16, tsp: 5 } },
  { key: 'maple_syrup', searchQuery: 'syrups maple', preferredTypes: ['SR Legacy'], region: ['US'], category: 'standard', commonUnits: { tbsp: 20, tsp: 7 } },
  { key: 'granola', searchQuery: 'cereals granola homemade', preferredTypes: ['SR Legacy', 'Survey (FNDDS)'], region: ['US'], category: 'standard', commonUnits: { cup: 122, serving: 60 } },
];
