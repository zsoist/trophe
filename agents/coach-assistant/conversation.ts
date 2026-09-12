import { medicalBoundary } from './medical-boundary';
import { prepareConversationCapability } from './capability-conversation';
import type { CoachCapabilityRegistry } from './capability-registry';
import { parseFoodPreferences } from '@/lib/food/preferences';
import { createSelectionContext } from './selection-context';
import { isIsolatedEngineBoundary, type IsolatedEngineBoundary } from './isolated-engine-boundary';
import { isGovernedPilotBoundary, type GovernedPilotBoundary } from './governed-engine-boundary';
import { generateOpenConversation, OpenConversationOutputError, type ConversationFoodChange, type ConversationFoodSelection, type ConversationPhotoObservation, type OfflineConversationProvider, type OfflineInterpretationReview } from './open-conversation';
import { createHash, randomUUID } from 'node:crypto';
import { selectConversationScope, evidenceMatchesScope } from './conversation-scope';
import { COACH_CONVERSATION_VERSION } from './contracts';
import type { CoachCapability, CoachConversationResponse, CoachErrorCode } from './contracts';
import { conversationRequestSchema } from './schema';
import { run } from './index';
import type { RunOptions } from './index';
import { conversationScope, scopeConversationInput, windowForConversation } from './context';
import { workoutPreferencesSchema } from '@/lib/workout/preferences';
import { COACH_PRICING_VERSION } from './economics';
import { COACH_PROMPT_VERSION } from './prompt.v3';

const disconnectedSurfaceCapabilities = (): CoachCapability[] =>
  (['messages', 'intake', 'booking', 'supplements', 'form_check'] as const)
    .map(key => ({ key, status: 'not_connected', reason: `${key}_service_not_connected` }));

