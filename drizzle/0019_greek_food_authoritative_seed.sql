-- 0019_greek_food_authoritative_seed.sql
-- ═══════════════════════════════════════════════════════════════════════════════
-- Greek Food Database — Authoritative Seed Migration
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- Sources:
--   • USDA FDC (FoodData Central) — lab-verified macronutrient data
--   • Trichopoulou A. et al. (2004) — "Traditional foods: Science and society"
--   • Hellenic Health Foundation (HHF) nutritional tables
--   • Greek Food Composition Tables (Trichopoulou & Vasilopoulou, 2000)
--
-- Idempotent: All inserts use ON CONFLICT … DO NOTHING or NOT EXISTS guards.
-- Safe to re-run on any environment.
--
-- Parts:
--   A. 55 Greek Base Foods (INSERT INTO foods)
--   B. 100+ Greek Aliases (INSERT INTO food_aliases)
--   C. Greek Unit Conversions (INSERT INTO food_unit_conversions)
--   D. 25 Greek Traditional Recipes (INSERT INTO dish_recipes)


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART A: GREEK BASE FOODS
-- ═══════════════════════════════════════════════════════════════════════════════
-- source='hhf', source_id='gr_base_NNN', region=ARRAY['GR']
-- macro_confidence: 0.90 = USDA cross-referenced, 0.85 = Trichopoulou-only
-- data_quality: 'lab_verified' = USDA cross-ref, 'label' = Trichopoulou/HHF

-- ── Dairy ────────────────────────────────────────────────────────────────────

INSERT INTO foods (source, source_id, data_quality, name_en, name_el, name_es,
  region, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g,
  fiber_per_100g, sugar_per_100g, sodium_mg,
  default_serving_grams, default_serving_unit, macro_confidence,
  canonical_food_key, provenance_notes, popularity)
VALUES
  -- 001: Feta PDO — USDA FDC #173420
  ('hhf', 'gr_base_001', 'lab_verified',
   'Feta cheese PDO', 'Φέτα ΠΟΠ', 'Queso feta PDO',
   ARRAY['GR'], 264, 14.2, 4.1, 21.3,
   0, 4.1, 1116,
   30, 'slice', 0.90,
   'feta_cheese_pdo', 'USDA FDC #173420 cross-ref. Authentic PDO feta from sheep/goat milk.', 50),

  -- 002: Strained yogurt 10% (full fat) — USDA FDC #170903
  ('hhf', 'gr_base_002', 'lab_verified',
   'Strained yogurt 10%', 'Στραγγιστό γιαούρτι 10%', 'Yogur colado 10%',
   ARRAY['GR'], 97, 9.0, 3.6, 5.0,
   0, 3.6, 36,
   170, 'cup', 0.90,
   'strained_yogurt_full', 'USDA FDC #170903 cross-ref. Greek strained yogurt, full-fat.', 50),

  -- 003: Strained yogurt 2% (low fat) — USDA FDC #170900
  ('hhf', 'gr_base_003', 'lab_verified',
   'Strained yogurt 2%', 'Στραγγιστό γιαούρτι 2%', 'Yogur colado 2%',
   ARRAY['GR'], 65, 10.0, 3.5, 0.7,
   0, 3.2, 36,
   170, 'cup', 0.90,
   'strained_yogurt_low', 'USDA FDC #170900 cross-ref. Greek strained yogurt, low-fat.', 50),

  -- 004: Graviera cheese — Trichopoulou tables
  ('hhf', 'gr_base_004', 'label',
   'Graviera cheese', 'Γραβιέρα', 'Queso graviera',
   ARRAY['GR'], 400, 28.0, 1.5, 32.0,
   0, 0.5, 700,
   30, 'slice', 0.85,
   'graviera_cheese', 'Trichopoulou Greek food tables. Hard sheep milk cheese, Cretan origin.', 30),

  -- 005: Kefalotiri cheese — Trichopoulou tables
  ('hhf', 'gr_base_005', 'label',
   'Kefalotiri cheese', 'Κεφαλοτύρι', 'Queso kefalotiri',
   ARRAY['GR'], 430, 32.0, 0, 34.0,
   0, 0, 820,
   30, 'slice', 0.85,
   'kefalotiri_cheese', 'Trichopoulou Greek food tables. Very hard, sharp sheep/goat cheese.', 30),

  -- 006: Halloumi — USDA FDC #174288
  ('hhf', 'gr_base_006', 'lab_verified',
   'Halloumi cheese', 'Χαλούμι', 'Queso halloumi',
   ARRAY['GR','CY'], 321, 21.0, 1.5, 25.0,
   0, 1.5, 1230,
   80, 'piece', 0.90,
   'halloumi_cheese', 'USDA FDC #174288 cross-ref. Semi-hard brined cheese, often grilled.', 50),

  -- 007: Manouri cheese — Trichopoulou tables
  ('hhf', 'gr_base_007', 'label',
   'Manouri cheese', 'Μανούρι', 'Queso manouri',
   ARRAY['GR'], 373, 16.0, 1.0, 33.0,
   0, 1.0, 360,
   30, 'piece', 0.85,
   'manouri_cheese', 'Trichopoulou Greek food tables. Soft whey cheese from sheep/goat milk.', 30),

  -- 008: Kasseri cheese — Trichopoulou tables
  ('hhf', 'gr_base_008', 'label',
   'Kasseri cheese', 'Κασέρι', 'Queso kasseri',
   ARRAY['GR'], 348, 25.0, 0.5, 27.0,
   0, 0.5, 780,
   30, 'slice', 0.85,
   'kasseri_cheese', 'Trichopoulou Greek food tables. Semi-hard pasta filata cheese.', 30),

  -- 009: Anthotyro fresh — Trichopoulou tables
  ('hhf', 'gr_base_009', 'label',
   'Anthotyro fresh', 'Ανθότυρο φρέσκο', 'Anthotyro fresco',
   ARRAY['GR'], 175, 11.0, 3.0, 13.0,
   0, 3.0, 320,
   30, 'piece', 0.85,
   'anthotyro_fresh', 'Trichopoulou Greek food tables. Fresh whey cheese, ricotta-like.', 30),

-- ── Oils & Fats ──────────────────────────────────────────────────────────────

  -- 010: Extra virgin olive oil — USDA FDC #171413
  ('hhf', 'gr_base_010', 'lab_verified',
   'Extra virgin olive oil', 'Εξαιρετικό παρθένο ελαιόλαδο', 'Aceite de oliva extra virgen',
   ARRAY['GR'], 884, 0, 0, 100.0,
   0, 0, 2,
   14, 'tbsp', 0.90,
   'evoo_greek', 'USDA FDC #171413 cross-ref. Cornerstone of Greek diet.', 50),

  -- 011: Tahini — USDA FDC #168604
  ('hhf', 'gr_base_011', 'lab_verified',
   'Tahini', 'Ταχίνι', 'Tahini',
   ARRAY['GR'], 595, 17.0, 21.0, 54.0,
   9.3, 0.5, 113,
   15, 'tbsp', 0.90,
   'tahini_sesame', 'USDA FDC #168604 cross-ref. Sesame paste, staple in Greek cuisine and Lenten fasting.', 50),

