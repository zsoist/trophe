export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/require-role';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { computeBaseline, type ActivityLevel, type Goal, type Sex } from '@/lib/food/calorie-equations';

/**
 * Deterministic calorie/macro baseline for a client (Daily Nutrafit — Michael).
 * Reads the client's body composition and returns a suggested BMR/TDEE + macro
 * split. The coach reviews and applies it in the plan editor (estimates, ±10%).
 *
 * POST { clientId, goal? } → { bmr, tdee, formula, target:{protein_g,carbs_g,fat_g,calories} }
 */
const bodySchema = z.object({
  clientId: z.string().uuid(),
  goal: z.enum(['lose', 'maintain', 'gain']).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const guard = await requireRole(['coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'clientId (uuid) required' }, { status: 400 });
  const { clientId, goal } = parsed.data;
  const userId = guard.session.user.id;
  const isAdmin = guard.session.role === 'admin' || guard.session.role === 'super_admin';

  const service = createSupabaseServiceClient();
  const { data: cp } = await service
    .from('client_profiles')
    .select('coach_id, sex, age, height_cm, weight_kg, body_fat_pct, activity_level')
    .eq('user_id', clientId).maybeSingle();

  if (!cp) return NextResponse.json({ error: 'Client profile not found' }, { status: 404 });
  if (!isAdmin && cp.coach_id !== userId) return NextResponse.json({ error: 'Not your client' }, { status: 403 });

  if (!cp.sex || !cp.age || !cp.height_cm || !cp.weight_kg) {
    return NextResponse.json({ error: 'Missing body data (need sex, age, height, weight)' }, { status: 422 });
  }

  const result = computeBaseline({
    sex: cp.sex as Sex,
    ageYears: cp.age,
    weightKg: cp.weight_kg,
    heightCm: cp.height_cm,
    bodyFatPct: cp.body_fat_pct,
    activity: (cp.activity_level as ActivityLevel) ?? 'moderate',
    goal: (goal as Goal) ?? 'maintain',
  });

  return NextResponse.json(result);
}
