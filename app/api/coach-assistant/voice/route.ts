import type { NextRequest } from 'next/server';
import type { CoachVoiceResult } from '@/agents/coach-assistant/voice-contract';
import type { CoachConversationRequest } from '@/agents/coach-assistant/contracts';
import { runConversation } from '@/agents/coach-assistant/conversation';
import { runReviewedVoiceTurn } from '@/agents/coach-assistant/voice-turn';
import { runReviewedVoiceConversation } from '@/agents/coach-assistant/voice-pipeline';
import { createServerRepository } from '@/agents/coach-assistant/server-repository';
import { transcribeCoachAudio, type OfflineCoachTranscriber } from '@/agents/coach-assistant/voice';
import type { CoachRepository } from '@/agents/coach-assistant/repository';
import {createHash} from 'node:crypto';
import {TRANSCRIPTION_MODEL} from '@/agents/router/policies';

export const runtime = 'nodejs';

type Input = {
  voice: CoachVoiceResult;
  editedText: string;
  reviewed: boolean;
  request: Omit<CoachConversationRequest, 'message'>;
  offerSpeech?: boolean;
};

const reply = (body: unknown, status: number) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** CI fixture or explicitly gated Preview STT. Both issue the same review token;
 * only the live path dispatches, after shared durable admission. */
