import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/api-guard';

interface MealSuggestRequest {
  remaining_calories: number;
  remaining_protein_g: number;
  remaining_carbs_g: number;
  remaining_fat_g: number;
  preferences?: string;
  meal_type?: string;
}

interface MealSuggestion {
  name: string;
  ingredients: { item: string; quantity: string }[];
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
}

const FALLBACK_SUGGESTIONS: MealSuggestion[] = [
  {
    name: 'Grilled Chicken with Rice & Vegetables',
    ingredients: [
      { item: 'Chicken breast', quantity: '150g' },
      { item: 'Brown rice', quantity: '100g cooked' },
      { item: 'Mixed vegetables', quantity: '150g' },
      { item: 'Olive oil', quantity: '1 tsp' },
    ],
    calories: 420,
    protein_g: 40,
    carbs_g: 35,
    fat_g: 12,
  },
  {
    name: 'Greek Yogurt Protein Bowl',
    ingredients: [
      { item: 'Greek yogurt (2%)', quantity: '200g' },
      { item: 'Banana', quantity: '1 medium' },
      { item: 'Granola', quantity: '30g' },
      { item: 'Honey', quantity: '1 tsp' },
    ],
    calories: 350,
    protein_g: 24,
    carbs_g: 48,
    fat_g: 8,
  },
  {
    name: 'Tuna Salad Wrap',
    ingredients: [
      { item: 'Canned tuna', quantity: '120g' },
      { item: 'Whole wheat tortilla', quantity: '1 large' },
      { item: 'Mixed greens', quantity: '50g' },
      { item: 'Avocado', quantity: '1/4' },
      { item: 'Lemon juice', quantity: '1 tbsp' },
    ],
    calories: 380,
    protein_g: 35,
    carbs_g: 30,
    fat_g: 14,
  },
];

function validateInput(body: unknown): { valid: true; data: MealSuggestRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.remaining_calories !== 'number' || b.remaining_calories < 0) {
    return { valid: false, error: 'remaining_calories must be a non-negative number' };
  }
  if (typeof b.remaining_protein_g !== 'number' || b.remaining_protein_g < 0) {
    return { valid: false, error: 'remaining_protein_g must be a non-negative number' };
  }
  if (typeof b.remaining_carbs_g !== 'number' || b.remaining_carbs_g < 0) {
    return { valid: false, error: 'remaining_carbs_g must be a non-negative number' };
  }
  if (typeof b.remaining_fat_g !== 'number' || b.remaining_fat_g < 0) {
    return { valid: false, error: 'remaining_fat_g must be a non-negative number' };
  }

  return { valid: true, data: b as unknown as MealSuggestRequest };
}

function extractJSON(text: string): MealSuggestion[] | null {
  // Try to extract JSON array from the response text
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // JSON parse failed
  }
  return null;
}

export async function POST(request: NextRequest) {
  const block = guardAiRoute(request);
  if (block) return block;

  try {
    const body = await request.json();
    const validation = validateInput(body);

    if (!validation.valid) {
      return NextResponse.json(
        { error: validation.error },
        { status: 400 },
      );
    }

    const { remaining_calories, remaining_protein_g, remaining_carbs_g, remaining_fat_g, preferences, meal_type } = validation.data;

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('GEMINI_API_KEY not configured');
      return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    const macroContext = [
      `Calories: ${remaining_calories} kcal`,
      `Protein: ${remaining_protein_g}g`,
      `Carbs: ${remaining_carbs_g}g`,
      `Fat: ${remaining_fat_g}g`,
    ].join(', ');

    // Sanitize user inputs to prevent prompt injection
    const safePreferences = preferences ? preferences.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : '';
    const safeMealType = meal_type ? meal_type.slice(0, 30).replace(/[\x00-\x1F\x7F]/g, '') : '';
    const preferencesNote = safePreferences ? ` Dietary preferences: ${safePreferences}.` : '';
    const mealTypeNote = safeMealType ? ` This is for: ${safeMealType}.` : '';

    const prompt = `You are a sports nutritionist. Suggest 3 meal options that fit these remaining macros: ${macroContext}.${preferencesNote}${mealTypeNote} Each meal should include: name, ingredients with quantities, total calories, protein_g, carbs_g, fat_g. Format as JSON array with objects having keys: name, ingredients (array of {item, quantity}), calories, protein_g, carbs_g, fat_g. Keep it practical and delicious. Return ONLY the JSON array, no other text.`;

    // Use header-based auth instead of URL query param (key in URL appears in logs)
    const geminiUrl = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 2048,
        },
      }),
    });

    if (!response.ok) {
      console.error(`Gemini API error: ${response.status} ${response.statusText}`);
      return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    const data = await response.json();
    const textContent = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textContent) {
      console.error('No text content in Gemini response');
      return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    const suggestions = extractJSON(textContent);

    if (!suggestions || suggestions.length === 0) {
      console.error('Could not parse meal suggestions from Gemini response');
      return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Meal suggestion error:', error);
    return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
  }
}
