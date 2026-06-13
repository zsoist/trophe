import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/security/api-guard';
import { executeAiTask } from '@/agents/runtime';
import { invokeAnthropicJson } from '@/agents/runtime/providers/anthropic';

interface PhotoAnalyzeRequest {
  imageBase64: string;
  mediaType: string;
}

interface FoodAnalysis {
  name: string;
  estimated_grams: number;
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
  confidence: number;
  source?: 'ai_estimate';
  accuracy_note?: string;
}

const PHOTO_ANALYZE_TOOL = {
  name: 'submit_food_photo_analysis',
  description: 'Submit conservative nutrition estimates for visible foods in a photo.',
  input_schema: {
    type: 'object' as const,
    properties: {
      foods: {
        type: 'array' as const,
        items: {
          type: 'object' as const,
          properties: {
            name: { type: 'string' as const },
            estimated_grams: { type: 'number' as const },
            estimated_calories: { type: 'number' as const },
            estimated_protein_g: { type: 'number' as const },
            estimated_carbs_g: { type: 'number' as const },
            estimated_fat_g: { type: 'number' as const },
            confidence: { type: 'number' as const },
            source: { type: 'string' as const, enum: ['ai_estimate'] },
            accuracy_note: { type: 'string' as const },
          },
          required: [
            'name',
            'estimated_grams',
            'estimated_calories',
            'estimated_protein_g',
            'estimated_carbs_g',
            'estimated_fat_g',
            'confidence',
            'source',
            'accuracy_note',
          ],
        },
      },
    },
    required: ['foods'],
  },
};

function validateInput(body: unknown): { valid: true; data: PhotoAnalyzeRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.imageBase64 !== 'string' || b.imageBase64.length === 0) {
    return { valid: false, error: 'imageBase64 is required and must be a non-empty string' };
  }

  // Base64 uses four characters per three binary bytes. Keep decoded uploads
  // at or below 5MB after client-side resizing/transcoding.
  const maxBase64Length = Math.ceil((5 * 1024 * 1024) / 3) * 4;
  if (b.imageBase64.length > maxBase64Length) {
    return { valid: false, error: 'Image too large after compression — maximum 5MB' };
  }

  const validMediaTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
  if (typeof b.mediaType !== 'string' || !validMediaTypes.includes(b.mediaType)) {
    return { valid: false, error: `mediaType must be one of: ${validMediaTypes.join(', ')}` };
  }

  return { valid: true, data: b as unknown as PhotoAnalyzeRequest };
}

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

    const { imageBase64, mediaType } = validation.data;
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 },
      );
    }

    const prompt = 'Analyze this food photo conservatively and return structured nutrition estimates.';
    const result = await executeAiTask({
      task: 'photo_analyze',
      prompt,
      context: { userId: guard.userId, requestId: request.headers.get('x-request-id') ?? undefined },
      invoke: ({ policy, signal }) => invokeAnthropicJson({
        signal,
        body: {
          model: policy.model,
          max_tokens: policy.maxTokens,
          messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: imageBase64,
                },
              },
              {
                type: 'text',
                text: 'Analyze this food photo. Identify visible food items and make a conservative rough portion and macro estimate only. estimated_grams must be your estimated edible portion weight, not derived from calories. Photo-only portion estimation is uncertain unless a scale, label, or known container is visible. Do not imply precision. source must be "ai_estimate". confidence is 0 to 1 and should be below 0.75 unless portion size is visually anchored. accuracy_note should briefly say what makes the estimate uncertain.',
              },
            ],
          },
        ],
          tools: [PHOTO_ANALYZE_TOOL],
          tool_choice: { type: 'tool', name: 'submit_food_photo_analysis' },
        },
      }),
    });
    const data = result.output as { content?: Array<{ type?: string; name?: string; input?: { foods?: FoodAnalysis[] } }> };

    const toolUse = data?.content?.find((c: { type?: string; name?: string }) =>
      c.type === 'tool_use' && c.name === 'submit_food_photo_analysis',
    );
    const foods = toolUse?.input?.foods as FoodAnalysis[] | undefined;

    if (!foods || foods.length === 0) {
      console.error('No tool_use food analysis in Anthropic response');
      return NextResponse.json(
        { error: 'No analysis returned' },
        { status: 502 },
      );
    }

    const validFoods = foods.filter((food) =>
      Number.isFinite(food.estimated_grams) &&
      food.estimated_grams > 0 &&
      food.estimated_grams <= 10_000 &&
      Number.isFinite(food.estimated_calories) &&
      food.estimated_calories >= 0 &&
      food.estimated_calories <= 10_000 &&
      [food.estimated_protein_g, food.estimated_carbs_g, food.estimated_fat_g].every((value) => Number.isFinite(value) && value >= 0) &&
      food.estimated_protein_g + food.estimated_carbs_g + food.estimated_fat_g <= food.estimated_grams * 1.15
    );
    if (validFoods.length !== foods.length) {
      return NextResponse.json({ error: 'Photo nutrition estimate failed plausibility validation' }, { status: 502 });
    }

    return NextResponse.json({
      foods: validFoods.map((food) => ({
        ...food,
        source: 'ai_estimate' as const,
        confidence: Math.min(food.confidence, 0.75),
        accuracy_note: food.accuracy_note ?? 'Photo-only nutrition is an estimate; confirm weight or serving size for accurate tracking.',
      })),
    });
  } catch (error) {
    console.error('Photo analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze photo' },
      { status: 500 },
    );
  }
}
