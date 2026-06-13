import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';

export async function GET(request: NextRequest) {
  // PUBLIC ENDPOINT — intentional. Uses anon key; Supabase RLS on food_database
  // restricts to publicly visible rows only. No auth required for food browsing.
  // Rate-limited below to prevent bulk scraping.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? request.headers.get('x-real-ip') ?? 'unknown';
  const rate = await consumeRateLimit(`local-search:${ip}`, 120, 3600);
  if (!rate.allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } });
  const q = request.nextUrl.searchParams.get('q');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '15');

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return NextResponse.json({ error: 'Config missing' }, { status: 500 });
  }

  // Use anon key for public search — respects RLS, no privilege escalation
  const supabase = createClient(supabaseUrl, anonKey);
  // Sanitize ilike input: escape %, _, and backslash to prevent injection
  const query = q.trim().toLowerCase().replace(/[%_\\]/g, '\\$&');
  // Clamp limit to prevent table dumps
  const safeLim = Math.min(Math.max(1, limit), 50);

  // Search across name, name_el, name_es
  const { data, error } = await supabase
    .from('food_database')
    .select('id,name,name_el,name_es,calories_per_100g,protein_per_100g,carbs_per_100g,fat_per_100g,fiber_per_100g,default_serving_grams,default_serving_unit,common_units,popularity')
    .or(`name.ilike.%${query}%,name_el.ilike.%${query}%,name_es.ilike.%${query}%`)
    .order('popularity', { ascending: false })
    .limit(safeLim);

  if (error) {
    console.error('Local search error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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
