import { spawnSync } from 'node:child_process';
import { assertLoopbackDatabaseUrl, assertLoopbackSupabaseUrl } from './local-auth-e2e-core.mjs';
import { runLocalAuthenticatedE2E } from './run-local-auth-e2e.mjs';

function validateStatus(status) {
  const db = assertLoopbackDatabaseUrl(status.DB_URL);
  const api = assertLoopbackSupabaseUrl(status.API_URL);
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || db.hostname !== '127.0.0.1' || db.port !== '54322' || db.pathname !== '/postgres' || db.search || db.hash
    || api.hostname !== '127.0.0.1' || api.port !== '54321') throw new Error('disposable_target_required');
}

try {
  await runLocalAuthenticatedE2E({
    validateStatus,
    executeWithDisposableRoles: async ({ status, env }) => {
      const result = spawnSync(process.execPath, [
        'node_modules/@playwright/test/cli.js', 'test', '--config',
        'playwright.coach-login-diagnostic.config.ts', '--workers=1',
      ], {
        stdio: 'inherit',
        env: { ...env, DATABASE_URL: status.DB_URL, E2E_COACH_LOGIN_DIAGNOSTIC: '1' },
      });
      if (result.error || result.status !== 0) throw new Error('coach_login_diagnostic_failed');
    },
  });
  process.stdout.write('Targeted disposable login diagnostic passed.\n');
} catch {
  process.stderr.write(JSON.stringify({ event: 'coach_login_diagnostic_runner', outcome: 'failed' }) + '\n');
  process.exitCode = 1;
}
