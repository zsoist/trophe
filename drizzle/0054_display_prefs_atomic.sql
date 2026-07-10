-- 0054: atomic per-key write for profiles.display_prefs (bug hunt).
--
-- The appearance provider and the coach dashboard both persist into the SAME
-- display_prefs jsonb via read-modify-write of the WHOLE column. Two concurrent
-- writers (second tab, or coach panel prefs saved alongside a client's accent)
-- clobber each other last-writer-wins. This RPC does an atomic jsonb_set on ONE
-- key, so writers to different keys never lose each other's data.
--
-- SECURITY DEFINER + hard-coded auth.uid() target: a caller can only ever
-- mutate their OWN row, and only the named top-level key.

CREATE OR REPLACE FUNCTION public.set_display_prefs_key(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  UPDATE public.profiles
    SET display_prefs = jsonb_set(coalesce(display_prefs, '{}'::jsonb), ARRAY[p_key], p_value, true)
  WHERE id = auth.uid();
END $$;

REVOKE ALL ON FUNCTION public.set_display_prefs_key(text, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.set_display_prefs_key(text, jsonb) TO authenticated;