/** History is a hint for a window/domain, never a source of facts or authority. */
export async function runConversation(raw: unknown, options: RunOptions & { capabilityRegistry?:CoachCapabilityRegistry; isolatedActionsEnabled?:boolean; workoutSetIntentsEnabled?:boolean; foodQuantityIntentsEnabled?:boolean; foodSelection?:ConversationFoodSelection; foodChange?:ConversationFoodChange; offlineConversationProvider?:OfflineConversationProvider; offlineInterpretationReview?:OfflineInterpretationReview; offlineCandidateEvaluation?:boolean; isolatedFixtureBoundary?:IsolatedEngineBoundary; governedPilotBoundary?:GovernedPilotBoundary; candidateActionsEnabled?:boolean; filterMemoryHistory?:(input:import('./contracts').CoachConversationRequest)=>import('./contracts').CoachConversationRequest; resolvePhotoObservations?:(input:import('./contracts').CoachConversationRequest,signal:AbortSignal)=>Promise<ConversationPhotoObservation[]> }): Promise<CoachConversationResponse> {
  const start = performance.now();
  const parsed = conversationRequestSchema.safeParse(raw);
  const response: CoachConversationResponse = {
    version: COACH_CONVERSATION_VERSION, conversationId: parsed.success ? parsed.data.conversationId : '',
    turnId: parsed.success ? parsed.data.turnId : '', ok: false, mode: options.mode,
    dataSource: options.repository.dataSource, snapshot: null, evidence: [], proposals: [], actionIntents: [], receipts: [], attachments: [],
    telemetry: {model:null,provider:null,promptVersion:COACH_PROMPT_VERSION,modelCalls:0,dataReads:0,tokensIn:0,tokensOut:0,reasoningTokens:0,cacheReadTokens:0,cacheWriteTokens:0,latencyMs:0,costUsd:0,pricingVersion:COACH_PRICING_VERSION},
  };
  const controller = new AbortController();
  const abort = () => controller.abort(new Error('cancelled'));
  if(options.signal.aborted) abort(); else options.signal.addEventListener('abort',abort,{once:true});
  const ceiling=parsed.success&&parsed.data.attachments?.length===1&&parsed.data.attachments[0].kind==='image'?90000:45000;
  const budget = Math.min(ceiling,Math.max(1,options.deadlineMs ?? ceiling));
  const timer = setTimeout(()=>controller.abort(new Error('deadline')),budget);
  let boundary: (()=>void) | undefined;
  try {
    if(!parsed.success) throw new Error('invalid_input');
    const input = parsed.data;
    const work = async () => {
      controller.signal.throwIfAborted();
      if(options.mode==='model'&&(!options.offlineConversationProvider||options.repository.dataSource!=='synthetic'&&!isIsolatedEngineBoundary(options.isolatedFixtureBoundary,options.offlineConversationProvider)&&!isGovernedPilotBoundary(options.governedPilotBoundary,options.offlineConversationProvider)))throw new Error('budget_blocked');
      const subject = input.context?.clientId ?? options.actorId;
      const authorized = await options.repository.authorize(options.actorId,subject,controller.signal);
      controller.signal.throwIfAborted();
      if(authorized.actorId !== options.actorId || authorized.subjectId !== subject) throw new Error('forbidden');
      const scope = conversationScope(authorized);
      const scopedInput = scopeConversationInput(input, authorized);
      // A captured scope cannot silently switch between initial authorization
      // and any subsequent content read, including changes of timezone/tenant.
      const authorizedRepository = {...options.repository, authorize: async (actor:string,client:string,signal:AbortSignal) => {
        const fresh = await options.repository.authorize(actor,client,signal);
        if(JSON.stringify(fresh)!==JSON.stringify(authorized)) throw new Error('forbidden');
        return fresh;
      }};
      let photoObservations:ConversationPhotoObservation[]=[];
      if(scopedInput.attachments?.length){
        if(options.mode!=='model'||!options.resolvePhotoObservations)throw new Error('attachment_analysis_failed');
        photoObservations=await options.resolvePhotoObservations(scopedInput,controller.signal);
        if(photoObservations.length!==scopedInput.attachments.length)throw new Error('attachment_analysis_failed');
        await authorizedRepository.authorize(options.actorId,subject,controller.signal);controller.signal.throwIfAborted();
      }
      if(options.capabilityRegistry&&options.mode==='model'&&!Object.values(medicalBoundary(scopedInput.message)).some(Boolean)){
        const selectorInput=options.filterMemoryHistory?.(scopedInput)??{...scopedInput,history:scopedInput.history?.filter(item=>item.role==='user'&&item.kind!=='memory_summary')};
        const selectedScope=selectConversationScope(selectorInput);
        response.snapshot={id:randomUUID(),capturedAt:options.now.toISOString(),subjectId:subject,organizationId:authorized.organizationId,...scope,surface:scopedInput.context?.includeScreen?scopedInput.context.surface:null,screenIncluded:!!scopedInput.context?.includeScreen,language:authorized.language,units:{weight:'kg',energy:'kcal',protein:'g'},window:windowForConversation(scopedInput,selectedScope.intent,selectedScope.domain,authorized.timezone,options.now),capabilities:[]};
        response.output={answer:'',evidenceRefs:[],limitations:['capability_turn_no_aggregate_reads'],suggestions:[],escalation:{required:false,reason:null,draft:null}};
        await prepareConversationCapability(selectorInput,response,options.offlineConversationProvider!,options.capabilityRegistry,authorizedRepository,authorized,controller.signal);
        if(response.capabilityResult?.tool!=='none'){
          await generateOpenConversation(selectorInput,response,options.offlineConversationProvider!,controller.signal,options.offlineInterpretationReview,options.offlineCandidateEvaluation,options.isolatedFixtureBoundary,false,false,options.governedPilotBoundary,options.candidateActionsEnabled,undefined,photoObservations);
          await authorizedRepository.authorize(options.actorId,subject,controller.signal);controller.signal.throwIfAborted();response.ok=true;return;
        }
      }
      const selection=createSelectionContext(authorizedRepository,scopedInput.context,authorized);
      const repository=selection.repository;
      const {intent,surface,exerciseId,domain}=selectConversationScope(options.filterMemoryHistory?.(scopedInput)??scopedInput);
      const selectedWindow=windowForConversation(scopedInput,intent,domain,authorized.timezone,options.now);
      const result = await run({message:scopedInput.message,intent,clientId:scopedInput.context?.clientId,exerciseId}, {
        ...options, mode:'offline', repository, window:selectedWindow, signal:controller.signal, deadlineMs:Math.max(1,budget-(performance.now()-start)),
      });
      controller.signal.throwIfAborted();
      const priorTelemetry=response.telemetry;response.telemetry={...result.telemetry};
      for(const key of ['modelCalls','dataReads','tokensIn','tokensOut','reasoningTokens','cacheReadTokens','cacheWriteTokens'] as const)response.telemetry[key]+=priorTelemetry[key];
      if(response.telemetry.dataReads>4)throw new Error('context_limit');
      if(!result.ok) { response.error=result.error; return; }
      response.evidence = result.evidence.filter(f=>evidenceMatchesScope(f.source,domain));
      if(options.foodChange&&domain==='food') {
        const change=options.foodChange;
        const sourceIds=[change.entryId,change.receiptId],window=selectedWindow;
        const changeEvidence=[
          {id:'food.change.previousQuantity',source:'nutrition' as const,sourceIds,window,completeness:'complete' as const,statement:`The previous confirmed Food quantity was ${change.previousGrams} g.`,value:change.previousGrams,unit:'g'},
          {id:'food.change.currentQuantity',source:'nutrition' as const,sourceIds,window,completeness:'complete' as const,statement:`The confirmed Food quantity is ${change.grams} g. This is the canonical refetched state after the applied receipt.`,value:change.grams,unit:'g'},
        ];
        const ids=new Set(changeEvidence.map(item=>item.id));response.evidence=[...changeEvidence,...response.evidence.filter(item=>!ids.has(item.id))].slice(0,24);
      }
      const medical = result.output?.escalation.required && ['urgent_symptoms','medical_question','medical_context'].includes(result.output.escalation.reason ?? '');
      const capabilities: CoachCapability[] = [
        ...(['food_records','workout_records','active_plan'] as const).map(key=>({key,status:result.evidence.some(f=>key==='food_records'?f.source==='nutrition':key==='active_plan'?f.source==='plan':f.source==='workout')?'available' as const:'unknown' as const,reason:result.evidence.some(f=>key==='food_records'?f.source==='nutrition':key==='active_plan'?f.source==='plan':f.source==='workout')?'authorized_records':'no_supported_records'})),
        {key:'screen_entity',status:exerciseId && result.evidence.some(f=>f.source==='exercise')?'available':'not_connected',reason:exerciseId?'curated_exercise_lookup':'entity_detail_not_connected'},
        ...(['model','profile','memory','images','voice','actions','progress'] as const).map(key=>({key,status:'not_connected' as const,reason:key==='model'?'paid_provider_disabled':'service_not_connected'})),
        ...disconnectedSurfaceCapabilities(),
      ];
      response.snapshot = {id:randomUUID(),capturedAt:options.now.toISOString(),subjectId:authorized.subjectId,organizationId:authorized.organizationId,...scope,surface,screenIncluded:surface!==null,language:authorized.language,units:{weight:'kg',energy:'kcal',protein:'g'},window:selectedWindow,capabilities};
      response.snapshot.selection=selection.snapshot();
      if(photoObservations.length){const images=capabilities.find(c=>c.key==='images')!;images.status='available';images.reason='validated_photo_analysis';}
      if(response.snapshot.selection){const screen=capabilities.find(c=>c.key==='screen_entity')!;screen.status='available';screen.reason='server_resolved_selection';}
      response.attachments = (scopedInput.attachments ?? []).map(item=>({...item,status:'not_connected'}));
      const facts = response.evidence.map(f=>f.statement).join('\n');
      response.output = {...result.output!,evidenceRefs:response.evidence.map(f=>f.id),answer:medical ? result.output!.answer : `${options.repository.dataSource==='synthetic'?'Synthetic example records. ':''}Offline record summary; no AI model interpreted your message.\n${facts || 'There are no supported records for this scope.'}\nI can show recorded facts, but open-ended interpretation is not connected. No record was changed.`,limitations:[...result.output!.limitations,'conversation_history_not_evidence','open_ended_interpretation_not_connected',...(scopedInput.attachments?.length?['attachments_not_processed']:[])]};
      if(repository.personalContext && response.telemetry.dataReads < 4 && !medical) {
        const window=response.snapshot.window;
        const context=await repository.authorize(options.actorId,subject,controller.signal);
        response.telemetry.dataReads++;
        const personal=await repository.personalContext({context,window,limit:1,signal:controller.signal});
        await repository.authorize(options.actorId,subject,controller.signal);
        controller.signal.throwIfAborted();
        if(personal.rows.length>1||personal.truncated)throw new Error('query_failed');
        const row=personal.rows[0];
        if(row) {
          if(row.userId!==subject || row.memories.some(memory=>memory.userId!==subject))throw new Error('forbidden');
          if(row.foodPreference){
            if(row.foodPreference.profileId!==subject)throw new Error('forbidden');
            response.foodPreference={...row.foodPreference,preferences:parseFoodPreferences(row.foodPreference.preferences)};
          }
          const preferences=workoutPreferencesSchema.safeParse(row.preferences);
          if(preferences.success) {
            response.profile={language:authorized.language,timezone:authorized.timezone,units:response.snapshot.units,preferences:{durationMinutes:preferences.data.durationMinutes},version:row.preferencesVersion??createHash('sha256').update(JSON.stringify(preferences.data)).digest('hex'),source:options.repository.dataSource==='synthetic'?'isolated_fixture':'authorized_profile'};
            const capability=capabilities.find(c=>c.key==='profile')!;capability.status='available';capability.reason='authorized_stored_preferences';
            if(options.isolatedActionsEnabled && subject===options.actorId && options.repository.dataSource==='authorized_records') {
              const actions=capabilities.find(c=>c.key==='actions')!;actions.status='available';actions.reason='isolated_ephemeral_self_preferences';
            }
          } else {const capability=capabilities.find(c=>c.key==='profile')!;capability.status='unknown';capability.reason='preferences_not_recorded';}
          if(row.memoriesRead!==false) {
          response.memories=row.memories.slice(0,10).map(memory=>({id:memory.id,text:memory.text.slice(0,500),source:memory.source,createdAt:memory.createdAt,scope:memory.scope,version:memory.version,confirmation:memory.confirmation??'unconfirmed'}));
          const memoryCapability=capabilities.find(c=>c.key==='memory')!;memoryCapability.status=response.memories.length?'available':'unknown';memoryCapability.reason=response.memories.length?(response.memories.every(m=>m.confirmation==='confirmed')?'authorized_confirmed_thread_memories':'authorized_unconfirmed_memories'):'no_active_memories';
          response.output.limitations.push(...(options.filterMemoryHistory?['memory_scope_current_thread','user_history_is_historical_not_current_preference','stale_derived_history_excluded']:['memory_requires_explicit_confirmation','memory_window_365_days']));
          if(row.memories.length>10)response.output.limitations.push('memory_records_partial');
          }
        }
      }
      if(options.mode==='model'&&!medical) {
        await generateOpenConversation(options.filterMemoryHistory?.(scopedInput)??scopedInput,response,options.offlineConversationProvider!,controller.signal,options.offlineInterpretationReview,options.offlineCandidateEvaluation,options.isolatedFixtureBoundary,options.workoutSetIntentsEnabled,options.foodQuantityIntentsEnabled,options.governedPilotBoundary,options.candidateActionsEnabled,options.foodSelection,photoObservations);
        await repository.authorize(options.actorId,subject,controller.signal);
        controller.signal.throwIfAborted();
      }
      response.ok = true;
    };
    await Promise.race([work(),new Promise<never>((_,reject)=>{
      boundary=()=>reject(controller.signal.reason);
      controller.signal.addEventListener('abort',boundary,{once:true});
      if(controller.signal.aborted)boundary();
    })]);
  } catch(error) {
    if(error instanceof OpenConversationOutputError){
      const qaDiagnostic=process.env.COACH_ASSISTANT_OUTPUT_DIAGNOSTICS_ENABLED==='1'&&process.env.VERCEL_ENV==='preview'&&error.diagnostic
        ?{...error.diagnostic,correlation:createHash('sha256').update(`${response.conversationId}:${response.turnId}`).digest('hex').slice(0,16)}
        :undefined;
      console.warn(JSON.stringify({event:'coach_conversation_output_rejected',code:error.diagnosticCode,...(qaDiagnostic?{diagnostic:qaDiagnostic}:{})}));
    }
    const allowed = ['invalid_input','forbidden','unauthenticated','invalid_timezone','budget_blocked','context_limit','invalid_output','provider_unavailable','attachment_analysis_failed'];
    const code: CoachErrorCode = controller.signal.aborted ? options.signal.aborted?'cancelled':'deadline' : error instanceof Error && allowed.includes(error.message)?error.message as CoachErrorCode:'query_failed';
    response.error={code,retryable:code==='query_failed'||code==='deadline'||code==='provider_unavailable'||code==='attachment_analysis_failed'};
    response.ok=false;response.snapshot=null;response.evidence=[];response.actionIntents=[];delete response.capabilityResult;delete response.output;delete response.profile;delete response.foodPreference;delete response.memories;delete response.explanations;
  } finally {
    clearTimeout(timer);options.signal.removeEventListener('abort',abort);
    if(boundary)controller.signal.removeEventListener('abort',boundary);
    response.telemetry.latencyMs=Math.round(performance.now()-start);
  }
  return response;
}
