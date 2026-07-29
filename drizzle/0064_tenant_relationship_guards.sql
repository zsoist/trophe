DROP POLICY IF EXISTS messages_client_insert ON public.messages;
CREATE POLICY messages_client_insert ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    client_id = (SELECT auth.uid())
    AND sender_role = 'client'
    AND EXISTS (
      SELECT 1
      FROM public.client_profiles cp
      WHERE cp.user_id = (SELECT auth.uid())
        AND cp.coach_id = messages.coach_id
    )
  );

CREATE OR REPLACE FUNCTION private.appointments_guard_client_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
BEGIN
  IF (SELECT auth.uid()) = OLD.client_id
     AND (SELECT auth.uid()) IS DISTINCT FROM OLD.coach_id THEN
    IF OLD.status IS DISTINCT FROM 'booked'
       OR NEW.status IS DISTINCT FROM 'cancelled' THEN
      RAISE EXCEPTION 'clients may only cancel booked appointments';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.coach_id IS DISTINCT FROM OLD.coach_id
       OR NEW.client_id IS DISTINCT FROM OLD.client_id
       OR NEW.starts_at IS DISTINCT FROM OLD.starts_at
       OR NEW.duration_min IS DISTINCT FROM OLD.duration_min
       OR NEW.kind IS DISTINCT FROM OLD.kind
       OR NEW.note IS DISTINCT FROM OLD.note
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'clients cannot change appointment details while cancelling';
    END IF;

    NEW.cancelled_by := 'client';
    NEW.cancelled_at := statement_timestamp();
    NEW.late_cancellation := OLD.starts_at < statement_timestamp() + interval '24 hours';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS appointments_guard_client_cancel ON public.appointments;
CREATE TRIGGER appointments_guard_client_cancel
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION private.appointments_guard_client_cancel();
