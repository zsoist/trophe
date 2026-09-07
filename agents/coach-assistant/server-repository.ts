import { authorizeSubject } from './context';
import type { Actor, Subject } from './context';
import type { CoachRepository, ExerciseRow, NutritionRow, PlanRow, ReadArgs, WorkoutRow } from './repository';

/** Narrow port over the existing pg pool. No model sees this interface. */
interface Connection {
  query(input: { text: string; values?: unknown[]; query_timeout?: number }): Promise<{ rows: Record<string, unknown>[] }>;
  release(destroy?: boolean): void;
}
export interface ReadPool { connect(): Promise<Connection> }

export function createServerRepository(pool: ReadPool): CoachRepository {
  async function query<T>(text: string, values: unknown[], signal: AbortSignal, actorId?: string): Promise<T[]> {
    signal.throwIfAborted();
    const connection = await pool.connect();
    let released = false;
    const destroy = () => { if (!released) { released = true; connection.release(true); } };
    signal.addEventListener('abort', destroy, { once: true });
    try {
      signal.throwIfAborted();
      const execute = async (statement: string, parameters?: unknown[]) => {
        signal.throwIfAborted();
        const result = await connection.query({ text: statement, values: parameters, query_timeout: 5000 });
        signal.throwIfAborted(); return result;
      };
      await execute('BEGIN READ ONLY');
      await execute("SET LOCAL statement_timeout = '5000ms'");
      if (actorId) {
        await execute('SET LOCAL ROLE authenticated');
        await execute("SELECT set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: actorId, role: 'authenticated' })]);
      }
      const result = await execute(text, values);
      await execute('ROLLBACK');
      return result.rows as T[];
    } catch (error) {
      destroy();
      if (signal.aborted) signal.throwIfAborted();
      throw error;
    } finally {
      signal.removeEventListener('abort', destroy);
      if (!released) { released = true; connection.release(); }
    }
  }
  async function bounded<T>(args: ReadArgs, text: string, extra: unknown[] = []) {
    const rows = await query<T>(text, [args.context.subjectId, args.window.start, args.window.end, args.limit + 1, ...extra], args.signal, args.context.actorId);
    return { rows: rows.slice(0, args.limit), truncated: rows.length > args.limit };
  }
  return {
    dataSource: 'authorized_records',
    async authorize(actorId, subjectId, signal) {
      // Existing owner pool is used only for this bounded authorization metadata
      // query. All content reads below additionally use authenticated RLS.
      const rows = await query<{ actor: Actor; subject: Subject }>(`
        SELECT jsonb_build_object('id', a.id, 'role', a.role, 'organizationIds',
          ARRAY(SELECT org_id FROM organization_members WHERE user_id = a.id LIMIT 8)) AS actor,
          jsonb_build_object('id', s.id, 'coachId', cp.coach_id, 'timezone', s.timezone,
            'language', s.language, 'organizationIds',
            ARRAY(SELECT org_id FROM organization_members WHERE user_id = s.id LIMIT 8)) AS subject
        FROM profiles a CROSS JOIN profiles s
        JOIN client_profiles cp ON cp.user_id = s.id
        WHERE a.id = $1::uuid AND s.id = $2::uuid LIMIT 1`, [actorId, subjectId], signal);
      return authorizeSubject(rows[0]?.actor ?? null, rows[0]?.subject ?? null);
    },
    nutrition: args => bounded<NutritionRow>(args, `
      SELECT id, user_id AS "userId", logged_date::text AS date, calories, protein_g AS "proteinG"
      FROM food_log WHERE user_id = $1::uuid AND logged_date BETWEEN $2::date AND $3::date
      ORDER BY logged_date, id LIMIT $4`),
    async plan(args) {
      const data = await bounded<PlanRow & { daysTruncated: boolean }>(args, `
        SELECT p.id, p.client_id AS "userId", p.starts_on::text AS "startsOn", p.status,
          (EXISTS(SELECT 1 FROM workout_program_days d WHERE d.program_id = p.id OFFSET 21 LIMIT 1)
            OR EXISTS(SELECT 1 FROM workout_program_days d LEFT JOIN workout_templates t ON t.id=d.template_id
              WHERE d.program_id=p.id AND (t.id IS NULL OR jsonb_array_length(t.exercises)>20) LIMIT 1)) AS "daysTruncated",
          coalesce((SELECT jsonb_agg(day) FROM (
            SELECT d.id, d.weekday, d.template_id AS "templateId", coalesce((SELECT sum((item->>'target_sets')::int)
              FROM jsonb_array_elements(t.exercises) item
              WHERE jsonb_typeof(item->'target_sets') = 'number'
                AND (item->>'target_sets')::numeric BETWEEN 1 AND 12), 0) AS "targetSets",
              (SELECT CASE WHEN bool_and((item->>'target_reps') ~ '^[0-9]{1,3}$'
                AND (item->>'target_sets') ~ '^[0-9]{1,2}$')
                THEN sum(CASE WHEN (item->>'target_reps') ~ '^[0-9]{1,3}$'
                  AND (item->>'target_sets') ~ '^[0-9]{1,2}$'
                  THEN (item->>'target_reps')::int*(item->>'target_sets')::int ELSE 0 END)
                ELSE NULL END FROM jsonb_array_elements(t.exercises) item) AS "targetReps"
            FROM workout_program_days d JOIN workout_templates t ON t.id = d.template_id
            WHERE d.program_id = p.id AND jsonb_array_length(t.exercises) <= 20 ORDER BY d.weekday, d.id LIMIT 21
          ) day), '[]'::jsonb) AS days
        FROM workout_programs p WHERE p.client_id = $1::uuid AND p.status = 'active'
          AND (p.starts_on IS NULL OR p.starts_on <= $3::date) AND $2::date <= $3::date
        ORDER BY p.id LIMIT $4`);
      return { rows: data.rows, truncated: data.truncated || data.rows.some(p => p.daysTruncated) };
    },
    async workouts(args) {
      const data = await bounded<WorkoutRow & { setsTruncated: boolean }>(args, `
        SELECT s.id, s.user_id AS "userId", s.session_date::text AS date,
          s.completed_at::text AS "completedAt", s.client_idempotency_key AS "idempotencyKey",
          s.duration_minutes AS "durationMinutes", s.template_id AS "templateId",
          EXISTS(SELECT 1 FROM workout_sets ws WHERE ws.session_id = s.id OFFSET 200 LIMIT 1) AS "setsTruncated",
          coalesce((SELECT jsonb_agg(item) FROM (
            SELECT ws.id, ws.reps, ws.weight_kg AS "weightKg", coalesce(ws.is_warmup,false) AS "isWarmup"
            FROM workout_sets ws WHERE ws.session_id = s.id ORDER BY ws.id LIMIT 200
          ) item), '[]'::jsonb) AS sets
        FROM workout_sessions s WHERE s.user_id = $1::uuid
          AND s.session_date BETWEEN $2::date AND $3::date
        ORDER BY s.session_date, s.id LIMIT $4`);
      return { rows: data.rows, truncated: data.truncated || data.rows.some(s => s.setsTruncated) };
    },
    exercise: args => bounded<ExerciseRow>(args, `
      SELECT id, name, ARRAY[instructions] AS instructions, true AS curated
      FROM exercises WHERE id = $5::uuid AND is_template = true AND created_by IS NULL
        AND instructions IS NOT NULL AND length(instructions) <= 2100
        AND $1::uuid IS NOT NULL AND $2::date <= $3::date
      LIMIT $4`, [args.exerciseId]),
  };
}
