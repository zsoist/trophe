-- Reconcile legacy agent_runs rows after the governed runtime schema lands.
-- Existing successful rows predate status/estimated/actual cost fields.
UPDATE agent_runs
SET
  status = CASE
    WHEN raw_status BETWEEN 200 AND 299 THEN 'completed'
    WHEN raw_status IS NULL THEN 'failed'
    ELSE 'failed'
  END,
  estimated_cost_usd = COALESCE(estimated_cost_usd, cost_usd),
  actual_cost_usd = COALESCE(actual_cost_usd, cost_usd),
  completed_at = COALESCE(completed_at, created_at)
WHERE status = 'pending'
  AND created_at < NOW() - INTERVAL '15 minutes';
--> statement-breakpoint
ALTER TABLE agent_runs
  ADD CONSTRAINT agent_runs_status_check
  CHECK (status IN ('pending', 'completed', 'failed'));
