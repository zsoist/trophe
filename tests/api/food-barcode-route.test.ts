import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Regression (network/auth error classification): the barcode route treated every
// non-2xx Open Food Facts response as "product not found" (404). A 401/403 block,
// a 429 rate limit or a 5xx outage therefore told the client a widely-scanned
// product was missing from OFF, silently pushing the user to hand-type macros
// during a transient provider failure. Only the provider's genuine 404 (unknown
// barcode) is a product verdict; everything else is a provider failure (502).

const mocks = vi.hoisted(() => ({
  guardAiRoute: vi.fn(),
  dbHit: null as Record<string, unknown> | null,
}));

vi.mock('@/lib/security/api-guard', () => ({ guardAiRoute: mocks.guardAiRoute }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ limit: () => ({ maybeSingle: async () => ({ data: mocks.dbHit, error: null }) }) }) }),
      insert: () => ({ then: (onFulfilled: () => unknown, onRejected: () => unknown) => Promise.resolve(undefined).then(onFulfilled, onRejected) }),
    }),
  }),
}));

import { POST } from '@/app/api/food/barcode/route';

function request(barcode = '5449000000996') {
  return new NextRequest('http://localhost/api/food/barcode', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ barcode }),
  });
}

const PRODUCT_BODY = {
  status: 1,
  product: { product_name_en: 'Cola', brands: 'Fizz Co', nutriments: { 'energy-kcal_100g': 42, proteins_100g: 0, carbohydrates_100g: 10.6, fat_100g: 0 } },
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.dbHit = null;
  mocks.guardAiRoute.mockResolvedValue({ ok: true, userId: 'user-1', rateLimitBypassed: false });
});

describe('POST /api/food/barcode — provider failure classification', () => {
  it.each([401, 403, 429, 500, 503])(
    'reports a provider %i as 502 unavailable, never as "not found"',
    async (status) => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('upstream error', { status })));

      const response = await POST(request());
      const body = await response.json();

      expect(response.status).toBe(502);
      expect(body.found).toBe(false);
      expect(body.error).toBe('Open Food Facts unavailable');
    },
  );

  it('keeps the provider’s genuine 404 barcode as a real "not found"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ status: 0 }), { status: 404 })));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.error).toBe('Not found in Open Food Facts');
  });

  it('treats an unparseable 2xx body as a provider failure, not a "not found"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>interstitial</html>', { status: 200 })));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe('Open Food Facts unavailable');
  });

  it('returns a normalized product on a successful provider lookup', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(PRODUCT_BODY), { status: 200 })));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ found: true, name: 'Cola', brand: 'Fizz Co', source: 'off', per100g: { kcal: 42 } });
  });

  it('answers from our own table without touching the provider', async () => {
    mocks.dbHit = {
      name_en: 'Local Cola', brand: 'Fizz Co', barcode: '5449000000996',
      kcal_per_100g: 40, protein_per_100g: 0, carb_per_100g: 10, fat_per_100g: 0,
      fiber_per_100g: null, sugar_per_100g: 10,
    };
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ found: true, name: 'Local Cola', source: 'db' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
