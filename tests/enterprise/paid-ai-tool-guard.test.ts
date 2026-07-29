import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PaidAiToolApprovalError,
  createPaidAiAttemptCounter,
  requirePaidAiToolApproval,
} from '../../scripts/safety/require-paid-ai-approval';

const REPO_ROOT = path.resolve(__dirname, '../..');
const VALID_OPERATION = 'eval-food-parse-route';
const VALID_TARGET = 'https://trophe.app/api/food/parse';
const VALID_RUN_ID = 'canary-20260726';
const VALID_ARGV = [
  '--live',
  `--target=${VALID_TARGET}`,
  '--max-calls=2',
  '--max-usd=0.500000',
  `--run-id=${VALID_RUN_ID}`,
  `--ack=I_UNDERSTAND_PAID_AI:${VALID_OPERATION}:${VALID_RUN_ID}:${VALID_TARGET}`,
];
const VALID_ENV = { TROPHE_ALLOW_PAID_AI: '1' };
const PROVIDER_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'VOYAGE_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'MISTRAL_API_KEY',
] as const;

const tempRoots: string[] = [];

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function approval(
  argv: readonly string[] = VALID_ARGV,
  env: Readonly<Record<string, string | undefined>> = VALID_ENV,
) {
  return requirePaidAiToolApproval({
    operation: VALID_OPERATION,
    argv,
    env,
    endpoints: [VALID_TARGET],
  });
}

function fixedError(error: unknown, operation = VALID_OPERATION): void {
  expect(error).toBeInstanceOf(PaidAiToolApprovalError);
  const serialized = JSON.stringify(error);
  expect(serialized).toMatch(
    new RegExp(
      `^\\{"name":"PaidAiToolApprovalError","code":"PAID_AI_TOOL_APPROVAL_BLOCKED","rule":"[a-z-]+","operation":"${operation}"\\}$`,
    ),
  );
}

function fixtureRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'trophe-paid-ai-guard-'));
  tempRoots.push(root);
  mkdirSync(path.join(root, 'scripts/safety'), { recursive: true });
  mkdirSync(path.join(root, 'scripts/eval'), { recursive: true });
  return root;
}

function writeFixtureManifest(
  root: string,
  tools: Array<Record<string, unknown>>,
): void {
  writeFileSync(
    path.join(root, 'scripts/safety/tool-policy-manifest.json'),
    `${JSON.stringify({ version: 1, tools }, null, 2)}\n`,
  );
}

async function scanFixture(root: string): Promise<string[]> {
  const scannerUrl = pathToFileURL(
    path.join(REPO_ROOT, 'scripts/ci/check-paid-ai-tools.mjs'),
  ).href;
  const scanner = await import(scannerUrl) as {
    scanPaidAiTools(input: { rootDir: string }): string[];
  };
  return scanner.scanPaidAiTools({ rootDir: root });
}

