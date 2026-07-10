export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireRole } from '@/lib/auth/require-role';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { canAccessClient } from '@/lib/auth/tenant-access';
import { db } from '@/db/client';
import { run as parseFood } from '@/agents/food-parse';
import { consumeRateLimit } from '@/lib/security/durable-rate-limit';

// Cap the distinct meals parsed per call — one DeepSeek call each, so an
// oversized plan (or an abusive caller) can't fan out unbounded LLM cost.
const MAX_UNIQUE_MEALS = 80;

/**
 * Per-day meal-plan macro rollup (Daily Nutrafit — "the app counts for me").
 * Reads the client's meal_plan_entries, parses each DISTINCT meal description
 * through the full DB-grounded food-parse pipeline (most accurate path), then
 * sums per day-of-week and returns daily totals vs the client's targets.
 *
 * POST { clientId } → { days: [{day, kcal, protein, carbs, fat, slots}], targets }
 *
 * On-demand (coach clicks "Macros") rather than on-load — each unique meal is
 * one DeepSeek call, so we dedupe hard and parse with bounded concurrency.
 */
const bodySchema = z.object({ clientId: z.string().uuid() }).strict();

interface MacroSum { kcal: number; protein: number; carbs: number; fat: number; }
const ZERO: MacroSum = { kcal: 0, protein: 0, carbs: 0, fat: 0 };

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

  // requireRole does no rate limiting (unlike guardAiRoute) — this route fans
  // out one DeepSeek call per distinct meal, so bound it: 20 rollups / 10 min.
  const rate = await consumeRateLimit(`meal-macros:${userId}`, 20, 600);
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
    return NextResponse.json({ days: [], targets: profile ?? null, mealCount: 0 });
  }

  // Parse each DISTINCT description once (a meal repeated across days costs one
  // call), capped so one request can't trigger an unbounded LLM fan-out.
  const uniqueDescriptions = Array.from(new Set(cells.map((c) => c.description.trim()))).slice(0, MAX_UNIQUE_MEALS);
  const parsedByDesc = new Map<string, MacroSum>();
  await mapPool(uniqueDescriptions, 4, async (desc) => {
    try {
      const result = await parseFood({ text: desc }, { userId });
      const items = result.ok ? (result.output?.items ?? []) : [];
      const sum = items.reduce<MacroSum>((acc, it) => ({
        kcal: acc.kcal + (it.calories || 0),
        protein: acc.protein + (it.protein_g || 0),
        carbs: acc.carbs + (it.carbs_g || 0),
        fat: acc.fat + (it.fat_g || 0),
      }), { ...ZERO });
      parsedByDesc.set(desc, sum);
    } catch {
      parsedByDesc.set(desc, { ...ZERO });
    }
  });

  // Sum per day-of-week (0..6) across that day's slots.
  const dayTotals = new Map<number, MacroSum & { slots: number }>();
  for (const cell of cells) {
    const m = parsedByDesc.get(cell.description.trim()) ?? ZERO;
    const d = dayTotals.get(cell.day_of_week) ?? { ...ZERO, slots: 0 };
    dayTotals.set(cell.day_of_week, {
      kcal: d.kcal + m.kcal, protein: d.protein + m.protein,
      carbs: d.carbs + m.carbs, fat: d.fat + m.fat, slots: d.slots + 1,
    });
  }

  const r1 = (n: number) => Math.round(n);
  const days = Array.from(dayTotals.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([day, t]) => ({
      day, slots: t.slots,
      kcal: r1(t.kcal), protein: r1(t.protein), carbs: r1(t.carbs), fat: r1(t.fat),
    }));

  return NextResponse.json({
    days,
    targets: profile ? {
      kcal: profile.target_calories ?? null,
      protein: profile.target_protein_g ?? null,
      carbs: profile.target_carbs_g ?? null,
      fat: profile.target_fat_g ?? null,
    } : null,
    mealCount: cells.length,
  });
}
