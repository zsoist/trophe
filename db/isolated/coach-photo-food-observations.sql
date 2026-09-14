-- Prepared QA/CI delta only. Not a production migration.
-- The guarded runner owns the surrounding transaction and evidence ledger.
CREATE TABLE private.coach_photo_food_observations (
 id uuid PRIMARY KEY,
 actor_id uuid NOT NULL,
 subject_id uuid NOT NULL,
 organization_id uuid NOT NULL,
 conversation_id uuid NOT NULL,
 attachment_id uuid NOT NULL,
 revision uuid NOT NULL UNIQUE,
 image_digest text NOT NULL CHECK(image_digest ~ '^[a-f0-9]{64}$'),
 generation_id uuid NOT NULL UNIQUE,
 foods jsonb NOT NULL CHECK(jsonb_typeof(foods)='array' AND jsonb_array_length(foods) BETWEEN 1 AND 8),
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(actor_id=subject_id),
 UNIQUE(actor_id,organization_id,conversation_id,attachment_id,revision)
);
CREATE UNIQUE INDEX coach_photo_food_one_active_attachment
 ON private.coach_photo_food_observations(actor_id,organization_id,conversation_id,attachment_id)
 WHERE active;
CREATE INDEX coach_photo_food_generation ON private.coach_photo_food_observations(generation_id);
ALTER TABLE private.coach_photo_food_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_photo_food_observations FROM PUBLIC,anon,authenticated;

-- Retain inactive revisions so reviewed proposals fail CAS after re-analysis.
-- Do not cascade observations when a storage object becomes unavailable; the
-- adapter joins and locks the attachment tombstone and fails closed.
CREATE FUNCTION private.coach_photo_food_observation_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.id<>OLD.id OR NEW.actor_id<>OLD.actor_id OR NEW.subject_id<>OLD.subject_id OR NEW.organization_id<>OLD.organization_id OR NEW.conversation_id<>OLD.conversation_id OR NEW.attachment_id<>OLD.attachment_id OR NEW.revision<>OLD.revision OR NEW.image_digest<>OLD.image_digest OR NEW.generation_id<>OLD.generation_id OR NEW.foods<>OLD.foods OR OLD.active=false OR NEW.active=true THEN RAISE EXCEPTION 'photo food observations are immutable except active true to false'; END IF;
 END IF;
 -- Direct application roles have no grants. Privileged account erasure may
 -- delete rows only after the corresponding private object is confirmed gone.
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.coach_photo_food_observation_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_photo_food_observation_guard BEFORE UPDATE OR DELETE
 ON private.coach_photo_food_observations FOR EACH ROW EXECUTE FUNCTION private.coach_photo_food_observation_guard();

CREATE FUNCTION private.coach_photo_food_no_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'photo food observation history cannot be truncated'; END $$;
REVOKE ALL ON FUNCTION private.coach_photo_food_no_truncate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_photo_food_no_truncate BEFORE TRUNCATE
 ON private.coach_photo_food_observations FOR EACH STATEMENT EXECUTE FUNCTION private.coach_photo_food_no_truncate();

-- Conservative authorization lineage: any client/profile/membership lifecycle
-- change invalidates outstanding observations, including revoke/restore ABA.
CREATE FUNCTION private.coach_photo_food_auth_invalidate() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_user uuid; new_user uuid;
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF TG_OP<>'INSERT' THEN old_user:=OLD.id; END IF;
  IF TG_OP<>'DELETE' THEN new_user:=NEW.id; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN old_user:=OLD.user_id; END IF;
  IF TG_OP<>'DELETE' THEN new_user:=NEW.user_id; END IF;
 END IF;
 UPDATE private.coach_photo_food_observations SET active=false
  WHERE active AND actor_id IN (old_user,new_user);
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.coach_photo_food_auth_invalidate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_photo_food_profile_invalidate AFTER INSERT OR UPDATE OR DELETE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION private.coach_photo_food_auth_invalidate();
CREATE TRIGGER coach_photo_food_client_invalidate AFTER INSERT OR UPDATE OR DELETE ON public.client_profiles
 FOR EACH ROW EXECUTE FUNCTION private.coach_photo_food_auth_invalidate();
CREATE TRIGGER coach_photo_food_membership_invalidate AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
 FOR EACH ROW EXECUTE FUNCTION private.coach_photo_food_auth_invalidate();
