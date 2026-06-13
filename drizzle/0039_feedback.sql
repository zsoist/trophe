-- Beta feedback capture (Daily Nutrafit Step 4 — Closed Professional Beta).
-- Lands the roadmap's three questions: what saves time / what's missing / what
-- would you pay for. One row per submission; `category` tags the question.
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  role text,
  category text NOT NULL CHECK (category IN ('saves_time','missing','would_pay','general')),
  message text NOT NULL,
  would_pay text,
  page_context text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback (user_id);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Users manage (insert/read/update/delete) only their own feedback.
CREATE POLICY "Users manage own feedback" ON feedback
  FOR ALL TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Admins / super_admins can read all feedback (beta review dashboard).
CREATE POLICY "Admins read all feedback" ON feedback
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = (SELECT auth.uid()) AND p.role IN ('admin','super_admin')
  ));
