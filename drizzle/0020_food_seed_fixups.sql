-- 0020: Post-seed fixups for CI test stability
-- 1. Fix feta φέτα/slice to 30g (USDA-standard feta slice weight)
-- 2. Add raw egg food for CI (previously only from USDA import)
-- 3. Add egg aliases and unit conversion

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 1: Feta unit conversions — use 30g (USDA FDC standard feta slice)
-- In 0019, φέτα/slice were set to 28g. The universal default is 30g/slice,
-- and existing tests expect 30g. Update to 30g for consistency.
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE food_unit_conversions
SET grams_per_unit = 30
WHERE unit = 'φέτα'
  AND food_id = (SELECT id FROM foods WHERE source = 'hhf' AND source_id = 'gr_base_001' LIMIT 1)
  AND grams_per_unit = 28;

UPDATE food_unit_conversions
SET grams_per_unit = 30
WHERE unit = 'slice'
  AND food_id = (SELECT id FROM foods WHERE source = 'hhf' AND source_id = 'gr_base_001' LIMIT 1)
  AND grams_per_unit = 28;

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIX 2: Raw egg — USDA FDC #171287 (Egg, whole, raw, fresh)
-- Essential food missing from seed migrations. Previously only from USDA import.
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO foods (
  source, source_id, data_quality,
  name_en, name_el, name_es,
  region, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
  fiber_per_100g, sugar_per_100g, sodium_mg,
  default_serving_grams, default_serving_unit, macro_confidence,
  canonical_food_key, provenance_notes, popularity
) VALUES (
  'hhf', 'gr_egg_raw_001', 'lab_verified',
  'Egg whole raw', 'Αυγό ωμό ολόκληρο', 'Huevo entero crudo',
  ARRAY['GR','CO','US'], 143, 12.6, 0.72, 9.51,
  0, 0.37, 142,
  50, 'piece', 0.90,
  'egg_chicken_whole_raw', 'USDA FDC #171287. Egg, whole, raw, fresh. Standard large egg ~50g.', 55
) ON CONFLICT (source, source_id) DO NOTHING;

-- Aliases for the egg
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'egg', true
  FROM foods f WHERE f.source = 'hhf' AND f.source_id = 'gr_egg_raw_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.lang = 'en' AND fa.alias = 'egg')
ON CONFLICT (food_id, lang, alias) DO NOTHING;

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'eggs', false
  FROM foods f WHERE f.source = 'hhf' AND f.source_id = 'gr_egg_raw_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.lang = 'en' AND fa.alias = 'eggs')
ON CONFLICT (food_id, lang, alias) DO NOTHING;

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αυγό', true
  FROM foods f WHERE f.source = 'hhf' AND f.source_id = 'gr_egg_raw_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.lang = 'el' AND fa.alias = 'αυγό')
ON CONFLICT (food_id, lang, alias) DO NOTHING;

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αυγά', false
  FROM foods f WHERE f.source = 'hhf' AND f.source_id = 'gr_egg_raw_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.lang = 'el' AND fa.alias = 'αυγά')
ON CONFLICT (food_id, lang, alias) DO NOTHING;

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'es', 'huevo', true
  FROM foods f WHERE f.source = 'hhf' AND f.source_id = 'gr_egg_raw_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id = f.id AND fa.lang = 'es' AND fa.alias = 'huevo')
ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Food-specific piece conversion: 1 egg = 50g (USDA large egg)
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
  SELECT f.id, 'piece', 50, 'usda_fdc'
  FROM foods f WHERE f.source = 'hhf' AND f.source_id = 'gr_egg_raw_001'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id = f.id AND fuc.unit = 'piece');
