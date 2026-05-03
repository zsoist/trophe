-- 0012_seed_traditional_dishes.sql
-- Seed dish_recipes with traditional Colombian and Greek composite dishes.
-- Macros are based on USDA FNDDS, published Colombian food composition tables,
-- and Hellenic Health Foundation nutritional data.
-- Each row = 1 standard serving with ingredient breakdown.

-- ═══════════════════════════════════════════════════════════════════════════════
-- COLOMBIAN TRADITIONAL DISHES
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO dish_recipes (dish_name, dish_name_localized, lang, region, total_grams, total_kcal, total_protein, total_carbs, total_fat, total_fiber, ingredients, source, confidence)
VALUES
-- Arroz con pollo (rice with chicken, Colombian style)
('arroz con pollo', 'arroz con pollo', 'en', ARRAY['CO'], 380,
 520, 32, 58, 16, 3.2,
 '[{"food_name":"white rice cooked","grams":180,"food_id":null,"matched_confidence":0.9},{"food_name":"chicken thigh cooked","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"green peas","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"carrot cooked","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"vegetable oil","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"bell pepper","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Tamales colombianos (corn dough with meat filling, wrapped in banana leaf)
('tamale', 'tamal colombiano', 'en', ARRAY['CO'], 250,
 380, 14, 36, 20, 3.5,
 '[{"food_name":"corn masa","grams":120,"food_id":null,"matched_confidence":0.85},{"food_name":"pork shoulder cooked","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"chicken breast cooked","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"carrot cooked","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"green peas","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"lard","grams":10,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.80),

-- Patacón (fried green plantain, flattened)
('patacon', 'patacón', 'en', ARRAY['CO'], 150,
 320, 2, 42, 16, 3.0,
 '[{"food_name":"plantain green","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"vegetable oil","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"salt","grams":2,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Caldo de costilla (beef rib broth, breakfast soup)
('caldo de costilla', 'caldo de costilla', 'en', ARRAY['CO'], 400,
 290, 22, 24, 12, 2.5,
 '[{"food_name":"beef short ribs","grams":100,"food_id":null,"matched_confidence":0.85},{"food_name":"potato cooked","grams":150,"food_id":null,"matched_confidence":0.9},{"food_name":"cilantro","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"onion raw","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":3,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Changua (milk and egg soup, Bogotá breakfast)
('changua', 'changua', 'en', ARRAY['CO'], 350,
 220, 14, 12, 12, 0.5,
 '[{"food_name":"whole milk","grams":200,"food_id":null,"matched_confidence":0.9},{"food_name":"egg poached","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"scallion","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"bread stale","grams":30,"food_id":null,"matched_confidence":0.8},{"food_name":"cilantro","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- Mondongo (tripe soup)
('mondongo', 'mondongo', 'en', ARRAY['CO'], 450,
 340, 28, 30, 12, 4.0,
 '[{"food_name":"beef tripe cooked","grams":120,"food_id":null,"matched_confidence":0.85},{"food_name":"potato cooked","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"yuca cooked","grams":60,"food_id":null,"matched_confidence":0.85},{"food_name":"carrot cooked","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"green peas","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":15,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- Cazuela de mariscos (seafood stew)
('cazuela de mariscos', 'cazuela de mariscos', 'en', ARRAY['CO'], 400,
 380, 32, 18, 20, 2.0,
 '[{"food_name":"shrimp cooked","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"fish fillet cooked","grams":80,"food_id":null,"matched_confidence":0.85},{"food_name":"coconut milk","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"potato cooked","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"bell pepper","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato cooked","grams":20,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- Lechona (stuffed roast pork with rice and peas)
('lechona', 'lechona', 'en', ARRAY['CO'], 300,
 580, 38, 28, 34, 2.0,
 '[{"food_name":"pork roast","grams":150,"food_id":null,"matched_confidence":0.9},{"food_name":"white rice cooked","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"green peas","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"pork skin crispy","grams":20,"food_id":null,"matched_confidence":0.8},{"food_name":"onion cooked","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.78),

-- Pandebono (cheese bread, Valle del Cauca)
('pandebono', 'pandebono', 'en', ARRAY['CO'], 80,
 220, 8, 26, 9, 0.5,
 '[{"food_name":"tapioca starch","grams":30,"food_id":null,"matched_confidence":0.85},{"food_name":"corn flour","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"queso fresco","grams":20,"food_id":null,"matched_confidence":0.85},{"food_name":"egg","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- Almojábana (cheese bread roll)
('almojabana', 'almojábana', 'en', ARRAY['CO'], 75,
 210, 7, 24, 9, 0.3,
 '[{"food_name":"corn flour","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"queso fresco","grams":25,"food_id":null,"matched_confidence":0.85},{"food_name":"egg","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"butter","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- Buñuelo (fried cheese ball)
('bunuelo', 'buñuelo', 'en', ARRAY['CO'], 50,
 180, 5, 16, 10, 0.2,
 '[{"food_name":"corn starch","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"queso fresco","grams":15,"food_id":null,"matched_confidence":0.85},{"food_name":"egg","grams":8,"food_id":null,"matched_confidence":0.9},{"food_name":"vegetable oil","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- Arepa plain (no filling)
('arepa', 'arepa', 'en', ARRAY['CO'], 120,
 210, 4, 36, 5, 2.5,
 '[{"food_name":"corn masa","grams":110,"food_id":null,"matched_confidence":0.9},{"food_name":"butter","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"salt","grams":2,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Arepa de huevo (fried arepa stuffed with egg)
('arepa de huevo', 'arepa de huevo', 'en', ARRAY['CO'], 180,
 380, 12, 38, 20, 2.5,
 '[{"food_name":"corn masa","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"egg whole","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"vegetable oil","grams":20,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Chicharrón (fried pork belly/skin)
('chicharron', 'chicharrón', 'en', ARRAY['CO'], 100,
 450, 28, 0, 38, 0,
 '[{"food_name":"pork belly fried","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"pork skin crispy","grams":20,"food_id":null,"matched_confidence":0.8}]'::jsonb,
 'manual', 0.82),

-- Hogao (Colombian tomato-onion sauce, typically a side)
('hogao', 'hogao', 'en', ARRAY['CO'], 60,
 45, 1, 5, 2.5, 1.0,
 '[{"food_name":"tomato cooked","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"vegetable oil","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":3,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Aguapanela (panela water, hot or cold)
('aguapanela', 'aguapanela', 'en', ARRAY['CO'], 250,
 100, 0, 25, 0, 0,
 '[{"food_name":"panela sugar","grams":25,"food_id":null,"matched_confidence":0.8},{"food_name":"water","grams":225,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Mazamorra (corn porridge with milk)
('mazamorra', 'mazamorra', 'en', ARRAY['CO'], 300,
 220, 6, 38, 5, 2.0,
 '[{"food_name":"hominy corn","grams":100,"food_id":null,"matched_confidence":0.8},{"food_name":"whole milk","grams":150,"food_id":null,"matched_confidence":0.9},{"food_name":"panela sugar","grams":20,"food_id":null,"matched_confidence":0.8}]'::jsonb,
 'manual', 0.78),

-- Calentado (reheated rice and beans, breakfast)
('calentado', 'calentado', 'en', ARRAY['CO'], 300,
 420, 16, 56, 14, 6.0,
 '[{"food_name":"white rice cooked","grams":150,"food_id":null,"matched_confidence":0.9},{"food_name":"kidney beans cooked","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"vegetable oil","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"hogao sauce","grams":30,"food_id":null,"matched_confidence":0.7}]'::jsonb,
 'manual', 0.82),

-- Obleas (thin wafer with arequipe/dulce de leche)
('oblea con arequipe', 'oblea con arequipe', 'en', ARRAY['CO'], 80,
 250, 4, 40, 8, 0.5,
 '[{"food_name":"wafer thin","grams":20,"food_id":null,"matched_confidence":0.8},{"food_name":"dulce de leche","grams":50,"food_id":null,"matched_confidence":0.85},{"food_name":"shredded coconut","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.78)

ON CONFLICT (dish_name, lang) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════════
-- GREEK TRADITIONAL DISHES
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO dish_recipes (dish_name, dish_name_localized, lang, region, total_grams, total_kcal, total_protein, total_carbs, total_fat, total_fiber, ingredients, source, confidence)
VALUES
-- Gyros pork pita (the most common Greek street food)
('gyros pork pita', 'γύρος χοιρινό πίτα', 'en', ARRAY['GR'], 320,
 520, 28, 38, 28, 3.0,
 '[{"food_name":"pita bread","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"pork shoulder cooked","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"tzatziki sauce","grams":45,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato raw","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion raw","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"french fries","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Gyros chicken pita
('gyros chicken pita', 'γύρος κοτόπουλο πίτα', 'en', ARRAY['GR'], 310,
 460, 32, 38, 20, 3.0,
 '[{"food_name":"pita bread","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"chicken breast grilled","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"tzatziki sauce","grams":45,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato raw","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion raw","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"french fries","grams":25,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Moussaka (eggplant-meat casserole with béchamel)
('moussaka', 'μουσακάς', 'en', ARRAY['GR'], 350,
 480, 24, 28, 30, 4.5,
 '[{"food_name":"eggplant cooked","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"ground beef cooked","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"potato cooked","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"bechamel sauce","grams":60,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"parmesan cheese","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Pastitsio (Greek baked pasta with meat sauce and béchamel)
('pastitsio', 'παστίτσιο', 'en', ARRAY['GR'], 350,
 510, 26, 42, 26, 2.5,
 '[{"food_name":"pasta cooked","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"ground beef cooked","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"bechamel sauce","grams":70,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"parmesan cheese","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"egg","grams":15,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Horiatiki (Greek village salad)
('greek salad', 'χωριάτικη σαλάτα', 'en', ARRAY['GR'], 300,
 320, 10, 12, 26, 3.5,
 '[{"food_name":"tomato raw","grams":100,"food_id":null,"matched_confidence":0.9},{"food_name":"cucumber raw","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"onion raw","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"green pepper raw","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"kalamata olives","grams":25,"food_id":null,"matched_confidence":0.85},{"food_name":"olive oil","grams":20,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.88),

-- Spanakopita (spinach pie)
('spanakopita', 'σπανακόπιτα', 'en', ARRAY['GR'], 150,
 320, 12, 22, 20, 3.0,
 '[{"food_name":"phyllo dough","grams":40,"food_id":null,"matched_confidence":0.85},{"food_name":"spinach cooked","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":12,"food_id":null,"matched_confidence":0.9},{"food_name":"egg","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Tiropita (cheese pie)
('tiropita', 'τυρόπιτα', 'en', ARRAY['GR'], 130,
 340, 14, 20, 22, 1.0,
 '[{"food_name":"phyllo dough","grams":40,"food_id":null,"matched_confidence":0.85},{"food_name":"feta cheese","grams":45,"food_id":null,"matched_confidence":0.9},{"food_name":"egg","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"butter","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"ricotta cheese","grams":10,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.85),

-- Fasolada (white bean soup — the national dish of Greece)
('fasolada', 'φασολάδα', 'en', ARRAY['GR'], 400,
 320, 16, 42, 10, 12.0,
 '[{"food_name":"white beans cooked","grams":150,"food_id":null,"matched_confidence":0.9},{"food_name":"tomato cooked","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"carrot cooked","grams":40,"food_id":null,"matched_confidence":0.9},{"food_name":"celery cooked","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Gemista (stuffed tomatoes and peppers with rice)
('gemista', 'γεμιστά', 'en', ARRAY['GR'], 350,
 310, 8, 38, 14, 5.0,
 '[{"food_name":"tomato raw","grams":120,"food_id":null,"matched_confidence":0.9},{"food_name":"bell pepper","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"white rice cooked","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"pine nuts","grams":10,"food_id":null,"matched_confidence":0.85},{"food_name":"mint fresh","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.83),

-- Stifado (beef stew with pearl onions)
('stifado', 'στιφάδο', 'en', ARRAY['GR'], 350,
 420, 36, 18, 22, 3.5,
 '[{"food_name":"beef stew meat cooked","grams":150,"food_id":null,"matched_confidence":0.9},{"food_name":"pearl onions cooked","grams":80,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"red wine","grams":30,"food_id":null,"matched_confidence":0.85},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":5,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Dolmades (stuffed grape leaves with rice)
('dolmades', 'ντολμαδάκια', 'en', ARRAY['GR'], 200,
 260, 6, 30, 12, 3.0,
 '[{"food_name":"grape leaves","grams":40,"food_id":null,"matched_confidence":0.8},{"food_name":"white rice cooked","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":25,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"lemon juice","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"dill fresh","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"pine nuts","grams":10,"food_id":null,"matched_confidence":0.85}]'::jsonb,
 'manual', 0.83),

-- Giouvetsi (orzo pasta baked with meat)
('giouvetsi', 'γιουβέτσι', 'en', ARRAY['GR'], 380,
 520, 34, 40, 24, 3.0,
 '[{"food_name":"beef stew meat cooked","grams":130,"food_id":null,"matched_confidence":0.9},{"food_name":"orzo pasta cooked","grams":150,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"parmesan cheese","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"onion cooked","grams":15,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Papoutsakia (stuffed eggplant "little shoes")
('papoutsakia', 'παπουτσάκια', 'en', ARRAY['GR'], 300,
 380, 20, 18, 26, 5.0,
 '[{"food_name":"eggplant cooked","grams":130,"food_id":null,"matched_confidence":0.9},{"food_name":"ground beef cooked","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"bechamel sauce","grams":40,"food_id":null,"matched_confidence":0.85},{"food_name":"tomato sauce","grams":30,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"parmesan cheese","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Souvlaki pork (plain, without pita — just the skewer)
('souvlaki pork', 'σουβλάκι χοιρινό', 'en', ARRAY['GR'], 130,
 280, 28, 2, 18, 0.5,
 '[{"food_name":"pork loin grilled","grams":110,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":8,"food_id":null,"matched_confidence":0.9},{"food_name":"lemon juice","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"oregano","grams":2,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Tzatziki (as a side/dip)
('tzatziki', 'τζατζίκι', 'en', ARRAY['GR'], 100,
 90, 5, 4, 6, 0.5,
 '[{"food_name":"greek yogurt","grams":70,"food_id":null,"matched_confidence":0.9},{"food_name":"cucumber raw","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":3,"food_id":null,"matched_confidence":0.9},{"food_name":"dill fresh","grams":2,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.88),

-- Kleftiko (slow-roasted lamb)
('kleftiko', 'κλέφτικο', 'en', ARRAY['GR'], 300,
 480, 38, 8, 32, 2.0,
 '[{"food_name":"lamb leg roasted","grams":180,"food_id":null,"matched_confidence":0.9},{"food_name":"potato cooked","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"feta cheese","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"olive oil","grams":15,"food_id":null,"matched_confidence":0.9},{"food_name":"garlic","grams":5,"food_id":null,"matched_confidence":0.9},{"food_name":"lemon juice","grams":10,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.82),

-- Bougatsa (custard-filled phyllo pastry)
('bougatsa', 'μπουγάτσα', 'en', ARRAY['GR'], 200,
 380, 10, 40, 20, 1.0,
 '[{"food_name":"phyllo dough","grams":60,"food_id":null,"matched_confidence":0.85},{"food_name":"custard cream","grams":100,"food_id":null,"matched_confidence":0.8},{"food_name":"butter","grams":20,"food_id":null,"matched_confidence":0.9},{"food_name":"powdered sugar","grams":10,"food_id":null,"matched_confidence":0.9},{"food_name":"cinnamon","grams":2,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.80),

-- Frappe (Greek iced coffee)
('frappe', 'φραπέ', 'en', ARRAY['GR'], 250,
 80, 2, 8, 4, 0,
 '[{"food_name":"instant coffee","grams":2,"food_id":null,"matched_confidence":0.9},{"food_name":"whole milk","grams":50,"food_id":null,"matched_confidence":0.9},{"food_name":"sugar","grams":8,"food_id":null,"matched_confidence":0.9},{"food_name":"water","grams":190,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85),

-- Freddo cappuccino (Greek cold espresso with milk foam)
('freddo cappuccino', 'φρέντο καπουτσίνο', 'en', ARRAY['GR'], 250,
 95, 3, 10, 4, 0,
 '[{"food_name":"espresso coffee","grams":60,"food_id":null,"matched_confidence":0.9},{"food_name":"whole milk","grams":80,"food_id":null,"matched_confidence":0.9},{"food_name":"sugar","grams":8,"food_id":null,"matched_confidence":0.9},{"food_name":"ice","grams":100,"food_id":null,"matched_confidence":0.9}]'::jsonb,
 'manual', 0.85)

ON CONFLICT (dish_name, lang) DO NOTHING;
