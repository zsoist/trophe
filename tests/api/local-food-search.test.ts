import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  const orFilters: string[] = [];
  const limit = vi.fn();
  const order = vi.fn(() => ({ limit }));
  const or = vi.fn((filter: string) => {
    orFilters.push(filter);
    return { order, filter };
  });
  const select = vi.fn(() => ({ or }));
  const from = vi.fn(() => ({ select }));
  return {
    consumeRateLimit: vi.fn(),
    from,
    limit,
    or,
    orFilters,
  };
});

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mocks.from })),
}));
vi.mock('@/lib/security/durable-rate-limit', () => ({
  consumeRateLimit: mocks.consumeRateLimit,
}));

import { GET } from '@/app/api/food/local-search/route';

// ── Minimal PostgREST ILIKE/`or` simulator ────────────────────────────────
// Proves rows are actually returned for punctuation/spacing variants, not
// merely that the filter string has the expected shape.
interface Row {
  id: string;
  name: string;
  name_el: string | null;
  name_es: string | null;
  popularity: number;
}

function ilikeMatch(text: string | null | undefined, pattern: string): boolean {
  const unescaped = pattern.replace(/\\(.)/g, '$1');
  const regex = new RegExp(
    `^${unescaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')}$`,
    'is',
  );
  return regex.test(text ?? '');
}

function selectRows(rows: Row[], filter: string): Row[] {
  // Split on the commas that separate fragments (`…,%column.ilike.…`), never on
  // a comma that is part of a value.
  const ors = filter.split(/,(?=[a-z_]+\.ilike\.)/).map((fragment) => {
    const match = /^([a-z_]+)\.ilike\.(.*)$/.exec(fragment);
    if (!match) throw new Error(`Unrecognised filter fragment: ${fragment}`);
    return { column: match[1] as keyof Row, pattern: match[2] };
  });
  // PostgREST returns each matching row once, ordered by popularity.
  return rows
    .filter((row) => ors.some(({ column, pattern }) => ilikeMatch(row[column] as string, pattern)))
    .sort((a, b) => b.popularity - a.popularity);
}

let DATASET: Row[] = [
  { id: '1', name: 'Milk', name_el: 'γάλα', name_es: 'leche', popularity: 90 },
  { id: '2', name: 'Milk, whole', name_el: null, name_es: 'leche entera', popularity: 80 },
  { id: '3', name: 'Rice, brown', name_el: null, name_es: 'arroz integral', popularity: 70 },
];

function request(limit: string, q = 'rice') {
  return new NextRequest(`http://localhost/api/food/local-search?q=${encodeURIComponent(q)}&limit=${limit}`, {
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
}

function requestQuery(q: string, limit = '15') {
  return new NextRequest(
    `http://localhost/api/food/local-search?q=${encodeURIComponent(q)}&limit=${limit}`,
    { headers: { 'x-forwarded-for': '127.0.0.1' } },
  );
}

describe('GET /api/food/local-search', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orFilters.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-anon';
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    // Each `.limit()` runs the captured filter against the in-memory dataset,
    // mimicking the two-query phrase→token fallback in the route.
    mocks.limit.mockImplementation((limit?: number) => {
      const filter = mocks.orFilters[mocks.orFilters.length - 1] ?? '';
      const rows = selectRows(DATASET, filter);
      return Promise.resolve({
        data: typeof limit === 'number' ? rows.slice(0, limit) : rows,
        error: null,
      });
    });
  });

  it.each([
    ['garbage', 15],
    ['3foods', 15],
    ['0', 1],
    ['1000', 50],
    ['12', 12],
  ])('normalizes limit %s to %s before querying', async (raw, expected) => {
    const response = await GET(request(raw));

    expect(response.status).toBe(200);
    expect(mocks.limit).toHaveBeenCalledWith(expected);
  });

  it('returns stable public copy without leaking database details', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    mocks.limit.mockResolvedValue({
      data: null,
      error: {
        name: 'PostgrestError',
        code: '42P01',
        message: 'relation private_food_shadow does not exist',
        details: 'internal database topology',
      },
    });

    const response = await GET(request('15'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({ error: 'Food search temporarily unavailable' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private_food_shadow');
    expect(JSON.stringify(log.mock.calls)).not.toContain('internal database topology');
    log.mockRestore();
  });

  it('keeps user text from splitting the PostgREST or-filter into extra conditions', async () => {
    await GET(requestQuery('milk, whole'));

    // A raw comma would have terminated the value and opened an extra condition.
    // Every fragment must still be one of our three columns, and the phrase
    // value must survive whole instead of splitting on the comma.
    expect(mocks.orFilters[0].split(/,(?=[a-z_]+\.ilike\.)/)).toEqual([
      'name.ilike.%milk whole%',
      'name_el.ilike.%milk whole%',
      'name_es.ilike.%milk whole%',
    ]);
    for (const fragment of mocks.orFilters.flatMap((f) => f.split(/,(?=[a-z_]+\.ilike\.)/))) {
      expect(fragment).toMatch(/^(name|name_el|name_es)\.ilike\./);
    }
  });

  it('returns rows whose names interleave punctuation with the query words', async () => {
    const response = await GET(requestQuery('milk whole'));
    const body = await response.json();

    // The phrase `%milk whole%` matches nothing, so the token OR-filter must
    // bring back "Milk, whole" instead of dropping the row.
    expect(mocks.or).toHaveBeenCalledTimes(2);
    expect(mocks.orFilters[1]).toContain('name.ilike.%milk%');
    expect(mocks.orFilters[1]).toContain('name.ilike.%whole%');
    expect(body.foods.map((food: { description: string }) => food.description)).toEqual([
      'Milk',
      'Milk, whole',
    ]);
  });

  it.each([
    ['milk, whole', ['Milk', 'Milk, whole']],
    ['(milk)', ['Milk', 'Milk, whole']],
    ['rice  brown', ['Rice, brown']],
  ])('returns meaningful matches for the punctuation query %j', async (query, expected) => {
    const response = await GET(requestQuery(query));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.foods.map((food: { description: string }) => food.description)).toEqual(expected);
  });

  it.each([',()"', '()', ',', '"', '   ,()"  '])(
    'rejects delimiter-only query %j without issuing a DB query',
    async (query) => {
      const response = await GET(requestQuery(query));
      const body = await response.json();

      // Sanitising to empty must never reach the builder (`ilike.%%` would match
      // arbitrary rows): no query is constructed and none is executed.
      expect(response.status).toBe(400);
      expect(body.error).toMatch(/searchable/i);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.or).not.toHaveBeenCalled();
      expect(mocks.limit).not.toHaveBeenCalled();
    },
  );

  it('keeps legitimate wildcards escaped and searchable', async () => {
    const response = await GET(requestQuery('100%'));

    expect(response.status).toBe(200);
    expect(mocks.orFilters[0]).toContain('name.ilike.%100\\%%');
  });
});

