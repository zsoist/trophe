# WP1 recovery-worker scheduling

The reservation recovery worker is exposed at `GET /api/cron/recover-reservations`
(protected by `Authorization: Bearer ${RECOVERY_CRON_SECRET}` — the legacy shared
`CRON_SECRET` is also accepted, but only during the P2 cutover window; see
[Per-worker secrets (P2)](#per-worker-secrets-p2)). It must run every few minutes
because invite reservations expire on the order of ~15 minutes.

## Why not Vercel Cron

The linked Vercel team is on the **Hobby** plan, which permits cron execution **once
per day** ([Vercel cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)).
A daily run cannot recover a 15-minute reservation, so a `*/5` entry in `vercel.json`
would simply fail to deploy. The Vercel cron config has therefore been removed.

## Chosen scheduler: Supabase `pg_cron` + `pg_net`

Supabase ships `pg_cron` (scheduler) and `pg_net` (async HTTP from Postgres) — free on
the current plan. Install **at deploy time** (not applied by app migrations; it needs
the endpoint URL + secret, which live in Vault, and the extensions enabled once):

```sql
-- one-time, as the Supabase owner/admin
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- store the endpoint + a DEDICATED per-worker secret in Vault (do NOT hardcode in a migration).
-- recovery_cron_secret must match the Vercel Production env RECOVERY_CRON_SECRET — NOT the legacy
-- shared CRON_SECRET, which is temporary cutover compatibility only (see Per-worker secrets (P2)).
select vault.create_secret('https://trophe.app/api/cron/recover-reservations', 'recovery_cron_url');
select vault.create_secret('<RECOVERY_CRON_SECRET value>', 'recovery_cron_secret');

-- run every 5 minutes
select cron.schedule('recover-reservations', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'recovery_cron_url'),
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'recovery_cron_secret'),
      'Content-Type', 'application/json'
    ),
    -- pg_net defaults to 2000ms; this endpoint shares one bounded budget of up to 20
    -- reservations across all THREE passes (8 orphan + 6 cancelled-tombstone + 6
    -- completed-stray), each a few Auth/RPC calls — comfortably under the 60s function
    -- cap. Allow longer than the cap anyway.
    timeout_milliseconds := 65000
  );
$$);
```

To remove: `select cron.unschedule('recover-reservations');`

### Monitoring

The endpoint returns **HTTP 500** whenever either pass reports logical errors (Auth
failures, tag mismatches, lost leases) — not just on crashes — so degraded runs are
visible to the non-2xx alert below rather than hiding behind a 200 with error counters.

`pg_net` is fire-and-forget; responses land in `net._http_response`. Alert on
timeouts and non-2xx so a silently-failing worker is visible:

```sql
-- recent failures (timeout → status_code IS NULL / error_msg set; or status_code >= 300)
select id, status_code, error_msg, created
from net._http_response
where created > now() - interval '1 hour'
  and (status_code is null or status_code >= 300)
order by created desc;
```

Wire that query into the existing Mission-Control / uptime alerting (non-empty result
→ page). Also confirm `select * from cron.job_run_details` shows the job firing on
schedule.

## Alternatives

- **Vercel Pro** — enables minute-granularity Vercel Cron; then re-add the `crons` entry
  to `vercel.json`. Costs money; rejected under the cost mandate.
- **External scheduler** (GitHub Actions `schedule`, an uptime pinger) POSTing the same
  endpoint with the bearer secret. Works, but adds an off-platform dependency.

The endpoint itself is scheduler-agnostic: anything that can issue an authenticated
`GET`/`POST` every few minutes will drive it.

## Per-worker secrets (P2)

Originally the receivers checked one shared `CRON_SECRET`, so rotating it could invalidate **both**
pg_cron workers at once (observed: a 401 on the memory worker during the WP1 rollout). After this work
each worker has its **own** secret, end to end — sender **and** receiver — so either can be rotated with
no effect on the other. The receivers accept the per-worker secret (`RECOVERY_CRON_SECRET` for
`/api/cron/recover-reservations`, `MEMORY_CRON_SECRET` for `/api/internal/memory-worker`) with a
**backward-compat window** on the legacy shared `CRON_SECRET` (`lib/auth/cron-auth.ts` accepts either).

Both senders read their bearer from **Supabase Vault** — symmetric, no plaintext at rest:
- **`recover-reservations`** — the cron command is an inline `net.http_post` that reads
  `vault.decrypted_secrets('recovery_cron_secret')` at run time (unchanged; wired since WP1).
- **`trophe-memory-worker`** — the cron command is `SELECT run_memory_queue_worker()`. Migration
  `drizzle/0048_memory_worker_vault_secret.sql` rewrites that SECURITY DEFINER function to read
  `vault.decrypted_secrets('memory_cron_secret')` (it previously read the plaintext
  `app_scheduler_secrets` config table). The function **fails closed** if the Vault secret is missing
  and **returns its `pg_net` request id** so a scheduled send can be proven 200 (see step 5).

> ⚠️ **`pg_net` is fire-and-forget.** `cron.job_run_details` shows `succeeded` for the *enqueue*, even
> when the HTTP call later returns 401. The only truthful signal is `net._http_response.status_code` —
> which is why the cutover never removes the shared secret until each worker is proven 200 on its own
> secret from the scheduled path.

**Secret hygiene (every step):** operator-run only — never print, echo, paste, log, or commit a secret
value. `<RECOVERY value>` / `<MEMORY value>` are placeholders for freshly generated random secrets; each
must match between the sender (Vault) and the receiver (Vercel env) for that worker.

Cutover, zero-downtime (apply in order):

1. **Deploy the app code first.** The receivers still accept the shared `CRON_SECRET`, so nothing breaks
   while you migrate the senders one at a time. (Vercel env-var changes take effect only on a **new
   deployment** — redeploy after each `*_CRON_SECRET` change, before the step-5 checks.)

2. **Seed the memory Vault secret BEFORE applying migration 0048.** Create `memory_cron_secret` with the
   value the memory receiver currently accepts (the present shared secret), so the function keeps working
   the instant it starts reading Vault:
   ```sql
   select vault.create_secret('<current shared secret value>', 'memory_cron_secret');
   ```
   Then apply `drizzle/0048_memory_worker_vault_secret.sql` (operator-applied; **not** run by CI). After
   it lands, `run_memory_queue_worker()` reads the bearer from Vault and the plaintext
   `app_scheduler_secrets` row is no longer consulted (you may delete that row later — see Residual risk).

3. **Rotate the RECOVERY worker.** Generate `<RECOVERY value>`:
   - Receiver: Vercel Production `RECOVERY_CRON_SECRET = <RECOVERY value>` (then redeploy).
   - Sender: update the Vault secret in place (the cron command reads it by name — no re-`cron.schedule`):
     ```sql
     select vault.update_secret(
       (select id from vault.secrets where name = 'recovery_cron_secret'),
       '<RECOVERY value>'
     );
     ```

4. **Rotate the MEMORY worker.** Generate `<MEMORY value>`:
   - Receiver: Vercel Production `MEMORY_CRON_SECRET = <MEMORY value>` (then redeploy).
   - Sender: update the Vault secret in place (the function reads it by name — no migration, no
     re-`cron.schedule`):
     ```sql
     select vault.update_secret(
       (select id from vault.secrets where name = 'memory_cron_secret'),
       '<MEMORY value>'
     );
     ```

5. **Prove 200 PER WORKER from the scheduled path — before removing the shared secret.** Do **not** infer
   success from an undifferentiated `net._http_response` list: status alone cannot tell you which row
   belongs to which worker. Correlate each worker to its own response by the `pg_net` **request id**:

   - **Recovery** — run the worker's own cron body once; it returns the request id, then read that exact
     response (the id ties the 200 to the recovery sender using `recovery_cron_secret`):
     ```sql
     select net.http_post(
       url     := (select decrypted_secret from vault.decrypted_secrets where name = 'recovery_cron_url'),
       headers := jsonb_build_object(
         'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'recovery_cron_secret'),
         'Content-Type', 'application/json'),
       body := '{}'::jsonb, timeout_milliseconds := 65000
     );   -- note the returned id
     -- a few seconds later, using that id:
     select status_code from net._http_response where id = <recovery request id>;   -- expect 200
     ```
   - **Memory** — `run_memory_queue_worker()` returns its own request id (per 0048):
     ```sql
     select run_memory_queue_worker();   -- note the returned id (NULL ⇒ failed closed: Vault secret missing)
     -- a few seconds later, using that id:
     select status_code from net._http_response where id = <memory request id>;     -- expect 200
     ```
   - **Negative receiver check** (proves the receiver actually enforces auth): a bogus bearer must 401:
     ```
     curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer nope" https://trophe.app/api/internal/memory-worker   # expect 401
     ```
   Proceed only when **both** request-id lookups show **200**.

6. **Remove the shared secret — point of no return.** Delete `CRON_SECRET` from Vercel Production (then
   redeploy). `cronBearerValid` then ignores it (the env var becomes `undefined`). There is no shared
   `CRON_SECRET` Vault object to remove — each sender now reads its own Vault secret.

**Rollback.**
- **Before step 6** rollback is trivial: the receivers still accept the shared `CRON_SECRET`, so reverting
  a worker's Vault value (`vault.update_secret`) and/or its Vercel per-worker var restores it with no gap.
- **If migration 0048 misbehaves:** revert at the function level by shipping a *new* forward-only migration
  that restores `run_memory_queue_worker()` to the `app_scheduler_secrets` reader from
  `drizzle/0015_memory_queue_scheduler.sql` (do **not** edit 0015). Because step 2 seeded
  `memory_cron_secret` with the still-valid value, the migrated function is green the moment it lands, so
  this revert is rarely needed.
- **After step 6**, if a worker 401s: re-add `CRON_SECRET` to Vercel (redeploy) to reopen the compat
  window immediately, then fix that worker's Vault value and retry.

**Residual risk.** With 0048 applied, **both** secrets are encrypted in Vault — the earlier plaintext-at-
rest exposure of the memory secret (`app_scheduler_secrets.value`) is removed, and that row becomes
vestigial (safe to delete). Remaining: `net._http_response` has no per-worker URL column, so **ongoing**
monitoring must alert on ANY non-200 (wire the [Monitoring](#monitoring) query into Mission-Control)
rather than per-worker; and the recovery endpoint's errors→500 signal has no memory-side equivalent (the
memory endpoint returns whatever `processMemoryQueue()` yields).