describe('paid AI tool approval policy', () => {
  it('accepts only the complete exact operation-bound approval', () => {
    const run = approval();

    expect(run).toMatchObject({
      operation: VALID_OPERATION,
      target: VALID_TARGET,
      runId: VALID_RUN_ID,
      maxCalls: 2,
      maxUsdMicrodollars: 500_000,
    });
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.snapshot())).toBe(true);
  });

  it.each([
    undefined,
    '',
    '0',
    'true',
    'TRUE',
    ' 1',
    '1 ',
  ])('rejects non-exact environment opt-in %j', (value) => {
    expect(() => approval(VALID_ARGV, {
      TROPHE_ALLOW_PAID_AI: value,
      VERCEL_ENV: 'production',
      OPENAI_API_KEY: 'SENSITIVE_KEY_SENTINEL',
    })).toThrowError(PaidAiToolApprovalError);
  });

  it('does not treat production, provider-key presence, or NODE_ENV as approval', () => {
    try {
      approval(VALID_ARGV, {
        VERCEL_ENV: 'production',
        NODE_ENV: 'production',
        OPENAI_API_KEY: 'SENSITIVE_KEY_SENTINEL',
      });
      throw new Error('expected approval to fail');
    } catch (error) {
      fixedError(error);
      expect(JSON.stringify(error)).not.toContain('SENSITIVE_KEY_SENTINEL');
      expect(JSON.stringify(error)).not.toContain('production');
    }
  });

  it.each([
    ['missing live', VALID_ARGV.filter((arg) => arg !== '--live')],
    ['live value', VALID_ARGV.map((arg) => arg === '--live' ? '--live=true' : arg)],
    ['missing target', VALID_ARGV.filter((arg) => !arg.startsWith('--target='))],
    ['wrong target', VALID_ARGV.map((arg) => arg.startsWith('--target=') ? '--target=https://sensitive.example/key' : arg)],
    ['missing calls', VALID_ARGV.filter((arg) => !arg.startsWith('--max-calls='))],
    ['zero calls', VALID_ARGV.map((arg) => arg.startsWith('--max-calls=') ? '--max-calls=0' : arg)],
    ['fractional calls', VALID_ARGV.map((arg) => arg.startsWith('--max-calls=') ? '--max-calls=1.5' : arg)],
    ['unbounded calls', VALID_ARGV.map((arg) => arg.startsWith('--max-calls=') ? '--max-calls=1001' : arg)],
    ['missing usd', VALID_ARGV.filter((arg) => !arg.startsWith('--max-usd='))],
    ['integer usd', VALID_ARGV.map((arg) => arg.startsWith('--max-usd=') ? '--max-usd=1' : arg)],
    ['zero usd', VALID_ARGV.map((arg) => arg.startsWith('--max-usd=') ? '--max-usd=0.000000' : arg)],
    ['too precise usd', VALID_ARGV.map((arg) => arg.startsWith('--max-usd=') ? '--max-usd=0.0000001' : arg)],
    ['non-finite usd', VALID_ARGV.map((arg) => arg.startsWith('--max-usd=') ? '--max-usd=Infinity' : arg)],
    ['missing run id', VALID_ARGV.filter((arg) => !arg.startsWith('--run-id='))],
    ['unsafe run id', VALID_ARGV.map((arg) => arg.startsWith('--run-id=') ? '--run-id=../sensitive' : arg)],
    ['long run id', VALID_ARGV.map((arg) => arg.startsWith('--run-id=') ? `--run-id=${'a'.repeat(65)}` : arg)],
    ['missing ack', VALID_ARGV.filter((arg) => !arg.startsWith('--ack='))],
    ['wrong operation ack', VALID_ARGV.map((arg) => arg.startsWith('--ack=') ? `--ack=I_UNDERSTAND_PAID_AI:eval-other:${VALID_RUN_ID}` : arg)],
    ['wrong run ack', VALID_ARGV.map((arg) => arg.startsWith('--ack=') ? '--ack=I_UNDERSTAND_PAID_AI:eval-food-parse-route:other-run' : arg)],
  ])('rejects malformed approval: %s', (_label, argv) => {
    expect(() => approval(argv)).toThrowError(PaidAiToolApprovalError);
  });

  it('sanitizes unknown operation and never serializes argv or environment values', () => {
    const sentinel = 'SENSITIVE_ARGV_ENV_URL_PROMPT_KEY';
    try {
      requirePaidAiToolApproval({
        operation: sentinel,
        argv: [`--target=https://example.invalid/${sentinel}`],
        env: { TROPHE_ALLOW_PAID_AI: sentinel },
        endpoints: [`https://example.invalid/${sentinel}`],
      });
      throw new Error('expected approval to fail');
    } catch (error) {
      fixedError(error, 'unknown');
      expect(String(error)).not.toContain(sentinel);
      expect(JSON.stringify(error)).not.toContain(sentinel);
    }
  });
});

