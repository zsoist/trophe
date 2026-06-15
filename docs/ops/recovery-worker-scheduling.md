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
    -- reservations across both passes (12 orphan + 8 tombstone), each a few Auth/RPC
    -- calls — comfortably under the 60s function cap. Allow longer than the cap anyway.
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
