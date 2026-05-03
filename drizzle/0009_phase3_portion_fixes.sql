-- Phase 3: Portion-size fixes for traditional Greek dishes
-- Fixes eval cases gr-05, gr-07, gr-09 by adding food-specific unit conversions
-- and normalizing default_serving_unit values.
--
-- Root cause: Universal fallback (serving=100g, piece=80g) won over food's own
-- default_serving_grams because default_serving_unit didn't match normalized unit.

-- ═══════════════════════════════════════════════════════════════════════════════
-- gr-09: Greek Salad (Horiatiki) — fix non-normalized default_serving_unit
-- Current: '1 serving (200g)' → doesn't match LLM's "serving"
-- Fix: normalize to 'serving' so step 3 in resolveUnit matches
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE foods
SET default_serving_unit = 'serving'
WHERE id = 'e8d82c07-fa2a-4f88-8205-ba18be04d6d5'
  AND default_serving_unit = '1 serving (200g)';

-- Also add explicit food_unit_conversion rows for both Greek salad entries
-- so they always win over the universal serving=100g fallback.

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
VALUES
  -- Greek Salad (Horiatiki) — 200g serving
  ('e8d82c07-fa2a-4f88-8205-ba18be04d6d5', 'serving', 200, 'hhf'),
  ('e8d82c07-fa2a-4f88-8205-ba18be04d6d5', 'piece', 200, 'hhf'),
  -- Horiatiki Village Salad — 250g serving
  ('e3925524-1dea-4897-b0d8-52ad0e8ca220', 'piece', 250, 'hhf')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- gr-05: Souvlaki Chicken — add piece/serving conversions
-- Current: default_serving_unit='skewer' (150g) but LLM sends "piece"
-- Fix: add piece + serving conversions at 150g
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
VALUES
  ('69f763e7-e55f-4819-9748-c81421f4e75d', 'piece', 150, 'hhf'),
  ('69f763e7-e55f-4819-9748-c81421f4e75d', 'serving', 150, 'hhf')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- gr-07: Olives — food-specific handful conversion
-- Current: universal handful=30g applies. For olives, a handful is ~40g
-- (10 jumbo olives at 4g each, or 12-15 regular olives)
-- Fix: add olive-specific handful=40g
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
VALUES
  -- Olives, ripe, canned (jumbo-super colossal) — olives_kalamata
  ('bac1fcbd-5be4-4233-99bf-38ef6949d713', 'handful', 40, 'kavdas')
ON CONFLICT DO NOTHING;
