CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE TABLE IF NOT EXISTS app_scheduler_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE app_scheduler_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_scheduler_secrets FROM anon, authenticated;

CREATE OR REPLACE FUNCTION run_memory_queue_worker()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  worker_secret text;
BEGIN
  SELECT value INTO worker_secret
  FROM app_scheduler_secrets
  WHERE name = 'memory_worker';

  IF worker_secret IS NULL THEN
    RAISE WARNING 'memory worker secret is not configured';
    RETURN;
  END IF;

  PERFORM net.http_get(
    url := 'https://trophe.app/api/internal/memory-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_secret),
    timeout_milliseconds := 55000
  );
END;
$$;

REVOKE ALL ON FUNCTION run_memory_queue_worker() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'trophe-memory-worker';

  PERFORM cron.schedule('trophe-memory-worker', '*/5 * * * *', 'SELECT run_memory_queue_worker()');
END;
$$;
