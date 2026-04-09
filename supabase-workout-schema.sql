-- ═══════════════════════════════════════════════
-- τροφή (Trophē) — Workout Module Schema
-- ═══════════════════════════════════════════════

-- Exercise library (shared, coach-extensible)
CREATE TABLE exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  name_es TEXT,
  name_el TEXT,
  muscle_group TEXT NOT NULL CHECK (muscle_group IN (
    'chest', 'back', 'shoulders', 'biceps', 'triceps', 'forearms',
    'quads', 'hamstrings', 'glutes', 'calves', 'core', 'full_body', 'cardio'
  )),
  secondary_muscles TEXT[], -- e.g. ['triceps', 'shoulders'] for bench press
  equipment TEXT, -- 'barbell', 'dumbbell', 'machine', 'bodyweight', 'cable', 'band'
  is_compound BOOLEAN DEFAULT false,
  is_template BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Workout sessions
CREATE TABLE workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  name TEXT, -- e.g. "Push Day A", "Glute Focus"
  template_id UUID, -- if following a routine template
  duration_minutes INT,
  notes TEXT,
  pain_flags JSONB DEFAULT '[]', -- [{exercise_id, body_part, severity: 1-5, notes}]
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Individual sets within a session
CREATE TABLE workout_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id),
  set_number INT NOT NULL,
  weight_kg REAL,
  reps INT,
  rpe REAL, -- Rate of Perceived Exertion (1-10, optional)
  is_warmup BOOLEAN DEFAULT false,
  is_pr BOOLEAN DEFAULT false, -- auto-detected personal record
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Routine templates (coach creates for clients)
CREATE TABLE workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES profiles(id),
  name TEXT NOT NULL,
  description TEXT,
  target_muscles TEXT[], -- primary focus
  exercises JSONB NOT NULL DEFAULT '[]', -- [{exercise_id, target_sets, target_reps, target_rpe, notes}]
  day_label TEXT, -- "Day A", "Push", "Upper 1", etc.
  difficulty TEXT DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  shared BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX idx_workout_sessions_user ON workout_sessions(user_id, session_date);
CREATE INDEX idx_workout_sets_session ON workout_sets(session_id);

-- ═══════════════════════════════════════════════
-- FORM ANALYSIS (AI Camera Form Check)
-- ═══════════════════════════════════════════════

CREATE TABLE form_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  exercise_id UUID REFERENCES exercises(id),
  session_id UUID REFERENCES workout_sessions(id),
  side TEXT DEFAULT 'right',
  reps_analyzed INT DEFAULT 0,
  overall_score REAL,
  overall_assessment TEXT,
  per_rep_scores JSONB,
  reference_comparison JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_form_analyses_user ON form_analyses(user_id);
ALTER TABLE form_analyses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own form analyses" ON form_analyses FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches view client form analyses" ON form_analyses FOR SELECT
  USING (user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));
CREATE INDEX idx_workout_sets_exercise ON workout_sets(exercise_id);
CREATE INDEX idx_exercises_muscle ON exercises(muscle_group);

-- RLS
ALTER TABLE exercises ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All see template exercises" ON exercises FOR SELECT USING (is_template = true);
CREATE POLICY "Users see own exercises" ON exercises FOR SELECT USING (created_by = auth.uid());
CREATE POLICY "Users create exercises" ON exercises FOR INSERT WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users manage own sessions" ON workout_sessions FOR ALL USING (user_id = auth.uid());
CREATE POLICY "Coaches view client sessions" ON workout_sessions FOR SELECT
  USING (user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid()));

CREATE POLICY "Users manage own sets" ON workout_sets FOR ALL
  USING (session_id IN (SELECT id FROM workout_sessions WHERE user_id = auth.uid()));
CREATE POLICY "Coaches view client sets" ON workout_sets FOR SELECT
  USING (session_id IN (SELECT id FROM workout_sessions WHERE user_id IN (SELECT user_id FROM client_profiles WHERE coach_id = auth.uid())));

CREATE POLICY "Coaches manage own templates" ON workout_templates FOR ALL USING (created_by = auth.uid());
CREATE POLICY "Clients see shared templates" ON workout_templates FOR SELECT
  USING (shared = true OR created_by IN (SELECT coach_id FROM client_profiles WHERE user_id = auth.uid()));
