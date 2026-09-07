import { randomUUID } from 'node:crypto';
import { COACH_CONVERSATION_VERSION } from './contracts';
import type { CoachCapability, CoachConversationResponse, CoachErrorCode } from './contracts';
import { conversationRequestSchema } from './schema';
import { run } from './index';
import type { RunOptions } from './index';
import { windowFor } from './context';
import { COACH_PRICING_VERSION } from './economics';
import { COACH_PROMPT_VERSION } from './prompt.v3';

/** History is a hint for a window/domain, never a source of facts or authority. */
export async function runConversation(raw: unknown, options: RunOptions): Promise<CoachConversationResponse> {
  const start = performance.now();
  const parsed = conversationRequestSchema.safeParse(raw);
  const response: CoachConversationResponse = {
    version: COACH_CONVERSATION_VERSION, conversationId: parsed.success ? parsed.data.conversationId : '',
    turnId: parsed.success ? parsed.data.turnId : '', ok: false, mode: options.mode,
    dataSource: options.repository.dataSource, snapshot: null, evidence: [], proposals: [], receipts: [], attachments: [],
    telemetry: {model:null,provider:null,promptVersion:COACH_PROMPT_VERSION,modelCalls:0,dataReads:0,tokensIn:0,tokensOut:0,reasoningTokens:0,cacheReadTokens:0,cacheWriteTokens:0,latencyMs:0,costUsd:0,pricingVersion:COACH_PRICING_VERSION},
  };
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('cancelled'));
  if(options.signal.aborted) abort(); else options.signal.addEventListener('abort',abort,{once:true});
  const budget = Math.min(45000,Math.max(1,options.deadlineMs ?? 45000));
  const timer = setTimeout(()=>controller.abort(new Error('deadline')),budget);
  let boundary: (()=>void) | undefined;
  try {
    if(!parsed.success) throw new Error('invalid_input');
    const input = parsed.data;
    const work = async () => {
      controller.signal.throwIfAborted();
      const subject = input.context?.clientId ?? options.actorId;
      const authorized = await options.repository.authorize(options.actorId,subject,controller.signal);
      controller.signal.throwIfAborted();
      if(authorized.actorId !== options.actorId || authorized.subjectId !== subject) throw new Error('forbidden');
      // A captured scope cannot silently switch between initial authorization
      // and any subsequent content read, including changes of timezone/tenant.
      const repository = {...options.repository, authorize: async (actor:string,client:string,signal:AbortSignal) => {
        const fresh = await options.repository.authorize(actor,client,signal);
        if(JSON.stringify(fresh)!==JSON.stringify(authorized)) throw new Error('forbidden');
        return fresh;
      }};
      const text = input.message.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase();
      const previous = [...(input.history ?? [])].reverse().find(item=>item.role==='user')?.text.toLowerCase() ?? '';
      const followUp = /^(and|what about|how about|y |¿?y |et |also|tambien)\b/.test(text);
      const hint = followUp ? `${previous}\n${text}` : text;
      const intent = /today|hoy|aujourd|σημερα/.test(hint) ? 'today' : 'week';
      const surface = input.context?.includeScreen ? input.context.surface : null;
      const exerciseId = input.context?.includeScreen && input.context.entity?.kind === 'exercise' ? input.context.entity.id : undefined;
      const result = await run({message:input.message,intent,clientId:input.context?.clientId,exerciseId}, {
        ...options, repository, signal:controller.signal, deadlineMs:Math.max(1,budget-(performance.now()-start)),
      });
      controller.signal.throwIfAborted();
      response.telemetry = result.telemetry;
      if(!result.ok) { response.error=result.error; return; }
      const mentionsFood = /food|meal|nutri|calori|protein|comid|aliment|recip|recet/.test(hint);
      const mentionsWorkout = /workout|train|exercise|sets|reps|entren|ejerc|series|plan/.test(hint);
      const foodOnly = mentionsFood && !mentionsWorkout || !mentionsFood && !mentionsWorkout && ['food','recipe'].includes(surface ?? '');
      const workoutOnly = mentionsWorkout && !mentionsFood || !mentionsFood && !mentionsWorkout && ['workout','plan','live','library','exercise','atlas'].includes(surface ?? '');
      response.evidence = result.evidence.filter(f=>foodOnly ? f.source==='nutrition' : workoutOnly ? f.source!=='nutrition' : true);
      const medical = result.output?.escalation.required && ['urgent_symptoms','medical_question','medical_context'].includes(result.output.escalation.reason ?? '');
      const capabilities: CoachCapability[] = [
        ...(['food_records','workout_records','active_plan'] as const).map(key=>({key,status:result.evidence.some(f=>key==='food_records'?f.source==='nutrition':key==='active_plan'?f.source==='plan':f.source==='workout')?'available' as const:'unknown' as const,reason:result.evidence.some(f=>key==='food_records'?f.source==='nutrition':key==='active_plan'?f.source==='plan':f.source==='workout')?'authorized_records':'no_supported_records'})),
        {key:'screen_entity',status:exerciseId && result.evidence.some(f=>f.source==='exercise')?'available':'not_connected',reason:exerciseId?'curated_exercise_lookup':'entity_detail_not_connected'},
        ...(['model','profile','memory','images','voice','actions'] as const).map(key=>({key,status:'not_connected' as const,reason:key==='model'?'paid_provider_disabled':'service_not_connected'})),
      ];
      response.snapshot = {id:randomUUID(),capturedAt:options.now.toISOString(),subjectId:authorized.subjectId,organizationId:authorized.organizationId,surface,screenIncluded:surface!==null,language:authorized.language,units:{weight:'kg',energy:'kcal',protein:'g'},window:windowFor(intent,authorized.timezone,options.now),capabilities};
      response.attachments = (input.attachments ?? []).map(item=>({...item,status:'not_connected'}));
      const facts = response.evidence.map(f=>f.statement).join('\n');
      response.output = {...result.output!,evidenceRefs:response.evidence.map(f=>f.id),answer:medical ? result.output!.answer : `${options.repository.dataSource==='synthetic'?'Synthetic example records. ':''}Offline record summary; no AI model interpreted your message.\n${facts || 'There are no supported records for this scope.'}\nI can show recorded facts, but open-ended interpretation is not connected. No record was changed.`,limitations:[...result.output!.limitations,'conversation_history_not_evidence','open_ended_interpretation_not_connected',...(input.attachments?.length?['attachments_not_processed']:[])]};
      response.ok = true;
    };
    await Promise.race([work(),new Promise<never>((_,reject)=>{
      boundary=()=>reject(controller.signal.reason);
      controller.signal.addEventListener('abort',boundary,{once:true});
      if(controller.signal.aborted)boundary();
    })]);
  } catch(error) {
    const allowed = ['invalid_input','forbidden','unauthenticated','invalid_timezone','budget_blocked'];
    const code: CoachErrorCode = controller.signal.aborted ? options.signal.aborted?'cancelled':'deadline' : error instanceof Error && allowed.includes(error.message)?error.message as CoachErrorCode:'query_failed';
    response.error={code,retryable:code==='query_failed'||code==='deadline'};
    response.ok=false;response.snapshot=null;response.evidence=[];delete response.output;
  } finally {
    clearTimeout(timer);options.signal.removeEventListener('abort',abort);
    if(boundary)controller.signal.removeEventListener('abort',boundary);
    response.telemetry.latencyMs=Math.round(performance.now()-start);
  }
  return response;
}
