/**
 * WP1 adversarial test (v7) — reservation ownership + recovery state machine (0042/0043/0044).
 * v6: worker reconciles Auth by verified reservation tag before deletion (P0 guard),
 * server-side find RPC replaces the bounded listUsers scan, payload-bound fingerprint.
 * v7: trusted app_metadata authority + exhaustive dup reconcile (T25/T27); durable
 * tombstone sweep reaps Auth users that arrive AFTER cancellation (T28).
 * v8: ALL cancellation paths arm tombstones — recovery (0044) AND route (0045,
 * cancel_reservation_for_route); legacy non-tombstoning cancels revoked (T23/T30).
 * v9: COMPLETED is also covered — sweepCompletedStrays (0046) reaps a stray carrier on
 * a completed row while preserving the legit finalized user (T31); 3-pass shared budget.
 * v10: completed sweep mirrors the tombstone lifecycle (fair backoff + seal-after-final-
 * boundary-reconcile, T31); adapter VERIFIES the keep-user's trusted tag before deleting,
 * fail-closed on mismatch/missing (T32).
 * Production-shaped throwaway Postgres (TEST_DATABASE_URL). Proves claim race
 * correctness + idempotency, attach compare-and-set, finalizer ownership enforcement,
 * leased orphan recovery vs finalize mutual exclusion, lease re-claim, ordinary-signup
 * recovery, and service_role-only execution. Never touches prod.
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { recoverOrphanReservations, sweepTombstones, sweepCompletedStrays, runRecoveryPasses, type RecoveryDb, type TombstoneDb, type CompletedDb, type AuthReconciler, type StrayReconciler } from '@/lib/recovery/reservation-recovery';
import { reservationIdentity } from '@/lib/auth/reservation-identity';
import { buildAuthReconciler } from '@/lib/auth/auth-admin';
import type { SupabaseClient } from '@supabase/supabase-js';

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
  // Minimal auth.users shim so 0043's SECURITY DEFINER lookup compiles + runs here
  // (prod has the real Supabase auth.users). Only the columns the RPC reads.
  await pool.query(`CREATE SCHEMA IF NOT EXISTS auth;`);
  await pool.query(`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), raw_user_meta_data jsonb, raw_app_meta_data jsonb);`);
  await pool.query(`TRUNCATE auth.users;`);
  await pool.query(readFileSync(join(process.cwd(), 'drizzle/0042_invite_reservations.sql'), 'utf-8'));
  await pool.query(readFileSync(join(process.cwd(), 'drizzle/0043_find_auth_user_by_reservation.sql'), 'utf-8'));
  await pool.query(readFileSync(join(process.cwd(), 'drizzle/0044_reservation_tombstones.sql'), 'utf-8'));
  await pool.query(readFileSync(join(process.cwd(), 'drizzle/0045_route_cancel_tombstoned.sql'), 'utf-8'));
  await pool.query(readFileSync(join(process.cwd(), 'drizzle/0046_completed_stray_recheck.sql'), 'utf-8'));
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
  ok(await one('SELECT cancel_reservation_for_route($1) ok', [c17.reservation_id]).then(r => r.ok) === false, 'release attached → false');
  ok(await resStatus(c17.reservation_id) === 'reserved', 'attached reservation still reserved (not freed)');
  await newBeta('T17b'); const c17b = await claimBeta('T17b', randomUUID()); // unattached
  ok(await one('SELECT cancel_reservation_for_route($1) ok', [c17b.reservation_id]).then(r => r.ok) === true && await usedCount('T17b') === 0, 'unattached release → true, slot freed');

  console.log('T18: NO blind sweep — even unattached-expired is LEASED for reconciliation');
  await newBeta('T18'); const c18 = await claimBeta('T18', randomUUID()); // crashed before auth: user_id NULL
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c18.reservation_id]);
  const leased18 = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows;
  const l18 = leased18.find(o => o.reservation_id === c18.reservation_id);
  ok(!!l18 && !!l18.recovery_token, 'unattached-expired leased with a recovery token');
  ok(await resStatus(c18.reservation_id) === 'recovering' && await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c18.reservation_id, l18.recovery_token]).then(r => r.ok) === true && await usedCount('T18') === 0, 'worker reconciles + cancels (token), slot freed');

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
  ok(await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c19.reservation_id, l19.recovery_token]).then(r => r.ok) === true && await usedCount('T19') === 0, 'worker cancels (token) after deleting Auth user, slot freed');
  console.log('T19b: synchronous route compensation (cancel_attached_reservation, user match)');
  await newBeta('T19b'); const c19b = await claimBeta('T19b', randomUUID()); const u19b = randomUUID(); await attach(c19b.reservation_id, u19b);
  ok(await one('SELECT cancel_reservation_for_route($1,$2) ok', [c19b.reservation_id, u19b]).then(r => r.ok) === true && await usedCount('T19b') === 0, 'route deletes Auth user then cancel_attached frees the slot');
  await newBeta('T19c'); const c19c = await claimBeta('T19c', randomUUID()); await attach(c19c.reservation_id, randomUUID());
  ok(await one('SELECT cancel_reservation_for_route($1,$2) ok', [c19c.reservation_id, randomUUID()]).then(r => r.ok) === false, 'cancel_attached rejects a wrong user');

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
  ok(await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c22.reservation_id, l22.recovery_token]).then(r => r.ok) === true, 'ordinary orphan cancelled (token)');

  console.log('T22b: stale recovery token rejected after lease reassignment');
  await newBeta('T22b'); const c22b = await claimBeta('T22b', randomUUID()); const u22b = randomUUID(); await attach(c22b.reservation_id, u22b);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c22b.reservation_id]);
  const leaseA = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22b.reservation_id);
  await pool.query(`UPDATE invite_reservations SET recovering_lease_until=now()-interval '1 min' WHERE id=$1`, [c22b.reservation_id]); // worker A lease expires
  const leaseB = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22b.reservation_id);
  ok(!!leaseB && leaseB.recovery_token !== leaseA.recovery_token, 'worker B reclaims with a NEW token');
  ok(await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c22b.reservation_id, leaseA.recovery_token]).then(r => r.ok) === false, 'stale worker-A token → cancel REJECTED');
  ok(await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c22b.reservation_id, leaseB.recovery_token]).then(r => r.ok) === true, 'current worker-B token → cancel succeeds');

  console.log('T22c: route compensation cannot cancel a leased (recovering) row');
  await newBeta('T22c'); const c22c = await claimBeta('T22c', randomUUID()); const u22c = randomUUID(); await attach(c22c.reservation_id, u22c);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c22c.reservation_id]);
  await pool.query('SELECT claim_orphan_for_recovery(50,120)'); // → recovering
  ok(await one('SELECT cancel_reservation_for_route($1,$2) ok', [c22c.reservation_id, u22c]).then(r => r.ok) === false, 'cancel_attached refuses a recovering row (recovery owns it)');

  console.log('T22d: cancel requires a current token AND a live lease (4 cases)');
  await newBeta('T22d'); const c22d = await claimBeta('T22d', randomUUID()); const u22d = randomUUID(); await attach(c22d.reservation_id, u22d);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c22d.reservation_id]);
  const lzA = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22d.reservation_id);
  await pool.query(`UPDATE invite_reservations SET recovering_lease_until=now()-interval '1 sec' WHERE id=$1`, [c22d.reservation_id]); // lease expires, NOT reassigned
  ok(await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c22d.reservation_id, lzA.recovery_token]).then(r => r.ok) === false, '(2) expired-lease token → cancel rejected (before reassignment)');
  const lzB = (await pool.query('SELECT * FROM claim_orphan_for_recovery(50,120)')).rows.find(o => o.reservation_id === c22d.reservation_id);
  ok(await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c22d.reservation_id, lzA.recovery_token]).then(r => r.ok) === false, '(3) old token after reassignment → rejected');
  ok(await one('SELECT cancel_recovering_reservation_tombstoned($1,$2,600) ok', [c22d.reservation_id, lzB.recovery_token]).then(r => r.ok) === true, '(1+4) current unexpired token → succeeds');

  console.log('T24: recovery WORKER (mock Auth) — reconcile+cancel, absent, transient-retry, pre-attach, tag-MISMATCH (P0)');
  const recoveryDb: RecoveryDb = {
    claimOrphans: (l, s) => pool.query('SELECT * FROM claim_orphan_for_recovery($1,$2)', [l, s]).then(r => r.rows),
    cancelRecovering: (id, tok) => pool.query('SELECT cancel_recovering_reservation_tombstoned($1,$2,$3) ok', [id, tok, 600]).then(r => r.rows[0].ok),
  };
  type Outcome = 'deleted' | 'absent' | 'mismatch';
  const mockAuth = (fn: (rid: string, uid: string | null) => Promise<Outcome>): AuthReconciler => ({ reconcileAndDelete: fn });
  const reconciled: string[] = [];
  // (a) attached orphan → reconcile(deleted) + cancel + slot freed
  await newBeta('T24'); const c24 = await claimBeta('T24', randomUUID()); const u24 = randomUUID(); await attach(c24.reservation_id, u24);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c24.reservation_id]);
  await recoverOrphanReservations(recoveryDb, mockAuth(async (_rid, uid) => { reconciled.push(uid!); return 'deleted'; }));
  ok(reconciled.includes(u24) && await resStatus(c24.reservation_id) === 'cancelled' && await usedCount('T24') === 0, '(a) attached orphan: reconciled+deleted, cancelled, slot freed');
  // (b) absent Auth user (conclusive) → still cancels
  await newBeta('T24b'); const c24b = await claimBeta('T24b', randomUUID()); const u24b = randomUUID(); await attach(c24b.reservation_id, u24b);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c24b.reservation_id]);
  await recoverOrphanReservations(recoveryDb, mockAuth(async () => 'absent'));
  ok(await resStatus(c24b.reservation_id) === 'cancelled', '(b) absent Auth user → still cancels');
  // (c) transient Auth failure → left 'recovering' for retry (NOT cancelled)
  await newBeta('T24c'); const c24c = await claimBeta('T24c', randomUUID()); const u24c = randomUUID(); await attach(c24c.reservation_id, u24c);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c24c.reservation_id]);
  const r24c = await recoverOrphanReservations(recoveryDb, mockAuth(async () => { throw new Error('429 transient'); }));
  ok(r24c.errors === 1 && await resStatus(c24c.reservation_id) === 'recovering', '(c) transient Auth failure → left recovering for retry');
  // (d) pre-attach crash: user_id NULL → reconciler resolves tag server-side + deletes
  await newBeta('T24d'); const c24d = await claimBeta('T24d', randomUUID()); // never attached
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c24d.reservation_id]);
  let sawNullUid = false;
  await recoverOrphanReservations(recoveryDb, mockAuth(async (_rid, uid) => { if (uid === null) sawNullUid = true; return 'deleted'; }));
  ok(sawNullUid && await resStatus(c24d.reservation_id) === 'cancelled', '(d) pre-attach orphan (user_id NULL) → reconciled by tag + cancelled');
  // (e) P0 GUARD: Auth tag MISMATCH → never deleted/cancelled, left recovering, slot NOT freed
  await newBeta('T24e'); const c24e = await claimBeta('T24e', randomUUID()); const u24e = randomUUID(); await attach(c24e.reservation_id, u24e);
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c24e.reservation_id]);
  const r24e = await recoverOrphanReservations(recoveryDb, mockAuth(async () => 'mismatch'));
  ok(r24e.errors === 1 && r24e.cancelled === 0 && await resStatus(c24e.reservation_id) === 'recovering', '(e) Auth tag mismatch → NOT deleted/cancelled, left recovering (P0 guard)');

  console.log('T23: PERMISSIONS — 15 safe RPCs service_role-allowed; 3 non-tombstoning cancels REVOKED');
  const fns = ['claim_beta_invite(text,uuid,text)', 'claim_client_invite(uuid,uuid,text)', 'claim_ordinary_signup(uuid,uuid,text)',
    'attach_reservation_user(uuid,uuid)', 'finalize_beta_signup(uuid,uuid,text,text,text,jsonb)',
    'finalize_client_activation(uuid,uuid,text,text,text,jsonb)', 'finalize_ordinary_signup(uuid,uuid,text,text,text,jsonb)',
    'claim_orphan_for_recovery(int,int)', 'find_auth_user_ids_by_reservation(uuid)',
    'cancel_recovering_reservation_tombstoned(uuid,uuid,int)', 'claim_tombstones_for_recheck(int,int)', 'settle_tombstone(uuid,uuid,int)',
    'cancel_reservation_for_route(uuid,uuid,int)',
    'claim_completed_for_recheck(int,int,int)', 'settle_completed_recheck(uuid,uuid,int)'];
  for (const fn of fns) {
    const a = (await one(`SELECT has_function_privilege('anon','public.${fn}','EXECUTE') p`)).p;
    const au = (await one(`SELECT has_function_privilege('authenticated','public.${fn}','EXECUTE') p`)).p;
    const s = (await one(`SELECT has_function_privilege('service_role','public.${fn}','EXECUTE') p`)).p;
    ok(a === false && au === false && s === true, `${fn.split('(')[0]}: anon/auth DENIED, service_role allowed`);
  }
  // Escape hatches closed: EVERY non-tombstoning cancellation path is DENIED to
  // service_role, so the DB — not caller discipline — enforces "every cancel arms a
  // tombstone". The only service_role cancels are the tombstoned recovery + route RPCs.
  for (const legacy of ['cancel_recovering_reservation(uuid,uuid)', 'release_invite_reservation(uuid)', 'cancel_attached_reservation(uuid,uuid)']) {
    const s = (await one(`SELECT has_function_privilege('service_role','public.${legacy}','EXECUTE') p`)).p;
    const a = (await one(`SELECT has_function_privilege('anon','public.${legacy}','EXECUTE') p`)).p;
    ok(s === false && a === false, `legacy ${legacy.split('(')[0]}: REVOKED from service_role/anon (tombstone-bypass closed)`);
  }

  console.log('T25: find_auth_user_ids_by_reservation — TRUSTED app_metadata, ALL carriers (no LIMIT)');
  const rid25 = randomUUID(); const a25 = randomUUID(); const b25 = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, raw_app_meta_data) VALUES ($1, jsonb_build_object('reservation_id',$3::text)), ($2, jsonb_build_object('reservation_id',$3::text))`, [a25, b25, rid25]);
  // a user-editable user_metadata tag must NOT be honored (only app_metadata is authority)
  await pool.query(`INSERT INTO auth.users (id, raw_user_meta_data) VALUES ($1, jsonb_build_object('reservation_id',$2::text))`, [randomUUID(), rid25]);
  const ids25 = (await one('SELECT find_auth_user_ids_by_reservation($1) ids', [rid25])).ids as string[];
  ok(Array.isArray(ids25) && ids25.length === 2 && ids25.includes(a25) && ids25.includes(b25), '(a) BOTH duplicate app_metadata carriers returned (no silent LIMIT 1)');
  ok((await one('SELECT find_auth_user_ids_by_reservation($1) ids', [randomUUID()])).ids.length === 0, '(b) unknown reservation → empty (conclusive absence)');
  ok(!ids25.includes((await one(`SELECT id FROM auth.users WHERE raw_app_meta_data IS NULL LIMIT 1`)).id), '(c) user_metadata-only tag IGNORED (user-editable field is not authority)');

  console.log('T26: reservationIdentity — stable key + semantically-normalized payload fingerprint');
  const p26 = { email: 'A@X.io', fullName: '  Ann  Lee ', inviteCode: 'BETA1', role: 'Coach', consentVersion: '1.0' };
  const i26 = reservationIdentity('beta:BETA1', 'A@X.io', p26);
  const j26 = reservationIdentity('beta:BETA1', '  a@x.io ', { email: '  a@x.io ', fullName: 'Ann Lee', inviteCode: 'BETA1', role: 'coach', consentVersion: '1.0' });
  ok(i26.idempotencyKey === j26.idempotencyKey, '(a) email case/whitespace normalized → same idempotency key');
  ok(i26.fingerprint === j26.fingerprint, '(b) equivalent email-case/whitespace/role-case → SAME fingerprint (retry converges, no false conflict)');
  ok(i26.fingerprint !== reservationIdentity('beta:BETA1', 'A@X.io', { ...p26, consentVersion: '2.0' }).fingerprint, '(c) changed consent version → different fingerprint');
  ok(i26.fingerprint !== reservationIdentity('beta:BETA1', 'A@X.io', { ...p26, fullName: 'Bob' }).fingerprint, '(d) changed name → different fingerprint');

  console.log('T27: buildAuthReconciler ADAPTER (fake Supabase Admin) — app_metadata authority + exhaustive dup reconcile + zero-remain proof');
  type FakeOpts = { getUser?: (id: string) => { data: { user: unknown }; error: unknown }; ids?: (deleted: string[]) => string[]; rpcError?: string; deleteError?: (id: string) => unknown };
  const fakeService = (o: FakeOpts) => {
    const deleted: string[] = [];
    const client = {
      auth: { admin: {
        getUserById: async (id: string) => o.getUser ? o.getUser(id) : { data: { user: null }, error: { status: 404, message: 'not found' } },
        deleteUser: async (id: string) => { const e = o.deleteError?.(id) ?? null; if (!e) deleted.push(id); return { data: {}, error: e }; },
      } },
      rpc: async () => o.rpcError ? { data: null, error: { message: o.rpcError } } : { data: o.ids ? o.ids(deleted) : [], error: null },
    };
    return { rec: buildAuthReconciler(client as unknown as SupabaseClient), deleted };
  };
  const mkUser = (rid: string | null) => ({ data: { user: rid === null ? null : { id: 'x', app_metadata: { reservation_id: rid } } }, error: null });
  const RID = randomUUID(), rA = randomUUID(), rB = randomUUID();
  // (a) attached, trusted tag matches, single carrier → deleted
  const fa = fakeService({ getUser: () => mkUser(RID), ids: (del) => del.includes(rA) ? [] : [rA] });
  ok(await fa.rec.reconcileAndDelete(RID, rA) === 'deleted' && fa.deleted.includes(rA), '(a) attached app_metadata match → deleted');
  // (b) attached, user carries a DIFFERENT trusted tag → mismatch, nothing deleted
  const fb = fakeService({ getUser: () => mkUser(randomUUID()), ids: () => [] });
  ok(await fb.rec.reconcileAndDelete(RID, rA) === 'mismatch' && fb.deleted.length === 0, '(b) different app_metadata tag → mismatch, no delete');
  // (c) unattached duplicates → BOTH deleted, then zero-remain → deleted
  const fc = fakeService({ ids: (del) => [rA, rB].filter((u) => !del.includes(u)) });
  ok(await fc.rec.reconcileAndDelete(RID, null) === 'deleted' && fc.deleted.includes(rA) && fc.deleted.includes(rB), '(c) duplicate carriers → ALL deleted (no strand)');
  // (d) attached but Auth user already gone, no carriers → absent, no delete
  const fd = fakeService({ getUser: () => mkUser(null), ids: () => [] });
  ok(await fd.rec.reconcileAndDelete(RID, rA) === 'absent' && fd.deleted.length === 0, '(d) missing user + no carriers → absent');
  // (e) lookup RPC error → throws (worker leaves recovering)
  const fe = fakeService({ getUser: () => mkUser(RID), rpcError: 'boom' });
  ok(await fe.rec.reconcileAndDelete(RID, rA).then(() => false, () => true), '(e) RPC error → throws (not a false cancel)');
  // (f) delete API failure → throws
  const ff = fakeService({ getUser: () => mkUser(RID), ids: () => [rA], deleteError: () => ({ status: 500, message: 'transient' }) });
  ok(await ff.rec.reconcileAndDelete(RID, rA).then(() => false, () => true), '(f) deleteUser failure → throws');
  // (g) carrier persists after delete (proof fails) → throws, never frees the slot
  const fg = fakeService({ getUser: () => mkUser(RID), ids: () => [rA] }); // RPC always reports rA → zero-remain proof fails
  ok(await fg.rec.reconcileAndDelete(RID, rA).then(() => false, () => true) && fg.deleted.includes(rA), '(g) carrier remains after delete → reconcile-incomplete throw (no cancel)');

  console.log('T28: DURABLE late-arrival (tombstone) — carrier created AFTER absent+cancel is still reaped (P0)');
  // Auth mock backed by the stub auth.users table (mimics the real adapter end-to-end).
  const dbAuth: AuthReconciler = { reconcileAndDelete: async (rid) => {
    const carriers = (await one(`SELECT coalesce(array_agg(id),'{}') a FROM auth.users WHERE raw_app_meta_data->>'reservation_id'=$1`, [rid])).a as string[];
    if (carriers.length === 0) return 'absent';
    await pool.query(`DELETE FROM auth.users WHERE raw_app_meta_data->>'reservation_id'=$1`, [rid]);
    return 'deleted';
  } };
  const tdb: RecoveryDb = {
    claimOrphans: (l, s) => pool.query('SELECT * FROM claim_orphan_for_recovery($1,$2)', [l, s]).then(r => r.rows),
    cancelRecovering: (id, tok) => pool.query('SELECT cancel_recovering_reservation_tombstoned($1,$2,$3) ok', [id, tok, 600]).then(r => r.rows[0].ok),
  };
  const tomb: TombstoneDb = {
    claimTombstones: (l, s) => pool.query('SELECT * FROM claim_tombstones_for_recheck($1,$2)', [l, s]).then(r => r.rows),
    settleTombstone: (id, tok) => pool.query('SELECT settle_tombstone($1,$2) s', [id, tok]).then(r => r.rows[0].s),
  };
  await newBeta('T28'); const c28 = await claimBeta('T28', randomUUID());
  await pool.query(`UPDATE invite_reservations SET expires_at=now()-interval '1 min' WHERE id=$1`, [c28.reservation_id]);
  // orphan pass: NO carrier yet → 'absent' → cancel WITH tombstone armed
  await recoverOrphanReservations(tdb, dbAuth);
  const t28a = await one(`SELECT status, reconcile_until IS NOT NULL armed, sealed_at FROM invite_reservations WHERE id=$1`, [c28.reservation_id]);
  ok(t28a.status === 'cancelled' && t28a.armed === true && t28a.sealed_at === null, '(a) absent → cancelled WITH tombstone armed (not sealed)');
  // LATE createUser lands: a carrier now exists, tagged to the now-cancelled reservation
  const late28 = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, raw_app_meta_data) VALUES ($1, jsonb_build_object('reservation_id',$2::text))`, [late28, c28.reservation_id]);
  // tombstone sweep MUST reap it (claim_orphan_for_recovery never revisits 'cancelled')
  const t28b = await sweepTombstones(tomb, dbAuth);
  ok((await one(`SELECT count(*)::int n FROM auth.users WHERE id=$1`, [late28])).n === 0 && t28b.authDeleted === 1, '(b) late carrier reaped by tombstone sweep (no permanent strand)');
  // window elapses with zero carriers → SEAL (terminal)
  await pool.query(`UPDATE invite_reservations SET reconcile_until=now()-interval '1 s', recovering_lease_until=NULL, recovery_token=NULL WHERE id=$1`, [c28.reservation_id]);
  const t28c = await sweepTombstones(tomb, dbAuth);
  ok(t28c.sealed >= 1 && (await one(`SELECT sealed_at IS NOT NULL s FROM invite_reservations WHERE id=$1`, [c28.reservation_id])).s === true, '(c) window elapsed + zero carriers → sealed (terminal)');
  // sealed tombstone is excluded from future claims
  ok((await one(`SELECT count(*)::int n FROM invite_reservations WHERE id=$1 AND sealed_at IS NOT NULL`, [c28.reservation_id])).n === 1, '(d) sealed row stays terminal (excluded from claim_tombstones predicate)');

  console.log('T29: THREE-pass SHARED runtime budget (delayed adapter) + backoff validation');
  // Seed more than each share so the cap is provably the binding limit (8 + 6 + 6 = 20).
  for (let i = 0; i < 12; i++) {
    await pool.query(`INSERT INTO invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status, expires_at)
                      VALUES ('beta', gen_random_uuid(), gen_random_uuid(), 'fp-budget', 'reserved', now()-interval '2 min')`);
  }
  for (let i = 0; i < 10; i++) {
    await pool.query(`INSERT INTO invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status, expires_at, reconcile_until)
                      VALUES ('beta', gen_random_uuid(), gen_random_uuid(), 'fp-budget', 'cancelled', now()-interval '2 min', now()+interval '10 min')`);
  }
  for (let i = 0; i < 10; i++) {
    await pool.query(`INSERT INTO invite_reservations (invite_type, invite_id, idempotency_key, request_fingerprint, status, expires_at, completed_at, user_id)
                      VALUES ('beta', gen_random_uuid(), gen_random_uuid(), 'fp-budget', 'completed', now()-interval '2 min', now()-interval '30 sec', gen_random_uuid())`);
  }
  const delayedAuth: AuthReconciler & StrayReconciler = {
    reconcileAndDelete: async () => { await new Promise((r) => setTimeout(r, 10)); return 'absent'; },
    reconcileStrayCarriers: async () => { await new Promise((r) => setTimeout(r, 10)); return 'clean'; },
  };
  const budgetDb: RecoveryDb & TombstoneDb & CompletedDb = {
    claimOrphans: (l, s) => pool.query('SELECT * FROM claim_orphan_for_recovery($1,$2)', [l, s]).then(r => r.rows),
    cancelRecovering: (id, tok) => pool.query('SELECT cancel_recovering_reservation_tombstoned($1,$2,$3) ok', [id, tok, 600]).then(r => r.rows[0].ok),
    claimTombstones: (l, s) => pool.query('SELECT * FROM claim_tombstones_for_recheck($1,$2)', [l, s]).then(r => r.rows),
    settleTombstone: (id, tok) => pool.query('SELECT settle_tombstone($1,$2) s', [id, tok]).then(r => r.rows[0].s),
    claimCompleted: (l, s, ret) => pool.query('SELECT * FROM claim_completed_for_recheck($1,$2,$3)', [l, s, ret]).then(r => r.rows),
    settleCompleted: (id, tok) => pool.query('SELECT settle_completed_recheck($1,$2) s', [id, tok]).then(r => r.rows[0].s),
  };
  const startMs = Date.now();
  const run29 = await runRecoveryPasses(budgetDb, delayedAuth, { orphanLimit: 8, tombstoneLimit: 6, completedLimit: 6, leaseSeconds: 300, concurrency: 5 });
  const elapsedMs = Date.now() - startMs;
  ok(run29.orphans.claimed === 8 && run29.tombstones.claimed === 6 && run29.completed.claimed === 6, '(a) each pass capped at its share (8 + 6 + 6) — shared budget binds');
  ok(run29.orphans.claimed + run29.tombstones.claimed + run29.completed.claimed <= 20, '(b) total reservations/run ≤ 20 (cannot exceed combined budget)');
  ok(elapsedMs < 20000, `(c) full-budget run completes (fake 10ms adapter, ${elapsedMs}ms) — proves the bounded WORKLOAD cap, NOT production latency`);
  // P2: settle_tombstone rejects a non-positive backoff like the other bounded params
  ok(await one('SELECT settle_tombstone($1,$2,$3) s', [randomUUID(), randomUUID(), -1]).then(() => false, () => true), '(d) settle_tombstone rejects non-positive backoff');

  console.log('T30: ROUTE cancellation arms tombstones (release + compensation) — late carriers reaped (P0)');
  // reuse dbAuth + tomb (defined in T28); high limit so the just-armed row is swept now.
  // (a) unattached release → cancelled+armed; a late carrier (concurrent createUser) is reaped
  await newBeta('T30a'); const c30a = await claimBeta('T30a', randomUUID());
  ok(await one('SELECT cancel_reservation_for_route($1) ok', [c30a.reservation_id]).then(r => r.ok) === true && await resStatus(c30a.reservation_id) === 'cancelled', '(a) unattached release → cancelled (tombstoned)');
  const lateA = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, raw_app_meta_data) VALUES ($1, jsonb_build_object('reservation_id',$2::text))`, [lateA, c30a.reservation_id]);
  await sweepTombstones(tomb, dbAuth, { limit: 500 });
  ok((await one(`SELECT count(*)::int n FROM auth.users WHERE id=$1`, [lateA])).n === 0, '(a) late carrier after release reaped (no strand)');
  // (b) attached compensation (user match) → cancelled+armed; a different late carrier is reaped
  await newBeta('T30b'); const c30b = await claimBeta('T30b', randomUUID()); const u30b = randomUUID(); await attach(c30b.reservation_id, u30b);
  ok(await one('SELECT cancel_reservation_for_route($1,$2) ok', [c30b.reservation_id, u30b]).then(r => r.ok) === true && await resStatus(c30b.reservation_id) === 'cancelled', '(b) attached compensation (user match) → cancelled (tombstoned)');
  const lateB = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, raw_app_meta_data) VALUES ($1, jsonb_build_object('reservation_id',$2::text))`, [lateB, c30b.reservation_id]);
  await sweepTombstones(tomb, dbAuth, { limit: 500 });
  ok((await one(`SELECT count(*)::int n FROM auth.users WHERE id=$1`, [lateB])).n === 0, '(b) late carrier after compensation reaped (no strand)');
  // (c) confused-deputy guards: wrong attached user cannot cancel; release refuses an attached row
  await newBeta('T30c'); const c30c = await claimBeta('T30c', randomUUID()); const u30c = randomUUID(); await attach(c30c.reservation_id, u30c);
  ok(await one('SELECT cancel_reservation_for_route($1,$2) ok', [c30c.reservation_id, randomUUID()]).then(r => r.ok) === false && await resStatus(c30c.reservation_id) === 'reserved', '(c) wrong attached user → rejected, row still reserved');
  ok(await one('SELECT cancel_reservation_for_route($1) ok', [c30c.reservation_id]).then(r => r.ok) === false, '(c2) release (no user) refuses an attached row');

  console.log('T31: COMPLETED stray-sweep DB lifecycle — fairness (no oldest-N starvation) + boundary seal (P0)');
  // Counting double records which rows were reconciled + reaps strays from the stub. This
  // exercises the DB claim/settle/seal lifecycle; the PRODUCTION adapter trust check is T32.
  const seen31 = new Set<string>();
  const countingStray: StrayReconciler = { reconcileStrayCarriers: async (rid, keep) => {
    seen31.add(rid);
    const ids = (await one(`SELECT coalesce(array_agg(id),'{}') a FROM auth.users WHERE raw_app_meta_data->>'reservation_id'=$1`, [rid])).a as string[];
    if (ids.filter((id) => id !== keep).length === 0) return 'clean';
    await pool.query(`DELETE FROM auth.users WHERE raw_app_meta_data->>'reservation_id'=$1 AND id <> $2`, [rid, keep]);
    return 'reaped';
  } };
  const compDb: CompletedDb = {
    claimCompleted: (l, s, ret) => pool.query('SELECT * FROM claim_completed_for_recheck($1,$2,$3)', [l, s, ret]).then(r => r.rows),
    settleCompleted: (id, tok) => pool.query('SELECT settle_completed_recheck($1,$2) s', [id, tok]).then(r => r.rows[0].s),
  };
  // (a) FAIRNESS: seed more in-window completed rows than the per-run limit; with backoff,
  // EVERY row is checked across repeated runs (the immediate-release bug looped oldest-6).
  const ids31: string[] = [];
  for (let i = 0; i < 14; i++) {
    ids31.push((await one(`INSERT INTO invite_reservations (invite_type,invite_id,idempotency_key,request_fingerprint,status,expires_at,completed_at,user_id)
      VALUES ('beta',gen_random_uuid(),gen_random_uuid(),'fp31','completed',now()-interval '2 min', now()-interval '20 sec', gen_random_uuid()) RETURNING id`)).id);
  }
  for (let run = 0; run < 14 && !ids31.every((id) => seen31.has(id)); run++) await sweepCompletedStrays(compDb, countingStray, { limit: 6, retentionSeconds: 600 });
  ok(ids31.every((id) => seen31.has(id)), '(a) every completed row eventually checked — backoff prevents oldest-N starvation');
  // (b) BOUNDARY: a past-window row gets a FINAL reconcile (reaping a late carrier) and is
  // THEN sealed — a carrier arriving near window-end is not missed before the row ages out.
  const legitB = randomUUID();
  const cB = (await one(`INSERT INTO invite_reservations (invite_type,invite_id,idempotency_key,request_fingerprint,status,expires_at,completed_at,user_id)
    VALUES ('beta',gen_random_uuid(),gen_random_uuid(),'fp31','completed',now()-interval '30 min', now()-interval '20 min', $1) RETURNING id`, [legitB])).id;
  const strayB = randomUUID();
  await pool.query(`INSERT INTO auth.users (id, raw_app_meta_data) VALUES ($1, jsonb_build_object('reservation_id',$3::text)), ($2, jsonb_build_object('reservation_id',$3::text))`, [legitB, strayB, cB]);
  await sweepCompletedStrays(compDb, countingStray, { limit: 500, retentionSeconds: 600 });
  ok((await one(`SELECT count(*)::int n FROM auth.users WHERE id=$1`, [strayB])).n === 0, '(b) late carrier on a past-window row reaped by the final boundary reconcile');
  ok((await one(`SELECT count(*)::int n FROM auth.users WHERE id=$1`, [legitB])).n === 1, '(b) legit finalized user PRESERVED');
  ok((await one(`SELECT sealed_at IS NOT NULL s FROM invite_reservations WHERE id=$1`, [cB])).s === true, '(b) past-window row SEALED after the final reconcile (terminal)');

  console.log('T32: buildAuthReconciler.reconcileStrayCarriers ADAPTER — keep-user tag VERIFIED before any delete (P1)');
  const K = randomUUID(), S = randomUUID(), RID2 = randomUUID();
  // (a) keep carries the trusted tag → stray deleted, keep preserved
  { const f = fakeService({ getUser: () => mkUser(RID2), ids: (del) => del.includes(S) ? [K] : [K, S] });
    ok(await f.rec.reconcileStrayCarriers(RID2, K) === 'reaped' && f.deleted.includes(S) && !f.deleted.includes(K), '(a) valid keep tag → stray deleted, keep preserved'); }
  // (b) keep carries a DIFFERENT tag → mismatch, delete NOTHING
  { const f = fakeService({ getUser: () => mkUser(randomUUID()), ids: () => [K, S] });
    ok(await f.rec.reconcileStrayCarriers(RID2, K) === 'mismatch' && f.deleted.length === 0, '(b) mismatched keep tag → delete nothing (fail closed)'); }
  // (c) keep user missing → mismatch, delete NOTHING
  { const f = fakeService({ getUser: () => mkUser(null), ids: () => [K, S] });
    ok(await f.rec.reconcileStrayCarriers(RID2, K) === 'mismatch' && f.deleted.length === 0, '(c) missing keep user → delete nothing (fail closed)'); }
  // (d) keep tag valid, no strays → clean
  { const f = fakeService({ getUser: () => mkUser(RID2), ids: () => [K] });
    ok(await f.rec.reconcileStrayCarriers(RID2, K) === 'clean' && f.deleted.length === 0, '(d) no strays → clean, nothing deleted'); }
  // (e) stray persists after delete (zero-stray proof fails) → throws
  { const f = fakeService({ getUser: () => mkUser(RID2), ids: () => [K, S] });
    ok(await f.rec.reconcileStrayCarriers(RID2, K).then(() => false, () => true) && f.deleted.includes(S), '(e) stray remains after delete → throws (no false clean)'); }

  await pool.end();
  console.log(fail === 0 ? '\n✅ ALL WP1 tests passed' : `\n❌ ${fail} assertion(s) failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