-- ── Bread & Grains ───────────────────────────────────────────────────────────

  -- 012: Pita bread — USDA FDC #175013
  ('hhf', 'gr_base_012', 'lab_verified',
   'Pita bread', 'Πίτα ψωμί', 'Pan pita',
   ARRAY['GR'], 275, 9.2, 55.0, 1.7,
   2.2, 1.6, 536,
   60, 'piece', 0.90,
   'pita_bread_greek', 'USDA FDC #175013 cross-ref. Standard Greek pita for souvlaki/gyros.', 50),

  -- 013: Paximadi/Dakos rusk — Trichopoulou tables
  ('hhf', 'gr_base_013', 'label',
   'Paximadi barley rusk', 'Παξιμάδι κριθαρένιο', 'Biscote de cebada paximadi',
   ARRAY['GR'], 400, 12.0, 73.0, 5.0,
   6.5, 2.0, 580,
   30, 'piece', 0.85,
   'paximadi_barley', 'Trichopoulou Greek food tables. Twice-baked Cretan barley rusk (dakos base).', 50),

  -- 014: Koulouri Thessalonikis — Trichopoulou tables
  ('hhf', 'gr_base_014', 'label',
   'Koulouri Thessalonikis', 'Κουλούρι Θεσσαλονίκης', 'Koulouri de Tesalónica',
   ARRAY['GR'], 350, 10.0, 62.0, 8.0,
   2.5, 3.0, 520,
   70, 'piece', 0.85,
   'koulouri_thessalonikis', 'Trichopoulou Greek food tables. Sesame-encrusted bread ring, iconic street food.', 50),

  -- 015: Phyllo dough — USDA FDC #175023
  ('hhf', 'gr_base_015', 'lab_verified',
   'Phyllo dough', 'Φύλλο κρούστας', 'Masa filo',
   ARRAY['GR'], 300, 7.0, 50.0, 8.0,
   1.8, 0.5, 412,
   19, 'sheet', 0.90,
   'phyllo_dough', 'USDA FDC #175023 cross-ref. Paper-thin pastry sheets for pies/baklava.', 50),

  -- 016: Trahanas sweet — Trichopoulou tables
  ('hhf', 'gr_base_016', 'label',
   'Trahanas sweet', 'Τραχανάς γλυκός', 'Trahanas dulce',
   ARRAY['GR'], 340, 12.0, 65.0, 4.0,
   2.0, 5.0, 280,
   80, 'cup_dry', 0.85,
   'trahanas_sweet', 'Trichopoulou Greek food tables. Fermented grain-milk porridge, sweet variant.', 30),

  -- 017: Trahanas sour — Trichopoulou tables
  ('hhf', 'gr_base_017', 'label',
   'Trahanas sour', 'Τραχανάς ξινός', 'Trahanas ácido',
   ARRAY['GR'], 335, 14.0, 62.0, 3.5,
   2.0, 3.0, 350,
   80, 'cup_dry', 0.85,
   'trahanas_sour', 'Trichopoulou Greek food tables. Fermented grain-yogurt porridge, sour variant.', 30),

-- ── Vegetables ───────────────────────────────────────────────────────────────

  -- 018: Horta/wild greens boiled — Trichopoulou tables, USDA FDC #169238 (dandelion greens ref)
  ('hhf', 'gr_base_018', 'lab_verified',
   'Horta wild greens boiled', 'Χόρτα βραστά', 'Verduras silvestres hervidas',
   ARRAY['GR'], 23, 2.0, 3.5, 0.3,
   2.0, 0.5, 12,
   180, 'plate', 0.90,
   'horta_wild_greens', 'USDA FDC #169238 (dandelion greens) cross-ref with Trichopoulou data. Mixed wild greens (vlita, radikia, etc).', 50),

  -- 019: Vlita/amaranth greens — USDA FDC #169210
  ('hhf', 'gr_base_019', 'lab_verified',
   'Vlita amaranth greens', 'Βλήτα', 'Hojas de amaranto',
   ARRAY['GR'], 23, 2.5, 4.0, 0.3,
   2.1, 0, 21,
   180, 'plate', 0.90,
   'vlita_amaranth', 'USDA FDC #169210 cross-ref. Amaranth leaves, classic summer horta.', 30),

  -- 020: Bamies/okra — USDA FDC #169260
  ('hhf', 'gr_base_020', 'lab_verified',
   'Bamies okra', 'Μπάμιες', 'Okra/quimbombó',
   ARRAY['GR'], 33, 2.0, 7.0, 0.2,
   3.2, 1.5, 7,
   160, 'serving', 0.90,
   'bamies_okra', 'USDA FDC #169260 cross-ref. Okra, often cooked ladера-style with tomato.', 50),

  -- 021: Kolokithakia/zucchini — USDA FDC #169291
  ('hhf', 'gr_base_021', 'lab_verified',
   'Kolokithakia zucchini', 'Κολοκυθάκια', 'Calabacines',
   ARRAY['GR'], 17, 1.2, 3.1, 0.3,
   1.0, 2.5, 8,
   180, 'serving', 0.90,
   'kolokithakia_zucchini', 'USDA FDC #169291 cross-ref. Zucchini/courgette, staple vegetable.', 50),

