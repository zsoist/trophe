-- Disposable CI extension only. Not a migration or production activation.
-- The guarded runner snapshots and restores the shared ledger constraint.
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
  CHECK (action IN ('preference.update', 'chat.message.send'));
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_envelope_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_envelope_check
  CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 4096);

CREATE TABLE private.coach_chat_recipient_versions (
  -- No foreign key: deletion and recreation must not revive an old review.
  subject_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)
);
ALTER TABLE private.coach_chat_recipient_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_chat_recipient_versions FROM PUBLIC, anon, authenticated;
INSERT INTO private.coach_chat_recipient_versions(subject_id)
  SELECT user_id FROM public.client_profiles WHERE user_id IS NOT NULL
  ON CONFLICT DO NOTHING;

CREATE FUNCTION private.coach_chat_recipient_bump(subject uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF subject IS NULL THEN RETURN; END IF;
  INSERT INTO private.coach_chat_recipient_versions AS versions(subject_id, revision)
    VALUES(subject, 1)
    ON CONFLICT(subject_id) DO UPDATE SET revision = versions.revision + 1;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_recipient_bump(uuid) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.coach_chat_recipient_profile_row() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  IF TG_OP IN ('UPDATE', 'DELETE') THEN PERFORM private.coach_chat_recipient_bump(OLD.user_id); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    PERFORM private.coach_chat_recipient_bump(NEW.user_id);
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_recipient_profile_row() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_chat_recipient_profile_row AFTER INSERT OR UPDATE OR DELETE ON public.client_profiles
  FOR EACH ROW EXECUTE FUNCTION private.coach_chat_recipient_profile_row();

CREATE FUNCTION private.coach_chat_recipient_identity() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE touched uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.full_name IS NOT DISTINCT FROM OLD.full_name AND NEW.role IS NOT DISTINCT FROM OLD.role THEN RETURN NEW; END IF;
  FOR touched IN
    SELECT cp.user_id FROM public.client_profiles cp
    WHERE cp.user_id = OLD.id OR cp.coach_id = OLD.id
  LOOP PERFORM private.coach_chat_recipient_bump(touched); END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_recipient_identity() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_chat_recipient_identity AFTER UPDATE OF full_name, role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION private.coach_chat_recipient_identity();

CREATE FUNCTION private.coach_chat_recipient_membership() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE touched uuid; old_user uuid; new_user uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  old_user := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN OLD.user_id ELSE NULL END;
  new_user := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN NEW.user_id ELSE NULL END;
  FOR touched IN
    SELECT DISTINCT cp.user_id FROM public.client_profiles cp
    WHERE cp.user_id IN (old_user, new_user) OR cp.coach_id IN (old_user, new_user)
  LOOP PERFORM private.coach_chat_recipient_bump(touched); END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_recipient_membership() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_chat_recipient_membership AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION private.coach_chat_recipient_membership();
