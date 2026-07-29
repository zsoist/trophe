import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/security/api-guard';
import { executeAiTask } from '@/agents/runtime';
import { invokeAnthropicJson } from '@/agents/runtime/providers/anthropic';
import {
  normalizePhotoAnalysisFoods,
  type PhotoAnalysisFood,
} from '@/lib/food/photo-analysis';

interface PhotoAnalyzeRequest {
  imageBase64: string;
  mediaType: string;
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
      // Never leak provider/env-var identity to clients (B2B: a clinic client
      // must see a friendly retry, not our internal config). Log server-side.
      console.error('[photo-analyze] ANTHROPIC_API_KEY not configured');
      return NextResponse.json(
        { error: 'Photo analysis is temporarily unavailable — please try again.' },
        { status: 503 },
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
    const data = result.output as {
      content?: Array<{ type?: string; name?: string; input?: { foods?: unknown } }>;
    };

    const toolUse = data?.content?.find((c: { type?: string; name?: string }) =>
      c.type === 'tool_use' && c.name === 'submit_food_photo_analysis',
    );
    const candidateFoods = toolUse?.input?.foods;
    const foods = normalizePhotoAnalysisFoods(candidateFoods);
    const candidateCount = Array.isArray(candidateFoods) ? candidateFoods.length : 0;

    if (candidateCount === 0) {
      console.error('No tool_use food analysis in Anthropic response');
      return NextResponse.json(
        { error: 'No analysis returned' },
        { status: 502 },
      );
    }

    // Per-item plausibility: drop only the implausible items and keep the rest.
    // One bad estimate on a 4-item plate must not throw away the other three.
    if (foods.length === 0) {
      console.error(
        `Photo nutrition estimate failed plausibility validation (all ${candidateCount} item(s) implausible)`,
      );
      return NextResponse.json(
        { error: 'Could not read reliable nutrition from this photo — try a clearer shot or enter it manually' },
        { status: 502 },
      );
    }
    if (foods.length !== candidateCount) {
      console.warn(
        `[photo-analyze] dropped ${candidateCount - foods.length}/${candidateCount} item(s) that failed plausibility validation`,
      );
    }

    return NextResponse.json({
      foods: foods satisfies PhotoAnalysisFood[],
    });
  } catch (error) {
    console.error('Photo analysis error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze photo' },
      { status: 500 },
    );
  }
}