-- ── Legumes ──────────────────────────────────────────────────────────────────

  -- 022: Fava/yellow split peas — USDA FDC #172421 (dry)
  ('hhf', 'gr_base_022', 'lab_verified',
   'Fava yellow split peas', 'Φάβα', 'Puré de guisantes amarillos',
   ARRAY['GR'], 341, 24.6, 60.0, 1.2,
   25.5, 8.0, 15,
   200, 'bowl', 0.90,
   'fava_split_peas', 'USDA FDC #172421 cross-ref. Yellow split pea purée, Santorini specialty. Macros per 100g dry.', 50),

  -- 023: Gigantes/giant beans — Trichopoulou tables
  ('hhf', 'gr_base_023', 'label',
   'Gigantes giant beans', 'Γίγαντες', 'Judiones gigantes',
   ARRAY['GR'], 286, 21.0, 46.0, 1.5,
   15.0, 2.5, 6,
   200, 'bowl', 0.85,
   'gigantes_beans', 'Trichopoulou Greek food tables. Giant white runner beans, baked or stewed. Macros per 100g dry.', 50),

  -- 024: Fasolia/white beans — USDA FDC #173735 (dry)
  ('hhf', 'gr_base_024', 'lab_verified',
   'Fasolia white beans', 'Φασόλια λευκά', 'Judías blancas',
   ARRAY['GR'], 333, 23.4, 60.0, 0.9,
   15.2, 3.5, 16,
   200, 'bowl', 0.90,
   'fasolia_white_beans', 'USDA FDC #173735 cross-ref. White navy/cannellini beans, fasolada base. Macros per 100g dry.', 50),

  -- 025: Revithia/chickpeas — USDA FDC #173757 (dry)
  ('hhf', 'gr_base_025', 'lab_verified',
   'Revithia chickpeas', 'Ρεβίθια', 'Garbanzos',
   ARRAY['GR'], 364, 19.0, 61.0, 6.0,
   17.4, 10.7, 24,
   200, 'bowl', 0.90,
   'revithia_chickpeas', 'USDA FDC #173757 cross-ref. Chickpeas, used in revithada and revithokeftedes. Macros per 100g dry.', 50),

  -- 026: Black-eyed peas — USDA FDC #175199 (dry)
  ('hhf', 'gr_base_026', 'lab_verified',
   'Black-eyed peas', 'Μαυρομάτικα φασόλια', 'Frijoles carilla',
   ARRAY['GR'], 336, 24.0, 60.0, 1.3,
   10.6, 6.9, 16,
   200, 'bowl', 0.90,
   'blackeyed_peas', 'USDA FDC #175199 cross-ref. Black-eyed peas, common summer salad. Macros per 100g dry.', 50),

-- ── Seafood ──────────────────────────────────────────────────────────────────

  -- 027: Sardines fresh — USDA FDC #175139
  ('hhf', 'gr_base_027', 'lab_verified',
   'Sardines fresh', 'Σαρδέλες φρέσκες', 'Sardinas frescas',
   ARRAY['GR'], 208, 25.0, 0, 11.0,
   0, 0, 307,
   85, 'fillet', 0.90,
   'sardines_fresh', 'USDA FDC #175139 cross-ref. Mediterranean sardines, grilled or fried.', 50),

  -- 028: Anchovies fresh — USDA FDC #175137
  ('hhf', 'gr_base_028', 'lab_verified',
   'Anchovies fresh', 'Γαύρος φρέσκος', 'Anchoas frescas',
   ARRAY['GR'], 131, 20.0, 0, 5.0,
   0, 0, 104,
   45, 'serving', 0.90,
   'anchovies_fresh', 'USDA FDC #175137 cross-ref. Fresh anchovies, fried or marinated (gavros).', 50),

  -- 029: Octopus — USDA FDC #175165
  ('hhf', 'gr_base_029', 'lab_verified',
   'Octopus', 'Χταπόδι', 'Pulpo',
   ARRAY['GR'], 82, 15.0, 2.0, 1.0,
   0, 0, 230,
   150, 'serving', 0.90,
   'octopus', 'USDA FDC #175165 cross-ref. Grilled or braised octopus, taverna classic.', 50),

  -- 030: Calamari/squid — USDA FDC #175171
  ('hhf', 'gr_base_030', 'lab_verified',
   'Calamari squid', 'Καλαμάρι', 'Calamar',
   ARRAY['GR'], 92, 15.6, 3.1, 1.4,
   0, 0, 44,
   120, 'serving', 0.90,
   'calamari_squid', 'USDA FDC #175171 cross-ref. Squid, fried rings or grilled.', 50),

  -- 031: Shrimp/garides — USDA FDC #175180
  ('hhf', 'gr_base_031', 'lab_verified',
   'Shrimp garides', 'Γαρίδες', 'Camarones',
   ARRAY['GR'], 99, 24.0, 0.2, 0.3,
   0, 0, 111,
   120, 'serving', 0.90,
   'shrimp_garides', 'USDA FDC #175180 cross-ref. Shrimp, saganaki-style or grilled.', 50),

  -- 032: Sea bream/tsipoura — Trichopoulou tables
  ('hhf', 'gr_base_032', 'label',
   'Sea bream tsipoura', 'Τσιπούρα', 'Dorada',
   ARRAY['GR'], 105, 20.0, 0, 2.5,
   0, 0, 65,
   200, 'whole_fish', 0.85,
   'tsipoura_sea_bream', 'Trichopoulou Greek food tables. Gilt-head sea bream, grilled whole.', 50),

  -- 033: Swordfish — USDA FDC #175122
  ('hhf', 'gr_base_033', 'lab_verified',
   'Swordfish', 'Ξιφίας', 'Pez espada',
   ARRAY['GR'], 144, 20.0, 0, 7.0,
   0, 0, 102,
   140, 'steak', 0.90,
   'swordfish', 'USDA FDC #175122 cross-ref. Swordfish steak, popular grilled fish.', 30),

  -- 034: Cod/bakaliaros — USDA FDC #175109
  ('hhf', 'gr_base_034', 'lab_verified',
   'Cod bakaliaros', 'Μπακαλιάρος', 'Bacalao fresco',
   ARRAY['GR'], 82, 18.0, 0, 0.7,
   0, 0, 54,
   120, 'fillet', 0.90,
   'bakaliaros_cod', 'USDA FDC #175109 cross-ref. Atlantic cod, fried with skordalia on March 25th.', 50),

