DROP INDEX "idx_dish_recipes_name_gin";--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "generation_id" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "prompt_version" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "prompt_hash" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "provider_generation_id" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "fallback_from" text;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "reasoning_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "cached_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "estimated_cost_usd" real;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "actual_cost_usd" real;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "metadata" jsonb;--> statement-breakpoint
ALTER TABLE "agent_runs" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "idx_agent_runs_generation" ON "agent_runs" USING btree ("generation_id");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_org_created" ON "agent_runs" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_status_created" ON "agent_runs" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_dish_recipes_name_gin" ON "dish_recipes" USING gin (to_tsvector('simple', "dish_name"));