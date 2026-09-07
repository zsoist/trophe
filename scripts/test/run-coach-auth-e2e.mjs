#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { runLocalAuthenticatedE2E } from './run-local-auth-e2e.mjs';
import { assertLoopbackDatabaseUrl, assertLoopbackSupabaseUrl, assertAuthUserAbsent } from './local-auth-e2e-core.mjs';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireId(value) {
  if (!uuid.test(value ?? '')) throw new Error('Coach E2E disposable identity is unavailable');
  return value;
}

/** CI fixture only. App requests still authenticate against real local Supabase. */
export async function executeCoachWeek({ status, env, actors, service }) {
  if (process.env.CI !== 'true') throw new Error('Coach Auth E2E is CI-only');
  assertLoopbackDatabaseUrl(status.DB_URL);
  assertLoopbackSupabaseUrl(status.API_URL);
  const clientId = requireId(actors?.clientId);
  const coachId = requireId(actors?.coachId);
  const orgId = requireId(env.E2E_TEST_ORG_ID);
  if (!service?.auth?.admin) throw new Error('Coach E2E requires the disposable Auth service');
  const ids = Object.fromEntries(['org', 'template', 'program', 'day', 'meal', 'sessionA', 'sessionB', 'setA', 'setB', 'setC'].map(key => [key, randomUUID()]));
  // Profiles are explicitly UTC. SQL derives the date in that same timezone.
  const pool = new pg.Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  let foreignId;
  let seeded = false;
  let primaryError;
  const cleanupErrors = [];
  try {
    const created = await service.auth.admin.createUser({
      email: `coach-week-${randomUUID()}@local.invalid`, password: `${randomUUID()}Aa1!`,
      email_confirm: true, user_metadata: { full_name: 'Coach week foreign fixture', local_e2e: true },
    });
    if (created.error || !created.data?.user) throw new Error('Coach foreign Auth fixture creation failed');
    foreignId = requireId(created.data.user.id);
    const db = await pool.connect();
    let day;
    try {
      await db.query('BEGIN');
      day = (await db.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
      const profile = await db.query("UPDATE profiles SET timezone='UTC', language='en' WHERE id=$1", [clientId]);
      if (profile.rowCount !== 1) throw new Error('Coach disposable client profile is missing');
      await db.query("INSERT INTO profiles (id,full_name,email,role,timezone,language) VALUES ($1,'Coach foreign fixture',$2,'client','UTC','en') ON CONFLICT (id) DO UPDATE SET role='client',timezone='UTC',language='en'", [foreignId, created.data.user.email]);
      await db.query('INSERT INTO client_profiles (user_id,coach_id) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET coach_id=EXCLUDED.coach_id', [foreignId, coachId]);
      await db.query("INSERT INTO organizations (id,name,slug,owner_id) VALUES ($1,'Coach foreign fixture',$2,$3)", [ids.org, `coach-week-${ids.org}`, coachId]);
      await db.query("INSERT INTO organization_members (org_id,user_id,role) VALUES ($1,$2,'client'),($1,$3,'coach'),($4,$5,'client')", [orgId, clientId, coachId, ids.org, foreignId]);
      // The common runner owns these disposable identities. Remove its base meal
      // by captured IDs so the week has a single, explicit nutritional oracle.
      const baseMeals = await db.query('SELECT id FROM food_log WHERE user_id=$1', [clientId]);
      await db.query('DELETE FROM food_log WHERE id=ANY($1::uuid[]) AND user_id=$2', [baseMeals.rows.map(row => row.id), clientId]);
      await db.query("INSERT INTO food_log (id,user_id,food_name,quantity,logged_date,calories,protein_g) VALUES ($1,$2,'Coach week fixture',1,$3::date,500,30)", [ids.meal, clientId, day]);
      const exercise = (await db.query('SELECT id,name,muscle_group FROM exercises WHERE is_template=true AND created_by IS NULL ORDER BY id LIMIT 1')).rows[0];
      if (!exercise) throw new Error('Coach fixture requires an existing catalog exercise');
      await db.query("INSERT INTO workout_templates (id,created_by,name,exercises) VALUES ($1,$2,'Coach week fixture',$3::jsonb)", [ids.template, coachId, JSON.stringify([{ exercise_id: exercise.id, name: exercise.name, muscle_group: exercise.muscle_group, target_sets: 3, target_reps: '10', rest_seconds: 90 }])]);
      await db.query("INSERT INTO workout_programs (id,client_id,coach_id,name) VALUES ($1,$2,$3,'Coach week fixture')", [ids.program, clientId, coachId]);
      await db.query('INSERT INTO workout_program_days (id,program_id,weekday,template_id) VALUES ($1,$2,EXTRACT(DOW FROM $3::date)::integer,$4)', [ids.day, ids.program, day, ids.template]);
      for (const sessionId of [ids.sessionA, ids.sessionB]) {
        await db.query("INSERT INTO workout_sessions (id,user_id,name,session_date,template_id) VALUES ($1,$2,'Coach week fixture',$3::date,$4)", [sessionId, clientId, day, ids.template]);
      }
      await db.query('INSERT INTO workout_sets (id,session_id,exercise_id,set_number,reps,weight_kg) VALUES ($1,$4,$6,1,10,20),($2,$4,$6,2,5,20),($3,$5,$6,1,8,10)', [ids.setA, ids.setB, ids.setC, ids.sessionA, ids.sessionB, exercise.id]);
      const completed = await db.query('UPDATE workout_sessions SET duration_minutes=20 WHERE id=ANY($1::uuid[]) RETURNING completed_at', [[ids.sessionA, ids.sessionB]]);
      if (completed.rows.length !== 2 || completed.rows.some(row => !row.completed_at)) throw new Error('Coach fixture terminal transition failed');
      await db.query('COMMIT');
      seeded = true;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }

    const childEnv = {
      ...env, CI: 'true', COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline',
      COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', COACH_ASSISTANT_PREVIEW_USER_IDS: `${clientId},${coachId}`,
      E2E_COACH_WEEK: '1', E2E_CLIENT_ID: clientId, E2E_COACH_ID: coachId, E2E_FOREIGN_ID: foreignId,
      E2E_WEEK_SESSION_IDS: JSON.stringify([ids.sessionA, ids.sessionB]),
      E2E_WEEK_SET_IDS: JSON.stringify([ids.setA, ids.setB, ids.setC]),
      E2E_COACH_DAY: day,
      E2E_COACH_EXPECTED_JSON: JSON.stringify({ sessions: 2, sets: 3, reps: 23, volume: 380, planSets: 3, planReps: 30, calories: 500, protein: 30 }),
    };
    // Defense in depth: the common runner already blanks paid capability keys.
    for (const key of Object.keys(childEnv)) {
      if (/(OPENAI|ANTHROPIC|GOOGLE|GEMINI|VOYAGE|DEEPSEEK|AI_GATEWAY|OPENROUTER).*(_KEY|_TOKEN)$/.test(key)) childEnv[key] = '';
    }
    const result = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-week.spec.ts'], { stdio: 'inherit', env: childEnv });
    if (result.error || result.status !== 0) throw new Error(`Coach Auth E2E failed with status ${result.status ?? 1}`);
  } catch (error) { primaryError = error; }
  finally {
    if (seeded) {
      let db;
      try {
        db = await pool.connect();
        await db.query('BEGIN');
        // Includes partial-session fixtures created by the sequential spec, all
        // belonging to this newly created client. Parent deletion preserves guards.
        const sessions = await db.query('SELECT id FROM workout_sessions WHERE user_id=$1', [clientId]);
        await db.query('DELETE FROM workout_sessions WHERE id=ANY($1::uuid[]) AND user_id=$2', [sessions.rows.map(row => row.id), clientId]);
        await db.query('DELETE FROM workout_program_days WHERE id=$1 AND program_id=$2', [ids.day, ids.program]);
        await db.query('DELETE FROM workout_programs WHERE id=$1 AND client_id=$2', [ids.program, clientId]);
        await db.query('DELETE FROM workout_templates WHERE id=$1 AND created_by=$2', [ids.template, coachId]);
        await db.query('DELETE FROM food_log WHERE id=$1 AND user_id=$2', [ids.meal, clientId]);
        await db.query('DELETE FROM organization_members WHERE (org_id=$1 AND user_id=ANY($2::uuid[])) OR (org_id=$3 AND user_id=$4)', [orgId, [clientId, coachId], ids.org, foreignId]);
        await db.query('DELETE FROM organizations WHERE id=$1', [ids.org]);
        await db.query('COMMIT');
      } catch (error) {
        if (db) await db.query('ROLLBACK').catch(() => {});
        cleanupErrors.push(error);
      } finally { db?.release(); }
    }
    if (foreignId) {
      try {
        const result = await service.auth.admin.deleteUser(foreignId);
        if (result.error) throw new Error('Coach foreign Auth cleanup failed');
        assertAuthUserAbsent(await service.auth.admin.getUserById(foreignId), 'coach foreign cleanup', foreignId);
      } catch (error) { cleanupErrors.push(error); }
    }
    await pool.end();
  }
  if (primaryError || cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors].filter(Boolean), 'Coach Auth E2E execution or cleanup failed');
}

export async function runCoachAuthE2E() {
  if (process.env.CI !== 'true') throw new Error('Coach Auth E2E is CI-only');
  return runLocalAuthenticatedE2E({ executeWithDisposableRoles: executeCoachWeek });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCoachAuthE2E().then(() => process.stdout.write('Coach Auth E2E passed; disposable fixtures removed.\n')).catch(() => {
    // Never print provider responses, connection strings or disposable credentials.
    process.stderr.write('Coach Auth E2E failed; inspect the redacted test report and cleanup status.\n');
    process.exitCode = 1;
  });
}
