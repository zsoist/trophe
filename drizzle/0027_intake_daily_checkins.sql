-- Phase 2 coach module: intake questionnaires + daily lifestyle check-ins.
-- (Michael 2026-06-12.) NO medical document upload — GDPR research pending;
-- lifestyle answers only.

-- ── Intake questionnaires ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questionnaires (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid REFERENCES profiles(id) ON DELETE CASCADE,  -- NULL = global default set
  title text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS questionnaire_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  prompt text NOT NULL,
  kind text NOT NULL DEFAULT 'text' CHECK (kind IN ('text','boolean','scale')),
  required boolean NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS questionnaire_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questionnaire_id uuid NOT NULL REFERENCES questionnaires(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,   -- { [question_id]: answer }
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (questionnaire_id, client_id)
);

ALTER TABLE questionnaires ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE questionnaire_responses ENABLE ROW LEVEL SECURITY;

-- Questionnaires: defaults readable by all authed; coach manages own
CREATE POLICY q_default_select ON questionnaires FOR SELECT TO authenticated
USING (is_default = true OR coach_id = (SELECT auth.uid()));
CREATE POLICY q_coach_all ON questionnaires FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()))
WITH CHECK (coach_id = (SELECT auth.uid()));

CREATE POLICY qq_select ON questionnaire_questions FOR SELECT TO authenticated
USING (questionnaire_id IN (SELECT id FROM questionnaires WHERE is_default = true OR coach_id = (SELECT auth.uid())));
CREATE POLICY qq_coach_all ON questionnaire_questions FOR ALL TO authenticated
USING (questionnaire_id IN (SELECT id FROM questionnaires WHERE coach_id = (SELECT auth.uid())))
WITH CHECK (questionnaire_id IN (SELECT id FROM questionnaires WHERE coach_id = (SELECT auth.uid())));

-- Responses: client manages own; assigned coach reads
CREATE POLICY qr_client_all ON questionnaire_responses FOR ALL TO authenticated
USING (client_id = (SELECT auth.uid()))
WITH CHECK (client_id = (SELECT auth.uid()));
CREATE POLICY qr_coach_select ON questionnaire_responses FOR SELECT TO authenticated
USING (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id));

-- ── Daily lifestyle check-ins ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  checked_date date NOT NULL DEFAULT CURRENT_DATE,
  bowel_movement boolean,
  slept_8h boolean,
  energy int CHECK (energy BETWEEN 1 AND 5),
  water_ok boolean,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, checked_date)
);

ALTER TABLE daily_checkins ENABLE ROW LEVEL SECURITY;
CREATE POLICY dc_client_all ON daily_checkins FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY dc_coach_select ON daily_checkins FOR SELECT TO authenticated
USING (private.is_coach_of(user_id));

CREATE INDEX IF NOT EXISTS idx_daily_checkins_user ON daily_checkins(user_id, checked_date DESC);

-- ── Default 15-question intake set (from Michael's interview practice) ───
INSERT INTO questionnaires (id, coach_id, title, is_default)
VALUES ('11111111-1111-4111-8111-111111111101'::uuid, NULL, 'Standard intake interview', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO questionnaire_questions (questionnaire_id, position, prompt, kind, required)
SELECT '11111111-1111-4111-8111-111111111101'::uuid, q.pos, q.prompt, q.kind, q.req
FROM (VALUES
  (1,  'What is your main goal right now, in your own words?', 'text', true),
  (2,  'Walk me through a typical day of eating over the last month (timings and meals).', 'text', true),
  (3,  'Have you ever had surgery? Which, and when?', 'text', true),
  (4,  'Do you have any metal implants, piercings in the torso area, or medical devices? (These affect bioimpedance measurements.)', 'text', true),
  (5,  'Have you ever been hospitalized? What for?', 'text', false),
  (6,  'Do you take any medication or supplements regularly?', 'text', true),
  (7,  'Any known allergies or food intolerances?', 'text', true),
  (8,  'How is your digestion — do you go to the toilet daily?', 'boolean', true),
  (9,  'How many hours do you usually sleep, and do you wake rested?', 'text', true),
  (10, 'How much water do you drink in a typical day?', 'text', false),
  (11, 'How would you rate your daily energy (1 = exhausted, 5 = great)?', 'scale', true),
  (12, 'What does your physical activity look like in a typical week?', 'text', true),
  (13, 'Which foods do you love, and which will you simply not eat?', 'text', true),
  (14, 'Have you worked with a nutritionist before? What worked and what did not?', 'text', false),
  (15, 'Is there anything about your health or lifestyle you think I should know?', 'text', false)
) AS q(pos, prompt, kind, req)
WHERE NOT EXISTS (
  SELECT 1 FROM questionnaire_questions
  WHERE questionnaire_id = '11111111-1111-4111-8111-111111111101'::uuid
);
