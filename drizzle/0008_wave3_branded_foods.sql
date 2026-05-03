-- WAVE 3 SQL (paste into migration or run directly)
-- ═══════════════════════════════════════════════════════

-- Wave 3: mcdonalds_big_mac → McDONALD'S, BIG MAC (FDC 170720)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '7b6c7fd1-61d2-54e6-a668-17abc60b95aa', 'usda', '170720',
  'https://fdc.nal.usda.gov/food-details/170720/nutrients',
  'label', 'McDONALD''S, BIG MAC', ARRAY['US','CO','GR'],
  257, 11.8, 20.1, 15,
  1.6, 3.97,
  100, '100g', 170720, 0.9,
  'mcdonalds_big_mac', 'Wave 3 branded food: mcdonalds_big_mac. USDA FDC SR Legacy #170720. USDA FDC 170720. McDonald''s official: 200g patty+bun, ~215g assembled. 257 kcal/100g → 550 kcal/sandwich.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 215, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170720'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'sandwich', 215, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170720'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'sandwich');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 215, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170720'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'big mac', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170720'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'big mac');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'bigmac', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170720'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'bigmac');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'big mac', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170720'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'big mac');

-- Wave 3: mcdonalds_chicken_mcnuggets → McDONALD'S, Chicken McNUGGETS (FDC 173297)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '1d11798b-fb9b-530e-bfb7-9a01a049c2a1', 'usda', '173297',
  'https://fdc.nal.usda.gov/food-details/173297/nutrients',
  'label', 'McDONALD''S, Chicken McNUGGETS', ARRAY['US','CO','GR'],
  302, 15.8, 15.1, 19.8,
  NULL, 0.08,
  100, '100g', 173297, 0.9,
  'mcdonalds_chicken_mcnuggets', 'Wave 3 branded food: mcdonalds_chicken_mcnuggets. USDA FDC SR Legacy #173297. CRITICAL: piece=17g (one nugget). USDA FDC 173297. 302 kcal/100g → 51 kcal/nugget. Serving=6pc default.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 17, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '4_piece', 68, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '4_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '6_piece', 102, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '6_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '10_piece', 170, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '10_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '20_piece', 340, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '20_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 102, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'mcnuggets', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'mcnuggets');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'chicken mcnuggets', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'chicken mcnuggets');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'nuggets', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'nuggets');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'nuggets de pollo', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'nuggets de pollo');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'mcnuggets', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173297'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'mcnuggets');

-- Wave 3: mcdonalds_french_fries_large → McDONALD'S, french fries (FDC 170721)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '765a1f02-040a-5efe-a229-67421a813cd2', 'usda', '170721',
  'https://fdc.nal.usda.gov/food-details/170721/nutrients',
  'label', 'McDONALD''S, french fries', ARRAY['US','CO','GR'],
  323, 3.41, 42.6, 15.5,
  3.9, 0.21,
  100, '100g', 170721, 0.9,
  'mcdonalds_french_fries_large', 'Wave 3 branded food: mcdonalds_french_fries_large. USDA FDC SR Legacy #170721. USDA FDC 170721. 323 kcal/100g. Large=154g (497 kcal), Medium=117g (378 kcal), Small=71g (229 kcal).', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 154, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170721'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'large', 154, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170721'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'large');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'medium', 117, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170721'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'medium');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'small', 71, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170721'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'small');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'mcdonald fries', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170721'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'mcdonald fries');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'mcdonalds fries', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170721'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'mcdonalds fries');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'papas fritas mcdonalds', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170721'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'papas fritas mcdonalds');

