-- Experimental delta for the disposable CI database ONLY.
-- Not a migration, not registered in the production ledger, not an approval to apply.
-- The guarded CI runner verifies its loopback target before executing this file.
CREATE TABLE private.coach_preference_versions (
  subject_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO private.coach_preference_versions(subject_id)
  SELECT user_id FROM public.client_profiles WHERE user_id IS NOT NULL;

-- A trigger-owned, fixed operation: direct authenticated profile writers cannot
-- access the revision table. The definer can only advance the touched subject.
-- No callable RPC or user-selected identifier/SQL; fixed empty search path.
CREATE FUNCTION private.advance_coach_preference_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.workout_preferences IS NOT DISTINCT FROM OLD.workout_preferences THEN RETURN NEW; END IF;
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO private.coach_preference_versions(subject_id, revision) VALUES (NEW.user_id, 1)
      ON CONFLICT(subject_id) DO UPDATE SET revision = private.coach_preference_versions.revision + 1;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_coach_preference_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_preference_revision AFTER INSERT OR UPDATE OF workout_preferences ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION private.advance_coach_preference_version();

CREATE TABLE private.coach_action_proposals (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  action text NOT NULL CHECK (action = 'preference.update'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  resource_version text NOT NULL,
  envelope jsonb NOT NULL CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 2048),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX coach_action_proposals_actor_expiry ON private.coach_action_proposals(actor_id, expires_at);
CREATE TABLE private.coach_action_receipts (
  id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  action_id uuid NOT NULL,
  proposal_id uuid NOT NULL REFERENCES private.coach_action_proposals(id),
  request_hash text NOT NULL,
  resource_version text NOT NULL,
  result jsonb NOT NULL CHECK (jsonb_typeof(result) = 'object' AND octet_length(result::text) <= 1024),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id, action_id)
);
ALTER TABLE private.coach_preference_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.coach_action_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.coach_action_receipts ENABLE ROW LEVEL SECURITY;
-- All access goes through the server transaction with current authorization.
-- No direct browser/Data API read or write grants; no permissive RLS policy.
REVOKE ALL ON private.coach_preference_versions, private.coach_action_proposals, private.coach_action_receipts FROM PUBLIC, anon, authenticated;