-- ── Meat ─────────────────────────────────────────────────────────────────────

  -- 035: Lamb shoulder — USDA FDC #172560
  ('hhf', 'gr_base_035', 'lab_verified',
   'Lamb shoulder', 'Αρνί ωμοπλάτη', 'Paleta de cordero',
   ARRAY['GR'], 258, 17.0, 0, 21.0,
   0, 0, 65,
   120, 'serving', 0.90,
   'lamb_shoulder', 'USDA FDC #172560 cross-ref. Lamb shoulder, roasted or stewed.', 50),

  -- 036: Lamb leg — USDA FDC #172553
  ('hhf', 'gr_base_036', 'lab_verified',
   'Lamb leg', 'Αρνί μπούτι', 'Pierna de cordero',
   ARRAY['GR'], 190, 26.0, 0, 9.0,
   0, 0, 60,
   150, 'serving', 0.90,
   'lamb_leg', 'USDA FDC #172553 cross-ref. Lamb leg, lean, roasted. Easter centerpiece.', 50),

  -- 037: Lamb chops — USDA FDC #172564
  ('hhf', 'gr_base_037', 'lab_verified',
   'Lamb chops', 'Παϊδάκια αρνίσια', 'Chuletas de cordero',
   ARRAY['GR'], 271, 20.0, 0, 21.0,
   0, 0, 65,
   100, '2_chops', 0.90,
   'lamb_chops', 'USDA FDC #172564 cross-ref. Rib chops, grilled.', 50),

  -- 038: Pork gyros meat — Trichopoulou tables
  ('hhf', 'gr_base_038', 'label',
   'Pork gyros meat', 'Γύρος χοιρινός κρέας', 'Carne de gyros de cerdo',
   ARRAY['GR'], 217, 18.0, 3.0, 15.0,
   0, 0.5, 450,
   100, 'serving', 0.85,
   'pork_gyros_meat', 'Trichopoulou tables + commercial analysis. Rotisserie pork, seasoned, shaved.', 50),

  -- 039: Souvlaki pork — Trichopoulou tables
  ('hhf', 'gr_base_039', 'label',
   'Souvlaki pork', 'Σουβλάκι χοιρινό', 'Souvlaki de cerdo',
   ARRAY['GR'], 210, 21.0, 0, 14.0,
   0, 0, 65,
   100, 'skewer', 0.85,
   'souvlaki_pork', 'Trichopoulou tables. Pork cubes on skewer, grilled.', 50),

  -- 040: Chicken souvlaki — USDA FDC #171528 (chicken breast ref)
  ('hhf', 'gr_base_040', 'lab_verified',
   'Chicken souvlaki', 'Σουβλάκι κοτόπουλο', 'Souvlaki de pollo',
   ARRAY['GR'], 165, 31.0, 0, 3.6,
   0, 0, 74,
   100, 'skewer', 0.90,
   'souvlaki_chicken', 'USDA FDC #171528 cross-ref (chicken breast). Chicken cubes on skewer.', 50),

  -- 041: Pastourma — Trichopoulou tables
  ('hhf', 'gr_base_041', 'label',
   'Pastourma', 'Παστουρμάς', 'Pastirma/pastourma',
   ARRAY['GR'], 174, 33.0, 1.0, 4.0,
   0.5, 0, 1700,
   30, 'serving', 0.85,
   'pastourma', 'Trichopoulou Greek food tables. Air-dried cured beef with fenugreek (çemen) coating.', 30),

  -- 042: Loukaniko/sausage — Trichopoulou tables
  ('hhf', 'gr_base_042', 'label',
   'Loukaniko Greek sausage', 'Λουκάνικο', 'Salchicha griega loukaniko',
   ARRAY['GR'], 305, 14.0, 3.0, 27.0,
   0, 1.0, 850,
   80, 'piece', 0.85,
   'loukaniko_sausage', 'Trichopoulou Greek food tables. Traditional pork sausage with orange zest and fennel.', 30),

-- ── Sweets ───────────────────────────────────────────────────────────────────

  -- 043: Halva semolina — Trichopoulou tables
  ('hhf', 'gr_base_043', 'label',
   'Halva semolina', 'Χαλβάς σιμιγδαλένιος', 'Halva de sémola',
   ARRAY['GR'], 469, 6.0, 60.0, 24.0,
   1.5, 40.0, 15,
   80, 'slice', 0.85,
   'halva_semolina', 'Trichopoulou Greek food tables. Lenten semolina dessert with olive oil and pine nuts.', 50),

  -- 044: Halva tahini — Trichopoulou tables
  ('hhf', 'gr_base_044', 'label',
   'Halva tahini', 'Χαλβάς ταχινιού', 'Halva de tahini',
   ARRAY['GR'], 516, 12.0, 55.0, 28.0,
   3.0, 45.0, 40,
   30, 'slice', 0.85,
   'halva_tahini', 'Trichopoulou Greek food tables. Sesame halva, dense and sweet.', 50),

  -- 045: Loukoumi/Turkish delight — Trichopoulou tables
  ('hhf', 'gr_base_045', 'label',
   'Loukoumi', 'Λουκούμι', 'Delicias turcas/loukoumi',
   ARRAY['GR'], 380, 0, 95.0, 0,
   0, 85.0, 5,
   25, 'piece', 0.85,
   'loukoumi', 'Trichopoulou Greek food tables. Starch-and-sugar confection, rose or mastic flavored.', 30),

  -- 046: Pasteli — Trichopoulou tables
  ('hhf', 'gr_base_046', 'label',
   'Pasteli sesame honey bar', 'Παστέλι', 'Barra de sésamo y miel',
   ARRAY['GR'], 450, 12.0, 48.0, 25.0,
   5.0, 35.0, 20,
   30, 'bar', 0.85,
   'pasteli', 'Trichopoulou Greek food tables. Ancient sesame-honey candy bar.', 30),

-- ── Condiments & Dips ────────────────────────────────────────────────────────

  -- 047: Taramosalata — Trichopoulou tables
  ('hhf', 'gr_base_047', 'label',
   'Taramosalata', 'Ταραμοσαλάτα', 'Taramosalata (paté de huevas)',
   ARRAY['GR'], 446, 4.5, 3.0, 46.0,
   0, 0.5, 1040,
   30, 'tbsp', 0.85,
   'taramosalata', 'Trichopoulou Greek food tables. Cured fish roe dip with bread and olive oil.', 50),

  -- 048: Skordalia — Trichopoulou tables
  ('hhf', 'gr_base_048', 'label',
   'Skordalia garlic dip', 'Σκορδαλιά', 'Skordalia (salsa de ajo)',
   ARRAY['GR'], 146, 2.5, 18.0, 7.0,
   1.5, 1.0, 15,
   50, 'serving', 0.85,
   'skordalia', 'Trichopoulou Greek food tables. Garlic-potato or garlic-bread dip with olive oil.', 50),

  -- 049: Melitzanosalata — Trichopoulou tables
  ('hhf', 'gr_base_049', 'label',
   'Melitzanosalata eggplant dip', 'Μελιτζανοσαλάτα', 'Ensalada de berenjena',
   ARRAY['GR'], 94, 1.5, 5.0, 8.0,
   2.5, 2.0, 5,
   50, 'serving', 0.85,
   'melitzanosalata', 'Trichopoulou Greek food tables. Smoky eggplant dip with olive oil and lemon.', 50),

  -- 050: Htipiti — Trichopoulou tables
  ('hhf', 'gr_base_050', 'label',
   'Htipiti roasted pepper dip', 'Χτυπητή', 'Htipiti (dip de pimientos)',
   ARRAY['GR'], 220, 8.0, 3.0, 20.0,
   0.5, 2.0, 550,
   50, 'serving', 0.85,
   'htipiti', 'Trichopoulou Greek food tables. Roasted red pepper and feta dip.', 30),

