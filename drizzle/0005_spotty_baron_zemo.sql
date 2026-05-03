CREATE TYPE "public"."memory_fact_type" AS ENUM('preference', 'allergy', 'goal', 'event', 'observation');--> statement-breakpoint
CREATE TYPE "public"."memory_scope" AS ENUM('user', 'session', 'agent');--> statement-breakpoint
CREATE TYPE "public"."memory_source" AS ENUM('user_input', 'agent_inference', 'coach', 'wearable');--> statement-breakpoint
CREATE TABLE "memory_chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" "memory_scope" DEFAULT 'user' NOT NULL,
	"agent_name" text,
	"session_id" text,
	"fact_text" text NOT NULL,
	"fact_type" "memory_fact_type" DEFAULT 'observation' NOT NULL,
	"confidence" real DEFAULT 0.8 NOT NULL,
	"source" "memory_source" DEFAULT 'agent_inference' NOT NULL,
	"superseded_by" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"salience" real DEFAULT 0.5 NOT NULL,
	"expires_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_retrieved_at" timestamp with time zone,
	"retrieval_count" smallint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "coach_blocks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"coach_id" uuid NOT NULL,
	"block_label" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"edited_by" uuid,
	"active" boolean DEFAULT true NOT NULL,
	"visible_to_client" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coach_blocks_client_label_key" UNIQUE("client_id","block_label")
);
--> statement-breakpoint
CREATE TABLE "agent_conversation" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"agent_name" text NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"tool_calls" jsonb,
	"tokens_in" integer,
	"tokens_out" integer,
	"cost_usd" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_conversation_role_check" CHECK (role IN ('user', 'assistant', 'system', 'tool'))
);
--> statement-breakpoint
CREATE TABLE "raw_captures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"content" text NOT NULL,
	"metadata" jsonb,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone,
	"processing_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "raw_captures_source_check" CHECK (source IN ('food_log', 'habit_log', 'measurement', 'coach_note', 'workout', 'profile_edit', 'chat'))
);
--> statement-breakpoint
ALTER TABLE "memory_chunks" ADD CONSTRAINT "memory_chunks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_blocks" ADD CONSTRAINT "coach_blocks_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_blocks" ADD CONSTRAINT "coach_blocks_coach_id_fkey" FOREIGN KEY ("coach_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_conversation" ADD CONSTRAINT "agent_conversation_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_captures" ADD CONSTRAINT "raw_captures_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_mc_user_scope_active" ON "memory_chunks" USING btree ("user_id","scope","active");--> statement-breakpoint
CREATE INDEX "idx_mc_user_agent" ON "memory_chunks" USING btree ("user_id","agent_name");--> statement-breakpoint
CREATE INDEX "idx_mc_session" ON "memory_chunks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_mc_superseded_by" ON "memory_chunks" USING btree ("superseded_by");--> statement-breakpoint
CREATE INDEX "idx_mc_expires_at" ON "memory_chunks" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_cb_client_active" ON "coach_blocks" USING btree ("client_id","active");--> statement-breakpoint
CREATE INDEX "idx_cb_coach_client" ON "coach_blocks" USING btree ("coach_id","client_id");--> statement-breakpoint
CREATE INDEX "idx_ac_session_created" ON "agent_conversation" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_ac_user_agent_created" ON "agent_conversation" USING btree ("user_id","agent_name","created_at");--> statement-breakpoint
CREATE INDEX "idx_ac_user_created" ON "agent_conversation" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_rc_unprocessed" ON "raw_captures" USING btree ("processed","created_at");--> statement-breakpoint
CREATE INDEX "idx_rc_user_created" ON "raw_captures" USING btree ("user_id","created_at");

-- ── Phase 5 pgvector additions ────────────────────────────────────────────────
-- 1. Voyage v4 embedding column on memory_chunks (1024-dim).
ALTER TABLE memory_chunks ADD COLUMN IF NOT EXISTS embedding vector(1024);

-- 2. Self-referential FK for supersedence chain (cannot be in Drizzle schema
--    due to the circular reference at table-creation time).
ALTER TABLE memory_chunks
  ADD CONSTRAINT memory_chunks_superseded_by_fkey
  FOREIGN KEY (superseded_by) REFERENCES memory_chunks(id)
  ON DELETE SET NULL
  DEFERRABLE INITIALLY DEFERRED;

-- 3. HNSW index on memory embeddings for semantic retrieval.
CREATE INDEX IF NOT EXISTS idx_mc_embedding
  ON memory_chunks
  USING hnsw (embedding vector_cosine_ops);

-- 4. Composite partial index for fast kNN retrieval by user + scope:
--    Used in agents/memory/read.ts Stage 2 (cosine re-rank within scope).
CREATE INDEX IF NOT EXISTS idx_mc_user_scope_active_embed
  ON memory_chunks (user_id, scope)
  WHERE active = true AND embedding IS NOT NULL;

-- 5. Salience decay function (optional, scheduled nightly):
--    Reduces salience of stale memories not retrieved in >30 days.
--    Called by: SELECT memory_decay_salience();
CREATE OR REPLACE FUNCTION memory_decay_salience() RETURNS int AS $$
DECLARE
  affected int;
BEGIN
  UPDATE memory_chunks
  SET salience = GREATEST(0.1, salience * 0.95)
  WHERE active = true
    AND last_retrieved_at < NOW() - INTERVAL '30 days'
    AND salience > 0.1;
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$ LANGUAGE plpgsql;
