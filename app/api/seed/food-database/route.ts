import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { FOOD_SEED } from '@/lib/food-database-seed';

export async function POST() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase config missing' }, { status: 500 });
  }

  // Use service role to bypass RLS for seeding
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const entries = FOOD_SEED.map(food => ({
    name: food.name,
    name_el: food.name_el,
    name_es: food.name_es,
    calories_per_100g: food.calories_per_100g,
    protein_per_100g: food.protein_per_100g,
    carbs_per_100g: food.carbs_per_100g,
    fat_per_100g: food.fat_per_100g,
    fiber_per_100g: food.fiber_per_100g,
    default_serving_grams: food.default_serving_grams,
    default_serving_unit: food.default_serving_unit,
    common_units: food.common_units,
    category: food.category,
    source: 'seed',
    popularity: 10, // base popularity for seed foods
  }));

  // Upsert to avoid duplicates on re-seed
  const { data, error } = await supabase
    .from('food_database')
    .upsert(entries, { onConflict: 'name,source' })
    .select('id');

  if (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    count: data?.length ?? 0,
    message: `Seeded ${data?.length ?? 0} foods into food_database`,
  });
}
