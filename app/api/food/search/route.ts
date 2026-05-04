import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth/require-role';

const USDA_BASE = 'https://api.nal.usda.gov/fdc/v1/foods/search';
const API_KEY = process.env.USDA_API_KEY || 'DEMO_KEY';

// Nutrient IDs from USDA FoodData Central
const NUTRIENT_IDS = {
  ENERGY: 1008,   // kcal
  PROTEIN: 1003,  // g
  CARBS: 1005,    // g
  FAT: 1004,      // g
  FIBER: 1079,    // g
} as const;

interface USDANutrient {
  nutrientId: number;
  nutrientName: string;
  value: number;
  unitName: string;
}

interface USDAFoodItem {
  fdcId: number;
  description: string;
  foodNutrients: USDANutrient[];
  servingSize?: number;
  servingSizeUnit?: string;
}

// ─── Greek translations for common foods ───
const GREEK_FOOD_MAP: Record<string, string> = {
  chicken: 'κοτόπουλο', rice: 'ρύζι', egg: 'αυγό', eggs: 'αυγά',
  milk: 'γάλα', bread: 'ψωμί', cheese: 'τυρί', yogurt: 'γιαούρτι',
  yoghurt: 'γιαούρτι', fish: 'ψάρι', beef: 'βοδινό', potato: 'πατάτα',
  potatoes: 'πατάτες', tomato: 'ντομάτα', tomatoes: 'ντομάτες',
  'olive oil': 'ελαιόλαδο', banana: 'μπανάνα', apple: 'μήλο',
  oats: 'βρώμη', salmon: 'σολομός', tuna: 'τόνος', avocado: 'αβοκάντο',
  almonds: 'αμύγδαλα', spinach: 'σπανάκι', broccoli: 'μπρόκολο',
  carrot: 'καρότο', onion: 'κρεμμύδι', garlic: 'σκόρδο',
  lemon: 'λεμόνι', orange: 'πορτοκάλι', peanut: 'φιστίκι',
  walnuts: 'καρύδια', honey: 'μέλι', cucumber: 'αγγούρι',
  pork: 'χοιρινό', lamb: 'αρνί', turkey: 'γαλοπούλα',
  pasta: 'ζυμαρικά', butter: 'βούτυρο',
};

function getGreekName(description: string): string | null {
  const lower = description.toLowerCase();
  for (const [eng, el] of Object.entries(GREEK_FOOD_MAP)) {
    if (lower.includes(eng)) return el;
  }
  return null;
}

function extractNutrient(nutrients: USDANutrient[], nutrientId: number): number {
  const nutrient = nutrients.find((n) => n.nutrientId === nutrientId);
  return nutrient ? Math.round(nutrient.value * 10) / 10 : 0;
}

function rankLocalFoods(
  foods: Array<Record<string, unknown>>,
  query: string,
  tokens: string[],
): Array<Record<string, unknown>> {
  const q = query.toLowerCase();
  const meaningfulTokens = tokens.filter((token) => !['colombian', 'colombiano', 'colombiana', 'bogota', 'bogotano'].includes(token));

  function score(food: Record<string, unknown>): number {
    const text = `${food.name ?? ''} ${food.name_es ?? ''} ${food.name_el ?? ''}`.toLowerCase();
    const name = String(food.name ?? '').toLowerCase();
    let value = 0;
    if (name === q) value += 1000;
    if (name.includes(q)) value += 500;
    for (const token of meaningfulTokens) {
      if (text.includes(token)) value += 120;
      if (name.includes(token)) value += 80;
    }
    for (const token of tokens) {
      if (text.includes(token)) value += 10;
    }
    value += Number(food.popularity ?? 0) / 100;
    return value;
  }

  return [...foods].sort((a, b) => score(b) - score(a));
}

