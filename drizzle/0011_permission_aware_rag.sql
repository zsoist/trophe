CREATE TABLE IF NOT EXISTS "knowledge_documents" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "organization_id" uuid,
  "user_id" uuid,
  "title" text NOT NULL,
  "source" text NOT NULL,
  "source_uri" text,
  "version" text DEFAULT '1' NOT NULL,
  "checksum" text NOT NULL,
  "classification" text DEFAULT 'internal' NOT NULL,
  "consent_basis" text,
  "status" text DEFAULT 'pending' NOT NULL,
  "error_message" text,
  "retention_until" timestamp with time zone,
  "created_by" uuid NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_documents_scope_check" CHECK (NOT (organization_id IS NOT NULL AND user_id IS NOT NULL)),
  CONSTRAINT "knowledge_documents_status_check" CHECK (status IN ('pending', 'processing', 'ready', 'failed', 'tombstoned')),
  CONSTRAINT "knowledge_documents_classification_check" CHECK (classification IN ('public', 'internal', 'confidential', 'restricted'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "knowledge_chunks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "chunk_index" integer NOT NULL,
  "content" text NOT NULL,
  "checksum" text NOT NULL,
  "token_count" integer NOT NULL,
  "fts" tsvector GENERATED ALWAYS AS (to_tsvector('simple', content)) STORED,
  "embedding" vector(1024),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "knowledge_chunks_document_index_key" UNIQUE("document_id", "chunk_index")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."profiles"("id") ON DELETE restrict;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "public"."knowledge_documents"("id") ON DELETE cascade;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_kd_org_status" ON "knowledge_documents" ("organization_id", "status");
CREATE INDEX IF NOT EXISTS "idx_kd_user_status" ON "knowledge_documents" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_kd_checksum" ON "knowledge_documents" ("checksum");
CREATE INDEX IF NOT EXISTS "idx_kc_document" ON "knowledge_chunks" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_kc_checksum" ON "knowledge_chunks" ("checksum");
CREATE INDEX IF NOT EXISTS "idx_kc_fts" ON "knowledge_chunks" USING gin ("fts");
CREATE INDEX IF NOT EXISTS "idx_kc_embedding" ON "knowledge_chunks" USING hnsw ("embedding" vector_cosine_ops);
--> statement-breakpoint
ALTER TABLE "knowledge_documents" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "knowledge_chunks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY knowledge_documents_read ON knowledge_documents FOR SELECT TO authenticated
USING (
  status = 'ready'
  AND (retention_until IS NULL OR retention_until > NOW())
  AND (
    (organization_id IS NULL AND user_id IS NULL AND classification = 'public')
    OR user_id = (SELECT auth.uid())
    OR private.is_coach_of(user_id)
    OR EXISTS (
      SELECT 1 FROM organization_members
      WHERE org_id = organization_id AND user_id = (SELECT auth.uid())
    )
  )
);
CREATE POLICY knowledge_documents_admin_all ON knowledge_documents FOR ALL TO authenticated
USING (
  created_by = (SELECT auth.uid())
  OR (organization_id IS NOT NULL AND private.is_admin_of(organization_id))
  OR private.is_super_admin()
)
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (
    user_id = (SELECT auth.uid())
    OR (organization_id IS NOT NULL AND private.is_admin_of(organization_id))
    OR private.is_super_admin()
  )
);
CREATE POLICY knowledge_chunks_read ON knowledge_chunks FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM knowledge_documents d WHERE d.id = document_id));
--> statement-breakpoint
CREATE OR REPLACE FUNCTION hybrid_search_knowledge(
  requester_id uuid,
  subject_user_id uuid,
  requested_org_id uuid,
  query_text text,
  query_embedding vector(1024),
  match_count integer DEFAULT 8
)
RETURNS TABLE (
  chunk_id uuid,
  document_id uuid,
  document_title text,
  source text,
  content text,
  created_at timestamp with time zone,
  score double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
  WITH permitted AS (
    SELECT c.id, c.document_id, d.title, d.source, c.content, c.created_at, c.fts, c.embedding
    FROM knowledge_chunks c
    JOIN knowledge_documents d ON d.id = c.document_id
    WHERE d.status = 'ready'
      AND (d.retention_until IS NULL OR d.retention_until > NOW())
      AND (
        (d.organization_id IS NULL AND d.user_id IS NULL AND d.classification = 'public')
        OR d.user_id = subject_user_id
        OR (
          d.organization_id = requested_org_id
          AND EXISTS (
            SELECT 1 FROM organization_members om
            WHERE om.org_id = d.organization_id AND om.user_id = requester_id
          )
        )
      )
      AND (
        requester_id = subject_user_id
        OR EXISTS (
          SELECT 1 FROM client_profiles cp
          WHERE cp.user_id = subject_user_id AND cp.coach_id = requester_id
        )
        OR EXISTS (
          SELECT 1 FROM profiles p
          WHERE p.id = requester_id AND p.role = 'super_admin'
        )
      )
  ),
  keyword AS (
    SELECT id, row_number() OVER (ORDER BY ts_rank_cd(fts, websearch_to_tsquery('simple', query_text)) DESC) AS rank
    FROM permitted
    WHERE query_text <> '' AND fts @@ websearch_to_tsquery('simple', query_text)
    LIMIT match_count * 4
  ),
  semantic AS (
    SELECT id, row_number() OVER (ORDER BY embedding <=> query_embedding) AS rank
    FROM permitted
    WHERE query_embedding IS NOT NULL AND embedding IS NOT NULL
    LIMIT match_count * 4
  )
  SELECT p.id, p.document_id, p.title, p.source, p.content, p.created_at,
    COALESCE(1.0 / (60 + k.rank), 0) + COALESCE(1.0 / (60 + s.rank), 0) AS score
  FROM permitted p
  LEFT JOIN keyword k ON k.id = p.id
  LEFT JOIN semantic s ON s.id = p.id
  WHERE k.id IS NOT NULL OR s.id IS NOT NULL
  ORDER BY score DESC
  LIMIT match_count;
$$;
