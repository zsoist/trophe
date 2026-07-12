import { describe, expect, it, vi } from 'vitest';
import { requiredPolicyModels, runProviderPreflight } from '@/scripts/ops/provider-preflight';

const env = {
  ANTHROPIC_API_KEY: 'anthropic-test',
  DEEPSEEK_API_KEY: 'deepseek-test',
  OPENAI_API_KEY: 'openai-test',
  VOYAGE_API_KEY: 'voyage-test',
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function successfulFetch() {
  return vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
    const url = String(request);
    if (url === 'https://api.anthropic.com/v1/messages') {
      return jsonResponse({
        id: 'msg-1',
        content: [{ type: 'text', text: 'OK' }],
        usage: { input_tokens: 2, output_tokens: 1 },
      }, 200, { 'request-id': 'req-anthropic-1' });
    }
    if (url === 'https://api.openai.com/v1/chat/completions') {
      return jsonResponse({
        id: 'chatcmpl-1',
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 2, completion_tokens: 1 },
      }, 200, { 'x-request-id': 'req-openai-1' });
    }
    if (url === 'https://api.deepseek.com/chat/completions') {
      return jsonResponse({
        id: 'deepseek-1',
        choices: [{ message: { content: 'OK' } }],
        usage: { prompt_tokens: 2, completion_tokens: 1 },
      });
    }
    if (url === 'https://api.voyageai.com/v1/embeddings') {
      return jsonResponse({
        object: 'list',
        data: [{ object: 'embedding', embedding: [0.1, 0.2], index: 0 }],
        model: 'voyage-4',
        usage: { total_tokens: 1 },
      }, 200, { 'request-id': 'req-voyage-1' });
    }
    if (url === 'https://api.openai.com/v1/batches?limit=1') {
      expect(init?.method ?? 'GET').toBe('GET');
      return jsonResponse({ object: 'list', data: [], has_more: false });
    }
    if (url === 'https://api.anthropic.com/v1/messages/batches?limit=1') {
      expect(init?.method ?? 'GET').toBe('GET');
      return jsonResponse({ data: [], has_more: false });
    }
    if (url === 'https://api.voyageai.com/v1/batches?limit=1') {
      expect(init?.method ?? 'GET').toBe('GET');
      return jsonResponse({ object: 'list', data: [], has_more: false });
    }
    if (url === 'https://api.deepseek.com/models') {
      return jsonResponse({ data: [{ id: 'deepseek-v4-flash' }, { id: 'deepseek-v4-pro' }] });
    }
    if (url === 'https://api.deepseek.com/user/balance') {
      return jsonResponse({ is_available: true, balance_infos: [{ currency: 'USD', total_balance: '10.00' }] });
    }
    throw new Error(`Unexpected preflight request: ${url}`);
  });
}