export async function PUT(request: NextRequest) {
  const fixture=process.env.COACH_ASSISTANT_VOICE_FIXTURE_ENABLED==='1'&&process.env.CI==='true'&&process.env.GITHUB_ACTIONS==='true';
  const live=process.env.COACH_ASSISTANT_VOICE_LIVE_ENABLED==='1'&&process.env.COACH_ASSISTANT_LIVE_PILOT_ENABLED==='1'&&process.env.TROPHE_ALLOW_PAID_AI==='1'&&process.env.VERCEL_ENV==='preview';
  if (process.env.COACH_ASSISTANT_ENABLED !== '1' || (!fixture&&!live) || process.env.VERCEL_ENV === 'production') {
    return reply({ ok: false, status: 'error', error: 'not_connected' }, 404);
  }
  const { guardAiRoute } = await import('@/lib/security/api-guard');
  const guard = await guardAiRoute(request);
  if (!guard.ok) return guard.response;
  const allowed = (process.env.COACH_ASSISTANT_PREVIEW_USER_IDS ?? '').split(',').map(value => value.trim()).filter(Boolean);
  if (!allowed.includes(guard.userId)) return reply({ ok: false, status: 'error', error: 'forbidden' }, 403);
  let file: File;
  let metadata: { conversationId: string; turnId: string; locale: string; durationMs: number };
  try {
    const form = await request.formData();
    const candidate = form.get('file');
    if (!(candidate instanceof File)) throw new Error('invalid_input');
    file = candidate;
    metadata = {
      conversationId: String(form.get('conversationId') ?? ''), turnId: String(form.get('turnId') ?? ''),
      locale: String(form.get('locale') ?? ''), durationMs: Number(form.get('durationMs')),
    };
  } catch {
    return reply({ ok: false, status: 'error', error: 'invalid_input' }, 400);
  }
  const { pool } = await import('@/db/client');
  const authorized = createServerRepository(pool);
  const repository: CoachRepository = fixture?{ ...authorized, dataSource: 'synthetic' }:authorized;
  let transcriptSource:'synthetic_fixture'|'provider_transcript'='synthetic_fixture';
  let offlineTranscriber:OfflineCoachTranscriber;
  if(fixture)offlineTranscriber=async input=>({output:{text:'Help me understand my workout today.',languages:[input.locale]},usage:{inputTokens:0,outputTokens:0,actualCostUsd:0},rawStatus:200,latencyMs:0});
  else {
    const [{db},{createPilotBudgetStore},{createSharedPilotBudgetRuntime},{runGovernedPilotModality},{invokeOpenAiTranscription}]=await Promise.all([
      import('@/db/client'),import('@/lib/workout/pilot-budget-service'),import('@/lib/workout/shared-pilot-budget'),import('@/agents/coach-assistant/governed-modality'),import('@/agents/runtime/providers/openai-transcription'),
    ]);
    const runtime=createSharedPilotBudgetRuntime(process.env,guard.userId,createPilotBudgetStore(db,guard.userId));
    if(!runtime.ok)return reply({ok:false,status:'not_connected',error:'budget_blocked'},503);
    transcriptSource='provider_transcript';
    offlineTranscriber=async input=>{
      const audioDigest=createHash('sha256').update(Buffer.from(await input.file.arrayBuffer())).digest('hex');
      return runGovernedPilotModality({pilotId:runtime.pilotId,actorId:guard.userId,turnId:metadata.turnId,identityParts:[runtime.pilotId,guard.userId,metadata.conversationId,metadata.turnId,audioDigest],task:'transcribe',store:runtime.store,signal:input.signal,run:async()=>{
        const generated=await invokeOpenAiTranscription(input);
        return {...generated,selectedPolicy:{provider:'openai',model:TRANSCRIPTION_MODEL,promptVersion:'transcribe-v1'},isFallback:false};
      }});
    };
  }
  const result = await transcribeCoachAudio(file, metadata, { actorId: guard.userId, repository, signal: request.signal, offlineTranscriber,transcriptSource });
  return reply(result, result.ok ? 200 : result.error === 'forbidden' ? 403 : ['invalid_audio', 'invalid_input', 'invalid_output'].includes(result.error) ? 400 : 503);
}

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
    const live=process.env.COACH_ASSISTANT_VOICE_LIVE_ENABLED==='1'&&process.env.COACH_ASSISTANT_LIVE_PILOT_ENABLED==='1'&&process.env.TROPHE_ALLOW_PAID_AI==='1'&&process.env.VERCEL_ENV==='preview';
    const durableChat=process.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED==='1';
    const chatService=durableChat?await (async()=>{
      const [{db},{createCoachChatService},{createCoachChatCleanup}]=await Promise.all([import('@/db/client'),import('@/agents/coach-assistant/chat-service'),import('@/agents/coach-assistant/chat-cleanup')]);
      const attachments=process.env.COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED==='1'
        ?await import('@/agents/coach-assistant/private-photo-runtime').then(module=>module.createPrivateAttachmentRouteService(process.env))
        :undefined;
      return createCoachChatService(db,createCoachChatCleanup(db,attachments));
    })():undefined;
    let pipeline:{run:(reviewedRequest:CoachConversationRequest,signal:AbortSignal)=>ReturnType<typeof runConversation>};
    if(live){
      const [{db},{invokeStructuredProvider},{createPilotBudgetStore},{createGovernedCoachEngineBinding}]=await Promise.all([import('@/db/client'),import('@/agents/runtime/providers/structured'),import('@/lib/workout/pilot-budget-service'),import('@/agents/coach-assistant/governed-engine')]);
      const engine=createGovernedCoachEngineBinding({env:process.env,actorId:guard.userId,persistentStore:createPilotBudgetStore(db,guard.userId),transport:invokeStructuredProvider});
      pipeline={run:(reviewedRequest,signal)=>runReviewedVoiceConversation(reviewedRequest,{actorId:guard.userId,repository,signal,now:new Date(),mode:'model'},{chatService,governedEngine:engine})};
    }else pipeline={run:(reviewedRequest,signal)=>runReviewedVoiceConversation(reviewedRequest,{actorId:guard.userId,repository,signal,now:new Date(),mode:'offline'},{chatService})};
    const result = await runReviewedVoiceTurn(input, {
      actorId: guard.userId,
      repository,
      signal: request.signal,
      pipeline,
    });
    return reply(result, result.ok ? 200 : result.error === 'forbidden' ? 403 : result.error === 'invalid_input' ? 400 : result.error === 'ambiguous_number' ? 409 : 503);
  } catch {
    return reply({ ok: false, status: 'error', error: 'invalid_input' }, 400);
  }
}
