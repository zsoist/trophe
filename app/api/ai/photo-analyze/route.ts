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

function extractJSON(text: string): FoodAnalysis[] | null {
  // Try to find a JSON object with a "foods" array
  const objectMatch = text.match(/\{[\s\S]*"foods"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      if (Array.isArray(parsed.foods)) return parsed.foods;
    } catch {
      // Try array extraction instead
    }
  }

  // Try to find a bare JSON array
  const arrayMatch = text.match(/\[[\s\S]*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0]);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // JSON parse failed
    }
  }

  return null;
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
                text: 'Analyze this food photo. Identify visible food items and make a conservative rough macro estimate only. Photo-only portion estimation is uncertain unless a scale, label, or known container is visible. Do not imply precision. Return JSON: { foods: [{ name, estimated_calories, estimated_protein_g, estimated_carbs_g, estimated_fat_g, confidence, source, accuracy_note }] }. source must be "ai_estimate". confidence is 0 to 1 and should be below 0.75 unless portion size is visually anchored. accuracy_note should briefly say what makes the estimate uncertain. Return ONLY the JSON, no other text.',
              },
            ],
          },
        ],
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

    const textContent = data?.content?.[0]?.text;

    if (!textContent) {
      console.error('No text content in Anthropic response');
      return NextResponse.json(
        { error: 'No analysis returned' },
        { status: 502 },
      );
    }

    const foods = extractJSON(textContent);

    if (!foods || foods.length === 0) {
      console.error('Could not parse food analysis from response');
      return NextResponse.json(
        { error: 'Could not parse food analysis' },
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
