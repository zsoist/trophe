import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/api-guard';
import { run } from '@/agents/food-parse';
import { modelFor } from '@/agents/router';

export type { ParsedFoodItem } from '@/agents/schemas/food-parse';

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  try {
    const body = await request.json();
    const { text, language = 'en' } = body as { text?: string; language?: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json(
        { error: 'text is required and must be a non-empty string' },
        { status: 400 },
      );
    }

    const result = await run({ text, language }, { userId: guard.userId });
    const t = result.telemetry;

    if (!result.ok) {
      const status = t.rawStatus >= 400 && t.rawStatus < 600 ? 502 : 422;
      return NextResponse.json({ error: result.error || 'Failed to parse food input' }, { status });
    }

    return NextResponse.json({ items: result.output!.items });
  } catch (error) {
    console.error('Food parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse food input. Please try rephrasing or entering items separately.', items: [] },
      { status: 500 },
    );
  }
}

// Phase 3: model is now resolved dynamically via the router.
// Re-export for any consumers that still reference this symbol.
export const FOOD_PARSE_MODEL = modelFor('food_parse');
