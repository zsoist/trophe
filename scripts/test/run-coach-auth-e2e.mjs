#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { runLocalAuthenticatedE2E } from './run-local-auth-e2e.mjs';
import { assertLoopbackDatabaseUrl, assertLoopbackSupabaseUrl, assertAuthUserAbsent } from './local-auth-e2e-core.mjs';

const commonPhases = new Set(['local_status', 'target_validation', 'auth_client', 'profile_client', 'auth_coach', 'profile_coach', 'auth_admin', 'profile_admin', 'relationship', 'nutrition', 'meal_plan', 'organization', 'execute', 'cleanup']);
const phases = new Set([...commonPhases, 'preflight', 'auth_create', 'db_connect', 'seed_profiles', 'seed_memberships', 'seed_food', 'seed_catalog', 'seed_plan', 'seed_sessions', 'seed_complete', 'seed_commit', 'playwright_engine', 'playwright_voice', 'playwright_on', 'playwright_off', 'playwright_professional_on', 'playwright_professional_off', 'cleanup_db_connect', 'cleanup_sessions', 'cleanup_plan', 'cleanup_memberships', 'cleanup_commit', 'auth_delete', 'auth_verify', 'pool_close', 'local_status', 'common_auth', 'common_profile', 'common_client', 'common_relationship', 'common_food', 'common_plan', 'common_org', 'common_cleanup', 'unknown']);
const commonErrors = new Map([
  ['local Supabase status is unavailable', 'local_status'],
  ['local auth user creation failed', 'common_auth'],
  ['local E2E profile provisioning failed', 'common_profile'],
  ['local E2E client profile provisioning failed', 'common_client'],
  ['local E2E coach relationship provisioning failed', 'common_relationship'],
  ['local E2E nutrition fixture provisioning failed', 'common_food'],
  ['local E2E meal-plan fixture provisioning failed', 'common_plan'],
  ['local E2E organization provisioning failed', 'common_org'],
  ['local E2E user cleanup failed', 'common_cleanup'],
  ['local E2E owned rows cleanup failed', 'common_cleanup'],
  ['Coach Auth E2E requires GitHub CI', 'preflight'],
  ['Coach Auth E2E requires the exact disposable CI targets', 'preflight'],
]);

/** Construct a fresh allowlisted object; never serialize the source error. */
export function safeDiagnostic(phase, error, outcome = 'failed') {
  const record = { event: 'coach_e2e_diagnostic', phase: phases.has(phase) ? phase : 'unknown', outcome: ['passed', 'failed', 'skipped'].includes(outcome) ? outcome : 'failed' };
  const source = error?.cause && typeof error.cause === 'object' ? error.cause : error;
  if (typeof source?.code === 'string' && /^[0-9A-Z]{5}$/.test(source.code)) record.sqlstate = source.code;
  if (Number.isInteger(source?.status) && source.status >= 400 && source.status <= 599) record.authStatus = source.status;
  return record;
}
let diagnosticCount = 0;
function diagnostic(phase, error, outcome) {
  if (diagnosticCount++ < 16) process.stderr.write(`${JSON.stringify(safeDiagnostic(phase, error, outcome))}\n`);
}
function commonDiagnostic(error, fallbackPhase) {
  // Exact messages select fixed labels only; no arbitrary message is emitted.
  diagnostic(commonPhases.has(error?.localE2EPhase) ? error.localE2EPhase : commonErrors.get(error?.message) ?? fallbackPhase, error);
  if (error instanceof AggregateError) for (const child of error.errors.slice(0, 4)) diagnostic(commonPhases.has(child?.localE2EPhase) ? child.localE2EPhase : commonErrors.get(child?.message) ?? 'unknown', child);
}

