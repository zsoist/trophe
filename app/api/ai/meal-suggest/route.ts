import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/api-guard';

// ─── Types ──────────────────────────────────────────────────────────────────

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
  description?: string;
  ingredients: { item: string; quantity: string }[];
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
}

// ─── Fallbacks (network errors only) ────────────────────────────────────────

const FALLBACK_SUGGESTIONS: MealSuggestion[] = [
  {
    name: 'Grilled Chicken with Rice & Vegetables',
    ingredients: [
      { item: 'Chicken breast', quantity: '150g' },
      { item: 'Brown rice', quantity: '100g cooked' },
      { item: 'Mixed vegetables', quantity: '150g' },
      { item: 'Olive oil', quantity: '1 tsp' },
    ],
    estimated_calories: 420,
    estimated_protein_g: 40,
    estimated_carbs_g: 35,
    estimated_fat_g: 12,
  },
  {
    name: 'Greek Yogurt Protein Bowl',
    ingredients: [
      { item: 'Greek yogurt (2%)', quantity: '200g' },
      { item: 'Banana', quantity: '1 medium' },
      { item: 'Granola', quantity: '30g' },
      { item: 'Honey', quantity: '1 tsp' },
    ],
    estimated_calories: 350,
    estimated_protein_g: 24,
    estimated_carbs_g: 48,
    estimated_fat_g: 8,
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
    estimated_calories: 380,
    estimated_protein_g: 35,
    estimated_carbs_g: 30,
    estimated_fat_g: 14,
  },
];

// ─── Anthropic tool definition ──────────────────────────────────────────────
// tool_choice forces the model to call this tool, guaranteeing JSON schema
// compliance at the decoding layer. No regex extraction needed.

const MEAL_SUGGEST_TOOL = {
  name: 'submit_meal_suggestions',
  description: 'Submit 3 meal suggestions that fit the remaining macros.',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const, description: 'Meal name' },
            description: { type: 'string' as const, description: 'Short description of the meal' },
            ingredients: {
              type: 'array' as const,
              items: {
                type: 'object' as const,
                properties: {
                  item: { type: 'string' as const },
                  quantity: { type: 'string' as const },
                },
                required: ['item', 'quantity'],
              },
            },
            estimated_calories: { type: 'number' as const },
            estimated_protein_g: { type: 'number' as const },
            estimated_carbs_g: { type: 'number' as const },
            estimated_fat_g: { type: 'number' as const },
          },
          required: ['name', 'ingredients', 'estimated_calories', 'estimated_protein_g', 'estimated_carbs_g', 'estimated_fat_g'],
        },
        minItems: 3,
        maxItems: 3,
      },
    },
    required: ['suggestions'],
  },
};

// ─── Validation ─────────────────────────────────────────────────────────────

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

// ─── Route handler ──────────────────────────────────────────────────────────

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error('[meal-suggest] ANTHROPIC_API_KEY not configured');
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

    const systemPrompt = 'You are a sports nutritionist. Suggest practical, delicious meals that fit the client\'s remaining macros for the day. Use the submit_meal_suggestions tool to return your suggestions.';

    const userMessage = `Suggest 3 meal options that fit these remaining macros: ${macroContext}.${preferencesNote}${mealTypeNote}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
        tools: [MEAL_SUGGEST_TOOL],
        tool_choice: { type: 'tool', name: 'submit_meal_suggestions' },
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error(`[meal-suggest] Anthropic API error: ${response.status} — ${errText.slice(0, 200)}`);
      return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    const data = await response.json() as {
      content?: Array<{ type: string; input?: { suggestions?: MealSuggestion[] } }>;
    };

    // tool_choice guarantees a tool_use block — extract the suggestions
    const toolBlock = data?.content?.find((c) => c.type === 'tool_use');
    const suggestions = toolBlock?.input?.suggestions;

    if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
      console.error('[meal-suggest] No suggestions in tool_use response');
      return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
    }

    // Normalize field names for backward compatibility with the client
    // Client expects: calories, protein_g, carbs_g, fat_g
    // Tool returns: estimated_calories, estimated_protein_g, etc.
    const normalized = suggestions.map((s) => ({
      name: s.name,
      description: s.description,
      ingredients: s.ingredients,
      calories: s.estimated_calories,
      protein_g: s.estimated_protein_g,
      carbs_g: s.estimated_carbs_g,
      fat_g: s.estimated_fat_g,
      // Keep estimated_* fields too for future clients
      estimated_calories: s.estimated_calories,
      estimated_protein_g: s.estimated_protein_g,
      estimated_carbs_g: s.estimated_carbs_g,
      estimated_fat_g: s.estimated_fat_g,
    }));

    return NextResponse.json({ suggestions: normalized });
  } catch (error) {
    console.error('[meal-suggest] Error:', error);
    return NextResponse.json({ suggestions: FALLBACK_SUGGESTIONS });
  }
}
