import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { GREEK_FOODS } from '@/lib/greek-foods-seed';

// Uses service role key for seeding — only accessible to authenticated coaches
export async function POST(request: Request) {
  try {
    const { coachUserId } = await request.json();

    if (!coachUserId) {
      return NextResponse.json({ error: 'coachUserId is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    // If no service key, use the public client (will respect RLS)
    const supabase = supabaseServiceKey
      ? createClient(supabaseUrl, supabaseServiceKey)
      : createClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

    const entries = GREEK_FOODS.map((food) => ({
      created_by: coachUserId,
      name: food.name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      fiber_g: food.fiber_g,
      unit: food.unit,
      category: food.category,
      shared: true,
    }));

    const { data, error } = await supabase
      .from('custom_foods')
      .upsert(entries, { onConflict: 'created_by,name', ignoreDuplicates: true })
      .select();

    if (error) {
      console.error('Seed error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      count: data?.length ?? 0,
      message: `Seeded ${data?.length ?? 0} Greek/Mediterranean foods`,
    });
  } catch (err) {
    console.error('Seed route error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
