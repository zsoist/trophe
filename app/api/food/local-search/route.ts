import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';
import {
  hasPostgrestSearchText,
  mergePostgrestSearchRows,
  postgrestIlikeOrFilter,
  postgrestTokenTerms,
  sanitizePostgrestIlikeTerm,
} from '@/lib/food/postgrest-search';

const SEARCH_COLUMNS = ['name', 'name_el', 'name_es'];

function parseSearchLimit(raw: string | null): number {
  const normalized = raw?.trim();
  if (!normalized || !/^-?\d+$/.test(normalized)) return 15;
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed)) return 15;
  return Math.min(Math.max(1, parsed), 50);
}

export async function GET(request: NextRequest) {
  // PUBLIC ENDPOINT — intentional. Uses anon key; Supabase RLS on food_database
  // restricts to publicly visible rows only. No auth required for food browsing.
  // Rate-limited below to prevent bulk scraping.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  const rate = await consumeRateLimit(`local-search:${ip}`, 120, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });
  const q = request.nextUrl.searchParams.get('q');
  const safeLim = parseSearchLimit(request.nextUrl.searchParams.get('limit'));

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  // Delimiter-only input (`,()"`) sanitises to empty; building a filter from it
  // would be `ilike.%%` and scan arbitrary rows, so reject before any DB call.
  if (!hasPostgrestSearchText(q)) {
    return NextResponse.json(
      { error: 'Query must contain searchable characters' },
      { status: 400 },
    );
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Config missing' }, { status: 500 });
  }

  // Use anon key for public search — respects RLS, no privilege escalation
  const supabase = createClient(supabaseUrl, anonKey);
  // Escape wildcards and neutralise PostgREST filter delimiters so the query
  // can never terminate or extend the `or=(...)` expression.
  const query = sanitizePostgrestIlikeTerm(q);
  // A single literal phrase misses rows whose stored name interleaves
  // punctuation with the words (e.g. "milk whole" vs the row "Milk, whole"),
  // so also query each word. Terms are escaped up front and bounded to 5.
  const terms = postgrestTokenTerms(q);
  const phraseFilter = postgrestIlikeOrFilter([query], SEARCH_COLUMNS);
  const tokenFilter = terms.length > 0 ? postgrestIlikeOrFilter(terms, SEARCH_COLUMNS) : null;

  // Search across name, name_el, name_es — phrase first, then a supplementary
  // word OR query. The supplement runs even when the phrase already matched
  // (a phrase hit does not imply the punctuation-variant row is present), but
  // is skipped when it would be the same filter, so at most two queries run.
  const phrase = await supabase
    .from('food_database')
    .select('id,name,name_el,name_es,calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,default_serving_grams,default_serving_unit,common_units,popularity')
    .or(phraseFilter)
    .order('popularity', { ascending: false })
    .limit(safeLim);

  if (phrase.error) {
    console.error('Local search error', safeErrorMetadata(phrase.error));
    return NextResponse.json(
      { error: 'Food search temporarily unavailable' },
      { status: 503 },
    );
  }

  let data = phrase.data ?? [];

  if (tokenFilter && tokenFilter !== phraseFilter) {
    const supplement = await supabase
      .from('food_database')
      .select('id,name,name_el,name_es,calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,default_serving_grams,default_serving_unit,common_units,popularity')
      .or(tokenFilter)
      .order('popularity', { ascending: false })
      .limit(safeLim);
    if (supplement.error) {
      // Keep the phrase page rather than failing the whole request: the
      // supplement is recall coverage, not the primary answer.
      console.error('Local search token fallback error', safeErrorMetadata(supplement.error));
    } else {
      data = mergePostgrestSearchRows(data, supplement.data ?? [], safeLim);
    }
  }

  // Map to the format expected by the frontend (same as USDA search)
  const foods = (data || []).map(food => ({
    fdcId: food.id, // use UUID as fdcId for compatibility
    description: food.name,
    name_el: food.name_el,
    name_es: food.name_es,
    calories: food.calories_per_100g,
    protein_g: food.protein_per_100g,
    carbs_g: food.carbs_per_100g,
    fat_g: food.fat_per_100g,
    fiber_g: food.fiber_per_100g,
    servingSize: food.default_serving_grams,
    servingUnit: food.default_serving_unit,
    common_units: food.common_units,
    source: 'local',
  }));

  return NextResponse.json({ foods, source: 'local', count: foods.length });
}
