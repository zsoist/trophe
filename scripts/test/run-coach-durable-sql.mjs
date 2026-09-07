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
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-durable-sql.ts'], {
      stdio: 'inherit', env: { ...env, DATABASE_URL: status.DB_URL, COACH_SQL_ACTOR: actors.clientId, COACH_SQL_COACH: actors.coachId, COACH_SQL_ORG: env.E2E_TEST_ORG_ID },
    });
    if (result.error || result.status !== 0) throw new Error('durable_sql_failed');
  } });
  process.stdout.write('Durable SQL checks passed; disposable Auth fixtures removed.\n');
} catch {
  process.stderr.write('Durable SQL checks failed; cleanup attempted. See bounded case results.\n');
  process.exitCode = 1;
}
