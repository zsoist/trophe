import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL
    || `postgresql://${process.env.PG_USER || 'postgres'}:${process.env.PG_PASS || process.env.PGPASSWORD || 'postgres'}@${process.env.PG_HOST || '127.0.0.1'}:${process.env.PG_PORT || '54322'}/${process.env.PG_DB || 'postgres'}`,
  max: 4,
});

const IDS = {
  user: 'a7100000-0000-4000-8000-000000000001',
  exerciseA: 'a7100000-0000-4000-8000-000000000002',
  exerciseB: 'a7100000-0000-4000-8000-000000000003',
  keyA: 'a7100000-0000-4000-8000-000000000004',
  keyB: 'a7100000-0000-4000-8000-000000000005',
  painA: 'a7100000-0000-4000-8000-000000000006',
  painB: 'a7100000-0000-4000-8000-000000000007',
  invalidKeyA: 'a7100000-0000-4000-8000-000000000008',
  invalidKeyB: 'a7100000-0000-4000-8000-000000000009',
  keySet: 'a7100000-0000-4000-8000-000000000010',
  keyStructure: 'a7100000-0000-4000-8000-000000000011',
  keyPain: 'a7100000-0000-4000-8000-000000000012',
};

type LiveStructure = Array<{
  exercise_id: string;
  target_sets: number;
  target_reps: string;
  superset_group: number | null;
}>;

const initialStructure: LiveStructure = [
  { exercise_id: IDS.exerciseA, target_sets: 2, target_reps: '8', superset_group: 1 },
  { exercise_id: IDS.exerciseB, target_sets: 2, target_reps: '8', superset_group: 1 },
];

let dbReachable = false;

async function switchUser(client: pg.PoolClient) {
  await client.query('RESET ROLE');
  await client.query('SET LOCAL ROLE authenticated');
  await client.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [IDS.user]);
  await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);
}

async function asUser<T>(fn: (client: pg.PoolClient) => Promise<T>, commit = false): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await switchUser(client);
    const result = await fn(client);
    await client.query(commit ? 'COMMIT' : 'ROLLBACK');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function start(
  client: pg.PoolClient,
  key: string,
  draftFingerprint = 'draft:shared',
  sessionDate = '2026-08-24',
) {
  return client.query<{ id: string }>(`
    SELECT public.start_workout_session(
      $1::uuid, $2::text, $3::date, 'Push'::text, NULL::uuid, 'strength'::text, $4::jsonb
    ) AS id
  `, [key, draftFingerprint, sessionDate, JSON.stringify(initialStructure)]);
}

