-- REVIEW ARTIFACT ONLY. AG1 owns schema integration; never executed by AG3.
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
