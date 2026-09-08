-- Disposable CI experiment ONLY, after coach-durable-actions.sql.
-- Not a productive migration or permission to activate persistent memory.
-- A restrictive policy has no effect with RLS disabled. Reject that baseline
-- before changing anything; the guarded runner must also prove ordinary own-row
-- access so a blanket denial cannot masquerade as namespace protection.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class
      WHERE oid = 'public.memory_chunks'::regclass AND relrowsecurity) THEN
    RAISE EXCEPTION 'memory_rls_baseline_required';
  END IF;
END;
$$;
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_action_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_action_check
  CHECK (action IN ('preference.update', 'food.quantity.update', 'memory.confirm', 'memory.correct', 'memory.delete'));
ALTER TABLE private.coach_action_proposals DROP CONSTRAINT coach_action_proposals_envelope_check;
ALTER TABLE private.coach_action_proposals ADD CONSTRAINT coach_action_proposals_envelope_check
  CHECK (jsonb_typeof(envelope) = 'object' AND octet_length(envelope::text) <= 4096);

CREATE TABLE private.coach_memory_bindings (
  -- Keep a scoped tombstone on memory deletion. Reusing a UUID cannot resurrect
  -- an earlier reviewed proposal; no preference text is stored in this table.
  memory_id uuid PRIMARY KEY,
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  confirmed_text_hash text NOT NULL CHECK (confirmed_text_hash ~ '^[a-f0-9]{64}$'),
  CHECK (actor_id = subject_id)
);
CREATE INDEX coach_memory_bindings_scope ON private.coach_memory_bindings(actor_id, subject_id, organization_id, conversation_id);
ALTER TABLE private.coach_memory_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_memory_bindings FROM PUBLIC, anon, authenticated;

CREATE FUNCTION private.advance_coach_memory_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE private.coach_memory_bindings SET revision = revision + 1 WHERE memory_id = OLD.id;
    RETURN OLD;
  END IF;
  IF TG_OP = 'UPDATE' AND ROW(NEW.fact_text, NEW.source, NEW.fact_type, NEW.scope, NEW.agent_name,
      NEW.session_id, NEW.active, NEW.superseded_by, NEW.expires_at, NEW.user_id)
    IS NOT DISTINCT FROM ROW(OLD.fact_text, OLD.source, OLD.fact_type, OLD.scope, OLD.agent_name,
      OLD.session_id, OLD.active, OLD.superseded_by, OLD.expires_at, OLD.user_id) THEN RETURN NEW; END IF;
  -- Initial confirmation inserts its binding after the new canonical row. An
  -- INSERT with a tombstoned UUID advances the existing revision instead.
  UPDATE private.coach_memory_bindings SET revision = revision + 1 WHERE memory_id = NEW.id;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION private.advance_coach_memory_version() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER coach_memory_revision AFTER INSERT OR UPDATE OR DELETE ON public.memory_chunks
  FOR EACH ROW EXECUTE FUNCTION private.advance_coach_memory_version();

-- Restrictive policies are ANDed with existing grants/permissive policies.
-- USING prevents moving a protected row OUT of the namespace; WITH CHECK
-- prevents inserting/moving an ordinary row INTO it through the Data API.
CREATE POLICY coach_confirmed_memory_private ON public.memory_chunks AS RESTRICTIVE
  FOR ALL TO authenticated, anon
  USING (agent_name IS DISTINCT FROM 'coach-assistant-confirmed')
  WITH CHECK (agent_name IS DISTINCT FROM 'coach-assistant-confirmed');
