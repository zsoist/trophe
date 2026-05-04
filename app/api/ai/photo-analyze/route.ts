import { NextRequest, NextResponse } from 'next/server';
import { calculateCost, extractAnthropicUsage } from '@/lib/api-cost-logger';
import { guardAiRoute } from '@/lib/api-guard';
import { pick } from '@/agents/router';
import { logAgentRun } from '@/lib/agent-run-logger';

interface PhotoAnalyzeRequest {
  imageBase64: string;
  mediaType: string;
}

interface FoodAnalysis {
  name: string;
  estimated_calories: number;
  estimated_protein_g: number;
  estimated_carbs_g: number;
  estimated_fat_g: number;
  confidence: number;
  source?: 'ai_estimate';
  accuracy_note?: string;
}

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
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

  // Cap at ~7MB image (base64 is ~33% larger than binary)
  if (b.imageBase64.length > 10_000_000) {
    return { valid: false, error: 'Image too large — maximum 7MB' };
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
    const policy = pick('photo_analyze');

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'ANTHROPIC_API_KEY not configured' },
        { status: 500 },
      );
    }

    const startTime = Date.now();
    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
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
                text: 'Analyze this food photo. Identify visible food items and make a conservative rough macro estimate only. Photo-only portion estimation is uncertain unless a scale, label, or known container is visible. Do not imply precision. source must be "ai_estimate". confidence is 0 to 1 and should be below 0.75 unless portion size is visually anchored. accuracy_note should briefly say what makes the estimate uncertain.',
              },
            ],
          },
        ],
        tools: [PHOTO_ANALYZE_TOOL],
        tool_choice: { type: 'tool', name: 'submit_food_photo_analysis' },
      }),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Anthropic API error: ${response.status} ${errorText}`);
      logAgentRun({
        taskName: 'photo_analyze',
        model: policy.model,
        provider: 'anthropic',
        costUsd: 0,
        latencyMs,
        rawStatus: response.status,
        userId: guard.userId,
        errorMessage: errorText.slice(0, 200),
      });
      return NextResponse.json(
        { error: 'Failed to analyze photo' },
        { status: 502 },
      );
    }

    const data = await response.json();
    const { tokensIn, tokensOut } = extractAnthropicUsage(data);
    const cost = calculateCost(policy.model, tokensIn, tokensOut);
    logAgentRun({
      taskName: 'photo_analyze',
      model: policy.model,
      provider: 'anthropic',
      tokensIn,
      tokensOut,
      costUsd: cost,
      latencyMs,
      rawStatus: response.status,
      userId: guard.userId,
    });

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

    return NextResponse.json({
      foods: foods.map((food) => ({
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
