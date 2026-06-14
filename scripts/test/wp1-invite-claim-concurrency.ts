/**
 * WP1 adversarial concurrency test for the atomic invite-claim RPCs (0042).
 * Runs against a THROWAWAY Postgres (TEST_DATABASE_URL) — never prod. The race
 * correctness lives entirely in the claim functions, so we prove it at the DB
 * level with genuine parallelism (a 25-connection pool + Promise.all).
 *
 * Run via: scripts/test/wp1-claim-concurrency.sh  (spins the throwaway container)
 */
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const url = process.env.TEST_DATABASE_URL;
if (!url) { console.error('TEST_DATABASE_URL required (throwaway pg)'); process.exit(2); }
const pool = new Pool({ connectionString: url, max: 25 });

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) { console.log(`  ✓ ${msg}`); } else { console.error(`  ✗ ${msg}`); failures++; }
}

async function setup() {
  await pool.query(`DROP TABLE IF EXISTS invite_reservations, beta_invite_codes, client_invites CASCADE;`);
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`); // gen_random_uuid
  await pool.query(`
    CREATE TABLE beta_invite_codes (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text UNIQUE NOT NULL,
      role text NOT NULL DEFAULT 'coach', max_uses int NOT NULL DEFAULT 1,
      used_count int NOT NULL DEFAULT 0, expires_at timestamptz);
    CREATE TABLE client_invites (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), token uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
      coach_id uuid NOT NULL DEFAULT gen_random_uuid(), status text NOT NULL DEFAULT 'pending',
      expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days');
  `);
  // Apply the real migration (reservation table + claim/complete/release/expire fns).
  const mig = readFileSync(join(process.cwd(), 'drizzle/0042_invite_reservations.sql'), 'utf-8');
  await pool.query(mig);
}

async function claimBeta(code: string, key: string) {
  const r = await pool.query('SELECT * FROM claim_beta_invite($1,$2)', [code, key]);
  return r.rows[0]?.reservation_id ? r.rows[0] : null;
}

async function main() {
  await setup();
  const N = 25;

  // TEST 1 — 25 concurrent claims, DIFFERENT keys, max_uses=1 → exactly 1 succeeds.
  console.log('TEST 1: 25 concurrent / distinct keys / max_uses=1');
  await pool.query(`INSERT INTO beta_invite_codes (code, role, max_uses) VALUES ('T1','coach',1)`);
  const r1 = await Promise.all(Array.from({ length: N }, (_, i) => claimBeta('T1', `k${i}`)));
  assert(r1.filter(Boolean).length === 1, `exactly 1 of ${N} claims succeeded (got ${r1.filter(Boolean).length})`);
  const used1 = (await pool.query(`SELECT used_count FROM beta_invite_codes WHERE code='T1'`)).rows[0].used_count;
  assert(used1 === 1, `used_count = 1 (got ${used1})`);
  const resv1 = (await pool.query(`SELECT count(*)::int n FROM invite_reservations WHERE status='reserved'`)).rows[0].n;
  assert(resv1 === 1, `exactly 1 reservation row (got ${resv1})`);

  // TEST 2 — max_uses=3 → exactly 3 of 25 succeed.
  console.log('TEST 2: 25 concurrent / max_uses=3 → exactly 3');
  await pool.query(`INSERT INTO beta_invite_codes (code, role, max_uses) VALUES ('T2','coach',3)`);
  const r2 = await Promise.all(Array.from({ length: N }, (_, i) => claimBeta('T2', `k${i}`)));
  assert(r2.filter(Boolean).length === 3, `exactly 3 succeeded (got ${r2.filter(Boolean).length})`);

  // TEST 3 — idempotency: same key concurrently → 1 reservation, used_count=1.
  console.log('TEST 3: 25 concurrent / SAME key / max_uses=1 → 1 reservation, no over-increment');
  await pool.query(`INSERT INTO beta_invite_codes (code, role, max_uses) VALUES ('T3','coach',1)`);
  const r3 = await Promise.all(Array.from({ length: N }, () => claimBeta('T3', 'same-key')));
  const ids3 = new Set(r3.filter(Boolean).map((x) => x.reservation_id));
  assert(ids3.size === 1, `all same-key claims resolve to 1 reservation (got ${ids3.size})`);
  const used3 = (await pool.query(`SELECT used_count FROM beta_invite_codes WHERE code='T3'`)).rows[0].used_count;
  assert(used3 === 1, `used_count = 1 after same-key storm (got ${used3})`);

  // TEST 4 — release compensates: claim, release, slot returns.
  console.log('TEST 4: release gives the slot back');
  await pool.query(`INSERT INTO beta_invite_codes (code, role, max_uses) VALUES ('T4','coach',1)`);
  const c4 = await claimBeta('T4', 'k');
  await pool.query('SELECT release_invite_reservation($1)', [c4.reservation_id]);
  const used4 = (await pool.query(`SELECT used_count FROM beta_invite_codes WHERE code='T4'`)).rows[0].used_count;
  assert(used4 === 0, `used_count back to 0 after release (got ${used4})`);
  const c4b = await claimBeta('T4', 'k2');
  assert(!!c4b, 'slot is claimable again after release');

  // TEST 5 — client invite: 25 concurrent on one pending token → exactly 1 claims.
  console.log('TEST 5: 25 concurrent client-invite claims → exactly 1');
  const tok = (await pool.query(`INSERT INTO client_invites DEFAULT VALUES RETURNING token`)).rows[0].token;
  const r5 = await Promise.all(Array.from({ length: N }, (_, i) =>
    pool.query('SELECT * FROM claim_client_invite($1,$2)', [tok, `c${i}`]).then((r) => r.rows[0]?.reservation_id ? r.rows[0] : null)));
  assert(r5.filter(Boolean).length === 1, `exactly 1 of ${N} client claims succeeded (got ${r5.filter(Boolean).length})`);
  const st5 = (await pool.query(`SELECT status FROM client_invites WHERE token=$1`, [tok])).rows[0].status;
  assert(st5 === 'claimed', `invite transitioned to 'claimed' (got '${st5}')`);

  // TEST 6 — expiry recovery: reserved+expired → released.
  console.log('TEST 6: expiry sweep releases abandoned claims');
  await pool.query(`INSERT INTO beta_invite_codes (code, role, max_uses) VALUES ('T6','coach',1)`);
  const c6 = await claimBeta('T6', 'k');
  await pool.query(`UPDATE invite_reservations SET expires_at = now() - interval '1 minute' WHERE id=$1`, [c6.reservation_id]);
  const swept = (await pool.query('SELECT expire_stale_invite_reservations() n')).rows[0].n;
  assert(swept >= 1, `swept ${swept} stale reservation(s)`);
  const used6 = (await pool.query(`SELECT used_count FROM beta_invite_codes WHERE code='T6'`)).rows[0].used_count;
  assert(used6 === 0, `expired claim returned the slot (used_count=${used6})`);

  await pool.end();
  console.log(failures === 0 ? '\n✅ ALL WP1 claim-concurrency tests passed' : `\n❌ ${failures} assertion(s) failed`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
