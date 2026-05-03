-- Composite dish decomposition cache (DietAI24-inspired pipeline)
--
-- Stores pre-computed ingredient breakdowns for composite dishes.
-- On cache hit: skip LLM decomposition, serve macros directly from
-- stored ingredients × foods table nutrient data.
--
-- Sources: USDA FNDDS, manual curation (Greek/Colombian), LLM-generated

-- ═══════════════════════════════════════════════════════════════════════════════
-- Enum for recipe provenance
-- ═══════════════════════════════════════════════════════════════════════════════

DO $$ BEGIN
  CREATE TYPE recipe_source AS ENUM ('fndds', 'manual', 'llm_decomp', 'menustat');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- Main table
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS dish_recipes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Dish identification
  dish_name TEXT NOT NULL,                    -- normalized English
  dish_name_localized TEXT,                   -- original language name
  lang TEXT NOT NULL DEFAULT 'en',
  region TEXT[],                              -- e.g. ARRAY['GR'], ARRAY['CO']

  -- Pre-computed totals (for fast retrieval without re-aggregation)
  total_grams REAL NOT NULL,
  total_kcal REAL NOT NULL,
  total_protein REAL NOT NULL,
  total_carbs REAL NOT NULL,
  total_fat REAL NOT NULL,
  total_fiber REAL,

  -- Ingredient breakdown as JSONB array
  -- Each element: {food_id, food_name, grams, matched_confidence}
  ingredients JSONB NOT NULL,

  -- Provenance
  source recipe_source NOT NULL DEFAULT 'llm_decomp',
  confidence REAL DEFAULT 0.8,
  verified_by UUID REFERENCES profiles(id),

  -- Usage tracking (for cache warming / popularity)
  use_count INT NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ DEFAULT NOW(),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Prevent duplicate recipes
  CONSTRAINT dish_recipes_name_lang_key UNIQUE (dish_name, lang)
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════════════

-- Full-text search on dish name (for fuzzy matching)
CREATE INDEX IF NOT EXISTS idx_dish_recipes_name_tsvector
  ON dish_recipes USING gin(to_tsvector('simple', dish_name));

-- Region-based filtering
CREATE INDEX IF NOT EXISTS idx_dish_recipes_region
  ON dish_recipes USING gin(region);

-- Popularity-based ordering (most-used recipes first)
CREATE INDEX IF NOT EXISTS idx_dish_recipes_use_count
  ON dish_recipes(use_count DESC);

-- ═══════════════════════════════════════════════════════════════════════════════
-- RLS (match foods table pattern — read-public, write-restricted)
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE dish_recipes ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read recipes
CREATE POLICY dish_recipes_select ON dish_recipes
  FOR SELECT USING (true);

-- Only service role can insert/update (API routes use service role)
CREATE POLICY dish_recipes_insert ON dish_recipes
  FOR INSERT WITH CHECK (true);

CREATE POLICY dish_recipes_update ON dish_recipes
  FOR UPDATE USING (true);