-- Wave 3: mcdonalds_cheeseburger → McDONALD'S, Cheeseburger (FDC 170320)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '9155a613-dc87-5b02-afb2-a3aebe821b06', 'usda', '170320',
  'https://fdc.nal.usda.gov/food-details/170320/nutrients',
  'label', 'McDONALD''S, Cheeseburger', ARRAY['US','CO'],
  263, 13, 27.8, 11.8,
  1.1, 6.22,
  100, '100g', 170320, 0.9,
  'mcdonalds_cheeseburger', 'Wave 3 branded food: mcdonalds_cheeseburger. USDA FDC SR Legacy #170320. USDA FDC 170320. 263 kcal/100g → 313 kcal/sandwich.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 119, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170320'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'sandwich', 119, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170320'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'sandwich');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 119, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170320'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'mcdonalds cheeseburger', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170320'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'mcdonalds cheeseburger');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'cheeseburger mcdonalds', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170320'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'cheeseburger mcdonalds');

-- Wave 3: mcdonalds_egg_mcmuffin → McDONALD'S, Egg McMUFFIN (FDC 173307)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '5c71e314-04f0-57e5-92b7-5aefd4d536d0', 'usda', '173307',
  'https://fdc.nal.usda.gov/food-details/173307/nutrients',
  'label', 'McDONALD''S, Egg McMUFFIN', ARRAY['US','CO'],
  228, 13.6, 21.7, 9.66,
  1.1, 2.13,
  100, '100g', 173307, 0.9,
  'mcdonalds_egg_mcmuffin', 'Wave 3 branded food: mcdonalds_egg_mcmuffin. USDA FDC SR Legacy #173307. USDA FDC 173307. 228 kcal/100g → 312 kcal/sandwich.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 137, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173307'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'sandwich', 137, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173307'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'sandwich');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 137, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '173307'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: burger_king_whopper → BURGER KING, WHOPPER, no cheese (FDC 170727)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '30f67ec2-bcd4-5b9b-b240-6af692e040d0', 'usda', '170727',
  'https://fdc.nal.usda.gov/food-details/170727/nutrients',
  'label', 'BURGER KING, WHOPPER, no cheese', ARRAY['US','CO'],
  233, 10.7, 18.6, 12.8,
  1.8, 4.22,
  100, '100g', 170727, 0.9,
  'burger_king_whopper', 'Wave 3 branded food: burger_king_whopper. USDA FDC SR Legacy #170727. USDA FDC 170727. 233 kcal/100g. Official BK weight 290g (no cheese) → 676 kcal. With cheese: 316g.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 290, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170727'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'sandwich', 290, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170727'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'sandwich');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 290, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170727'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'whopper', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170727'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'whopper');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'whopper', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170727'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'whopper');

-- Wave 3: burger_king_whopper_cheese → Whopper with cheese (Burger King) (FDC 2706899)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '18d43f8e-63bd-5e93-958f-7f0489f05be2', 'usda', '2706899',
  'https://fdc.nal.usda.gov/food-details/2706899/nutrients',
  'label', 'Whopper with cheese (Burger King)', ARRAY['US','CO'],
  268, 13.69, 17.73, 15.8,
  1.1, 4.5,
  100, '100g', 2706899, 0.9,
  'burger_king_whopper_cheese', 'Wave 3 branded food: burger_king_whopper_cheese. USDA FDC Survey (FNDDS) #2706899. USDA FDC 170728. 250 kcal/100g → 790 kcal/sandwich.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 316, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2706899'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'sandwich', 316, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2706899'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'sandwich');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 316, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2706899'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: kfc_popcorn_chicken → KFC, Popcorn Chicken (FDC 170737)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '24da6e5f-22cf-58f9-b9d4-f67e84afc996', 'usda', '170737',
  'https://fdc.nal.usda.gov/food-details/170737/nutrients',
  'label', 'KFC, Popcorn Chicken', ARRAY['US','CO'],
  351, 17.7, 21.2, 21.7,
  1, 0,
  100, '100g', 170737, 0.9,
  'kfc_popcorn_chicken', 'Wave 3 branded food: kfc_popcorn_chicken. USDA FDC SR Legacy #170737. USDA FDC 170737. 351 kcal/100g. Regular serving ~114g (400 kcal).', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 114, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170737'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'large', 170, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170737'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'large');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'individual', 99, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170737'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'individual');

