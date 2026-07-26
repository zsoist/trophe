import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertPaidProviderAccess,
  PaidProviderAccessBlockedError,
  type PaidProvider,
} from '@/agents/runtime/provider-access';
import { invokeVoyageEmbedding } from '@/agents/runtime/providers/voyage';

const PROVIDERS: PaidProvider[] = ['openai', 'anthropic', 'deepseek', 'voyage', 'google'];
const SENSITIVE_SENTINEL = 'SENSITIVE_SENTINEL_DO_NOT_LOG';

beforeEach(() => {
  vi.stubEnv('VERCEL_ENV', undefined);
  vi.stubEnv('TROPHE_ALLOW_PAID_AI', undefined);
  delete process.env.OPENAI_API_KEY;
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.DEEPSEEK_API_KEY;
  delete process.env.VOYAGE_API_KEY;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
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
