import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';

const target = new URL(process.env.DATABASE_URL ?? 'about:blank');
if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
  || target.protocol !== 'postgresql:' || target.hostname !== '127.0.0.1' || target.port !== '54322'
  || target.pathname !== '/postgres' || target.username !== 'postgres' || target.password !== 'postgres'
  || target.search || target.hash) throw new Error('disposable_target_required');

const pool = new Pool({ connectionString: target.toString(), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 15000 });
const pass = (check: string) => process.stdout.write(`${JSON.stringify({ event: 'coach_live02_migration_sql', check, outcome: 'passed' })}\n`);
async function main() {
  const preflight = await readFile('db/release/0087_ask_trophe_live02_contracts.preflight.sql', 'utf8');
  const migration = await readFile('drizzle/0087_ask_trophe_live02_contracts.sql', 'utf8');
  const recoveryMigration = await readFile('drizzle/0088_coach_chat_turn_recovery.sql', 'utf8');
  const postflight = await readFile('db/release/0087_ask_trophe_live02_contracts.postflight.sql', 'utf8');
  const rollback = await readFile('scripts/test/fixtures/0087_ask_trophe_live02_contracts.rollback.sql', 'utf8');
  const sourceManifest = (await readFile('db/release/0087_ask_trophe_live02_contracts.sources', 'utf8')).trim().split('\n');
  const sourceSql: string[] = [];
  for (const line of sourceManifest) {
    const [expected, path] = line.split(/\s+/, 2);
    const sql = await readFile(path, 'utf8');
    assert.equal(createHash('sha256').update(sql).digest('hex'), expected);
    sourceSql.push(sql);
  }
  const header = `-- Ask Trophē Live02 reviewed persistence contracts.\n-- Promotes the six DB_ISOLATED contracts without changing their SQL behavior.\n-- Source order and SHA-256 identities are recorded in db/release/0087_ask_trophe_live02_contracts.sources.\n-- Embedded lifecycle comments belong to those immutable source artifacts; this\n-- journal entry is the promotion authority, subject to the normal release gates.\n\n`;
  assert.equal(migration, `${header}${sourceSql.join('\n')}`);
  pass('isolated_source_identity');

  await pool.query(postflight);
  assert.equal((await pool.query('SELECT private.coach_chat_contract_version() AS version')).rows[0].version, 'coach-assistant.chat.v1');
  pass('journal_bootstrap_postflight');

  await pool.query(rollback);
  await pool.query(preflight);
  assert.equal((await pool.query("SELECT to_regclass('private.coach_action_proposals') AS relation")).rows[0].relation, null);
  pass('loopback_disposable_rollback_and_preflight');

  await pool.query(migration);
  await pool.query(recoveryMigration);
  await pool.query(postflight);
  assert.equal((await pool.query('SELECT private.coach_chat_contract_version() AS version')).rows[0].version, 'coach-assistant.chat.v1');
  pass('exact_migration_replay_postflight');

  if (process.env.COACH_LIVE02_LEAVE_VERSIONED_INSTALLED === '1') {
    pass('versioned_contracts_retained_for_following_tests');
  } else {
    // Leave the disposable database at its pre-0087 shape so the established
    // isolated lifecycle tests can continue to own and remove their fixtures.
    await pool.query(rollback);
    await pool.query(preflight);
    assert.equal((await pool.query("SELECT to_regclass('private.coach_action_proposals') AS relation")).rows[0].relation, null);
    pass('baseline_restored_for_isolated_contract_tests');
  }
}

main().catch(error => {
  process.stderr.write(`${JSON.stringify({ event: 'coach_live02_migration_sql', outcome: 'failed',
    ...(typeof error?.code === 'string' ? { sqlstate: error.code } : {}) })}\n`);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
