-- Beta invite-code coach onboarding (latency-mvp-plan B1). Lets nutritionists
-- self-onboard as coaches via a code instead of manual DB promotion. Role comes
-- from the validated code record server-side — never from client input.
CREATE TABLE IF NOT EXISTS beta_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'coach' CHECK (role IN ('coach','admin')),
  max_uses int NOT NULL DEFAULT 1 CHECK (max_uses >= 1),
  used_count int NOT NULL DEFAULT 0,
  cohort text,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE beta_invite_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invite codes super admin read" ON beta_invite_codes
  FOR SELECT TO authenticated USING ((SELECT private.is_super_admin()));
INSERT INTO beta_invite_codes (code, role, max_uses, cohort)
VALUES ('TROPHE-COACH-MK', 'coach', 1, 'greece-wave-1')
ON CONFLICT (code) DO NOTHING;
