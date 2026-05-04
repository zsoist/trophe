/**
 * Trophē v0.3 — RLS enforcement tests (Phase 1).
 *
 * Strategy: each test wraps SQL in a transaction that:
 *   1. SET LOCAL "request.jwt.claims" = '{"sub":"<uuid>"}' to simulate a user session
 *   2. Performs the operation under test
 *   3. ROLLBACKs so fixtures don't persist
 *
 * The local bootstrap creates Supabase-compatible `auth.uid()` / `auth.role()`
 * helpers, so these tests exercise the same RLS policy shape that runs in
 * production Supabase.
 *
 * Run: npm test tests/db/rls.test.ts
 * Prereq: trophe_dev must be bootstrapped + Phases 0–1 migrations applied.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import pg from 'pg';

// ─── connection ──────────────────────────────────────────────────────────────
// Use DATABASE_URL as the canonical source so CI, Supabase local, and custom
// setups all work identically.  Falling back to individual PG_* vars is
// unreliable: vitest's env loading can silently shadow them.

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    `postgresql://${process.env.PG_USER || 'postgres'}:${process.env.PG_PASS || process.env.PGPASSWORD || 'postgres'}@${process.env.PG_HOST || '127.0.0.1'}:${process.env.PG_PORT || '54322'}/${process.env.PG_DB || 'postgres'}`,
  max: 5,
});

// ─── fixtures ─────────────────────────────────────────────────────────────────

/** Well-known UUIDs for test fixtures (deterministic, collision-free). */
const IDS = {
  superAdmin:  'f0000000-0000-0000-0000-000000000001',
  admin:       'f0000000-0000-0000-0000-000000000002',
  coach:       'f0000000-0000-0000-0000-000000000003',
  client:      'f0000000-0000-0000-0000-000000000004',
  otherClient: 'f0000000-0000-0000-0000-000000000005',
  org:         'e0000000-0000-0000-0000-000000000001',
};

/**
 * Run `fn(client)` inside a transaction that:
 *  - sets auth.uid() to `userId`
 *  - always ROLLBACKs so no fixture pollution
 */
