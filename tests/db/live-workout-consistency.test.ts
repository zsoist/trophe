import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
  keyFinish: 'a7100000-0000-4000-8000-000000000013',
  keyTerminal: 'a7100000-0000-4000-8000-000000000014',
  keyLegacy: 'a7100000-0000-4000-8000-000000000015',
  keyOldClient: 'a7100000-0000-4000-8000-000000000016',
  keyIdentityA: 'a7100000-0000-4000-8000-000000000017',
  keyIdentityB: 'a7100000-0000-4000-8000-000000000018',
  keyDeleteRace: 'a7100000-0000-4000-8000-000000000019',
  keyDirectDelete: 'a7100000-0000-4000-8000-000000000020',
  keyCardio: 'a7100000-0000-4000-8000-000000000021',
  keyRollingCardio: 'a7100000-0000-4000-8000-000000000022',
  keyTerminalUpdates: 'a7100000-0000-4000-8000-000000000023',
  keyLiveUpdates: 'a7100000-0000-4000-8000-000000000024',
  keyTerminalAuthority: 'a7100000-0000-4000-8000-000000000025',
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
    ) AS consistency_fn,
    to_regprocedure(
      'public.resume_legacy_live_workout_session(uuid,text,jsonb)'
    ) AS rollout_fn,
    EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'workout_sessions'
        AND column_name = 'live_finish_request'
    ) AS finish_state
  `);
  if (migration.rows[0]?.consistency_fn === null
      || migration.rows[0]?.rollout_fn === null
      || migration.rows[0]?.finish_state !== true) {
    throw new Error('Reachable database is missing the live workout consistency/rollout migrations');
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
  it('migrates an already-terminal legacy cardio row before validating structured shape', async () => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        ALTER TABLE public.workout_sessions
          DROP CONSTRAINT IF EXISTS workout_sessions_workout_kind_check,
          DROP CONSTRAINT IF EXISTS workout_sessions_cardio_activity_check,
          DROP CONSTRAINT IF EXISTS workout_sessions_cardio_distance_check,
          DROP CONSTRAINT IF EXISTS workout_sessions_cardio_effort_check,
          DROP CONSTRAINT IF EXISTS workout_sessions_cardio_shape_check
      `);
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO public.workout_sessions (
          user_id, session_date, name, duration_minutes, notes,
          pain_flags, client_idempotency_key, client_request,
          workout_kind, live_finish_request
        ) VALUES (
          $1, '2026-08-24', 'Legacy cardio', 20, 'legacy localized summary',
          '[]'::jsonb, $2, jsonb_build_object('mode', 'live', 'kind', 'cardio'),
          NULL, NULL
        ) RETURNING id
      `, [IDS.user, IDS.keyRollingCardio]);
      await client.query(readFileSync(join(process.cwd(), 'drizzle/0077_live_workout_rollout_safety.sql'), 'utf8'));
      const migrated = await client.query(`
        SELECT workout_kind, live_finish_request ? 'notes' AS compatibility_envelope
        FROM public.workout_sessions WHERE id = $1
      `, [inserted.rows[0].id]);
      expect(migrated.rows[0]).toEqual({ workout_kind: 'cardio', compatibility_envelope: true });
      const constraints = await client.query<{ count: number }>(`
        SELECT count(*)::integer AS count
        FROM pg_catalog.pg_constraint
        WHERE conrelid = 'public.workout_sessions'::regclass
          AND conname LIKE 'workout_sessions_cardio_%_check'
          AND convalidated
      `);
      expect(constraints.rows[0].count).toBe(4);
      await client.query('ROLLBACK');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  });

  it('keeps live mutation functions invoker-safe, path-locked, and authenticated-only', async () => {
    const functions = await pool.query<{
      signature: string;
      security_definer: boolean;
      config: string[] | null;
      authenticated_execute: boolean;
      anon_execute: boolean;
      service_execute: boolean;
    }>(`
      SELECT p.oid::regprocedure::text AS signature,
        p.prosecdef AS security_definer,
        p.proconfig AS config,
        has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
        has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
        has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute
      FROM pg_catalog.pg_proc AS p
      WHERE p.oid IN (
        'public.delete_live_workout_set(uuid,uuid)'::regprocedure,
        'public.finish_live_workout_session(uuid,text,integer,uuid,text,real,real)'::regprocedure
      )
      ORDER BY signature
    `);
    expect(functions.rows).toHaveLength(2);
    for (const fn of functions.rows) {
      expect(fn.security_definer).toBe(false);
      expect(fn.config).toContain('search_path=""');
      expect(fn.authenticated_execute).toBe(true);
      expect(fn.anon_execute).toBe(false);
      expect(fn.service_execute).toBe(false);
    }
  });

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

  it('replays an exactly committed finish and rejects a conflicting replay', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyFinish, 'draft:finish-replay')).rows[0].id;
      const first = await client.query<{ finished: boolean }>(`
        SELECT public.finish_live_workout_session($1::uuid, 'Push', 20, NULL::uuid, 'done') AS finished
      `, [sessionId]);
      expect(first.rows[0].finished).toBe(true);
      const replay = await client.query<{ finished: boolean }>(`
        SELECT public.finish_live_workout_session($1::uuid, 'Push', 20, NULL::uuid, 'done') AS finished
      `, [sessionId]);
      expect(replay.rows[0].finished).toBe(true);
      const envelope = await client.query<{ pain_flags: unknown }>(`
        SELECT live_finish_request->'pain_flags' AS pain_flags
        FROM public.workout_sessions WHERE id = $1
      `, [sessionId]);
      expect(envelope.rows[0].pain_flags).toEqual([]);

      await client.query('SAVEPOINT conflicting_finish');
      await expect(client.query(`
        SELECT public.finish_live_workout_session($1::uuid, 'Push', 21, NULL::uuid, 'done')
      `, [sessionId])).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT conflicting_finish');
    });
  });

  it('rejects direct set inserts and stale-tab starts after the session is terminal', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyTerminal, 'draft:terminal')).rows[0].id;
      await client.query(`
        SELECT public.finish_live_workout_session($1::uuid, 'Push', 20, NULL::uuid, NULL::text)
      `, [sessionId]);

      await client.query('SAVEPOINT late_set');
      await expect(client.query(`
        INSERT INTO public.workout_sets (
          session_id, exercise_id, set_number, weight_kg, reps, rpe, is_warmup, is_pr, superset_group
        ) VALUES ($1, $2, 1, 60, 8, 8, false, false, 1)
      `, [sessionId, IDS.exerciseA])).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT late_set');

      await client.query('SAVEPOINT stale_start');
      await expect(start(client, IDS.keyTerminal, 'draft:terminal')).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT stale_start');
    });
  });

  it('serializes a terminal finish ahead of undo across two connections', async () => {
    const started = await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyDeleteRace, 'draft:delete-race')).rows[0].id;
      const saved = await client.query<{ id: string }>(`
        SELECT public.save_live_workout_set(
          $1::uuid, $2::uuid, 1, 60::real, 8, 8::real, false, false, 1
        ) AS id
      `, [sessionId, IDS.exerciseA]);
      return { sessionId, setId: saved.rows[0].id };
    }, true);

    const finisher = await pool.connect();
    const undoer = await pool.connect();
    try {
      await finisher.query('BEGIN');
      await switchUser(finisher);
      await finisher.query(`
        SELECT public.finish_live_workout_session(
          $1::uuid, 'Push', 20, NULL::uuid,
          NULL::text, NULL::real, NULL::real
        )
      `, [started.sessionId]);

      await undoer.query('BEGIN');
      await switchUser(undoer);
      let settled = false;
      const pendingUndo = undoer.query(`
        SELECT public.delete_live_workout_set($1::uuid, $2::uuid)
      `, [started.sessionId, started.setId]).finally(() => { settled = true; });
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(settled).toBe(false);

      await finisher.query('COMMIT');
      await expect(pendingUndo).rejects.toMatchObject({ code: '22023' });
      await undoer.query('ROLLBACK');
    } finally {
      await finisher.query('ROLLBACK').catch(() => undefined);
      await undoer.query('ROLLBACK').catch(() => undefined);
      finisher.release();
      undoer.release();
    }

    const remaining = await pool.query(`SELECT id FROM public.workout_sets WHERE id = $1`, [started.setId]);
    expect(remaining.rowCount).toBe(1);
  });

  it('rejects direct set deletion after terminal completion', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyDirectDelete, 'draft:direct-delete')).rows[0].id;
      const saved = await client.query<{ id: string }>(`
        SELECT public.save_live_workout_set(
          $1::uuid, $2::uuid, 1, 60::real, 8, 8::real, false, false, 1
        ) AS id
      `, [sessionId, IDS.exerciseA]);
      await client.query(`
        SELECT public.finish_live_workout_session(
          $1::uuid, 'Push', 20, NULL::uuid,
          NULL::text, NULL::real, NULL::real
        )
      `, [sessionId]);
      await client.query('SAVEPOINT direct_delete');
      await expect(client.query(`DELETE FROM public.workout_sets WHERE id = $1`, [saved.rows[0].id]))
        .rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT direct_delete');
    });
  });

  it('rejects every set-column update after completion and preserves the row', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyTerminalUpdates, 'draft:terminal-updates')).rows[0].id;
      const saved = await client.query<{ id: string }>(`
        SELECT public.save_live_workout_set($1::uuid, $2::uuid, 1, 60::real, 8, 8::real, false, false, 1) AS id
      `, [sessionId, IDS.exerciseA]);
      await client.query(`SELECT public.finish_live_workout_session($1::uuid, 'Push', 20, NULL::uuid, NULL::text, NULL::real, NULL::real)`, [sessionId]);
      const assignments = [
        'id = id', 'session_id = session_id', 'exercise_id = exercise_id', 'set_number = 2',
        'weight_kg = 99', 'reps = 12', 'rpe = 9', 'is_warmup = true', 'is_pr = true',
        'superset_group = 1', `notes = 'changed'`, `client_request = '{"changed":true}'::jsonb`,
        `created_at = created_at + interval '1 second'`,
      ];
      for (let index = 0; index < assignments.length; index += 1) {
        await client.query(`SAVEPOINT terminal_column_${index}`);
        await expect(client.query(`UPDATE public.workout_sets SET ${assignments[index]} WHERE id = $1`, [saved.rows[0].id]))
          .rejects.toMatchObject({ code: '22023' });
        await client.query(`ROLLBACK TO SAVEPOINT terminal_column_${index}`);
      }
      const preserved = await client.query(`SELECT weight_kg, reps, rpe, is_warmup, is_pr, notes FROM public.workout_sets WHERE id = $1`, [saved.rows[0].id]);
      expect(preserved.rows[0]).toMatchObject({ weight_kg: 60, reps: 8, rpe: 8, is_warmup: false, is_pr: false, notes: null });
    });
  });

  it('cannot clear database terminal authority to reopen a completed workout', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyTerminalAuthority, 'draft:terminal-authority')).rows[0].id;
      const saved = await client.query<{ id: string }>(`
        SELECT public.save_live_workout_set($1::uuid, $2::uuid, 1, 60::real, 8, 8::real, false, false, 1) AS id
      `, [sessionId, IDS.exerciseA]);
      await client.query(`SELECT public.finish_live_workout_session($1::uuid, 'Push', 20, NULL::uuid, NULL::text, NULL::real, NULL::real)`, [sessionId]);

      const authorityAssignments = [
        'duration_minutes = NULL', 'completed_at = NULL', `session_date = '2026-08-23'`,
        `name = 'Changed'`, `notes = 'changed'`, `pain_flags = '[{"body_part":"knee"}]'::jsonb`,
        `client_idempotency_key = 'a7100000-0000-4000-8000-000000000099'::uuid`,
        `client_request = '{"changed":true}'::jsonb`, `live_structure = '[]'::jsonb`,
        'live_structure_version = live_structure_version + 1', `client_draft_fingerprint = 'changed'`,
        `pain_mutation_ids = ARRAY['a7100000-0000-4000-8000-000000000098'::uuid]`,
        `live_finish_request = '{"changed":true}'::jsonb`, `workout_kind = 'cardio'`,
        `cardio_activity = 'run'`, 'cardio_distance_km = 5', 'cardio_effort = 7',
      ];
      for (let index = 0; index < authorityAssignments.length; index += 1) {
        await client.query(`SAVEPOINT reopen_terminal_${index}`);
        await expect(client.query(`UPDATE public.workout_sessions SET ${authorityAssignments[index]} WHERE id = $1`, [sessionId]))
          .rejects.toMatchObject({ code: '22023' });
        await client.query(`ROLLBACK TO SAVEPOINT reopen_terminal_${index}`);
      }
      await client.query('SAVEPOINT mutate_terminal_set');
      await expect(client.query(`UPDATE public.workout_sets SET reps = 12 WHERE id = $1`, [saved.rows[0].id]))
        .rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT mutate_terminal_set');

      const preserved = await client.query(`
        SELECT session.duration_minutes, session.completed_at, set_row.reps
        FROM public.workout_sessions session
        JOIN public.workout_sets set_row ON set_row.session_id = session.id
        WHERE session.id = $1
      `, [sessionId]);
      expect(preserved.rows[0]).toMatchObject({ duration_minutes: 20, reps: 8 });
      expect(preserved.rows[0].completed_at).not.toBeNull();
    });
  });

  it('allows the same complete set-column update surface while the session is live', async () => {
    await asUser(async (client) => {
      const sessionId = (await start(client, IDS.keyLiveUpdates, 'draft:live-updates')).rows[0].id;
      const saved = await client.query<{ id: string }>(`
        SELECT public.save_live_workout_set($1::uuid, $2::uuid, 1, 60::real, 8, 8::real, false, false, 1) AS id
      `, [sessionId, IDS.exerciseA]);
      const assignments = [
        'id = id', 'session_id = session_id', 'exercise_id = exercise_id', 'set_number = 2',
        'weight_kg = 99', 'reps = 12', 'rpe = 9', 'is_warmup = true', 'is_pr = true',
        'superset_group = 1', `notes = 'changed'`, `client_request = '{"changed":true}'::jsonb`,
        `created_at = created_at + interval '1 second'`,
      ];
      for (let index = 0; index < assignments.length; index += 1) {
        await client.query(`SAVEPOINT live_column_${index}`);
        const result = await client.query(`UPDATE public.workout_sets SET ${assignments[index]} WHERE id = $1`, [saved.rows[0].id]);
        expect(result.rowCount).toBe(1);
        await client.query(`ROLLBACK TO SAVEPOINT live_column_${index}`);
      }
    });
  });

  it('stores retrospective cardio facts in typed columns without English notes', async () => {
    await asUser(async (client) => {
      const saved = await client.query<{ id: string }>(`
        SELECT public.save_retrospective_workout(
          $1::uuid, '2026-08-25'::date, 'cardio', 'Morning run', NULL::uuid,
          31, '[]'::jsonb, 'run', 5.25::real, 7::real, '[]'::jsonb
        ) AS id
      `, [IDS.keyCardio]);
      const row = await client.query(`
        SELECT workout_kind, cardio_activity, cardio_distance_km, cardio_effort, notes
        FROM public.workout_sessions WHERE id = $1
      `, [saved.rows[0].id]);
      expect(row.rows[0]).toEqual({
        workout_kind: 'cardio', cardio_activity: 'run',
        cardio_distance_km: 5.25, cardio_effort: 7, notes: null,
      });
    });
  });

  it('rejects mixed key/fingerprint identity while preserving exact same-row replay', async () => {
    await asUser(async (client) => {
      const activeA = await start(client, IDS.keyIdentityA, 'draft:identity-a');
      const completedB = await start(client, IDS.keyIdentityB, 'draft:identity-b');
      await client.query(`
        SELECT public.finish_live_workout_session($1::uuid, 'Push', 20, NULL::uuid, NULL::text)
      `, [completedB.rows[0].id]);

      const exactReplay = await start(client, IDS.keyIdentityA, 'draft:identity-a');
      expect(exactReplay.rows[0].id).toBe(activeA.rows[0].id);

      await client.query('SAVEPOINT mixed_identity');
      await expect(start(client, IDS.keyIdentityA, 'draft:identity-b')).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT mixed_identity');
    });
  });

  it('bootstraps only owned active legacy sessions and preserves the old start overload', async () => {
    await asUser(async (client) => {
      const legacy = await client.query<{ id: string }>(`
        INSERT INTO public.workout_sessions (
          user_id, session_date, name, pain_flags, client_idempotency_key, client_request
        ) VALUES (
          auth.uid(), '2026-08-24', 'Legacy Push', '[]'::jsonb, $1,
          jsonb_build_object('mode', 'live', 'session_date', '2026-08-24', 'name', 'Legacy Push', 'template_id', NULL)
        ) RETURNING id
      `, [IDS.keyLegacy]);
      const resumed = await client.query<{ result: { version: number; structure: LiveStructure } }>(`
        SELECT public.resume_legacy_live_workout_session(
          $1::uuid, 'strength'::text, $2::jsonb
        ) AS result
      `, [legacy.rows[0].id, JSON.stringify(initialStructure)]);
      expect(resumed.rows[0].result).toEqual({ version: 0, structure: initialStructure });

      await client.query(`UPDATE public.workout_sessions SET duration_minutes = 10 WHERE id = $1`, [legacy.rows[0].id]);
      await client.query('SAVEPOINT completed_resume');
      await expect(client.query(`
        SELECT public.resume_legacy_live_workout_session($1::uuid, 'strength'::text, $2::jsonb)
      `, [legacy.rows[0].id, JSON.stringify(initialStructure)])).rejects.toMatchObject({ code: '22023' });
      await client.query('ROLLBACK TO SAVEPOINT completed_resume');

      const oldStart = await client.query<{ id: string }>(`
        SELECT public.start_workout_session($1::uuid, '2026-08-24'::date, 'Old client', NULL::uuid) AS id
      `, [IDS.keyOldClient]);
      const oldRetry = await client.query<{ id: string }>(`
        SELECT public.start_workout_session($1::uuid, '2026-08-24'::date, 'Old client', NULL::uuid) AS id
      `, [IDS.keyOldClient]);
      expect(oldRetry.rows[0].id).toBe(oldStart.rows[0].id);
      const oldDefaultRetry = await client.query<{ id: string }>(`
        SELECT public.start_workout_session($1::uuid, '2026-08-24'::date, 'Old client') AS id
      `, [IDS.keyOldClient]);
      expect(oldDefaultRetry.rows[0].id).toBe(oldStart.rows[0].id);
      expect((await client.query(`SELECT live_structure FROM public.workout_sessions WHERE id = $1`, [oldStart.rows[0].id])).rows[0].live_structure).toBeNull();
    });
  });
});
