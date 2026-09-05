-- DB-02: authenticated clients need row-scoped DML, not table-wide TRUNCATE.
-- RLS does not constrain TRUNCATE. Revoke only the two confirmed direct grants.
-- Keep REFERENCES/TRIGGER and all DML unchanged. This is a separate release
-- from the authorized rehearsal of 0082 -> 0083 -> 0084; production is held.
REVOKE TRUNCATE ON TABLE public.exercises, public.client_profiles FROM authenticated;
