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
`/api/cron/recover-reservations`, `MEMORY_CRON_SECRET` for `/api/internal/memory-worker`). The legacy shared `CRON_SECRET` fallback has
been **removed** (Phase 2, this change) — each route accepts **only** its per-worker secret.

> Note: the shared-secret blast radius is now **eliminated**, not merely disabled — Phase 2 (this change)
> dropped the `CRON_SECRET` fallback from both routes, so re-adding the env var has **no effect**; each
> route authenticates **only** with its own per-worker secret. (`tests/api/cron-secret-isolation.test.ts`
> proves a `Bearer <old shared>` can never authorize either endpoint, set or unset.)

Both senders read their bearer from **Supabase Vault** — symmetric, no plaintext at rest:
- **`recover-reservations`** — the cron command is an inline `net.http_post` that reads
  `vault.decrypted_secrets('recovery_cron_secret')` at run time (unchanged; wired since WP1).
- **`trophe-memory-worker`** — the cron command is `SELECT run_memory_queue_worker()`. Migration
  `drizzle/0048_memory_worker_vault_secret.sql` rewrites that SECURITY DEFINER function to read
  `vault.decrypted_secrets('memory_cron_secret')` (it previously read the plaintext
  `app_scheduler_secrets` config table). The function **fails closed** if the Vault secret is missing
  and **returns its `pg_net` request id** so a send can be proven 200 by request id (see step 5).

> ⚠️ **`pg_net` is fire-and-forget.** `cron.job_run_details` shows `succeeded` for the *enqueue*, even
> when the HTTP call later returns 401. The only truthful signal is `net._http_response.status_code` —
> which is why the cutover never removes the shared secret until each worker is proven 200 on its own
> secret (step 5 — both gates).

**Secret hygiene (every step):** operator-run only — never print, echo, paste, log, or commit a secret
value. `<RECOVERY value>` / `<MEMORY value>` are placeholders for freshly generated random secrets; each
must match between the sender (Vault) and the receiver (Vercel env) for that worker.

Cutover, zero-downtime (apply in order):

1. **Deploy the app code first.** The receivers still accept the shared `CRON_SECRET`, so nothing breaks
   while you migrate the senders one at a time. (Vercel env-var changes take effect only on a **new
   deployment** — redeploy after each `*_CRON_SECRET` change, before the step-5 checks.)

2. **Seed the memory Vault secret BEFORE migration 0048 is applied.** Create `memory_cron_secret` with the
   value the memory receiver currently accepts (the present shared secret), so the function keeps working
   the instant it starts reading Vault:
   ```sql
   select vault.create_secret('<current shared secret value>', 'memory_cron_secret');
   ```
   **Ordering is mandatory — and enforced.** `drizzle/0048` is **journaled**, so any migrate run
   (`scripts/db/run-migrations.ts` in a CI/dev bootstrap, or a prod migrate) applies it automatically — it
   is **not** operator-only. Its preflight **aborts** (raises, rolling back *before* the drop) if Vault is
   present but `memory_cron_secret` is unseeded, leaving the existing `app_scheduler_secrets`-backed
   function intact. So skipping this seed makes the migration fail **loudly** rather than silently
   disabling the worker — seed first, then apply. After 0048 lands, `run_memory_queue_worker()` reads the
   bearer from Vault and the plaintext `app_scheduler_secrets` row is no longer consulted (you may delete
   that row later — see Residual risk).

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

