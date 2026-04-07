import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q');
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '15');

  if (!q || q.trim().length === 0) {
    return NextResponse.json({ error: 'Query parameter "q" is required' }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Config missing' }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const query = q.trim().toLowerCase();

  // Strategy: try exact ilike first, then full-text search
  // Search across name, name_el, name_es
  const { data, error } = await supabase
    .from('food_database')
    .select('*')
    .or(`name.ilike.%${query}%,name_el.ilike.%${query}%,name_es.ilike.%${query}%`)
    .order('popularity', { ascending: false })
    .limit(limit);

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
