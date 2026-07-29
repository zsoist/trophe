#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  buildLocalDevEnv,
  parseSupabaseStatusEnv,
} from '../test/local-auth-e2e-core.mjs';

const root = process.cwd();
const requestedPort = Number(process.env.TROPHE_LOCAL_PORT ?? '3000');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: options.capture ? 'utf8' : undefined,
    stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    env: process.env,
  });
  if (result.error || result.status !== 0) {
    if (options.capture && result.stderr) process.stderr.write(result.stderr);
    throw new Error(options.failureMessage);
  }
  return result.stdout ?? '';
}

try {
  run('bash', ['scripts/db/bootstrap-local.sh'], {
    failureMessage: 'Local Supabase bootstrap failed. Run `npm run db:doctor` for diagnostics.',
  });

  const supabaseBin = path.resolve('node_modules/.bin/supabase');
  const statusRaw = run(supabaseBin, ['status', '-o', 'env'], {
    capture: true,
    failureMessage: 'Local Supabase status is unavailable after bootstrap.',
  });
  const status = parseSupabaseStatusEnv(statusRaw);
  const childEnv = buildLocalDevEnv(process.env, status, requestedPort);
  const appOrigin = childEnv.NEXT_PUBLIC_SITE_URL;

  process.stdout.write(
    `\nTrophē local is configured at ${appOrigin}\n` +
    'Supabase credentials were derived in memory; paid AI providers are disabled.\n' +
    'Confirmation emails are available in Mailpit at http://127.0.0.1:54324\n\n',
  );

  const nextBin = path.resolve('node_modules/next/dist/bin/next');
  const app = spawnSync(
    process.execPath,
    [
      nextBin,
      'dev',
      '--webpack',
      '--hostname',
      '127.0.0.1',
      '--port',
      String(requestedPort),
    ],
    {
      cwd: root,
      env: childEnv,
      stdio: 'inherit',
    },
  );
  if (app.error || (app.status !== 0 && app.signal !== 'SIGINT')) {
    throw new Error(`Trophē local server exited with status ${app.status ?? 'unknown'}.`);
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Local launch failed.'}\n`);
  process.exitCode = 1;
}
