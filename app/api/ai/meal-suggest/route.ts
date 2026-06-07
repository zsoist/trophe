export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/api-guard';
import { executeAiTask } from '@/agents/runtime';
import { invokeAnthropicJson } from '@/agents/runtime/providers/anthropic';

// ── Types ───────────────────────────────────────────────────────────────────

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
  description: string;
  ingredients: string[];
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
}

// ── Fallbacks (network error only — tool_choice prevents parse failures) ────

const FALLBACK_SUGGESTIONS: MealSuggestion[] = [
  {
    name: 'Grilled Chicken with Rice & Vegetables',
    description: 'A balanced meal with lean protein, complex carbs, and fiber.',
    ingredients: ['150g chicken breast', '100g cooked brown rice', '150g mixed vegetables', '1 tsp olive oil'],
    estimated_calories: 420,
    estimated_protein_g: 40,
    estimated_carbs_g: 35,
    estimated_fat_g: 12,
  },
  {
    name: 'Greek Yogurt Protein Bowl',
    description: 'Quick and satisfying, with natural protein and slow carbs.',
    ingredients: ['200g Greek yogurt (2%)', '1 medium banana', '30g granola', '1 tsp honey'],
    estimated_calories: 350,
    estimated_protein_g: 24,
    estimated_carbs_g: 48,
    estimated_fat_g: 8,
  },
  {
    name: 'Tuna Salad Wrap',
    description: 'High protein wrap with healthy fats from avocado.',
    ingredients: ['120g canned tuna', '1 large whole wheat tortilla', '50g mixed greens', '1/4 avocado', '1 tbsp lemon juice'],
    estimated_calories: 380,
    estimated_protein_g: 35,
    estimated_carbs_g: 30,
    estimated_fat_g: 14,
  },
];

// ── Tool schema for Anthropic tool_use ──────────────────────────────────────

const MEAL_SUGGEST_TOOL = {
  name: 'submit_meal_suggestions',
  description: 'Submit 3 meal suggestions matching the macro budget',
  input_schema: {
    type: 'object' as const,
    properties: {
      suggestions: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
            description: { type: 'string' as const },
            ingredients: { type: 'array' as const, items: { type: 'string' as const } },
            estimated_calories: { type: 'number' as const },
            estimated_protein_g: { type: 'number' as const },
            estimated_carbs_g: { type: 'number' as const },
            estimated_fat_g: { type: 'number' as const },
          },
          required: [
            'name', 'description', 'ingredients',
            'estimated_calories', 'estimated_protein_g',
            'estimated_carbs_g', 'estimated_fat_g',
          ],
        },
      },
    },
    required: ['suggestions'],
  },
};

const SYSTEM_PROMPT = `You are a sports nutritionist. Given a client's remaining macro budget for the day, suggest 3 practical, delicious meal options that fit within the budget. Each suggestion should include a name, brief description, ingredients list with approximate quantities, and estimated macros. Be realistic with portions and calorie estimates.`;

// ── Input validation ────────────────────────────────────────────────────────

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

// ── Route handler ───────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

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
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { error: 'Meal suggestion service is unavailable', suggestions: FALLBACK_SUGGESTIONS },
        { status: 503 },
      );
    }

    // Build user message
    const macroContext = [
      `Calories: ${remaining_calories} kcal`,
      `Protein: ${remaining_protein_g}g`,
      `Carbs: ${remaining_carbs_g}g`,
      `Fat: ${remaining_fat_g}g`,
    ].join(', ');

    const safePreferences = preferences ? preferences.slice(0, 100).replace(/[\x00-\x1F\x7F]/g, '') : '';
    const safeMealType = meal_type ? meal_type.slice(0, 30).replace(/[\x00-\x1F\x7F]/g, '') : '';
    const preferencesNote = safePreferences ? ` Dietary preferences: ${safePreferences}.` : '';
    const mealTypeNote = safeMealType ? ` This is for: ${safeMealType}.` : '';

    const userMessage = `Remaining macro budget: ${macroContext}.${preferencesNote}${mealTypeNote} Suggest 3 meal options.`;

    const result = await executeAiTask({
      task: 'meal_suggest',
      prompt: userMessage,
      systemPrompt: SYSTEM_PROMPT,
      context: { userId: guard.userId, requestId: request.headers.get('x-request-id') ?? undefined },
      invoke: ({ policy, signal }) => invokeAnthropicJson({
        signal,
        body: {
          model: policy.model,
          max_tokens: policy.maxTokens,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userMessage }],
          tools: [MEAL_SUGGEST_TOOL],
          tool_choice: { type: 'tool', name: 'submit_meal_suggestions' },
        },
      }),
    });
    const data = result.output as {
      content: Array<{ type: string; name?: string; input?: { suggestions?: MealSuggestion[] } }>;
    };

    const toolUse = data.content.find(c => c.type === 'tool_use' && c.name === 'submit_meal_suggestions');
    const suggestions = toolUse?.input?.suggestions;

    if (!suggestions || suggestions.length === 0) {
      console.error('No suggestions in tool_use response');
      return NextResponse.json(
        { error: 'No AI suggestions returned', suggestions: FALLBACK_SUGGESTIONS },
        { status: 502 },
      );
    }

    return NextResponse.json({ suggestions });
  } catch (error) {
    console.error('Meal suggestion error:', error);
    return NextResponse.json(
      { error: 'Meal suggestion provider failed', suggestions: FALLBACK_SUGGESTIONS },
      { status: 502 },
    );
  }
}
