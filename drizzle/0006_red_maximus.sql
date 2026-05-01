CREATE TYPE "public"."wearable_provider" AS ENUM('apple_health', 'whoop', 'oura', 'strava', 'garmin', 'fitbit', 'polar', 'coros');--> statement-breakpoint
CREATE TYPE "public"."wearable_status" AS ENUM('active', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."wearable_data_type" AS ENUM('steps', 'heart_rate', 'sleep', 'workout', 'hrv', 'weight', 'body_fat', 'spo2', 'stress', 'readiness', 'temperature');--> statement-breakpoint
CREATE TABLE "wearable_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "wearable_provider" NOT NULL,
	"spike_user_id" text NOT NULL,
	"access_token_encrypted" "bytea",
	"refresh_token_encrypted" "bytea",
	"scopes" text,
	"status" "wearable_status" DEFAULT 'active' NOT NULL,
	"token_expires_at" timestamp with time zone,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_error" text,
	CONSTRAINT "wearable_connections_user_provider_key" UNIQUE("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "wearable_data" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" "wearable_provider" NOT NULL,
	"data_type" "wearable_data_type" NOT NULL,
	"value_numeric" real,
	"value_jsonb" jsonb,
	"recorded_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"spike_event_id" text,
	CONSTRAINT "wearable_data_user_provider_type_recorded_key" UNIQUE("user_id","provider","data_type","recorded_at")
);
--> statement-breakpoint
ALTER TABLE "wearable_connections" ADD CONSTRAINT "wearable_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wearable_data" ADD CONSTRAINT "wearable_data_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_wc_spike_user_id" ON "wearable_connections" USING btree ("spike_user_id");--> statement-breakpoint
CREATE INDEX "idx_wc_user_status" ON "wearable_connections" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_wd_user_type_recorded" ON "wearable_data" USING btree ("user_id","data_type","recorded_at");--> statement-breakpoint
CREATE INDEX "idx_wd_spike_event_id" ON "wearable_data" USING btree ("spike_event_id");