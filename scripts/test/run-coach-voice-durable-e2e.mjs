#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import pg from 'pg';
import { runLocalAuthenticatedE2E } from './run-local-auth-e2e.mjs';
import { assertLoopbackDatabaseUrl, assertLoopbackSupabaseUrl } from './local-auth-e2e-core.mjs';

function validateStatus(status) {
  const database = assertLoopbackDatabaseUrl(status.DB_URL);
  const api = assertLoopbackSupabaseUrl(status.API_URL);
  if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true' || process.env.CI_REAL_SUPABASE !== '1'
    || database.hostname !== '127.0.0.1' || database.port !== '54322' || database.pathname !== '/postgres'
    || database.search || database.hash || api.hostname !== '127.0.0.1' || api.port !== '54321') throw new Error('disposable_target_required');
}

try {
  await runLocalAuthenticatedE2E({ validateStatus, executeWithDisposableRoles: async ({ status, env, actors }) => {
    const actorId = actors.clientId, coachId = actors.coachId, organizationId = env.E2E_TEST_ORG_ID;
    const pool = new pg.Pool({ connectionString: status.DB_URL, max: 2, connectionTimeoutMillis: 5000, statement_timeout: 5000 });
    let installed = false;
    try {
      await pool.query("INSERT INTO public.organization_members(org_id,user_id,role) VALUES ($1,$2,'client'),($1,$3,'coach') ON CONFLICT(org_id,user_id) DO UPDATE SET role=EXCLUDED.role", [organizationId, actorId, coachId]);
      await pool.query(await readFile('db/isolated/coach-durable-actions.sql', 'utf8'));
      installed = true;
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/test/coach-chat-fixture-sql.ts'], {
        stdio: 'inherit', env: { ...env, CI: 'true', GITHUB_ACTIONS: 'true', CI_REAL_SUPABASE: '1', DATABASE_URL: status.DB_URL,
          COACH_SQL_ACTOR: actorId, COACH_SQL_COACH: coachId, COACH_SQL_ORG: organizationId,
          COACH_CHAT_PARENT_RECEIPT_REQUIRED: '0', COACH_CHAT_SKIP_CONTRACT_SQL: '1' },
      });
      if (result.error || result.status !== 0) throw new Error('reviewed_voice_durable_e2e_failed');
    } finally {
      if (installed) await pool.query('DROP TRIGGER coach_preference_revision ON public.client_profiles; DROP FUNCTION private.advance_coach_preference_version(); DROP TABLE private.coach_action_receipts; DROP TABLE private.coach_action_proposals; DROP TABLE private.coach_preference_versions;');
      await pool.query('DELETE FROM public.organization_members WHERE org_id=$1 AND user_id=ANY($2::uuid[])', [organizationId, [actorId, coachId]]);
      await pool.end();
    }
  } });
  process.stdout.write('Reviewed voice POST, durable SQL rows, and UI restoration passed; disposable fixtures removed.\n');
} catch {
  process.stderr.write(JSON.stringify({ event: 'coach_voice_durable_e2e', outcome: 'failed' }) + '\n');
  process.exitCode = 1;
}
