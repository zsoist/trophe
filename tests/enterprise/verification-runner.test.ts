import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  publishSummary,
  runReleaseVerification,
  runStep,
  terminateProcessTree,
} from '../../scripts/ci/verify-release.mjs';

const node = process.execPath;
const cwd = process.cwd();

describe('verification release runner', () => {
  it('records a successful command', async () => {
    const result = await runStep({
      name: 'success',
      command: node,
      args: ['-e', 'process.stdout.write("ready")'],
      timeoutMs: 1_000,
      cwd,
    });

    expect(result).toMatchObject({
      name: 'success',
      status: 'passed',
      exitCode: 0,
      signal: null,
      stdout: 'ready',
      stderr: '',
    });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('records a failing command exit code', async () => {
    const result = await runStep({
      name: 'failure',
      command: node,
      args: ['-e', 'process.stderr.write("broken"); process.exit(7)'],
      timeoutMs: 1_000,
      cwd,
    });

    expect(result).toMatchObject({
      name: 'failure',
      status: 'failed',
      exitCode: 7,
      signal: null,
      stdout: '',
      stderr: 'broken',
    });
  });

  it('terminates a slow command at its deadline', async () => {
    const result = await runStep({
      name: 'slow',
      command: node,
      args: ['-e', 'setInterval(() => {}, 1_000)'],
      timeoutMs: 50,
      cwd,
    });

    expect(result).toMatchObject({
      name: 'slow',
      status: 'timed_out',
      exitCode: null,
      signal: 'SIGTERM',
    });
  });

  it('bounds stdout and stderr to 64 KiB per step', async () => {
    const result = await runStep({
      name: 'noisy',
      command: node,
      args: [
        '-e',
        'process.stdout.write("x".repeat(70_000)); process.stderr.write("y".repeat(70_000))',
      ],
      timeoutMs: 1_000,
      cwd,
    });

    expect(Buffer.byteLength(result.stdout)).toBe(64 * 1024);
    expect(Buffer.byteLength(result.stderr)).toBe(64 * 1024);
  });

  it('keeps the UTF-8 output bound at 64 KiB at a multibyte boundary', async () => {
    const result = await runStep({
      name: 'multibyte',
      command: node,
      args: ['-e', 'process.stdout.write("x".repeat(65_535) + "€")'],
      timeoutMs: 1_000,
      cwd,
    });

    expect(Buffer.byteLength(result.stdout)).toBeLessThanOrEqual(64 * 1024);
    expect(result.stdout.endsWith('�')).toBe(false);
  });

  it('returns a redacted category and code when spawning fails', async () => {
    const result = await runStep({
      name: 'missing-command',
      command: 'trophe-command-that-does-not-exist',
      args: [],
      timeoutMs: 1_000,
      cwd,
    });

    expect(result).toMatchObject({
      name: 'missing-command',
      status: 'failed',
      spawnError: {
        category: 'spawn_failed',
        code: 'ENOENT',
        repairAction: 'check_command_and_path',
      },
    });
  });

  it('uses taskkill to terminate a Windows process tree', () => {
    const spawnProcess = vi.fn(() => new EventEmitter());
    const killProcess = vi.fn();

    terminateProcessTree(
      { pid: 4242 },
      { platform: 'win32', spawnProcess: spawnProcess as never, killProcess },
    );

    expect(spawnProcess).toHaveBeenCalledWith(
      'taskkill',
      ['/pid', '4242', '/t', '/f'],
      { stdio: 'ignore', windowsHide: true },
    );
    expect(killProcess).not.toHaveBeenCalled();
  });

  it('persists only allowlisted diagnostics in the release summary', async () => {
    let publishedSummary: unknown;
    const rawStep = {
      name: 'test',
      status: 'failed',
      exitCode: 1,
      signal: null,
      durationMs: 12,
      stdout: 'prompt: private meal details',
      stderr: '/Users/example/secret-provider-response',
      stdoutBytes: 28,
      stderrBytes: 39,
      stdoutDigest: 'a'.repeat(64),
      stderrDigest: 'b'.repeat(64),
      spawnError: null,
    };

    await runReleaseVerification(cwd, {
      steps: [['test', 'ignored', [], 1]],
      runStepImpl: async () => rawStep,
      publishSummaryImpl: async (_path: string, summary: unknown) => {
        publishedSummary = summary;
      },
    });

    const serialized = JSON.stringify(publishedSummary);
    expect(serialized).not.toContain('private meal details');
    expect(serialized).not.toContain('/Users/example');
    expect(publishedSummary).toMatchObject({
      status: 'failed',
      steps: [{
        name: 'test',
        status: 'failed',
        stdoutBytes: 28,
        stderrBytes: 39,
        stdoutDigest: 'a'.repeat(64),
        stderrDigest: 'b'.repeat(64),
      }],
    });
  });

  it('stops before typecheck for an offloaded dependency tree', async () => {
    let publishedSummary: unknown;
    const runStepImpl = vi.fn(async () => ({
      name: 'typecheck',
      status: 'passed',
      exitCode: 0,
      signal: null,
      durationMs: 1,
      stdout: '',
      stderr: '',
      stdoutBytes: 0,
      stderrBytes: 0,
      stdoutDigest: 'a'.repeat(64),
      stderrDigest: 'b'.repeat(64),
      spawnError: null,
    }));

    const summary = await runReleaseVerification(cwd, {
      steps: [['typecheck', 'ignored', [], 1]],
      dependencyHealthProbeImpl: async () => ({
        datalessPaths: ['node_modules/typescript/lib/lib.es2016.full.d.ts'],
      }),
      runStepImpl,
      publishSummaryImpl: async (_path: string, value: unknown) => {
        publishedSummary = value;
      },
    });

    expect(runStepImpl).not.toHaveBeenCalled();
    expect(summary).toMatchObject({
      status: 'failed',
      preflight: {
        status: 'dependency_tree_offloaded',
        datalessFileCount: 1,
        repairAction: 'run_npm_ci_from_package_lock',
      },
      steps: [],
    });
    expect(JSON.stringify(publishedSummary)).not.toContain('lib.es2016.full.d.ts');
  });

  it('publishes summaries atomically and reports publication failures', async () => {
    const operations = {
      mkdir: vi.fn(async () => undefined),
      writeFile: vi.fn(async () => undefined),
      rename: vi.fn(async () => undefined),
      unlink: vi.fn(async () => undefined),
    };
    const summaryPath = '/tmp/trophe-summary.json';

    await publishSummary(summaryPath, { status: 'passed' }, operations);

    expect(operations.writeFile).toHaveBeenCalledOnce();
    expect(operations.rename).toHaveBeenCalledOnce();
    expect(operations.rename).toHaveBeenCalledWith(expect.any(String), summaryPath);

    operations.rename.mockRejectedValueOnce(new Error('disk failure'));
    await expect(publishSummary(summaryPath, { status: 'failed' }, operations)).rejects.toMatchObject({
      code: 'SUMMARY_PUBLISH_FAILED',
    });
    expect(operations.unlink).toHaveBeenCalledOnce();
  });
});
