-- 0048_memory_worker_vault_secret.sql
-- P2 option (b): move the memory worker's outbound bearer from the plaintext
-- `app_scheduler_secrets` config table into Supabase Vault, mirroring the recovery
-- worker (which already reads vault.decrypted_secrets('recovery_cron_secret')).
--
-- Forward-only. Does NOT edit 0015_memory_queue_scheduler.sql. Secret VALUES never
-- live in a migration — the operator creates the Vault secret 'memory_cron_secret'
-- out of band (see docs/ops/recovery-worker-scheduling.md → Per-worker secrets (P2)).
-- Applied by the operator at cutover, NOT by CI.
--
-- run_memory_queue_worker() after this migration:
--   * reads its bearer from vault.decrypted_secrets WHERE name = 'memory_cron_secret'
--     (no longer from app_scheduler_secrets);
--   * FAILS CLOSED — if the secret is absent/empty it logs a warning and returns
--     WITHOUT issuing an unauthenticated request;
--   * RETURNS the pg_net request id (bigint) so a manual `select run_memory_queue_worker()`
--     can be correlated to its net._http_response row for per-worker 200 verification;
--   * keeps SECURITY DEFINER, a pinned search_path, and EXECUTE revoked from
--     public / anon / authenticated.
--
-- Return type changes void -> bigint, so the function is dropped and recreated
-- (CREATE OR REPLACE cannot change a return type). The 'trophe-memory-worker' pg_cron
-- job (`SELECT run_memory_queue_worker()`) references the function by name in its command
-- text, so the drop+recreate needs no re-schedule.

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
