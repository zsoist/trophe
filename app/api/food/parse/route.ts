import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/api-guard';
import { run } from '@/agents/food-parse';
import { modelFor } from '@/agents/router';
import { z } from 'zod';

export type { ParsedFoodItem } from '@/agents/schemas/food-parse';

const requestSchema = z.object({
  text: z.string().trim().min(1).max(12_000),
  language: z.enum(['en', 'es', 'el', 'fr']).default('en'),
}).strict();

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid food parse request' },
        { status: 400 },
      );
    }
    const { text, language } = parsed.data;

    const result = await run({ text, language }, { userId: guard.userId });
    const t = result.telemetry;

    if (!result.ok) {
      const status = t.rawStatus >= 400 && t.rawStatus < 600 ? 502 : 422;
      return NextResponse.json({ error: result.error || 'Failed to parse food input' }, { status });
    }

    return NextResponse.json(result.output);
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