describe('paid AI attempt counter', () => {
  it('consumes the conservative estimate before each permitted attempt', () => {
    const counter = createPaidAiAttemptCounter({
      operation: VALID_OPERATION,
      maxCalls: 2,
      maxUsdMicrodollars: 3,
      estimatedUsdPerAttempt: '0.0000011',
    });

    expect(counter.consumeAttempt()).toEqual({
      attempts: 1,
      reservedAttempts: 0,
      consumedUsdMicrodollars: 2,
      remainingCalls: 1,
      remainingUsdMicrodollars: 1,
    });
    expect(() => counter.consumeAttempt()).toThrowError(PaidAiToolApprovalError);
    expect(counter.snapshot()).toMatchObject({
      attempts: 1,
      consumedUsdMicrodollars: 2,
    });
  });

  it('refuses the next call after the exact call ceiling without mutating state', () => {
    const run = approval();
    run.consumeAttempt();
    run.consumeAttempt();
    const before = run.snapshot();

    expect(() => run.consumeAttempt()).toThrowError(PaidAiToolApprovalError);
    expect(run.snapshot()).toEqual(before);
  });

  it('rejects a run before credentials or auth when one known attempt exceeds its USD ceiling', () => {
    const tooSmall = VALID_ARGV.map((arg) =>
      arg.startsWith('--max-usd=') ? '--max-usd=0.019999' : arg,
    );
    expect(() => approval(tooSmall)).toThrowError(PaidAiToolApprovalError);
    expect(() => createPaidAiAttemptCounter({
      operation: VALID_OPERATION,
      maxCalls: 1,
      maxUsdMicrodollars: 1,
      estimatedUsdPerAttempt: '0.000002',
    })).toThrowError(PaidAiToolApprovalError);
  });

  it.each([
    '',
    'unknown',
    'NaN',
    'Infinity',
    '-0.100000',
    '0.000000',
    '1e-3',
  ])('refuses an unknown, non-finite, non-positive, or ambiguous estimate %j', (estimate) => {
    expect(() => createPaidAiAttemptCounter({
      operation: VALID_OPERATION,
      maxCalls: 1,
      maxUsdMicrodollars: 1_000_000,
      estimatedUsdPerAttempt: estimate,
    })).toThrowError(PaidAiToolApprovalError);
  });

  it('defaults bounded datasets to one canary and honors only a lower explicit ceiling', () => {
    const one = approval();
    expect(one.boundCases(['a', 'b', 'c'])).toEqual(['a']);

    const explicit = approval([...VALID_ARGV, '--case-limit=2']);
    expect(explicit.boundCases(['a', 'b', 'c'])).toEqual(['a', 'b']);

    const belowAttemptsPerCase = approval([
      ...VALID_ARGV.map((arg) => arg.startsWith('--max-calls=') ? '--max-calls=1' : arg),
      '--case-limit=2',
    ]);
    expect(() => belowAttemptsPerCase.boundCases(['a'], { attemptsPerCase: 2 }))
      .toThrowError(PaidAiToolApprovalError);
  });
});

