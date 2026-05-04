import { pgTable, pgSchema, unique, uuid, text, jsonb, timestamp, index, foreignKey, pgPolicy, integer, real, check, boolean, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

export const auth = pgSchema("auth");


export const usersInAuth = auth.table("users", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	email: text(),
	rawAppMetaData: jsonb("raw_app_meta_data").default({}),
	rawUserMetaData: jsonb("raw_user_meta_data").default({}),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("users_email_key").on(table.email),
]);

export const formAnalyses = pgTable("form_analyses", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	exerciseId: uuid("exercise_id"),
	sessionId: uuid("session_id"),
	side: text().default('right'),
	repsAnalyzed: integer("reps_analyzed").default(0),
	overallScore: real("overall_score"),
	overallAssessment: text("overall_assessment"),
	perRepScores: jsonb("per_rep_scores"),
	referenceComparison: jsonb("reference_comparison"),
	analyzedAt: timestamp("analyzed_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_form_analyses_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [exercises.id],
			name: "form_analyses_exercise_id_fkey"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [workoutSessions.id],
			name: "form_analyses_session_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "form_analyses_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users manage own form analyses", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches view client form analyses", { as: "permissive", for: "select", to: ["public"] }),
]);

export const habits = pgTable("habits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdBy: uuid("created_by"),
	nameEn: text("name_en").notNull(),
	nameEs: text("name_es"),
	nameEl: text("name_el"),
	descriptionEn: text("description_en"),
	descriptionEs: text("description_es"),
	descriptionEl: text("description_el"),
	emoji: text().default('🎯'),
	category: text(),
	difficulty: text().default('beginner'),
	targetValue: real("target_value"),
	targetUnit: text("target_unit"),
	cycleDays: integer("cycle_days").default(14),
	suggestedOrder: integer("suggested_order"),
	isTemplate: boolean("is_template").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "habits_created_by_fkey"
		}),
	pgPolicy("All users see template habits", { as: "permissive", for: "select", to: ["public"], using: sql`(is_template = true)` }),
	pgPolicy("Coaches see own habits", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Coaches can create habits", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Coaches can update own habits", { as: "permissive", for: "update", to: ["public"] }),
	check("habits_category_check", sql`category = ANY (ARRAY['nutrition'::text, 'hydration'::text, 'movement'::text, 'sleep'::text, 'mindset'::text, 'recovery'::text])`),
	check("habits_difficulty_check", sql`difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])`),
]);

export const clientProfiles = pgTable("client_profiles", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	coachId: uuid("coach_id"),
	age: integer(),
	sex: text(),
	heightCm: real("height_cm"),
	weightKg: real("weight_kg"),
	bodyFatPct: real("body_fat_pct"),
	activityLevel: text("activity_level"),
	goal: text(),
	bmr: real(),
	tdee: real(),
	targetCalories: integer("target_calories"),
	targetProteinG: integer("target_protein_g"),
	targetCarbsG: integer("target_carbs_g"),
	targetFatG: integer("target_fat_g"),
	targetFiberG: integer("target_fiber_g"),
	targetWaterMl: integer("target_water_ml"),
	currentHabitId: uuid("current_habit_id"),
	coachingPhase: text("coaching_phase").default('onboarding'),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_client_profiles_coach").using("btree", table.coachId.asc().nullsLast().op("uuid_ops")),
	index("idx_client_profiles_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.coachId],
			foreignColumns: [profiles.id],
			name: "client_profiles_coach_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "client_profiles_user_id_fkey"
		}).onDelete("cascade"),
	unique("client_profiles_user_id_key").on(table.userId),
	pgPolicy("Users can manage own client_profile", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches can view assigned clients", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Coaches can update assigned clients", { as: "permissive", for: "update", to: ["public"] }),
	check("client_profiles_activity_level_check", sql`activity_level = ANY (ARRAY['sedentary'::text, 'light'::text, 'moderate'::text, 'active'::text, 'very_active'::text])`),
	check("client_profiles_coaching_phase_check", sql`coaching_phase = ANY (ARRAY['onboarding'::text, 'active'::text, 'maintenance'::text])`),
	check("client_profiles_goal_check", sql`goal = ANY (ARRAY['fat_loss'::text, 'muscle_gain'::text, 'maintenance'::text, 'recomp'::text, 'endurance'::text, 'health'::text])`),
	check("client_profiles_sex_check", sql`sex = ANY (ARRAY['male'::text, 'female'::text])`),
]);

