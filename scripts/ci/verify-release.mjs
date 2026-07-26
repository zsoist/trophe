#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const OUTPUT_LIMIT_BYTES = 64 * 1024;
const TERMINATION_GRACE_MS = 2_000;
const DEPENDENCY_PROBE_TIMEOUT_MS = 30_000;
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

export function probeDependencyHealth({
  cwd = process.cwd(),
  platform = process.platform,
  spawnProcess = spawn,
  killProcess = process.kill,
  timeoutMs = DEPENDENCY_PROBE_TIMEOUT_MS,
} = {}) {
  if (platform !== 'darwin') {
    return Promise.resolve({ status: 'healthy', datalessFileCount: 0 });
  }

  return new Promise((resolveProbe) => {
    let datalessFileCount = 0;
    let timedOut = false;
    let settled = false;
    let timeoutTimer;
    let killTimer;
    const child = spawnProcess('find', ['node_modules', '-flags', '+dataless', '-print0'], {
      cwd,
      detached: true,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const onData = (chunk) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      for (const byte of bytes) {
        if (byte === 0x00) datalessFileCount += 1;
      }
    };
    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearTimeout(killTimer);
      child.stdout?.removeListener?.('data', onData);
      child.removeListener?.('error', onError);
      child.removeListener?.('close', onClose);
    };
    const finish = (result) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolveProbe(result);
    };
    const onError = () => {
      finish({
        status: timedOut ? 'dependency_health_probe_timed_out' : 'dependency_health_probe_failed',
        datalessFileCount: 0,
      });
    };
    const onClose = (exitCode) => {
      if (timedOut) {
        finish({ status: 'dependency_health_probe_timed_out', datalessFileCount: 0 });
      } else if (exitCode === 0) {
        finish({ status: 'healthy', datalessFileCount });
      } else {
        finish({ status: 'dependency_health_probe_failed', datalessFileCount: 0 });
      }
    };

    child.stdout?.on('data', onData);
    child.once('error', onError);
    child.once('close', onClose);
    timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminateProcessTree(child, { platform, spawnProcess, killProcess });
      killTimer = setTimeout(() => {
        terminateProcessTree(child, {
          platform,
          spawnProcess,
          killProcess,
          signal: 'SIGKILL',
        });
        finish({ status: 'dependency_health_probe_timed_out', datalessFileCount: 0 });
      }, TERMINATION_GRACE_MS);
    }, timeoutMs);
  });
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

function dependencyPreflight(probeResult) {
  const datalessFileCount = Array.isArray(probeResult.datalessPaths)
    ? probeResult.datalessPaths.length
    : probeResult.datalessFileCount;

  if (datalessFileCount > 0) {
    return {
      status: 'dependency_tree_offloaded',
      datalessFileCount,
      repairAction: 'run_npm_ci_from_package_lock',
      repairInstruction: 'Run npm ci to restore node_modules from package-lock.json.',
    };
  }

  if (probeResult.status === 'healthy') {
    return { status: 'healthy', datalessFileCount: 0 };
  }

  return {
    status: probeResult.status ?? 'dependency_health_probe_failed',
    datalessFileCount: 0,
    repairAction: 'check_node_modules_and_run_npm_ci',
    repairInstruction: 'Check node_modules, then run npm ci from package-lock.json.',
  };
}

export async function runReleaseVerification(
  cwd = process.cwd(),
  {
    steps = releaseSteps,
    dependencyHealthProbeImpl = probeDependencyHealth,
    runStepImpl = runStep,
    publishSummaryImpl = publishSummary,
  } = {},
) {
  const results = [];
  const preflight = dependencyPreflight(await dependencyHealthProbeImpl({ cwd }));

  if (preflight.status !== 'healthy') {
    const summary = {
      generatedAt: new Date().toISOString(),
      status: 'failed',
      preflight,
      steps: results,
    };
    await publishSummaryImpl(resolve(cwd, 'docs/quality/verification-summary.json'), summary);
    return summary;
  }

  for (const [name, command, args, timeoutMs] of steps) {
    const result = await runStepImpl({ name, command, args, timeoutMs, cwd });
    results.push(result);
    if (result.status !== 'passed') break;
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    status: results.every((result) => result.status === 'passed') ? 'passed' : 'failed',
    preflight,
    steps: results.map(summaryStep),
  };
  await publishSummaryImpl(resolve(cwd, 'docs/quality/verification-summary.json'), summary);

  return summary;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain) {
  runReleaseVerification()
    .then((summary) => {
      if (summary.preflight?.status === 'dependency_tree_offloaded') {
        console.error(
          `dependency_tree_offloaded: ${summary.preflight.datalessFileCount} dataless path(s) found. ${summary.preflight.repairInstruction}`,
        );
      }
      if (summary.status !== 'passed') process.exitCode = 1;
    })
    .catch((error) => {
      console.error(error.code === 'SUMMARY_PUBLISH_FAILED' ? error.code : error);
      process.exitCode = 1;
    });
}
