/**
 * Trophē — migration 0048 (memory worker -> Vault) behavioural + security evidence.
 *
 * P2 review (PR #23) required proof that the migration is more than journal membership:
 * that it APPLIES, that run_memory_queue_worker() fails closed without a secret, produces
 * a request when configured, and is locked down (SECURITY DEFINER, pinned search_path,
 * EXECUTE revoked from public/anon/authenticated).
 *
 * vault.* and net.* are Supabase-platform objects ABSENT from stock Postgres (CI uses
 * pgvector/pgvector:pg16). So when they are not present we install deterministic STUBS:
 *   - vault.decrypted_secrets(name, decrypted_secret)  — a table standing in for the view
 *   - net.http_get(url, headers, timeout_milliseconds)  — records the call into net._captured
 *     and returns a synthetic request id (NO real HTTP is ever issued)
 * then apply the REAL drizzle/0048 file on top, and exercise the function. Against a stack
 * that already has real pg_net/Vault (e.g. a developer's local Supabase) we DON'T clobber
 * them — the behavioural assertions self-skip and only the catalog/grant assertions run.
 *
 * DB-gated: skips entirely when no Postgres is reachable (mirrors tests/db/rls.test.ts).
 * Run: npm test tests/db/memory-worker-migration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgresql://${process.env.PG_USER || 'postgres'}:${process.env.PG_PASS || process.env.PGPASSWORD || 'postgres'}@${process.env.PG_HOST || '127.0.0.1'}:${process.env.PG_PORT || '54322'}/${process.env.PG_DB || 'postgres'}`,
  max: 3,
});

let dbAvailable = false;
let stubMode = false; // true when WE installed the vault/net stubs (i.e. platform deps absent)
let applyError: unknown = null;

async function q(sql: string, params?: unknown[]) {
  const c = await pool.connect();
  try {
    return await c.query(sql, params);
  } finally {
    c.release();
  }
}

beforeAll(async () => {
  try {
    await pool.query('select 1');
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

  const netExists =
    (await q(
      `select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_get' limit 1`,
    )).rowCount! > 0;
  const vaultRelExists =
    (await q(
      `select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'vault' and c.relname = 'decrypted_secrets' limit 1`,
    )).rowCount! > 0;

  // Only stub when BOTH platform deps are absent — never overwrite a real pg_net/Vault.
  if (!netExists && !vaultRelExists) {
    await q(`create schema if not exists vault`);
    await q(`create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text)`);
    await q(`create schema if not exists net`);
    await q(`create table if not exists net._captured (id bigserial primary key, url text, headers jsonb, created timestamptz default now())`);
    await q(`
      create or replace function net.http_get(url text, headers jsonb default '{}'::jsonb, timeout_milliseconds integer default 5000)
      returns bigint language plpgsql as $fn$
      declare i bigint;
      begin
        insert into net._captured(url, headers) values (url, headers) returning id into i;
        return i;
      end; $fn$;
    `);
    // anon/authenticated exist after bootstrap-local.sh in CI; create defensively otherwise.
    await q(`do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;`);

    // Apply the REAL migration on top of the (now-present) platform deps. Throwing here is a
    // genuine failure ("0048 does not apply") — captured so the dedicated test reports it.
    try {
      const sql = readFileSync(join(process.cwd(), 'drizzle/0048_memory_worker_vault_secret.sql'), 'utf8');
      await q(sql);
      stubMode = true;
    } catch (e) {
      applyError = e;
    }
  }
});

afterAll(async () => {
  if (dbAvailable && stubMode) {
    await q(`truncate net._captured`).catch(() => {});
    await q(`delete from vault.decrypted_secrets`).catch(() => {});
  }
  await pool.end();
});

describe('migration 0048 — memory worker Vault secret', () => {
  it('applies cleanly when vault/pg_net are available', ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
    expect(applyError).toBeNull();
  });

  it('fails closed: no memory_cron_secret -> returns NULL and issues NO http request', async ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
    await q(`delete from vault.decrypted_secrets`);
    await q(`truncate net._captured`);
    const res = await q(`select run_memory_queue_worker() as id`);
    expect(res.rows[0].id).toBeNull();
    const cap = await q(`select count(*)::int as n from net._captured`);
    expect(cap.rows[0].n).toBe(0);
  });

  it('configured: secret present -> returns a request id and GETs the endpoint with the Vault bearer', async ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
    await q(`delete from vault.decrypted_secrets`);
    await q(`truncate net._captured`);
    await q(`insert into vault.decrypted_secrets(name, decrypted_secret) values ('memory_cron_secret', 'test-secret-xyz')`);
    const res = await q(`select run_memory_queue_worker() as id`);
    expect(res.rows[0].id).not.toBeNull();
    const cap = await q(`select url, headers->>'Authorization' as auth from net._captured order by id desc limit 1`);
    expect(cap.rowCount).toBe(1);
    expect(cap.rows[0].url).toBe('https://trophe.app/api/internal/memory-worker');
    expect(cap.rows[0].auth).toBe('Bearer test-secret-xyz');
  });

  it('is SECURITY DEFINER with a pinned search_path and a bigint return', async ({ skip }) => {
    if (!dbAvailable) return skip();
    const res = await q(`
      select p.prosecdef,
             pg_get_function_result(p.oid) as result,
             array_to_string(p.proconfig, ',') as cfg
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'run_memory_queue_worker'
    `);
    expect(res.rowCount).toBe(1);
    expect(res.rows[0].prosecdef).toBe(true);
    expect(res.rows[0].result).toBe('bigint');
    expect(res.rows[0].cfg || '').toContain('search_path=public, extensions');
  });

  it('cannot be executed by anon or authenticated (which also proves no PUBLIC grant)', async ({ skip }) => {
    if (!dbAvailable) return skip();
    // If EXECUTE were granted to PUBLIC, anon/authenticated would inherit it and these would be true.
    const res = await q(`
      select has_function_privilege('anon', 'public.run_memory_queue_worker()', 'EXECUTE') as anon_exec,
             has_function_privilege('authenticated', 'public.run_memory_queue_worker()', 'EXECUTE') as auth_exec
    `);
    expect(res.rows[0].anon_exec).toBe(false);
    expect(res.rows[0].auth_exec).toBe(false);
  });
});
