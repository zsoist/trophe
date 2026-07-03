-- 0049_workout_programs.sql
-- Workout program assignment layer (coach → client weekly programming).
--
-- WHY: the workout module had templates and logging but NOTHING linking a
-- template to a client — the "Assign to Client" button wrote to a column that
-- does not exist (client_profiles.current_template_id) with an unchecked error
-- and a false success toast (app/coach/templates/page.tsx). This adds the
-- missing layer:
--   * workout_programs      — one ACTIVE program per client (archived on replace)
--   * workout_program_days  — weekday (0=Sunday … 6=Saturday, JS Date.getDay())
--                             → workout_template, multiple templates per day via sort
--   * clients may SELECT templates referenced by their own program (templates
--     RLS previously allowed only creator or shared=true)
--   * workout_sessions.template_id gains its missing FK (SET NULL on delete)
--
-- Additive only — no existing rows are modified. RLS fail-closed, TO
-- authenticated only, coach access via private.is_coach_of (house style, 0008).

CREATE TABLE "workout_programs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "client_id" uuid NOT NULL,
  "coach_id" uuid NOT NULL,
  "name" text NOT NULL,
  "notes" text,
  "status" text DEFAULT 'active' NOT NULL,
  "starts_on" date,
  "created_at" timestamp with time zone DEFAULT now(),
  "updated_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "workout_programs_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text])),
  CONSTRAINT "workout_programs_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE,
  CONSTRAINT "workout_programs_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id")
);

CREATE INDEX "idx_workout_programs_client" ON "workout_programs" ("client_id", "status");

-- One ACTIVE program per client: assigning a new one archives the old first.
CREATE UNIQUE INDEX "uq_workout_programs_active_client" ON "workout_programs" ("client_id") WHERE (status = 'active');

CREATE TABLE "workout_program_days" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "program_id" uuid NOT NULL,
  "weekday" smallint NOT NULL,
  "template_id" uuid NOT NULL,
  "sort" smallint DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now(),
  CONSTRAINT "workout_program_days_weekday_check" CHECK (weekday >= 0 AND weekday <= 6),
  CONSTRAINT "workout_program_days_unique" UNIQUE ("program_id", "weekday", "template_id"),
  CONSTRAINT "workout_program_days_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "public"."workout_programs"("id") ON DELETE CASCADE,
  CONSTRAINT "workout_program_days_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE CASCADE
);

CREATE INDEX "idx_workout_program_days_program" ON "workout_program_days" ("program_id", "weekday");

ALTER TABLE "workout_programs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "workout_program_days" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Clients see own programs" ON "workout_programs"
  FOR SELECT TO authenticated
  USING (client_id = auth.uid());

CREATE POLICY "Coaches manage client programs" ON "workout_programs"
  FOR ALL TO authenticated
  USING (private.is_coach_of(client_id))
  WITH CHECK (private.is_coach_of(client_id) AND coach_id = auth.uid());

CREATE POLICY "Clients see own program days" ON "workout_program_days"
  FOR SELECT TO authenticated
  USING (program_id IN (SELECT id FROM workout_programs WHERE client_id = auth.uid()));

CREATE POLICY "Coaches manage client program days" ON "workout_program_days"
  FOR ALL TO authenticated
  USING (program_id IN (SELECT id FROM workout_programs WHERE private.is_coach_of(client_id)))
  WITH CHECK (program_id IN (SELECT id FROM workout_programs WHERE private.is_coach_of(client_id)));

-- Clients may read templates referenced by their own program.
CREATE POLICY "Clients see templates in own program" ON "workout_templates"
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT d.template_id
    FROM workout_program_days d
    JOIN workout_programs p ON p.id = d.program_id
    WHERE p.client_id = auth.uid()
  ));

-- Missing FK from the original schema: sessions.template_id had no constraint
-- and was never written. All 60 existing rows have template_id NULL — safe.
ALTER TABLE "workout_sessions"
  ADD CONSTRAINT "workout_sessions_template_id_fkey"
  FOREIGN KEY ("template_id") REFERENCES "public"."workout_templates"("id") ON DELETE SET NULL;
