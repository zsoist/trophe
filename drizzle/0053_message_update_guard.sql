-- 0053: close two chat security holes found by the 2026-07-09 bug hunt.
--
-- (A) CRITICAL — messages_client_mark_read (0026) let a client UPDATE ANY
--     column of any message in their thread, not just read_at. A client could
--     PATCH a coach's message body/sender_role → forged coaching advice, or
--     re-point coach_id to inject into another coach's inbox. WITH CHECK can't
--     express column immutability, so a BEFORE UPDATE trigger enforces it: when
--     the actor is the client (not the coach), only read_at may change.
--
-- (B) MEDIUM — chat-attachments INSERT policy (0052) authorized uploads to any
--     path whose first/second segment equals the uploader's uid, with no proof
--     that the coach↔client pair is real. Tighten to require an actual
--     relationship (private.is_coach_of covers both directions).

-- ── (A) message column-immutability guard ──────────────────────────────────
CREATE OR REPLACE FUNCTION private.messages_guard_client_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Client acting (is the client of the row and NOT its coach): freeze all
  -- columns except read_at. Coach updates (messages_coach_all) are untouched.
  IF auth.uid() = OLD.client_id AND auth.uid() IS DISTINCT FROM OLD.coach_id THEN
    IF NEW.body            IS DISTINCT FROM OLD.body
    OR NEW.sender_role     IS DISTINCT FROM OLD.sender_role
    OR NEW.coach_id        IS DISTINCT FROM OLD.coach_id
    OR NEW.client_id       IS DISTINCT FROM OLD.client_id
    OR NEW.created_at      IS DISTINCT FROM OLD.created_at
    OR NEW.attachment_path IS DISTINCT FROM OLD.attachment_path
    OR NEW.attachment_type IS DISTINCT FROM OLD.attachment_type
    OR NEW.attachment_meta IS DISTINCT FROM OLD.attachment_meta THEN
      RAISE EXCEPTION 'clients may only update read_at on messages';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS messages_guard_client_update ON public.messages;
CREATE TRIGGER messages_guard_client_update
  BEFORE UPDATE ON public.messages
  FOR EACH ROW EXECUTE FUNCTION private.messages_guard_client_update();

-- ── (B) tighten chat-attachments INSERT to a real relationship ──────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    RAISE NOTICE 'storage schema absent (plain Postgres) — skipping policy tighten';
    RETURN;
  END IF;

  DROP POLICY IF EXISTS "chat participants insert" ON storage.objects;
  CREATE POLICY "chat participants insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
      bucket_id = 'chat-attachments'
      AND (
        -- coach uploading into {me}/{a client I coach}/...
        ((storage.foldername(name))[1] = auth.uid()::text
          AND private.is_coach_of((storage.foldername(name))[2]::uuid))
        -- client uploading into {their coach}/{me}/...
        OR ((storage.foldername(name))[2] = auth.uid()::text
          AND EXISTS (
            SELECT 1 FROM public.client_profiles cp
            WHERE cp.user_id = auth.uid()
              AND cp.coach_id = (storage.foldername(name))[1]::uuid
          ))
      )
    );
END $$;