-- Wave 3: kfc_crispy_strips → KFC, Crispy Chicken Strips (FDC 170341)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  'dff26966-cbd2-54a8-948a-ba53231b0daf', 'usda', '170341',
  'https://fdc.nal.usda.gov/food-details/170341/nutrients',
  'label', 'KFC, Crispy Chicken Strips', ARRAY['US','CO'],
  274, 20.2, 13.7, 15.4,
  1.4, 0,
  100, '100g', 170341, 0.9,
  'kfc_crispy_strips', 'Wave 3 branded food: kfc_crispy_strips. USDA FDC SR Legacy #170341. USDA FDC 170341. 274 kcal/100g. One strip ~47g (129 kcal). Serving=3 strips.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 47, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170341'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'strip', 47, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170341'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'strip');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '3_piece', 141, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170341'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '3_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 141, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170341'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: chickfila_chicken_sandwich → CHICK-FIL-A, chicken sandwich (FDC 170790)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  'bac53c44-0ffc-5ea3-a884-68eb32c41cef', 'usda', '170790',
  'https://fdc.nal.usda.gov/food-details/170790/nutrients',
  'label', 'CHICK-FIL-A, chicken sandwich', ARRAY['US'],
  249, 16.3, 20.9, 11.2,
  1.4, 3.64,
  100, '100g', 170790, 0.9,
  'chickfila_chicken_sandwich', 'Wave 3 branded food: chickfila_chicken_sandwich. USDA FDC SR Legacy #170790. USDA FDC 170790. 249 kcal/100g → 440 kcal/sandwich.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 182, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170790'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'sandwich', 182, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170790'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'sandwich');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 182, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170790'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: chickfila_chicken_strips → CHICK-FIL-A, Chick-n-Strips (FDC 170303)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  'f2d32bfa-dad1-5573-ab1f-df1fd66ab91d', 'usda', '170303',
  'https://fdc.nal.usda.gov/food-details/170303/nutrients',
  'label', 'CHICK-FIL-A, Chick-n-Strips', ARRAY['US'],
  228, 21.4, 10.4, 11.2,
  0.9, 1.24,
  100, '100g', 170303, 0.9,
  'chickfila_chicken_strips', 'Wave 3 branded food: chickfila_chicken_strips. USDA FDC SR Legacy #170303. USDA FDC 170303. 228 kcal/100g. One strip ~38g. 4-count serving=152g (347 kcal).', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 38, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170303'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'strip', 38, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170303'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'strip');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '4_count', 152, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170303'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '4_count');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 152, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170303'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: subway_turkey_breast_sub → SUBWAY, turkey breast sub on white bread with lettuce and tomato (FDC 170711)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '6e8cbaa9-4f03-502b-b421-ca66a2cb9f20', 'usda', '170711',
  'https://fdc.nal.usda.gov/food-details/170711/nutrients',
  'label', 'SUBWAY, turkey breast sub on white bread with lettuce and tomato', ARRAY['US','CO'],
  147, 9.12, 22.4, 2.31,
  1.3, 3.09,
  100, '100g', 170711, 0.9,
  'subway_turkey_breast_sub', 'Wave 3 branded food: subway_turkey_breast_sub. USDA FDC SR Legacy #170711. USDA FDC 170711. 147 kcal/100g. 6-inch sub ~224g (329 kcal).', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '6_inch', 224, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170711'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '6_inch');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'footlong', 448, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170711'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'footlong');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 224, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170711'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: subway_meatball_sub → SUBWAY, meatball marinara sub on white bread (no toppings) (FDC 170708)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '611e8e83-4dab-5650-9d16-e49a9a08be67', 'usda', '170708',
  'https://fdc.nal.usda.gov/food-details/170708/nutrients',
  'label', 'SUBWAY, meatball marinara sub on white bread (no toppings)', ARRAY['US','CO'],
  219, 9.77, 26, 8.45,
  2.1, 4.98,
  100, '100g', 170708, 0.9,
  'subway_meatball_sub', 'Wave 3 branded food: subway_meatball_sub. USDA FDC SR Legacy #170708. USDA FDC 170708. 219 kcal/100g. 6-inch sub ~284g (622 kcal).', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '6_inch', 284, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170708'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '6_inch');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'footlong', 568, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170708'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'footlong');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 284, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170708'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: french_fries_fast_food → Fast foods, potato, french fried in vegetable oil (FDC 170698)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  'b8bdfecd-c7c3-5c5a-9cec-1e4632e88197', 'usda', '170698',
  'https://fdc.nal.usda.gov/food-details/170698/nutrients',
  'label', 'Fast foods, potato, french fried in vegetable oil', ARRAY['US','CO','GR'],
  312, 3.43, 41.4, 14.7,
  3.8, 0.3,
  100, '100g', 170698, 0.9,
  'french_fries_fast_food', 'Wave 3 branded food: french_fries_fast_food. USDA FDC SR Legacy #170698. USDA FDC 170698. 312 kcal/100g. Generic fast food fries (not chain-specific).', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 117, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170698'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'large', 154, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170698'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'large');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'medium', 117, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170698'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'medium');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'small', 71, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170698'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'small');

