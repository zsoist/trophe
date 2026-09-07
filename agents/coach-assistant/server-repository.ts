import { authorizeSubject } from './context';
import type { Actor, Subject } from './context';
import type { CoachRepository, PersonalContextRow, ExerciseRow, NutritionRow, PlanRow, ReadArgs, WorkoutRow } from './repository';

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
        // Supabase reads the JSON claims; the repository's isolated bootstrap
        // also supports scalar claim GUCs. Both use the same verified actor.
        await execute("SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', 'authenticated', true)",
          [JSON.stringify({ sub: actorId, role: 'authenticated' }), actorId]);
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
      const rows = await query<{ actor: Actor; subject: Subject | null }>(`
        SELECT jsonb_build_object('id', a.id, 'role', a.role, 'organizationIds',
          ARRAY(SELECT org_id FROM organization_members WHERE user_id = a.id LIMIT 8)) AS actor,
          CASE WHEN cp.user_id IS NOT NULL THEN jsonb_build_object('id', s.id, 'coachId', cp.coach_id, 'timezone', s.timezone,
            'language', s.language, 'organizationIds',
            ARRAY(SELECT org_id FROM organization_members WHERE user_id = s.id LIMIT 8)) ELSE NULL END AS subject
        FROM profiles a LEFT JOIN profiles s ON s.id = $2::uuid
        LEFT JOIN client_profiles cp ON cp.user_id = s.id
        WHERE a.id = $1::uuid LIMIT 1`, [actorId, subjectId], signal);
      return authorizeSubject(rows[0]?.actor ?? null, rows[0]?.subject ?? null);
    },
    personalContext: args => bounded<PersonalContextRow>(args, `
      SELECT cp.user_id AS "userId", to_jsonb(cp)->'workout_preferences' AS preferences,
        coalesce((SELECT jsonb_agg(memory) FROM (
          SELECT m.id,m.user_id AS "userId",left(m.fact_text,500) AS text,m.source,m.created_at::text AS "createdAt",m.scope,
            md5(m.id::text || m.fact_text || m.active::text || coalesce(m.superseded_by::text,'')) AS version
          FROM memory_chunks m WHERE m.user_id=cp.user_id AND m.scope='user' AND m.active=true
            AND m.superseded_by IS NULL AND (m.expires_at IS NULL OR m.expires_at>now())
            AND m.created_at >= $3::date - interval '365 days' AND m.created_at < $3::date + interval '1 day'
          ORDER BY m.created_at DESC,m.id LIMIT 11
        ) memory),'[]'::jsonb) AS memories
      FROM client_profiles cp WHERE cp.user_id=$1::uuid AND $2::date <= $3::date LIMIT $4`),
    nutrition: args => bounded<NutritionRow>(args, `
      SELECT id, user_id AS "userId", logged_date::text AS date, calories, protein_g AS "proteinG"
      FROM food_log WHERE user_id = $1::uuid AND logged_date BETWEEN $2::date AND $3::date
      ORDER BY logged_date, id LIMIT $4`),
    async plan(args) {
      type RawPlan = Omit<PlanRow,'days'> & { daysTruncated:boolean;days:Array<{id:string;weekday:number;templateId:string;targets:unknown[]}> };
      const data = await bounded<RawPlan>(args, `
        SELECT p.id, p.client_id AS "userId", p.starts_on::text AS "startsOn", p.status,
          (EXISTS(SELECT 1 FROM workout_program_days d WHERE d.program_id = p.id OFFSET 21 LIMIT 1)
            OR EXISTS(SELECT 1 FROM workout_program_days d LEFT JOIN workout_templates t ON t.id=d.template_id
              WHERE d.program_id=p.id AND (t.id IS NULL OR jsonb_array_length(t.exercises)>20) LIMIT 1)) AS "daysTruncated",
          coalesce((SELECT jsonb_agg(day) FROM (
            SELECT d.id, d.weekday, d.template_id AS "templateId", t.exercises AS targets
            FROM workout_program_days d JOIN workout_templates t ON t.id = d.template_id
            WHERE d.program_id = p.id AND jsonb_array_length(t.exercises) <= 20 ORDER BY d.weekday, d.id LIMIT 21
          ) day), '[]'::jsonb) AS days
        FROM workout_programs p WHERE p.client_id = $1::uuid AND p.status = 'active'
          AND (p.starts_on IS NULL OR p.starts_on <= $3::date) AND $2::date <= $3::date
        ORDER BY p.id LIMIT $4`);
      let incomplete=data.truncated||data.rows.some(p=>p.daysTruncated);
      const rows:PlanRow[]=data.rows.map(plan=>({
        id:plan.id,userId:plan.userId,startsOn:plan.startsOn,status:plan.status,
        days:plan.days.map(day=>{
          let targetSets=0;let targetReps=0;let repsKnown=true;
          if(!Array.isArray(day.targets)||day.targets.length>20){incomplete=true;return {id:day.id,weekday:day.weekday,templateId:day.templateId,targetSets:0,targetReps:null};}
          for(const raw of day.targets){
            if(!raw||typeof raw!=='object'||Array.isArray(raw)){incomplete=true;repsKnown=false;continue;}
            const target=raw as {target_sets?:unknown;target_reps?:unknown};
            const sets=target.target_sets;
            if(typeof sets!=='number'||!Number.isInteger(sets)||sets<1||sets>12){incomplete=true;repsKnown=false;continue;}
            targetSets+=sets;
            const reps=typeof target.target_reps==='string'?target.target_reps:'';
            if(!/^[0-9]{1,3}$/.test(reps)||Number(reps)<1)repsKnown=false;
            else targetReps+=sets*Number(reps);
          }
          return {id:day.id,weekday:day.weekday,templateId:day.templateId,targetSets,targetReps:repsKnown?targetReps:null};
        }),
      }));
      return { rows, truncated:incomplete };
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
