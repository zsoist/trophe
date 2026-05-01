-- Current sql file was generated after introspecting the database
-- If you want to run this migration please uncomment this code before executing migrations
/*
CREATE SCHEMA "auth";
--> statement-breakpoint
CREATE TABLE "auth"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"raw_app_meta_data" jsonb DEFAULT '{}'::jsonb,
	"raw_user_meta_data" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "form_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"exercise_id" uuid,
	"session_id" uuid,
	"side" text DEFAULT 'right',
	"reps_analyzed" integer DEFAULT 0,
	"overall_score" real,
	"overall_assessment" text,
	"per_rep_scores" jsonb,
	"reference_comparison" jsonb,
	"analyzed_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "form_analyses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid,
	"name_en" text NOT NULL,
	"name_es" text,
	"name_el" text,
	"description_en" text,
	"description_es" text,
	"description_el" text,
	"emoji" text DEFAULT '🎯',
	"category" text,
	"difficulty" text DEFAULT 'beginner',
	"target_value" real,
	"target_unit" text,
	"cycle_days" integer DEFAULT 14,
	"suggested_order" integer,
	"is_template" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "habits_category_check" CHECK (category = ANY (ARRAY['nutrition'::text, 'hydration'::text, 'movement'::text, 'sleep'::text, 'mindset'::text, 'recovery'::text])),
	CONSTRAINT "habits_difficulty_check" CHECK (difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))
);
--> statement-breakpoint
ALTER TABLE "habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"coach_id" uuid,
	"age" integer,
	"sex" text,
	"height_cm" real,
	"weight_kg" real,
	"body_fat_pct" real,
	"activity_level" text,
	"goal" text,
	"bmr" real,
	"tdee" real,
	"target_calories" integer,
	"target_protein_g" integer,
	"target_carbs_g" integer,
	"target_fat_g" integer,
	"target_fiber_g" integer,
	"target_water_ml" integer,
	"current_habit_id" uuid,
	"coaching_phase" text DEFAULT 'onboarding',
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "client_profiles_user_id_key" UNIQUE("user_id"),
	CONSTRAINT "client_profiles_activity_level_check" CHECK (activity_level = ANY (ARRAY['sedentary'::text, 'light'::text, 'moderate'::text, 'active'::text, 'very_active'::text])),
	CONSTRAINT "client_profiles_coaching_phase_check" CHECK (coaching_phase = ANY (ARRAY['onboarding'::text, 'active'::text, 'maintenance'::text])),
	CONSTRAINT "client_profiles_goal_check" CHECK (goal = ANY (ARRAY['fat_loss'::text, 'muscle_gain'::text, 'maintenance'::text, 'recomp'::text, 'endurance'::text, 'health'::text])),
	CONSTRAINT "client_profiles_sex_check" CHECK (sex = ANY (ARRAY['male'::text, 'female'::text]))
);
--> statement-breakpoint
ALTER TABLE "client_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'client' NOT NULL,
	"avatar_url" text,
	"language" text DEFAULT 'en',
	"timezone" text DEFAULT 'UTC',
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "profiles_language_check" CHECK (language = ANY (ARRAY['en'::text, 'es'::text, 'el'::text])),
	CONSTRAINT "profiles_role_check" CHECK (role = ANY (ARRAY['client'::text, 'coach'::text, 'both'::text]))
);
--> statement-breakpoint
ALTER TABLE "profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"habit_id" uuid,
	"assigned_by" uuid,
	"status" text DEFAULT 'active',
	"started_at" timestamp with time zone DEFAULT now(),
	"completed_at" timestamp with time zone,
	"current_streak" integer DEFAULT 0,
	"best_streak" integer DEFAULT 0,
	"total_completions" integer DEFAULT 0,
	"sequence_number" integer DEFAULT 1,
	"coach_note" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "client_habits_status_check" CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text, 'skipped'::text]))
);
--> statement-breakpoint
ALTER TABLE "client_habits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "food_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"logged_date" date DEFAULT CURRENT_DATE NOT NULL,
	"meal_type" text,
	"food_name" text NOT NULL,
	"quantity" real DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'serving',
	"calories" integer,
	"protein_g" real,
	"carbs_g" real,
	"fat_g" real,
	"fiber_g" real,
	"source" text,
	"source_id" text,
	"photo_url" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "food_log_meal_type_check" CHECK (meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'pre_workout'::text, 'post_workout'::text])),
	CONSTRAINT "food_log_source_check" CHECK (source = ANY (ARRAY['usda'::text, 'openfoodfacts'::text, 'custom'::text, 'photo_ai'::text, 'natural_language'::text, 'ai_estimate'::text]))
);
--> statement-breakpoint
ALTER TABLE "food_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "water_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"logged_date" date DEFAULT CURRENT_DATE NOT NULL,
	"amount_ml" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "water_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplement_protocols" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid,
	"name" text NOT NULL,
	"description" text,
	"supplements" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"goal" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "supplement_protocols" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "supplement_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"supplement_name" text NOT NULL,
	"taken" boolean DEFAULT true,
	"logged_date" date DEFAULT CURRENT_DATE NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "supplement_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "api_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"endpoint" text NOT NULL,
	"model" text NOT NULL,
	"provider" text,
	"tokens_in" integer DEFAULT 0,
	"tokens_out" integer DEFAULT 0,
	"cost_usd" real DEFAULT 0,
	"latency_ms" integer DEFAULT 0,
	"user_id" uuid,
	"success" boolean DEFAULT true,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "api_usage_log_provider_check" CHECK (provider = ANY (ARRAY['anthropic'::text, 'gemini'::text]))
);
--> statement-breakpoint
CREATE TABLE "coach_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"coach_id" uuid,
	"client_id" uuid,
	"note" text NOT NULL,
	"session_type" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "coach_notes_session_type_check" CHECK (session_type = ANY (ARRAY['check_in'::text, 'progression'::text, 'concern'::text, 'general'::text]))
);
--> statement-breakpoint
ALTER TABLE "coach_notes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_supplements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"protocol_id" uuid,
	"assigned_by" uuid,
	"active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "client_supplements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "habit_checkins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_habit_id" uuid,
	"user_id" uuid,
	"checked_date" date DEFAULT CURRENT_DATE NOT NULL,
	"completed" boolean NOT NULL,
	"value" real,
	"note" text,
	"mood" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "habit_checkins_client_habit_id_checked_date_key" UNIQUE("client_habit_id","checked_date"),
	CONSTRAINT "habit_checkins_mood_check" CHECK (mood = ANY (ARRAY['great'::text, 'good'::text, 'okay'::text, 'tough'::text, 'struggled'::text]))
);
--> statement-breakpoint
ALTER TABLE "habit_checkins" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "custom_foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"calories" integer,
	"protein_g" real,
	"carbs_g" real,
	"fat_g" real,
	"fiber_g" real,
	"unit" text DEFAULT '100g',
	"category" text,
	"shared" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "custom_foods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"measured_date" date DEFAULT CURRENT_DATE NOT NULL,
	"weight_kg" real,
	"body_fat_pct" real,
	"waist_cm" real,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "measurements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "food_database" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_el" text,
	"name_es" text,
	"calories_per_100g" real NOT NULL,
	"protein_per_100g" real NOT NULL,
	"carbs_per_100g" real NOT NULL,
	"fat_per_100g" real NOT NULL,
	"fiber_per_100g" real DEFAULT 0,
	"default_serving_grams" real DEFAULT 100,
	"default_serving_unit" text DEFAULT '100g',
	"common_units" jsonb DEFAULT '[]'::jsonb,
	"category" text,
	"source" text,
	"source_id" text,
	"popularity" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "food_database_name_source_key" UNIQUE("name","source"),
	CONSTRAINT "food_database_source_check" CHECK (source = ANY (ARRAY['seed'::text, 'usda'::text, 'openfoodfacts'::text, 'coach'::text]))
);
--> statement-breakpoint
ALTER TABLE "food_database" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_sets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"exercise_id" uuid,
	"set_number" integer NOT NULL,
	"weight_kg" real,
	"reps" integer,
	"rpe" real,
	"is_warmup" boolean DEFAULT false,
	"is_pr" boolean DEFAULT false,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workout_sets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by" uuid,
	"name" text NOT NULL,
	"description" text,
	"target_muscles" text[],
	"exercises" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"day_label" text,
	"difficulty" text DEFAULT 'intermediate',
	"shared" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "workout_templates_difficulty_check" CHECK (difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text]))
);
--> statement-breakpoint
ALTER TABLE "workout_templates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "exercises" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"name_es" text,
	"name_el" text,
	"muscle_group" text NOT NULL,
	"secondary_muscles" text[],
	"equipment" text,
	"is_compound" boolean DEFAULT false,
	"is_template" boolean DEFAULT true,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "exercises_muscle_group_check" CHECK (muscle_group = ANY (ARRAY['chest'::text, 'back'::text, 'shoulders'::text, 'biceps'::text, 'triceps'::text, 'forearms'::text, 'quads'::text, 'hamstrings'::text, 'glutes'::text, 'calves'::text, 'core'::text, 'full_body'::text, 'cardio'::text]))
);
--> statement-breakpoint
ALTER TABLE "exercises" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "workout_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"session_date" date DEFAULT CURRENT_DATE NOT NULL,
	"name" text,
	"template_id" uuid,
	"duration_minutes" integer,
	"notes" text,
	"pain_flags" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "workout_sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "form_analyses" ADD CONSTRAINT "form_analyses_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_analyses" ADD CONSTRAINT "form_analyses_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_analyses" ADD CONSTRAINT "form_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_profiles" ADD CONSTRAINT "client_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_habits" ADD CONSTRAINT "client_habits_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_habits" ADD CONSTRAINT "client_habits_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_habits" ADD CONSTRAINT "client_habits_habit_id_fkey" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "food_log" ADD CONSTRAINT "food_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "water_log" ADD CONSTRAINT "water_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_protocols" ADD CONSTRAINT "supplement_protocols_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplement_log" ADD CONSTRAINT "supplement_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_usage_log" ADD CONSTRAINT "api_usage_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_notes" ADD CONSTRAINT "coach_notes_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_supplements" ADD CONSTRAINT "client_supplements_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_supplements" ADD CONSTRAINT "client_supplements_protocol_id_fkey" FOREIGN KEY ("protocol_id") REFERENCES "public"."supplement_protocols"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_supplements" ADD CONSTRAINT "client_supplements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_client_habit_id_fkey" FOREIGN KEY ("client_habit_id") REFERENCES "public"."client_habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_checkins" ADD CONSTRAINT "habit_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_foods" ADD CONSTRAINT "custom_foods_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measurements" ADD CONSTRAINT "measurements_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_exercise_id_fkey" FOREIGN KEY ("exercise_id") REFERENCES "public"."exercises"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sets" ADD CONSTRAINT "workout_sets_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."workout_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_templates" ADD CONSTRAINT "workout_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exercises" ADD CONSTRAINT "exercises_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout_sessions" ADD CONSTRAINT "workout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_form_analyses_user" ON "form_analyses" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_client_profiles_coach" ON "client_profiles" USING btree ("coach_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_client_profiles_user" ON "client_profiles" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_client_habits_client" ON "client_habits" USING btree ("client_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_client_habits_status" ON "client_habits" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "idx_food_log_user_date" ON "food_log" USING btree ("user_id" date_ops,"logged_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_water_log_user_date" ON "water_log" USING btree ("user_id" date_ops,"logged_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_supplement_log_user_date" ON "supplement_log" USING btree ("user_id" date_ops,"logged_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_api_usage_created" ON "api_usage_log" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "idx_api_usage_endpoint" ON "api_usage_log" USING btree ("endpoint" text_ops);--> statement-breakpoint
CREATE INDEX "idx_coach_notes_client" ON "coach_notes" USING btree ("client_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_habit_checkins_date" ON "habit_checkins" USING btree ("checked_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_habit_checkins_user" ON "habit_checkins" USING btree ("user_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_measurements_user_date" ON "measurements" USING btree ("user_id" date_ops,"measured_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_food_db_name" ON "food_database" USING btree ("name" text_ops);--> statement-breakpoint
CREATE INDEX "idx_food_db_name_el" ON "food_database" USING btree ("name_el" text_ops);--> statement-breakpoint
CREATE INDEX "idx_food_db_name_es" ON "food_database" USING btree ("name_es" text_ops);--> statement-breakpoint
CREATE INDEX "idx_food_db_popularity" ON "food_database" USING btree ("popularity" int4_ops);--> statement-breakpoint
CREATE INDEX "idx_food_db_search" ON "food_database" USING gin (to_tsvector('simple'::regconfig, ((((COALESCE(name, ''::text) | tsvector_ops);--> statement-breakpoint
CREATE INDEX "idx_workout_sets_exercise" ON "workout_sets" USING btree ("exercise_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_workout_sets_session" ON "workout_sets" USING btree ("session_id" uuid_ops);--> statement-breakpoint
CREATE INDEX "idx_exercises_muscle" ON "exercises" USING btree ("muscle_group" text_ops);--> statement-breakpoint
CREATE INDEX "idx_workout_sessions_user" ON "workout_sessions" USING btree ("user_id" date_ops,"session_date" date_ops);--> statement-breakpoint
CREATE POLICY "Users manage own form analyses" ON "form_analyses" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches view client form analyses" ON "form_analyses" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "All users see template habits" ON "habits" AS PERMISSIVE FOR SELECT TO public USING ((is_template = true));--> statement-breakpoint
CREATE POLICY "Coaches see own habits" ON "habits" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Coaches can create habits" ON "habits" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Coaches can update own habits" ON "habits" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can manage own client_profile" ON "client_profiles" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches can view assigned clients" ON "client_profiles" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Coaches can update assigned clients" ON "client_profiles" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can view own profile" ON "profiles" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() = id));--> statement-breakpoint
CREATE POLICY "Users can update own profile" ON "profiles" AS PERMISSIVE FOR UPDATE TO public;--> statement-breakpoint
CREATE POLICY "Users can insert own profile" ON "profiles" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Coaches can view client profiles" ON "profiles" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Clients see own habits" ON "client_habits" AS PERMISSIVE FOR SELECT TO public USING ((client_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches manage assigned habits" ON "client_habits" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Clients manage own food log" ON "food_log" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches view client food log" ON "food_log" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Clients manage own water log" ON "water_log" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches view client water log" ON "water_log" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Coaches manage own protocols" ON "supplement_protocols" AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Clients view assigned protocols" ON "supplement_protocols" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Clients manage own supplement log2" ON "supplement_log" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches view supplement log" ON "supplement_log" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Coaches manage own notes" ON "coach_notes" AS PERMISSIVE FOR ALL TO public USING ((coach_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Clients view notes about them" ON "coach_notes" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Clients view own supplements" ON "client_supplements" AS PERMISSIVE FOR SELECT TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Clients manage own supplement log" ON "client_supplements" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Coaches manage client supplements" ON "client_supplements" AS PERMISSIVE FOR ALL TO public;--> statement-breakpoint
CREATE POLICY "Clients manage own checkins" ON "habit_checkins" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches view client checkins" ON "habit_checkins" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users manage own custom foods" ON "custom_foods" AS PERMISSIVE FOR ALL TO public USING ((created_by = auth.uid()));--> statement-breakpoint
CREATE POLICY "Clients see coach shared foods" ON "custom_foods" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Clients manage own measurements" ON "measurements" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches view client measurements" ON "measurements" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "All authenticated read food_database" ON "food_database" AS PERMISSIVE FOR SELECT TO public USING ((auth.uid() IS NOT NULL));--> statement-breakpoint
CREATE POLICY "Coaches insert food_database" ON "food_database" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users manage own sets" ON "workout_sets" AS PERMISSIVE FOR ALL TO public USING ((session_id IN ( SELECT workout_sessions.id
   FROM workout_sessions
  WHERE (workout_sessions.user_id = auth.uid()))));--> statement-breakpoint
CREATE POLICY "Coaches view client sets" ON "workout_sets" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Coaches manage own templates" ON "workout_templates" AS PERMISSIVE FOR ALL TO public USING ((created_by = auth.uid()));--> statement-breakpoint
CREATE POLICY "Clients see shared templates" ON "workout_templates" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "All see template exercises" ON "exercises" AS PERMISSIVE FOR SELECT TO public USING ((is_template = true));--> statement-breakpoint
CREATE POLICY "Users see own exercises" ON "exercises" AS PERMISSIVE FOR SELECT TO public;--> statement-breakpoint
CREATE POLICY "Users create exercises" ON "exercises" AS PERMISSIVE FOR INSERT TO public;--> statement-breakpoint
CREATE POLICY "Users manage own sessions" ON "workout_sessions" AS PERMISSIVE FOR ALL TO public USING ((user_id = auth.uid()));--> statement-breakpoint
CREATE POLICY "Coaches view client sessions" ON "workout_sessions" AS PERMISSIVE FOR SELECT TO public;
*/