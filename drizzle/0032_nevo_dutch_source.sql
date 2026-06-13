-- NEVO (RIVM, Netherlands) food source + Dutch name column.
-- Mirrors 0021 French language support pattern.
ALTER TYPE food_source ADD VALUE IF NOT EXISTS 'nevo';
ALTER TABLE foods ADD COLUMN IF NOT EXISTS name_nl text;
CREATE INDEX IF NOT EXISTS idx_foods_name_nl ON foods (lower(name_nl)) WHERE name_nl IS NOT NULL;
