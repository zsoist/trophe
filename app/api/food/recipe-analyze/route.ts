import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAiRoute } from '@/lib/security/api-guard';
import { run } from '@/agents/recipe-analyze';
import { modelFor } from '@/agents/router';

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  try {
    const schema = z.object({
      text: z.string().trim().min(1).max(30_000),
      servings: z.number().positive().max(100).optional(),
      language: z.enum(['en', 'es', 'el', 'fr']).default('en'),
    }).strict();
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid recipe request (text required, max 30k chars)' },
        { status: 400 },
      );
    }
    const { text, language } = parsed.data;
    const servingsNum = parsed.data.servings ?? 1;

    const result = await run({ text, servings: servingsNum, language }, { userId: guard.userId });
    const t = result.telemetry;

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