-- ── Beverages ────────────────────────────────────────────────────────────────

  -- 051: Greek coffee brewed — Trichopoulou tables
  ('hhf', 'gr_base_051', 'label',
   'Greek coffee brewed', 'Ελληνικός καφές', 'Café griego',
   ARRAY['GR'], 2, 0.1, 0.3, 0,
   0, 0, 3,
   60, 'cup', 0.85,
   'greek_coffee', 'Trichopoulou tables. Brewed Greek/Turkish-style coffee per 100ml.', 50),

  -- 052: Mountain tea — Trichopoulou tables
  ('hhf', 'gr_base_052', 'label',
   'Mountain tea tsai tou vounou', 'Τσάι του βουνού', 'Té de montaña griego',
   ARRAY['GR'], 1, 0, 0.2, 0,
   0, 0, 1,
   200, 'cup', 0.85,
   'mountain_tea', 'Trichopoulou tables. Sideritis herbal tea, traditional Greek mountain tea per 100ml.', 30),

-- ── Additional Important Greek Foods ─────────────────────────────────────────

  -- 053: Greek olives (Kalamata) — USDA FDC #169094
  ('hhf', 'gr_base_053', 'lab_verified',
   'Kalamata olives', 'Ελιές Καλαμάτας', 'Aceitunas Kalamata',
   ARRAY['GR'], 235, 1.6, 3.1, 24.0,
   3.2, 0, 1566,
   15, 'serving', 0.90,
   'olives_kalamata', 'USDA FDC #169094 cross-ref. Dark purple-black olives from Kalamata region.', 50),

  -- 054: Greek honey (thyme) — USDA FDC #169640
  ('hhf', 'gr_base_054', 'lab_verified',
   'Greek thyme honey', 'Θυμαρίσιο μέλι', 'Miel de tomillo griego',
   ARRAY['GR'], 304, 0.3, 82.0, 0,
   0.2, 82.0, 4,
   21, 'tbsp', 0.90,
   'honey_thyme_greek', 'USDA FDC #169640 cross-ref. Thyme honey, prized Greek varietal.', 50),

  -- 055: Mastiha Chios — Trichopoulou tables
  ('hhf', 'gr_base_055', 'label',
   'Mastiha Chios liqueur', 'Μαστίχα Χίου', 'Licor de mastiha de Quíos',
   ARRAY['GR'], 250, 0, 30.0, 0,
   0, 28.0, 5,
   45, 'shot', 0.85,
   'mastiha_chios', 'Trichopoulou tables. Chios mastic resin liqueur (~25% ABV). Approximate kcal includes alcohol.', 30)

ON CONFLICT (source, source_id) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART B: GREEK ALIASES (100+)
-- ═══════════════════════════════════════════════════════════════════════════════
-- Links Greek (el), English (en), and Spanish (es) names to foods inserted above.
-- Also links Greek names to existing USDA foods for common equivalents.

-- ── B.1: Aliases for Part A foods ────────────────────────────────────────────
-- Each INSERT uses a subquery to find the food_id by source+source_id.

DO $$ BEGIN

-- Helper: insert alias only if the food exists and alias doesn't duplicate
-- We use a block to suppress errors if food doesn't exist yet.

-- ── Dairy aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'φέτα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='φέτα');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τυρί φέτα', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τυρί φέτα');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'feta', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_001'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='feta');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γιαούρτι στραγγιστό', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_002'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γιαούρτι στραγγιστό');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γιαούρτι πλήρες', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_002'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γιαούρτι πλήρες');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'greek yogurt full fat', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_002'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='greek yogurt full fat');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γιαούρτι 2%', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_003'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γιαούρτι 2%');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'greek yogurt low fat', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_003'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='greek yogurt low fat');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γραβιέρα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_004'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γραβιέρα');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κεφαλοτύρι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_005'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='κεφαλοτύρι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'χαλούμι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_006'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='χαλούμι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μανούρι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_007'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μανούρι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κασέρι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_008'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='κασέρι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ανθότυρο', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_009'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ανθότυρο');

-- ── Oil / Fat aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ελαιόλαδο', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_010'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ελαιόλαδο');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'λάδι', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_010'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='λάδι');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'olive oil', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_010'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='olive oil');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ταχίνι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_011'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ταχίνι');

-- ── Bread / Grain aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'πίτα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_012'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='πίτα');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ψωμί πίτα', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_012'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ψωμί πίτα');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'pita', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_012'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='pita');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'παξιμάδι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_013'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='παξιμάδι');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ντάκος κριτσίνι', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_013'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ντάκος κριτσίνι');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'dakos rusk', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_013'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='dakos rusk');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κουλούρι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_014'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='κουλούρι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'φύλλο', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_015'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='φύλλο');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'filo dough', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_015'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='filo dough');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τραχανάς γλυκός', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_016'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τραχανάς γλυκός');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τραχανάς', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_016'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τραχανάς');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τραχανάς ξινός', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_017'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τραχανάς ξινός');

-- ── Vegetable aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'χόρτα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_018'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='χόρτα');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ραδίκια', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_018'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ραδίκια');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'boiled greens', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_018'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='boiled greens');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'βλήτα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_019'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='βλήτα');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μπάμιες', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_020'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μπάμιες');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κολοκυθάκια', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_021'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='κολοκυθάκια');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κολοκύθι', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_021'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='κολοκύθι');

-- ── Legume aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'φάβα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_022'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='φάβα');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γίγαντες', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_023'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γίγαντες');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'giant beans', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_023'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='giant beans');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'φασόλια', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_024'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='φασόλια');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'φασολάδα φασόλια', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_024'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='φασολάδα φασόλια');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ρεβίθια', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_025'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ρεβίθια');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μαυρομάτικα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_026'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μαυρομάτικα');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μαυρομάτικα φασόλια', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_026'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μαυρομάτικα φασόλια');

-- ── Seafood aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'σαρδέλες', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_027'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='σαρδέλες');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'σαρδέλα', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_027'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='σαρδέλα');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γαύρος', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_028'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γαύρος');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αντζούγιες', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_028'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='αντζούγιες');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'χταπόδι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_029'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='χταπόδι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'καλαμάρι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_030'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='καλαμάρι');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'καλαμαράκια', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_030'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='καλαμαράκια');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γαρίδες', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_031'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γαρίδες');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τσιπούρα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_032'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τσιπούρα');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ξιφίας', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_033'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ξιφίας');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μπακαλιάρος', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_034'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μπακαλιάρος');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'cod fish', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_034'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='cod fish');

-- ── Meat aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αρνί', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_035'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='αρνί');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αρνί μπούτι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_036'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='αρνί μπούτι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'παϊδάκια', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_037'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='παϊδάκια');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'lamb ribs', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_037'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='lamb ribs');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γύρος χοιρινός', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_038'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γύρος χοιρινός');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γύρος', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_038'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='γύρος');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'σουβλάκι χοιρινό', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_039'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='σουβλάκι χοιρινό');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'σουβλάκι', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_039'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='σουβλάκι');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'souvlaki', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_039'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='souvlaki');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'σουβλάκι κοτόπουλο', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_040'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='σουβλάκι κοτόπουλο');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κοτόπουλο σουβλάκι', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_040'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='κοτόπουλο σουβλάκι');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'παστουρμάς', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_041'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='παστουρμάς');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'λουκάνικο', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_042'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='λουκάνικο');