export const profiles = pgTable("profiles", {
	id: uuid().primaryKey().notNull(),
	fullName: text("full_name").notNull(),
	email: text().notNull(),
	role: text().default('client').notNull(),
	avatarUrl: text("avatar_url"),
	language: text().default('en'),
	timezone: text().default('UTC'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.id],
			foreignColumns: [usersInAuth.id],
			name: "profiles_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users can view own profile", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.uid() = id)` }),
	pgPolicy("Users can update own profile", { as: "permissive", for: "update", to: ["public"] }),
	pgPolicy("Users can insert own profile", { as: "permissive", for: "insert", to: ["public"] }),
	pgPolicy("Coaches can view client profiles", { as: "permissive", for: "select", to: ["public"] }),
	check("profiles_language_check", sql`language = ANY (ARRAY['en'::text, 'es'::text, 'el'::text])`),
	check("profiles_role_check", sql`role = ANY (ARRAY['client'::text, 'coach'::text, 'both'::text])`),
]);

export const clientHabits = pgTable("client_habits", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clientId: uuid("client_id"),
	habitId: uuid("habit_id"),
	assignedBy: uuid("assigned_by"),
	status: text().default('active'),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	currentStreak: integer("current_streak").default(0),
	bestStreak: integer("best_streak").default(0),
	totalCompletions: integer("total_completions").default(0),
	sequenceNumber: integer("sequence_number").default(1),
	coachNote: text("coach_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_client_habits_client").using("btree", table.clientId.asc().nullsLast().op("uuid_ops")),
	index("idx_client_habits_status").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.assignedBy],
			foreignColumns: [profiles.id],
			name: "client_habits_assigned_by_fkey"
		}),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [profiles.id],
			name: "client_habits_client_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.habitId],
			foreignColumns: [habits.id],
			name: "client_habits_habit_id_fkey"
		}),
	pgPolicy("Clients see own habits", { as: "permissive", for: "select", to: ["public"], using: sql`(client_id = auth.uid())` }),
	pgPolicy("Coaches manage assigned habits", { as: "permissive", for: "all", to: ["public"] }),
	check("client_habits_status_check", sql`status = ANY (ARRAY['active'::text, 'completed'::text, 'paused'::text, 'skipped'::text])`),
]);

export const foodLog = pgTable("food_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	loggedDate: date("logged_date").default(sql`CURRENT_DATE`).notNull(),
	mealType: text("meal_type"),
	foodName: text("food_name").notNull(),
	quantity: real().default(1).notNull(),
	unit: text().default('serving'),
	calories: real(),
	proteinG: real("protein_g"),
	carbsG: real("carbs_g"),
	fatG: real("fat_g"),
	fiberG: real("fiber_g"),
	source: text(),
	sourceId: text("source_id"),
	photoUrl: text("photo_url"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_food_log_user_date").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.loggedDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "food_log_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Clients manage own food log", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches view client food log", { as: "permissive", for: "select", to: ["public"] }),
	check("food_log_meal_type_check", sql`meal_type = ANY (ARRAY['breakfast'::text, 'lunch'::text, 'dinner'::text, 'snack'::text, 'pre_workout'::text, 'post_workout'::text])`),
	check("food_log_source_check", sql`source = ANY (ARRAY['usda'::text, 'openfoodfacts'::text, 'custom'::text, 'photo_ai'::text, 'natural_language'::text, 'ai_estimate'::text])`),
]);

export const waterLog = pgTable("water_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	loggedDate: date("logged_date").default(sql`CURRENT_DATE`).notNull(),
	amountMl: integer("amount_ml").notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_water_log_user_date").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.loggedDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "water_log_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Clients manage own water log", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches view client water log", { as: "permissive", for: "select", to: ["public"] }),
]);

export const supplementProtocols = pgTable("supplement_protocols", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	coachId: uuid("coach_id"),
	name: text().notNull(),
	description: text(),
	supplements: jsonb().default([]).notNull(),
	goal: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.coachId],
			foreignColumns: [profiles.id],
			name: "supplement_protocols_coach_id_fkey"
		}),
	pgPolicy("Coaches manage own protocols", { as: "permissive", for: "all", to: ["public"], using: sql`(coach_id = auth.uid())` }),
	pgPolicy("Clients view assigned protocols", { as: "permissive", for: "select", to: ["public"] }),
]);

export const supplementLog = pgTable("supplement_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	supplementName: text("supplement_name").notNull(),
	taken: boolean().default(true),
	loggedDate: date("logged_date").default(sql`CURRENT_DATE`).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_supplement_log_user_date").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.loggedDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "supplement_log_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Clients manage own supplement log2", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches view supplement log", { as: "permissive", for: "select", to: ["public"] }),
]);

export const apiUsageLog = pgTable("api_usage_log", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	endpoint: text().notNull(),
	model: text().notNull(),
	provider: text(),
	tokensIn: integer("tokens_in").default(0),
	tokensOut: integer("tokens_out").default(0),
	costUsd: real("cost_usd").default(0),
	latencyMs: integer("latency_ms").default(0),
	userId: uuid("user_id"),
	success: boolean().default(true),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_api_usage_created").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("idx_api_usage_endpoint").using("btree", table.endpoint.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "api_usage_log_user_id_fkey"
		}).onDelete("set null"),
	check("api_usage_log_provider_check", sql`provider = ANY (ARRAY['anthropic'::text, 'gemini'::text])`),
]);

export const coachNotes = pgTable("coach_notes", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	coachId: uuid("coach_id"),
	clientId: uuid("client_id"),
	note: text().notNull(),
	sessionType: text("session_type"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_coach_notes_client").using("btree", table.clientId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clientId],
			foreignColumns: [profiles.id],
			name: "coach_notes_client_id_fkey"
		}),
	foreignKey({
			columns: [table.coachId],
			foreignColumns: [profiles.id],
			name: "coach_notes_coach_id_fkey"
		}),
	pgPolicy("Coaches manage own notes", { as: "permissive", for: "all", to: ["public"], using: sql`(coach_id = auth.uid())` }),
	pgPolicy("Clients view notes about them", { as: "permissive", for: "select", to: ["public"] }),
	check("coach_notes_session_type_check", sql`session_type = ANY (ARRAY['check_in'::text, 'progression'::text, 'concern'::text, 'general'::text])`),
]);

export const clientSupplements = pgTable("client_supplements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	protocolId: uuid("protocol_id"),
	assignedBy: uuid("assigned_by"),
	active: boolean().default(true),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.assignedBy],
			foreignColumns: [profiles.id],
			name: "client_supplements_assigned_by_fkey"
		}),
	foreignKey({
			columns: [table.protocolId],
			foreignColumns: [supplementProtocols.id],
			name: "client_supplements_protocol_id_fkey"
		}),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "client_supplements_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Clients view own supplements", { as: "permissive", for: "select", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Clients manage own supplement log", { as: "permissive", for: "all", to: ["public"] }),
	pgPolicy("Coaches manage client supplements", { as: "permissive", for: "all", to: ["public"] }),
]);

export const habitCheckins = pgTable("habit_checkins", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	clientHabitId: uuid("client_habit_id"),
	userId: uuid("user_id"),
	checkedDate: date("checked_date").default(sql`CURRENT_DATE`).notNull(),
	completed: boolean().notNull(),
	value: real(),
	note: text(),
	mood: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_habit_checkins_date").using("btree", table.checkedDate.asc().nullsLast().op("date_ops")),
	index("idx_habit_checkins_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.clientHabitId],
			foreignColumns: [clientHabits.id],
			name: "habit_checkins_client_habit_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "habit_checkins_user_id_fkey"
		}),
	unique("habit_checkins_client_habit_id_checked_date_key").on(table.clientHabitId, table.checkedDate),
	pgPolicy("Clients manage own checkins", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches view client checkins", { as: "permissive", for: "select", to: ["public"] }),
	check("habit_checkins_mood_check", sql`mood = ANY (ARRAY['great'::text, 'good'::text, 'okay'::text, 'tough'::text, 'struggled'::text])`),
]);

export const customFoods = pgTable("custom_foods", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdBy: uuid("created_by"),
	name: text().notNull(),
	calories: integer(),
	proteinG: real("protein_g"),
	carbsG: real("carbs_g"),
	fatG: real("fat_g"),
	fiberG: real("fiber_g"),
	unit: text().default('100g'),
	category: text(),
	shared: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "custom_foods_created_by_fkey"
		}),
	pgPolicy("Users manage own custom foods", { as: "permissive", for: "all", to: ["public"], using: sql`(created_by = auth.uid())` }),
	pgPolicy("Clients see coach shared foods", { as: "permissive", for: "select", to: ["public"] }),
]);

export const measurements = pgTable("measurements", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	measuredDate: date("measured_date").default(sql`CURRENT_DATE`).notNull(),
	weightKg: real("weight_kg"),
	bodyFatPct: real("body_fat_pct"),
	waistCm: real("waist_cm"),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_measurements_user_date").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.measuredDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "measurements_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Clients manage own measurements", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches view client measurements", { as: "permissive", for: "select", to: ["public"] }),
]);

export const foodDatabase = pgTable("food_database", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	nameEl: text("name_el"),
	nameEs: text("name_es"),
	caloriesPer100G: real("calories_per_100g").notNull(),
	proteinPer100G: real("protein_per_100g").notNull(),
	carbsPer100G: real("carbs_per_100g").notNull(),
	fatPer100G: real("fat_per_100g").notNull(),
	fiberPer100G: real("fiber_per_100g").default(0),
	defaultServingGrams: real("default_serving_grams").default(100),
	defaultServingUnit: text("default_serving_unit").default('100g'),
	commonUnits: jsonb("common_units").default([]),
	category: text(),
	source: text(),
	sourceId: text("source_id"),
	popularity: integer().default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_food_db_name").using("btree", table.name.asc().nullsLast().op("text_ops")),
	index("idx_food_db_name_el").using("btree", table.nameEl.asc().nullsLast().op("text_ops")),
	index("idx_food_db_name_es").using("btree", table.nameEs.asc().nullsLast().op("text_ops")),
	index("idx_food_db_popularity").using("btree", table.popularity.desc().nullsFirst().op("int4_ops")),
	index("idx_food_db_search").using("gin", sql`to_tsvector('simple'::regconfig, ((((COALESCE(name, ''::text) |`),
	unique("food_database_name_source_key").on(table.name, table.source),
	pgPolicy("All authenticated read food_database", { as: "permissive", for: "select", to: ["public"], using: sql`(auth.uid() IS NOT NULL)` }),
	pgPolicy("Coaches insert food_database", { as: "permissive", for: "insert", to: ["public"] }),
	check("food_database_source_check", sql`source = ANY (ARRAY['seed'::text, 'usda'::text, 'openfoodfacts'::text, 'coach'::text])`),
]);

export const workoutSets = pgTable("workout_sets", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	sessionId: uuid("session_id"),
	exerciseId: uuid("exercise_id"),
	setNumber: integer("set_number").notNull(),
	weightKg: real("weight_kg"),
	reps: integer(),
	rpe: real(),
	isWarmup: boolean("is_warmup").default(false),
	isPr: boolean("is_pr").default(false),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_workout_sets_exercise").using("btree", table.exerciseId.asc().nullsLast().op("uuid_ops")),
	index("idx_workout_sets_session").using("btree", table.sessionId.asc().nullsLast().op("uuid_ops")),
	foreignKey({
			columns: [table.exerciseId],
			foreignColumns: [exercises.id],
			name: "workout_sets_exercise_id_fkey"
		}),
	foreignKey({
			columns: [table.sessionId],
			foreignColumns: [workoutSessions.id],
			name: "workout_sets_session_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users manage own sets", { as: "permissive", for: "all", to: ["public"], using: sql`(session_id IN ( SELECT workout_sessions.id
   FROM workout_sessions
  WHERE (workout_sessions.user_id = auth.uid())))` }),
	pgPolicy("Coaches view client sets", { as: "permissive", for: "select", to: ["public"] }),
]);

export const workoutTemplates = pgTable("workout_templates", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	createdBy: uuid("created_by"),
	name: text().notNull(),
	description: text(),
	targetMuscles: text("target_muscles").array(),
	exercises: jsonb().default([]).notNull(),
	dayLabel: text("day_label"),
	difficulty: text().default('intermediate'),
	shared: boolean().default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "workout_templates_created_by_fkey"
		}),
	pgPolicy("Coaches manage own templates", { as: "permissive", for: "all", to: ["public"], using: sql`(created_by = auth.uid())` }),
	pgPolicy("Clients see shared templates", { as: "permissive", for: "select", to: ["public"] }),
	check("workout_templates_difficulty_check", sql`difficulty = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text])`),
]);

export const exercises = pgTable("exercises", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	name: text().notNull(),
	nameEs: text("name_es"),
	nameEl: text("name_el"),
	muscleGroup: text("muscle_group").notNull(),
	secondaryMuscles: text("secondary_muscles").array(),
	equipment: text(),
	isCompound: boolean("is_compound").default(false),
	isTemplate: boolean("is_template").default(true),
	createdBy: uuid("created_by"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_exercises_muscle").using("btree", table.muscleGroup.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [profiles.id],
			name: "exercises_created_by_fkey"
		}),
	pgPolicy("All see template exercises", { as: "permissive", for: "select", to: ["public"], using: sql`(is_template = true)` }),
	pgPolicy("Users see own exercises", { as: "permissive", for: "select", to: ["public"] }),
	pgPolicy("Users create exercises", { as: "permissive", for: "insert", to: ["public"] }),
	check("exercises_muscle_group_check", sql`muscle_group = ANY (ARRAY['chest'::text, 'back'::text, 'shoulders'::text, 'biceps'::text, 'triceps'::text, 'forearms'::text, 'quads'::text, 'hamstrings'::text, 'glutes'::text, 'calves'::text, 'core'::text, 'full_body'::text, 'cardio'::text])`),
]);

export const workoutSessions = pgTable("workout_sessions", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	userId: uuid("user_id"),
	sessionDate: date("session_date").default(sql`CURRENT_DATE`).notNull(),
	name: text(),
	templateId: uuid("template_id"),
	durationMinutes: integer("duration_minutes"),
	notes: text(),
	painFlags: jsonb("pain_flags").default([]),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("idx_workout_sessions_user").using("btree", table.userId.asc().nullsLast().op("uuid_ops"), table.sessionDate.asc().nullsLast().op("date_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [profiles.id],
			name: "workout_sessions_user_id_fkey"
		}).onDelete("cascade"),
	pgPolicy("Users manage own sessions", { as: "permissive", for: "all", to: ["public"], using: sql`(user_id = auth.uid())` }),
	pgPolicy("Coaches view client sessions", { as: "permissive", for: "select", to: ["public"] }),
]);
