-- Add 'crea' to food_source enum for Italian CREA food composition data.
-- Also add 'it' to food_aliases lang check if not already present.

ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'crea';

-- Add name_it column for Italian food names (parallel to name_fr)
ALTER TABLE foods ADD COLUMN IF NOT EXISTS name_it TEXT;

-- Rebuild search_text to include Italian names
-- The GENERATED ALWAYS column needs to be dropped and recreated
ALTER TABLE foods DROP COLUMN IF EXISTS search_text;
ALTER TABLE foods ADD COLUMN search_text tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name_en, '') || ' ' ||
      coalesce(name_el, '') || ' ' ||
      coalesce(name_es, '') || ' ' ||
      coalesce(name_fr, '') || ' ' ||
      coalesce(name_it, '') || ' ' ||
      coalesce(brand, '')
    )
  ) STORED;

-- Recreate GIN index on search_text
DROP INDEX IF EXISTS idx_foods_search_text;
CREATE INDEX idx_foods_search_text ON foods USING gin(search_text);
