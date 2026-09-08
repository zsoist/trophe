import type { NextRequest } from 'next/server';
import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
import type { CoachConversationRequest } from '@/agents/coach-assistant/contracts';
import { runConversation } from '@/agents/coach-assistant/conversation';
import { runReviewedVoiceTurn } from '@/agents/coach-assistant/voice-turn';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';

export const runtime = 'nodejs';

type Input = {
  voice: CoachVoiceResult;
  editedText: string;
  reviewed: boolean;
  request: Omit<CoachConversationRequest, 'message'>;
  offerSpeech?: boolean;
};

const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Reviewed text continuation only. Raw audio and provider transcription never enter this route. */
export async function POST(request: NextRequest) {
  if (process.env.COACH_ASSISTANT_ENABLED !== '1' || process.env.COACH_ASSISTANT_VOICE_REVIEW_ENABLED !== '1' || process.env.VERCEL_ENV === 'production') {
    return reply({ ok: false, status: 'error', error: 'not_connected' }, 404);
  }
  const { guardAiRoute } = await import('@/lib/security/api-guard');
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  const allowed = (process.env.COACH_ASSISTANT_PREVIEW_USER_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(guard.userId)) return reply({ ok: false, status: 'error', error: 'forbidden' }, 403);
  let input: Input;
  try {
    const raw: unknown = await request.json();
    if (!raw || typeof raw !== 'object' || !('voice' in raw) || !('editedText' in raw) || !('request' in raw)) throw new Error('invalid_input');
    input = raw as Input;
  } catch {
    return reply({ ok: false, status: 'error', error: 'invalid_input' }, 400);
  }
  const { pool } = await import('@/db/client');
  const repository = createServerRepository(pool);
  try {
    const result = await runReviewedVoiceTurn(input, {
      actorId: guard.userId,
      repository,
      signal: request.signal,
      pipeline: { run: (reviewedRequest, signal) => runConversation(reviewedRequest, { actorId: guard.userId, repository, signal, now: new Date(), mode: 'offline' }) },
    });
    return reply(result, result.ok ? 200 : result.error === 'forbidden' ? 403 : result.error === 'invalid_input' ? 400 : result.error === 'ambiguous_number' ? 409 : 503);
  } catch {
    return reply({ ok: false, status: 'error', error: 'invalid_input' }, 400);
  }
}
