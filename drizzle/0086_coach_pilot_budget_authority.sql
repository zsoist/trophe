CREATE TABLE private.coach_pilot_budgets (
  id uuid PRIMARY KEY,
  scope_key text NOT NULL UNIQUE CHECK (scope_key = 'ask-trophe-shared'),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  allowed_actor_ids uuid[] NOT NULL CHECK (cardinality(allowed_actor_ids) BETWEEN 1 AND 16),
  cap_nano_usd bigint NOT NULL DEFAULT 0 CHECK (cap_nano_usd BETWEEN 0 AND 3000000000),
  operating_target_nano_usd bigint NOT NULL DEFAULT 0 CHECK (operating_target_nano_usd BETWEEN 0 AND cap_nano_usd),
  budget_day date NOT NULL DEFAULT ((statement_timestamp() AT TIME ZONE 'America/Bogota')::date),
  charged_nano_usd bigint NOT NULL DEFAULT 0 CHECK (charged_nano_usd BETWEEN 0 AND 9007199254740991),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 4096),
  accounting_blocked boolean NOT NULL DEFAULT false
);

ALTER TABLE private.coach_pilot_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_pilot_budgets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON private.coach_pilot_budgets TO service_role;

CREATE UNIQUE INDEX idx_agent_runs_coach_pilot_attempt
  ON public.agent_runs ((metadata->'coachPilot'->'binding'->>'attemptId'))
  WHERE metadata ? 'coachPilot';

CREATE INDEX idx_agent_runs_coach_pilot_rows
  ON public.agent_runs ((metadata->'coachPilot'->'binding'->>'pilotId'))
  WHERE metadata ? 'coachPilot';

COMMENT ON TABLE private.coach_pilot_budgets IS
  'Server-only shared budget authority for the protected Ask Trophe pilot.';
