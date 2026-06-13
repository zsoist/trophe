import { NextResponse } from 'next/server';
import { GREEK_FOODS } from '@/lib/greek-foods-seed';
import { requireSuperAdmin } from '@/lib/server-admin';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  try {
    // Service-role write that can target ANY coach's custom_foods — restrict to
    // super_admin and validate the target is a real coach (audit 2026-06-13:
    // previously any admin could impersonate an arbitrary coachUserId).
    const guard = await requireSuperAdmin();
    if (guard instanceof NextResponse) return guard;

    const { session } = guard;
    const serviceSupabase = createSupabaseServiceClient();
    const profile = session.profile;

    const body = (await request.json().catch(() => ({}))) as { coachUserId?: string };
    const requestedCoachId = body.coachUserId?.trim();
    let targetCoachUserId = session.user.id;
    if (requestedCoachId && requestedCoachId !== session.user.id) {
      const { data: target } = await serviceSupabase
        .from('profiles')
        .select('id, role')
        .eq('id', requestedCoachId)
        .maybeSingle();
      if (!target || !['coach', 'admin', 'super_admin'].includes(target.role)) {
        return NextResponse.json({ error: 'coachUserId must be an existing coach' }, { status: 400 });
      }
      targetCoachUserId = requestedCoachId;
    }
    const foodNames = GREEK_FOODS.map((food) => food.name);

    const { data: existingRows, error: existingError } = await serviceSupabase
      .from('custom_foods')
      .select('name')
      .eq('created_by', targetCoachUserId)
      .in('name', foodNames);

    if (existingError) {
      console.error('Seed preflight error:', existingError);
      return NextResponse.json({ error: 'Seed preflight failed' }, { status: 500 });
    }

    const existingNames = new Set((existingRows || []).map((row) => row.name));

    const entries = GREEK_FOODS
      .filter((food) => !existingNames.has(food.name))
      .map((food) => ({
      created_by: targetCoachUserId,
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

    let insertedRows: { id: string }[] = [];
    if (entries.length > 0) {
      const { data, error } = await serviceSupabase
        .from('custom_foods')
        .insert(entries)
        .select('id');

      if (error) {
        console.error('Seed error:', error);
        return NextResponse.json({ error: 'Seed operation failed' }, { status: 500 });
      }

      insertedRows = data || [];
    }

    return NextResponse.json({
      success: true,
      count: existingNames.size + insertedRows.length,
      inserted: insertedRows.length,
      skippedExisting: existingNames.size,
      message: `Seeded ${insertedRows.length} Greek/Mediterranean foods`,
      seededFor: targetCoachUserId,
      seededBy: profile.email,
    });
  } catch (error) {
    console.error('Seed route error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