-- Wave 3: chicken_nuggets_fast_food → WENDY'S, Chicken Nuggets (FDC 170725)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '0d5afc9f-7be9-57b6-9c05-b9bf4a2bd758', 'usda', '170725',
  'https://fdc.nal.usda.gov/food-details/170725/nutrients',
  'label', 'WENDY''S, Chicken Nuggets', ARRAY['US','CO'],
  326, 16.5, 14.3, 22.6,
  NULL, 0.08,
  100, '100g', 170725, 0.9,
  'chicken_nuggets_fast_food', 'Wave 3 branded food: chicken_nuggets_fast_food. USDA FDC SR Legacy #170725. USDA FDC 170725. 326 kcal/100g. Generic nugget weight ~17g each (Wendy''s reference). Serving=6pc.', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 17, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170725'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '4_piece', 68, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170725'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '4_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '6_piece', 102, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170725'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '6_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '10_piece', 170, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170725'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '10_piece');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 102, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '170725'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'serving');

-- Wave 3: coca_cola → COCA-COLA, COLA (FDC 2678649)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  'cf4c8803-2f5d-5559-9366-3fd8cb5ecb00', 'usda', '2678649',
  'https://fdc.nal.usda.gov/food-details/2678649/nutrients',
  'label', 'COCA-COLA, COLA', ARRAY['US','CO','GR'],
  39, 0, 11, 0,
  NULL, 11,
  100, '100g', 2678649, 0.9,
  'coca_cola', 'Wave 3 branded food: coca_cola. USDA FDC Branded #2678649. USDA FDC 2678649. 39 kcal/100ml. Can=355ml (138 kcal). Colombian 600ml (234 kcal). Fixes WRONG_FOOD: coca cola→POWERADE.', NOW(), 80,
  'Coca-Cola USA Operations'
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'can', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'can');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '355ml', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '355ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '500ml', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '500ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '600ml', 600, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '600ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'bottle', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'bottle');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'liter', 1000, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'liter');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'glass', 240, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'glass');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'coca cola', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'coca cola');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'coke', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'coke');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'coca-cola', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'coca-cola');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'coca cola', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'coca cola');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'coca', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2678649'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'coca');

