-- 0052: chat attachments — photos + voice notes in coach↔client messaging.
--
-- messages gains attachment columns (nullable: text-only messages unchanged).
-- Storage: private bucket 'chat-attachments'; path convention is
--   {coach_id}/{client_id}/{uuid}.{ext}
-- so RLS grants exactly the two conversation participants access (fail-closed,
-- TO authenticated, house style). Reads go through short-lived signed URLs.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_path text,
  ADD COLUMN IF NOT EXISTS attachment_type text,
  ADD COLUMN IF NOT EXISTS attachment_meta jsonb;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_type_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_attachment_type_check
  CHECK (attachment_type IS NULL OR attachment_type IN ('image', 'audio'));

-- A message must carry text, an attachment, or both — never neither.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_body_or_attachment_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_body_or_attachment_check
  CHECK (length(coalesce(body, '')) > 0 OR attachment_path IS NOT NULL);

-- ── Storage bucket + RLS — Supabase environments only ────────────────────────
-- CI bootstraps a PLAIN Postgres (no storage schema); guard so the migrator
-- doesn't explode there. Prod/staging (real Supabase) get the full setup.
-- Path segment 1 = coach_id, segment 2 = client_id: a user may touch an object
-- only when they ARE one of the two participants (uid matches either segment).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    RAISE NOTICE 'storage schema absent (plain Postgres) — skipping bucket/RLS';
    RETURN;
  END IF;

  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES (
    'chat-attachments', 'chat-attachments', false,
    10485760, -- 10 MB
    ARRAY['image/jpeg','image/png','image/webp','image/heic','audio/webm','audio/mp4','audio/mpeg','audio/ogg']
  )
  ON CONFLICT (id) DO UPDATE
    SET file_size_limit = EXCLUDED.file_size_limit,
        allowed_mime_types = EXCLUDED.allowed_mime_types;

  DROP POLICY IF EXISTS "chat participants insert" ON storage.objects;
  CREATE POLICY "chat participants insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'chat-attachments'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[2] = auth.uid()::text
      )
    );

  DROP POLICY IF EXISTS "chat participants select" ON storage.objects;
  CREATE POLICY "chat participants select" ON storage.objects
    FOR SELECT TO authenticated
    USING (
      bucket_id = 'chat-attachments'
      AND (
        (storage.foldername(name))[1] = auth.uid()::text
        OR (storage.foldername(name))[2] = auth.uid()::text
      )
    );
END $$;

-- No UPDATE/DELETE policies: attachments are immutable once sent (audit
-- posture matches messages themselves; GDPR erasure goes through the
-- service-role fulfilment engine, which bypasses RLS).