describe('provider preflight', () => {
  it('proves active entitlements, read-only batch capability, and supported balance evidence', async () => {
    const fetchImpl = successfulFetch();
    const log = vi.fn();
    const result = await runProviderPreflight({ env, fetchImpl, log });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'policy.coverage', ok: true }),
      expect.objectContaining({ id: 'openai.entitlement', ok: true, providerRequestId: 'req-openai-1' }),
      expect.objectContaining({ id: 'anthropic.entitlement', ok: true, providerRequestId: 'req-anthropic-1' }),
      expect.objectContaining({ id: 'openai.batch', ok: true }),
      expect.objectContaining({ id: 'anthropic.batch', ok: true }),
      expect.objectContaining({ id: 'voyage.entitlement', ok: true, providerRequestId: 'req-voyage-1' }),
      expect.objectContaining({ id: 'voyage.batch', ok: true }),
      expect.objectContaining({ id: 'deepseek.balance', ok: true, balanceState: 'available' }),
    ]));

    const batchCalls = fetchImpl.mock.calls.filter(([request]) => String(request).includes('/batches'));
    expect(batchCalls).toHaveLength(3);
    expect(batchCalls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);

    const openAiCalls = fetchImpl.mock.calls.filter(([request]) => String(request).includes('api.openai.com'));
    const openAiClientIds = openAiCalls.map(([, init]) =>
      (init?.headers as Record<string, string>)['X-Client-Request-Id']);
    expect(openAiClientIds).toHaveLength(2);
    expect(new Set(openAiClientIds).size).toBe(2);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(
      /^PASS openai\.entitlement HTTP 200 generation=chatcmpl-1 request=req-openai-1 client=.+ latency=\d+ms input=2 output=1$/,
    ));

    const models = requiredPolicyModels();
    const modelByUrl = new Map([
      ['https://api.openai.com/v1/chat/completions', models.openai[0]],
      ['https://api.anthropic.com/v1/messages', models.anthropic[0]],
      ['https://api.deepseek.com/chat/completions', models.deepseek[0]],
      ['https://api.voyageai.com/v1/embeddings', models.voyage[0]],
    ]);
    for (const [url, expectedModel] of modelByUrl) {
      const call = fetchImpl.mock.calls.find(([request]) => String(request) === url);
      expect(JSON.parse(String(call?.[1]?.body))).toMatchObject({ model: expectedModel });
    }
  });

  it('fails closed on a model permission error and preserves the safe provider evidence', async () => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.openai.com/v1/chat/completions') {
        return jsonResponse({
          error: { message: 'project lacks model access', type: 'invalid_request_error', code: 'model_not_found' },
        }, 403, { 'x-request-id': 'req-openai-denied' });
      }
      return baseFetch(request, init);
    });

    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn() });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'openai.entitlement',
      ok: false,
      status: 403,
      errorType: 'invalid_request_error',
      errorCode: 'model_not_found',
      providerRequestId: 'req-openai-denied',
    }));
  });

  it('fails when the only provider balance API reports unavailable', async () => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.deepseek.com/user/balance') {
        return jsonResponse({ is_available: false, balance_infos: [] });
      }
      return baseFetch(request, init);
    });

    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn() });

    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'deepseek.balance',
      ok: false,
      balanceState: 'unavailable',
    }));
  });

  it('retains the OpenAI client request ID when the provider never responds', async () => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.openai.com/v1/chat/completions') {
        throw new TypeError('fetch failed');
      }
      return baseFetch(request, init);
    });
    const log = vi.fn();

    const result = await runProviderPreflight({ env, fetchImpl, log });
    const failure = result.checks.find((check) => check.id === 'openai.entitlement');

    expect(result.ok).toBe(false);
    expect(failure).toMatchObject({ ok: false, errorType: 'network_error' });
    expect(failure?.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(log).toHaveBeenCalledWith(expect.stringMatching(
      /^FAIL openai\.entitlement client=[0-9a-f-]{36} type=network_error message=fetch failed$/,
    ));
  });

  it('fails closed when a capability endpoint returns non-JSON success', async () => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.openai.com/v1/batches?limit=1') {
        return new Response('<html>unexpected</html>', { status: 200 });
      }
      return baseFetch(request, init);
    });

    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn() });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'openai.batch',
      ok: false,
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_json_response',
    }));
  });

  it('preserves status and request ID when the response body cannot be read', async () => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.openai.com/v1/batches?limit=1') {
        const response = jsonResponse({ object: 'list', data: [] }, 200, {
          'x-request-id': 'req-openai-body-read',
        });
        vi.spyOn(response, 'text').mockRejectedValueOnce(new TypeError('stream failed'));
        return response;
      }
      return baseFetch(request, init);
    });

    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn() });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'openai.batch',
      ok: false,
      status: 200,
      providerRequestId: 'req-openai-body-read',
      errorType: 'provider_protocol_error',
      errorCode: 'response_read_failed',
    }));
  });

  it.each([
    ['JSON null', 'null'],
    ['an empty body', ''],
  ])('fails closed when a capability endpoint returns %s', async (_label, body) => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.anthropic.com/v1/messages/batches?limit=1') {
        return new Response(body, { status: 200 });
      }
      return baseFetch(request, init);
    });

    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn() });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'anthropic.batch',
      ok: false,
      errorType: 'provider_protocol_error',
      errorCode: 'invalid_json_response',
    }));
  });

  it('rejects an empty JSON object as batch-capability evidence', async () => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn(async (request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.voyageai.com/v1/batches?limit=1') {
        return jsonResponse({});
      }
      return baseFetch(request, init);
    });

    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn() });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'voyage.batch',
      ok: false,
      errorType: 'missing_capability_evidence',
    }));
  });

  it('bounds a hung provider check and retains OpenAI correlation', async () => {
    const baseFetch = successfulFetch();
    const fetchImpl = vi.fn((request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.openai.com/v1/chat/completions') {
        return new Promise<Response>(() => undefined);
      }
      return baseFetch(request, init);
    });

    const startedAt = Date.now();
    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn(), timeoutMs: 10 });
    const failure = result.checks.find((check) => check.id === 'openai.entitlement');

    expect(Date.now() - startedAt).toBeLessThan(1_000);
    expect(result.ok).toBe(false);
    expect(failure).toMatchObject({ ok: false, errorType: 'network_error' });
    expect(failure?.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(failure?.message).toContain('timed out');
  });

  it('bounds a provider that sends headers but never finishes its response body', async () => {
    const baseFetch = successfulFetch();
    let stalledSignal: AbortSignal | undefined;
    const fetchImpl = vi.fn((request: string | URL | Request, init?: RequestInit) => {
      if (String(request) === 'https://api.anthropic.com/v1/messages') {
        stalledSignal = init?.signal as AbortSignal | undefined;
        return Promise.resolve(new Response(new ReadableStream({ start() { /* never close */ } }), {
          status: 200,
          headers: { 'request-id': 'req_stalled_body' },
        }));
      }
      return baseFetch(request, init);
    });

    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn(), timeoutMs: 10 });
    expect(result.ok).toBe(false);
    expect(result.checks).toContainEqual(expect.objectContaining({
      id: 'anthropic.entitlement',
      ok: false,
      errorType: 'network_error',
      message: expect.stringContaining('timed out'),
    }));
    expect(stalledSignal?.aborted).toBe(true);
  });
});
