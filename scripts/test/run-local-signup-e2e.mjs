#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  assertLoopbackSupabaseUrl,
  localAppOrigin,
  parseSupabaseStatusEnv,
} from './local-auth-e2e-core.mjs';

const supabaseBin = path.resolve('node_modules/.bin/supabase');
const statusResult = spawnSync(supabaseBin, ['status', '-o', 'env'], {
  cwd: process.cwd(),
  encoding: 'utf8',
});

if (statusResult.error || statusResult.status !== 0) {
  process.stderr.write(
    'Local Supabase is unavailable. Start the app with `npm run dev:local` first.\n',
  );
  process.exit(1);
}

try {
  const status = parseSupabaseStatusEnv(statusResult.stdout);
  assertLoopbackSupabaseUrl(status.API_URL);
  const appOrigin = localAppOrigin(Number(process.env.TROPHE_LOCAL_PORT ?? '3000'));
  const tsxBin = path.resolve('node_modules/tsx/dist/cli.mjs');
  const result = spawnSync(
    process.execPath,
    [tsxBin, 'scripts/test/wp1-signup-confirm-e2e.ts'],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: {
        ...process.env,
        APP_BASE_URL: appOrigin,
        E2E_SUPABASE_URL: status.API_URL,
        E2E_SUPABASE_ANON_KEY: status.ANON_KEY,
        E2E_SUPABASE_SERVICE_KEY: status.SERVICE_ROLE_KEY,
        MAILPIT_URL: 'http://127.0.0.1:54324',
      },
    },
  );
  if (result.error || result.status !== 0) process.exitCode = result.status ?? 1;
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Local signup E2E failed.'}\n`,
  );
  process.exitCode = 1;
}
