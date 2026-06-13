export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAiRoute } from '@/lib/security/api-guard';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

/**
 * Barcode → macros lookup (Open Food Facts leverage, Daily Nutrafit).
 * 1. Check our own `foods` table by barcode (free, instant — we already hold 21k OFF rows).
 * 2. On miss, query Open Food Facts v2 product API (server-side → no client CSP impact),
 *    normalize per-100g macros, and cache the row into `foods` (source='off',
 *    data_quality='crowdsourced') so the next scan is a DB hit.
 *
 * OFF data is ODbL — attributed on /trust. Crowdsourced → treated as an estimate,
 * never lab-verified; the client still confirms grams before logging.
 *
 * POST { barcode } → { found, name, brand, barcode, per100g:{kcal,protein,carbs,fat,fiber,sugar}, source }
 */
const bodySchema = z.object({ barcode: z.string().regex(/^\d{8,14}$/) }).strict();

const OFF_TIMEOUT_MS = 6000;
const r1 = (n: number) => Math.round(n * 10) / 10;

interface Per100g { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null; sugar: number | null; }

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: 'Valid barcode (8–14 digits) required' }, { status: 400 });
  const { barcode } = parsed.data;

  const service = createSupabaseServiceClient();

  // 1) Our DB first.
  const { data: hit } = await service
    .from('foods')
    .select('name_en, brand, barcode, kcal_per_100g, protein_per_100g, carb_per_100g, fat_per_100g, fiber_per_100g, sugar_per_100g')
    .eq('barcode', barcode)
    .limit(1)
    .maybeSingle();

  if (hit) {
    return NextResponse.json({
      found: true, name: hit.name_en, brand: hit.brand, barcode, source: 'db',
      per100g: { kcal: hit.kcal_per_100g, protein: hit.protein_per_100g, carbs: hit.carb_per_100g, fat: hit.fat_per_100g, fiber: hit.fiber_per_100g, sugar: hit.sugar_per_100g } as Per100g,
    });
  }

  // 2) Open Food Facts v2 product lookup.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), OFF_TIMEOUT_MS);
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=product_name,product_name_en,brands,nutriments`,
      { signal: ctrl.signal, headers: { 'User-Agent': 'Trophe/1.0 (https://trophe.app)' } },
    );
    clearTimeout(timer);
    const data = (await res.json().catch(() => ({}))) as {
      status?: number; product?: { product_name?: string; product_name_en?: string; brands?: string; nutriments?: Record<string, number> };
    };

    const p = data.product;
    const n = p?.nutriments;
    if (data.status !== 1 || !p || !n) {
      return NextResponse.json({ found: false, barcode, error: 'Not found in Open Food Facts' }, { status: 404 });
    }

    // Prefer kcal; fall back to kJ → kcal (÷4.184).
    const kcal = typeof n['energy-kcal_100g'] === 'number' ? n['energy-kcal_100g']
      : typeof n['energy_100g'] === 'number' ? n['energy_100g'] / 4.184 : NaN;
    if (!isFinite(kcal) || kcal <= 0) {
      return NextResponse.json({ found: false, barcode, error: 'No nutrition data on this product' }, { status: 404 });
    }

    const per100g: Per100g = {
      kcal: Math.round(kcal),
      protein: r1(n['proteins_100g'] ?? 0),
      carbs: r1(n['carbohydrates_100g'] ?? 0),
      fat: r1(n['fat_100g'] ?? 0),
      fiber: typeof n['fiber_100g'] === 'number' ? r1(n['fiber_100g']) : null,
      sugar: typeof n['sugars_100g'] === 'number' ? r1(n['sugars_100g']) : null,
    };
    const name = (p.product_name_en || p.product_name || 'Unknown product').slice(0, 200);
    const brand = (p.brands || '').split(',')[0]?.trim().slice(0, 120) || null;

    // Cache for next time (idempotent on the source+source_id unique constraint).
    await service.from('foods').insert({
      source: 'off', source_id: barcode, barcode, data_quality: 'crowdsourced',
      name_en: name, brand,
      kcal_per_100g: per100g.kcal, protein_per_100g: per100g.protein,
      carb_per_100g: per100g.carbs, fat_per_100g: per100g.fat,
      fiber_per_100g: per100g.fiber, sugar_per_100g: per100g.sugar,
      provenance_notes: 'Open Food Facts (ODbL), live barcode lookup',
    }).then(() => undefined, () => undefined); // best-effort cache; ignore conflict/errors

    return NextResponse.json({ found: true, name, brand, barcode, source: 'off', per100g });
  } catch {
    return NextResponse.json({ found: false, barcode, error: 'Open Food Facts unavailable' }, { status: 502 });
  }
}
