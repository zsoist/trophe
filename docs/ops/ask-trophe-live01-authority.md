# Ask Trophē LIVE-01 shared authority

Status: prepared only. No hosted DDL, pilot row, feature flag, or paid provider call has been applied.

## Fixed destination

- Application: protected Vercel Preview for project `zsoist/trophe`.
- Database currently bound to that Preview: Supabase project ref `iwbpzwmidzvpiofnqexd`.
- Authority: exactly one row in `private.coach_pilot_budgets` with code-owned id `a857fa8d-2bb8-4a7e-a190-5f8f1cf66229` and `scope_key = 'ask-trophe-shared'`.
- Runtime identity: the authenticated actor id must also appear in the server-only Preview allowlist. No request value can select the pilot id or actor id.

Because the named Supabase project is the production data plane, applying the migration or provisioning the row is a separate operator-gated production DDL decision. A merged migration file does not grant permission to run it.

## One private application binding

The operator must add or verify `OPENAI_API_KEY` in the Vercel project `zsoist/trophe`, scoped to **Preview only**. The value is never copied into GitHub, a browser variable, a request, a log, or this runbook.

The pilot remains closed unless all server-side Preview variables are present:

- `COACH_ASSISTANT_ENABLED=1`
- `COACH_ASSISTANT_LIVE_PILOT_ENABLED=1`
- `TROPHE_ALLOW_PAID_AI=1`
- `COACH_ASSISTANT_PREVIEW_USER_IDS=<authorized actor UUID>`

Client Food confirmation also requires the existing `NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED=1`; it does not authorize provider spend.

## Operator-gated database package

Before applying any DDL, capture the current definitions and grants into an encrypted operator artifact:

```sql
SELECT to_regclass('private.coach_pilot_budgets') AS budget_authority;
SELECT grantee, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'private' AND table_name = 'coach_pilot_budgets'
ORDER BY grantee, privilege_type;
SELECT indexname, indexdef FROM pg_indexes
 WHERE schemaname = 'public' AND tablename = 'agent_runs'
   AND indexname IN ('idx_agent_runs_coach_pilot_attempt', 'idx_agent_runs_coach_pilot_rows');
```

The first statement is expected to return `NULL` before the first rollout; that result is the preflight proof. Apply the canonical files in journal order, including the already reserved `0085_revoke_workout_table_truncate.sql`, then `0086_coach_pilot_budget_authority.sql`. The effective migration set must be reviewed from the exact release SHA before execution.

Provision only after the migration succeeds, substituting the reviewed organization and actor UUIDs as bound `psql` variables:

```sql
BEGIN;
INSERT INTO private.coach_pilot_budgets (
  id, scope_key, organization_id, allowed_actor_ids,
  cap_nano_usd, operating_target_nano_usd
) VALUES (
  'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229',
  'ask-trophe-shared',
  :'organization_id'::uuid,
  ARRAY[:'actor_id'::uuid],
  3000000000,
  2700000000
);
COMMIT;
```

The daily hard cap is USD 3.00 and the admission target is USD 2.70, reset by the server's Bogotá calendar day. The first live smoke must remain at or below USD 0.50 and uses text only.

Verify without exposing identity values:

```sql
SELECT scope_key, cap_nano_usd, operating_target_nano_usd,
       cardinality(allowed_actor_ids) AS allowed_actor_count,
       charged_nano_usd, attempt_count, accounting_blocked
FROM private.coach_pilot_budgets
WHERE id = 'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229';
```

Expected initial result: one row, actor count `1`, cap `3000000000`, target `2700000000`, charged `0`, attempts `0`, blocked `false`.

## Rollback and impact

First disable `COACH_ASSISTANT_LIVE_PILOT_ENABLED`; this stops new paid dispatches without touching data. Preserve `agent_runs` because it is the accounting and audit record. If the pilot row has no attempts, remove only the fixed row. Dropping the table or indexes requires a separate reviewed migration after audit retention is resolved.

The schema change adds one private row and two partial expression indexes over `agent_runs` rows containing `metadata.coachPilot`. Index creation can briefly consume I/O and lock the target table. The current table size and lock window must be measured immediately before an authorized hosted operation.
