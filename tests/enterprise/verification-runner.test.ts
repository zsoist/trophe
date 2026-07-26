import { describe, expect, it } from 'vitest';
import { runStep } from '../../scripts/ci/verify-release.mjs';

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
});
