/**
 * WP1 adversarial test (v3) for the atomic invite-claim/finalize RPCs (0042).
 * Production-shaped throwaway Postgres (TEST_DATABASE_URL). Proves: claim race
 * correctness + idempotency, AND that finalizers derive authority from the locked
 * invite (no role escalation / coach reassignment / revoked / expired / cross-type),
 * a concurrent finalize-vs-release race, and service_role-only execution for all fns.
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error('TEST_DATABASE_URL required'); process.exit(2); }
const pool = new Pool({ connectionString: url, max: 30 });

let fail = 0;
const ok = (c: boolean, m: string) => { if (c) console.log(`  ✓ ${m}`); else { console.error(`  ✗ ${m}`); fail++; } };
const FP = 'fp-default';
const one = async (q: string, p: unknown[] = []) => (await pool.query(q, p)).rows[0];

async function setup() {
  await pool.query(`DROP TABLE IF EXISTS invite_reservations, beta_invite_codes, client_invites, profiles, client_profiles, consents CASCADE;`);
  await pool.query(`DROP TYPE IF EXISTS user_role CASCADE;`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  for (const r of ['anon', 'authenticated', 'service_role'])
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${r}') THEN CREATE ROLE ${r} NOLOGIN; END IF; END $$;`);
  await pool.query(`CREATE TYPE user_role AS ENUM ('super_admin','admin','coach','client');`);
  await pool.query(`
    CREATE TABLE beta_invite_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
      role text NOT NULL DEFAULT 'coach', max_uses int NOT NULL DEFAULT 1, used_count int NOT NULL DEFAULT 0,
      cohort text, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE client_invites (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL DEFAULT gen_random_uuid(), client_email text, client_name text,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','revoked')),
      accepted_user_id uuid, expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days', created_at timestamptz NOT NULL DEFAULT now());
    CREATE TABLE profiles (id uuid PRIMARY KEY, full_name text NOT NULL, email text NOT NULL, role user_role NOT NULL, created_at timestamptz DEFAULT now());
    CREATE TABLE client_profiles (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, coach_id uuid,
      coaching_phase text, stabilization boolean NOT NULL DEFAULT false, contact_cadence_days int NOT NULL DEFAULT 14, created_at timestamptz DEFAULT now());
    CREATE TABLE consents (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, organization_id uuid,
      purpose text NOT NULL, version text NOT NULL, status text NOT NULL, evidence jsonb, granted_at timestamptz NOT NULL DEFAULT now(), withdrawn_at timestamptz);
  `);
  await pool.query(readFileSync(join(process.cwd(), 'drizzle/0042_invite_reservations.sql'), 'utf-8'));
}

const claimBeta = (code: string, idem: string, fp = FP) => one('SELECT * FROM claim_beta_invite($1,$2,$3)', [code, idem, fp]);
const claimClient = (token: string, idem: string, fp = FP) => one('SELECT * FROM claim_client_invite($1,$2,$3)', [token, idem, fp]);
const usedCount = async (code: string) => (await one(`SELECT used_count FROM beta_invite_codes WHERE code=$1`, [code])).used_count;
const profileCount = async (id: string) => (await one(`SELECT count(*)::int n FROM profiles WHERE id=$1`, [id])).n;

async function main() {
  await setup();
  const N = 25;

  console.log('T1: beta 25 distinct keys / max_uses=1 → exactly 1 claimed');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T1','coach',1)`);
  const r1 = await Promise.all(Array.from({ length: N }, () => claimBeta('T1', randomUUID())));
  ok(r1.filter(x => x.outcome === 'claimed').length === 1, `exactly 1 claimed (got ${r1.filter(x => x.outcome === 'claimed').length})`);
  ok(await usedCount('T1') === 1, `used_count=1`);

  console.log('T2: beta max_uses=3 → exactly 3 claimed');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T2','coach',3)`);
  const r2 = await Promise.all(Array.from({ length: N }, () => claimBeta('T2', randomUUID())));
  ok(r2.filter(x => x.outcome === 'claimed').length === 3, `exactly 3 claimed (got ${r2.filter(x => x.outcome === 'claimed').length})`);

  console.log('T3: beta SAME key 25 → all resolve to ONE reservation');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T3','coach',1)`);
  const k3 = randomUUID();
  const r3 = await Promise.all(Array.from({ length: N }, () => claimBeta('T3', k3)));
  const nn3 = r3.filter(x => x.reservation_id);
  ok(nn3.length === N && new Set(nn3.map(x => x.reservation_id)).size === 1, `all ${N} → 1 reservation (got ${nn3.length}/${new Set(nn3.map(x => x.reservation_id)).size})`);
  ok(await usedCount('T3') === 1, `used_count=1 after same-key storm`);

  console.log('T4: client 25 distinct keys → exactly 1; status stays pending');
  const tok = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const r4 = await Promise.all(Array.from({ length: N }, () => claimClient(tok, randomUUID())));
  ok(r4.filter(x => x.outcome === 'claimed').length === 1, `exactly 1 client claim (got ${r4.filter(x => x.outcome === 'claimed').length})`);
  ok((await one(`SELECT status FROM client_invites WHERE token=$1`, [tok])).status === 'pending', `status stays 'pending'`);

  console.log('T5: client SAME key 25 → all resolve to ONE reservation');
  const tok5 = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const k5 = randomUUID();
  const r5 = await Promise.all(Array.from({ length: N }, () => claimClient(tok5, k5)));
  const nn5 = r5.filter(x => x.reservation_id);
  ok(nn5.length === N && new Set(nn5.map(x => x.reservation_id)).size === 1, `all ${N} client same-key → 1 reservation`);

  console.log('T6: beta finalize DERIVES role from invite (no escalation possible)');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T6','coach',1)`);
  const c6 = await claimBeta('T6', randomUUID());
  const uid6 = randomUUID();
  const f6 = (await one(`SELECT finalize_beta_signup($1,$2,'N','e6@x.io','1.0','{}'::jsonb) ok`, [c6.reservation_id, uid6])).ok;
  ok(f6 === true, 'finalize true');
  ok((await one(`SELECT role::text r FROM profiles WHERE id=$1`, [uid6])).r === 'coach', `profile role='coach' DERIVED from invite (not caller)`);
  ok(await profileCount(uid6) === 1 && (await one(`SELECT count(*)::int n FROM consents WHERE user_id=$1`, [uid6])).n === 1, 'profile + consent (fail-closed) created');

  console.log('T7: beta finalize loses to expiry → false, no account');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T7','coach',1)`);
  const c7 = await claimBeta('T7', randomUUID());
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c7.reservation_id]);
  const uid7 = randomUUID();
  ok((await one(`SELECT finalize_beta_signup($1,$2,'N','e7@x.io','1.0','{}'::jsonb) ok`, [c7.reservation_id, uid7])).ok === false, 'expired → false');
  ok(await profileCount(uid7) === 0, 'no profile on lost finalize');

  console.log('T8: CLIENT finalize derives coach + accepts invite (was zero coverage)');
  const coachX = randomUUID();
  const tok8 = (await one(`INSERT INTO client_invites (coach_id) VALUES ($1) RETURNING token`, [coachX])).token;
  const c8 = await claimClient(tok8, randomUUID());
  const uid8 = randomUUID();
  ok((await one(`SELECT finalize_client_activation($1,$2,'N','e8@x.io','1.0','{}'::jsonb) ok`, [c8.reservation_id, uid8])).ok === true, 'client finalize true');
  ok((await one(`SELECT coach_id FROM client_profiles WHERE user_id=$1`, [uid8])).coach_id === coachX, `coach_id DERIVED from invite (no reassignment)`);
  ok((await one(`SELECT status FROM client_invites WHERE token=$1`, [tok8])).status === 'accepted', `invite → accepted`);

  console.log('T9: CLIENT finalize REJECTS revoked invite (revalidation)');
  const tok9 = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const c9 = await claimClient(tok9, randomUUID());
  await pool.query(`UPDATE client_invites SET status='revoked' WHERE token=$1`, [tok9]);
  const uid9 = randomUUID();
  ok((await one(`SELECT finalize_client_activation($1,$2,'N','e9@x.io','1.0','{}'::jsonb) ok`, [c9.reservation_id, uid9])).ok === false, 'revoked invite → false');
  ok(await profileCount(uid9) === 0, 'no account from revoked invite');

  console.log('T10: cross-type finalize rejected');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T10','coach',1)`);
  const betaRes = await claimBeta('T10', randomUUID());
  ok((await one(`SELECT finalize_client_activation($1,$2,'N','x@x.io','1.0','{}'::jsonb) ok`, [betaRes.reservation_id, randomUUID()])).ok === false, 'beta reservation rejected by client finalizer');
  const tok10 = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const clientRes = await claimClient(tok10, randomUUID());
  ok((await one(`SELECT finalize_beta_signup($1,$2,'N','x@x.io','1.0','{}'::jsonb) ok`, [clientRes.reservation_id, randomUUID()])).ok === false, 'client reservation rejected by beta finalizer');

  console.log('T11: ordinary (no-invite) signup finalizer is atomic + fail-closed');
  const uid11 = randomUUID();
  ok((await one(`SELECT finalize_ordinary_signup($1,'N','e11@x.io','1.0','{}'::jsonb) ok`, [uid11])).ok === true, 'ordinary finalize true');
  ok(await profileCount(uid11) === 1 && (await one(`SELECT count(*)::int n FROM client_profiles WHERE user_id=$1`, [uid11])).n === 1 && (await one(`SELECT count(*)::int n FROM consents WHERE user_id=$1`, [uid11])).n === 1, 'profile + client_profile + consent all created in one txn');

  console.log('T12: concurrent finalize vs release → exactly one wins, invariants intact');
  let raceBad = 0;
  for (let i = 0; i < 12; i++) {
    await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('R${i}','coach',1)`);
    const c = await claimBeta(`R${i}`, randomUUID());
    const uid = randomUUID();
    await Promise.all([
      pool.query(`SELECT finalize_beta_signup($1,$2,'N','r${i}@x.io','1.0','{}'::jsonb)`, [c.reservation_id, uid]).catch(() => {}),
      pool.query('SELECT release_invite_reservation($1)', [c.reservation_id]).catch(() => {}),
    ]);
    const st = (await one(`SELECT status FROM invite_reservations WHERE id=$1`, [c.reservation_id])).status;
    const hasAccount = await profileCount(uid) === 1;
    // invariant: completed⇔account, cancelled⇔no-account; never both
    if (!((st === 'completed' && hasAccount) || (st === 'cancelled' && !hasAccount))) raceBad++;
  }
  ok(raceBad === 0, `12 finalize/release races: every outcome consistent (bad=${raceBad})`);

  console.log('T13: PERMISSIONS — all 7 RPCs: anon/auth DENIED, service_role allowed');
  const fns = ['claim_beta_invite(text,uuid,text)', 'claim_client_invite(uuid,uuid,text)',
    'finalize_beta_signup(uuid,uuid,text,text,text,jsonb)', 'finalize_client_activation(uuid,uuid,text,text,text,jsonb)',
    'finalize_ordinary_signup(uuid,text,text,text,jsonb)', 'release_invite_reservation(uuid)', 'expire_stale_invite_reservations()'];
  for (const fn of fns) {
    const a = (await one(`SELECT has_function_privilege('anon','public.${fn}','EXECUTE') p`)).p;
    const au = (await one(`SELECT has_function_privilege('authenticated','public.${fn}','EXECUTE') p`)).p;
    const s = (await one(`SELECT has_function_privilege('service_role','public.${fn}','EXECUTE') p`)).p;
    ok(a === false && au === false && s === true, `${fn.split('(')[0]}: anon/auth DENIED, service_role allowed`);
  }

  await pool.end();
  console.log(fail === 0 ? '\n✅ ALL WP1 tests passed' : `\n❌ ${fail} assertion(s) failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
