-- Greek cooked-dish gaps + raw-vs-cooked variant fix (probe-verified 2026-06-13).
-- Lookup was resolving "fava"/"gigantes" to RAW legumes (2-3× the calories of the
-- cooked dish). Seed the cooked dishes; FOOD_NAME_CORRECTIONS steers the names here.
INSERT INTO foods (source, source_id, data_quality, name_en, name_el, region,
  kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g,
  default_serving_grams, default_serving_unit, macro_confidence, canonical_food_key, provenance_notes, popularity)
VALUES
  ('custom','grk_fava_cooked','estimated','Greek fava puree','φάβα', ARRAY['GR'],
   145, 8.0, 20.0, 6.0, 4.0, 150, 'serving', 0.85, 'greek_fava_puree',
   'Cooked Santorini yellow split-pea puree with olive oil (NOT raw split peas). Trichopoulou.', 40),
  ('custom','grk_kolokithokeftedes','estimated','Kolokithokeftedes','κολοκυθοκεφτέδες', ARRAY['GR'],
   180, 5.0, 18.0, 10.0, 2.0, 120, 'serving', 0.8, 'kolokithokeftedes',
   'Greek fried zucchini-feta fritters. Pan-fried in olive oil.', 25),
  ('custom','grk_revithosoupa','estimated','Revithosoupa','ρεβιθόσουπα', ARRAY['GR'],
   115, 6.0, 16.0, 3.5, 4.5, 350, 'serving', 0.8, 'revithosoupa',
   'Greek chickpea soup with olive oil and lemon. Trichopoulou.', 25)
ON CONFLICT (source, source_id) DO NOTHING;
