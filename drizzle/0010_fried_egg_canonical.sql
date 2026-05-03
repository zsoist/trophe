-- Phase 3 follow-up: Fried egg canonical key + aliases
-- Fixes eval case gr-12: "2 αυγά τηγανητά" resolving to raw egg instead of fried
--
-- Root cause: Fried egg entry (029b3ece) exists with correct macros (196 kcal/100g)
-- but has no canonical_food_key and popularity=0. Raw egg (362ab1a6) always wins
-- because it has canonical_food_key='egg_chicken_whole_raw' + popularity=50.
--
-- Fix: Give fried egg canonical key + popularity=40 (intentionally lower than raw=50
-- so ambiguous "egg" with no qualifier still resolves to raw — the common default).
-- Add aliases in en/es/el so BM25 + alias search can match fried variants.

-- ═══════════════════════════════════════════════════════════════════════════════
-- 1. Add canonical_food_key + popularity to fried egg entry
-- ═══════════════════════════════════════════════════════════════════════════════

UPDATE foods
SET canonical_food_key = 'egg_chicken_whole_fried',
    popularity = 40,
    data_reviewed_at = NOW()
WHERE id = '029b3ece-d8e2-4827-82ae-558700adf9ed'
  AND canonical_food_key IS NULL;

-- ═══════════════════════════════════════════════════════════════════════════════
-- 2. Add multilingual aliases for fried egg
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO food_aliases (food_id, lang, alias, preferred)
VALUES
  -- English
  ('029b3ece-d8e2-4827-82ae-558700adf9ed', 'en', 'fried egg', true),
  ('029b3ece-d8e2-4827-82ae-558700adf9ed', 'en', 'fried eggs', false),
  -- Spanish
  ('029b3ece-d8e2-4827-82ae-558700adf9ed', 'es', 'huevo frito', true),
  ('029b3ece-d8e2-4827-82ae-558700adf9ed', 'es', 'huevos fritos', false),
  -- Greek
  ('029b3ece-d8e2-4827-82ae-558700adf9ed', 'el', 'αυγό τηγανητό', true),
  ('029b3ece-d8e2-4827-82ae-558700adf9ed', 'el', 'αυγά τηγανητά', false)
ON CONFLICT DO NOTHING;
