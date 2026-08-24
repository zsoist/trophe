import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
    || `postgresql://${process.env.PG_USER || 'postgres'}:${process.env.PG_PASS || process.env.PGPASSWORD || 'postgres'}@${process.env.PG_HOST || '127.0.0.1'}:${process.env.PG_PORT || '54322'}/${process.env.PG_DB || 'postgres'}`,
  max: 3,
});

const IDS = {
  userA: 'a7000000-0000-4000-8000-000000000001',
  userB: 'a7000000-0000-4000-8000-000000000002',
  exerciseA: 'a7000000-0000-4000-8000-000000000003',
  exerciseB: 'a7000000-0000-4000-8000-000000000004',
  liveKey: 'a7000000-0000-4000-8000-000000000005',
  historyKey: 'a7000000-0000-4000-8000-000000000006',
  concurrentKey: 'a7000000-0000-4000-8000-000000000008',
};

let dbAvailable = false;

async function asOwner(sql: string, params: unknown[] = []) {
  return pool.query(sql, params);
}

async function switchUser(client: pg.PoolClient, userId: string) {
  await client.query('RESET ROLE');
  await client.query('SET LOCAL ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
}

async function asUser<T>(userId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await switchUser(client, userId);
    return await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}

async function asCommittedUser<T>(userId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await switchUser(client, userId);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function start(client: pg.PoolClient, key: string, name = 'Push') {
  return client.query<{ id: string }>(`
    SELECT public.start_workout_session(
      $1::uuid, $2::text, $3::date, $4::text, NULL::uuid, 'strength'::text, $5::jsonb
    ) AS id
  `, [key, `runtime:${key}:${name}`, '2026-08-24', name, JSON.stringify([{
    exercise_id: IDS.exerciseA, target_sets: 3, target_reps: '8', superset_group: null,
  }])]);
}

async function retrospective(client: pg.PoolClient, key: string, sets: unknown[]) {
  return client.query<{ id: string }>(`
    SELECT public.save_retrospective_workout(
      $1::uuid, $2::date, 'strength'::text, 'Upper'::text, NULL::uuid,
      30::integer, '[]'::jsonb, NULL::text, NULL::real, NULL::real, $3::jsonb
    ) AS id
  `, [key, '2026-08-24', JSON.stringify(sets)]);
}

beforeAll(async () => {
  try {
    await pool.query('select 1');
  } catch {
    return;
  }
  const migration = await pool.query(`SELECT to_regprocedure('public.start_workout_session(uuid,text,date,text,uuid,text,jsonb)') AS fn`);
  if (migration.rows[0]?.fn === null) {
    throw new Error('reachable database is missing live workout consistency RPCs; run npm run db:bootstrap');
  }
  dbAvailable = true;

  await asOwner(`
    INSERT INTO auth.users (id, email) VALUES
      ($1, 'workout-atomic-a@test.local'),
      ($2, 'workout-atomic-b@test.local')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.userA, IDS.userB]);
  await asOwner(`
    INSERT INTO public.profiles (id, full_name, email, role) VALUES
      ($1, 'Atomic A', 'workout-atomic-a@test.local', 'client'),
      ($2, 'Atomic B', 'workout-atomic-b@test.local', 'client')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.userA, IDS.userB]);
  await asOwner(`
    INSERT INTO public.exercises (id, name, muscle_group, is_template) VALUES
      ($1, 'Atomic Bench', 'chest', true),
      ($2, 'Atomic Row', 'back', true)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.exerciseA, IDS.exerciseB]);
});

beforeEach((context) => {
  if (!dbAvailable) context.skip();
});

afterAll(async () => {
  if (dbAvailable) {
    await asOwner(`DELETE FROM public.workout_sessions WHERE user_id IN ($1, $2)`, [IDS.userA, IDS.userB]);
    await asOwner(`DELETE FROM public.exercises WHERE id IN ($1, $2)`, [IDS.exerciseA, IDS.exerciseB]);
    await asOwner(`DELETE FROM public.profiles WHERE id IN ($1, $2)`, [IDS.userA, IDS.userB]);
    await asOwner(`DELETE FROM auth.users WHERE id IN ($1, $2)`, [IDS.userA, IDS.userB]);
  }
  await pool.end();
});

describe('workout atomic RPC security and behavior', () => {
  it('uses invoker rights and grants execute only to authenticated', async () => {
    const result = await asOwner(`
      SELECT p.proname, p.prosecdef,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = ANY($1::text[])
      ORDER BY p.proname
    `, [[
      'discard_empty_workout_session', 'save_retrospective_workout',
      'start_workout_session', 'update_live_workout_structure',
      'save_live_workout_set', 'append_live_pain_flag', 'finish_live_workout_session',
    ]]);
    expect(result.rows).toHaveLength(7);
    for (const row of result.rows) {
      expect(row).toMatchObject({ prosecdef: false, authenticated: true, anon: false, service_role: false });
    }
  });

  it('retries live start idempotently per user and enforces owned atomic discard', async () => {
    await asUser(IDS.userA, async (client) => {
      const first = await start(client, IDS.liveKey);
      const retry = await start(client, IDS.liveKey);
      expect(retry.rows[0].id).toBe(first.rows[0].id);
      expect((await client.query(`SELECT count(*)::integer AS count FROM public.workout_sessions WHERE client_idempotency_key = $1`, [IDS.liveKey])).rows[0].count).toBe(1);

      await switchUser(client, IDS.userB);
      expect((await client.query(`SELECT public.discard_empty_workout_session($1::uuid) AS discarded`, [first.rows[0].id])).rows[0].discarded).toBe(false);
      const other = await start(client, IDS.liveKey);
      expect(other.rows[0].id).not.toBe(first.rows[0].id);

      await switchUser(client, IDS.userA);
      expect((await client.query(`SELECT public.discard_empty_workout_session($1::uuid) AS discarded`, [first.rows[0].id])).rows[0].discarded).toBe(true);
    });
  });

  it('coalesces concurrent live starts with the same user request key', async () => {
    const [first, second] = await Promise.all([
      asCommittedUser(IDS.userA, (client) => start(client, IDS.concurrentKey)),
      asCommittedUser(IDS.userA, (client) => start(client, IDS.concurrentKey)),
    ]);
    expect(second.rows[0].id).toBe(first.rows[0].id);
    expect((await asOwner(`
      SELECT count(*)::integer AS count
      FROM public.workout_sessions
      WHERE user_id = $1 AND client_idempotency_key = $2
    `, [IDS.userA, IDS.concurrentKey])).rows[0].count).toBe(1);
  });

  it('rolls back invalid retrospective history and idempotently returns one complete retry', async () => {
    await asUser(IDS.userA, async (client) => {
      const invalidSets = [{
        exercise_id: 'a7000000-0000-4000-8000-000000000099', set_number: 1,
        weight_kg: 60, reps: 8, rpe: 8, is_warmup: false, is_pr: false,
        superset_group: null,
      }];
      await client.query('SAVEPOINT invalid_history');
      await expect(retrospective(client, IDS.historyKey, invalidSets)).rejects.toMatchObject({ code: '23503' });
      await client.query('ROLLBACK TO SAVEPOINT invalid_history');
      expect((await client.query(`SELECT count(*)::integer AS count FROM public.workout_sessions WHERE client_idempotency_key = $1`, [IDS.historyKey])).rows[0].count).toBe(0);

      const validSets = [
        { exercise_id: IDS.exerciseA, set_number: 1, weight_kg: 60, reps: 8, rpe: 8, is_warmup: false, is_pr: false, superset_group: 1 },
        { exercise_id: IDS.exerciseB, set_number: 1, weight_kg: 50, reps: 8, rpe: null, is_warmup: false, is_pr: false, superset_group: 1 },
      ];
      const saved = await retrospective(client, IDS.historyKey, validSets);
      const retry = await retrospective(client, IDS.historyKey, validSets);
      expect(retry.rows[0].id).toBe(saved.rows[0].id);
      expect((await client.query(`SELECT count(*)::integer AS count FROM public.workout_sets WHERE session_id = $1`, [saved.rows[0].id])).rows[0].count).toBe(2);

      expect((await client.query(`SELECT public.discard_empty_workout_session($1::uuid) AS discarded`, [saved.rows[0].id])).rows[0].discarded).toBe(false);
    });
  });

  it('rejects cardio history without a recognized activity', async () => {
    await asUser(IDS.userA, async (client) => {
      await expect(client.query(`
        SELECT public.save_retrospective_workout(
          $1::uuid, $2::date, 'cardio'::text, 'Cardio'::text, NULL::uuid,
          30::integer, '[]'::jsonb, NULL::text, NULL::real, NULL::real, '[]'::jsonb
        )
      `, ['a7000000-0000-4000-8000-000000000007', '2026-08-24'])).rejects.toMatchObject({ code: '22023' });
    });
  });
});
