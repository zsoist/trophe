/**
 * WP1 adversarial test for the atomic invite-claim/finalize RPCs (0042).
 * Runs against a THROWAWAY Postgres (TEST_DATABASE_URL) using PRODUCTION-SHAPED
 * schema (real client_invites status CHECK, user_role enum, real columns + roles)
 * so it catches what a simplified schema would hide. Never touches prod.
 *
 * Run via: scripts/test/wp1-claim-concurrency.sh
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

async function setup() {
  await pool.query(`DROP TABLE IF EXISTS invite_reservations, beta_invite_codes, client_invites, profiles, client_profiles, consents CASCADE;`);
  await pool.query(`DROP TYPE IF EXISTS user_role CASCADE;`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  // Roles the migration grants to / revokes from (Supabase provides these in prod).
  for (const r of ['anon', 'authenticated', 'service_role']) {
    await pool.query(`DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${r}') THEN CREATE ROLE ${r} NOLOGIN; END IF; END $$;`);
  }
  await pool.query(`CREATE TYPE user_role AS ENUM ('super_admin','admin','coach','client');`);
  await pool.query(`
    CREATE TABLE beta_invite_codes (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
      role text NOT NULL DEFAULT 'coach', max_uses int NOT NULL DEFAULT 1, used_count int NOT NULL DEFAULT 0,
      cohort text, expires_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
    -- production-shaped: the REAL status CHECK (no 'claimed' allowed)
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

const claimBeta = (code: string, idem: string, fp = FP) =>
  pool.query('SELECT * FROM claim_beta_invite($1,$2,$3)', [code, idem, fp]).then(r => r.rows[0]);
const claimClient = (token: string, idem: string, fp = FP) =>
  pool.query('SELECT * FROM claim_client_invite($1,$2,$3)', [token, idem, fp]).then(r => r.rows[0]);
const liveReservations = async () =>
  (await pool.query(`SELECT count(*)::int n FROM invite_reservations WHERE status='reserved'`)).rows[0].n;
const usedCount = async (code: string) =>
  (await pool.query(`SELECT used_count FROM beta_invite_codes WHERE code=$1`, [code])).rows[0].used_count;

async function main() {
  await setup();
  const N = 25;

  console.log('T1: beta 25 distinct keys / max_uses=1 → exactly 1 claimed');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T1','coach',1)`);
  const r1 = await Promise.all(Array.from({ length: N }, () => claimBeta('T1', randomUUID())));
  ok(r1.filter(x => x.outcome === 'claimed').length === 1, `exactly 1 claimed (got ${r1.filter(x => x.outcome === 'claimed').length})`);
  ok(await usedCount('T1') === 1, `used_count=1 (got ${await usedCount('T1')})`);
  ok(await liveReservations() === 1, `1 live reservation (got ${await liveReservations()})`);

  console.log('T2: beta max_uses=3 → exactly 3 claimed');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T2','coach',3)`);
  const r2 = await Promise.all(Array.from({ length: N }, () => claimBeta('T2', randomUUID())));
  ok(r2.filter(x => x.outcome === 'claimed').length === 3, `exactly 3 claimed (got ${r2.filter(x => x.outcome === 'claimed').length})`);

  console.log('T3: beta SAME key 25 → all resolve to ONE reservation (true idempotency)');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T3','coach',1)`);
  const k3 = randomUUID();
  const r3 = await Promise.all(Array.from({ length: N }, () => claimBeta('T3', k3)));
  const nn3 = r3.filter(x => x.reservation_id);
  ok(nn3.length === N, `all ${N} same-key calls return a reservation (got ${nn3.length})`);
  ok(new Set(nn3.map(x => x.reservation_id)).size === 1, `all resolve to 1 reservation id (got ${new Set(nn3.map(x => x.reservation_id)).size})`);
  ok(await usedCount('T3') === 1, `used_count=1 after same-key storm (got ${await usedCount('T3')})`);

  console.log('T4: client 25 distinct keys → exactly 1 claimed; status stays pending');
  const tok = (await pool.query(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).rows[0].token;
  const r4 = await Promise.all(Array.from({ length: N }, () => claimClient(tok, randomUUID())));
  ok(r4.filter(x => x.outcome === 'claimed').length === 1, `exactly 1 client claim (got ${r4.filter(x => x.outcome === 'claimed').length})`);
  const st4 = (await pool.query(`SELECT status FROM client_invites WHERE token=$1`, [tok])).rows[0].status;
  ok(st4 === 'pending', `client_invites.status stays 'pending' (got '${st4}') — no illegal 'claimed' state`);

  console.log('T5: client SAME key 25 → all resolve to ONE reservation');
  const tok5 = (await pool.query(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).rows[0].token;
  const k5 = randomUUID();
  const r5 = await Promise.all(Array.from({ length: N }, () => claimClient(tok5, k5)));
  const nn5 = r5.filter(x => x.reservation_id);
  ok(nn5.length === N && new Set(nn5.map(x => x.reservation_id)).size === 1, `all ${N} same-key client calls → 1 reservation (got ${nn5.length}/${new Set(nn5.map(x => x.reservation_id)).size})`);

  console.log('T6: finalize_beta_signup success');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T6','coach',1)`);
  const c6 = await claimBeta('T6', randomUUID());
  const uid6 = randomUUID();
  const f6 = (await pool.query(`SELECT finalize_beta_signup($1,$2,'N','e6@x.io','coach','1.0','{}'::jsonb) ok`, [c6.reservation_id, uid6])).rows[0].ok;
  ok(f6 === true, 'finalize returns true');
  ok((await pool.query(`SELECT count(*)::int n FROM profiles WHERE id=$1`, [uid6])).rows[0].n === 1, 'profile created');
  ok((await pool.query(`SELECT count(*)::int n FROM consents WHERE user_id=$1`, [uid6])).rows[0].n === 1, 'consent persisted (fail-closed path)');
  ok((await pool.query(`SELECT status FROM invite_reservations WHERE id=$1`, [c6.reservation_id])).rows[0].status === 'completed', 'reservation completed');

  console.log('T7: finalize LOSES to expiry → returns false, no account');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T7','coach',1)`);
  const c7 = await claimBeta('T7', randomUUID());
  await pool.query(`UPDATE invite_reservations SET expires_at = now() - interval '1 min' WHERE id=$1`, [c7.reservation_id]);
  const uid7 = randomUUID();
  const f7 = (await pool.query(`SELECT finalize_beta_signup($1,$2,'N','e7@x.io','coach','1.0','{}'::jsonb) ok`, [c7.reservation_id, uid7])).rows[0].ok;
  ok(f7 === false, 'finalize returns false when reservation expired (caller deletes auth user)');
  ok((await pool.query(`SELECT count(*)::int n FROM profiles WHERE id=$1`, [uid7])).rows[0].n === 0, 'no profile created on lost finalize');

  console.log('T8: release returns the slot');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T8','coach',1)`);
  const c8 = await claimBeta('T8', randomUUID());
  await pool.query('SELECT release_invite_reservation($1)', [c8.reservation_id]);
  ok(await usedCount('T8') === 0, `used_count back to 0 after release (got ${await usedCount('T8')})`);

  console.log('T9: payload-bound idempotency — same key, different fingerprint → conflict');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T9','coach',1)`);
  const k9 = randomUUID();
  await claimBeta('T9', k9, 'fingerprint-A');
  const c9b = await claimBeta('T9', k9, 'fingerprint-B');
  ok(c9b.outcome === 'conflict', `same key + different payload → conflict (got '${c9b.outcome}')`);

  console.log('T10: cancelled replay → fresh claim allowed');
  await pool.query(`INSERT INTO beta_invite_codes (code,role,max_uses) VALUES ('T10','coach',1)`);
  const k10 = randomUUID();
  const c10a = await claimBeta('T10', k10);
  await pool.query('SELECT release_invite_reservation($1)', [c10a.reservation_id]);
  const c10b = await claimBeta('T10', k10);
  ok(c10b.outcome === 'claimed' && c10b.reservation_id !== c10a.reservation_id, `cancelled key re-claims fresh (got '${c10b.outcome}')`);

  console.log('T11: PERMISSIONS — anon/authenticated cannot execute RPCs');
  for (const fn of ['claim_beta_invite(text,uuid,text)', 'claim_client_invite(uuid,uuid,text)', 'finalize_beta_signup(uuid,uuid,text,text,text,text,jsonb)', 'expire_stale_invite_reservations()', 'release_invite_reservation(uuid)']) {
    const anon = (await pool.query(`SELECT has_function_privilege('anon','public.${fn}','EXECUTE') p`)).rows[0].p;
    const auth = (await pool.query(`SELECT has_function_privilege('authenticated','public.${fn}','EXECUTE') p`)).rows[0].p;
    const svc = (await pool.query(`SELECT has_function_privilege('service_role','public.${fn}','EXECUTE') p`)).rows[0].p;
    ok(anon === false && auth === false && svc === true, `${fn.split('(')[0]}: anon/auth DENIED, service_role allowed`);
  }

  await pool.end();
  console.log(fail === 0 ? '\n✅ ALL WP1 tests passed' : `\n❌ ${fail} assertion(s) failed`);
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(e => { console.error(e); process.exit(1); });
