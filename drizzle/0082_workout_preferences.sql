-- Versioned, user-editable workout preferences. The existing client_profiles
-- SELECT and UPDATE RLS policies already constrain both the current and
-- resulting row to the client or their assigned coach.
ALTER TABLE public.client_profiles
  ADD COLUMN workout_preferences jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.client_profiles
  ADD CONSTRAINT client_profiles_workout_preferences_object_check
  CHECK (jsonb_typeof(workout_preferences) = 'object');
