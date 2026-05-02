import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/api-guard';
import { run } from '@/agents/recipe-analyze';
import { modelFor } from '@/agents/router';
import { logAgentRun } from '@/lib/agent-run-logger';

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

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

    const result = await run({ text, servings: servingsNum, language }, { userId: guard.userId });
    const t = result.telemetry;

    logAgentRun({
      taskName: 'recipe_analyze',
      model: t.model,
      provider: 'anthropic',
      tokensIn: t.tokensIn,
      tokensOut: t.tokensOut,
      cacheReadTokens: t.cacheReadTokens,
      cacheWriteTokens: t.cacheCreationTokens,
      costUsd: t.costUsd,
      latencyMs: t.latencyMs,
      rawStatus: t.rawStatus,
      traceId: t.traceId,
      userId: guard.userId,
      errorMessage: result.ok ? undefined : result.error?.slice(0, 200),
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
