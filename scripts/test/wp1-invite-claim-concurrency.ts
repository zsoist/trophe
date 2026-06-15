/**
 * WP1 adversarial test (v5) — reservation ownership + recovery state machine (0042).
 * Production-shaped throwaway Postgres (TEST_DATABASE_URL). Proves claim race
 * correctness + idempotency, attach compare-and-set, finalizer ownership enforcement,
 * leased orphan recovery vs finalize mutual exclusion, lease re-claim, ordinary-signup
 * recovery, and service_role-only execution. Never touches prod.
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
const claimOrd = (pseudo: string, idem: string, fp = FP) => one('SELECT * FROM claim_ordinary_signup($1,$2,$3)', [pseudo, idem, fp]);
const attach = (res: string, uid: string) => one('SELECT attach_reservation_user($1,$2) o', [res, uid]).then(r => r.o);
const finBeta = (res: string, uid: string) => one(`SELECT finalize_beta_signup($1,$2,'N','e@x.io','1.0','{}'::jsonb) ok`, [res, uid]).then(r => r.ok);
const finClient = (res: string, uid: string) => one(`SELECT finalize_client_activation($1,$2,'N','e@x.io','1.0','{}'::jsonb) ok`, [res, uid]).then(r => r.ok);
const finOrd = (res: string, uid: string) => one(`SELECT finalize_ordinary_signup($1,$2,'N','e@x.io','1.0','{}'::jsonb) ok`, [res, uid]).then(r => r.ok);
const usedCount = async (code: string) => (await one(`SELECT used_count FROM beta_invite_codes WHERE code=$1`, [code])).used_count;
const resStatus = async (id: string) => (await one(`SELECT status FROM invite_reservations WHERE id=$1`, [id])).status;
const profileCount = async (id: string) => (await one(`SELECT count(*)::int n FROM profiles WHERE id=$1`, [id])).n;
const newBeta = async (code: string, role = 'coach', max = 1) => { await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ($1,$2,$3)`, [code, role, max]); };

async function main() {
  await setup();
  const N = 25;

  console.log('T1: beta 25 distinct keys / max_uses=1 → exactly 1 claimed');
  await newBeta('T1'); const r1 = await Promise.all(Array.from({ length: N }, () => claimBeta('T1', randomUUID())));
  ok(r1.filter(x => x.outcome === 'claimed').length === 1 && await usedCount('T1') === 1, `exactly 1 claimed, used_count=1`);

  console.log('T2: beta max_uses=3 → exactly 3');
  await newBeta('T2', 'coach', 3); const r2 = await Promise.all(Array.from({ length: N }, () => claimBeta('T2', randomUUID())));
  ok(r2.filter(x => x.outcome === 'claimed').length === 3, `exactly 3 claimed`);

  console.log('T3: beta same-key 25 → 1 reservation');
  await newBeta('T3'); const k3 = randomUUID(); const r3 = await Promise.all(Array.from({ length: N }, () => claimBeta('T3', k3)));
  const nn3 = r3.filter(x => x.reservation_id);
  ok(nn3.length === N && new Set(nn3.map(x => x.reservation_id)).size === 1 && await usedCount('T3') === 1, `all 25 → 1 reservation, used_count=1`);

  console.log('T4: client 25 distinct → 1 claimed, status pending');
  const tok = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const r4 = await Promise.all(Array.from({ length: N }, () => claimClient(tok, randomUUID())));
  ok(r4.filter(x => x.outcome === 'claimed').length === 1 && (await one(`SELECT status FROM client_invites WHERE token=$1`, [tok])).status === 'pending', `1 claim, status pending`);

  console.log('T5: client same-key 25 → 1 reservation');
  const tok5 = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const k5 = randomUUID(); const r5 = await Promise.all(Array.from({ length: N }, () => claimClient(tok5, k5)));
  const nn5 = r5.filter(x => x.reservation_id);
  ok(nn5.length === N && new Set(nn5.map(x => x.reservation_id)).size === 1, `all 25 client same-key → 1 reservation`);

  console.log('T6: beta happy path (claim→attach→finalize), role derived');
  await newBeta('T6'); const c6 = await claimBeta('T6', randomUUID()); const u6 = randomUUID();
  ok(await attach(c6.reservation_id, u6) === 'attached', 'attach ok');
  ok(await finBeta(c6.reservation_id, u6) === true && (await one(`SELECT role::text r FROM profiles WHERE id=$1`, [u6])).r === 'coach', 'finalize true, role=coach derived');

  console.log('T7: finalize REQUIRES prior attach + matching user');
  await newBeta('T7'); const c7 = await claimBeta('T7', randomUUID()); const u7 = randomUUID();
  ok(await finBeta(c7.reservation_id, u7) === false, 'finalize without attach → false');
  await attach(c7.reservation_id, u7);
  ok(await finBeta(c7.reservation_id, randomUUID()) === false, 'finalize with WRONG user → false');
  ok(await finBeta(c7.reservation_id, u7) === true, 'finalize with attached user → true');

  console.log('T8: attach is compare-and-set (no overwrite)');
  await newBeta('T8'); const c8 = await claimBeta('T8', randomUUID()); const uA = randomUUID(), uB = randomUUID();
  ok(await attach(c8.reservation_id, uA) === 'attached', 'first attach ok');
  ok(await attach(c8.reservation_id, uB) === 'conflict', 'second different user → conflict');
  ok(await finBeta(c8.reservation_id, uB) === false && await finBeta(c8.reservation_id, uA) === true, 'only the first-attached user can finalize');

  console.log('T9: attach after reservation expiry → gone');
  await newBeta('T9'); const c9 = await claimBeta('T9', randomUUID());
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c9.reservation_id]);
  ok(await attach(c9.reservation_id, randomUUID()) === 'gone', 'attach on expired reservation → gone');

  console.log('T10: beta finalize revalidates CODE expiry');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses,expires_at) VALUES ('T10','coach',1,now()+interval '1 h')`);
  const c10 = await claimBeta('T10', randomUUID()); const u10 = randomUUID(); await attach(c10.reservation_id, u10);
  await pool.query(`UPDATE beta_invite_codes SET expires_at=now()-interval '1 min' WHERE code='T10'`);
  ok(await finBeta(c10.reservation_id, u10) === false && await profileCount(u10) === 0, 'expired code → finalize false, no account');

  console.log('T11: client happy path — coach derived, invite accepted');
  const coachX = randomUUID();
  const tok11 = (await one(`INSERT INTO client_invites (coach_id) VALUES ($1) RETURNING token`, [coachX])).token;
  const c11 = await claimClient(tok11, randomUUID()); const u11 = randomUUID(); await attach(c11.reservation_id, u11);
  ok(await finClient(c11.reservation_id, u11) === true, 'client finalize true');
  ok((await one(`SELECT coach_id FROM client_profiles WHERE user_id=$1`, [u11])).coach_id === coachX, 'coach derived from invite');
  ok((await one(`SELECT status FROM client_invites WHERE token=$1`, [tok11])).status === 'accepted', 'invite accepted');

  console.log('T12: client finalize rejects revoked invite');
  const tok12 = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const c12 = await claimClient(tok12, randomUUID()); const u12 = randomUUID(); await attach(c12.reservation_id, u12);
  await pool.query(`UPDATE client_invites SET status='revoked' WHERE token=$1`, [tok12]);
  ok(await finClient(c12.reservation_id, u12) === false && await profileCount(u12) === 0, 'revoked → false, no account');

  console.log('T13: cross-type finalize rejected');
  await newBeta('T13'); const cb = await claimBeta('T13', randomUUID()); const ub = randomUUID(); await attach(cb.reservation_id, ub);
  ok(await finClient(cb.reservation_id, ub) === false, 'beta reservation rejected by client finalizer');
  const tok13 = (await one(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).token;
  const cc = await claimClient(tok13, randomUUID()); const uc = randomUUID(); await attach(cc.reservation_id, uc);
  ok(await finBeta(cc.reservation_id, uc) === false, 'client reservation rejected by beta finalizer');

  console.log('T14: ordinary signup happy path (claim→attach→finalize)');
  const pseudo = randomUUID(); const co = await claimOrd(pseudo, randomUUID()); const uo = randomUUID();
  await attach(co.reservation_id, uo);
  ok(await finOrd(co.reservation_id, uo) === true, 'ordinary finalize true');
  ok(await profileCount(uo) === 1 && (await one(`SELECT count(*)::int n FROM client_profiles WHERE user_id=$1`, [uo])).n === 1, 'profile+client_profile created');

  console.log('T15: completed replay (beta + client) → replayed_completed + user');
  await newBeta('T15'); const k15 = randomUUID(); const c15 = await claimBeta('T15', k15); const u15 = randomUUID();
  await attach(c15.reservation_id, u15); await finBeta(c15.reservation_id, u15);
  const rep15 = await claimBeta('T15', k15);
  ok(rep15.outcome === 'replayed_completed' && rep15.res_user_id === u15, `beta post-finalize replay → replayed_completed + same user`);

  console.log('T16: reserved replay returns the ATTACHED user (avoids 2nd Auth user)');
  await newBeta('T16'); const k16 = randomUUID(); const c16 = await claimBeta('T16', k16); const u16 = randomUUID();
  await attach(c16.reservation_id, u16);
  const rep16 = await claimBeta('T16', k16);
  ok(rep16.outcome === 'replayed_reserved' && rep16.res_user_id === u16, `reserved replay returns attached user`);

  console.log('T17: generic release REJECTS attached reservations');
  await newBeta('T17'); const c17 = await claimBeta('T17', randomUUID()); await attach(c17.reservation_id, randomUUID());
  ok(await one('SELECT release_invite_reservation($1) ok', [c17.reservation_id]).then(r => r.ok) === false, 'release attached → false');
  ok(await resStatus(c17.reservation_id) === 'reserved', 'attached reservation still reserved (not freed)');
  await newBeta('T17b'); const c17b = await claimBeta('T17b', randomUUID()); // unattached
  ok(await one('SELECT release_invite_reservation($1) ok', [c17b.reservation_id]).then(r => r.ok) === true && await usedCount('T17b') === 0, 'unattached release → true, slot freed');

  console.log('T18: NO blind sweep — even unattached-expired is LEASED for reconciliation');
  await newBeta('T18'); const c18 = await claimBeta('T18', randomUUID()); // crashed before auth: user_id NULL
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c18.reservation_id]);
  const leased18 = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows;
  const l18 = leased18.find(o => o.reservation_id === c18.reservation_id);
  ok(!!l18 && !!l18.recovery_token, 'unattached-expired leased with a recovery token');
  ok(await resStatus(c18.reservation_id) === 'recovering' && await one('SELECT cancel_recovering_reservation($1,$2) ok', [c18.reservation_id, l18.recovery_token]).then(r => r.ok) === true && await usedCount('T18') === 0, 'worker reconciles + cancels (token), slot freed');

  console.log('T18b: ordinary signup converges across retry keys (one live per identity)');
  const ident = randomUUID();
  const oa = await claimOrd(ident, randomUUID()); const ob = await claimOrd(ident, randomUUID()); // SAME identity, DIFFERENT keys
  ok(oa.outcome === 'claimed' && ob.outcome === 'conflict', `2nd key for same identity → conflict (got '${ob.outcome}')`);

  console.log('T18c: recovery rejects non-positive lease');
  let leaseRejected = false;
  try { await pool.query('SELECT claim_orphan_for_recovery(50, 0)'); } catch { leaseRejected = true; }
  ok(leaseRejected, 'claim_orphan_for_recovery(_, 0) raises');

  console.log('T19: crash-after-auth recovery — lease → worker cancels');
  await newBeta('T19'); const c19 = await claimBeta('T19', randomUUID()); const u19 = randomUUID(); await attach(c19.reservation_id, u19);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c19.reservation_id]);
  const leased = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows;
  const l19 = leased.find(o => o.reservation_id === c19.reservation_id);
  ok(!!l19 && l19.user_id === u19 && !!l19.recovery_token, 'orphan leased for recovery (with token)');
  ok(await resStatus(c19.reservation_id) === 'recovering', 'status → recovering');
  ok(await finBeta(c19.reservation_id, u19) === false, 'finalize on recovering → false (mutual exclusion)');
  ok(await one('SELECT cancel_recovering_reservation($1,$2) ok', [c19.reservation_id, l19.recovery_token]).then(r => r.ok) === true && await usedCount('T19') === 0, 'worker cancels (token) after deleting Auth user, slot freed');
  console.log('T19b: synchronous route compensation (cancel_attached_reservation, user match)');
  await newBeta('T19b'); const c19b = await claimBeta('T19b', randomUUID()); const u19b = randomUUID(); await attach(c19b.reservation_id, u19b);
  ok(await one('SELECT cancel_attached_reservation($1,$2) ok', [c19b.reservation_id, u19b]).then(r => r.ok) === true && await usedCount('T19b') === 0, 'route deletes Auth user then cancel_attached frees the slot');
  await newBeta('T19c'); const c19c = await claimBeta('T19c', randomUUID()); await attach(c19c.reservation_id, randomUUID());
  ok(await one('SELECT cancel_attached_reservation($1,$2) ok', [c19c.reservation_id, randomUUID()]).then(r => r.ok) === false, 'cancel_attached rejects a wrong user');

  console.log('T20: recovery vs finalize mutual exclusion (not-expired → finalize wins)');
  await newBeta('T20'); const c20 = await claimBeta('T20', randomUUID()); const u20 = randomUUID(); await attach(c20.reservation_id, u20);
  const leased20 = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows; // not expired → not leased
  ok(!leased20.some(o => o.reservation_id === c20.reservation_id), 'not-expired reservation is not leased');
  ok(await finBeta(c20.reservation_id, u20) === true, 'finalize succeeds (recovery did not interfere)');

  console.log('T21: recovery-worker crash → lease expiry → re-claimable');
  await newBeta('T21'); const c21 = await claimBeta('T21', randomUUID()); const u21 = randomUUID(); await attach(c21.reservation_id, u21);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c21.reservation_id]);
  await pool.query('SELECT claim_orphan_for_recovery(50,120)'); // leased by worker that then "crashes"
  await pool.query(`UPDATE invite_reservations SET recovering_lease_until=now()-interval '1 min' WHERE id=$1`, [c21.reservation_id]); // lease expires
  const reLease = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows;
  ok(reLease.some(o => o.reservation_id === c21.reservation_id), 'expired-lease recovering reservation re-claimed');

  console.log('T22: ordinary-signup crash recovery');
  const pseudo22 = randomUUID(); const c22 = await claimOrd(pseudo22, randomUUID()); const u22 = randomUUID(); await attach(c22.reservation_id, u22);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c22.reservation_id]);
  const leased22 = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows;
  const l22 = leased22.find(o => o.reservation_id === c22.reservation_id);
  ok(!!l22 && l22.invite_type === 'ordinary', 'ordinary orphan leased');
  ok(await one('SELECT cancel_recovering_reservation($1,$2) ok', [c22.reservation_id, l22.recovery_token]).then(r => r.ok) === true, 'ordinary orphan cancelled (token)');

  console.log('T22b: stale recovery token rejected after lease reassignment');
  await newBeta('T22b'); const c22b = await claimBeta('T22b', randomUUID()); const u22b = randomUUID(); await attach(c22b.reservation_id, u22b);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c22b.reservation_id]);
  const leaseA = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22b.reservation_id);
  await pool.query(`UPDATE invite_reservations SET recovering_lease_until=now()-interval '1 min' WHERE id=$1`, [c22b.reservation_id]); // worker A lease expires
  const leaseB = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22b.reservation_id);
  ok(!!leaseB && leaseB.recovery_token !== leaseA.recovery_token, 'worker B reclaims with a NEW token');
  ok(await one('SELECT cancel_recovering_reservation($1,$2) ok', [c22b.reservation_id, leaseA.recovery_token]).then(r => r.ok) === false, 'stale worker-A token → cancel REJECTED');
  ok(await one('SELECT cancel_recovering_reservation($1,$2) ok', [c22b.reservation_id, leaseB.recovery_token]).then(r => r.ok) === true, 'current worker-B token → cancel succeeds');

  console.log('T22c: route compensation cannot cancel a leased (recovering) row');
  await newBeta('T22c'); const c22c = await claimBeta('T22c', randomUUID()); const u22c = randomUUID(); await attach(c22c.reservation_id, u22c);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c22c.reservation_id]);
  await pool.query('SELECT claim_orphan_for_recovery(50,120)'); // → recovering
  ok(await one('SELECT cancel_attached_reservation($1,$2) ok', [c22c.reservation_id, u22c]).then(r => r.ok) === false, 'cancel_attached refuses a recovering row (recovery owns it)');

  console.log('T22d: cancel requires a current token AND a live lease (4 cases)');
  await newBeta('T22d'); const c22d = await claimBeta('T22d', randomUUID()); const u22d = randomUUID(); await attach(c22d.reservation_id, u22d);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c22d.reservation_id]);
  const lzA = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22d.reservation_id);
  await pool.query(`UPDATE invite_reservations SET recovering_lease_until=now()-interval '1 sec' WHERE id=$1`, [c22d.reservation_id]); // lease expires, NOT reassigned
  ok(await one('SELECT cancel_recovering_reservation($1,$2) ok', [c22d.reservation_id, lzA.recovery_token]).then(r => r.ok) === false, '(2) expired-lease token → cancel rejected (before reassignment)');
  const lzB = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22d.reservation_id);
  ok(await one('SELECT cancel_recovering_reservation($1,$2) ok', [c22d.reservation_id, lzA.recovery_token]).then(r => r.ok) === false, '(3) old token after reassignment → rejected');
  ok(await one('SELECT cancel_recovering_reservation($1,$2) ok', [c22d.reservation_id, lzB.recovery_token]).then(r => r.ok) === true, '(1+4) current unexpired token → succeeds');

  console.log('T23: PERMISSIONS — all 11 RPCs: anon/auth DENIED, service_role allowed');
  const fns = ['claim_beta_invite(text,uuid,text)', 'claim_client_invite(uuid,uuid,text)', 'claim_ordinary_signup(uuid,uuid,text)',
    'attach_reservation_user(uuid,uuid)', 'finalize_beta_signup(uuid,uuid,text,text,text,jsonb)',
    'finalize_client_activation(uuid,uuid,text,text,text,jsonb)', 'finalize_ordinary_signup(uuid,uuid,text,text,text,jsonb)',
    'release_invite_reservation(uuid)', 'cancel_attached_reservation(uuid,uuid)',
    'cancel_recovering_reservation(uuid,uuid)', 'claim_orphan_for_recovery(int,int)'];
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
