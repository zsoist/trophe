#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT_LIMIT_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 2_000;
const defaultFileOperations = { mkdir, rename, unlink, writeFile };

function appendBounded(existing, chunk) {
  const remaining = OUTPUT_LIMIT_BYTES - existing.length;
  if (remaining <= 0) return existing;

  const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  return Buffer.concat([existing, bytes.subarray(0, remaining)]);
}

function decodeBoundedUtf8(bytes) {
  const decoder = new TextDecoder('utf-8', { fatal: true });

  for (let end = bytes.length; end >= Math.max(0, bytes.length - 3); end -= 1) {
    try {
      return decoder.decode(bytes.subarray(0, end));
    } catch {
      // The capped output can end within a multi-byte character. Trim it.
    }
  }

  return '';
}

function outputDetails(bytes) {
  return {
    text: decodeBoundedUtf8(bytes),
    bytes: bytes.length,
    digest: createHash('sha256').update(bytes).digest('hex'),
  };
}

function normalizeSpawnError(error) {
  const rawCode = error && typeof error === 'object' ? error.code : null;
  const code = typeof rawCode === 'string' && /^[A-Z0-9_]+$/.test(rawCode)
    ? rawCode
    : 'UNKNOWN';

  return {
    category: 'spawn_failed',
    code,
    repairAction: 'check_command_and_path',
  };
}

export function terminateProcessTree(
  child,
  {
    platform = process.platform,
    spawnProcess = spawn,
    killProcess = process.kill,
    signal = 'SIGTERM',
  } = {},
) {
  if (child.pid === undefined) return { attempted: false, method: 'no_pid' };

  try {
    if (platform === 'win32') {
      const taskkill = spawnProcess(
        'taskkill',
        ['/pid', String(child.pid), '/t', '/f'],
        { stdio: 'ignore', windowsHide: true },
      );
      taskkill.once?.('error', () => {});
      return { attempted: true, method: 'windows_taskkill' };
    }

    killProcess(-child.pid, signal);
    return { attempted: true, method: 'posix_process_group' };
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ESRCH') {
      return { attempted: false, method: 'already_exited' };
    }
    return { attempted: false, method: 'termination_failed' };
  }
}

export function runStep({
  name,
  command,
  args,
  timeoutMs,
  cwd,
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill,
}) {
  return new Promise((resolveStep) => {
    const startedAt = Date.now();
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let timedOut = false;
    let timeoutTimer;
    let killTimer;
    let spawnError = null;

    const child = spawnProcess(command, args, {
      cwd,
      detached: platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    child.stdout?.on('data', (chunk) => {
      stdout = appendBounded(stdout, chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = appendBounded(stderr, chunk);
    });

    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, { platform, spawnProcess, killProcess });
      killTimer = setTimeout(() => {
        terminateProcessTree(child, { platform, spawnProcess, killProcess, signal: 'SIGKILL' });
      }, TERMINATION_GRACE_MS);
    }, timeoutMs);

    child.once('error', (error) => {
      spawnError = normalizeSpawnError(error);
    });

    child.once('close', (exitCode, signal) => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      const stdoutDetails = outputDetails(stdout);
      const stderrDetails = outputDetails(stderr);

      resolveStep({
        name,
        status: timedOut ? 'timed_out' : exitCode === 0 && spawnError === null ? 'passed' : 'failed',
        exitCode: timedOut ? null : exitCode,
        signal: timedOut ? 'SIGTERM' : signal,
        durationMs: Date.now() - startedAt,
        stdout: stdoutDetails.text,
        stderr: stderrDetails.text,
        stdoutBytes: stdoutDetails.bytes,
        stderrBytes: stderrDetails.bytes,
        stdoutDigest: stdoutDetails.digest,
        stderrDigest: stderrDetails.digest,
        spawnError,
      });
    });
  });
}

function summaryStep(result) {
  return {
    name: result.name,
    status: result.status,
    exitCode: result.exitCode,
    signal: result.signal,
    durationMs: result.durationMs,
    stdoutBytes: result.stdoutBytes,
    stderrBytes: result.stderrBytes,
    stdoutDigest: result.stdoutDigest,
    stderrDigest: result.stderrDigest,
    spawnError: result.spawnError,
  };
}

export async function publishSummary(summaryPath, summary, operations = defaultFileOperations) {
  const temporaryPath = `${summaryPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await operations.mkdir(dirname(summaryPath), { recursive: true });
    await operations.writeFile(temporaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    await operations.rename(temporaryPath, summaryPath);
  } catch {
    try {
      await operations.unlink(temporaryPath);
    } catch {
      // A failed cleanup cannot obscure the publication failure.
    }
    const error = new Error('Verification summary publication failed');
    error.code = 'SUMMARY_PUBLISH_FAILED';
    throw error;
  }
}

export const releaseSteps = [
  ['typecheck', 'npm', ['run', 'typecheck'], 600_000],
  ['lint', 'npm', ['run', 'lint', '--', '--no-cache'], 600_000],
  ['test', 'npm', ['test', '--', '--reporter=verbose'], 900_000],
  ['build', 'npm', ['run', 'build'], 900_000],
];

export async function runReleaseVerification(
  cwd = process.cwd(),
  { steps = releaseSteps, runStepImpl = runStep, publishSummaryImpl = publishSummary } = {},
) {
  const results = [];

  for (const [name, command, args, timeoutMs] of steps) {
    const result = await runStepImpl({ name, command, args, timeoutMs, cwd });
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
    steps: results.map(summaryStep),
  };
  await publishSummaryImpl(resolve(cwd, 'docs/quality/verification-summary.json'), summary);

  return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runReleaseVerification()
    .then((summary) => {
      if (summary.status !== 'passed') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.code === 'SUMMARY_PUBLISH_FAILED' ? error.code : error);
      process.exitCode = 1;
    });
}
