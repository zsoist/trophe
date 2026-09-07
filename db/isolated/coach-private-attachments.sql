-- Prepared disposable CI delta; not installed, not a production migration.
-- The guarded hosted harness owns a private synthetic Storage bucket separately.
CREATE TABLE private.coach_attachment_uploads (
  id uuid PRIMARY KEY,
  -- No cascading identity FK: abandoned objects must remain discoverable for
  -- Storage API cleanup even if the account or organization has been removed.
  actor_id uuid NOT NULL,
  subject_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  request_id uuid NOT NULL,
  bucket text NOT NULL CHECK (bucket ~ '^coach-attachments-[a-z0-9-]{1,48}$'),
  object_path text NOT NULL,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'image/webp')),
  input_bytes integer NOT NULL CHECK (input_bytes BETWEEN 1 AND 5242880),
  upload_token_hash text NOT NULL CHECK (upload_token_hash ~ '^[a-f0-9]{64}$'),
  source_digest text CHECK (source_digest ~ '^[a-f0-9]{64}$'),
  normalized_digest text CHECK (normalized_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL CHECK (state IN ('prepared', 'available', 'removed')),
  metadata jsonb,
  expires_at timestamptz NOT NULL,
  CHECK (actor_id = subject_id),
  CHECK (object_path = organization_id::text || '/' || subject_id::text || '/' || conversation_id::text || '/' || id::text || '.jpg'),
  CHECK (state <> 'available' OR (source_digest IS NOT NULL AND normalized_digest IS NOT NULL AND metadata IS NOT NULL)),
  CHECK (state <> 'removed' OR metadata IS NULL),
  CHECK (metadata IS NULL OR (
    jsonb_typeof(metadata) = 'object'
    AND metadata - ARRAY['mime','bytes','width','height']::text[] = '{}'::jsonb
    AND metadata ?& ARRAY['mime','bytes','width','height']::text[]
    AND metadata->>'mime' = 'image/jpeg'
    AND jsonb_typeof(metadata->'bytes') = 'number'
    AND jsonb_typeof(metadata->'width') = 'number'
    AND jsonb_typeof(metadata->'height') = 'number'
    AND (metadata->>'bytes')::numeric BETWEEN 1 AND 5242880
    AND (metadata->>'bytes')::numeric = trunc((metadata->>'bytes')::numeric)
    AND (metadata->>'width')::numeric BETWEEN 1 AND 16000000
    AND (metadata->>'height')::numeric BETWEEN 1 AND 16000000
    AND (metadata->>'width')::numeric = trunc((metadata->>'width')::numeric)
    AND (metadata->>'height')::numeric = trunc((metadata->>'height')::numeric)
    AND (metadata->>'width')::numeric * (metadata->>'height')::numeric <= 16000000
    AND octet_length(metadata::text) <= 256
  )),
  UNIQUE(actor_id, request_id),
  UNIQUE(bucket, object_path)
);
CREATE INDEX coach_attachment_uploads_expiry ON private.coach_attachment_uploads(bucket, state, expires_at);
CREATE INDEX coach_attachment_uploads_scope ON private.coach_attachment_uploads(actor_id, subject_id, organization_id, conversation_id);
ALTER TABLE private.coach_attachment_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_attachment_uploads FROM PUBLIC, anon, authenticated;
-- Expiry and state transitions are controlled by the authorized service.
-- This delta does not schedule cleanup. The harness must execute the bounded
-- janitor, verify objects were removed through Storage API, and only then remove
-- its exact synthetic ledger rows and private bucket. Never DELETE storage.objects.
