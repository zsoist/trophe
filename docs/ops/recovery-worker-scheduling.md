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

Originally both pg_cron workers (`recover-reservations` and `trophe-memory-worker`) shared
one `CRON_SECRET`, so rotating it invalidated **both** until each was re-synced (observed: a
401 on the memory worker during the WP1 rollout). Each worker now accepts its **own** secret —
`RECOVERY_CRON_SECRET` for `/api/cron/recover-reservations`, `MEMORY_CRON_SECRET` for
`/api/internal/memory-worker` — with a **backward-compat window** on the legacy shared
`CRON_SECRET` (`lib/auth/cron-auth.ts` accepts either). Cutover, zero-downtime:

1. **Deploy this code first** (it still accepts the shared `CRON_SECRET`, so nothing breaks).
2. Generate two fresh secrets. For each worker, write the value to **Vercel** (Production env:
   `RECOVERY_CRON_SECRET` / `MEMORY_CRON_SECRET`) **and** Supabase Vault, in one operation
   (Vercel "Sensitive" vars can't be pulled back). Operator-run — never print/commit the values.
   ```sql
   select vault.create_secret('<RECOVERY value>', 'recovery_cron_secret');
   select vault.create_secret('<MEMORY value>',   'memory_cron_secret');
   ```
3. Point each cron job at its own Vault secret by name (re-`cron.schedule` with the same job name
   to replace): the recovery job reads `recovery_cron_secret`, the memory job `memory_cron_secret`.
4. Verify each returns **200** in `net._http_response`, then remove the shared `CRON_SECRET` from
   Vercel + Vault. The code fallback then self-disables (the env var becomes `undefined`).