describe('paid AI tool static inventory and order scanner', () => {
  it('ignores provider-looking comments and inert strings', async () => {
    const root = fixtureRoot();
    writeFixtureManifest(root, []);
    writeFileSync(
      path.join(root, 'scripts/eval/offline.ts'),
      [
        "// fetch('https://api.openai.com/v1/chat/completions')",
        "const documentation = 'OPENAI_API_KEY /api/food/parse';",
        'console.log(documentation.length);',
      ].join('\n'),
    );

    expect(await scanFixture(root)).toEqual([]);
  });

  it('reports an unclassified paid executable as file:rule only', async () => {
    const root = fixtureRoot();
    writeFixtureManifest(root, []);
    writeFileSync(
      path.join(root, 'scripts/eval/unsafe.ts'),
      [
        "import { invokeTextProvider } from '../../agents/runtime/providers/text';",
        'async function main() {',
        "  await invokeTextProvider({ prompt: 'SENSITIVE_PROMPT_SENTINEL' });",
        '}',
        'void main();',
      ].join('\n'),
    );

    const violations = await scanFixture(root);
    expect(violations).toEqual([
      'scripts/eval/unsafe.ts:unclassified-paid-ai-tool',
    ]);
    expect(violations.join('\n')).not.toContain('SENSITIVE_PROMPT_SENTINEL');
    expect(violations.join('\n')).not.toContain('invokeTextProvider');
  });

  it('reports key/auth/report boundaries before approval and unbudgeted transport', async () => {
    const root = fixtureRoot();
    writeFixtureManifest(root, [{
      id: 'unsafe',
      entrypoint: 'scripts/eval/unsafe.ts',
      runtime: 'node',
      policies: ['paid-ai'],
      owners: { 'paid-ai': 'ai-offline-harness-task-6' },
      operations: { 'paid-ai': VALID_OPERATION },
      classifications: { serviceRole: false, localDb: false },
    }]);
    writeFileSync(
      path.join(root, 'scripts/eval/unsafe.ts'),
      [
        "import { mkdirSync } from 'node:fs';",
        "import { invokeTextProvider } from '../../agents/runtime/providers/text';",
        'const key = process.env.OPENAI_API_KEY;',
        "mkdirSync('report', { recursive: true });",
        'const approval = requirePaidAiToolApproval({ operation: "eval-food-parse-route", argv: [], env: {} });',
        'async function main() { await invokeTextProvider({ key }); }',
        'void main();',
      ].join('\n'),
    );

    expect(await scanFixture(root)).toEqual([
      'scripts/eval/unsafe.ts:approval-after-sensitive-boundary',
      'scripts/eval/unsafe.ts:paid-transport-capability-missing',
    ]);
  });

  it('rejects a guard placed after paid-route authentication inside main', async () => {
    const root = fixtureRoot();
    writeFixtureManifest(root, [{
      id: 'late-nested',
      entrypoint: 'scripts/eval/late-nested.ts',
      runtime: 'node',
      policies: ['paid-ai'],
      owners: { 'paid-ai': 'ai-offline-harness-task-6' },
      operations: { 'paid-ai': VALID_OPERATION },
      classifications: { serviceRole: false, localDb: false },
    }]);
    writeFileSync(
      path.join(root, 'scripts/eval/late-nested.ts'),
      [
        'async function main() {',
        "  await fetch('https://example.invalid/auth/v1/token');",
        '  const approval = requirePaidAiToolApproval({ operation: "eval-food-parse-route", argv: [], env: {} });',
        '  approval.consumeAttempt();',
        "  await fetch('https://example.invalid/api/food/parse');",
        '}',
        'void main();',
      ].join('\n'),
    );

    expect(await scanFixture(root)).toEqual([
      'scripts/eval/late-nested.ts:approval-after-sensitive-boundary',
      'scripts/eval/late-nested.ts:direct-paid-transport-outside-facade',
      'scripts/eval/late-nested.ts:paid-transport-capability-missing',
    ]);
  });

  it('rejects a guard whose operation does not match its manifest row', async () => {
    const root = fixtureRoot();
    writeFixtureManifest(root, [{
      id: 'wrong-operation',
      entrypoint: 'scripts/eval/wrong-operation.ts',
      runtime: 'node',
      policies: ['paid-ai'],
      owners: { 'paid-ai': 'ai-offline-harness-task-6' },
      operations: { 'paid-ai': VALID_OPERATION },
      classifications: { serviceRole: false, localDb: false },
    }]);
    writeFileSync(
      path.join(root, 'scripts/eval/wrong-operation.ts'),
      [
        'const approval = requirePaidAiToolApproval({ operation: "eval-all", argv: process.argv.slice(2), env: process.env });',
        'async function main() {',
        '  approval.consumeAttempt();',
        "  await fetch('https://example.invalid/api/food/parse');",
        '}',
        'void main();',
      ].join('\n'),
    );

    expect(await scanFixture(root)).toEqual([
      'scripts/eval/wrong-operation.ts:direct-paid-transport-outside-facade',
      'scripts/eval/wrong-operation.ts:paid-transport-capability-missing',
      'scripts/eval/wrong-operation.ts:paid-ai-operation-mismatch',
    ].sort());
  });

  it('accepts a guarded and budgeted paid executable', async () => {
    const root = fixtureRoot();
    writeFixtureManifest(root, [{
      id: 'safe',
      entrypoint: 'scripts/eval/safe.ts',
      runtime: 'node',
      policies: ['paid-ai'],
      owners: { 'paid-ai': 'ai-offline-harness-task-6' },
      operations: { 'paid-ai': VALID_OPERATION },
      classifications: { serviceRole: false, localDb: false },
    }]);
    writeFileSync(
      path.join(root, 'scripts/eval/safe.ts'),
      [
        "import { invokeTextProvider } from '../../agents/runtime/providers/text';",
        "import { requirePaidAiToolApproval } from '../safety/require-paid-ai-approval';",
        'const approval = requirePaidAiToolApproval({ operation: "eval-food-parse-route", argv: process.argv.slice(2), env: process.env });',
        'async function main() {',
        "  await invokeTextProvider({ prompt: 'bounded', beforeTransportAttempt: approval.beforeTransportAttempt });",
        '}',
        'void main();',
      ].join('\n'),
    );

    expect(await scanFixture(root)).toEqual([]);
  });

  it('keeps the real manifest complete, unique, and scanner-clean', async () => {
    const manifest = JSON.parse(readFileSync(
      path.join(REPO_ROOT, 'scripts/safety/tool-policy-manifest.json'),
      'utf8',
    )) as {
      version: number;
      tools: Array<{
        id: string;
        entrypoint: string;
        runtime: string;
        policies: string[];
        owners: Record<string, string>;
        operations: Record<string, string>;
        classifications: { serviceRole: boolean; localDb: boolean };
      }>;
    };
    const inventoryFloor = [
      'agents/evals/run-all.ts',
      'agents/evals/run-food-parse.ts',
      'agents/evals/run-meal-suggest.ts',
      'scripts/debug/smoke-parse-roundtrip.ts',
      'scripts/eval/run-deepseek-candidate.ts',
      'scripts/eval/run-deepseek-stress.ts',
      'scripts/eval/run-food-parse-watchlist.ts',
      'scripts/eval/run-greek-colombian-prod.ts',
      'scripts/eval/run-nutrition-enterprise-prod.ts',
      'scripts/eval/run-phase2-round1.ts',
      'scripts/eval/validate-dataset.ts',
      'scripts/eval/generate-benchmark-cases.ts',
      'scripts/eval/generate-french-cases.ts',
      'scripts/eval/generate-replacement-cases.ts',
      'scripts/ingest/embed-foods.ts',
      'scripts/rag/ingest-document.ts',
    ];

    expect(manifest.version).toBe(1);
    expect(new Set(manifest.tools.map((tool) => tool.entrypoint)).size)
      .toBe(manifest.tools.length);
    for (const entrypoint of inventoryFloor) {
      expect(manifest.tools.find((tool) => tool.entrypoint === entrypoint))
        .toMatchObject({
          policies: expect.arrayContaining(['paid-ai']),
          owners: { 'paid-ai': 'ai-offline-harness-task-6' },
        });
    }
    for (const tool of manifest.tools) {
      expect(tool.policies).toEqual([...new Set(tool.policies)].sort());
      expect(Object.keys(tool.owners).sort()).toEqual(tool.policies);
      expect(Object.keys(tool.operations).sort()).toEqual(tool.policies);
      expect(tool.classifications).toEqual({
        serviceRole: expect.any(Boolean),
        localDb: expect.any(Boolean),
      });
    }
    expect(await scanFixture(REPO_ROOT)).toEqual([]);
  }, 15_000);

  it('prints only file:rule from the CLI', () => {
    const root = fixtureRoot();
    writeFixtureManifest(root, []);
    writeFileSync(
      path.join(root, 'scripts/eval/unsafe.ts'),
      [
        "import { invokeTextProvider } from '../../agents/runtime/providers/text';",
        "void invokeTextProvider({ prompt: 'SENSITIVE_PROMPT_SENTINEL' });",
      ].join('\n'),
    );
    const result = spawnSync(
      process.execPath,
      [path.join(REPO_ROOT, 'scripts/ci/check-paid-ai-tools.mjs'), '--root', root],
      { encoding: 'utf8', env: { NODE_ENV: 'test' } },
    );

    expect(result.status).toBe(1);
    expect(result.stdout.trim()).toBe(
      'scripts/eval/unsafe.ts:unclassified-paid-ai-tool',
    );
    expect(`${result.stdout}${result.stderr}`).not.toContain('SENSITIVE_PROMPT_SENTINEL');
  });
});

