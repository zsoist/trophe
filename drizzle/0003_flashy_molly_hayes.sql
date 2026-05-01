CREATE TABLE "agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trace_id" text,
	"task_name" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" real,
	"latency_ms" integer,
	"raw_status" integer,
	"error_message" text,
	"food_log_id" uuid,
	"user_id" uuid,
	"caller_role" "user_role",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "idx_food_db_search";--> statement-breakpoint
CREATE INDEX "idx_agent_runs_user_created" ON "agent_runs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_task_model" ON "agent_runs" USING btree ("task_name","model");--> statement-breakpoint
CREATE INDEX "idx_agent_runs_food_log" ON "agent_runs" USING btree ("food_log_id");--> statement-breakpoint
CREATE INDEX "idx_food_db_search" ON "food_database" USING gin (to_tsvector('simple'::regconfig, (((COALESCE(name, ''::text) || ' '::text) || COALESCE(name_el, ''::text)) || ' '::text) || COALESCE(name_es, ''::text)));--> statement-breakpoint
CREATE POLICY "Super admin full profile access" ON "profiles" AS PERMISSIVE FOR ALL TO public USING ((SELECT is_super_admin()));