import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  from: vi.fn(),
  orFilters: [] as string[],
}));

vi.mock('@/lib/auth/require-role', () => ({ requireRole: mocks.requireRole }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServiceClient: () => ({ from: mocks.from, rpc: vi.fn(() => Promise.resolve({ error: null })) }),
}));

import { GET } from '@/app/api/food/search/route';

// ── Minimal PostgREST ILIKE/`or` simulator ────────────────────────────────
interface Row {
  id: string;
  name: string;
  name_el: string | null;
  name_es: string | null;
  calories_per_100g: number;
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
  return rows
    .filter((row) => ors.some(({ column, pattern }) => ilikeMatch(row[column] as string, pattern)))
    .sort((a, b) => b.popularity - a.popularity);
}

let DATASET: Row[] = [
  { id: '1', name: 'Milk', name_el: 'γάλα', name_es: 'leche', calories_per_100g: 42, popularity: 90 },
  { id: '2', name: 'Milk, whole', name_el: null, name_es: 'leche entera', calories_per_100g: 61, popularity: 80 },
  { id: '3', name: 'Cheese, cheddar', name_el: null, name_es: null, calories_per_100g: 400, popularity: 70 },
];

function request(q: string) {
  return new NextRequest(`http://localhost/api/food/search?q=${encodeURIComponent(q)}`, {
    headers: { 'x-forwarded-for': '127.0.0.1' },
  });
}

describe('GET /api/food/search (local branch)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.orFilters.length = 0;
    mocks.requireRole.mockResolvedValue({ session: { userId: 'user-1', role: 'client' } });
    mocks.from.mockImplementation(() => {
      const query = {
        select: () => query,
        order: () => query,
        or: (filter: string) => {
          mocks.orFilters.push(filter);
          return query;
        },
        limit: () => Promise.resolve({ data: selectRows(DATASET, mocks.orFilters[mocks.orFilters.length - 1] ?? ''), error: null }),
      };
      return query;
    });
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({ foods: [] }), { status: 200 }))));
  });

  it('returns the punctuation-named row the literal phrase alone dropped', async () => {
    const response = await GET(request('milk whole'));
    const body = await response.json();

    // `%milk whole%` matches nothing, so the token OR-filter must surface both
    // "Milk" and "Milk, whole" instead of falling through to USDA.
    expect(mocks.orFilters[0]).toBe('name.ilike.%milk whole%,name_el.ilike.%milk whole%,name_es.ilike.%milk whole%');
    expect(mocks.orFilters[1]).toContain('name.ilike.%whole%');
    expect(body.source).toBe('local');
    // "Milk, whole" outranks "Milk" here: it contains both query words, and
    // rankLocalFoods scores token hits.
    expect(body.foods.map((food: { description: string }) => food.description)).toEqual([
      'Milk, whole',
      'Milk',
    ]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns an exact-name row via the phrase query alone', async () => {
    const response = await GET(request('milk'));
    const body = await response.json();

    expect(mocks.orFilters).toHaveLength(1);
    expect(body.foods.map((food: { description: string }) => food.description)).toContain('Milk, whole');
  });

  it('still falls through to USDA when no local row matches', async () => {
    const response = await GET(request('zzzz-nomatch'));

    expect(mocks.orFilters.length).toBeGreaterThan(0);
    expect(fetch).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('supplements a phrase hit with token matches instead of stopping there', async () => {
    const original = DATASET;
    DATASET = [
      ...original,
      { id: '4', name: 'Milk whole', name_el: null, name_es: null, calories_per_100g: 60, popularity: 10 },
    ];
    try {
      const response = await GET(request('milk whole'));
      const body = await response.json();

      // Both queries run: the phrase page holds "Milk whole", the token page
      // adds the punctuation variant. The phrase hit must not suppress recall.
      expect(mocks.orFilters).toHaveLength(2);
      expect(mocks.orFilters[0]).toBe(
        'name.ilike.%milk whole%,name_el.ilike.%milk whole%,name_es.ilike.%milk whole%',
      );
      expect(mocks.orFilters[1]).toContain('name.ilike.%whole%');
      const descriptions = body.foods.map((food: { description: string }) => food.description);
      expect(descriptions).toContain('Milk whole');
      expect(descriptions).toContain('Milk, whole');
      // "Milk whole" matches both queries but is returned once.
      expect(descriptions.filter((name: string) => name === 'Milk whole')).toHaveLength(1);
      expect(body.source).toBe('local');
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      DATASET = original;
    }
  });

  it('skips the token query when it would duplicate the phrase filter', async () => {
    const response = await GET(request('milk'));
    const body = await response.json();

    expect(mocks.orFilters).toHaveLength(1);
    expect(body.source).toBe('local');
  });

  it.each([',()"', '()', ',', '"', '   ,()"  '])(
    'rejects delimiter-only query %j without a DB or provider call',
    async (query) => {
      const response = await GET(request(query));
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.error).toMatch(/searchable/i);
      expect(mocks.from).not.toHaveBeenCalled();
      expect(mocks.orFilters).toHaveLength(0);
      expect(fetch).not.toHaveBeenCalled();
    },
  );
});