5. **Verify BEFORE removing the shared secret — two separate gates, both required.**
   `cron.job_run_details` is not a sufficient signal: it shows the `pg_net` *enqueue* (`succeeded`) even
   when the HTTP call later 401s. And manual invocation proves the *sender code* works, **not** that the
   installed scheduler fired it. So check both gates:

   **Gate A — sender-path proof (the secret + sender are correct).** Invoke each worker's own send path
   once, capture the `pg_net` request id, and read that exact response. This proves the per-worker secret
   authorizes — but it is a MANUAL call, so on its own it does **not** prove the scheduled job did it:
   ```sql
   -- recovery (the cron command's own body):
   select net.http_post(
     url     := (select decrypted_secret from vault.decrypted_secrets where name = 'recovery_cron_url'),
     headers := jsonb_build_object(
       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'recovery_cron_secret'),
       'Content-Type', 'application/json'),
     body := '{}'::jsonb, timeout_milliseconds := 65000
   );   -- note the returned id
   select status_code from net._http_response where id = <recovery request id>;   -- expect 200

   -- memory (run_memory_queue_worker returns its request id per 0048):
   select run_memory_queue_worker();   -- note the id (NULL ⇒ failed closed: Vault secret missing)
   select status_code from net._http_response where id = <memory request id>;     -- expect 200
   ```
   Negative check (the receiver actually enforces auth): `curl -s -o /dev/null -w '%{http_code}\n'
   -H "Authorization: Bearer nope" https://trophe.app/api/internal/memory-worker` → expect **401**.

   **Gate B — installed-scheduler proof (the cron jobs are live and fired on their own).** Confirm both
   jobs are active and have actually run since cutover:
   ```sql
   -- both jobs present, every-5-min, active:
   select jobname, schedule, active from cron.job
   where jobname in ('recover-reservations','trophe-memory-worker');
   -- both fired AFTER the cutover timestamp (status 'succeeded' = enqueued, NOT the HTTP status):
   select jobid, status, start_time from cron.job_run_details
   where start_time > '<cutover UTC timestamp>' order by start_time desc limit 10;
   -- and the scheduled HTTP results since cutover are all 200 (investigate ANY non-200):
   select status_code, count(*) from net._http_response
   where created > '<cutover UTC timestamp>' group by status_code;
   ```
   `net._http_response` carries no per-worker URL column, so that last query is a **window** correlation,
   not a per-worker one — it proves "no scheduled run 401'd since cutover", not "this exact job's request
   was 200". For durable, unambiguous per-scheduled-request proof, add a per-worker audit column (each
   sender records its request id + worker name into an app table); tracked as a follow-up, not required
   for this cutover.

   Proceed to step 6 only when **Gate A shows 200 for both senders AND Gate B shows both jobs fired
   post-cutover with zero non-200 in `net._http_response`.**

6. **Retire the shared secret (Phase 2 — this change).** Deploy the build that drops the `CRON_SECRET`
   fallback from both routes (Phase 2 below), then delete the now-dead `CRON_SECRET` from Vercel
   Production. After this deploy the routes accept **only** their per-worker secret — re-adding
   `CRON_SECRET` does nothing. There is no shared `CRON_SECRET` Vault object to remove; each sender reads
   its own Vault secret.

**Rollback.**
- **Before Phase 2 is deployed**, rollback is trivial: the receivers still accept the shared `CRON_SECRET`,
  so reverting a worker's Vault value (`vault.update_secret`) and/or its Vercel per-worker var restores it
  with no gap.
- **If migration 0048 misbehaves:** revert at the function level by shipping a *new* forward-only migration
  that restores `run_memory_queue_worker()` to the `app_scheduler_secrets` reader from
  `drizzle/0015_memory_queue_scheduler.sql` (do **not** edit 0015). Because step 2 seeded
  `memory_cron_secret` with the still-valid value, the migrated function is green the moment it lands, so
  this revert is rarely needed.
- **After Phase 2 is deployed**, the shared secret is dead — do **not** restore `CRON_SECRET` (the routes
  ignore it). If a worker 401s, recover per-worker: restore that worker's **Vault** secret to the value
  matching its Vercel per-worker env (`vault.update_secret`), or roll the app back to the
  immediately-prior deployment (which still honored the shared fallback) while you fix the per-worker
  secret, then redeploy Phase 2.

## Phase 2 — shared secret permanently retired (this change; deploy AFTER cutover step 5)

Steps 1–5 make each worker independent, but on their own only **disable** the shared-secret blast radius:
the fallback code path would otherwise let a re-added `CRON_SECRET` reauthorize both workers. **This change
eliminates it for good:**

1. Dropped the `CRON_SECRET` argument from both call sites — `cronBearerValid` now accepts **only** the
   per-worker secret (`app/api/cron/recover-reservations/route.ts`, `app/api/internal/memory-worker/route.ts`).
2. Removed `CRON_SECRET` from `.env.local.example`.
3. `tests/api/cron-secret-isolation.test.ts` asserts a `Bearer <old shared>` can **never** authorize
   either endpoint — even if `CRON_SECRET` is set in the environment.

**Deploy ordering (critical):** ship this change **only after** cutover step 5 passes (both workers proven
200 on their per-worker secret). Deploying it earlier would 401 any worker still sending the shared secret.

**Residual risk.** With 0048 applied, **both** secrets are encrypted in Vault — the earlier plaintext-at-
rest exposure of the memory secret (`app_scheduler_secrets.value`) is removed, and that row becomes
vestigial (safe to delete). Remaining: `net._http_response` has no per-worker URL column, so **ongoing**
monitoring must alert on ANY non-200 (wire the [Monitoring](#monitoring) query into Mission-Control)
rather than per-worker; and the recovery endpoint's errors→500 signal has no memory-side equivalent (the
memory endpoint returns whatever `processMemoryQueue()` yields).
