-- REVIEW ARTIFACT ONLY. Not a migration and never executed by AG3.
-- AG1 must separately extend the EXISTING private.coach_action_proposals action
-- CHECK to admit 'measurement.create', preserving every previously accepted action.
-- Existing receipts/proposals/authenticated grants/RLS/audit schema stay in force.
-- Install as one isolated transaction, review owner/grants and test native writes.
BEGIN;
LOCK TABLE public.measurements,public.profiles,public.client_profiles,public.organization_members IN SHARE ROW EXCLUSIVE MODE;
CREATE TABLE private.coach_measurement_scope_versions (
 subject_id uuid PRIMARY KEY, -- deliberate tombstone: NO cascading foreign key
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0)
);
ALTER TABLE private.coach_measurement_scope_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_measurement_scope_versions FROM PUBLIC,anon,authenticated;
INSERT INTO private.coach_measurement_scope_versions(subject_id)
 SELECT id FROM public.profiles ON CONFLICT DO NOTHING;

CREATE FUNCTION private.coach_measurement_revision_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'measurement revision tombstones cannot be removed'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.revision<>1 THEN RAISE EXCEPTION 'measurement revision starts at one'; END IF;
 ELSE
  IF NEW.subject_id IS DISTINCT FROM OLD.subject_id OR NEW.revision<>OLD.revision+1 THEN
   RAISE EXCEPTION 'measurement revision must advance exactly once';
  END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.coach_measurement_revision_guard() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_measurement_revision_guard BEFORE INSERT OR UPDATE OR DELETE
 ON private.coach_measurement_scope_versions FOR EACH ROW EXECUTE FUNCTION private.coach_measurement_revision_guard();
CREATE TRIGGER coach_measurement_revision_no_truncate BEFORE TRUNCATE
 ON private.coach_measurement_scope_versions FOR EACH STATEMENT EXECUTE FUNCTION private.coach_measurement_revision_guard();

CREATE FUNCTION private.coach_measurement_bump(subject uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF subject IS NULL THEN RETURN; END IF;
 INSERT INTO private.coach_measurement_scope_versions AS versions(subject_id,revision) VALUES(subject,1)
 ON CONFLICT(subject_id) DO UPDATE SET revision=versions.revision+1;
END $$;
REVOKE ALL ON FUNCTION private.coach_measurement_bump(uuid) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION private.coach_measurement_mutation_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_subject uuid; new_subject uuid; subject uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN old_subject:=OLD.user_id; END IF;
 IF TG_OP<>'DELETE' THEN new_subject:=NEW.user_id; END IF;
 FOR subject IN SELECT DISTINCT s FROM unnest(ARRAY[old_subject,new_subject]) AS subjects(s) WHERE s IS NOT NULL ORDER BY s LOOP
  PERFORM private.coach_measurement_bump(subject);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.coach_measurement_mutation_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_measurement_mutation_revision BEFORE INSERT OR UPDATE OR DELETE
 ON public.measurements FOR EACH ROW EXECUTE FUNCTION private.coach_measurement_mutation_revision();
-- Native TRUNCATE would bypass row revisions. Maintenance must use ordinary DELETE
-- or an explicitly reviewed invalidation procedure; clients get no such capability.
CREATE FUNCTION private.coach_measurement_no_truncate() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'measurement truncate bypasses revision history'; END $$;
REVOKE ALL ON FUNCTION private.coach_measurement_no_truncate() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_measurement_no_truncate BEFORE TRUNCATE ON public.measurements
 FOR EACH STATEMENT EXECUTE FUNCTION private.coach_measurement_no_truncate();

-- Conservative authorization lineage: changing/removing/recreating a profile,
-- client profile or membership invalidates outstanding proposals, including ABA.
CREATE FUNCTION private.coach_measurement_auth_revision() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_subject uuid; new_subject uuid; subject uuid;
BEGIN
 IF TG_TABLE_NAME='profiles' THEN
  IF TG_OP<>'INSERT' THEN old_subject:=OLD.id; END IF;
  IF TG_OP<>'DELETE' THEN new_subject:=NEW.id; END IF;
 ELSE
  IF TG_OP<>'INSERT' THEN old_subject:=OLD.user_id; END IF;
  IF TG_OP<>'DELETE' THEN new_subject:=NEW.user_id; END IF;
 END IF;
 FOR subject IN SELECT DISTINCT s FROM unnest(ARRAY[old_subject,new_subject]) AS subjects(s) WHERE s IS NOT NULL ORDER BY s LOOP
  PERFORM private.coach_measurement_bump(subject);
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
REVOKE ALL ON FUNCTION private.coach_measurement_auth_revision() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER coach_measurement_profile_revision AFTER INSERT OR UPDATE OR DELETE ON public.profiles
 FOR EACH ROW EXECUTE FUNCTION private.coach_measurement_auth_revision();
CREATE TRIGGER coach_measurement_client_revision AFTER INSERT OR UPDATE OR DELETE ON public.client_profiles
 FOR EACH ROW EXECUTE FUNCTION private.coach_measurement_auth_revision();
CREATE TRIGGER coach_measurement_membership_revision AFTER INSERT OR UPDATE OR DELETE ON public.organization_members
 FOR EACH ROW EXECUTE FUNCTION private.coach_measurement_auth_revision();
COMMIT;
