import { after, type NextRequest } from 'next/server';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { guardAiRoute } from '@/lib/security/api-guard';
import { db, pool } from '@/db/client';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';
import { createCoachChatService } from '@/agents/coach-assistant/chat-service';
import { conversationScope } from '@/agents/coach-assistant/context';
import { COACH_CHAT_VERSION } from '@/agents/coach-assistant/chat-contract';
import { createPilotBudgetStore } from '@/lib/workout/pilot-budget-service';
import { createSharedPilotBudgetRuntime, sharedPilotRuntimeGate } from '@/lib/workout/shared-pilot-budget';
import { createCanonicalLiveBudgetAdapter } from '@/lib/voice-live/canonical-budget-adapter';
import { createOpenAiLiveSessionTransport } from '@/lib/voice-live/openai-live-transport';
import { openLiveSideband } from '@/lib/voice-live/server-sideband';
import { openLiveSession, consumeProviderEvents } from '@/lib/voice-live/server-session';
import { LIVE_RATE_CONFIG, LIVE_RUNTIME_MAX_SECONDS } from '@/lib/voice-live/pricing';

export const runtime = 'nodejs';
// Includes authentication, the 120-second voice window, and independent cleanup.
export const maxDuration = 180;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
const createInput = z.object({ operation: z.literal('create'), requestId: z.string().uuid(), conversationId: z.string().uuid(), offerSdp: z.string().min(1).max(65_536) }).strict();
const closeInput = z.object({ operation: z.literal('close'), sessionId: z.string().min(1).max(256) }).strict();
const enabled = () => process.env.COACH_ASSISTANT_GPT_LIVE_ENABLED === '1';

async function authorizeConversation(actorId: string, conversationId: string, signal: AbortSignal) {
  const context = await createServerRepository(pool).authorize(actorId, actorId, signal);
  const scope = { actorId, subjectId: actorId, organizationId: context.organizationId, actorRole: conversationScope(context).actorRole };
  const read = await createCoachChatService(db).execute(scope, { version: COACH_CHAT_VERSION, operation: 'read', threadId: conversationId, limit: 1 }, signal);
  if (!read.ok) throw new Error('conversation_unavailable');
  return context;
}

async function ownedSession(actorId: string, sessionId: string) {
  const rows = await db.execute<{ conversation_id: string; state: string; usage: unknown }>(sql`
    SELECT metadata->'gptLive'->>'conversationId' AS conversation_id,
      metadata->'coachPilot'->>'state' AS state,metadata->'coachPilot'->'usage' AS usage
    FROM public.agent_runs WHERE user_id=${actorId}::uuid AND model='gpt-live-1'
      AND metadata->'gptLive'->>'sessionId'=${sessionId} LIMIT 2`);
  return rows.rows.length === 1 ? rows.rows[0] : null;
}

export async function GET(request: NextRequest) {
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  if (!enabled() || !sharedPilotRuntimeGate(process.env, guard.userId).ok) return reply({ enabled: false });
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  if (!sessionId) return reply({ enabled: true, maxDurationSeconds: LIVE_RUNTIME_MAX_SECONDS });
  if (sessionId.length > 256) return reply({ ok: false }, 400);
  try {
    const stored = await ownedSession(guard.userId, sessionId);
    if (!stored) return reply({ ok: false }, 404);
    await authorizeConversation(guard.userId, stored.conversation_id, request.signal);
    const usage = z.object({ durationSeconds: z.number().int().nonnegative() }).safeParse(stored.usage);
    return reply({ ok: true, state: stored.state, reconciledSeconds: stored.state === 'settled' && usage.success ? usage.data.durationSeconds : null });
  } catch { return reply({ ok: false }, 503); }
}

