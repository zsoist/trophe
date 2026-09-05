// npm's postbuild lifecycle makes the existing CI Production build fail closed.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

let checkedOutSha;
let shaSource = 'git HEAD';
try {
  checkedOutSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', stdio: 'pipe' }).trim();
} catch {
  checkedOutSha = process.env.VERCEL_GIT_COMMIT_SHA;
  shaSource = 'VERCEL_GIT_COMMIT_SHA (checkout has no .git)';
}
if (!/^[a-f0-9]{40}$/.test(checkedOutSha ?? '')) throw new Error('Build budget requires an exact commit SHA');
const prHeadSha = process.env.GITHUB_EVENT_PATH
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8')).pull_request?.head?.sha ?? null
  : null;
const buildId = readFileSync('.next/BUILD_ID', 'utf8').trim();
const result = spawnSync('npm', ['run', 'perf:budget'], { encoding: 'utf8', timeout: 60000, maxBuffer: 4 * 1024 * 1024 });
const evidence = {
  observedAt: new Date().toISOString(), checkedOutSha, shaSource, prHeadSha,
  // On pull_request CI, HEAD is the synthetic merge SHA, not the PR head.
  githubSha: process.env.GITHUB_SHA ?? null,
  vercelCommitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
  buildId,
  budgetScriptSha256: createHash('sha256').update(readFileSync('scripts/perf/check-build-budgets.mjs')).digest('hex'),
  exitCode: result.status, signal: result.signal,
  error: result.error?.message ?? null,
  stdout: result.stdout ?? '', stderr: result.stderr ?? '',
};
// Existing CI uploads artifacts/evals even on failure; no workflow permission needed.
mkdirSync('artifacts/evals', { recursive: true });
writeFileSync('artifacts/evals/build-budget.json', JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence, null, 2));
process.exitCode = result.status === 0 && !result.error ? 0 : 1;
