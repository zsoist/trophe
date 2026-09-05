import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.each([0, 7])('preserves the exact build identity and propagates budget exit %i', status => {
  const root = mkdtempSync(join(tmpdir(), 'trophe-budget-lifecycle-'));
  try {
    mkdirSync(join(root, '.next'));
    mkdirSync(join(root, 'scripts/perf'), { recursive: true });
    writeFileSync(join(root, '.next/BUILD_ID'), 'synthetic-build');
    writeFileSync(join(root, 'scripts/perf/check-build-budgets.mjs'), `console.log('synthetic budget result');process.exit(${status});`);
    writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { 'perf:budget': 'node scripts/perf/check-build-budgets.mjs' } }));
    const result = spawnSync(process.execPath, [resolve('scripts/perf/record-build-budget.mjs')], {
      cwd: root, encoding: 'utf8', timeout: 15000,
      env: { ...process.env, GITHUB_EVENT_PATH: '', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40) },
    });
    expect(result.status).toBe(status === 0 ? 0 : 1);
    const evidence = JSON.parse(readFileSync(join(root, 'artifacts/evals/build-budget.json'), 'utf8'));
    expect(evidence.checkedOutSha).toBe('a'.repeat(40));
    expect(evidence.buildId).toBe('synthetic-build');
    expect(evidence.exitCode).toBe(status);
    expect(evidence.stdout).toContain('synthetic budget result');
  } finally { rmSync(root, { recursive: true, force: true }); }
});
