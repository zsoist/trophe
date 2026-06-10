-- 0021: Add French language support
-- Adds name_fr column and updates search_text generated column to include French names.
-- Also adds 'ciqual' to food_source enum for French national food composition data.

-- 1. Add name_fr column
ALTER TABLE foods ADD COLUMN IF NOT EXISTS name_fr text;

-- 2. Add 'ciqual' to food_source enum
ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'ciqual';

-- 3. Recreate search_text generated column to include name_fr
--    Must drop + recreate because GENERATED ALWAYS columns can't be ALTERed.
ALTER TABLE foods DROP COLUMN IF EXISTS search_text;
ALTER TABLE foods ADD COLUMN search_text tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple',
      COALESCE(name_en, '') || ' ' ||
      COALESCE(name_el, '') || ' ' ||
      COALESCE(name_es, '') || ' ' ||
      COALESCE(name_fr, '') || ' ' ||
      COALESCE(brand, '')
    )
  ) STORED;

-- 4. Recreate GIN index on search_text
CREATE INDEX IF NOT EXISTS idx_foods_search ON foods USING gin(search_text);

-- 5. Update profiles language check to include French
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_language_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_language_check
  CHECK (language = ANY(ARRAY['en', 'es', 'el', 'fr']));