-- ── Sweet aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'χαλβάς', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_043'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='χαλβάς');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'halva', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_043'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='halva');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'χαλβάς ταχινιού', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_044'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='χαλβάς ταχινιού');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'λουκούμι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_045'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='λουκούμι');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'turkish delight', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_045'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='turkish delight');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'παστέλι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_046'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='παστέλι');

-- ── Condiment aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ταραμοσαλάτα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_047'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ταραμοσαλάτα');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'tarama dip', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_047'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='tarama dip');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'σκορδαλιά', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_048'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='σκορδαλιά');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μελιτζανοσαλάτα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_049'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μελιτζανοσαλάτα');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'χτυπητή', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_050'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='χτυπητή');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τυροκαυτερή', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_050'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τυροκαυτερή');

-- ── Beverage aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ελληνικός καφές', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_051'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ελληνικός καφές');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'καφές', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_051'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='καφές');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τσάι του βουνού', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_052'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τσάι του βουνού');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'τσάι βουνού', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_052'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='τσάι βουνού');

-- ── Additional food aliases ──
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ελιές', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_053'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ελιές');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ελιές Καλαμάτας', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_053'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='ελιές Καλαμάτας');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μέλι', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_054'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μέλι');
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'en', 'honey', false FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_054'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='en' AND fa.alias='honey');

INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μαστίχα', true FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_055'
  AND NOT EXISTS (SELECT 1 FROM food_aliases fa WHERE fa.food_id=f.id AND fa.lang='el' AND fa.alias='μαστίχα');

-- ═══════════════════════════════════════════════════════════════════════════════
-- B.2: Greek aliases for common USDA foods already in the database
-- ═══════════════════════════════════════════════════════════════════════════════
-- These link Greek-language names to existing USDA entries so Greek-speaking
-- users can search in their language and hit the high-quality USDA data.
-- We search by name_en ILIKE to find the best existing USDA match.

-- Tomato → ντομάτα
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ντομάτα', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%tomato%red%ripe%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ντομάτες', false
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%tomato%red%ripe%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Cucumber → αγγούρι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αγγούρι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%cucumber%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Onion → κρεμμύδι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κρεμμύδι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%onion%raw%' AND f.name_en NOT ILIKE '%green%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Bell pepper → πιπεριά
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'πιπεριά', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%pepper%sweet%green%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Eggplant → μελιτζάνα
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μελιτζάνα', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%eggplant%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Chicken → κοτόπουλο
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'κοτόπουλο', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%chicken%breast%raw%' AND f.name_en NOT ILIKE '%fried%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Pork → χοιρινό
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'χοιρινό', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%pork%loin%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Beef → μοσχάρι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μοσχάρι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%beef%ground%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Fish → ψάρι (generic, link to a common fish)
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ψάρι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%fish%cod%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Milk → γάλα
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'γάλα', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%milk%whole%' AND f.name_en NOT ILIKE '%dry%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Bread → ψωμί
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ψωμί', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%bread%white%' AND f.name_en NOT ILIKE '%crumb%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Rice → ρύζι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ρύζι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%rice%white%long%cooked%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Pasta → μακαρόνια
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'μακαρόνια', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%spaghetti%cooked%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Garlic → σκόρδο
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'σκόρδο', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%garlic%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Lemon → λεμόνι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'λεμόνι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%lemon%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Egg → αυγό
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αυγό', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%egg%whole%raw%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Potato → πατάτα
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'πατάτα', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%potato%raw%' AND f.name_en ILIKE '%russet%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'πατάτες', false
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%potato%raw%' AND f.name_en ILIKE '%russet%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Flour → αλεύρι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αλεύρι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%wheat flour%white%all-purpose%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Sugar → ζάχαρη
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ζάχαρη', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%sugar%granulated%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Butter → βούτυρο
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'βούτυρο', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%butter%salted%' AND f.name_en NOT ILIKE '%peanut%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Vinegar → ξίδι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'ξίδι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%vinegar%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

-- Salt → αλάτι
INSERT INTO food_aliases (food_id, lang, alias, preferred)
  SELECT f.id, 'el', 'αλάτι', true
  FROM foods f WHERE f.source='usda' AND f.name_en ILIKE '%salt%table%' LIMIT 1
  ON CONFLICT (food_id, lang, alias) DO NOTHING;

END $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART C: GREEK UNIT CONVERSIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── C.1: Universal Greek units (food_id = NULL) ─────────────────────────────

INSERT INTO food_unit_conversions (food_id, unit, qualifier, grams_per_unit, source)
SELECT NULL, v.unit, v.qualifier, v.grams, 'greek_seed'
FROM (VALUES
  ('φλιτζάνι',  NULL,    240),
  ('κουταλιά',  NULL,    15),
  ('κ.σ.',      NULL,    15),
  ('κουταλάκι', NULL,    5),
  ('κ.τ.',      NULL,    5),
  ('ποτήρι',    NULL,    250),
  ('ποτήρι',    'water', 250),
  ('ποτήρι',    'wine',  150),
  ('φέτα',      'bread', 30),
  ('κομμάτι',   NULL,    30),
  ('μερίδα',    NULL,    150)
) AS v(unit, qualifier, grams)
WHERE NOT EXISTS (
  SELECT 1 FROM food_unit_conversions fuc
  WHERE fuc.food_id IS NULL
    AND fuc.unit = v.unit
    AND (fuc.qualifier IS NOT DISTINCT FROM v.qualifier)
    AND fuc.source = 'greek_seed'
);

-- ── C.2: Food-specific Greek conversions ─────────────────────────────────────

-- Feta: φέτα/slice = 28g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'φέτα', 28, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_001'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='φέτα');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'slice', 28, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_001'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='slice');

-- Pita bread: 1 pita = 60g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 60, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_012'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='piece');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'πίτα', 60, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_012'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='πίτα');

-- Paximadi: 1 piece = 30g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 30, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_013'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='piece');

-- Koulouri: 1 piece = 70g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 70, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_014'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='piece');

-- Phyllo: 1 sheet = 19g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'sheet', 19, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_015'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='sheet');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'φύλλο', 19, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_015'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='φύλλο');

-- Olive oil: κουταλιά = 14g (denser than water)
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'κουταλιά', 14, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_010'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='κουταλιά');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'tbsp', 14, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_010'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='tbsp');

-- Graviera: slice = 30g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'slice', 30, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_004'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='slice');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'κομμάτι', 30, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_004'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='κομμάτι');

