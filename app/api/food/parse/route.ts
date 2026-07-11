import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/security/api-guard';
import { run } from '@/agents/food-parse';
import { annotateGenerationMetadata } from '@/agents/runtime/persistence';
import { z } from 'zod';

export type { ParsedFoodItem } from '@/agents/schemas/food-parse';

// Language is only a prompt hint — the pipeline parses the text regardless.
// The UI ships 8 locales; unknown values coerce to 'en' instead of 400-ing
// (18 benchmark failures came from it/de/nl/pt being hard-rejected here).
const requestSchema = z.object({
  text: z.string().trim().min(1).max(12_000),
  language: z.enum(['en', 'es', 'el', 'fr', 'de', 'it', 'pt', 'nl']).catch('en'),
}).strict();

// ── User-facing error taxonomy ──────────────────────────────────────────────
// Raw pipeline internals ("DeepSeek incomplete response (length)", "Nutrition
// result failed plausibility validation") must never reach users. Failures map
// to stable codes the client renders friendly copy for; raw detail stays in
// server logs/telemetry only.
export type FoodParseErrorCode = 'ai_busy' | 'try_rephrase' | 'too_long' | 'rate_limited' | 'timeout';

interface ClassifiedFailure {
  code: FoodParseErrorCode;
  message: string;
  status: number;
}

const TRUSTED_EVAL_SUITES = new Set(['frozen-may-30-probe', 'phase3-luna-watchlist']);

function trustedEvalMetadata(request: NextRequest, rateLimitBypassed: boolean): Record<string, unknown> | undefined {
  if (!rateLimitBypassed) return undefined;
  const evalSuite = request.headers.get('x-trophe-eval-suite');
  if (!evalSuite || !TRUSTED_EVAL_SUITES.has(evalSuite)) return undefined;
  return { evalSuite, canarySegment: 'consumer-luna-week-1' };
}

async function recordFinalOutcome(
  generationId: string | null | undefined,
  outcome: 'success' | 'malformed',
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!generationId) return;
  await annotateGenerationMetadata(generationId, {
    ...metadata,
    apiOutcome: outcome,
  }).catch((error) => console.error('[food-parse] outcome annotation failed', error));
}

function classifyParseFailure(rawError: string, rawStatus: number, errorCode?: string): ClassifiedFailure {
  if (errorCode === 'too_long') {
    return {
      code: 'too_long',
      message: 'That entry is too long — keep it under 500 characters, or log the meal in parts.',
      status: 422,
    };
  }
  if (/timed?\s*out|timeout|abort/i.test(rawError)) {
    return {
      code: 'timeout',
      message: 'This took longer than expected — please try again.',
      status: 504,
    };
  }
  if (rawStatus === 429 || /rate.?limit/i.test(rawError)) {
    return {
      code: 'rate_limited',
      message: 'Too many requests right now — give it a moment and try again.',
      status: 502,
    };
  }
  if (/could not parse|plausibility|text is required|no food/i.test(rawError)) {
    return {
      code: 'try_rephrase',
      message: 'Could not read that as food — try rephrasing, e.g. "2 eggs and a slice of toast".',
      status: 422,
    };
  }
  // Provider/network failures, incomplete responses, empty LLM output, cost ceilings.
  return {
    code: 'ai_busy',
    message: 'The AI had trouble with that one — please try again in a moment.',
    status: 502,
  };
}

export async function POST(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;

  try {
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          code: 'try_rephrase' satisfies FoodParseErrorCode,
          message: 'Invalid food parse request',
          error: 'Invalid food parse request',
          items: [],
        },
        { status: 400 },
      );
    }
    const { text, language } = parsed.data;
    const evalMetadata = trustedEvalMetadata(request, guard.rateLimitBypassed);
    const requestId = request.headers.get('x-request-id') ?? undefined;

    const result = await run(
      { text, language },
      {
        userId: guard.userId,
        ...(requestId ? { requestId } : {}),
        ...(evalMetadata ? { metadata: evalMetadata } : {}),
      },
    );
    const t = result.telemetry;

    if (!result.ok) {
      const failure = classifyParseFailure(result.error ?? '', t.rawStatus, result.errorCode);
      // Full detail server-side only (console + telemetry keep the raw error).
      console.error('[food-parse] failed', {
        code: failure.code,
        rawStatus: t.rawStatus,
        model: t.model,
        traceId: t.traceId,
        error: result.error,
      });
      await recordFinalOutcome(t.traceId, 'malformed', evalMetadata);
      return NextResponse.json(
        // `error` mirrors `message` for older consumers (eval scripts read .error).
        { code: failure.code, message: failure.message, error: failure.message, items: [] },
        { status: failure.status },
      );
    }

    await recordFinalOutcome(t.traceId, 'success', evalMetadata);
    return NextResponse.json(result.output);
  } catch (error) {
    console.error('Food parse error:', error);
    return NextResponse.json(
      {
        code: 'ai_busy' satisfies FoodParseErrorCode,
        message: 'Failed to parse food input. Please try rephrasing or entering items separately.',
        error: 'Failed to parse food input. Please try rephrasing or entering items separately.',
        items: [],
      },
      { status: 500 },
    );
  }
}

// Phase 3: model is now resolved dynamically via the router.
