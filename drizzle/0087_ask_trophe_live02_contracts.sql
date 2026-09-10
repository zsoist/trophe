-- Ask Trophē Live02 reviewed persistence contracts.
-- Promotes the six DB_ISOLATED contracts without changing their SQL behavior.
-- Source order and SHA-256 identities are recorded in db/release/0087_ask_trophe_live02_contracts.sources.
-- Embedded lifecycle comments belong to those immutable source artifacts; this
-- journal entry is the promotion authority, subject to the normal release gates.

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

-- Extension of coach-durable-actions.sql for disposable CI ONLY.
-- Not a migration; no production ledger entry or deployment authorization.
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
  CHECK (action IN ('preference.update', 'food.quantity.update'));
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_envelope_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_envelope_check
  CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 4096);

CREATE TABLE private.coach_food_entry_versions (
  -- Tombstone survives deletion so reusing a food UUID cannot revive a review.
  entry_id uuid PRIMARY KEY,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO private.coach_food_entry_versions(entry_id) SELECT id FROM public.food_log;

-- Every actual row change invalidates a reviewed entry, including manual ABA.
-- Canonical foods nutrient changes are additionally re-derived under lock by
-- the service: an unchanged food_log revision alone is insufficient authority.
CREATE FUNCTION private.advance_coach_food_entry_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    INSERT INTO private.coach_food_entry_versions(entry_id, revision) VALUES (OLD.id, 1)
      ON CONFLICT(entry_id) DO UPDATE SET revision = private.coach_food_entry_versions.revision + 1;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
  INSERT INTO private.coach_food_entry_versions(entry_id, revision) VALUES (NEW.id, 1)
    ON CONFLICT(entry_id) DO UPDATE SET revision = private.coach_food_entry_versions.revision + 1;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_coach_food_entry_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_food_entry_revision AFTER INSERT OR UPDATE OR DELETE ON public.food_log
  FOR EACH ROW EXECUTE FUNCTION private.advance_coach_food_entry_version();
ALTER TABLE private.coach_food_entry_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_food_entry_versions FROM PUBLIC, anon, authenticated;

-- Prepared disposable CI delta; not installed, not a production migration.
-- The guarded hosted harness owns a private synthetic Storage bucket separately.
CREATE TABLE private.coach_attachment_uploads (
  id uuid PRIMARY KEY,
  -- No cascading identity FK: abandoned objects must remain discoverable for
  -- Storage API cleanup even if the account or organization has been removed.
  actor_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  request_id uuid NOT NULL,
  bucket text NOT NULL CHECK (bucket ~ '^coach-attachments-[a-z0-9-]{1,48}$'),
  object_path text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  input_bytes integer NOT NULL CHECK (input_bytes BETWEEN 1 AND 5242880),
  upload_token_hash text NOT NULL CHECK (upload_token_hash ~ '^[a-f0-9]{64}$'),
  source_digest text CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  normalized_digest text CHECK (normalized_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('prepared', 'available', 'removed')),
  metadata jsonb,
  expires_at timestamptz NOT NULL,
  CHECK (actor_id = subject_id),
  CHECK (object_path = organization_id::text || '/' || subject_id::text || '/' || conversation_id::text || '/' || id::text || '.jpg'),
  CHECK (state <> 'available' OR (source_digest IS NOT NULL AND normalized_digest IS NOT NULL AND metadata IS NOT NULL)),
  CHECK (state <> 'removed' OR metadata IS NULL),
  CHECK (metadata IS NULL OR (
    jsonb_typeof(metadata) = 'object'
    AND metadata - ARRAY['mime','bytes','width','height']::text[] = '{}'::jsonb
    AND metadata ?& ARRAY['mime','bytes','width','height']::text[]
    AND metadata->>'mime' = 'image/jpeg'
    AND jsonb_typeof(metadata->'bytes') = 'number'
    AND jsonb_typeof(metadata->'width') = 'number'
    AND jsonb_typeof(metadata->'height') = 'number'
    AND (metadata->>'bytes')::numeric BETWEEN 1 AND 5242880
    AND (metadata->>'bytes')::numeric = trunc((metadata->>'bytes')::numeric)
    AND (metadata->>'width')::numeric BETWEEN 1 AND 16000000
    AND (metadata->>'height')::numeric BETWEEN 1 AND 16000000
    AND (metadata->>'width')::numeric = trunc((metadata->>'width')::numeric)
    AND (metadata->>'height')::numeric = trunc((metadata->>'height')::numeric)
    AND (metadata->>'width')::numeric * (metadata->>'height')::numeric <= 16000000
    AND octet_length(metadata::text) <= 256
  )),
  UNIQUE(actor_id, request_id),
  UNIQUE(bucket, object_path)
);
CREATE INDEX coach_attachment_uploads_expiry ON private.coach_attachment_uploads(bucket, state, expires_at);
CREATE INDEX coach_attachment_uploads_scope ON private.coach_attachment_uploads(actor_id, subject_id, organization_id, conversation_id);
ALTER TABLE private.coach_attachment_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_attachment_uploads FROM PUBLIC, anon, authenticated;
-- Expiry and state transitions are controlled by the authorized service.
-- This delta does not schedule cleanup. The harness must execute the bounded
-- janitor, verify objects were removed through Storage API, and only then remove
-- its exact synthetic ledger rows and private bucket. Never DELETE storage.objects.

-- Disposable CI fixture only; no productive migration or journal entry.
DO $$ BEGIN
 IF NOT coalesce((SELECT relrowsecurity FROM pg_class WHERE oid='public.agent_conversation'::regclass),false) THEN
  RAISE EXCEPTION 'chat_content_rls_required';
 END IF;
END $$;
-- Requires existing memory/attachment private lifecycle contracts and revision triggers.
-- No automatic retention cron is installed. Deletion is explicit and resumable.
CREATE TABLE private.coach_chat_threads (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
 organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
 actor_role text NOT NULL CHECK(actor_role IN ('client','coach','admin','super_admin')),
 request_id uuid NOT NULL, create_hash text NOT NULL CHECK(create_hash ~ '^[a-f0-9]{64}$'),
 title text NOT NULL CHECK(length(title)<=80), created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','cleanup_pending','deleted')),
 access_revoked boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0), next_sequence integer NOT NULL DEFAULT 0 CHECK(next_sequence BETWEEN 0 AND 1000),
 UNIQUE(actor_id,request_id)
);
CREATE INDEX coach_chat_scope_page ON private.coach_chat_threads(actor_id,subject_id,organization_id,actor_role,created_at DESC,id DESC);
CREATE TABLE private.coach_chat_turns (
 thread_id uuid NOT NULL REFERENCES private.coach_chat_threads(id) ON DELETE CASCADE,
 content_id uuid PRIMARY KEY, -- no content FK: erasure retains idempotency/supersedence tombstones
 turn_id uuid NOT NULL, request_id uuid NOT NULL, role text NOT NULL CHECK(role IN ('user','assistant')),
 sequence integer NOT NULL CHECK(sequence>0), revision uuid NOT NULL,
 content_hash text NOT NULL CHECK(content_hash ~ '^[a-f0-9]{64}$'),
 pipeline_version text, current boolean NOT NULL DEFAULT true,
 CHECK((role='user' AND pipeline_version IS NULL) OR (role='assistant' AND pipeline_version='coach-assistant.v2')),
 UNIQUE(thread_id,request_id), UNIQUE(thread_id,sequence)
);
CREATE UNIQUE INDEX coach_chat_user_turn ON private.coach_chat_turns(thread_id,turn_id) WHERE role='user';
CREATE UNIQUE INDEX coach_chat_current_final ON private.coach_chat_turns(thread_id,turn_id) WHERE role='assistant' AND current;
ALTER TABLE private.coach_chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.coach_chat_turns ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_chat_threads,private.coach_chat_turns FROM PUBLIC,anon,authenticated;

