DROP INDEX "idx_food_log_user_date";--> statement-breakpoint
DROP INDEX "idx_water_log_user_date";--> statement-breakpoint
DROP INDEX "idx_supplement_log_user_date";--> statement-breakpoint
DROP INDEX "idx_measurements_user_date";--> statement-breakpoint
DROP INDEX "idx_workout_sessions_user";--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "usda_fdc_id" integer;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "macro_confidence" real DEFAULT 0.7 NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "unit_conversion_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "canonical_food_key" text;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "provenance_notes" text;--> statement-breakpoint
ALTER TABLE "foods" ADD COLUMN "data_reviewed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_food_log_user_date" ON "food_log" USING btree ("user_id" uuid_ops,"logged_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_water_log_user_date" ON "water_log" USING btree ("user_id" uuid_ops,"logged_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_supplement_log_user_date" ON "supplement_log" USING btree ("user_id" uuid_ops,"logged_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_measurements_user_date" ON "measurements" USING btree ("user_id" uuid_ops,"measured_date" date_ops);--> statement-breakpoint
CREATE INDEX "idx_workout_sessions_user" ON "workout_sessions" USING btree ("user_id" uuid_ops,"session_date" date_ops);