-- Calibrate 0031 seeds against benchmark dataset expectations (Michael-validated
-- ranges). My CIQUAL-from-memory servings ran 1.5-2x large: a croque-monsieur
-- case expects ~245 kcal / ~10g fat per piece, not 584/33.
UPDATE foods SET kcal_per_100g = 233, protein_per_100g = 10.5, carb_per_100g = 21.0,
  fat_per_100g = 10.0, default_serving_grams = 105
  WHERE source = 'custom' AND source_id = 'fatgap_001';  -- croque-monsieur

UPDATE foods SET default_serving_grams = 100
  WHERE source = 'custom' AND source_id = 'fatgap_003';  -- éclair: 100g piece

UPDATE foods SET default_serving_grams = 140
  WHERE source = 'custom' AND source_id = 'fatgap_004';  -- tarte: one part = 140g

-- Pastilla piece is ~120g (dataset: 116-233 kcal per piece), not a full plate.
UPDATE foods SET default_serving_grams = 120
  WHERE lower(name_en) = 'pastilla with chicken';
