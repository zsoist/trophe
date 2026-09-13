import { describe, expect, it, vi } from 'vitest';
import {
  buildParallelSearchRequestBody,
  createParallelNutritionSearchTransport,
  isSupportedParallelLocation,
  NutritionSearchTransportError,
  NUTRITION_SEARCH_MAX_PROVIDER_RESULTS,
  NUTRITION_SEARCH_MAX_RESPONSE_BYTES,
  PARALLEL_SEARCH_ENDPOINT,
  PARALLEL_SEARCH_MODE,
} from '@/lib/food/nutrition-search-transport';

const valid = {
  objective: 'Publicly documented nutrition facts per 100 g for Big Mac in Colombia (language: Spanish).',
  query: 'Big Mac Colombia información nutricional por 100 g',
  location: null,
  maxResults: 5,
};
const page = JSON.stringify({
  search_id: 'srch_abc123',
  results: [
    { url: 'https://fdc.nal.usda.gov/food/1', title: 'Big Mac', publish_date: '2024-01-02', excerpts: ['Per 100 g: 257 kcal.', 'Protein 11.6 g.'] },
    { url: 'https://example.com/menu', title: 'Menu', publish_date: null, excerpts: ['Price list'] },
  ],
});

function transport(options: { body?: string; status?: number; fetchImpl?: (url: string, init: RequestInit) => Promise<Response> } = {}) {
  const fetchImpl = vi.fn(options.fetchImpl ?? (async () => new Response(options.body ?? page, { status: options.status ?? 200 })));
  const created = createParallelNutritionSearchTransport({
    apiKey: 'test-key', timeoutMs: 1_000,
    fetch: fetchImpl as unknown as typeof globalThis.fetch,
  });
  return { created, fetchImpl };
}

const settings = (input: Record<string, unknown>) =>
  input.advanced_settings as { location?: string; max_results: number };

describe('Parallel search transport contract', () => {
  it('sends exactly one fast-mode query to /v1/search with the x-api-key header', async () => {
    const { created, fetchImpl } = transport();
    await created.search({ ...valid, signal: new AbortController().signal });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(PARALLEL_SEARCH_ENDPOINT);
    expect(url).toBe('https://api.parallel.ai/v1/search');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['x-api-key']).toBe('test-key');
    expect(headers['Authorization']).toBeUndefined();
    expect(headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(String(init.body)) as {
      mode: string; objective: string; search_queries: string[];
      advanced_settings: { max_results: number; excerpt_settings: { max_chars_per_result: number } };
    };
    expect(body.mode).toBe(PARALLEL_SEARCH_MODE);
    expect(body.mode).toBe('fast');
    expect(body.objective).toBe(valid.objective);
    expect(body.search_queries).toEqual([valid.query]);
    expect(body.search_queries).toHaveLength(1);
    expect(body.advanced_settings.max_results).toBeLessThanOrEqual(NUTRITION_SEARCH_MAX_PROVIDER_RESULTS);
    expect(body.advanced_settings.excerpt_settings.max_chars_per_result).toBeGreaterThan(0);
  });

  it('omits an unsupported location but preserves the market in objective/query', async () => {
    const body = buildParallelSearchRequestBody(valid);
    expect(settings(body).location).toBeUndefined();
    expect(JSON.stringify(body)).toContain('Colombia');
    const supported = buildParallelSearchRequestBody({ ...valid, location: 'MX' });
    expect(settings(supported).location).toBe('mx');
    expect(isSupportedParallelLocation('CO')).toBe(false);
    expect(isSupportedParallelLocation('mx')).toBe(true);
  });

  it('never requests more than the 10 results included in the fast price', () => {
    const body = buildParallelSearchRequestBody({ ...valid, maxResults: 500 });
    expect(settings(body).max_results).toBe(NUTRITION_SEARCH_MAX_PROVIDER_RESULTS);
  });

  it('maps url/title/publish_date/excerpts and drops unsafe links', async () => {
    const { created } = transport({
      body: JSON.stringify({
        search_id: 'srch_1',
        results: [
          { url: 'javascript:alert(1)', title: 'evil', excerpts: ['x'] },
          { url: 'https://user:pass@example.com/a', title: 'creds', excerpts: ['x'] },
          { url: 'http://insecure.example.com/a', title: 'insecure', excerpts: ['x'] },
          { url: 'https://fdc.nal.usda.gov/food/1?utm_source=x#frag', title: '  USDA\u0000  Big Mac ', publish_date: '2024-01-02', excerpts: ['Per\u0007 100 g', 'Protein 11.6 g'] },
        ],
      }),
    });
    const result = await created.search({ ...valid, signal: new AbortController().signal });
    expect(result.searchId).toBe('srch_1');
    expect(result.results).toHaveLength(1);
    const only = result.results[0];
    expect(only.url).toBe('https://fdc.nal.usda.gov/food/1');
    expect(only.host).toBe('fdc.nal.usda.gov');
    expect(only.title).toBe('USDA Big Mac');
    expect(only.publishDate).toBe('2024-01-02');
    expect(only.snippet).toBe('Per 100 g Protein 11.6 g');
    expect(only.officialSource).toBe(true);
  });

  it('rejects a missing key at construction and never dispatches', () => {
    expect(() => createParallelNutritionSearchTransport({ apiKey: '  ' })).toThrow('missing_parallel_api_key');
  });

  it('classifies http, malformed, oversize and network failures without leaking detail', async () => {
    const cases: Array<[string, () => Promise<unknown>]> = [
      ['http_status', () => transport({ status: 401 }).created.search({ ...valid, signal: new AbortController().signal })],
      ['malformed_body', () => transport({ body: 'not json' }).created.search({ ...valid, signal: new AbortController().signal })],
      ['malformed_body', () => transport({ body: JSON.stringify({ search_id: 'x' }) }).created.search({ ...valid, signal: new AbortController().signal })],
      ['oversize', () => transport({ body: 'x'.repeat(NUTRITION_SEARCH_MAX_RESPONSE_BYTES + 1) }).created.search({ ...valid, signal: new AbortController().signal })],
      ['network', () => transport({ fetchImpl: async () => { throw new TypeError('fetch failed'); } }).created.search({ ...valid, signal: new AbortController().signal })],
    ];
    for (const [kind, run] of cases) {
      await expect(run()).rejects.toMatchObject({ kind });
    }
    await expect(cases[0][1]()).rejects.not.toThrow(/test-key|fdc\.nal/);
  });

  it('bounds a hanging fetch with its own timeout, including a late resolution', async () => {
    const hanging = createParallelNutritionSearchTransport({
      apiKey: 'test-key', timeoutMs: 30,
      fetch: vi.fn(() => new Promise<Response>(() => undefined)),
    });
    await expect(hanging.search({ ...valid, signal: new AbortController().signal }))
      .rejects.toMatchObject({ kind: 'timeout' });

    const late = createParallelNutritionSearchTransport({
      apiKey: 'test-key', timeoutMs: 30,
      fetch: vi.fn(() => new Promise<Response>(resolve => { setTimeout(() => resolve(new Response(page)), 5_000); })),
    });
    await expect(late.search({ ...valid, signal: new AbortController().signal }))
      .rejects.toMatchObject({ kind: 'timeout' });
  });

  it('honours caller cancellation', async () => {
    const { created, fetchImpl } = transport({
      fetchImpl: (_url, init) => new Promise<Response>((_, reject) => {
        (init.signal as AbortSignal).addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    });
    const controller = new AbortController();
    const pending = created.search({ ...valid, signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ kind: 'cancelled' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(pending).rejects.toBeInstanceOf(NutritionSearchTransportError);
  });
});
