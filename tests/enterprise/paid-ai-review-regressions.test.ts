import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { invokeDeepSeekText } from '@/agents/runtime/providers/deepseek';
import {
  PaidAiToolApprovalError,
  createPaidAiAttemptCounter,
  deriveDeepSeekStressEstimate,
  normalizePaidAiEndpoint,
  requirePaidAiToolApproval,
} from '../../scripts/safety/require-paid-ai-approval';

const REPO_ROOT = path.resolve(__dirname, '../..');
const OPERATION = 'eval-deepseek-candidate';
const ENDPOINT = 'https://api.deepseek.com/chat/completions';
const RUN_ID = 'review-regression';
const PROVIDER_KEYS = [
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'MISTRAL_API_KEY',
  'OPENAI_API_KEY',
  'VOYAGE_API_KEY',
] as const;
const ARGV = [
  '--live',
  `--target=${ENDPOINT}`,
  '--max-calls=2',
  '--max-usd=0.100000',
  `--run-id=${RUN_ID}`,
  `--ack=I_UNDERSTAND_PAID_AI:${OPERATION}:${RUN_ID}:${ENDPOINT}`,
];
const roots: string[] = [];

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'trophe-paid-review-'));
  roots.push(root);
  mkdirSync(path.join(root, 'scripts/safety'), { recursive: true });
  return root;
}

function writeManifest(root: string, tools: Array<Record<string, unknown>>): void {
  writeFileSync(
    path.join(root, 'scripts/safety/tool-policy-manifest.json'),
    `${JSON.stringify({ version: 1, tools }, null, 2)}\n`,
  );
}

function manifestRow(entrypoint: string): Record<string, unknown> {
  return {
    id: entrypoint.replaceAll('/', '-').replace(/\.[^.]+$/, ''),
    entrypoint,
    runtime: entrypoint.endsWith('.sh') ? 'shell' : 'node',
    policies: ['paid-ai'],
    owners: { 'paid-ai': 'ai-offline-harness-task-6' },
    operations: { 'paid-ai': OPERATION },
    classifications: { serviceRole: false, localDb: false },
  };
}

async function scan(root: string): Promise<string[]> {
  const scanner = await import(pathToFileURL(
    path.join(REPO_ROOT, 'scripts/ci/check-paid-ai-tools.mjs'),
  ).href) as { scanPaidAiTools(input: { rootDir: string }): string[] };
  return scanner.scanPaidAiTools({ rootDir: root });
}

