import { NextRequest, NextResponse } from 'next/server';
import { guardAiRoute } from '@/lib/security/api-guard';
import { executeAiTask } from '@/agents/runtime';
import { invokePrivatePhotoFoodProvider } from '@/agents/coach-assistant/photo-food-provider';
import {
  normalizePhotoAnalysisFoods,
  type PhotoAnalysisFood,
} from '@/lib/food/photo-analysis';
import { safeErrorMetadata } from '@/lib/security/safe-error-log';
import { groundKnownDishComponents } from '@/lib/food/photo-grounding';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {createHash} from 'node:crypto';

interface PhotoAnalyzeRequest {
  imageBase64: string;
  mediaType: string;
}

const PHOTO_ANALYZE_PROMPT = readFileSync(
  join(process.cwd(), 'agents/prompts/photo-analyze.v2.md'),
  'utf8',
).trim();

function validateInput(body: unknown): { valid: true; data: PhotoAnalyzeRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const b = body as Record<string, unknown>;

  if (typeof b.imageBase64 !== 'string' || b.imageBase64.length === 0) {
    return { valid: false, error: 'imageBase64 is required and must be a non-empty string' };
  }

  // Base64 uses four characters per three binary bytes. Keep decoded uploads
  // at or below 5MB after client-side resizing/transcoding.
  const maxBase64Length = Math.ceil((5 * 1024 * 1024) / 3) * 4;
  if (b.imageBase64.length > maxBase64Length) {
    return { valid: false, error: 'Image too large after compression — maximum 5MB' };
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
    if (!process.env.OPENAI_API_KEY) {
      // Never leak provider/env-var identity to clients (B2B: a clinic client
      // must see a friendly retry, not our internal config). Log server-side.
      console.error('[photo-analyze] OPENAI_API_KEY not configured');
      return NextResponse.json(
        { error: 'Photo analysis is temporarily unavailable — please try again.' },
        { status: 503 },
      );
    }

    const execute=()=>executeAiTask({
      task: 'photo_analyze',
      prompt: PHOTO_ANALYZE_PROMPT,
      context: { userId: guard.userId, requestId: request.headers.get('x-request-id') ?? undefined },
      invoke: ({ policy, signal }) => invokePrivatePhotoFoodProvider({
        policy,
        signal,
        image: {
          bytes: Buffer.from(imageBase64, 'base64'),
          mediaType: mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        },
      }),
    });
    const pilotActor=(process.env.COACH_ASSISTANT_PREVIEW_USER_IDS??'').split(',').map(value=>value.trim()).includes(guard.userId);
    const livePilot=process.env.VERCEL_ENV==='preview'&&process.env.COACH_ASSISTANT_LIVE_PILOT_ENABLED==='1'&&process.env.TROPHE_ALLOW_PAID_AI==='1'&&pilotActor;
    let result:Awaited<ReturnType<typeof execute>>;
    if(livePilot){
      const conversationId=request.headers.get('x-coach-conversation-id')??'',turnId=request.headers.get('x-coach-turn-id')??'';
      const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if(!uuid.test(conversationId)||!uuid.test(turnId))return NextResponse.json({error:'Photo analysis context is invalid'},{status:400});
      const [{db},{createPilotBudgetStore},{createSharedPilotBudgetRuntime},{runGovernedPilotModality}]=await Promise.all([import('@/db/client'),import('@/lib/workout/pilot-budget-service'),import('@/lib/workout/shared-pilot-budget'),import('@/agents/coach-assistant/governed-modality')]);
      const runtime=createSharedPilotBudgetRuntime(process.env,guard.userId,createPilotBudgetStore(db,guard.userId));
      if(!runtime.ok)return NextResponse.json({error:'Photo analysis is temporarily unavailable — please try again.'},{status:503});
      const imageDigest=createHash('sha256').update(imageBase64).digest('hex');
      result=await runGovernedPilotModality({pilotId:runtime.pilotId,actorId:guard.userId,turnId,identityParts:[runtime.pilotId,guard.userId,conversationId,turnId,imageDigest],task:'photo_analyze',store:runtime.store,signal:request.signal,run:execute});
    }else result=await execute();
    const data = result.output as {
      content?: Array<{ type?: string; name?: string; input?: { dish_name?: unknown; foods?: unknown } }>;
    };

    const toolUse = data?.content?.find((c: { type?: string; name?: string }) =>
      c.type === 'tool_use' && c.name === 'submit_food_photo_analysis',
    );
    const candidateFoods = toolUse?.input?.foods;
    const normalizedFoods = normalizePhotoAnalysisFoods(candidateFoods);
    const candidateCount = Array.isArray(candidateFoods) ? candidateFoods.length : 0;

    if (candidateCount === 0) {
      console.error('No tool_use food analysis in Luna response');
      return NextResponse.json(
        { error: 'No analysis returned' },
        { status: 502 },
      );
    }

    // Per-item plausibility: drop only the implausible items and keep the rest.
    // One bad estimate on a 4-item plate must not throw away the other three.
    if (normalizedFoods.length === 0) {
      console.error(
        `Photo nutrition estimate failed plausibility validation (all ${candidateCount} item(s) implausible)`,
      );
      return NextResponse.json(
        { error: 'Could not read reliable nutrition from this photo — try a clearer shot or enter it manually' },
        { status: 502 },
      );
    }
    if (normalizedFoods.length !== candidateCount) {
      console.warn(
        `[photo-analyze] dropped ${candidateCount - normalizedFoods.length}/${candidateCount} item(s) that failed plausibility validation`,
      );
    }

    const dishName = typeof toolUse?.input?.dish_name === 'string'
      ? toolUse.input.dish_name
      : null;
    const foods = groundKnownDishComponents({ dishName, foods: normalizedFoods });

    return NextResponse.json({
      foods: foods satisfies PhotoAnalysisFood[],
    });
  } catch (error) {
    console.error('[photo-analyze] unhandled error', safeErrorMetadata(error));
    if(error instanceof Error&&['budget_blocked','provider_unavailable'].includes(error.message))return NextResponse.json(
      {error:'Photo analysis is temporarily unavailable — please try again.'},{status:503},
    );
    return NextResponse.json(
      { error: 'Failed to analyze photo' },
      { status: 500 },
    );
  }
}
