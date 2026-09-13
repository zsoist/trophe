import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { guardAiRoute } from '@/lib/security/api-guard';
import { run } from '@/agents/recipe-analyze';
import { RECIPE_ANALYZE_MAX_INPUT_CHARS } from '@/agents/schemas/recipe-analyze';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';

// ── User-facing error taxonomy ──────────────────────────────────────────────
// Raw pipeline internals ("DeepSeek incomplete response (length)", "Empty
// response from AI") must never reach users. Recipe failures map to the same
// stable codes/copy as /api/food/parse so the client renders friendly text;
// raw detail stays in server logs only.
export type RecipeAnalyzeErrorCode = 'ai_busy' | 'try_rephrase' | 'too_long' | 'rate_limited' | 'timeout';

interface ClassifiedRecipeFailure {
  code: RecipeAnalyzeErrorCode;
  message: string;
  status: number;
}

function classifyRecipeFailure(rawError: string, rawStatus: number): ClassifiedRecipeFailure {
  if (/too.?long|too_long/i.test(rawError)) {
    return {
      code: 'too_long',
      message: `That recipe is too long — keep it under ${RECIPE_ANALYZE_MAX_INPUT_CHARS} characters.`,
      status: 422,
    };
  }
  if (/timed?\s*out|timeout|abort/i.test(rawError)) {
    return { code: 'timeout', message: 'This took longer than expected — please try again.', status: 504 };
  }
  if (rawStatus === 429 || /rate.?limit/i.test(rawError)) {
    return { code: 'rate_limited', message: 'Too many requests right now — give it a moment and try again.', status: 502 };
  }
  if (/could not read|text is required|no food|plausibility|validation/i.test(rawError)) {
    return { code: 'try_rephrase', message: 'Could not read that as a recipe — check the ingredients and try again.', status: 422 };
  }
  // Provider/network failures, incomplete or empty responses, cost ceilings.
  return { code: 'ai_busy', message: 'The AI had trouble with that one — please try again in a moment.', status: 502 };
}

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  try {
    const schema = z.object({
      // Mirrors the agent's supported bound (RECIPE_ANALYZE_MAX_INPUT_CHARS).
      // The agent refuses — never silently truncates — anything past it, so the
      // route rejects the same bound BEFORE dispatch instead of trimming the
      // recipe and returning nutrition for different food.
      text: z.string().trim().min(1).max(RECIPE_ANALYZE_MAX_INPUT_CHARS),
      servings: z.number().positive().max(100).optional(),
      language: z.enum(['en', 'es', 'el', 'fr']).default('en'),
    }).strict();
    const body: unknown = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const rawText = (body as { text?: unknown } | null)?.text;
      if (typeof rawText === 'string' && rawText.trim().length > RECIPE_ANALYZE_MAX_INPUT_CHARS) {
        const message = `That recipe is too long — keep it under ${RECIPE_ANALYZE_MAX_INPUT_CHARS} characters.`;
        return NextResponse.json(
          { code: 'too_long' satisfies RecipeAnalyzeErrorCode, message, error: message },
          { status: 422 },
        );
      }
      return NextResponse.json(
        {
          code: 'try_rephrase' satisfies RecipeAnalyzeErrorCode,
          message: 'Invalid recipe request (text required).',
          error: 'Invalid recipe request (text required).',
        },
        { status: 400 },
      );
    }
    const { text, language } = parsed.data;
    const servingsNum = parsed.data.servings ?? 1;

    const result = await run({ text, servings: servingsNum, language }, { userId: guard.userId });
    const t = result.telemetry;

    if (!result.ok) {
      // Never echo the raw pipeline error — log it, return friendly copy.
      const failure = classifyRecipeFailure(result.error ?? '', t.rawStatus);
      console.error('[recipe-analyze] failed', {
        code: failure.code,
        rawStatus: t.rawStatus,
        model: t.model,
        traceId: t.traceId,
      });
      return NextResponse.json(
        // `error` mirrors `message` for existing consumers (client reads .error).
        { code: failure.code, message: failure.message, error: failure.message },
        { status: failure.status },
      );
    }

    return NextResponse.json(result.output);
  } catch (error) {
    // Provider failures throw out of run(); keep raw detail server-side only.
    console.error('[recipe-analyze] unhandled error', safeErrorMetadata(error));
    return NextResponse.json(
      {
        code: 'ai_busy' satisfies RecipeAnalyzeErrorCode,
        message: 'The AI had trouble with that one — please try again in a moment.',
        error: 'The AI had trouble with that one — please try again in a moment.',
      },
      { status: 502 },
    );
  }
}

// Phase 3: model is now resolved dynamically via the router.