-- Wave 3: sprite → Sprite Bottle, 1.75 Liters (FDC 2718324)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '41409128-8245-5597-a7dc-6ad09ecf37ec', 'usda', '2718324',
  'https://fdc.nal.usda.gov/food-details/2718324/nutrients',
  'label', 'Sprite Bottle, 1.75 Liters', ARRAY['US','CO','GR'],
  39, 0, 11, 0,
  0, 10.7,
  100, '100g', 2718324, 0.9,
  'sprite', 'Wave 3 branded food: sprite. USDA FDC Branded #2718324. USDA FDC 2742330. 39 kcal/100ml. Same caloric density as Coca-Cola.', NOW(), 80,
  'The Coca-Cola Company'
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'can', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'can');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '355ml', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '355ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '500ml', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '500ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'bottle', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'bottle');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'liter', 1000, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'liter');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'glass', 240, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'glass');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'sprite', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'sprite');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'sprite', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2718324'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'sprite');

-- Wave 3: pepsi_cola → PEPSI SODA, 500 ML (FDC 2657904)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '01107d33-f0ca-5dec-8c74-b36ea7a2999c', 'usda', '2657904',
  'https://fdc.nal.usda.gov/food-details/2657904/nutrients',
  'label', 'PEPSI SODA, 500 ML', ARRAY['US','CO'],
  42, 0, 11.6, 0,
  NULL, 11.6,
  100, '100g', 2657904, 0.9,
  'pepsi_cola', 'Wave 3 branded food: pepsi_cola. USDA FDC Branded #2657904. USDA FDC 1460452. 43 kcal/100ml (slightly more than Coke).', NOW(), 80,
  'Pepsi-Cola North America Inc.'
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'can', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'can');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '355ml', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '355ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '500ml', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '500ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'bottle', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'bottle');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'liter', 1000, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'liter');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'glass', 240, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'glass');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'pepsi', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'pepsi');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'pepsi', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '2657904'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'pepsi');

-- Wave 3: fanta_orange → FANTA, SODA, ORANGE, ORANGE (FDC 1595632)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '59a9ae6c-d98a-5423-abbd-967baf19fc8e', 'usda', '1595632',
  'https://fdc.nal.usda.gov/food-details/1595632/nutrients',
  'label', 'FANTA, SODA, ORANGE, ORANGE', ARRAY['US','CO','GR'],
  45, 0, 12.6, 0,
  NULL, 12.6,
  100, '100g', 1595632, 0.9,
  'fanta_orange', 'Wave 3 branded food: fanta_orange. USDA FDC Branded #1595632. USDA FDC 1595632. 45 kcal/100ml.', NOW(), 80,
  'Coca-Cola USA Operations'
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'can', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '1595632'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'can');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '355ml', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '1595632'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '355ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '500ml', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '1595632'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '500ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'bottle', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '1595632'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'bottle');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'glass', 240, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '1595632'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'glass');

-- Wave 3: red_bull_energy_drink → RED BULL, ENERGY DRINK (FDC 541366)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  'b1f8233c-a234-5e9c-8b23-e3573217ea6c', 'usda', '541366',
  'https://fdc.nal.usda.gov/food-details/541366/nutrients',
  'label', 'RED BULL, ENERGY DRINK', ARRAY['US','CO','GR'],
  45, 0.28, 11.3, 0,
  NULL, 10.7,
  100, '100g', 541366, 0.9,
  'red_bull_energy_drink', 'Wave 3 branded food: red_bull_energy_drink. USDA FDC Branded #541366. USDA FDC 541366. 45 kcal/100ml. Standard can=250ml (112 kcal).', NOW(), 80,
  'Red Bull North America, Inc.'
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'can', 250, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541366'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'can');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '250ml', 250, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541366'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '250ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '355ml', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541366'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '355ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '473ml', 473, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541366'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '473ml');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'red bull', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541366'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'red bull');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'red bull', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541366'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'red bull');

