import { spawnSync } from 'node:child_process';
import pg from 'pg';
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
      stdio: 'inherit',
      env: { ...env, DATABASE_URL: status.DB_URL, COACH_LIVE02_LEAVE_VERSIONED_INSTALLED: '1' },
    });
    if (migration.error || migration.status !== 0) throw new Error('live02_migration_sql_failed');

    const pool = new pg.Pool({ connectionString: status.DB_URL, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
    try {
      await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES ($1,$2,'client'),($1,$3,'coach') ON CONFLICT(org_id,user_id) DO UPDATE SET role=EXCLUDED.role", [env.E2E_TEST_ORG_ID, actors.clientId, actors.coachId]);
    } finally {
      await pool.end();
    }

    const result = spawnSync(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', '--config', 'playwright.coach.config.ts', '--workers=1', 'e2e/coach-engine.spec.ts'], {
      stdio: 'inherit',
      env: {
        ...env,
        DATABASE_URL: status.DB_URL,
        E2E_CLIENT_ID: actors.clientId,
        E2E_COACH_DURABLE: '0',
        E2E_COACH_ENGINE: '1',
        E2E_COACH_ENGINE_LOGIN_ONLY: '1',
        E2E_COACH_LOGIN_DIAGNOSTIC: '1',
        NEXT_PUBLIC_COACH_EVERYWHERE_ENABLED: '1',
        NEXT_PUBLIC_COACH_ASSISTANT_ENABLED: '0',
        COACH_ASSISTANT_ENABLED: '1',
        COACH_ASSISTANT_MODE: 'offline',
        COACH_ASSISTANT_DATA_SOURCE: 'authorized_records',
        COACH_ASSISTANT_DURABLE_ACTIONS_ENABLED: '1',
        COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED: '0',
        COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1',
        COACH_ASSISTANT_PREVIEW_USER_IDS: actors.clientId,
        AI_RATE_LIMIT_BYPASS_USER_IDS: actors.clientId,
      },
    });
    if (result.error || result.status !== 0) throw new Error('coach_engine_login_failed');
  } });
  process.stdout.write('Isolated engine Auth boundary passed; disposable fixtures removed.\n');
} catch (error) {
  process.stderr.write(`${JSON.stringify({ event: 'coach_engine_login_fixture', outcome: 'failed' })}\n`);
  process.exitCode = 1;
}