describe('paid transport capability regressions', () => {
  it('charges every DeepSeek HTTP retry at the transport boundary', async () => {
    vi.stubEnv('DEEPSEEK_API_KEY', 'offline-test-only');
    const counter = createPaidAiAttemptCounter({
      operation: OPERATION,
      maxCalls: 1,
      maxUsdMicrodollars: 100_000,
      estimatedUsdPerAttempt: '0.050000',
      endpoints: [ENDPOINT],
    });
    const fetchImpl = vi.fn(async () => new Response(
      JSON.stringify({ error: { message: 'retry' } }),
      { status: 503 },
    ));

    await expect(invokeDeepSeekText({
      model: 'deepseek-v4-flash',
      system: 'system',
      prompt: 'prompt',
      maxTokens: 100,
      signal: new AbortController().signal,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      beforeTransportAttempt: counter.beforeTransportAttempt,
    })).rejects.toBeInstanceOf(PaidAiToolApprovalError);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(counter.snapshot()).toMatchObject({
      attempts: 1,
      consumedUsdMicrodollars: 50_000,
    });
  });

  it('binds approval and every transport attempt to one normalized endpoint', () => {
    expect(normalizePaidAiEndpoint('HTTPS://API.DEEPSEEK.COM:443/chat/completions'))
      .toBe(ENDPOINT);

    const approval = requirePaidAiToolApproval({
      operation: OPERATION,
      argv: ARGV,
      env: { TROPHE_ALLOW_PAID_AI: '1' },
      endpoints: ['HTTPS://API.DEEPSEEK.COM:443/chat/completions'],
    });
    expect(() => approval.beforeTransportAttempt(
      'https://api.deepseek.com/beta/chat/completions',
    )).toThrowError(PaidAiToolApprovalError);
    expect(() => approval.beforeTransportAttempt(
      'https://api.deepseek.com:444/chat/completions',
    )).toThrowError(PaidAiToolApprovalError);

    for (const endpoint of [
      'https://user@api.deepseek.com/chat/completions',
      'https://api.deepseek.com/chat/completions#fragment',
      'http://api.deepseek.com/chat/completions',
    ]) {
      expect(() => normalizePaidAiEndpoint(endpoint)).toThrowError(
        PaidAiToolApprovalError,
      );
    }
  });

  it('fails closed when an opaque route envelope is unknown or exceeds approval', () => {
    const route = 'https://trophe.app/api/food/parse';
    const approval = requirePaidAiToolApproval({
      operation: 'eval-food-parse-route',
      argv: [
        '--live',
        `--target=${route}`,
        '--max-calls=1',
        '--max-usd=0.250000',
        `--run-id=${RUN_ID}`,
        `--ack=I_UNDERSTAND_PAID_AI:eval-food-parse-route:${RUN_ID}:${route}`,
      ],
      env: { TROPHE_ALLOW_PAID_AI: '1' },
      endpoints: [route],
    });

    expect(() => approval.reserveOpaqueEnvelope({
      endpoint: route,
      maxProviderAttempts: Number.NaN,
    })).toThrowError(PaidAiToolApprovalError);
    expect(() => approval.reserveOpaqueEnvelope({
      endpoint: route,
      maxProviderAttempts: 2,
    })).toThrowError(PaidAiToolApprovalError);
  });

  it('forces opaque paid-route fetches to reject redirects', async () => {
    const route = 'https://trophe.app/api/food/parse';
    const approval = requirePaidAiToolApproval({
      operation: 'eval-food-parse-route',
      argv: [
        '--live',
        `--target=${route}`,
        '--max-calls=64',
        '--max-usd=1.280000',
        `--run-id=${RUN_ID}`,
        `--ack=I_UNDERSTAND_PAID_AI:eval-food-parse-route:${RUN_ID}:${route}`,
      ],
      env: { TROPHE_ALLOW_PAID_AI: '1' },
      endpoints: [route],
    });
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.redirect).toBe('error');
      return new Response('{}', { status: 200 });
    });

    await approval.fetchOpaque(route, { method: 'POST' }, {
      maxProviderAttempts: 64,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

describe('DeepSeek stress pricing regression', () => {
  it('derives a versioned conservative price and rejects unknown or unbounded ceilings', () => {
    expect(deriveDeepSeekStressEstimate({
      model: 'deepseek-v4-pro',
      maxInputTokens: 4_096,
      maxOutputTokens: 8_192,
    })).toEqual({
      pricingVersion: 'deepseek-v4-2026-07-25',
      estimatedUsdPerAttempt: '0.008909',
    });

    for (const input of [
      { model: 'unknown', maxInputTokens: 4_096, maxOutputTokens: 8_192 },
      { model: 'deepseek-v4-pro', maxInputTokens: 4_096, maxOutputTokens: 57_472 },
      { model: 'deepseek-v4-pro', maxInputTokens: Number.NaN, maxOutputTokens: 100 },
      { model: 'deepseek-v4-pro', maxInputTokens: 100, maxOutputTokens: 0 },
    ]) {
      expect(() => deriveDeepSeekStressEstimate(input))
        .toThrowError(PaidAiToolApprovalError);
    }
  });
});

describe('repository-wide executable graph scanner regressions', () => {
  it('discovers package-script executables and paid dependencies outside fixed roots', async () => {
    const root = fixtureRoot();
    mkdirSync(path.join(root, 'scripts/rag'), { recursive: true });
    mkdirSync(path.join(root, 'agents/rag'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: { 'rag:ingest': 'tsx scripts/rag/ingest-document.ts' },
    }));
    writeManifest(root, []);
    writeFileSync(
      path.join(root, 'scripts/rag/ingest-document.ts'),
      "import { ingestKnowledge } from '../../agents/rag/ingest';\nvoid ingestKnowledge();\n",
    );
    writeFileSync(
      path.join(root, 'agents/rag/ingest.ts'),
      "import { invokeVoyageEmbedding } from '../runtime/providers/voyage';\nvoid invokeVoyageEmbedding;\n",
    );

    expect(await scan(root)).toContain(
      'scripts/rag/ingest-document.ts:unclassified-paid-ai-tool',
    );
  });

  it('walks aliases, barrels, dynamic imports, and dependency cycles without hanging', async () => {
    const root = fixtureRoot();
    mkdirSync(path.join(root, 'scripts/rag'), { recursive: true });
    mkdirSync(path.join(root, 'agents/runtime/providers'), { recursive: true });
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({
      scripts: { paid: 'tsx scripts/rag/cyclic.ts' },
    }));
    writeManifest(root, [manifestRow('scripts/rag/cyclic.ts')]);
    writeFileSync(
      path.join(root, 'scripts/rag/cyclic.ts'),
      [
        "import { helper } from './index';",
        'const approval = requirePaidAiToolApproval({ operation: "eval-deepseek-candidate", argv: [], env: {}, endpoints: [] });',
        'void helper(approval);',
      ].join('\n'),
    );
    writeFileSync(
      path.join(root, 'scripts/rag/index.ts'),
      "export { helper } from './loop';\n",
    );
    writeFileSync(
      path.join(root, 'scripts/rag/loop.ts'),
      [
        "import './index';",
        'export async function helper(approval: unknown) {',
        "  const { invokeDeepSeekText: paidCall } = await import('../../agents/runtime/providers/deepseek');",
        "  return paidCall({ prompt: 'x' });",
        '}',
      ].join('\n'),
    );
    writeFileSync(
      path.join(root, 'agents/runtime/providers/deepseek.ts'),
      'export async function invokeDeepSeekText(_: unknown) {}\n',
    );

    expect(await scan(root)).toContain(
      'scripts/rag/cyclic.ts:paid-transport-capability-missing',
    );
  });

  it('rejects dead counters, dotenv before approval, and ignored shell guards', async () => {
    const root = fixtureRoot();
    mkdirSync(path.join(root, 'scripts/rag'), { recursive: true });
    writeManifest(root, [
      manifestRow('scripts/rag/dead.ts'),
      manifestRow('scripts/rag/env.ts'),
      manifestRow('scripts/rag/fail-open.sh'),
    ]);
    writeFileSync(
      path.join(root, 'scripts/rag/dead.ts'),
      [
        'const approval = requirePaidAiToolApproval({ operation: "eval-deepseek-candidate", argv: [], env: {}, endpoints: [] });',
        'if (false) approval.consumeAttempt();',
        "for (const item of ['x']) await invokeDeepSeekText({ prompt: item });",
      ].join('\n'),
    );
    writeFileSync(
      path.join(root, 'scripts/rag/env.ts'),
      [
        'loadEnvConfig(process.cwd());',
        'const approval = requirePaidAiToolApproval({ operation: "eval-deepseek-candidate", argv: [], env: {}, endpoints: [] });',
        "await invokeDeepSeekText({ prompt: 'x', beforeTransportAttempt: approval.beforeTransportAttempt });",
      ].join('\n'),
    );
    writeFileSync(
      path.join(root, 'scripts/rag/fail-open.sh'),
      [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'npx tsx scripts/safety/require-paid-ai-approval.ts --operation=eval-deepseek-candidate "$@" || true',
        'curl https://api.deepseek.com/chat/completions',
      ].join('\n'),
    );

    const violations = await scan(root);
    expect(violations).toEqual(expect.arrayContaining([
      'scripts/rag/dead.ts:paid-transport-capability-missing',
      'scripts/rag/env.ts:approval-after-sensitive-boundary',
      'scripts/rag/fail-open.sh:shell-guard-fail-open',
    ]));
  });
});

describe('RAG ingest dry-run bootstrap', () => {
  it('chunks locally without approval, dotenv, credentials, DB, network, or reports', () => {
    const root = fixtureRoot();
    const input = path.join(root, 'document.txt');
    const trap = path.join(root, 'trap.mjs');
    writeFileSync(
      input,
      'A local document for a dry-run with enough content to satisfy the existing CLI validation.',
    );
    writeFileSync(trap, [
      "globalThis.fetch = async () => { throw new Error('NETWORK_TRAP'); };",
      "process.env.DATABASE_URL = 'postgresql://should-not-load.invalid/db';",
      "process.env.VOYAGE_API_KEY = 'SHOULD_NOT_LOAD';",
    ].join('\n'));
    const env = { ...process.env } as NodeJS.ProcessEnv;
    delete env.TROPHE_ALLOW_PAID_AI;
    delete env.VOYAGE_API_KEY;
    delete env.DATABASE_URL;

    const result = spawnSync(process.execPath, [
      '--import',
      'tsx',
      '--import',
      pathToFileURL(trap).href,
      path.join(REPO_ROOT, 'scripts/rag/ingest-document.ts'),
      `--file=${input}`,
      '--created-by=00000000-0000-4000-8000-000000000001',
      '--dry-run',
    ], {
      cwd: REPO_ROOT,
      env,
      encoding: 'utf8',
    });

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('"chunks": 1');
    expect(`${result.stdout}${result.stderr}`).not.toContain('NETWORK_TRAP');
  });
});

describe('dotenv bootstrap ordering', () => {
  it('does not call dotenv before rejection or from an approval-free generator dry-run', () => {
    const root = fixtureRoot();
    const trap = path.join(root, 'dotenv-trap.cjs');
    writeFileSync(trap, [
      "const Module = require('node:module');",
      'const originalLoad = Module._load;',
      'Module._load = function(request, parent, isMain) {',
      '  const loaded = originalLoad.call(this, request, parent, isMain);',
      "  if (request !== '@next/env') return loaded;",
      "  return { ...loaded, loadEnvConfig() { throw new Error('DOTENV_LOADER_TRAP'); } };",
      '};',
    ].join('\n'));
    const baseEnv = { ...process.env, NODE_OPTIONS: `--require=${trap}` } as NodeJS.ProcessEnv;
    delete baseEnv.TROPHE_ALLOW_PAID_AI;
    for (const key of PROVIDER_KEYS) delete baseEnv[key];

    const rejected = spawnSync(process.execPath, [
      '--import',
      'tsx',
      path.join(REPO_ROOT, 'scripts/eval/run-phase2-round1.ts'),
    ], { cwd: REPO_ROOT, env: baseEnv, encoding: 'utf8' });
    expect(rejected.status).toBe(1);
    expect(`${rejected.stdout}${rejected.stderr}`).not.toContain('DOTENV_LOADER_TRAP');

    const dryRun = spawnSync(process.execPath, [
      '--import',
      'tsx',
      path.join(REPO_ROOT, 'scripts/eval/generate-benchmark-cases.ts'),
    ], {
      cwd: REPO_ROOT,
      env: { ...baseEnv, DRY_RUN: '1' },
      encoding: 'utf8',
    });
    expect(dryRun.status, dryRun.stderr).toBe(0);
    expect(dryRun.stdout).toContain('dotenv loads: 0');
    expect(`${dryRun.stdout}${dryRun.stderr}`).not.toContain('DOTENV_LOADER_TRAP');
  });
});
