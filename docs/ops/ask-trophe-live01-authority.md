# Ask Trophē LIVE-01 shared authority

Status: provisioned in the isolated `Trophe-QA` project. Hosted QA DDL, the
single synthetic actor, the fixed pilot row, and branch-scoped Preview flags are
applied. No production DDL or production data copy was performed. The paid
provider smoke remains reserved for AG3.

## Fixed destination

- Application: protected Vercel Preview for project `zsoist/trophe`, branch
  `codex/ag1-live01-integration` only.
- QA data plane: Supabase project `Trophe-QA`, ref `nhawdvqqxscwxbpngaql`.
- Production remains project ref `iwbpzwmidzvpiofnqexd`; this rollout does not
  change its schema, data, Auth, Storage, or global Vercel bindings.
- Authority: exactly one row in `private.coach_pilot_budgets` with code-owned id `a857fa8d-2bb8-4a7e-a190-5f8f1cf66229` and `scope_key = 'ask-trophe-shared'`.
- Runtime identity: the authenticated actor id must also appear in the server-only Preview allowlist. No request value can select the pilot id or actor id.

The branch-specific Vercel bindings override the existing global Preview values
only for this branch. The QA Auth actor and QA Storage endpoint use the same QA
project ref. A merged migration file still does not grant permission to run it
against production.

## One private application binding

The existing `OPENAI_API_KEY` binding is available to Preview. Its value was not
read or copied. All LIVE-01 flags, database, Auth, and public Supabase values are
additionally scoped to `codex/ag1-live01-integration`.

```sh
vercel env add OPENAI_API_KEY preview --project trophe --scope 2p6y54z6w9-4465s-projects --sensitive
```

The value is never copied into GitHub, a browser variable, a request, a log, or this runbook.

The pilot remains closed unless all server-side Preview variables are present:

- `COACH_ASSISTANT_ENABLED=1`
- `COACH_ASSISTANT_LIVE_PILOT_ENABLED=1`
- `TROPHE_ALLOW_PAID_AI=1`
- `COACH_ASSISTANT_PREVIEW_USER_IDS=<authorized actor UUID>`

Client Food confirmation also requires the existing `NEXT_PUBLIC_COACH_FOOD_ACTIONS_ENABLED=1`; it does not authorize provider spend.
Removing every UUID from `allowed_actor_ids` is the database-level kill switch and blocks all actors.

## QA database package

The empty QA project was created specifically for this slice, so no production
backup or copy was used. The exact repository migration chain through `0086` and
the two isolated Food dependencies were applied there. The immutable receipt is
recorded in `docs/ops/ask-trophe-live01-qa-evidence.md`.

For any future production operation, first capture an encrypted schema backup
outside the repository and record its checksum in the operator ticket:

```sh
supabase db dump --linked --schema public,private --file /encrypted/operator/path/trophe-live01-pre-ddl.sql
shasum -a 256 /encrypted/operator/path/trophe-live01-pre-ddl.sql
```

Then capture the current definitions and grants:

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
  500000000
);
COMMIT;
```

The daily hard cap is USD 3.00. The initial durable admission target is USD 0.50 across the app route and runner together, reset by the server's Bogotá calendar day. The first live smoke uses text only. No process-local counter can raise or reset this target.

Verify without exposing identity values:

```sql
SELECT scope_key, cap_nano_usd, operating_target_nano_usd,
       cardinality(allowed_actor_ids) AS allowed_actor_count,
       charged_nano_usd, attempt_count, accounting_blocked
FROM private.coach_pilot_budgets
WHERE id = 'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229';
```

Expected initial result: one row, actor count `1`, cap `3000000000`, target `500000000`, charged `0`, attempts `0`, blocked `false`.

Only after the first-smoke review passes, raise the ordinary operating target to USD 2.70 with one audited transaction. The update refuses to proceed if the authority is blocked, if its initial target changed, or if any reservation has an unresolved provider outcome:

```sql
BEGIN;
SELECT id, operating_target_nano_usd, charged_nano_usd, accounting_blocked
FROM private.coach_pilot_budgets
WHERE id = 'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229'
FOR UPDATE;

UPDATE private.coach_pilot_budgets AS budget
SET operating_target_nano_usd = 2700000000
WHERE budget.id = 'a857fa8d-2bb8-4a7e-a190-5f8f1cf66229'
  AND budget.operating_target_nano_usd = 500000000
  AND budget.charged_nano_usd <= 500000000
  AND budget.accounting_blocked = false
  AND NOT EXISTS (
    SELECT 1
    FROM public.agent_runs AS run
    WHERE run.metadata->'coachPilot'->'binding'->>'pilotId' = budget.id::text
      AND run.metadata->'coachPilot'->>'state' IN ('reserved', 'dispatched', 'unknown')
  )
RETURNING id, operating_target_nano_usd;

-- The UPDATE must return exactly 1 row before COMMIT. Otherwise ROLLBACK and investigate.
COMMIT;
```

## Rollback and impact

First disable `COACH_ASSISTANT_LIVE_PILOT_ENABLED`; this stops new paid dispatches without touching data. To return from the ordinary target to smoke-only admission, set `operating_target_nano_usd` back to `500000000` in a reviewed transaction. Preserve `agent_runs` because it is the accounting and audit record. If the pilot row has no attempts, remove only the fixed row. Dropping the table or indexes requires a separate reviewed migration after audit retention is resolved; restore from the captured dump only under the database incident procedure.

The schema change adds one private row and two partial expression indexes over `agent_runs` rows containing `metadata.coachPilot`. Index creation can briefly consume I/O and lock the target table. The current table size and lock window must be measured immediately before an authorized hosted operation.