-- Wave 3: starbucks_caffe_latte → CAFFE LATTE ICED ESPRESSO BEVERAGE, CAFFE LATTE (FDC 690916)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '6884a92c-4bb5-5ac2-9d56-82c254bf5871', 'usda', '690916',
  'https://fdc.nal.usda.gov/food-details/690916/nutrients',
  'label', 'CAFFE LATTE ICED ESPRESSO BEVERAGE, CAFFE LATTE', ARRAY['US','CO','GR'],
  53, 1.93, 8.94, 1.09,
  0, 8.21,
  100, '100g', 690916, 0.9,
  'starbucks_caffe_latte', 'Wave 3 branded food: starbucks_caffe_latte. USDA FDC Branded #690916. USDA FDC 690916. 53 kcal/100ml. Grande (473ml) = 251 kcal. Fixes WRONG_FOOD: latte→platter.', NOW(), 80,
  'STARBUCKS, INC'
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'tall', 354, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'tall');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'grande', 473, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'grande');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'venti', 591, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'venti');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'cup', 354, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'cup');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'starbucks latte', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'starbucks latte');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'caffe latte', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'caffe latte');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'latte', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'latte');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'latte', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'latte');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'café latte', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '690916'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'café latte');

-- Wave 3: orange_juice_commercial → TROPICANA, 100% JUICE, ORANGE (FDC 541374)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '64d4fe41-8331-5f2a-be58-075de31b7876', 'usda', '541374',
  'https://fdc.nal.usda.gov/food-details/541374/nutrients',
  'label', 'TROPICANA, 100% JUICE, ORANGE', ARRAY['US','CO','GR'],
  46, 0.83, 10.8, 0,
  NULL, 9.17,
  100, '100g', 541374, 0.9,
  'orange_juice_commercial', 'Wave 3 branded food: orange_juice_commercial. USDA FDC Branded #541374. USDA FDC 2501658. 46 kcal/100ml. Standard glass (240ml) = 110 kcal.', NOW(), 80,
  'Tropicana Products, Inc.'
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'glass', 240, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541374'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'glass');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'cup', 240, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541374'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'cup');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '500ml', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541374'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '500ml');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'bottle', 500, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '541374'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'bottle');

-- Wave 3: beer_regular → Alcoholic beverage, beer, regular, all (FDC 168746)
INSERT INTO foods (id, source, source_id, source_url, data_quality, name_en, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g,
  default_serving_grams, default_serving_unit, usda_fdc_id, macro_confidence,
  canonical_food_key, provenance_notes, data_reviewed_at, popularity, brand)
VALUES (
  '077d74d6-869b-5cb0-87d8-766ab05035e7', 'usda', '168746',
  'https://fdc.nal.usda.gov/food-details/168746/nutrients',
  'label', 'Alcoholic beverage, beer, regular, all', ARRAY['US','CO','GR'],
  43, 0.46, 3.55, 0,
  0, 0,
  100, '100g', 168746, 0.9,
  'beer_regular', 'Wave 3 branded food: beer_regular. USDA FDC SR Legacy #168746. USDA FDC 168746. 43 kcal/100ml. Standard can/bottle 355ml (153 kcal). Colombian lata 330ml (142 kcal).', NOW(), 80,
  NULL
) ON CONFLICT (source, source_id) DO UPDATE SET
  canonical_food_key = EXCLUDED.canonical_food_key,
  usda_fdc_id = EXCLUDED.usda_fdc_id,
  macro_confidence = EXCLUDED.macro_confidence,
  provenance_notes = EXCLUDED.provenance_notes,
  data_reviewed_at = EXCLUDED.data_reviewed_at,
  popularity = GREATEST(COALESCE(foods.popularity, 0), 80),
  brand = EXCLUDED.brand,
  region = EXCLUDED.region;
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'can', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '168746'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'can');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'bottle', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '168746'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'bottle');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'pint', 473, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '168746'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'pint');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'glass', 355, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '168746'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'glass');
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, '330ml', 330, 'usda'
FROM foods f WHERE f.source = 'usda' AND f.source_id = '168746'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = '330ml');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'en', 'beer', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '168746'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'beer');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
SELECT f.id, 'es', 'cerveza', false
FROM foods f WHERE f.source = 'usda' AND f.source_id = '168746'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.alias = 'cerveza');

