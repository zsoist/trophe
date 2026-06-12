-- Phase 1 coach module: unified coach<->client messaging.
-- Thread = (coach_id, client_id) pair; no separate conversations table.
-- Replaces the WhatsApp/Viber/IG/iMessage channel chaos (Michael 2026-06-12).

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK (sender_role IN ('coach','client')),
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- Coach: full access to threads with their own clients
CREATE POLICY messages_coach_all ON messages FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id))
WITH CHECK (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id) AND sender_role = 'coach');

-- Client: read own thread, send as client, mark coach messages read
CREATE POLICY messages_client_select ON messages FOR SELECT TO authenticated
USING (client_id = (SELECT auth.uid()));
CREATE POLICY messages_client_insert ON messages FOR INSERT TO authenticated
WITH CHECK (client_id = (SELECT auth.uid()) AND sender_role = 'client');
CREATE POLICY messages_client_mark_read ON messages FOR UPDATE TO authenticated
USING (client_id = (SELECT auth.uid()))
WITH CHECK (client_id = (SELECT auth.uid()));

CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(coach_id, client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_client ON messages(client_id, created_at DESC);

-- Realtime for live chat (publication only exists on Supabase, not plain Postgres/CI)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE messages;
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
