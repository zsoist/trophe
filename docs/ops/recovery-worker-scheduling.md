# WP1 recovery-worker scheduling

The reservation recovery worker is exposed at `GET /api/cron/recover-reservations`
(protected by `Authorization: Bearer ${CRON_SECRET}`). It must run every few minutes
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

-- store the endpoint + secret in Vault (do NOT hardcode in a migration)
select vault.create_secret('https://trophe.app/api/cron/recover-reservations', 'recovery_cron_url');
select vault.create_secret('<CRON_SECRET value>', 'recovery_cron_secret');

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
pg_cron workers at once (observed: a 401 on the memory worker during the WP1 rollout). Each receiver
now accepts its **own** secret — `RECOVERY_CRON_SECRET` for `/api/cron/recover-reservations`,
`MEMORY_CRON_SECRET` for `/api/internal/memory-worker` — with a **backward-compat window** on the
legacy shared `CRON_SECRET` (`lib/auth/cron-auth.ts` accepts either).

> ⚠️ **The two senders use DIFFERENT secret stores — their cutovers are NOT symmetric.**
> - **`recover-reservations`** reads its bearer from **Supabase Vault**
>   (`vault.decrypted_secrets('recovery_cron_secret')`) inside its `net.http_post` cron command, at
>   run time.
> - **`trophe-memory-worker`** is just `SELECT run_memory_queue_worker()` — a SECURITY DEFINER
>   function (`drizzle/0015_memory_queue_scheduler.sql`) that reads its bearer from the
>   **`app_scheduler_secrets` config table** (`WHERE name = 'memory_worker'`) and `net.http_get`s the
>   endpoint. It does **NOT** read Vault. A `memory_cron_secret` Vault object would be dead weight,
>   and re-`cron.schedule`-ing the bare function call changes nothing.
>
> Following the recovery (Vault) recipe for the memory worker leaves the real memory secret
> unrotated. Then step 5 (removing the shared `CRON_SECRET`) yields a silent **401**: `pg_net` is
> fire-and-forget, so `cron.job_run_details` still shows `succeeded` and the failure only appears in
> `net._http_response.status_code` — a silent memory-queue stall.

**Secret hygiene (every step):** operator-run only — never print, echo, paste, log, or commit a
secret value. `<RECOVERY value>` / `<MEMORY value>` are placeholders for freshly generated random
secrets.

Cutover, zero-downtime:

1. **Deploy this code first.** The receivers still accept the shared `CRON_SECRET`, so nothing breaks
   while you migrate the senders one at a time. (Vercel env-var changes only take effect on a **new
   deployment** — trigger a redeploy after each `*_CRON_SECRET` change in steps 2–3, before the
   step-4 checks.)

2. **Rotate the RECOVERY worker — Vault-backed.** Generate `<RECOVERY value>`, set it in BOTH places
   so sender and receiver agree:
   - Receiver: Vercel Production env `RECOVERY_CRON_SECRET = <RECOVERY value>` (then redeploy).
   - Sender: update the existing Vault secret **in place** — the cron command already reads it by
     name, so there is **no need to re-`cron.schedule`**:
     ```sql
     select vault.update_secret(
       (select id from vault.secrets where name = 'recovery_cron_secret'),
       '<RECOVERY value>'
     );
     ```

3. **Rotate the MEMORY worker — config-table-backed, NOT Vault.** Generate `<MEMORY value>`:
   - Receiver: Vercel Production env `MEMORY_CRON_SECRET = <MEMORY value>` (then redeploy).
   - Sender: update the one config row the function reads. The row already exists, so this is an
     **`UPDATE`** (not an insert), and the bare `SELECT run_memory_queue_worker()` job needs no
     change:
     ```sql
     update app_scheduler_secrets
        set value = '<MEMORY value>', updated_at = now()
      where name = 'memory_worker';
     ```
   Do **not** create a `memory_cron_secret` Vault object, and do **not** re-`cron.schedule` this job.

4. **Verify 200 per worker BEFORE removing the shared secret.** `cron.job_run_details` is not a
   truthful signal here (it shows the `pg_net` enqueue, not the HTTP status). For **each** worker:
   - **Receiver check (unambiguous):** call each endpoint with its NEW secret → expect **200**, and
     with a bogus secret → expect **401** (proves the receiver actually enforces it):
     ```
     curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <RECOVERY value>" https://trophe.app/api/cron/recover-reservations   # expect 200
     curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer <MEMORY value>"   https://trophe.app/api/internal/memory-worker      # expect 200
     curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer nope"             https://trophe.app/api/internal/memory-worker      # expect 401
     ```
   - **Sender check (scheduled path):** wait at least one `*/5` tick after steps 2–3, then confirm
     the scheduled calls are clean — no non-200 in the recent window:
     ```sql
     select status_code, error_msg, created
     from net._http_response
     where created > now() - interval '12 minutes'
     order by created desc;   -- every row should be 200; investigate any null / 4xx / 5xx
     ```
   Only when **both** workers show 200 on their NEW secret from the scheduled path do you proceed.

5. **Remove the shared secret — point of no return.** Delete `CRON_SECRET` from Vercel Production
   (then redeploy). The code fallback self-disables (the env var becomes `undefined`, so
   `cronBearerValid` ignores it). There is **no shared `CRON_SECRET` Vault object** to remove — the
   recovery sender uses `recovery_cron_secret` in Vault, the memory sender uses `app_scheduler_secrets`.

**Rollback.** Until step 5, rollback is trivial: the receivers still accept the shared `CRON_SECRET`,
so reverting a sender (restore the prior Vault value via `vault.update_secret`, or the prior
`app_scheduler_secrets` row value) — or a Vercel per-worker var — brings the worker back to green with
no gap. After step 5, if a worker 401s, the fast recovery is to re-add `CRON_SECRET` to Vercel (and
redeploy; receivers accept it again immediately) and set that worker's sender back to that value, then
retry the rotation.

**Residual risk.** The memory worker's secret lives **plaintext** in `app_scheduler_secrets.value`
(RLS-enabled, `REVOKE`d from `anon`/`authenticated`, reachable only by the SECURITY DEFINER function
and the DB owner / service role) — unlike the recovery secret, which is encrypted in Vault. A future
hardening could move the memory secret into Vault and have `run_memory_queue_worker()` read
`vault.decrypted_secrets('memory_worker')`, converging the two mechanisms.
