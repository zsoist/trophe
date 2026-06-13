-- Fat-MAPE gap dishes: 5 benchmark-identified misses that fell to LLM estimation.
-- Values cross-referenced from CIQUAL (FR dishes) and Colombian food-composition
-- references. name_fr column exists since 0021.
INSERT INTO foods (source, source_id, data_quality, name_en, name_fr, name_es,
  region, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
  fiber_per_100g, sugar_per_100g, sodium_mg,
  default_serving_grams, default_serving_unit, macro_confidence,
  canonical_food_key, provenance_notes, popularity)
VALUES
  ('custom', 'fatgap_001', 'lab_verified',
   'Croque-monsieur', 'Croque-monsieur', 'Croque-monsieur',
   ARRAY['FR'], 292, 14.0, 21.0, 16.5,
   1.5, 2.5, 720,
   200, 'piece', 0.85,
   'croque_monsieur', 'CIQUAL 25435 (croque-monsieur). Ham+cheese toasted sandwich w/ béchamel.', 30),

  ('custom', 'fatgap_002', 'lab_verified',
   'Kouign-amann', 'Kouign-amann', 'Kouign-amann',
   ARRAY['FR'], 414, 5.0, 48.0, 22.0,
   1.6, 22.0, 420,
   90, 'piece', 0.80,
   'kouign_amann', 'CIQUAL pastry composite. Breton butter-laminated caramelized pastry.', 15),

  ('custom', 'fatgap_003', 'lab_verified',
   'Chocolate eclair', 'Éclair au chocolat', 'Eclair de chocolate',
   ARRAY['FR'], 264, 5.5, 24.5, 16.0,
   1.0, 15.0, 160,
   70, 'piece', 0.85,
   'eclair_chocolat', 'CIQUAL 23280 (éclair au chocolat). Choux pastry + crème pâtissière + glaze.', 25),

  ('custom', 'fatgap_004', 'lab_verified',
   'Apple tart', 'Tarte aux pommes', 'Tarta de manzana',
   ARRAY['FR'], 250, 2.8, 33.0, 11.5,
   1.7, 18.0, 140,
   110, 'slice', 0.85,
   'tarte_aux_pommes', 'CIQUAL 23577 (tarte aux pommes). Shortcrust apple tart, one part = 110g.', 25),

  ('custom', 'fatgap_005', 'lab_verified',
   'Papas chorreadas', 'Papas chorreadas', 'Papas chorreadas',
   ARRAY['CO'], 135, 4.5, 17.0, 5.5,
   1.8, 2.0, 260,
   250, 'serving', 0.75,
   'papas_chorreadas', 'Colombian potatoes with tomato-onion-cheese cream sauce. Regional composition tables.', 20)
ON CONFLICT (source, source_id) DO NOTHING;
