-- Let a chat participant clean up only their own failed upload.
--
-- Sent attachments remain immutable: DELETE is denied as soon as a messages
-- row references the object path. The owner check also prevents either chat
-- participant from deleting an orphan uploaded by the other participant.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.schemata
    WHERE schema_name = 'storage'
  ) THEN
    RAISE NOTICE 'storage schema absent (plain Postgres) — skipping orphan cleanup policy';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "chat uploader delete orphan" ON storage.objects;
  CREATE POLICY "chat uploader delete orphan" ON storage.objects
    FOR DELETE TO authenticated
    USING (
      bucket_id = 'chat-attachments'
      AND owner_id = (SELECT auth.uid())::text
      AND NOT EXISTS (
        SELECT 1
        FROM public.messages m
        WHERE m.attachment_path = storage.objects.name
      )
    );
END $$;
