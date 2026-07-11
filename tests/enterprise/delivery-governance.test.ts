import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = process.cwd();
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

const workflowFiles = [
  '.github/workflows/ci.yml',
  '.github/workflows/nightly-eval.yml',
  '.github/workflows/provider-smoke.yml',
] as const;

const actionUsePattern = /^\s*(?:-\s+)?uses:\s*([^\s#]+)/gm;
const fullShaPattern = /^[^@\s]+@[a-f0-9]{40}$/;

function workflowValue(body: string, key: string): string | null {
  const match = body.match(new RegExp(`^\\s*${key}:\\s*([^\\n#]+)`, 'm'));
  return match?.[1]?.trim() ?? null;
}

describe('WP3 delivery truth governance', () => {
  it('pins every GitHub Action to a full commit SHA', () => {
    const mutableUses: string[] = [];

    for (const file of workflowFiles) {
      const body = read(file);
      for (const match of body.matchAll(actionUsePattern)) {
        const spec = match[1];
        if (!fullShaPattern.test(spec)) mutableUses.push(`${file}: ${spec}`);
      }
    }

    expect(mutableUses).toEqual([]);
  });

  it('required CI enforces deterministic agent contracts without paid provider calls', () => {
    const ci = read('.github/workflows/ci.yml');
    const runner = read('agents/evals/run-all.ts');

    expect(ci).not.toContain('ALLOW_SKIPPED_EVALS');
    expect(ci).toContain('Agent routing and eval contracts (no paid calls)');
    expect(ci).toContain('tests/agents/phase3-routing-policy.test.ts');
    expect(ci).toContain('tests/agents/golden-tolerance-guard.test.ts');
    expect(ci).toContain('tests/agents/food-parse-watchlist.test.ts');
    expect(ci).not.toContain('npm run evals');
    expect(ci).not.toContain('EVAL_REQUIRED_SUITES');
    expect(ci).not.toContain('EVAL_ENFORCE_GATE');

    // Live evals remain strict when deliberately run; they are not paid PR checks.
    expect(runner).toContain('EVAL_REQUIRED_SUITES');
    expect(runner).toContain('Required eval suite skipped');
  });

  it('food readiness in required CI has non-permissive thresholds', () => {
    const ci = read('.github/workflows/ci.yml');

    expect(workflowValue(ci, 'FOOD_MINIMUM_ROWS')).toBe('14');
    expect(workflowValue(ci, 'FOOD_MIN_AUTHORITATIVE_RATE')).toBe('0.95');
    expect(workflowValue(ci, 'FOOD_MAX_MISSING_EMBEDDINGS')).toBe('87');
  });

  it('coverage thresholds are configured AND actually run in required CI', () => {
    const vitestConfig = read('vitest.config.ts');

    expect(vitestConfig).toContain('thresholds');
    expect(vitestConfig).toContain('lines: 20');
    expect(vitestConfig).toContain('functions: 20');
    expect(vitestConfig).toContain('branches: 15');
    expect(vitestConfig).toContain('statements: 20');

    // A configured-but-unrun threshold is itself a false-green. Required CI must execute it.
    expect(read('.github/workflows/ci.yml')).toContain('npm run test:coverage');
  });

  it('the production nutrition benchmark is on-demand only (no schedule — avoids nightly token burn)', () => {
    const nightly = read('.github/workflows/nightly-eval.yml');

    expect(nightly).toContain('workflow_dispatch');
    expect(nightly).not.toMatch(/^\s*schedule:/m);
    expect(nightly).not.toContain('cron:');
  });

  it('CODEOWNERS covers material production-change surfaces', () => {
    const codeowners = read('.github/CODEOWNERS');

    for (const requiredPath of [
      '/.github/',
      '/.github/workflows/',
      '/drizzle/',
      '/db/',
      '/app/api/auth/',
      '/app/api/privacy/',
      '/app/api/cron/',
      '/app/api/internal/',
      '/agents/',
      '/scripts/ops/',
      '/docs/trust/',
    ]) {
      expect(codeowners).toContain(requiredPath);
    }
  });

  it('Dependabot covers npm, GitHub Actions, and security posture', () => {
    const dependabot = read('.github/dependabot.yml');

    expect(dependabot).toContain('package-ecosystem: "npm"');
    expect(dependabot).toContain('package-ecosystem: "github-actions"');
    expect(dependabot).toContain('open-pull-requests-limit');
    expect(dependabot).toContain('groups:');
  });

  it('operator-owned repository controls are documented as release gates', () => {
    const path = 'docs/ops/wp3-delivery-truth.md';
    expect(existsSync(join(ROOT, path))).toBe(true);

    const runbook = read(path);
    for (const requiredPhrase of [
      'protected main',
      'required pull request',
      'required checks',
      'one approving review',
      'conversation resolution',
      'block force pushes',
      'block branch deletion',
      'Dependabot security updates',
      'allowed Actions',
      'Vercel preview protection',
      'public repository posture',
    ]) {
      expect(runbook).toContain(requiredPhrase);
    }
  });

  it('pull request template asks reviewers to account for release evidence', () => {
    const template = read('.github/pull_request_template.md');

    expect(template).toContain('release evidence named for this package actually ran');
    expect(template).toContain('no skipped required evals/tests');
    expect(template).toContain('operator/manual canary');
    expect(template).toContain('CODEOWNERS path is covered');
  });
});
