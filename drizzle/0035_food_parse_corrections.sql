-- Correction-capture flywheel: when a human (client or coach) corrects an
-- AI-parsed food-log entry, store (original input → AI estimate → human truth)
-- as a gold label. This is the labeled-data engine for the path to <10% MAPE
-- (fine-tuning per FoodyLLM/NHANES-PEFT research). Captures OUR cuisine
-- distribution (Greek/EU), which public datasets under-represent.
CREATE TABLE IF NOT EXISTS food_parse_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,          -- whose log the entry belongs to
  corrected_by uuid NOT NULL,     -- who made the correction (client or their coach)
  food_log_id uuid,               -- the corrected entry (nullable if entry later deleted)
  input_text text NOT NULL,       -- what was logged (food name as parsed)
  qty_input numeric(8,2),
  qty_input_unit text,
  ai_source text,                 -- local_db | llm_cot | hybrid
  ai_confidence real,
  ai_calories real, ai_protein_g real, ai_carbs_g real, ai_fat_g real,
  corrected_calories real, corrected_protein_g real, corrected_carbs_g real, corrected_fat_g real,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_fpc_created ON food_parse_corrections (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fpc_source ON food_parse_corrections (ai_source);
ALTER TABLE food_parse_corrections ENABLE ROW LEVEL SECURITY;
-- Only super_admin reads the corpus (training data); inserts via service role.
CREATE POLICY "fpc super admin read" ON food_parse_corrections
  FOR SELECT TO authenticated USING ((SELECT private.is_super_admin()));
