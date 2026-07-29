export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/require-role';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { canAccessClient } from '@/lib/auth/tenant-access';
import { db } from '@/db/client';
import { run as parseFood } from '@/agents/food-parse';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';
import {
  MAX_MEAL_PLAN_UNIQUE_DESCRIPTIONS,
  type MealPlanMacroResult,
  type MealPlanMacroSum,
  buildMealPlanDayTotals,
  createMealPlanMacroBudget,
} from './core';

/**
 * Per-day meal-plan macro rollup (Daily Nutrafit — "the app counts for me").
 * Reads the client's meal_plan_entries, parses each DISTINCT meal description
 * through the full DB-grounded food-parse pipeline (most accurate path), then
 * sums per day-of-week and returns daily totals vs the client's targets.
 *
 * POST { clientId } → { days: [{day, kcal, protein, carbs, fat, slots}], targets }
 *
 * On-demand (coach clicks "Macros") rather than on-load. Descriptions are
 * deduplicated, parsed with bounded concurrency, and share one hard route-wide
 * transport/deadline budget.
 */
const bodySchema = z.object({ clientId: z.string().uuid() }).strict();

const ZERO: MealPlanMacroSum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

async function mapPool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]); }
  });
  await Promise.all(workers);
  return out;
}

export async function POST(request: NextRequest) {
  const budget = createMealPlanMacroBudget();
  const guard = await requireRole(['coach', 'admin', 'super_admin'], { request });
  if (guard instanceof NextResponse) return guard;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'clientId (uuid) required' }, { status: 400 });
  const { clientId } = parsed.data;
  const userId = guard.session.user.id;

  // Org-aware ownership (was a blanket admin bypass = cross-tenant IDOR +
  // cross-tenant LLM cost abuse).
  if (!(await canAccessClient(db, userId, guard.session.role, clientId))) {
    return NextResponse.json({ error: 'Not your client' }, { status: 403 });
  }

  // requireRole does no rate limiting (unlike guardAiRoute). Five manual
  // rollups per ten minutes supports retries without allowing cost-amplifying
  // click loops.
  const rate = await consumeRateLimit(`meal-macros:${userId}`, 5, 600);
  if (!rate.allowed) {
    return NextResponse.json(
      { error: 'Too many macro rollups — please try again shortly' },
      { status: 429, headers: { 'Retry-After': String(rate.retryAfter) } },
    );
  }

  const service = createSupabaseServiceClient();

  const [{ data: rows }, { data: profile }] = await Promise.all([
    service.from('meal_plan_entries').select('day_of_week, meal_slot, description').eq('client_id', clientId),
    service.from('client_profiles')
      .select('target_calories, target_protein_g, target_carbs_g, target_fat_g')
      .eq('user_id', clientId).maybeSingle(),
  ]);

  const cells = (rows ?? []).filter((r) => (r.description ?? '').trim().length > 0);
  if (cells.length === 0) {
    return NextResponse.json({
      days: [],
      targets: profile ?? null,
      mealCount: 0,
      parsedMealCount: 0,
      failedMealCount: 0,
      complete: true,
    });
  }

  // The schema allows seven days × five slots = 35 cells. Keep that invariant
  // explicit and mark anything beyond the bound incomplete instead of silently
  // treating an unparsed meal as zero nutrition.
  const allUniqueDescriptions = Array.from(new Set(cells.map((c) => c.description.trim())));
  const uniqueDescriptions = allUniqueDescriptions.slice(0, MAX_MEAL_PLAN_UNIQUE_DESCRIPTIONS);
  const parsedByDesc = new Map<string, MealPlanMacroResult>();
  await mapPool(uniqueDescriptions, 4, async (desc) => {
    if (!budget.canStartParse()) {
      parsedByDesc.set(desc, { ok: false, sum: { ...ZERO } });
      return;
    }

    try {
      const result = await parseFood(
        { text: desc },
        { userId, beforeTransportAttempt: budget.beforeTransportAttempt },
      );
      const items = result.ok ? (result.output?.items ?? []) : [];
      const sum = items.reduce<MealPlanMacroSum>((acc, it) => ({
        kcal: acc.kcal + (it.calories || 0),
        protein: acc.protein + (it.protein_g || 0),
        carbs: acc.carbs + (it.carbs_g || 0),
        fat: acc.fat + (it.fat_g || 0),
      }), { ...ZERO });
      parsedByDesc.set(desc, { ok: result.ok && items.length > 0, sum });
    } catch {
      parsedByDesc.set(desc, { ok: false, sum: { ...ZERO } });
    }
  });

  const days = buildMealPlanDayTotals(cells, parsedByDesc);
  const parsedMealCount = allUniqueDescriptions.filter(
    (description) => parsedByDesc.get(description)?.ok === true,
  ).length;
  const failedMealCount = allUniqueDescriptions.length - parsedMealCount;

  return NextResponse.json({
    days,
    targets: profile ? {
      kcal: profile.target_calories ?? null,
      protein: profile.target_protein_g ?? null,
      carbs: profile.target_carbs_g ?? null,
      fat: profile.target_fat_g ?? null,
    } : null,
    mealCount: cells.length,
    parsedMealCount,
    failedMealCount,
    complete: failedMealCount === 0,
  });
}
