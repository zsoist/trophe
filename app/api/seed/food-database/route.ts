import { NextResponse } from 'next/server';
import { FOOD_SEED } from '@/lib/food-database-seed';
import { requireAdmin } from '@/lib/server-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const guard = await requireAdmin();
    if (guard instanceof NextResponse) return guard;

    const { session } = guard;
    const serviceSupabase = createSupabaseServiceClient();
    const profile = session.profile;

    const entries = FOOD_SEED.map((food) => ({
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
      popularity: 10,
    }));

    const { data, error } = await serviceSupabase
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
      seededBy: profile.email,
    });
  } catch (error) {
    console.error('Seed route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
