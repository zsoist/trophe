ALTER TABLE "raw_captures"
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "processing_attempts" integer DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS "next_attempt_at" timestamp with time zone;

CREATE INDEX IF NOT EXISTS "idx_rc_queue_ready"
  ON "raw_captures" ("source", "processed", "next_attempt_at", "created_at");
