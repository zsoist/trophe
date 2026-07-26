import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import {
  assertPaidProviderAccess,
  PaidProviderAccessBlockedError,
  type PaidProvider,
} from '@/agents/runtime/provider-access';
import { invokeVoyageEmbedding } from '@/agents/runtime/providers/voyage';
import { findClientProviderImportViolations } from '@/lib/security/client-provider-import-graph';

const PROVIDERS: PaidProvider[] = ['openai', 'anthropic', 'deepseek', 'voyage', 'google'];
const SENSITIVE_SENTINEL = 'SENSITIVE_SENTINEL_DO_NOT_LOG';
const REPO_ROOT = process.cwd();
const PROVIDER_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DEEPSEEK_API_KEY',
  'VOYAGE_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
] as const;

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('TROPHE_ALLOW_PAID_AI', undefined);
  for (const key of PROVIDER_KEYS) vi.stubEnv(key, SENSITIVE_SENTINEL);
  vi.stubGlobal('fetch', () => {
    throw new Error('unexpected global fetch');
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('paid provider access policy', () => {
  it.each([
    {},
    { NODE_ENV: 'production' },
    { VERCEL_ENV: 'preview' },
    { VERCEL_ENV: 'development' },
    { VERCEL_ENV: 'test' },
    { TROPHE_ALLOW_PAID_AI: 'true' },
    { TROPHE_ALLOW_PAID_AI: 'yes' },
    { TROPHE_ALLOW_PAID_AI: '01' },
    { NEXT_PUBLIC_TROPHE_ALLOW_PAID_AI: '1' },
  ])('blocks non-exact live authorization %#', (environment) => {
    for (const [name, value] of Object.entries(environment)) {
      vi.stubEnv(name, value);
    }

    for (const provider of PROVIDERS) {
      expect(() => assertPaidProviderAccess({
        provider,
        transportWasInjected: false,
      })).toThrow(PaidProviderAccessBlockedError);
    }
  });

  it.each([
    ['TROPHE_ALLOW_PAID_AI', '1'],
    ['VERCEL_ENV', 'production'],
  ])('allows live access for exact %s=%s', (name, value) => {
    vi.stubEnv(name, value);

    for (const provider of PROVIDERS) {
      expect(assertPaidProviderAccess({
        provider,
        transportWasInjected: false,
      })).toBe('live');
    }
  });

  it('uses offline mode for injected transports even when live access is authorized', () => {
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('TROPHE_ALLOW_PAID_AI', '1');

    for (const provider of PROVIDERS) {
      expect(assertPaidProviderAccess({
        provider,
        transportWasInjected: true,
      })).toBe('offline');
    }
  });

  it('exposes only fixed low-cardinality blocked diagnostics', () => {
    let error: unknown;
    try {
      assertPaidProviderAccess({
        provider: 'anthropic',
        transportWasInjected: false,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(PaidProviderAccessBlockedError);
    expect(error).toMatchObject({
      name: 'PaidProviderAccessBlockedError',
      message: 'Paid provider access is blocked',
      code: 'paid_provider_access_blocked',
      provider: 'anthropic',
    });
    expect(Object.keys(error as object).sort()).toEqual(['code', 'name', 'provider']);
    expect(JSON.stringify(error)).not.toContain(SENSITIVE_SENTINEL);
    expect(error).not.toHaveProperty('prompt');
    expect(error).not.toHaveProperty('apiKey');
    expect(error).not.toHaveProperty('environment');
  });

  it('does not retain an untrusted runtime provider value', () => {
    let error: unknown;
    try {
      assertPaidProviderAccess({
        provider: SENSITIVE_SENTINEL as PaidProvider,
        transportWasInjected: false,
      });
    } catch (caught) {
      error = caught;
    }

    expect(error).toMatchObject({
      name: 'PaidProviderAccessBlockedError',
      code: 'paid_provider_access_blocked',
      provider: 'unknown',
    });
    expect(JSON.stringify(error)).not.toContain(SENSITIVE_SENTINEL);
  });

  it('rejects import in a browser runtime', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();

    await expect(import('@/agents/runtime/provider-access')).rejects.toThrow(
      'Paid provider access policy is server-only',
    );
  });

  it('keeps paid-provider modules out of use-client source files', () => {
    expect(findClientProviderImportViolations({ rootDir: REPO_ROOT })).toEqual([]);
  });

  it('imports paid-provider adapters through the normal tsx CLI before enforcing access', () => {
    const tsxCli = path.join(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
    const probe = `
      Promise.all([
        import('./agents/runtime/provider-access.ts'),
        import('./agents/runtime/providers/openai.ts'),
        import('./agents/runtime/providers/anthropic.ts'),
        import('./agents/runtime/providers/deepseek.ts'),
        import('./agents/runtime/providers/voyage.ts'),
        import('./agents/runtime/providers/structured.ts'),
        import('./agents/runtime/providers/text.ts'),
        import('./agents/clients/anthropic.ts'),
        import('./agents/clients/google.ts')
      ]).then(([access]) => {
        const providerAccess = access.default ?? access;
        try {
          providerAccess.assertPaidProviderAccess({ provider: 'openai', transportWasInjected: false });
          throw new Error('expected paid-provider access to be blocked');
        } catch (error) {
          if (!error || typeof error !== 'object' || error.code !== 'paid_provider_access_blocked') throw error;
          console.log('tsx-import-ok:paid_provider_access_blocked');
        }
      }).catch((error) => {
        console.error(error);
        process.exitCode = 1;
      });
    `;
    const unsetArguments = [
      ...PROVIDER_KEYS.flatMap((key) => ['-u', key]),
      '-u',
      'TROPHE_ALLOW_PAID_AI',
      '-u',
      'VERCEL_ENV',
    ];
    const result = spawnSync('/usr/bin/env', [
      ...unsetArguments,
      process.execPath,
      tsxCli,
      '-e',
      probe,
    ], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect({
      status: result.status,
      signal: result.signal,
      stderr: result.stderr,
    }).toEqual({
      status: 0,
      signal: null,
      stderr: expect.not.stringContaining('Cannot find module'),
    });
    expect(result.stdout).toContain('tsx-import-ok:paid_provider_access_blocked');
  });

  it('runs Voyage fixtures with the offline credential and exact signal', async () => {
    const signal = new AbortController().signal;
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      data: [{ embedding: [0.25, 0.75] }],
      usage: { total_tokens: 3 },
    }), { status: 200 }));

    await expect(invokeVoyageEmbedding({
      model: 'voyage-4',
      text: 'fixture',
      inputType: 'query',
      signal,
      fetchImpl: fetchMock as unknown as typeof fetch,
    })).resolves.toMatchObject({
      output: [0.25, 0.75],
      usage: { inputTokens: 3, outputTokens: 0 },
    });

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal,
      headers: {
        Authorization: 'Bearer trophe-offline-placeholder',
        'Content-Type': 'application/json',
      },
    });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(SENSITIVE_SENTINEL);
  });

  it('blocks Voyage before the global transport when no transport is injected', async () => {
    await expect(invokeVoyageEmbedding({
      model: 'voyage-4',
      text: 'fixture',
      inputType: 'query',
      signal: new AbortController().signal,
    })).rejects.toMatchObject({
      name: 'PaidProviderAccessBlockedError',
      code: 'paid_provider_access_blocked',
      provider: 'voyage',
    });
  });
});
