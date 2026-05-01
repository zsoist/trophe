import { NextRequest, NextResponse } from 'next/server';
import { logAPIUsage, calculateCost } from '@/lib/api-cost-logger';
import { guardAiRoute } from '@/lib/api-guard';
import { run } from '@/agents/recipe-analyze';
import { modelFor } from '@/agents/router';

export async function POST(request: NextRequest) {
  const block = guardAiRoute(request);
  if (block) return block;

  try {
    const body = await request.json();
    const { text, servings, language = 'en' } = body as {
      text?: string;
      servings?: number;
      language?: string;
    };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'text is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const servingsNum = typeof servings === 'number' && servings > 0 ? servings : 1;

    const result = await run({ text, servings: servingsNum, language });
    const t = result.telemetry;
    const effectiveTokensIn = t.tokensIn + t.cacheCreationTokens + t.cacheReadTokens;
    const cost = calculateCost(t.model, effectiveTokensIn, t.tokensOut);

    logAPIUsage({
      endpoint: '/api/food/recipe-analyze',
      model: t.model,
      provider: 'anthropic',
      tokens_in: effectiveTokensIn,
      tokens_out: t.tokensOut,
      cost_usd: cost,
      latency_ms: t.latencyMs,
      success: result.ok,
      error_message: result.ok ? undefined : result.error?.slice(0, 200),
    });

    if (!result.ok) {
      const status = t.rawStatus >= 400 && t.rawStatus < 600 ? 502 : 422;
      return NextResponse.json({ error: result.error || 'Failed to analyze recipe' }, { status });
    }

    return NextResponse.json(result.output);
  } catch (error) {
    console.error('Recipe analyze error:', error);
    return NextResponse.json({ error: 'Failed to analyze recipe' }, { status: 500 });
  }
}

// Phase 3: model is now resolved dynamically via the router.
export const RECIPE_ANALYZE_MODEL = modelFor('recipe_analyze');
