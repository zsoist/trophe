-- Coach→client invitation (plan B1). Coach generates a shareable activation link;
-- client activates via /activate?token=, gets linked to the coach + Art.9 consent.
CREATE TABLE IF NOT EXISTS client_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_email text,
  client_name text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
  accepted_user_id uuid,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '14 days',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_client_invites_coach ON client_invites (coach_id);
CREATE INDEX IF NOT EXISTS idx_client_invites_token ON client_invites (token);
ALTER TABLE client_invites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach manages own invites" ON client_invites
  FOR ALL TO authenticated USING (coach_id = (SELECT auth.uid())) WITH CHECK (coach_id = (SELECT auth.uid()));