export async function POST(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return reply({ ok: false }, 403);
  if (!enabled()) return reply({ ok: false, error: 'disabled' }, 404);
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  if (!sharedPilotRuntimeGate(process.env, guard.userId).ok) return reply({ ok: false, error: 'unavailable' }, 403);
  if (Number(request.headers.get('content-length') ?? 0) > 70_000) return reply({ ok: false }, 413);
  let raw: unknown;
  try { const text = await request.text(); if (text.length > 70_000) return reply({ ok: false }, 413); raw = JSON.parse(text); }
  catch { return reply({ ok: false }, 400); }
  const closing = closeInput.safeParse(raw);
  if (closing.success) {
    const stored = await ownedSession(guard.userId, closing.data.sessionId);
    if (!stored) return reply({ ok: false }, 404);
    if (stored.state === 'settled') return reply({ ok: true });
    // Owning the recorded session permits ending it even if its thread was deleted.
    const sideband = openLiveSideband(process.env.OPENAI_API_KEY!, closing.data.sessionId);
    try { await sideband.close(AbortSignal.timeout(5_000)); return reply({ ok: true }); }
    catch { return reply({ ok: false, error: 'close_unconfirmed' }, 503); }
    finally { sideband.dispose(); }
  }
  const parsed = createInput.safeParse(raw);
  if (!parsed.success) return reply({ ok: false }, 400);
  const input = parsed.data;
  try {
    const context = await authorizeConversation(guard.userId, input.conversationId, request.signal);
    const budget = createSharedPilotBudgetRuntime(process.env, guard.userId, createPilotBudgetStore(db, guard.userId));
    if (!budget.ok) return reply({ ok: false, error: 'budget_blocked' }, 503);
    const digest = createHash('sha256').update(['gpt-live-attempt.v1', guard.userId, input.requestId].join('\0')).digest('hex');
    const attemptId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-8${digest.slice(17, 20)}-${digest.slice(20, 32)}`;
    let sideband: ReturnType<typeof openLiveSideband> | undefined;
    const transport = createOpenAiLiveSessionTransport({
      apiKey: process.env.OPENAI_API_KEY!,
      openEventStream: sessionId => { sideband = openLiveSideband(process.env.OPENAI_API_KEY!, sessionId); return sideband.events; },
      sendSessionClose: async (sessionId, signal) => {
        sideband ??= openLiveSideband(process.env.OPENAI_API_KEY!, sessionId);
        await sideband.close(signal);
      },
    });
    const outcome = await openLiveSession({
      context: { actorId: guard.userId, organizationId: context.organizationId, pilotId: budget.pilotId, conversationId: input.conversationId, turnId: attemptId, agentRunId: attemptId },
      attemptId, requestHash: createHash('sha256').update(JSON.stringify([input.conversationId, input.offerSdp])).digest('hex'),
      sdpOffer: input.offerSdp, store: false, maxDurationSeconds: LIVE_RUNTIME_MAX_SECONDS,
      instructions: 'You are Ask Trophē, a concise nutrition and workout assistant. Use client delegation for personal records, calculations, and app actions. Never claim a record changed until the app returns its confirmed receipt. Actions require the user to review and confirm the app card. Do not invent nutrition values. Speak in the user\'s language. The session is limited to two minutes.',
      rateConfig: LIVE_RATE_CONFIG, budget: createCanonicalLiveBudgetAdapter(guard.userId, budget.store), transport,
      deadline: { authority: 'server', arm(at, expire) { const timer = setTimeout(expire, Math.max(0, at - Date.now())); return { cancel: () => clearTimeout(timer) }; } },
      now: Date.now, signal: request.signal,
    });
    if (!outcome.ok) { sideband?.dispose(); return reply({ ok: false, error: outcome.error }, 503); }
    const session = outcome.session;
    // Start receiving before waiting for persistence/returning SDP; keep it alive
    // via Next after for the bounded session plus independent final accounting.
    const receiving = consumeProviderEvents(session, sideband!.events);
    after(async () => { try { await receiving; await session.finalize(); } finally { sideband?.dispose(); } });
    try {
      await sideband!.ready;
      const saved = await db.execute(sql`UPDATE public.agent_runs SET metadata=jsonb_set(metadata,'{gptLive}',${JSON.stringify({ sessionId: session.sessionId, conversationId: input.conversationId })}::jsonb)
        WHERE id=${attemptId}::uuid AND user_id=${guard.userId}::uuid AND model='gpt-live-1' RETURNING id`);
      if (saved.rows.length !== 1 || session.state() !== 'active') throw new Error('session_unavailable');
    } catch { await session.close('connection_lost'); return reply({ ok: false, error: 'session_unavailable' }, 503); }
    return reply({ ok: true, sessionId: session.sessionId, answerSdp: session.transportSdp, deadlineMs: session.deadlineMs });
  } catch { return reply({ ok: false, error: 'unavailable' }, 503); }
}
