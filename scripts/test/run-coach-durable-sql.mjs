import { spawnSync } from 'node:child_process';
import { runLocalAuthenticatedE2E } from './run-local-auth-e2e.mjs';
import { assertLoopbackDatabaseUrl, assertLoopbackSupabaseUrl } from './local-auth-e2e-core.mjs';

function validateStatus(status) {
  const db = assertLoopbackDatabaseUrl(status.DB_URL), api = assertLoopbackSupabaseUrl(status.API_URL);
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || db.hostname !== '127.0.0.1' || db.port !== '54322' || db.pathname !== '/postgres' || db.search || db.hash
    || api.hostname !== '127.0.0.1' || api.port !== '54321') throw new Error('disposable_target_required');
}
try {
  await runLocalAuthenticatedE2E({ validateStatus, executeWithDisposableRoles: async ({ status, env, actors }) => {
    const migration = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-live02-migration-sql.ts'], {
      stdio: 'inherit', env: { ...env, DATABASE_URL: status.DB_URL },
    });
    if (migration.error || migration.status !== 0) throw new Error('live02_migration_sql_failed');
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-durable-sql.ts'], {
      stdio: 'inherit', env: { ...env, DATABASE_URL: status.DB_URL, COACH_SQL_ACTOR: actors.clientId, COACH_SQL_COACH: actors.coachId, COACH_SQL_ORG: env.E2E_TEST_ORG_ID },
    });
    if (result.error || result.status !== 0) throw new Error('durable_sql_failed');
    const ui = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', 'tests/components/coach-photo-food.test.tsx', 'agents/coach-assistant/photo-food-handler.test.ts'], { stdio: 'inherit', env });
    if (ui.error || ui.status !== 0) throw new Error('photo_food_ui_failed');
  } });
  process.stdout.write('Durable SQL checks passed; disposable Auth fixtures removed.\n');
} catch (error) {
  const pending = [error];
  for (let index = 0; index < pending.length && index < 8; index++) {
    const item = pending[index];
    process.stderr.write(JSON.stringify({ event: 'coach_durable_fixture', outcome: 'failed',
      ...(typeof item?.localE2EPhase === 'string' && /^[a-z_]{1,40}$/.test(item.localE2EPhase) ? { phase: item.localE2EPhase } : {}),
      ...(typeof item?.code === 'string' && /^[0-9A-Z]{5}$/.test(item.code) ? { sqlstate: item.code } : {}),
    }) + '\n');
    if (item?.cause) pending.push(item.cause);
    if (item instanceof AggregateError) pending.push(...item.errors.slice(0, 8));
  }
  process.exitCode = 1;
}