-- Kasseri: slice = 30g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'slice', 30, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_008'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='slice');

-- Halloumi: piece = 80g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 80, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_006'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='piece');

-- Souvlaki pork: skewer = 100g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'skewer', 100, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_039'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='skewer');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'καλαμάκι', 100, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_039'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='καλαμάκι');

-- Chicken souvlaki: skewer = 100g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'skewer', 100, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_040'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='skewer');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'καλαμάκι', 100, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_040'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='καλαμάκι');

-- Loukaniko: piece = 80g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 80, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_042'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='piece');

-- Loukoumi: piece = 25g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 25, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_045'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='piece');

-- Pasteli: bar = 30g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'bar', 30, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_046'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='bar');

-- Greek coffee: cup = 60ml
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'cup', 60, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_051'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='cup');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'φλιτζάνι', 60, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_051'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='φλιτζάνι');

-- Mountain tea: cup = 200ml
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'cup', 200, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_052'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='cup');

-- Honey: κουταλιά = 21g
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'κουταλιά', 21, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_054'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='κουταλιά');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'tbsp', 21, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_054'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='tbsp');

-- Olives: serving = 15g (~5 olives)
INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'serving', 15, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_053'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='serving');

INSERT INTO food_unit_conversions (food_id, unit, grams_per_unit, source)
SELECT f.id, 'piece', 3, 'greek_seed'
FROM foods f WHERE f.source='hhf' AND f.source_id='gr_base_053'
  AND NOT EXISTS (SELECT 1 FROM food_unit_conversions fuc WHERE fuc.food_id=f.id AND fuc.unit='piece');


-- ═══════════════════════════════════════════════════════════════════════════════
-- PART D: 25 GREEK TRADITIONAL RECIPES
-- ═══════════════════════════════════════════════════════════════════════════════
-- dish_recipes.source is recipe_source enum: 'fndds','manual','llm_decomp','menustat'
-- Using 'manual' for Trichopoulou-sourced data.
-- ON CONFLICT (dish_name, lang) DO NOTHING for idempotency.

INSERT INTO dish_recipes (dish_name, dish_name_localized, lang, region,
  total_grams, total_kcal, total_protein, total_carbs, total_fat, total_fiber,
  ingredients, source, confidence)
VALUES

