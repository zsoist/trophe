-- Graduated / expected-return + churn surfacing (Daily Nutrafit — Michael:
-- "I tell clients they've graduated; I expect some back in September").
-- Additive columns on client_profiles; churn is computed on the fly (no stored score).
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS graduated_at timestamptz;
ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS expected_return_month int
  CHECK (expected_return_month IS NULL OR expected_return_month BETWEEN 1 AND 12);
