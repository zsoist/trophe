#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { runLocalAuthenticatedE2E } from '../test/run-local-auth-e2e.mjs';
import { main as measureMain, runThemeMeasurements } from './measure-web.mjs';

const LOCAL_ORIGIN = 'http://127.0.0.1:3300';
const ROLE_ENV = ['THEME_PERF_CLIENT_EMAIL', 'THEME_PERF_CLIENT_PASSWORD', 'THEME_PERF_COACH_EMAIL', 'THEME_PERF_COACH_PASSWORD', 'THEME_PERF_SUPER_EMAIL', 'THEME_PERF_SUPER_PASSWORD'];

function hasExplicitCredentials(env) {
  return ROLE_ENV.every((key) => env[key]);
}

async function waitForLocalApp(origin, processRef) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (processRef.exitCode !== null) throw new Error(`local theme performance server exited with ${processRef.exitCode}`);
    try {
      const response = await fetch(`${origin}/login`);
      if (response.ok) return;
    } catch {
      // The local server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('local theme performance server did not become ready');
}

async function stopProcess(processRef) {
  if (processRef.exitCode !== null) return;
  processRef.kill('SIGTERM');
  await Promise.race([
    once(processRef, 'exit'),
    new Promise((resolve) => setTimeout(resolve, 10_000)),
  ]);
  if (processRef.exitCode === null) {
    processRef.kill('SIGKILL');
    await once(processRef, 'exit');
  }
}

export async function runLocalThemeMeasurements() {
  if (hasExplicitCredentials(process.env) || process.argv.slice(2).length > 0) return measureMain();
  return runLocalAuthenticatedE2E({
    executeWithDisposableRoles: async ({ env }) => {
      const childEnv = { ...env, PLAYWRIGHT_BASE_URL: LOCAL_ORIGIN, SERWIST_SUPPRESS_TURBOPACK_WARNING: '1' };
      const build = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', 'build', '--webpack'], {
        env: childEnv,
        stdio: 'inherit',
      });
      if (build.error || build.status !== 0) throw new Error(`local theme performance build failed with ${build.status ?? 1}`);
      const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3300'], {
        env: childEnv,
        stdio: 'inherit',
      });
      try {
        await waitForLocalApp(LOCAL_ORIGIN, server);
        const report = await runThemeMeasurements({ baseUrl: LOCAL_ORIGIN, env });
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
        return report;
      } finally {
        await stopProcess(server);
      }
    },
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runLocalThemeMeasurements().catch((error) => {
    process.stderr.write(`perf:measure failed - ${error.message}\n`);
    process.exitCode = 1;
  });
}