-- 1. Moussaka
('moussaka', 'μουσακάς', 'en', ARRAY['GR'], 300,
 350, 15, 20, 25, 3.5,
 '[{"food_name":"eggplant sliced fried","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"ground beef","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"potato sliced","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"bechamel sauce","grams":60,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.90),

-- 2. Pastitsio
('pastitsio', 'παστίτσιο', 'en', ARRAY['GR'], 300,
 420, 18, 38, 22, 2.0,
 '[{"food_name":"penne pasta cooked","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"ground beef","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"bechamel sauce","grams":70,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"kefalotiri cheese","grams":10,"food_id":null,"matched_confidence":0.85},{"food_name":"olive oil","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.90),

-- 3. Spanakopita
('spanakopita', 'σπανακόπιτα', 'en', ARRAY['GR'], 150,
 395, 12, 41, 22, 3.0,
 '[{"food_name":"spinach cooked","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"phyllo dough","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"onion","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"egg","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.90),

-- 4. Tiropita
('tiropita', 'τυρόπιτα', 'en', ARRAY['GR'], 100,
 233, 7, 20, 13, 0.5,
 '[{"food_name":"phyllo dough","grams":35,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":35,"food_id":null,"matched_confidence":0.9},{"food_name":"egg","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"butter","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.90),

-- 5. Horiatiki (village salad)
('horiatiki salad', 'χωριάτικη σαλάτα', 'en', ARRAY['GR'], 300,
 230, 7, 10, 18, 3.0,
 '[{"food_name":"tomato raw","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"cucumber raw","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"onion raw","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"kalamata olives","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"green pepper raw","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"dried oregano","grams":1,"food_id":null,"matched_confidence":0.8}]'::jsonb,
 'manual', 0.90),

-- 6. Fasolada (bean soup — national dish)
('fasolada', 'φασολάδα', 'en', ARRAY['GR'], 350,
 280, 14, 40, 8, 10.0,
 '[{"food_name":"white beans cooked","grams":150,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato sauce","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"carrot","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"celery","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":20,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.90),

-- 7. Gemista (stuffed tomatoes and peppers)
('gemista', 'γεμιστά', 'en', ARRAY['GR'], 250,
 200, 5, 30, 5, 4.0,
 '[{"food_name":"tomato hollowed","grams":100,"food_id":null,"matched_confidence":0.85},{"food_name":"white rice raw","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"green pepper","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"onion","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"pine nuts","grams":5,"food_id":null,"matched_confidence":0.85},{"food_name":"parsley","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"mint","grams":3,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.90),

-- 8. Stifado (beef/rabbit onion stew)
('stifado', 'στιφάδο', 'en', ARRAY['GR'], 300,
 380, 30, 22, 18, 3.0,
 '[{"food_name":"beef stew meat","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"pearl onions","grams":80,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"red wine","grams":25,"food_id":null,"matched_confidence":0.8},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"bay leaf","grams":1,"food_id":null,"matched_confidence":0.8}]'::jsonb,
 'manual', 0.85),

-- 9. Giouvetsi (orzo with meat)
('giouvetsi', 'γιουβέτσι', 'en', ARRAY['GR'], 350,
 420, 25, 48, 14, 3.0,
 '[{"food_name":"orzo pasta cooked","grams":130,"food_id":null,"matched_confidence":0.9},{"food_name":"beef or lamb stew meat","grams":100,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"kefalotiri grated","grams":10,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.85),

-- 10. Tzatziki
('tzatziki', 'τζατζίκι', 'en', ARRAY['GR'], 100,
 75, 4, 4, 5, 0.5,
 '[{"food_name":"strained yogurt","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"cucumber grated","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":3,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"dill","grams":2,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.90),

-- 11. Baklava
('baklava', 'μπακλαβάς', 'en', ARRAY['GR'], 100,
 456, 7, 55, 24, 2.0,
 '[{"food_name":"phyllo dough","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"walnuts chopped","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"sugar syrup","grams":25,"food_id":null,"matched_confidence":0.85},{"food_name":"butter","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"cinnamon","grams":1,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- 12. Loukoumades (honey puffs)
('loukoumades', 'λουκουμάδες', 'en', ARRAY['GR'], 100,
 350, 5, 48, 15, 1.0,
 '[{"food_name":"flour dough fried","grams":50,"food_id":null,"matched_confidence":0.85},{"food_name":"honey syrup","grams":25,"food_id":null,"matched_confidence":0.85},{"food_name":"vegetable oil absorbed","grams":15,"food_id":null,"matched_confidence":0.8},{"food_name":"walnuts crushed","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"cinnamon","grams":1,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- 13. Galaktoboureko (custard pie)
('galaktoboureko', 'γαλακτομπούρεκο', 'en', ARRAY['GR'], 150,
 380, 8, 52, 16, 0.5,
 '[{"food_name":"semolina custard","grams":80,"food_id":null,"matched_confidence":0.8},{"food_name":"phyllo dough","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"sugar syrup","grams":20,"food_id":null,"matched_confidence":0.85},{"food_name":"butter","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"whole milk","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- 14. Bougatsa cream
('bougatsa cream', 'μπουγάτσα κρέμα', 'en', ARRAY['GR'], 200,
 420, 9, 56, 18, 1.0,
 '[{"food_name":"semolina custard","grams":100,"food_id":null,"matched_confidence":0.8},{"food_name":"phyllo dough","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"butter","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"sugar","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"whole milk","grams":15,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- 15. Saganaki (fried cheese)
('saganaki', 'σαγανάκι', 'en', ARRAY['GR'], 80,
 280, 14, 4, 22, 0,
 '[{"food_name":"kefalograviera cheese","grams":60,"food_id":null,"matched_confidence":0.85},{"food_name":"flour coating","grams":5,"food_id":null,"matched_confidence":0.85},{"food_name":"olive oil","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"lemon juice","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- 16. Revithada (Sifnos chickpea stew)
('revithada', 'ρεβιθάδα', 'en', ARRAY['GR'], 350,
 310, 15, 42, 10, 8.0,
 '[{"food_name":"chickpeas cooked","grams":200,"food_id":null,"matched_confidence":0.9},{"food_name":"onion","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"lemon juice","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"water/broth","grams":60,"food_id":null,"matched_confidence":0.8},{"food_name":"bay leaf","grams":1,"food_id":null,"matched_confidence":0.8}]'::jsonb,
 'manual', 0.85),

-- 17. Kleftiko (slow-cooked lamb)
('kleftiko', 'κλέφτικο', 'en', ARRAY['GR'], 300,
 400, 35, 8, 24, 1.5,
 '[{"food_name":"lamb shoulder","grams":180,"food_id":null,"matched_confidence":0.9},{"food_name":"potato","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"lemon juice","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"oregano","grams":2,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- 18. Briam (roasted vegetables)
('briam', 'μπριάμ', 'en', ARRAY['GR'], 300,
 180, 4, 24, 8, 5.0,
 '[{"food_name":"zucchini","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"potato","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"eggplant","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"onion","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"green pepper","grams":20,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.90),

-- 19. Kolokithokeftedes (zucchini fritters)
('kolokithokeftedes', 'κολοκυθοκεφτέδες', 'en', ARRAY['GR'], 150,
 280, 8, 28, 16, 2.5,
 '[{"food_name":"zucchini grated","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"flour","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"egg","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil for frying","grams":15,"food_id":null,"matched_confidence":0.85},{"food_name":"mint","grams":3,"food_id":null,"matched_confidence":0.9},{"food_name":"onion","grams":7,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- 20. Dakos (Cretan bruschetta)
('dakos', 'ντάκος', 'en', ARRAY['GR'], 200,
 320, 10, 30, 18, 4.0,
 '[{"food_name":"paximadi barley rusk","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato grated","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"feta or xinomyzithra","grams":30,"food_id":null,"matched_confidence":0.85},{"food_name":"olive oil","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olives","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"oregano","grams":1,"food_id":null,"matched_confidence":0.9},{"food_name":"capers","grams":5,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.90),

-- 21. Dolmades (stuffed grape leaves)
('dolmades', 'ντολμαδάκια', 'en', ARRAY['GR'], 200,
 300, 6, 40, 10, 3.0,
 '[{"food_name":"grape leaves","grams":40,"food_id":null,"matched_confidence":0.8},{"food_name":"white rice raw","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"onion","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"dill","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"mint","grams":3,"food_id":null,"matched_confidence":0.9},{"food_name":"lemon juice","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"pine nuts","grams":5,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.85),

-- 22. Souvlaki pork + pita (wrap/plate)
('souvlaki pork pita', 'σουβλάκι χοιρινό πίτα', 'en', ARRAY['GR'], 250,
 450, 30, 40, 20, 2.5,
 '[{"food_name":"pork souvlaki meat","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"pita bread","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato sliced","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion sliced","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"tzatziki","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"french fries","grams":10,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.90),

-- 23. Souvlaki chicken + pita
('souvlaki chicken pita', 'σουβλάκι κοτόπουλο πίτα', 'en', ARRAY['GR'], 250,
 380, 35, 40, 12, 2.5,
 '[{"food_name":"chicken souvlaki meat","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"pita bread","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato sliced","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion sliced","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"tzatziki","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"french fries","grams":10,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.90),

-- 24. Gyros pork (full wrap with toppings)
('gyros pork', 'γύρος χοιρινός', 'en', ARRAY['GR'], 350,
 550, 25, 48, 28, 3.0,
 '[{"food_name":"pork gyros meat","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"pita bread","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato sliced","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"onion sliced","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"tzatziki","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"french fries","grams":50,"food_id":null,"matched_confidence":0.85},{"food_name":"paprika seasoning","grams":2,"food_id":null,"matched_confidence":0.8}]'::jsonb,
 'manual', 0.85),

-- 25. Gyros chicken (full wrap with toppings)
('gyros chicken', 'γύρος κοτόπουλο', 'en', ARRAY['GR'], 350,
 450, 30, 45, 15, 3.0,
 '[{"food_name":"chicken gyros meat","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"pita bread","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato sliced","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"onion sliced","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"tzatziki","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"french fries","grams":50,"food_id":null,"matched_confidence":0.85},{"food_name":"mustard","grams":5,"food_id":null,"matched_confidence":0.8}]'::jsonb,
 'manual', 0.85)

ON CONFLICT (dish_name, lang) DO NOTHING;


-- ═══════════════════════════════════════════════════════════════════════════════
-- VERIFICATION COUNTS (informational, no side effects)
-- ═══════════════════════════════════════════════════════════════════════════════
-- After running, verify with:
--   SELECT count(*) FROM foods WHERE source='hhf' AND source_id LIKE 'gr_base_%';
--     → Expected: 55
--   SELECT count(*) FROM food_aliases fa JOIN foods f ON fa.food_id=f.id
--     WHERE f.source='hhf' AND f.source_id LIKE 'gr_base_%';
--     → Expected: ~85 (Part A food aliases)
--   SELECT count(*) FROM food_unit_conversions WHERE source='greek_seed';
--     → Expected: ~40
--   SELECT count(*) FROM dish_recipes WHERE region @> ARRAY['GR'];
--     → Expected: 25+