function assertCi() {
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Coach Auth E2E requires GitHub CI');
}
function assertTargets(status) {
  const db = assertLoopbackDatabaseUrl(status.DB_URL);
  const api = assertLoopbackSupabaseUrl(status.API_URL);
  if (db.hostname !== '127.0.0.1' || db.port !== '54322' || db.pathname !== '/postgres' || db.search || db.hash
    || api.hostname !== '127.0.0.1' || api.port !== '54321' || api.pathname !== '/' || api.search || api.hash || api.username || api.password) {
    throw new Error('Coach Auth E2E requires the exact disposable CI targets');
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireId(value) {
  if (!uuid.test(value ?? '')) throw new Error('Coach E2E disposable identity is unavailable');
  return value;
}

/** CI fixture only. App requests still authenticate against real local Supabase. */
export async function executeCoachWeek({ status, env, actors, service }) {
  assertCi();
  assertTargets(status);
  const clientId = requireId(actors?.clientId);
  const coachId = requireId(actors?.coachId);
  const orgId = requireId(env.E2E_TEST_ORG_ID);
  if (!service?.auth?.admin) throw new Error('Coach E2E requires the disposable Auth service');
  const ids = Object.fromEntries(['org', 'template', 'program', 'day', 'meal', 'draftDumbbell', 'sessionA', 'sessionB', 'setA', 'setB', 'setC'].map(key => [key, randomUUID()]));
  // Profiles are explicitly UTC. SQL derives the date in that same timezone.
  const pool = new pg.Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
  let foreignId;
  let unassignedId;
  let seeded = false;
  let primaryError;
  let phase = 'auth_create';
  const cleanupErrors = [];
  try {
    const created = await service.auth.admin.createUser({
      email: `coach-week-${randomUUID()}@local.invalid`, password: `${randomUUID()}Aa1!`,
      email_confirm: true, user_metadata: { full_name: 'Coach week foreign fixture', local_e2e: true },
    });
    if (created.error) throw created.error;
    if (!created.data?.user) throw new Error('Coach foreign Auth fixture creation failed');
    foreignId = requireId(created.data.user.id);
    const unassigned = await service.auth.admin.createUser({
      email: `coach-unassigned-${randomUUID()}@local.invalid`, password: `${randomUUID()}Aa1!`,
      email_confirm: true, user_metadata: { full_name: 'Coach unassigned fixture', local_e2e: true },
    });
    if (unassigned.error) throw unassigned.error;
    if (!unassigned.data?.user) throw new Error('Coach unassigned Auth fixture creation failed');
    unassignedId = requireId(unassigned.data.user.id);
    phase = 'db_connect';
    const db = await pool.connect();
    let day;
    try {
      await db.query('BEGIN');
      day = (await db.query("SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date::text AS day")).rows[0].day;
      phase = 'seed_profiles';
      const profile = await db.query("UPDATE profiles SET timezone='UTC', language='en' WHERE id=$1", [clientId]);
      if (profile.rowCount !== 1) throw new Error('Coach disposable client profile is missing');
      await db.query("INSERT INTO profiles (id,full_name,email,role,timezone,language) VALUES ($1,'Coach foreign fixture',$2,'client','UTC','en') ON CONFLICT (id) DO UPDATE SET role='client',timezone='UTC',language='en'", [foreignId, created.data.user.email]);
      await db.query('INSERT INTO client_profiles (user_id,coach_id) VALUES ($1,$2) ON CONFLICT (user_id) DO UPDATE SET coach_id=EXCLUDED.coach_id', [foreignId, coachId]);
      await db.query("INSERT INTO profiles (id,full_name,email,role,timezone,language) VALUES ($1,'Coach unassigned fixture',$2,'client','UTC','en') ON CONFLICT (id) DO UPDATE SET role='client',timezone='UTC',language='en'", [unassignedId, unassigned.data.user.email]);
      await db.query('INSERT INTO client_profiles (user_id,coach_id) VALUES ($1,NULL) ON CONFLICT (user_id) DO UPDATE SET coach_id=NULL', [unassignedId]);
      phase = 'seed_memberships';
      await db.query("INSERT INTO organizations (id,name,slug,owner_id) VALUES ($1,'Coach foreign fixture',$2,$3)", [ids.org, `coach-week-${ids.org}`, coachId]);
      await db.query("INSERT INTO organization_members (org_id,user_id,role) VALUES ($1,$2,'client'),($1,$3,'coach'),($1,$4,'client'),($5,$6,'client')", [orgId, clientId, coachId, unassignedId, ids.org, foreignId]);
      // The common runner owns these disposable identities. Remove its base meal
      // by captured IDs so the week has a single, explicit nutritional oracle.
      phase = 'seed_food';
      const baseMeals = await db.query('SELECT id FROM food_log WHERE user_id=$1', [clientId]);
      await db.query('DELETE FROM food_log WHERE id=ANY($1::uuid[]) AND user_id=$2', [baseMeals.rows.map(row => row.id), clientId]);
      await db.query("INSERT INTO food_log (id,user_id,food_name,quantity,logged_date,calories,protein_g) VALUES ($1,$2,'Coach week fixture',1,$3::date,500,30)", [ids.meal, clientId, day]);
      phase = 'seed_catalog';
      const exercise = (await db.query('SELECT id,name,muscle_group FROM exercises WHERE is_template=true AND created_by IS NULL ORDER BY id LIMIT 1')).rows[0];
      if (!exercise) throw new Error('Coach fixture requires an existing catalog exercise');
      await db.query("INSERT INTO exercises (id,name,muscle_group,equipment,is_template,instructions) VALUES ($1,'Coach draft dumbbell fixture',$2,'dumbbell',true,'Disposable authenticated draft-review fixture.')", [ids.draftDumbbell, exercise.muscle_group]);
      phase = 'seed_plan';
      await db.query("INSERT INTO workout_templates (id,created_by,name,exercises) VALUES ($1,$2,'Coach week fixture',$3::jsonb)", [ids.template, coachId, JSON.stringify([{ exercise_id: exercise.id, name: exercise.name, muscle_group: exercise.muscle_group, target_sets: 3, target_reps: '10', rest_seconds: 90 }])]);
      await db.query("INSERT INTO workout_programs (id,client_id,coach_id,name) VALUES ($1,$2,$3,'Coach week fixture')", [ids.program, clientId, coachId]);
      await db.query('INSERT INTO workout_program_days (id,program_id,weekday,template_id) VALUES ($1,$2,EXTRACT(DOW FROM $3::date)::integer,$4)', [ids.day, ids.program, day, ids.template]);
      phase = 'seed_sessions';
      for (const sessionId of [ids.sessionA, ids.sessionB]) {
        await db.query("INSERT INTO workout_sessions (id,user_id,name,session_date,template_id) VALUES ($1,$2,'Coach week fixture',$3::date,$4)", [sessionId, clientId, day, ids.template]);
      }
      await db.query('INSERT INTO workout_sets (id,session_id,exercise_id,set_number,reps,weight_kg) VALUES ($1,$4,$6,1,10,20),($2,$4,$6,2,5,20),($3,$5,$6,1,8,10)', [ids.setA, ids.setB, ids.setC, ids.sessionA, ids.sessionB, exercise.id]);
      phase = 'seed_complete';
      const completed = await db.query('UPDATE workout_sessions SET duration_minutes=20 WHERE id=ANY($1::uuid[]) RETURNING completed_at', [[ids.sessionA, ids.sessionB]]);
      if (completed.rows.length !== 2 || completed.rows.some(row => !row.completed_at)) throw new Error('Coach fixture terminal transition failed');
      phase = 'seed_commit';
      await db.query('COMMIT');
      seeded = true;
    } catch (error) { await db.query('ROLLBACK').catch(rollbackError => diagnostic('cleanup_commit', rollbackError)); throw error; }
    finally { db.release(); }

    const childEnv = {
      ...env, CI: 'true', NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_ENABLED: '1', COACH_ASSISTANT_MODE: 'offline',
      COACH_ASSISTANT_DATA_SOURCE: 'authorized_records', COACH_ASSISTANT_PREVIEW_USER_IDS: `${clientId},${coachId}`,
      E2E_COACH_WEEK: '1', E2E_COACH_FLAG_OFF: '0', E2E_COACH_PROFESSIONAL: '1', E2E_COACH_PROFESSIONAL_FLAG_OFF: '0',
      E2E_CLIENT_ID: clientId, E2E_COACH_ID: coachId, E2E_FOREIGN_ID: foreignId, E2E_UNASSIGNED_ID: unassignedId,
      E2E_WEEK_SESSION_IDS: JSON.stringify([ids.sessionA, ids.sessionB]),
      E2E_WEEK_SET_IDS: JSON.stringify([ids.setA, ids.setB, ids.setC]),
      E2E_COACH_DAY: day,
      E2E_COACH_EXPECTED_JSON: JSON.stringify({ sessions: 2, sets: 3, reps: 23, volume: 380, planSets: 3, planReps: 30, calories: 500, protein: 30 }),
    };
    // Defense in depth: the common runner already blanks paid capability keys.
    for (const key of Object.keys(childEnv)) {
      if (/(OPENAI|ANTHROPIC|GOOGLE|GEMINI|VOYAGE|DEEPSEEK|AI_GATEWAY|OPENROUTER).*(_KEY|_TOKEN)$/.test(key)) childEnv[key] = '';
    }
    phase = 'playwright_engine';
    const engineEnv = {
      ...childEnv,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1',
      COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1',
      COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '1',
      COACH_SQL_ACTOR: clientId,
      E2E_COACH_ENGINE: '1',
      E2E_COACH_DRAFT_ONLY: '1',
    };
    const engine = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-engine.spec.ts'], { stdio: 'inherit', env: engineEnv });
    if (engine.error || engine.status !== 0) throw new Error(`Coach Auth E2E isolated engine failed with status ${engine.status ?? 1}`);
    phase = 'playwright_voice';
    const voiceEnv = {
      ...childEnv,
      NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1',
      NEXT_PUBLIC_COACH_VOICE_FIXTURE_ENABLED: '1',
      NEXT_PUBLIC_COACH_VOICE_REVIEW_ENABLED: '1',
      COACH_ASSISTANT_VOICE_FIXTURE_ENABLED: '1',
      COACH_ASSISTANT_VOICE_REVIEW_ENABLED: '1',
      E2E_COACH_VOICE: '1',
    };
    const voice = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-voice.spec.ts'], { stdio: 'inherit', env: voiceEnv });
    if (voice.error || voice.status !== 0) throw new Error(`Coach Auth E2E isolated voice failed with status ${voice.status ?? 1}`);
    // Each Playwright process owns and closes its app server before the next
    // starts. Both reuse the same disposable Auth/DB fixture and final cleanup.
    const modes = [
      childEnv,
      { ...childEnv, NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0', COACH_ASSISTANT_ENABLED: '0', E2E_COACH_FLAG_OFF: '1', E2E_COACH_PROFESSIONAL_FLAG_OFF: '1' },
    ];
    for (const modeEnv of modes) {
      phase = modeEnv.E2E_COACH_FLAG_OFF === '1' ? 'playwright_off' : 'playwright_on';
      const result = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-week.spec.ts'], { stdio: 'inherit', env: modeEnv });
      if (result.error || result.status !== 0) throw new Error(`Coach Auth E2E flag-${modeEnv.E2E_COACH_FLAG_OFF === '1' ? 'off' : 'on'} failed with status ${result.status ?? 1}`);
      phase = modeEnv.E2E_COACH_PROFESSIONAL_FLAG_OFF === '1' ? 'playwright_professional_off' : 'playwright_professional_on';
      const professionalEnv = { ...modeEnv, NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: modeEnv.E2E_COACH_PROFESSIONAL_FLAG_OFF === '1' ? '0' : '1' };
      const professional = spawnSync(process.execPath, [resolve('node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.coach-professional.config.ts', '--workers=1'], { stdio: 'inherit', env: professionalEnv });
      if (professional.error || professional.status !== 0) throw new Error(`Professional Coach Auth E2E flag-${modeEnv.E2E_COACH_PROFESSIONAL_FLAG_OFF === '1' ? 'off' : 'on'} failed with status ${professional.status ?? 1}`);
    }
  } catch (error) { diagnostic(phase, error); primaryError = error; }
  finally {
    if (seeded) {
      let db;
      try {
        phase = 'cleanup_db_connect';
        db = await pool.connect();
        await db.query('BEGIN');
        // Includes partial-session fixtures created by the sequential spec, all
        // belonging to this newly created client. Parent deletion preserves guards.
        phase = 'cleanup_sessions';
        const sessions = await db.query('SELECT id FROM workout_sessions WHERE user_id=$1', [clientId]);
        await db.query('DELETE FROM workout_sessions WHERE id=ANY($1::uuid[]) AND user_id=$2', [sessions.rows.map(row => row.id), clientId]);
        phase = 'cleanup_plan';
        await db.query('DELETE FROM workout_program_days WHERE id=$1 AND program_id=$2', [ids.day, ids.program]);
        await db.query('DELETE FROM workout_programs WHERE id=$1 AND client_id=$2', [ids.program, clientId]);
        await db.query('DELETE FROM workout_templates WHERE id=$1 AND created_by=$2', [ids.template, coachId]);
        await db.query('DELETE FROM exercises WHERE id=$1 AND is_template=true AND created_by IS NULL', [ids.draftDumbbell]);
        await db.query('DELETE FROM food_log WHERE id=$1 AND user_id=$2', [ids.meal, clientId]);
        phase = 'cleanup_memberships';
        await db.query('DELETE FROM organization_members WHERE (org_id=$1 AND user_id=ANY($2::uuid[])) OR (org_id=$3 AND user_id=$4)', [orgId, [clientId, coachId, unassignedId], ids.org, foreignId]);
        await db.query('DELETE FROM organizations WHERE id=$1', [ids.org]);
        phase = 'cleanup_commit';
        await db.query('COMMIT');
        diagnostic('cleanup_commit', null, 'passed');
      } catch (error) {
        if (db) await db.query('ROLLBACK').catch(() => {});
        diagnostic(phase, error);
        cleanupErrors.push(error);
      } finally { db?.release(); }
    }
    if (!seeded) diagnostic('cleanup_commit', null, 'skipped');
    for (const [fixtureName, fixtureId] of [['foreign', foreignId], ['unassigned', unassignedId]]) {
      if (!fixtureId) continue;
      try {
        phase = 'auth_delete';
        const result = await service.auth.admin.deleteUser(fixtureId);
        if (result.error) throw result.error;
        phase = 'auth_verify';
        assertAuthUserAbsent(await service.auth.admin.getUserById(fixtureId), `coach ${fixtureName} cleanup`, fixtureId);
        diagnostic('auth_verify', null, 'passed');
      } catch (error) { diagnostic(phase, error); cleanupErrors.push(error); }
    }
    try { await pool.end(); diagnostic('pool_close', null, 'passed'); }
    catch (error) { diagnostic('pool_close', error); cleanupErrors.push(error); }
  }
  if (primaryError || cleanupErrors.length) throw new AggregateError([primaryError, ...cleanupErrors].filter(Boolean), 'Coach Auth E2E execution or cleanup failed');
}

export async function runCoachAuthE2E() {
  diagnosticCount = 0;
  let commonPhase = 'preflight';
  try {
    assertCi();
    return await runLocalAuthenticatedE2E({ validateStatus: assertTargets, executeWithDisposableRoles: executeCoachWeek, onPhase: phase => { commonPhase = commonPhases.has(phase) ? phase : 'unknown'; } });
  } catch (error) { commonDiagnostic(error, commonPhase); throw error; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runCoachAuthE2E().then(() => process.stdout.write('Coach Auth E2E passed; disposable fixtures removed.\n')).catch(() => {
    // Never print provider responses, connection strings or disposable credentials.
    process.stderr.write('Coach Auth E2E failed; inspect the redacted test report and cleanup status.\n');
    process.exitCode = 1;
  });
}
