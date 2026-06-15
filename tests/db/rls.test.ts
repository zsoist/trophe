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

import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
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

let dbAvailable = false;

// ─── fixtures ─────────────────────────────────────────────────────────────────

/** Well-known UUIDs for test fixtures (deterministic, collision-free). */
const IDS = {
  superAdmin:  'f0000000-0000-0000-0000-000000000001',
  admin:       'f0000000-0000-0000-0000-000000000002',
  coach:       'f0000000-0000-0000-0000-000000000003',
  client:      'f0000000-0000-0000-0000-000000000004',
  otherClient: 'f0000000-0000-0000-0000-000000000005',
  org:         'e0000000-0000-0000-0000-000000000001',
  assignedFoodLog: 'f1000000-0000-0000-0000-000000000001',
  unassignedFoodLog: 'f1000000-0000-0000-0000-000000000002',
  assignedWaterLog: 'f1000000-0000-0000-0000-000000000003',
  unassignedWaterLog: 'f1000000-0000-0000-0000-000000000004',
  assignedMeasurement: 'f1000000-0000-0000-0000-000000000005',
  unassignedMeasurement: 'f1000000-0000-0000-0000-000000000006',
  assignedCoachNote: 'f1000000-0000-0000-0000-000000000007',
  unassignedCoachNote: 'f1000000-0000-0000-0000-000000000008',
  assignedMessage: 'f1000000-0000-0000-0000-000000000009',
  unassignedMessage: 'f1000000-0000-0000-0000-000000000010',
  assignedMealPlan: 'f1000000-0000-0000-0000-000000000011',
  unassignedMealPlan: 'f1000000-0000-0000-0000-000000000012',
  assignedSupplementLog: 'f1000000-0000-0000-0000-000000000013',
  unassignedSupplementLog: 'f1000000-0000-0000-0000-000000000014',
  assignedWorkoutSession: 'f1000000-0000-0000-0000-000000000015',
  unassignedWorkoutSession: 'f1000000-0000-0000-0000-000000000016',
  assignedFormAnalysis: 'f1000000-0000-0000-0000-000000000017',
  unassignedFormAnalysis: 'f1000000-0000-0000-0000-000000000018',
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

async function expectRlsWithCheckRejection(action: () => Promise<unknown>) {
  try {
    await action();
    throw new Error('Expected RLS WITH CHECK rejection');
  } catch (error) {
    expect((error as { code?: string }).code).toBe('42501');
  }
}

// ─── test lifecycle ───────────────────────────────────────────────────────────

beforeAll(async () => {
  try {
    await pool.query('select 1');
    dbAvailable = true;
  } catch {
    dbAvailable = false;
    return;
  }

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

  await asOwner(`
    INSERT INTO food_log (id, user_id, food_name, quantity) VALUES
      ($1, $3, 'assigned-food', 1),
      ($2, $4, 'unassigned-food', 1)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedFoodLog, IDS.unassignedFoodLog, IDS.client, IDS.otherClient]);
  await asOwner(`
    INSERT INTO water_log (id, user_id, amount_ml) VALUES
      ($1, $3, 250),
      ($2, $4, 250)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedWaterLog, IDS.unassignedWaterLog, IDS.client, IDS.otherClient]);
  await asOwner(`
    INSERT INTO measurements (id, user_id, weight_kg) VALUES
      ($1, $3, 70),
      ($2, $4, 70)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedMeasurement, IDS.unassignedMeasurement, IDS.client, IDS.otherClient]);
  await asOwner(`
    INSERT INTO coach_notes (id, coach_id, client_id, note) VALUES
      ($1, $3, $4, 'assigned-note'),
      ($2, $3, $5, 'unassigned-note')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedCoachNote, IDS.unassignedCoachNote, IDS.coach, IDS.client, IDS.otherClient]);
  await asOwner(`
    INSERT INTO messages (id, coach_id, client_id, sender_role, body) VALUES
      ($1, $3, $4, 'coach', 'assigned-message'),
      ($2, $3, $5, 'coach', 'unassigned-message')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedMessage, IDS.unassignedMessage, IDS.coach, IDS.client, IDS.otherClient]);
  await asOwner(`
    INSERT INTO meal_plan_entries (id, client_id, coach_id, day_of_week, meal_slot, description) VALUES
      ($1, $3, $5, 0, 'breakfast', 'assigned-meal'),
      ($2, $4, $5, 0, 'breakfast', 'unassigned-meal')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedMealPlan, IDS.unassignedMealPlan, IDS.client, IDS.otherClient, IDS.coach]);
  await asOwner(`
    INSERT INTO supplement_log (id, user_id, supplement_name) VALUES
      ($1, $3, 'assigned-supplement'),
      ($2, $4, 'unassigned-supplement')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedSupplementLog, IDS.unassignedSupplementLog, IDS.client, IDS.otherClient]);
  await asOwner(`
    INSERT INTO workout_sessions (id, user_id, name) VALUES
      ($1, $3, 'assigned-workout'),
      ($2, $4, 'unassigned-workout')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedWorkoutSession, IDS.unassignedWorkoutSession, IDS.client, IDS.otherClient]);
  await asOwner(`
    INSERT INTO form_analyses (id, user_id, overall_assessment) VALUES
      ($1, $3, 'assigned-form'),
      ($2, $4, 'unassigned-form')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.assignedFormAnalysis, IDS.unassignedFormAnalysis, IDS.client, IDS.otherClient]);
});

beforeEach((context) => {
  if (!dbAvailable) context.skip();
});

afterAll(async () => {
  if (!dbAvailable) {
    await pool.end();
    return;
  }

  // Clean up fixture rows (owner bypasses RLS).
  await asOwner(`DELETE FROM form_analyses WHERE id IN ($1, $2)`, [IDS.assignedFormAnalysis, IDS.unassignedFormAnalysis]);
  await asOwner(`DELETE FROM workout_sessions WHERE id IN ($1, $2)`, [IDS.assignedWorkoutSession, IDS.unassignedWorkoutSession]);
  await asOwner(`DELETE FROM supplement_log WHERE id IN ($1, $2)`, [IDS.assignedSupplementLog, IDS.unassignedSupplementLog]);
  await asOwner(`DELETE FROM meal_plan_entries WHERE id IN ($1, $2)`, [IDS.assignedMealPlan, IDS.unassignedMealPlan]);
  await asOwner(`DELETE FROM messages WHERE id IN ($1, $2)`, [IDS.assignedMessage, IDS.unassignedMessage]);
  await asOwner(`DELETE FROM coach_notes WHERE id IN ($1, $2)`, [IDS.assignedCoachNote, IDS.unassignedCoachNote]);
  await asOwner(`DELETE FROM measurements WHERE id IN ($1, $2)`, [IDS.assignedMeasurement, IDS.unassignedMeasurement]);
  await asOwner(`DELETE FROM water_log WHERE id IN ($1, $2)`, [IDS.assignedWaterLog, IDS.unassignedWaterLog]);
  await asOwner(`DELETE FROM food_log WHERE id IN ($1, $2)`, [IDS.assignedFoodLog, IDS.unassignedFoodLog]);
  await asOwner(`DELETE FROM organization_members WHERE org_id = $1`, [IDS.org]);
  await asOwner(`DELETE FROM organizations WHERE id = $1`, [IDS.org]);
  await asOwner(`DELETE FROM client_profiles WHERE user_id IN ($1, $2)`, [IDS.client, IDS.otherClient]);
  // Profiles and auth fixtures intentionally remain: deleting them can cascade
  // into immutable audit records, which correctly reject mutation.
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

// ─── coach/client resource matrix ────────────────────────────────────────────

const coachResourceMatrix = [
  { label: 'food_log', table: 'food_log', assigned: IDS.assignedFoodLog, unassigned: IDS.unassignedFoodLog },
  { label: 'water_log', table: 'water_log', assigned: IDS.assignedWaterLog, unassigned: IDS.unassignedWaterLog },
  { label: 'measurements', table: 'measurements', assigned: IDS.assignedMeasurement, unassigned: IDS.unassignedMeasurement },
  { label: 'coach_notes', table: 'coach_notes', assigned: IDS.assignedCoachNote, unassigned: IDS.unassignedCoachNote },
  { label: 'messages', table: 'messages', assigned: IDS.assignedMessage, unassigned: IDS.unassignedMessage },
  { label: 'meal_plan_entries', table: 'meal_plan_entries', assigned: IDS.assignedMealPlan, unassigned: IDS.unassignedMealPlan },
  { label: 'supplement_log', table: 'supplement_log', assigned: IDS.assignedSupplementLog, unassigned: IDS.unassignedSupplementLog },
  { label: 'workout_sessions', table: 'workout_sessions', assigned: IDS.assignedWorkoutSession, unassigned: IDS.unassignedWorkoutSession },
  { label: 'form_analyses', table: 'form_analyses', assigned: IDS.assignedFormAnalysis, unassigned: IDS.unassignedFormAnalysis },
] as const;

describe('coach/client resources — cross-tenant RLS matrix', () => {
  for (const resource of coachResourceMatrix) {
    it(`coach can SELECT assigned ${resource.label} but not unassigned ${resource.label}`, async () => {
      const rows = await asUser(IDS.coach, (c) =>
        c.query(`SELECT id FROM ${resource.table} WHERE id = ANY($1::uuid[]) ORDER BY id`, [[resource.assigned, resource.unassigned]]),
      );

      expect(rows.rows.map((row) => row.id)).toEqual([resource.assigned]);
    });
  }
});

describe('coach/client resources — write-side cross-tenant RLS matrix', () => {
  it('coach can INSERT assigned coach-managed resources', async () => {
    const results = await asUser(IDS.coach, async (c) => {
      const coachNote = await c.query(`
        INSERT INTO coach_notes (coach_id, client_id, note)
        VALUES ($1, $2, 'assigned-note-write')
      `, [IDS.coach, IDS.client]);
      const message = await c.query(`
        INSERT INTO messages (coach_id, client_id, sender_role, body)
        VALUES ($1, $2, 'coach', 'assigned-message-write')
      `, [IDS.coach, IDS.client]);
      const mealPlan = await c.query(`
        INSERT INTO meal_plan_entries (client_id, coach_id, day_of_week, meal_slot, description)
        VALUES ($1, $2, 1, 'lunch', 'assigned-meal-write')
      `, [IDS.client, IDS.coach]);

      return [coachNote.rowCount, message.rowCount, mealPlan.rowCount];
    });

    expect(results).toEqual([1, 1, 1]);
  });

  it('coach CANNOT INSERT coach-managed resources for an unassigned client', async () => {
    await expectRlsWithCheckRejection(() =>
      asUser(IDS.coach, (c) =>
        c.query(`
          INSERT INTO coach_notes (coach_id, client_id, note)
          VALUES ($1, $2, 'blocked-note-write')
        `, [IDS.coach, IDS.otherClient]),
      ),
    );

    await expectRlsWithCheckRejection(() =>
      asUser(IDS.coach, (c) =>
        c.query(`
          INSERT INTO messages (coach_id, client_id, sender_role, body)
          VALUES ($1, $2, 'coach', 'blocked-message-write')
        `, [IDS.coach, IDS.otherClient]),
      ),
    );

    await expectRlsWithCheckRejection(() =>
      asUser(IDS.coach, (c) =>
        c.query(`
          INSERT INTO meal_plan_entries (client_id, coach_id, day_of_week, meal_slot, description)
          VALUES ($1, $2, 1, 'lunch', 'blocked-meal-write')
        `, [IDS.otherClient, IDS.coach]),
      ),
    );
  });

  it('coach can UPDATE assigned coach-managed resources', async () => {
    const results = await asUser(IDS.coach, async (c) => {
      const coachNote = await c.query(
        `UPDATE coach_notes SET note = 'assigned-note-updated' WHERE id = $1`,
        [IDS.assignedCoachNote],
      );
      const message = await c.query(
        `UPDATE messages SET body = 'assigned-message-updated' WHERE id = $1`,
        [IDS.assignedMessage],
      );
      const mealPlan = await c.query(
        `UPDATE meal_plan_entries SET description = 'assigned-meal-updated' WHERE id = $1`,
        [IDS.assignedMealPlan],
      );

      return [coachNote.rowCount, message.rowCount, mealPlan.rowCount];
    });

    expect(results).toEqual([1, 1, 1]);
  });

  it('coach CANNOT UPDATE coach-managed resources for an unassigned client', async () => {
    const results = await asUser(IDS.coach, async (c) => {
      const coachNote = await c.query(
        `UPDATE coach_notes SET note = 'blocked-note-updated' WHERE id = $1`,
        [IDS.unassignedCoachNote],
      );
      const message = await c.query(
        `UPDATE messages SET body = 'blocked-message-updated' WHERE id = $1`,
        [IDS.unassignedMessage],
      );
      const mealPlan = await c.query(
        `UPDATE meal_plan_entries SET description = 'blocked-meal-updated' WHERE id = $1`,
        [IDS.unassignedMealPlan],
      );

      return [coachNote.rowCount, message.rowCount, mealPlan.rowCount];
    });

    expect(results).toEqual([0, 0, 0]);
  });
});

// ─── audit_log RLS ────────────────────────────────────────────────────────────

describe('audit_log — RLS', () => {
  beforeAll(async () => {
    if (!dbAvailable) return;
    // Insert an audit row as owner so there is something to SELECT.
    await asOwner(`
      INSERT INTO audit_log (actor_id, actor_role, action, table_name)
      VALUES ($1, 'coach', 'test_action', 'profiles')
    `, [IDS.coach]);
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
      c.query('SELECT private.is_super_admin() AS val'),
    );
    expect(result.rows[0].val).toBe(true);
  });

  it('returns false for coach session', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT private.is_super_admin() AS val'),
    );
    expect(result.rows[0].val).toBe(false);
  });
});

describe('repository-wide RLS posture', () => {
  it('enables RLS on every public table', async () => {
    const result = await asOwner(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND NOT rowsecurity
      ORDER BY tablename
    `);

    expect(result.rows).toEqual([]);
  });

  it('does not contain permissive policies without explicit predicates', async () => {
    const result = await asOwner(`
      SELECT tablename, policyname, cmd
      FROM pg_policies
      WHERE schemaname = 'public'
        AND permissive = 'PERMISSIVE'
        AND (
          (cmd <> 'INSERT' AND qual IS NULL)
          OR (cmd IN ('INSERT', 'UPDATE', 'ALL') AND with_check IS NULL)
        )
      ORDER BY tablename, policyname
    `);

    expect(result.rows).toEqual([]);
  });
});

describe('is_coach_of() helper', () => {
  it('returns true when coach is assigned to client', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT private.is_coach_of($1) AS val', [IDS.client]),
    );
    expect(result.rows[0].val).toBe(true);
  });

  it('returns false for unassigned client', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT private.is_coach_of($1) AS val', [IDS.otherClient]),
    );
    expect(result.rows[0].val).toBe(false);
  });
});

describe('is_admin_of() helper', () => {
  it('returns true for an admin member of the organization', async () => {
    const result = await asUser(IDS.admin, (c) =>
      c.query('SELECT private.is_admin_of($1) AS val', [IDS.org]),
    );
    expect(result.rows[0].val).toBe(true);
  });

  it('returns false for a coach member without admin role', async () => {
    const result = await asUser(IDS.coach, (c) =>
      c.query('SELECT private.is_admin_of($1) AS val', [IDS.org]),
    );
    expect(result.rows[0].val).toBe(false);
  });
});
