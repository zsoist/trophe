import { NextRequest, NextResponse } from 'next/server';
import { logAPIUsage, calculateCost } from '@/lib/api-cost-logger';
import { guardAiRoute } from '@/lib/api-guard';
import { run, FOOD_PARSE_MODEL } from '@/agents/food-parse';

export type { ParsedFoodItem } from '@/agents/schemas/food-parse';

export async function POST(request: NextRequest) {
  const block = guardAiRoute(request);
  if (block) return block;

  try {
    const body = await request.json();
    const { text, language = 'en' } = body as { text?: string; language?: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'text is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const result = await run({ text, language });
    const t = result.telemetry;
    const effectiveTokensIn = t.tokensIn + t.cacheCreationTokens + t.cacheReadTokens;
    const cost = calculateCost(t.model, effectiveTokensIn, t.tokensOut);

    logAPIUsage({
      endpoint: '/api/food/parse',
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
      return NextResponse.json({ error: result.error || 'Failed to parse food input' }, { status });
    }

    return NextResponse.json({ items: result.output!.items });
  } catch (error) {
    console.error('Food parse error:', error);
    return NextResponse.json({ error: 'Failed to parse food input' }, { status: 500 });
  }
}

export { FOOD_PARSE_MODEL };
