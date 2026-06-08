CREATE TABLE IF NOT EXISTS public.rate_limit_windows (
  key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  expires_at timestamptz NOT NULL,
  CONSTRAINT rate_limit_windows_key_window_key UNIQUE (key, window_started_at)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_windows_expires_at ON public.rate_limit_windows(expires_at);
ALTER TABLE public.rate_limit_windows ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rate_limit_windows FROM anon, authenticated;
GRANT ALL ON public.rate_limit_windows TO service_role;
