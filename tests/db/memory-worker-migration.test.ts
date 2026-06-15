/**
 * Trophē — migration 0048 (memory worker -> Vault) behavioural + security evidence.
 *
 * P2 review required proof that 0048 is more than journal membership: that it ABORTS
 * safely when the Vault secret is missing (preserving the working function), APPLIES when
 * the secret is present, fails closed at runtime, and is locked down (SECURITY DEFINER,
 * pinned search_path, EXECUTE revoked from public/anon/authenticated).
 *
 * 0048 is journaled, so `scripts/db/run-migrations.ts` applies it automatically on any
 * migrate run. Its preflight only fires where Vault exists; on stock Postgres (CI uses
 * pgvector/pgvector:pg16, no vault/pg_net) it is skipped, so we install deterministic STUBS:
 *   - vault.decrypted_secrets(name, decrypted_secret)  — a table standing in for the view
 *   - net.http_get(url, headers, timeout_milliseconds)  — records into net._captured and
 *     returns a synthetic id (NO real HTTP is ever issued)
 * and then apply the REAL drizzle/0048 file. Against a stack that already has real
 * pg_net/Vault we do NOT clobber them — the suite self-skips (stubMode=false).
 *
 * Apply outcomes are asserted INSIDE the tests (never in beforeAll), so a failed migration
 * application surfaces as a test FAILURE, never as a skip.
 *
 * DB-gated: skips entirely when no Postgres is reachable (mirrors tests/db/rls.test.ts).
 * Tests are ordered (A aborts and preserves a sentinel; B applies; C/D/E rely on B).
 * Run: npm test tests/db/memory-worker-migration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATION_SQL = readFileSync(join(process.cwd(), 'drizzle/0048_memory_worker_vault_secret.sql'), 'utf8');

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgresql://${process.env.PG_USER || 'postgres'}:${process.env.PG_PASS || process.env.PGPASSWORD || 'postgres'}@${process.env.PG_HOST || '127.0.0.1'}:${process.env.PG_PORT || '54322'}/${process.env.PG_DB || 'postgres'}`,
  max: 3,
});

let dbAvailable = false;
let stubMode = false; // true when WE installed the vault/net stubs (i.e. platform deps absent)

async function q(sql: string, params?: unknown[]) {
  const c = await pool.connect();
  try {
    return await c.query(sql, params);
  } finally {
    c.release();
  }
}

/** Apply the real 0048 file; returns the error if it threw, else null. */
async function applyMigration(): Promise<unknown> {
  try {
    await q(MIGRATION_SQL);
    return null;
  } catch (e) {
    return e;
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
    (await q(`select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'net' and p.proname = 'http_get' limit 1`)).rowCount! > 0;
  const vaultRelExists =
    (await q(`select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'vault' and c.relname = 'decrypted_secrets' limit 1`)).rowCount! > 0;

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
    await q(`do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
    end $$;`);
    stubMode = true;
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
  // A — the P0 safety property: never replace the working function without the secret.
  it('A: missing memory_cron_secret -> migration ABORTS and the existing function is preserved', async ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
    await q(`delete from vault.decrypted_secrets`);
    await q(`truncate net._captured`);
    // Stand in a "currently working" function that returns a sentinel.
    await q(`create or replace function run_memory_queue_worker() returns bigint language sql as $$ select -1::bigint $$`);

    const err = await applyMigration();
    expect(err).not.toBeNull(); // preflight must abort (no secret present)

    // The abort must have rolled back BEFORE the drop — sentinel still callable.
    const res = await q(`select run_memory_queue_worker() as id`);
    expect(Number(res.rows[0].id)).toBe(-1);
  });

  // B — applies when the secret is present, and the Vault-backed function works.
  it('B: configured memory_cron_secret -> migration applies and the Vault-backed function works', async ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
    await q(`delete from vault.decrypted_secrets`);
    await q(`truncate net._captured`);
    await q(`insert into vault.decrypted_secrets(name, decrypted_secret) values ('memory_cron_secret', 'test-secret-xyz')`);

    const err = await applyMigration();
    // P1: a failed application is a FAILURE, never a skip.
    expect(err, err ? `0048 failed to apply with the secret present: ${String(err)}` : undefined).toBeNull();

    const res = await q(`select run_memory_queue_worker() as id`);
    expect(res.rows[0].id).not.toBeNull();
    const cap = await q(`select url, headers->>'Authorization' as auth from net._captured order by id desc limit 1`);
    expect(cap.rowCount).toBe(1);
    expect(cap.rows[0].url).toBe('https://trophe.app/api/internal/memory-worker');
    expect(cap.rows[0].auth).toBe('Bearer test-secret-xyz');
  });

  // C — runtime fail-closed (the secret is deleted AFTER the migration applied in B).
  it('C: secret removed at runtime -> returns NULL and issues NO http request', async ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
    await q(`delete from vault.decrypted_secrets`);
    await q(`truncate net._captured`);
    const res = await q(`select run_memory_queue_worker() as id`);
    expect(res.rows[0].id).toBeNull();
    const cap = await q(`select count(*)::int as n from net._captured`);
    expect(cap.rows[0].n).toBe(0);
  });

  it('D: is SECURITY DEFINER with a pinned search_path and a bigint return', async ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
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

  it('E: cannot be executed by anon or authenticated (which also proves no PUBLIC grant)', async ({ skip }) => {
    if (!dbAvailable || !stubMode) return skip();
    // If EXECUTE were granted to PUBLIC, anon/authenticated would inherit it and these would be true.
    const res = await q(`
      select has_function_privilege('anon', 'public.run_memory_queue_worker()', 'EXECUTE') as anon_exec,
             has_function_privilege('authenticated', 'public.run_memory_queue_worker()', 'EXECUTE') as auth_exec
    `);
    expect(res.rows[0].anon_exec).toBe(false);
    expect(res.rows[0].auth_exec).toBe(false);
  });
});
