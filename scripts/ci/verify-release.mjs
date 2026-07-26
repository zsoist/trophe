#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const OUTPUT_LIMIT_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 2_000;

function appendBounded(existing, chunk) {
  const remaining = OUTPUT_LIMIT_BYTES - existing.length;
  if (remaining <= 0) return existing;

  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  return Buffer.concat([existing, bytes.subarray(0, remaining)]);
}

function terminate(child, signal) {
  if (child.pid === undefined) return;

  try {
    if (process.platform === 'win32') {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') return;
    throw error;
  }
}

export function runStep({ name, command, args, timeoutMs, cwd }) {
  return new Promise((resolveStep) => {
    const startedAt = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let timeoutTimer;
    let killTimer;
    let spawnError = null;

    const child = spawn(command, args, {
      cwd,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate(child, 'SIGTERM');
      killTimer = setTimeout(() => terminate(child, 'SIGKILL'), TERMINATION_GRACE_MS);
    }, timeoutMs);

    child.once('error', (error) => {
      spawnError = error;
    });

    child.once('close', (exitCode, signal) => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);

      resolveStep({
        name,
        status: timedOut ? 'timed_out' : exitCode === 0 && spawnError === null ? 'passed' : 'failed',
        exitCode: timedOut ? null : exitCode,
        signal: timedOut ? 'SIGTERM' : signal,
        durationMs: Date.now() - startedAt,
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
      });
    });
  });
}

export const releaseSteps = [
  ['typecheck', 'npm', ['run', 'typecheck'], 600_000],
  ['lint', 'npm', ['run', 'lint', '--', '--no-cache'], 600_000],
  ['test', 'npm', ['test', '--', '--reporter=verbose'], 900_000],
  ['build', 'npm', ['run', 'build'], 900_000],
];

export async function runReleaseVerification(cwd = process.cwd()) {
  const results = [];

  for (const [name, command, args, timeoutMs] of releaseSteps) {
    const result = await runStep({ name, command, args, timeoutMs, cwd });
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
    steps: results,
  };
  const summaryPath = resolve(cwd, 'docs/quality/verification-summary.json');
  await mkdir(dirname(summaryPath), { recursive: true });
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);

  return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runReleaseVerification()
    .then((summary) => {
      if (summary.status !== 'passed') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
