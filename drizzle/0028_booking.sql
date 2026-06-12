-- Phase 3 coach module: calendar & booking (Nutrafit MVP core item).
-- Coach availability windows + vacation blocks; client-bookable appointments
-- with a 24h cancellation policy and pre-appointment instructions.

CREATE TABLE IF NOT EXISTS coach_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  -- Weekly recurring window (Mon=0 … Sun=6), local coach time
  day_of_week int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_minute int NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute int NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  active boolean NOT NULL DEFAULT true,
  CHECK (end_minute > start_minute)
);

CREATE TABLE IF NOT EXISTS coach_time_off (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  reason text,
  CHECK (ends_on >= starts_on)
);

CREATE TABLE IF NOT EXISTS appointments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  duration_min int NOT NULL DEFAULT 30 CHECK (duration_min BETWEEN 10 AND 240),
  kind text NOT NULL DEFAULT 'office' CHECK (kind IN ('office','call','video')),
  status text NOT NULL DEFAULT 'booked' CHECK (status IN ('booked','completed','cancelled','no_show')),
  cancelled_by text CHECK (cancelled_by IN ('coach','client')),
  cancelled_at timestamptz,
  late_cancellation boolean NOT NULL DEFAULT false,  -- < 24h before start
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE coach_availability ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_time_off ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

-- Availability: coach manages own; their clients can read it to book
CREATE POLICY avail_coach_all ON coach_availability FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()))
WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY avail_client_select ON coach_availability FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.user_id = (SELECT auth.uid()) AND cp.coach_id = coach_availability.coach_id));

CREATE POLICY timeoff_coach_all ON coach_time_off FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()))
WITH CHECK (coach_id = (SELECT auth.uid()));
CREATE POLICY timeoff_client_select ON coach_time_off FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.user_id = (SELECT auth.uid()) AND cp.coach_id = coach_time_off.coach_id));

-- Appointments: coach full control over own; client books/sees/cancels own
CREATE POLICY appt_coach_all ON appointments FOR ALL TO authenticated
USING (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id))
WITH CHECK (coach_id = (SELECT auth.uid()) AND private.is_coach_of(client_id));
CREATE POLICY appt_client_select ON appointments FOR SELECT TO authenticated
USING (client_id = (SELECT auth.uid()));
CREATE POLICY appt_client_insert ON appointments FOR INSERT TO authenticated
WITH CHECK (
  client_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM client_profiles cp WHERE cp.user_id = (SELECT auth.uid()) AND cp.coach_id = appointments.coach_id)
  AND status = 'booked'
);
CREATE POLICY appt_client_cancel ON appointments FOR UPDATE TO authenticated
USING (client_id = (SELECT auth.uid()))
WITH CHECK (client_id = (SELECT auth.uid()) AND status = 'cancelled' AND cancelled_by = 'client');

CREATE INDEX IF NOT EXISTS idx_appointments_coach_time ON appointments(coach_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_appointments_client ON appointments(client_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS idx_avail_coach ON coach_availability(coach_id, day_of_week);

-- Prevent double-booking the same coach slot (exact start time)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_appt_coach_slot
  ON appointments(coach_id, starts_at) WHERE status = 'booked';
