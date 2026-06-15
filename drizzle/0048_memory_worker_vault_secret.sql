-- 0048_memory_worker_vault_secret.sql
-- P2 option (b): move the memory worker's outbound bearer from the plaintext
-- `app_scheduler_secrets` config table into Supabase Vault, mirroring the recovery
-- worker (which already reads vault.decrypted_secrets('recovery_cron_secret')).
--
-- Forward-only. Does NOT edit 0015_memory_queue_scheduler.sql. Secret VALUES never
-- live in a migration — the operator creates the Vault secret 'memory_cron_secret'
-- out of band (see docs/ops/recovery-worker-scheduling.md → Per-worker secrets (P2)).
--
-- APPLICATION: this file is journaled (drizzle/meta/_journal.json), so any migrate run
-- — CI/dev `scripts/db/run-migrations.ts`, or a prod migrate — applies it automatically.
-- It is NOT "operator-only". The PREFLIGHT below makes that safe: if Vault is present but
-- 'memory_cron_secret' is not yet seeded, the migration RAISES and the whole transaction
-- rolls back BEFORE the drop, leaving the existing (config-table-backed) function untouched
-- and the memory worker still processing. So the operator MUST seed the Vault secret first
-- (runbook step 2); skipping it makes the migration fail LOUDLY rather than silently
-- disabling the worker.
--
-- run_memory_queue_worker() after this migration:
--   * reads its bearer from vault.decrypted_secrets WHERE name = 'memory_cron_secret'
--     (no longer from app_scheduler_secrets);
--   * FAILS CLOSED at runtime too — if the secret is later absent/empty it logs a warning
--     and returns WITHOUT issuing an unauthenticated request;
--   * RETURNS the pg_net request id (bigint) so a manual `select run_memory_queue_worker()`
--     can be correlated to its net._http_response row for per-worker 200 verification;
--   * keeps SECURITY DEFINER, a pinned search_path, and EXECUTE revoked from
--     public / anon / authenticated.
--
-- Return type changes void -> bigint, so the function is dropped and recreated
-- (CREATE OR REPLACE cannot change a return type). The 'trophe-memory-worker' pg_cron
-- job (`SELECT run_memory_queue_worker()`) references the function by name in its command
-- text, so the drop+recreate needs no re-schedule.

-- ── PREFLIGHT (P0): refuse to replace the working function unless the new Vault secret
--    already exists. Enforced only where Vault is installed (prod); skipped on a stock/CI
--    Postgres without the vault extension, where the function is created for structure but
--    never invoked. Runs BEFORE the drop, so on abort the existing function is preserved.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'vault' and table_name = 'decrypted_secrets'
  ) then
    if not exists (
      select 1 from vault.decrypted_secrets
      where name = 'memory_cron_secret' and coalesce(length(decrypted_secret), 0) > 0
    ) then
      raise exception using
        message = 'Migration 0048 aborted: Vault secret "memory_cron_secret" is not configured.',
        detail  = 'Seed it FIRST — select vault.create_secret(''<value>'', ''memory_cron_secret'') — see docs/ops/recovery-worker-scheduling.md step 2.',
        hint    = 'Applying 0048 without the secret would replace the working memory worker with one that cannot authenticate; this migration fails closed instead.';
    end if;
  end if;
end $$;

drop function if exists run_memory_queue_worker();

create function run_memory_queue_worker()
returns bigint
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  worker_secret text;
  request_id bigint;
begin
  select decrypted_secret into worker_secret
  from vault.decrypted_secrets
  where name = 'memory_cron_secret';

  -- Fail closed: never POST without a real bearer (an unauthenticated send would
  -- 401 silently behind pg_net's fire-and-forget queue).
  if worker_secret is null or length(worker_secret) = 0 then
    raise warning 'run_memory_queue_worker: vault secret memory_cron_secret is not configured; skipping send';
    return null;
  end if;

  select net.http_get(
    url := 'https://trophe.app/api/internal/memory-worker',
    headers := jsonb_build_object('Authorization', 'Bearer ' || worker_secret),
    timeout_milliseconds := 55000
  ) into request_id;

  return request_id;
end;
$$;

revoke all on function run_memory_queue_worker() from public, anon, authenticated;