describe('embedding dry-run exception', () => {
  it('runs without approval, credentials, network, or report mutation', () => {
    const trapRoot = fixtureRoot();
    const trapPath = path.join(trapRoot, 'network-trap.mjs');
    writeFileSync(trapPath, [
      "import http from 'node:http';",
      "import https from 'node:https';",
      "import net from 'node:net';",
      "globalThis.fetch = async () => { throw new Error('NETWORK_TRAP_FETCH'); };",
      "http.request = () => { throw new Error('NETWORK_TRAP_HTTP'); };",
      "https.request = () => { throw new Error('NETWORK_TRAP_HTTPS'); };",
      "net.Socket.prototype.connect = function () { throw new Error('NETWORK_TRAP_SOCKET'); };",
    ].join('\n'));
    const reportRoots = ['reports', 'eval-results'].map((name) => path.join(REPO_ROOT, name));
    const before = reportRoots.map((root) => existsSync(root)
      ? [root, statSync(root).mtimeMs, readdirSync(root).sort()] as const
      : [root, null, []] as const);
    const env = { ...process.env, DRY_RUN: '1' } as NodeJS.ProcessEnv;
    delete env.TROPHE_ALLOW_PAID_AI;
    for (const key of PROVIDER_KEYS) delete env[key];

    const result = spawnSync(
      process.execPath,
      [
        '--import',
        'tsx',
        '--import',
        pathToFileURL(trapPath).href,
        path.join(REPO_ROOT, 'scripts/ingest/embed-foods.ts'),
      ],
      { cwd: REPO_ROOT, env, encoding: 'utf8' },
    );

    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('provider attempts: 0');
    expect(`${result.stdout}${result.stderr}`).not.toContain('NETWORK_TRAP_');
    const after = reportRoots.map((root) => existsSync(root)
      ? [root, statSync(root).mtimeMs, readdirSync(root).sort()] as const
      : [root, null, []] as const);
    expect(after).toEqual(before);
  });
});