describe('GET /api/food/local-search — phrase + token merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orFilters.length = 0;
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://127.0.0.1:54321';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'local-anon';
    mocks.consumeRateLimit.mockResolvedValue({ allowed: true, retryAfter: 0 });
    mocks.limit.mockImplementation((limit?: number) => {
      const filter = mocks.orFilters[mocks.orFilters.length - 1] ?? '';
      const rows = selectRows(DATASET, filter);
      return Promise.resolve({
        data: typeof limit === 'number' ? rows.slice(0, limit) : rows,
        error: null,
      });
    });
  });

  // "Milk whole" (low popularity) is matched by the phrase query; the more
  // popular "Milk" / "Whole milk powder" only match the word OR query. A phrase
  // hit must no longer suppress the supplementary retrieval.
  const mergeDataset: Row[] = [
    { id: 'phrase', name: 'Milk whole', name_el: null, name_es: null, popularity: 10 },
    { id: 'pop1', name: 'Milk', name_el: null, name_es: 'leche', popularity: 90 },
    { id: 'pop2', name: 'Whole milk powder', name_el: null, name_es: null, popularity: 80 },
  ];

  it('supplements a phrase hit with token matches, deduped, phrase rows first', async () => {
    const original = DATASET;
    DATASET = mergeDataset;
    try {
      const response = await GET(requestQuery('milk whole'));
      const body = await response.json();

      expect(mocks.or).toHaveBeenCalledTimes(2);
      expect(mocks.orFilters[0]).toBe(
        'name.ilike.%milk whole%,name_el.ilike.%milk whole%,name_es.ilike.%milk whole%',
      );
      expect(mocks.orFilters[1]).toContain('name.ilike.%milk%');
      // "Milk whole" also matches the token filter but appears once; it leads
      // because phrase matches are prioritised ahead of the more popular rows.
      expect(body.foods.map((food: { description: string }) => food.description)).toEqual([
        'Milk whole',
        'Milk',
        'Whole milk powder',
      ]);
      expect(body.count).toBe(3);
    } finally {
      DATASET = original;
    }
  });

  it('caps the merged page at the requested limit, phrase matches first', async () => {
    const original = DATASET;
    DATASET = mergeDataset;
    try {
      const response = await GET(requestQuery('milk whole', '2'));
      const body = await response.json();

      expect(response.status).toBe(200);
      // Phrase page = ["Milk whole"], token page (limit 2) = ["Milk", "Whole
      // milk powder"]; merged and bounded to 2 -> the phrase row keeps its slot.
      expect(body.foods.map((food: { description: string }) => food.description)).toEqual([
        'Milk whole',
        'Milk',
      ]);
      expect(body.count).toBe(2);
    } finally {
      DATASET = original;
    }
  });
});