-- Authorization-only helper: does not return content. Owner must be a trusted DB
-- owner with access to private tables; no caller-selectable actor or dynamic SQL.
CREATE FUNCTION private.coach_chat_content_visible(content uuid,owner_id uuid,session text,message_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
 SELECT EXISTS(
 SELECT 1 FROM private.coach_chat_turns t JOIN private.coach_chat_threads h ON h.id=t.thread_id
 JOIN public.profiles a ON a.id=h.actor_id JOIN public.profiles s ON s.id=h.subject_id
 JOIN public.client_profiles cp ON cp.user_id=s.id
 JOIN public.organization_members am ON am.user_id=a.id AND am.org_id=h.organization_id
 JOIN public.organization_members sm ON sm.user_id=s.id AND sm.org_id=h.organization_id
 WHERE t.content_id=content AND t.current AND t.role=message_role AND h.id::text=session
 AND h.actor_id=owner_id AND a.id=(SELECT auth.uid()) AND h.state='active' AND NOT h.access_revoked
 AND a.role::text=h.actor_role AND am.role::text=h.actor_role AND s.role::text='client' AND sm.role::text='client'
 AND ((a.id=s.id AND a.role::text='client') OR (a.role::text IN ('coach','admin','super_admin') AND cp.coach_id=a.id)))
$$;
REVOKE ALL ON FUNCTION private.coach_chat_content_visible(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.coach_chat_content_visible(uuid,uuid,text,text) TO authenticated;
CREATE POLICY coach_chat_namespace_guard ON public.agent_conversation AS RESTRICTIVE FOR SELECT TO authenticated
 USING(agent_name<>'coach-assistant-global-v1' OR private.coach_chat_content_visible(id,user_id,session_id,role));
-- Existing own_select remains PERMISSIVE. Other namespaces retain their prior positive access.

-- Freeze authorization lineage: a revoke/reassign/role change cannot be undone by
-- recreating membership with the old UUID or changing a field back (ABA).
CREATE FUNCTION private.coach_chat_revoke_scope() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE old_user uuid; new_user uuid;
BEGIN
 IF TG_TABLE_NAME='organization_members' THEN
  IF TG_OP='UPDATE' AND ROW(OLD.user_id,OLD.org_id,OLD.role) IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.org_id,NEW.role) THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN old_user:=OLD.user_id; END IF;
  IF TG_OP<>'DELETE' THEN new_user:=NEW.user_id; END IF;
 ELSIF TG_TABLE_NAME='profiles' THEN
  IF TG_OP='UPDATE' AND OLD.role IS NOT DISTINCT FROM NEW.role THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN old_user:=OLD.id; END IF;
  IF TG_OP<>'DELETE' THEN new_user:=NEW.id; END IF;
 ELSE
  IF TG_OP='UPDATE' AND ROW(OLD.user_id,OLD.coach_id) IS NOT DISTINCT FROM ROW(NEW.user_id,NEW.coach_id) THEN RETURN NEW; END IF;
  IF TG_OP<>'INSERT' THEN old_user:=OLD.user_id; END IF;
  IF TG_OP<>'DELETE' THEN new_user:=NEW.user_id; END IF;
 END IF;
 UPDATE private.coach_chat_threads SET access_revoked=true,revision=revision+1
 WHERE NOT access_revoked AND (actor_id IN(old_user,new_user) OR subject_id IN(old_user,new_user));
 IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_revoke_scope() FROM PUBLIC;
CREATE TRIGGER coach_chat_membership_revocation AFTER INSERT OR UPDATE OR DELETE ON public.organization_members FOR EACH ROW EXECUTE FUNCTION private.coach_chat_revoke_scope();
CREATE TRIGGER coach_chat_profile_revocation AFTER UPDATE OR DELETE ON public.profiles FOR EACH ROW EXECUTE FUNCTION private.coach_chat_revoke_scope();
CREATE TRIGGER coach_chat_assignment_revocation AFTER UPDATE OR DELETE ON public.client_profiles FOR EACH ROW EXECUTE FUNCTION private.coach_chat_revoke_scope();

CREATE FUNCTION private.coach_chat_thread_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF ROW(NEW.id,NEW.actor_id,NEW.subject_id,NEW.organization_id,NEW.actor_role,NEW.request_id,NEW.create_hash,NEW.created_at) IS DISTINCT FROM ROW(OLD.id,OLD.actor_id,OLD.subject_id,OLD.organization_id,OLD.actor_role,OLD.request_id,OLD.create_hash,OLD.created_at)
 OR NEW.revision<OLD.revision OR NEW.next_sequence<OLD.next_sequence OR (OLD.access_revoked AND NOT NEW.access_revoked)
 OR (OLD.state<>'active' AND NEW.state='active') OR (OLD.state='deleted' AND NEW.state<>'deleted') THEN RAISE EXCEPTION 'immutable_chat_scope'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_thread_immutable() FROM PUBLIC;
CREATE TRIGGER coach_chat_thread_immutable BEFORE UPDATE ON private.coach_chat_threads FOR EACH ROW EXECUTE FUNCTION private.coach_chat_thread_immutable();

-- Final response revisions and supersedence are append-only; old IDs cannot be revived.
CREATE FUNCTION private.coach_chat_turn_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF ROW(NEW.thread_id,NEW.content_id,NEW.turn_id,NEW.request_id,NEW.role,NEW.sequence,NEW.revision,NEW.content_hash,NEW.pipeline_version) IS DISTINCT FROM ROW(OLD.thread_id,OLD.content_id,OLD.turn_id,OLD.request_id,OLD.role,OLD.sequence,OLD.revision,OLD.content_hash,OLD.pipeline_version)
 OR (NOT OLD.current AND NEW.current) THEN RAISE EXCEPTION 'immutable_chat_turn'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_turn_immutable() FROM PUBLIC;
CREATE TRIGGER coach_chat_turn_immutable BEFORE UPDATE ON private.coach_chat_turns FOR EACH ROW EXECUTE FUNCTION private.coach_chat_turn_immutable();
CREATE FUNCTION private.coach_chat_content_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' THEN
  IF OLD.agent_name='coach-assistant-global-v1' OR NEW.agent_name='coach-assistant-global-v1' THEN RAISE EXCEPTION 'immutable_chat_content'; END IF;
 ELSE
  IF NEW.agent_name='coach-assistant-global-v1' AND EXISTS(SELECT 1 FROM private.coach_chat_turns WHERE content_id=NEW.id) THEN RAISE EXCEPTION 'reused_chat_content_identity'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_content_immutable() FROM PUBLIC;
CREATE TRIGGER coach_chat_content_immutable BEFORE INSERT OR UPDATE ON public.agent_conversation FOR EACH ROW EXECUTE FUNCTION private.coach_chat_content_immutable();

-- Existing attachment/proposal writers must not resurrect a deleted/revoked chat.
-- Lock while checking so thread deletion serializes with late attachment updates.
CREATE FUNCTION private.coach_chat_resource_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,pg_temp AS $$
DECLARE h private.coach_chat_threads%ROWTYPE;
BEGIN
 SELECT * INTO h FROM private.coach_chat_threads WHERE id=NEW.conversation_id FOR SHARE;
 IF NOT FOUND THEN RETURN NEW; END IF; -- unrelated legacy namespace is unchanged
 IF TG_TABLE_NAME='coach_attachment_uploads' THEN
  IF NEW.state='removed' THEN RETURN NEW; END IF;
 END IF;
 IF h.state<>'active' OR h.access_revoked OR ROW(h.actor_id,h.subject_id,h.organization_id) IS DISTINCT FROM ROW(NEW.actor_id,NEW.subject_id,NEW.organization_id) THEN RAISE EXCEPTION 'chat_scope_unavailable'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_chat_resource_guard() FROM PUBLIC;
CREATE TRIGGER coach_chat_attachment_guard BEFORE INSERT OR UPDATE ON private.coach_attachment_uploads FOR EACH ROW EXECUTE FUNCTION private.coach_chat_resource_guard();
CREATE TRIGGER coach_chat_proposal_guard BEFORE INSERT OR UPDATE ON private.coach_action_proposals FOR EACH ROW EXECUTE FUNCTION private.coach_chat_resource_guard();

-- Readiness checks are a deployment contract, not proof of all PostgreSQL/RLS behavior.
-- AG1/AG4 must test helper ownership/grants and legacy-positive + revoked-negative REST.
CREATE FUNCTION private.coach_chat_contract_version() RETURNS text LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polname='coach_chat_namespace_guard' AND polrelid='public.agent_conversation'::regclass AND NOT polpermissive)
 AND (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname IN ('coach_chat_membership_revocation','coach_chat_profile_revocation','coach_chat_assignment_revocation','coach_chat_thread_immutable','coach_chat_attachment_guard','coach_chat_proposal_guard','coach_chat_turn_immutable','coach_chat_content_immutable') AND tgenabled<>'D')=8
 THEN 'coach-assistant.chat.v1' ELSE NULL END
$$;
REVOKE ALL ON FUNCTION private.coach_chat_contract_version() FROM PUBLIC,anon,authenticated;

-- Disposable CI extension only. Not a production migration.
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
  CHECK (action IN ('preference.update', 'food.quantity.update', 'food.photo.create'));
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_envelope_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_envelope_check
  CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 8192);

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
