-- Disposable CI experiment only. Not a productive migration or deployment step.
CREATE TABLE private.coach_pilot_budgets (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  allowed_actor_ids uuid[] NOT NULL DEFAULT '{}',
  cap_nano_usd bigint NOT NULL DEFAULT 0 CHECK (cap_nano_usd BETWEEN 0 AND 9007199254740991),
  charged_nano_usd bigint NOT NULL DEFAULT 0 CHECK (charged_nano_usd BETWEEN 0 AND 9007199254740991),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 4096),
  accounting_blocked boolean NOT NULL DEFAULT false
);
ALTER TABLE private.coach_pilot_budgets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.coach_pilot_budgets FROM PUBLIC, anon, authenticated;
-- One globally unique attempt; a different pilot must not reuse its identity.
CREATE UNIQUE INDEX isolated_coach_pilot_attempt ON public.agent_runs ((metadata->'coachPilot'->'binding'->>'attemptId')) WHERE metadata ? 'coachPilot';
CREATE INDEX isolated_coach_pilot_rows ON public.agent_runs ((metadata->'coachPilot'->'binding'->>'pilotId')) WHERE metadata ? 'coachPilot';
