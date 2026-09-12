-- Durable terminal state for exact-ID recovery of uncertain Coach turns.
-- The state is server-owned and monotonic; elapsed client time is never treated
-- as proof that a provider run failed.
ALTER TABLE private.coach_chat_turns ADD COLUMN outcome text;

UPDATE private.coach_chat_turns t
SET outcome = CASE
  WHEN t.role = 'assistant' THEN 'settled'
  WHEN EXISTS (
    SELECT 1 FROM private.coach_chat_turns a
    WHERE a.thread_id = t.thread_id
      AND a.turn_id = t.turn_id
      AND a.role = 'assistant'
      AND a.current
  ) THEN 'settled'
  ELSE 'inflight'
END;

ALTER TABLE private.coach_chat_turns ALTER COLUMN outcome SET NOT NULL;
ALTER TABLE private.coach_chat_turns ADD CONSTRAINT coach_chat_turn_outcome_check
  CHECK (
    (role = 'user' AND outcome IN ('inflight', 'failed', 'settled'))
    OR (role = 'assistant' AND outcome = 'settled')
  );

-- Preserve the original immutable identity and supersedence rules while
-- allowing only inflight -> failed/settled for the canonical user claim.
CREATE OR REPLACE FUNCTION private.coach_chat_turn_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,pg_temp AS $$
BEGIN
 IF ROW(NEW.thread_id,NEW.content_id,NEW.turn_id,NEW.request_id,NEW.role,NEW.sequence,NEW.revision,NEW.content_hash,NEW.pipeline_version) IS DISTINCT FROM ROW(OLD.thread_id,OLD.content_id,OLD.turn_id,OLD.request_id,OLD.role,OLD.sequence,OLD.revision,OLD.content_hash,OLD.pipeline_version)
 OR (NOT OLD.current AND NEW.current)
 OR (OLD.outcome IS DISTINCT FROM NEW.outcome AND NOT (OLD.role='user' AND OLD.outcome='inflight' AND NEW.outcome IN ('failed','settled')))
 THEN RAISE EXCEPTION 'immutable_chat_turn'; END IF;
 RETURN NEW;
END $$;

-- Keep the existing browser-safe contract version, but do not report it ready
-- unless the recovery state required by that contract is installed.
CREATE OR REPLACE FUNCTION private.coach_chat_contract_version() RETURNS text
LANGUAGE sql STABLE SET search_path=pg_catalog,pg_temp AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM pg_catalog.pg_policy WHERE polname='coach_chat_namespace_guard' AND polrelid='public.agent_conversation'::regclass AND NOT polpermissive)
 AND EXISTS(SELECT 1 FROM pg_catalog.pg_attribute WHERE attrelid='private.coach_chat_turns'::regclass AND attname='outcome' AND attnotnull AND NOT attisdropped)
 AND (SELECT count(*) FROM pg_catalog.pg_trigger WHERE tgname IN ('coach_chat_membership_revocation','coach_chat_profile_revocation','coach_chat_assignment_revocation','coach_chat_thread_immutable','coach_chat_attachment_guard','coach_chat_proposal_guard','coach_chat_turn_immutable','coach_chat_content_immutable') AND tgenabled<>'D')=8
 THEN 'coach-assistant.chat.v1' ELSE NULL END
$$;
