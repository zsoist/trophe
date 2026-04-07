import { NextRequest, NextResponse } from 'next/server';

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
  chicken: 'κοτόπουλο',
  rice: 'ρύζι',
  egg: 'αυγό',
  eggs: 'αυγά',
  milk: 'γάλα',
  bread: 'ψωμί',
  cheese: 'τυρί',
  yogurt: 'γιαούρτι',
  yoghurt: 'γιαούρτι',
  fish: 'ψάρι',
  beef: 'βοδινό',
  potato: 'πατάτα',
  potatoes: 'πατάτες',
  tomato: 'ντομάτα',
  tomatoes: 'ντομάτες',
  'olive oil': 'ελαιόλαδο',
  banana: 'μπανάνα',
  apple: 'μήλο',
  oats: 'βρώμη',
  oatmeal: 'βρώμη',
  salmon: 'σολομός',
  tuna: 'τόνος',
  avocado: 'αβοκάντο',
  almond: 'αμύγδαλο',
  almonds: 'αμύγδαλα',
  spinach: 'σπανάκι',
  broccoli: 'μπρόκολο',
  carrot: 'καρότο',
  carrots: 'καρότα',
  onion: 'κρεμμύδι',
  garlic: 'σκόρδο',
  lemon: 'λεμόνι',
  orange: 'πορτοκάλι',
  peanut: 'φιστίκι',
  peanuts: 'φιστίκια',
  walnut: 'καρύδι',
  walnuts: 'καρύδια',
  honey: 'μέλι',
  cucumber: 'αγγούρι',
  pork: 'χοιρινό',
  lamb: 'αρνί',
  turkey: 'γαλοπούλα',
  pasta: 'ζυμαρικά',
  butter: 'βούτυρο',
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q');

    if (!q || q.trim().length === 0) {
      return NextResponse.json(
        { foods: [], error: 'Query parameter "q" is required' },
        { status: 400 },
      );
    }

    const url = `${USDA_BASE}?query=${encodeURIComponent(q)}&pageSize=15&dataType=Foundation,SR%20Legacy&api_key=${API_KEY}`;

    const response = await fetch(url, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      console.error(`USDA API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ foods: [] });
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
      servingSizeUnit: item.servingSizeUnit ?? 'g',
    }));

    return NextResponse.json({ foods });
  } catch (error) {
    console.error('Food search error:', error);
    return NextResponse.json({ foods: [] });
  }
}