async function asUser<T>(
  userId: string,
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Drop from the connection's owner role to Supabase's authenticated role so
    // RLS is enforced even when the underlying DB user is a superuser.
    await client.query(`SET LOCAL ROLE authenticated`);
    await client.query(
      `SELECT set_config('request.jwt.claim.sub', $1, true)`,
      [userId],
    );
    await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
    const result = await fn(client);
    return result;
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

/** Run SQL as the DB owner (bypasses RLS) for setup/teardown. */
async function asOwner(sql: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

// ─── test lifecycle ───────────────────────────────────────────────────────────

beforeAll(async () => {
  // Insert auth.users shim rows so profiles FK resolves.
  await asOwner(`
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'super@test.local'),
      ($2, 'admin@test.local'),
      ($3, 'coach@test.local'),
      ($4, 'client@test.local'),
      ($5, 'other@test.local')
    ON CONFLICT (id) DO NOTHING;
  `, [IDS.superAdmin, IDS.admin, IDS.coach, IDS.client, IDS.otherClient]);

  // Insert profiles with role assignments.
  await asOwner(`
    INSERT INTO profiles (id, full_name, email, role) VALUES
      ($1, 'Super Admin', 'super@test.local',  'super_admin'),
      ($2, 'Admin User',  'admin@test.local',  'admin'),
      ($3, 'Coach User',  'coach@test.local',  'coach'),
      ($4, 'Client User', 'client@test.local', 'client'),
      ($5, 'Other Client','other@test.local',  'client')
    ON CONFLICT (id) DO NOTHING;
  `, [IDS.superAdmin, IDS.admin, IDS.coach, IDS.client, IDS.otherClient]);

  // Assign coach to client via client_profiles.
  await asOwner(`
    INSERT INTO client_profiles (user_id, coach_id)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO NOTHING;
  `, [IDS.client, IDS.coach]);

  // Insert a test organization owned by the coach.
  await asOwner(`
    INSERT INTO organizations (id, name, slug, owner_id)
    VALUES ($1, 'Test Org', 'test-org', $2)
    ON CONFLICT (id) DO NOTHING;
  `, [IDS.org, IDS.coach]);

  await asOwner(`
    INSERT INTO organization_members (org_id, user_id, role)
    VALUES ($1, $2, 'coach'), ($1, $3, 'client'), ($1, $4, 'admin')
    ON CONFLICT (org_id, user_id) DO NOTHING;
  `, [IDS.org, IDS.coach, IDS.client, IDS.admin]);
});

afterAll(async () => {
  // Clean up fixture rows (owner bypasses RLS).
  await asOwner(`DELETE FROM organization_members WHERE org_id = $1`, [IDS.org]);
  await asOwner(`DELETE FROM organizations WHERE id = $1`, [IDS.org]);
  await asOwner(`DELETE FROM client_profiles WHERE user_id IN ($1, $2)`, [IDS.client, IDS.otherClient]);
  await asOwner(`DELETE FROM profiles WHERE id IN ($1,$2,$3,$4,$5)`,
    [IDS.superAdmin, IDS.admin, IDS.coach, IDS.client, IDS.otherClient]);
  await asOwner(`DELETE FROM auth.users WHERE id IN ($1,$2,$3,$4,$5)`,
    [IDS.superAdmin, IDS.admin, IDS.coach, IDS.client, IDS.otherClient]);
  await pool.end();
});

// ─── profiles RLS ─────────────────────────────────────────────────────────────

describe('profiles — RLS', () => {
  it('client can SELECT own profile row', async () => {
    const rows = await asUser(IDS.client, (c) =>
      c.query('SELECT id FROM profiles WHERE id = $1', [IDS.client]),
    );
    expect(rows.rowCount).toBe(1);
  });

  it('client CANNOT SELECT another client profile', async () => {
    const rows = await asUser(IDS.client, (c) =>
      c.query('SELECT id FROM profiles WHERE id = $1', [IDS.otherClient]),
    );
    expect(rows.rowCount).toBe(0);
  });

  it('super_admin can SELECT all profiles', async () => {
    const rows = await asUser(IDS.superAdmin, (c) =>
      c.query('SELECT id FROM profiles WHERE id = ANY($1)', [[IDS.client, IDS.otherClient, IDS.coach]]),
    );
    expect(rows.rowCount).toBe(3);
  });
});

// ─── food_log RLS ─────────────────────────────────────────────────────────────

describe('food_log — RLS', () => {
  it('client can INSERT + SELECT own food_log entry', async () => {
    const rows = await asUser(IDS.client, async (c) => {
      await c.query(`
        INSERT INTO food_log (user_id, food_name, quantity)
        VALUES ($1, 'test-banana', 1)
      `, [IDS.client]);
      return c.query(`SELECT food_name FROM food_log WHERE user_id = $1`, [IDS.client]);
    });
    expect(rows.rows.some((r) => r.food_name === 'test-banana')).toBe(true);
  });

  it('client CANNOT see another client food_log', async () => {
    // Insert a row as otherClient (owner bypass so it always exists).
    await asOwner(`
      INSERT INTO food_log (user_id, food_name, quantity)
      VALUES ($1, 'secret-food', 1)
    `, [IDS.otherClient]);

    const rows = await asUser(IDS.client, (c) =>
      c.query(`SELECT food_name FROM food_log WHERE user_id = $1`, [IDS.otherClient]),
    );
    expect(rows.rowCount).toBe(0);

    // Cleanup
    await asOwner(`DELETE FROM food_log WHERE user_id = $1`, [IDS.otherClient]);
  });
});

// ─── organizations RLS ────────────────────────────────────────────────────────

describe('organizations — RLS', () => {
  it('org member can SELECT their organization', async () => {
    const rows = await asUser(IDS.coach, (c) =>
      c.query('SELECT id FROM organizations WHERE id = $1', [IDS.org]),
    );
    expect(rows.rowCount).toBe(1);
  });

  it('non-member CANNOT SELECT an organization they are not in', async () => {
    const rows = await asUser(IDS.otherClient, (c) =>
      c.query('SELECT id FROM organizations WHERE id = $1', [IDS.org]),
    );
    expect(rows.rowCount).toBe(0);
  });
});

// ─── audit_log RLS ────────────────────────────────────────────────────────────

describe('audit_log — RLS', () => {
  beforeAll(async () => {
    // Insert an audit row as owner so there is something to SELECT.
    await asOwner(`
      INSERT INTO audit_log (actor_id, actor_role, action, table_name)
      VALUES ($1, 'coach', 'test_action', 'profiles')
    `, [IDS.coach]);
  });

  afterAll(async () => {
    await asOwner(`DELETE FROM audit_log WHERE action = 'test_action'`);
  });

  it('super_admin can SELECT audit_log rows', async () => {
    const rows = await asUser(IDS.superAdmin, (c) =>
      c.query(`SELECT id FROM audit_log WHERE action = 'test_action'`),
    );
    expect(rows.rowCount).toBeGreaterThan(0);
  });

  it('coach CANNOT SELECT audit_log rows', async () => {
    const rows = await asUser(IDS.coach, (c) =>
      c.query(`SELECT id FROM audit_log WHERE action = 'test_action'`),
    );
    expect(rows.rowCount).toBe(0);
  });

  it('client CANNOT SELECT audit_log rows', async () => {
    const rows = await asUser(IDS.client, (c) =>
      c.query(`SELECT id FROM audit_log WHERE action = 'test_action'`),
    );
    expect(rows.rowCount).toBe(0);
  });
});

// ─── role guard helpers ───────────────────────────────────────────────────────

describe('is_super_admin() helper', () => {
  it('returns true for super_admin session', async () => {
    const result = await asUser(IDS.superAdmin, (c) =>
      c.query('SELECT is_super_admin() AS val'),
    );
    expect(result.rows[0].val).toBe(true);
  });

  it('returns false for coach session', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT is_super_admin() AS val'),
    );
    expect(result.rows[0].val).toBe(false);
  });
});

describe('is_coach_of() helper', () => {
  it('returns true when coach is assigned to client', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT is_coach_of($1) AS val', [IDS.client]),
    );
    expect(result.rows[0].val).toBe(true);
  });

  it('returns false for unassigned client', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT is_coach_of($1) AS val', [IDS.otherClient]),
    );
    expect(result.rows[0].val).toBe(false);
  });
});

describe('is_admin_of() helper', () => {
  it('returns true for an admin member of the organization', async () => {
    const result = await asUser(IDS.admin, (c) =>
      c.query('SELECT is_admin_of($1) AS val', [IDS.org]),
    );
    expect(result.rows[0].val).toBe(true);
  });

  it('returns false for a coach member without admin role', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT is_admin_of($1) AS val', [IDS.org]),
    );
    expect(result.rows[0].val).toBe(false);
  });
});
