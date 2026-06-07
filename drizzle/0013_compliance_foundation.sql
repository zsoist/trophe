CREATE TABLE IF NOT EXISTS consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  version text NOT NULL,
  status text NOT NULL DEFAULT 'granted' CHECK (status IN ('granted', 'withdrawn')),
  evidence jsonb,
  granted_at timestamptz NOT NULL DEFAULT NOW(),
  withdrawn_at timestamptz,
  CONSTRAINT consents_user_purpose_version_key UNIQUE(user_id, purpose, version)
);
CREATE INDEX IF NOT EXISTS idx_consents_user_status ON consents(user_id, status);
CREATE INDEX IF NOT EXISTS idx_consents_org_purpose ON consents(organization_id, purpose);
ALTER TABLE consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY consents_own_select ON consents FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY consents_own_insert ON consents FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY consents_own_update ON consents FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS data_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  request_type text NOT NULL CHECK (request_type IN ('export', 'deletion', 'correction', 'restriction')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'canceled')),
  requested_at timestamptz NOT NULL DEFAULT NOW(),
  due_at timestamptz NOT NULL,
  completed_at timestamptz,
  processed_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  result_uri text,
  notes text,
  metadata jsonb
);
CREATE INDEX IF NOT EXISTS idx_data_requests_user_status ON data_requests(user_id, status);
CREATE INDEX IF NOT EXISTS idx_data_requests_org_status ON data_requests(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_data_requests_due ON data_requests(due_at);
ALTER TABLE data_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY data_requests_own_select ON data_requests FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY data_requests_own_insert ON data_requests FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()) AND status = 'pending');
CREATE POLICY data_requests_admin_select ON data_requests FOR SELECT TO authenticated USING (
  private.is_super_admin()
  OR (organization_id IS NOT NULL AND private.is_admin_of(organization_id))
);
--> statement-breakpoint
CREATE OR REPLACE FUNCTION prevent_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$;
DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation();