// Try local food_database first. Auth is checked by the route before this runs.
async function searchLocal(query: string): Promise<{ foods: Record<string, unknown>[]; count: number } | null> {
  const supabase = createSupabaseServiceClient();
  // Sanitize ilike input: escape %, _, and backslash to prevent injection
  const q = query.toLowerCase().replace(/[%_\\]/g, '\\$&');
  const tokens = q
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 3 && !['con', 'una', 'uno', 'the', 'and', 'para'].includes(token))
    .slice(0, 5);

  let { data, error } = await supabase
    .from('food_database')
    .select('*')
    .or(`name.ilike.%${q}%,name_el.ilike.%${q}%,name_es.ilike.%${q}%`)
    .order('popularity', { ascending: false })
    .limit(15);

  if ((!data || data.length === 0) && tokens.length > 0) {
    const tokenFilter = tokens
      .flatMap((token) => [`name.ilike.%${token}%`, `name_el.ilike.%${token}%`, `name_es.ilike.%${token}%`])
      .join(',');
    const fallback = await supabase
      .from('food_database')
      .select('*')
      .or(tokenFilter)
      .order('popularity', { ascending: false })
      .limit(15);
    data = fallback.data;
    error = fallback.error;
  }

  if (error || !data || data.length === 0) return null;
  data = rankLocalFoods(data, q, tokens);

  // Bump popularity for returned results
  const ids = data.map(d => d.id);
  supabase.rpc('increment_food_popularity', { food_ids: ids }).then(() => {});

  const foods = data.map(food => ({
    fdcId: food.id,
    description: food.name,
    name_el: food.name_el,
    name_es: food.name_es,
    calories: food.calories_per_100g,
    protein_g: food.protein_per_100g,
    carbs_g: food.carbs_per_100g,
    fat_g: food.fat_per_100g,
    fiber_g: food.fiber_per_100g ?? 0,
    servingSize: food.default_serving_grams,
    servingUnit: food.default_serving_unit,
    source: 'local',
  }));

  return { foods, count: foods.length };
}

// Cache USDA results into food_database for future local hits
async function cacheUSDAResults(foods: Record<string, unknown>[]) {
  const supabase = createSupabaseServiceClient();

  const entries = foods
    .filter((f: Record<string, unknown>) => (f.calories as number) > 0)
    .slice(0, 5) // cache top 5 results
    .map((f: Record<string, unknown>) => ({
      name: f.description as string,
      name_el: (f.name_el as string) || null,
      calories_per_100g: f.calories as number,
      protein_per_100g: f.protein_g as number,
      carbs_per_100g: f.carbs_g as number,
      fat_per_100g: f.fat_g as number,
      fiber_per_100g: (f.fiber_g as number) || 0,
      default_serving_grams: (f.servingSize as number) || 100,
      default_serving_unit: (f.servingUnit as string) || 'g',
      common_units: [],
      category: 'general',
      source: 'usda',
      source_id: String(f.fdcId),
      popularity: 1,
    }));

  if (entries.length > 0) {
    await supabase
      .from('food_database')
      .upsert(entries, { onConflict: 'name,source', ignoreDuplicates: true });
  }
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireRole(['client', 'coach', 'admin', 'super_admin'], { request });
    if (guard instanceof NextResponse) return guard;

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { foods: [], error: 'Query parameter "q" is required' },
        { status: 400 },
      );
    }

    // Step 1: Try local database first
    const local = await searchLocal(q.trim());
    if (local && local.count >= 3) {
      return NextResponse.json({ foods: local.foods, source: 'local' });
    }

    if (local && local.count > 0) {
      return NextResponse.json({ foods: local.foods, source: 'local' });
    }

    // Step 2: Fall back to USDA API (key sent server-side only — never in client URLs)
    const params = new URLSearchParams({
      query: q,
      pageSize: '15',
      dataType: 'Foundation,SR Legacy',
      api_key: API_KEY,
    });
    const url = `${USDA_BASE}?${params.toString()}`;

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error(`USDA API error: ${response.status} ${response.statusText}`);
      // If USDA fails but we have some local results, return those
      if (local && local.count > 0) {
        return NextResponse.json({ foods: local.foods, source: 'local_partial' });
      }
      return NextResponse.json(
        { foods: [], error: 'Food database temporarily unavailable' },
        { status: 502 },
      );
    }

    const data = await response.json();
    const foods = (data.foods || []).map((item: USDAFoodItem) => ({
      fdcId: item.fdcId,
      description: item.description,
      name_el: getGreekName(item.description),
      calories: extractNutrient(item.foodNutrients, NUTRIENT_IDS.ENERGY),
      protein_g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.PROTEIN),
      carbs_g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.CARBS),
      fat_g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.FAT),
      fiber_g: extractNutrient(item.foodNutrients, NUTRIENT_IDS.FIBER),
      servingSize: item.servingSize ?? 100,
      servingUnit: item.servingSizeUnit ?? 'g',
    }));

    // Step 3: Cache USDA results locally (fire and forget)
    cacheUSDAResults(foods).catch(() => {});

    // Merge: local results first, then USDA
    const merged = local && local.count > 0
      ? [...local.foods, ...foods]
      : foods;

    return NextResponse.json({ foods: merged, source: local ? 'hybrid' : 'usda' });
  } catch (error) {
    console.error('Food search error:', error);
    return NextResponse.json(
      { foods: [], error: 'Search failed — please try again' },
      { status: 500 },
    );
  }
}