beforeAll(async () => {
  try {
    await pool.query('select 1');
    dbReachable = true;
  } catch {
    return;
  }

  const migration = await pool.query(`
    SELECT to_regprocedure(
      'public.save_live_workout_set(uuid,uuid,integer,real,integer,real,boolean,boolean,integer)'
    ) AS fn
  `);
  if (migration.rows[0]?.fn === null) {
    throw new Error('Reachable database is missing the live workout consistency migration');
  }

  await pool.query(`
    INSERT INTO auth.users (id, email) VALUES ($1, 'workout-consistency@test.local')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.user]);
  await pool.query(`
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES ($1, 'Workout Consistency', 'workout-consistency@test.local', 'client')
    ON CONFLICT (id) DO NOTHING
  `, [IDS.user]);
  await pool.query(`
    INSERT INTO public.exercises (id, name, muscle_group, is_template) VALUES
      ($1, 'Consistency Bench', 'chest', true),
      ($2, 'Consistency Row', 'back', true)
    ON CONFLICT (id) DO NOTHING
  `, [IDS.exerciseA, IDS.exerciseB]);
});

beforeEach((context) => {
  if (!dbReachable) context.skip();
});

afterAll(async () => {
  if (dbReachable) {
    await pool.query(`DELETE FROM public.workout_sessions WHERE user_id = $1`, [IDS.user]);
    await pool.query(`DELETE FROM public.exercises WHERE id IN ($1, $2)`, [IDS.exerciseA, IDS.exerciseB]);
    await pool.query(`DELETE FROM public.profiles WHERE id = $1`, [IDS.user]);
    await pool.query(`DELETE FROM auth.users WHERE id = $1`, [IDS.user]);
  }
  await pool.end();
});

describe('live workout transactional consistency', () => {
  it('coalesces distinct tab request IDs by logical draft and preserves the first request date', async () => {
    const first = await asUser((client) => start(client, IDS.keyA, 'draft:two-tabs', '2026-08-24'), true);
    const second = await asUser((client) => start(client, IDS.keyB, 'draft:two-tabs', '2026-08-25'), true);

    expect(second.rows[0].id).toBe(first.rows[0].id);
    const stored = await pool.query(`
      SELECT session_date, count(*) OVER ()::integer AS count
      FROM public.workout_sessions
      WHERE user_id = $1 AND client_draft_fingerprint IS NOT NULL
    `, [IDS.user]);
    expect(stored.rows).toHaveLength(1);
    expect(stored.rows[0].count).toBe(1);
    expect((stored.rows[0].session_date as Date).toISOString().slice(0, 10)).toBe('2026-08-24');
  });

  it('returns the same set after committed-response loss and rejects a conflicting fingerprint', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keySet, 'draft:set-retry')).rows[0].id;
      const params = [sessionId, IDS.exerciseA, 1, 60, 8, 8, false, false, 1];
      const first = await client.query<{ id: string }>(`
        SELECT public.save_live_workout_set(
          $1::uuid, $2::uuid, $3::integer, $4::real, $5::integer,
          $6::real, $7::boolean, $8::boolean, $9::integer
        ) AS id
      `, params);
      const retry = await client.query<{ id: string }>(`
        SELECT public.save_live_workout_set(
          $1::uuid, $2::uuid, $3::integer, $4::real, $5::integer,
          $6::real, $7::boolean, $8::boolean, $9::integer
        ) AS id
      `, params);
      expect(retry.rows[0].id).toBe(first.rows[0].id);
      expect((await client.query(`SELECT count(*)::integer AS count FROM public.workout_sets WHERE session_id = $1`, [sessionId])).rows[0].count).toBe(1);
      await expect(client.query(`
        SELECT public.save_live_workout_set(
          $1::uuid, $2::uuid, 1, 62::real, 8, 8::real, false, false, 1
        )
      `, [sessionId, IDS.exerciseA])).rejects.toMatchObject({ code: '22023' });
    });
  });

  it('persists pre-set structure and rejects a late insert for a removed exercise', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyStructure, 'draft:structure')).rows[0].id;
      const regrouped: LiveStructure = initialStructure.map((exercise) => ({ ...exercise, superset_group: null }));
      const firstUpdate = await client.query<{ result: { version: number; structure: LiveStructure } }>(`
        SELECT public.update_live_workout_structure($1::uuid, 0, $2::jsonb, NULL::uuid) AS result
      `, [sessionId, JSON.stringify(regrouped)]);
      expect(firstUpdate.rows[0].result).toEqual({ version: 1, structure: regrouped });

      const remaining = regrouped.filter((exercise) => exercise.exercise_id !== IDS.exerciseA);
      await client.query(`
        SELECT public.update_live_workout_structure($1::uuid, 1, $2::jsonb, $3::uuid)
      `, [sessionId, JSON.stringify(remaining), IDS.exerciseA]);

      const recovered = await client.query(`SELECT live_structure, live_structure_version FROM public.workout_sessions WHERE id = $1`, [sessionId]);
      expect(recovered.rows[0]).toEqual({ live_structure: remaining, live_structure_version: 2 });
      await client.query('SAVEPOINT removed_rpc');
      await expect(client.query(`
        SELECT public.save_live_workout_set(
          $1::uuid, $2::uuid, 1, 60::real, 8, 8::real, false, false, NULL::integer
        )
      `, [sessionId, IDS.exerciseA])).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT removed_rpc');
      await client.query('SAVEPOINT removed_direct');
      await expect(client.query(`
        INSERT INTO public.workout_sets (
          session_id, exercise_id, set_number, weight_kg, reps, rpe, is_warmup, is_pr, superset_group
        ) VALUES ($1, $2, 1, 60, 8, 8, false, false, NULL)
      `, [sessionId, IDS.exerciseA])).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT removed_direct');
    });
  });

  it('serializes concurrent pain additions and makes mutation retries idempotent', async () => {
    const session = await asUser((client) => start(client, IDS.keyPain, 'draft:pain'), true);
    const sessionId = session.rows[0].id;
    const append = (mutationId: string, bodyPart: string) => asUser((client) => client.query(`
      SELECT public.append_live_pain_flag(
        $1::uuid, $2::uuid,
        jsonb_build_object('exercise_id', $3::text, 'body_part', $4::text, 'severity', 2)
      )
    `, [sessionId, mutationId, IDS.exerciseA, bodyPart]), true);

    await Promise.all([append(IDS.painA, 'shoulder'), append(IDS.painB, 'elbow')]);
    await append(IDS.painA, 'shoulder');

    const beforeFinish = await pool.query(`SELECT pain_flags FROM public.workout_sessions WHERE id = $1`, [sessionId]);
    expect(beforeFinish.rows[0].pain_flags).toHaveLength(2);
    expect(beforeFinish.rows[0].pain_flags.map((flag: { body_part: string }) => flag.body_part).sort()).toEqual(['elbow', 'shoulder']);

    await asUser((client) => client.query(`
      SELECT public.finish_live_workout_session($1::uuid, 'Push', 20, NULL::uuid, NULL::text)
    `, [sessionId]), true);
    const afterFinish = await pool.query(`SELECT pain_flags FROM public.workout_sessions WHERE id = $1`, [sessionId]);
    expect(afterFinish.rows[0].pain_flags).toEqual(beforeFinish.rows[0].pain_flags);
  });

  it.each([
    ['numeric strings', IDS.invalidKeyA, {
      exercise_id: IDS.exerciseA, set_number: 1, weight_kg: '60', reps: 8, rpe: 8,
      is_warmup: false, is_pr: false, superset_group: null,
    }],
    ['missing booleans', IDS.invalidKeyB, {
      exercise_id: IDS.exerciseA, set_number: 1, weight_kg: 60, reps: 8, rpe: 8,
      superset_group: null,
    }],
  ])('rolls back retrospective JSON with %s', async (_label, key, invalidSet) => {
    await asUser(async (client) => {
      await client.query('SAVEPOINT invalid_json');
      await expect(client.query(`
        SELECT public.save_retrospective_workout(
          $1::uuid, '2026-08-24'::date, 'strength', 'Invalid', NULL::uuid,
          30, '[]'::jsonb, NULL::text, NULL::real, NULL::real, $2::jsonb
        )
      `, [key, JSON.stringify([invalidSet])])).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT invalid_json');
      expect((await client.query(`SELECT count(*)::integer AS count FROM public.workout_sessions WHERE client_idempotency_key = $1`, [key])).rows[0].count).toBe(0);
    });
  });
});
