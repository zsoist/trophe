/** CI-only real repository/RLS integration. No bootstrap or migration is run here. */
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';
import { collectEvidence } from '@/agents/coach-assistant/tools';

const ci = process.env.CI === 'true';
// Fail closed in CI, skip locally. Never connect using an inherited remote URL.
function localCiUrl() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('Coach integration requires CI DATABASE_URL');
  const url = new URL(raw);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hostname !== '127.0.0.1'
    || url.port !== '5432' || url.pathname !== '/trophe_dev' || url.search || url.hash) {
    throw new Error('Coach integration permits only the existing loopback CI trophe_dev database');
  }
  return raw;
}

describe.skipIf(!ci)('coach real SQL and authenticated RLS on local CI', () => {
  const id = Object.fromEntries(['coach', 'client', 'peer', 'foreign', 'org', 'otherOrg', 'meal', 'foreignMeal', 'session', 'set', 'template', 'program', 'day'].map(key => [key, randomUUID()]));
  const users = [id.coach, id.client, id.peer, id.foreign];
  let pool: pg.Pool;
  let seeded = false;
  const signal = () => new AbortController().signal;
  const now = new Date('2026-09-07T03:30:00Z');

  beforeAll(async () => {
    pool = new pg.Pool({ connectionString: localCiUrl(), max: 2, connectionTimeoutMillis: 5000 });
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      for (const user of users) {
        const role = user === id.coach ? 'coach' : 'client';
        const email = `${user}@ag4.invalid`;
        await db.query('INSERT INTO auth.users (id,email) VALUES ($1,$2)', [user, email]);
        await db.query("INSERT INTO profiles (id,full_name,email,role,timezone,language) VALUES ($1,'AG4 synthetic',$2,$3,'America/Bogota','en')", [user, email, role]);
      }
      await db.query('INSERT INTO client_profiles (user_id,coach_id) VALUES ($1,$4),($2,NULL),($3,$4)', [id.client,id.peer,id.foreign,id.coach]);
      for (const org of [id.org,id.otherOrg]) await db.query("INSERT INTO organizations (id,name,slug,owner_id) VALUES ($1,'AG4 synthetic',$2,$3)", [org,`ag4-${org}`,id.coach]);
      await db.query("INSERT INTO organization_members (org_id,user_id,role) VALUES ($1,$3,'coach'),($1,$4,'client'),($1,$5,'client'),($2,$6,'client')", [id.org,id.otherOrg,id.coach,id.client,id.peer,id.foreign]);
      await db.query("INSERT INTO food_log (id,user_id,food_name,quantity,logged_date,calories,protein_g) VALUES ($1,$3,'AG4 synthetic',1,'2026-09-06',123,12),($2,$4,'AG4 foreign',1,'2026-09-06',999,99)", [id.meal,id.foreignMeal,id.client,id.foreign]);
      await db.query("INSERT INTO workout_templates (id,created_by,name,exercises) VALUES ($1,$2,'AG4 synthetic',$3::jsonb)", [id.template,id.coach,JSON.stringify([{target_sets:3,target_reps:'10'}])]);
      await db.query("INSERT INTO workout_programs (id,client_id,coach_id,name) VALUES ($1,$2,$3,'AG4 synthetic')", [id.program,id.client,id.coach]);
      await db.query('INSERT INTO workout_program_days (id,program_id,weekday,template_id) VALUES ($1,$2,0,$3)', [id.day,id.program,id.template]);
      await db.query("INSERT INTO workout_sessions (id,user_id,name,session_date,completed_at,template_id) VALUES ($1,$2,'AG4 synthetic','2026-09-06','2026-09-06T20:00:00Z',$3)", [id.session,id.client,id.template]);
      await db.query('INSERT INTO workout_sets (id,session_id,set_number,reps,weight_kg) VALUES ($1,$2,1,5,20)', [id.set,id.session]);
      await db.query('COMMIT'); seeded = true;
    } catch (error) { await db.query('ROLLBACK'); throw error; }
    finally { db.release(); }
  });

  afterAll(async () => {
    if (!pool) return;
    try {
      if (seeded) {
        const db = await pool.connect();
        try {
          await db.query('BEGIN');
          for (const [table, ids] of [
            ['workout_sets',[id.set]], ['workout_sessions',[id.session]],
            ['workout_program_days',[id.day]], ['workout_programs',[id.program]],
            ['workout_templates',[id.template]], ['food_log',[id.meal,id.foreignMeal]],
          ] as const) await db.query(`DELETE FROM ${table} WHERE id = ANY($1::uuid[])`, [ids]);
          await db.query('DELETE FROM organization_members WHERE org_id = ANY($1::uuid[]) AND user_id = ANY($2::uuid[])', [[id.org,id.otherOrg],users]);
          await db.query('DELETE FROM organizations WHERE id = ANY($1::uuid[])', [[id.org,id.otherOrg]]);
          await db.query('DELETE FROM client_profiles WHERE user_id = ANY($1::uuid[])', [users]);
          await db.query('DELETE FROM profiles WHERE id = ANY($1::uuid[])', [users]);
          await db.query('DELETE FROM auth.users WHERE id = ANY($1::uuid[])', [users]);
          await db.query('COMMIT');
        } catch (error) { await db.query('ROLLBACK'); throw error; }
        finally { db.release(); }
      }
    } finally { await pool.end(); }
  });

  it.each(['client','coach'])('computes only the assigned client facts for %s through actual content SQL', async actor => {
    const result = await collectEvidence({message:'Summarize today',intent:'today',clientId:id.client}, {actorId:id[actor],repository:createServerRepository(pool),now,signal:signal()});
    const fact = (key:string) => result.facts.find(item=>item.id===key);
    expect(fact('nutrition.calories')?.value).toBe(123);
    expect(fact('nutrition.protein')?.value).toBe(12);
    expect(fact('workout.sets')?.value).toBe(1);
    expect(fact('workout.volume')?.value).toBe(100);
    expect(fact('plan.sets')?.value).toBe(3);
    expect(fact('plan.reps')?.value).toBe(30);
    expect(JSON.stringify(result.facts)).not.toContain(id.foreignMeal);
  });

  it('denies shared-org unassigned client and assigned cross-org client', async () => {
    const repository = createServerRepository(pool);
    await expect(repository.authorize(id.coach,id.peer,signal())).rejects.toThrow('forbidden');
    await expect(repository.authorize(id.coach,id.foreign,signal())).rejects.toThrow('forbidden');
    await expect(repository.authorize(id.peer,id.client,signal())).rejects.toThrow('forbidden');
  });

  it('RLS blocks a foreign owner even if the internal subject selector is deliberately forged', async () => {
    const repository = createServerRepository(pool);
    const context = await repository.authorize(id.client,id.client,signal());
    const rows = await repository.nutrition({context:{...context,subjectId:id.foreign},window:{start:'2026-09-06',end:'2026-09-06',days:1,timezone:'America/Bogota'},limit:128,signal:signal()});
    expect(rows.rows).toEqual([]);
  });
});
