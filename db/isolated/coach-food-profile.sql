-- Disposable CI schema only; NOT a productive migration or journal entry.
-- The test runner must enforce its exact loopback target before execution.
ALTER TABLE public.client_profiles ADD COLUMN food_preferences jsonb NOT NULL
  DEFAULT '{"version":1,"dietPattern":null}'::jsonb;
ALTER TABLE public.client_profiles ADD CONSTRAINT client_profiles_food_preferences_check
  CHECK (COALESCE(
    jsonb_typeof(food_preferences) = 'object'
    AND food_preferences ?& ARRAY['version', 'dietPattern']
    AND food_preferences - ARRAY['version', 'dietPattern'] = '{}'::jsonb
    AND food_preferences->'version' = '1'::jsonb
    AND (food_preferences->'dietPattern' = 'null'::jsonb
      OR food_preferences->'dietPattern' IN ('"omnivore"'::jsonb, '"vegetarian"'::jsonb, '"vegan"'::jsonb, '"pescatarian"'::jsonb))
  , false));
