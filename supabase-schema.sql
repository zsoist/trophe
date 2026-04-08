-- ═══════════════════════════════════════════════
-- τροφή (Trophē) — Full Database Schema
-- Run this in Supabase SQL Editor after creating the project
-- ═══════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════════════════════════════════════════
-- CORE PROFILES
-- ═══════════════════════════════════════════════

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'client' CHECK (role IN ('client', 'coach', 'both')),
  avatar_url TEXT,
  language TEXT DEFAULT 'en' CHECK (language IN ('en', 'es', 'el')),
  timezone TEXT DEFAULT 'UTC',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  coach_id UUID REFERENCES profiles(id),
  age INT,
  sex TEXT CHECK (sex IN ('male', 'female')),
  height_cm REAL,
  weight_kg REAL,
  body_fat_pct REAL,
  activity_level TEXT CHECK (activity_level IN ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  goal TEXT CHECK (goal IN ('fat_loss', 'muscle_gain', 'maintenance', 'recomp', 'endurance', 'health')),
  bmr REAL,
  tdee REAL,
  target_calories INT,
  target_protein_g INT,
  target_carbs_g INT,
  target_fat_g INT,
  target_fiber_g INT,
  target_water_ml INT,
  current_habit_id UUID,
  coaching_phase TEXT DEFAULT 'onboarding' CHECK (coaching_phase IN ('onboarding', 'active', 'maintenance')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- HABIT ENGINE
-- ═══════════════════════════════════════════════

CREATE TABLE habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES profiles(id),
  name_en TEXT NOT NULL,
  name_es TEXT,
  name_el TEXT,
  description_en TEXT,
  description_es TEXT,
  description_el TEXT,
  emoji TEXT DEFAULT '🎯',
  category TEXT CHECK (category IN ('nutrition', 'hydration', 'movement', 'sleep', 'mindset', 'recovery')),
  difficulty TEXT DEFAULT 'beginner' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  target_value REAL,
  target_unit TEXT,
  cycle_days INT DEFAULT 14,
  suggested_order INT,
  is_template BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_habits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  habit_id UUID REFERENCES habits(id),
  assigned_by UUID REFERENCES profiles(id),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'skipped')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  current_streak INT DEFAULT 0,
  best_streak INT DEFAULT 0,
  total_completions INT DEFAULT 0,
  sequence_number INT DEFAULT 1,
  coach_note TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE habit_checkins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_habit_id UUID REFERENCES client_habits(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id),
  checked_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed BOOLEAN NOT NULL,
  value REAL,
  note TEXT,
  mood TEXT CHECK (mood IN ('great', 'good', 'okay', 'tough', 'struggled')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(client_habit_id, checked_date)
);

-- ═══════════════════════════════════════════════
-- NUTRITION TRACKING
-- ═══════════════════════════════════════════════

CREATE TABLE food_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  meal_type TEXT CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack', 'pre_workout', 'post_workout')),
  food_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT 'serving',
  calories INT,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  fiber_g REAL,
  source TEXT CHECK (source IN ('usda', 'openfoodfacts', 'custom', 'photo_ai', 'natural_language', 'ai_estimate')),
  source_id TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE water_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- SUPPLEMENT PROTOCOLS
-- ═══════════════════════════════════════════════

CREATE TABLE supplement_protocols (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  supplements JSONB NOT NULL DEFAULT '[]',
  goal TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE client_supplements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  protocol_id UUID REFERENCES supplement_protocols(id),
  assigned_by UUID REFERENCES profiles(id),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE supplement_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  supplement_name TEXT NOT NULL,
  taken BOOLEAN DEFAULT true,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- COACH WORKSPACE
-- ═══════════════════════════════════════════════

CREATE TABLE coach_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id UUID REFERENCES profiles(id),
  client_id UUID REFERENCES profiles(id),
  note TEXT NOT NULL,
  session_type TEXT CHECK (session_type IN ('check_in', 'progression', 'concern', 'general')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE custom_foods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  calories INT,
  protein_g REAL,
  carbs_g REAL,
  fat_g REAL,
  fiber_g REAL,
  unit TEXT DEFAULT '100g',
  category TEXT,
  shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE measurements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  measured_date DATE NOT NULL DEFAULT CURRENT_DATE,
  weight_kg REAL,
  body_fat_pct REAL,
  waist_cm REAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══════════════════════════════════════════════
-- INDEXES
-- ═══════════════════════════════════════════════

CREATE INDEX idx_client_profiles_coach ON client_profiles(coach_id);
CREATE INDEX idx_client_profiles_user ON client_profiles(user_id);
CREATE INDEX idx_client_habits_client ON client_habits(client_id);
CREATE INDEX idx_client_habits_status ON client_habits(status);
CREATE INDEX idx_habit_checkins_date ON habit_checkins(checked_date);
CREATE INDEX idx_habit_checkins_user ON habit_checkins(user_id);
CREATE INDEX idx_food_log_user_date ON food_log(user_id, logged_date);
CREATE INDEX idx_water_log_user_date ON water_log(user_id, logged_date);
CREATE INDEX idx_supplement_log_user_date ON supplement_log(user_id, logged_date);
CREATE INDEX idx_measurements_user_date ON measurements(user_id, measured_date);
CREATE INDEX idx_coach_notes_client ON coach_notes(client_id);

-- ═══════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE habit_checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE food_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE water_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_protocols ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_supplements ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplement_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_foods ENABLE ROW LEVEL SECURITY;
ALTER TABLE measurements ENABLE ROW LEVEL SECURITY;

-- Profiles: users see their own, coaches see assigned clients
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Coaches can view client profiles" ON profiles FOR SELECT
  USING (id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

-- Client profiles: users see own, coaches see assigned
CREATE POLICY "Users can manage own client_profile" ON client_profiles FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches can view assigned clients" ON client_profiles FOR SELECT
  USING (coach_id = auth.uid());
CREATE POLICY "Coaches can update assigned clients" ON client_profiles FOR UPDATE
  USING (coach_id = auth.uid());

-- Habits: templates visible to all, custom visible to creator
CREATE POLICY "All users see template habits" ON habits FOR SELECT USING (is_template = true);
CREATE POLICY "Coaches see own habits" ON habits FOR SELECT USING (created_by = auth.uid());
CREATE POLICY "Coaches can create habits" ON habits FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Coaches can update own habits" ON habits FOR UPDATE USING (created_by = auth.uid());

-- Client habits: clients see own, coaches see assigned
CREATE POLICY "Clients see own habits" ON client_habits FOR SELECT USING (client_id = auth.uid());
CREATE POLICY "Coaches manage assigned habits" ON client_habits FOR ALL
  USING (assigned_by = auth.uid() OR client_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

-- Habit checkins: clients manage own
CREATE POLICY "Clients manage own checkins" ON habit_checkins FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches view client checkins" ON habit_checkins FOR SELECT
  USING (user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

-- Food log: clients manage own, coaches view
CREATE POLICY "Clients manage own food log" ON food_log FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches view client food log" ON food_log FOR SELECT
  USING (user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

-- Water log: same pattern
CREATE POLICY "Clients manage own water log" ON water_log FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches view client water log" ON water_log FOR SELECT
  USING (user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

-- Supplement protocols: coaches manage own
CREATE POLICY "Coaches manage own protocols" ON supplement_protocols FOR ALL USING (coach_id = auth.uid());
CREATE POLICY "Clients view assigned protocols" ON supplement_protocols FOR SELECT
  USING (id IN (SELECT protocol_id FROM client_supplements WHERE user_id = auth.uid()));

-- Client supplements: clients see own, coaches manage
CREATE POLICY "Clients view own supplements" ON client_supplements FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Clients manage own supplement log" ON client_supplements FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches manage client supplements" ON client_supplements FOR ALL
  USING (assigned_by = auth.uid());

-- Supplement log: clients manage own
CREATE POLICY "Clients manage own supplement log2" ON supplement_log FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches view supplement log" ON supplement_log FOR SELECT
  USING (user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

-- Coach notes: coaches manage own
CREATE POLICY "Coaches manage own notes" ON coach_notes FOR ALL USING (coach_id = auth.uid());
CREATE POLICY "Clients view notes about them" ON coach_notes FOR SELECT USING (client_id = auth.uid());

-- Custom foods: creators manage own, shared visible to coached clients
CREATE POLICY "Users manage own custom foods" ON custom_foods FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Clients see coach shared foods" ON custom_foods FOR SELECT
  USING (shared = true AND created_by IN (SELECT coach_id FROM client_profiles WHERE user_id = auth.uid()));

-- Measurements: clients manage own, coaches view
CREATE POLICY "Clients manage own measurements" ON measurements FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches view client measurements" ON measurements FOR SELECT
  USING (user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

-- ═══════════════════════════════════════════════
-- SEED: Template Habits
-- ═══════════════════════════════════════════════

INSERT INTO habits (name_en, name_es, name_el, description_en, description_es, description_el, emoji, category, difficulty, target_value, target_unit, cycle_days, suggested_order, is_template) VALUES
('Drink enough water daily', 'Beber suficiente agua diariamente', 'Πίνε αρκετό νερό καθημερινά', 'Aim for at least 3 liters of water throughout the day. Carry a bottle with you.', 'Apunta a al menos 3 litros de agua durante el día. Lleva una botella contigo.', 'Στοχεύστε τουλάχιστον 3 λίτρα νερό κατά τη διάρκεια της ημέρας.', '💧', 'hydration', 'beginner', 3, 'liters', 14, 1, true),
('Eat protein at every meal', 'Comer proteína en cada comida', 'Φάε πρωτεΐνη σε κάθε γεύμα', 'Include a palm-sized portion of protein (chicken, fish, eggs, legumes) at every meal.', 'Incluye una porción del tamaño de tu palma de proteína en cada comida.', 'Συμπεριλάβετε μια μερίδα πρωτεΐνης σε κάθε γεύμα.', '🥩', 'nutrition', 'beginner', 1.6, 'g/kg', 14, 2, true),
('Eat 5 servings of vegetables', 'Comer 5 porciones de vegetales', 'Φάε 5 μερίδες λαχανικών', 'Include vegetables at lunch and dinner. A serving is about 1 cup raw or ½ cup cooked.', 'Incluye verduras en almuerzo y cena. Una porción es 1 taza cruda o ½ taza cocida.', 'Βάλε λαχανικά στο μεσημεριανό και το βραδινό.', '🥬', 'nutrition', 'beginner', 5, 'servings', 14, 3, true),
('Sleep 7-9 hours', 'Dormir 7-9 horas', 'Κοιμήσου 7-9 ώρες', 'Aim for 7-9 hours of quality sleep. Set a consistent bedtime and avoid screens 1h before.', 'Apunta a 7-9 horas de sueño de calidad. Fija una hora de dormir consistente.', 'Στοχεύστε 7-9 ώρες ποιοτικού ύπνου.', '😴', 'sleep', 'beginner', 7.5, 'hours', 14, 4, true),
('Eat slowly (20 min meals)', 'Comer despacio (20 min por comida)', 'Φάε αργά (20 λεπτά γεύματα)', 'Take at least 20 minutes per meal. Put your fork down between bites. Notice hunger signals.', 'Toma al menos 20 minutos por comida. Deja el tenedor entre bocados.', 'Αφιερώστε τουλάχιστον 20 λεπτά ανά γεύμα.', '🍽️', 'mindset', 'intermediate', 20, 'minutes', 14, 5, true),
('Prepare meals in advance', 'Preparar comidas con anticipación', 'Προετοίμασε γεύματα εκ των προτέρων', 'Prep at least 3 meals ahead of time. Cook proteins and carbs in bulk on weekends.', 'Prepara al menos 3 comidas con anticipación. Cocina proteínas y carbohidratos el fin de semana.', 'Προετοιμάστε τουλάχιστον 3 γεύματα εκ των προτέρων.', '🍱', 'nutrition', 'intermediate', 3, 'meals', 14, 6, true),
('Walk 8000+ steps', 'Caminar 8000+ pasos', 'Περπάτησε 8000+ βήματα', 'NEAT is crucial. Walk after meals, take stairs, stand more.', 'El NEAT es crucial. Camina después de comer, usa escaleras, párate más.', 'Η καθημερινή κίνηση είναι κρίσιμη. Περπάτα μετά τα γεύματα.', '🚶', 'movement', 'beginner', 8000, 'steps', 14, 7, true),
('Eat without screens', 'Comer sin pantallas', 'Φάε χωρίς οθόνες', 'At least one meal per day without phone, TV, or computer. Focus on your food.', 'Al menos una comida al día sin celular, TV o computadora.', 'Τουλάχιστον ένα γεύμα χωρίς κινητό, TV ή υπολογιστή.', '📵', 'mindset', 'intermediate', 1, 'meals', 14, 8, true),
('Include healthy fats daily', 'Incluir grasas saludables diariamente', 'Συμπερίλαβε υγιεινά λιπαρά καθημερινά', 'Add avocado, olive oil, nuts, or fatty fish to at least one meal. Supports hormones and satiety.', 'Agrega aguacate, aceite de oliva, frutos secos o pescado graso a al menos una comida.', 'Πρόσθεσε αβοκάντο, ελαιόλαδο, ξηρούς καρπούς ή λιπαρά ψάρια.', '🥑', 'nutrition', 'beginner', 0.8, 'g/kg', 14, 9, true),
('Practice 5-min breathing', 'Practicar 5 min de respiración', 'Κάνε 5 λεπτά αναπνοές', 'Spend 5 minutes on deep breathing or meditation. Reduces cortisol and improves recovery.', 'Dedica 5 minutos a respiración profunda o meditación. Reduce cortisol y mejora recuperación.', 'Αφιερώστε 5 λεπτά σε βαθιά αναπνοή ή διαλογισμό.', '🧘', 'recovery', 'beginner', 5, 'minutes', 14, 10, true);

-- ═══════════════════════════════════════════════
-- FOOD DATABASE (Phase 2: Local food catalog)
-- ═══════════════════════════════════════════════

CREATE TABLE food_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_el TEXT,
  name_es TEXT,
  calories_per_100g REAL NOT NULL,
  protein_per_100g REAL NOT NULL,
  carbs_per_100g REAL NOT NULL,
  fat_per_100g REAL NOT NULL,
  fiber_per_100g REAL DEFAULT 0,
  default_serving_grams REAL DEFAULT 100,
  default_serving_unit TEXT DEFAULT '100g',
  common_units JSONB DEFAULT '[]',
  category TEXT,
  source TEXT CHECK (source IN ('seed', 'usda', 'openfoodfacts', 'coach')),
  source_id TEXT,
  popularity INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(name, source)
);

-- Full-text search index (simple config for multilingual support)
CREATE INDEX idx_food_db_name ON food_database(name);
CREATE INDEX idx_food_db_name_el ON food_database(name_el);
CREATE INDEX idx_food_db_name_es ON food_database(name_es);
CREATE INDEX idx_food_db_popularity ON food_database(popularity DESC);
CREATE INDEX idx_food_db_search ON food_database USING GIN(
  to_tsvector('simple', COALESCE(name, '') || ' ' || COALESCE(name_el, '') || ' ' || COALESCE(name_es, ''))
);

-- RLS: readable by all authenticated, writable by coaches
ALTER TABLE food_database ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All authenticated read food_database" ON food_database FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "Coaches insert food_database" ON food_database FOR INSERT WITH CHECK (
  auth.uid() IN (SELECT id FROM profiles WHERE role IN ('coach', 'both'))
);
