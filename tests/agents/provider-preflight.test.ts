import { describe, expect, it, vi } from 'vitest';
import { runProviderPreflight } from '@/scripts/ops/provider-preflight';

const env = {
  ANTHROPIC_API_KEY: 'anthropic-test',
  DEEPSEEK_API_KEY: 'deepseek-test',
  GOOGLE_API_KEY: 'google-test',
  OPENAI_API_KEY: 'openai-test',
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
    if (url.includes('generativelanguage.googleapis.com')) {
      return jsonResponse({
        responseId: 'gemini-1',
        usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 1 },
      });
    }
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
    if (url === 'https://api.openai.com/v1/batches?limit=1') {
      expect(init?.method ?? 'GET').toBe('GET');
      return jsonResponse({ object: 'list', data: [], has_more: false });
    }
    if (url === 'https://api.anthropic.com/v1/messages/batches?limit=1') {
      expect(init?.method ?? 'GET').toBe('GET');
      return jsonResponse({ data: [], has_more: false });
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
    const result = await runProviderPreflight({ env, fetchImpl, log: vi.fn() });

    expect(result.ok).toBe(true);
    expect(result.checks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'openai.entitlement', ok: true, providerRequestId: 'req-openai-1' }),
      expect.objectContaining({ id: 'anthropic.entitlement', ok: true, providerRequestId: 'req-anthropic-1' }),
      expect.objectContaining({ id: 'openai.batch', ok: true }),
      expect.objectContaining({ id: 'anthropic.batch', ok: true }),
      expect.objectContaining({ id: 'deepseek.balance', ok: true, balanceState: 'available' }),
    ]));

    const batchCalls = fetchImpl.mock.calls.filter(([request]) => String(request).includes('/batches'));
    expect(batchCalls).toHaveLength(2);
    expect(batchCalls.every(([, init]) => (init?.method ?? 'GET') === 'GET')).toBe(true);
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
});
