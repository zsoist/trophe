import { createFoodPreferenceTurn } from './food-preference-turn';
import { executeProgressAction, type ProgressService } from './progress-actions';
import { runDurableChatTurn } from './chat-turn';
import { executeCoachChatAction } from './chat-actions';
import type { createCoachChatService } from './chat-service';
import { executeFoodPreferenceAction, type FoodPreferenceService } from './food-preference-actions';
import { createPersistentMemoryTurn } from './memory-turn';
import { executePersistentMemoryAction } from './memory-actions';
import type { PersistentMemoryService } from './memory-contracts';
import type { createIsolatedCoachEngineBinding } from './isolated-engine';
import type { GovernedCoachEngineBinding } from './governed-engine';
import { runConversationCandidate } from './conversation-candidate';
import type { PilotTransport } from './pilot-runner';
import { executeFoodQuantityAction, type FoodQuantityService } from './food-actions';
import { executePhotoFoodAction, type PhotoFoodService } from './photo-food-actions';
import { executeWorkoutSetAction, type WorkoutSetService } from './set-actions';
import { executeCoachMessageAction, type CoachMessageService } from './message-actions';
import { createCoachCapabilityRegistry } from './capability-registry';
import { executeDurablePreferenceAction, withDurablePreferenceRead, type DurableCoachProfileService } from './durable-actions';
import { run } from './index';
import { runConversation } from './conversation';
import type { ConversationFoodChange, ConversationFoodSelection } from './open-conversation';
import { isolatedActionsBroker } from './isolated-actions';
import { requestSchema, conversationRequestSchema } from './schema';
import { fixtureRepository } from './fixtures';
import { COACH_IMAGE_LIMITS, type CoachErrorCode, type CoachResponse } from './contracts';
import type { CoachRepository } from './repository';
import { COACH_PRICING_VERSION } from './economics';
import { COACH_PROMPT_VERSION } from './prompt.v3';

interface HandlerDependencies {
  env: Record<string,string|undefined>;
  guard(request: Request): Promise<{userId:string}|Response>;
  createRepository(): CoachRepository | Promise<CoachRepository>;
  createDurableService?:()=>DurableCoachProfileService|Promise<DurableCoachProfileService>;
  createFoodPreferenceService?:()=>FoodPreferenceService|Promise<FoodPreferenceService>;
  createMemoryService?:()=>PersistentMemoryService|Promise<PersistentMemoryService>;
  createChatService?:()=>ReturnType<typeof createCoachChatService>|Promise<ReturnType<typeof createCoachChatService>>;
  createFoodService?:()=>FoodQuantityService|Promise<FoodQuantityService>;
  createPhotoFoodService?:(operation:unknown)=>PhotoFoodService|Promise<PhotoFoodService>;
  createProgressService?:()=>ProgressService|Promise<ProgressService>;
  createWorkoutSetService?:()=>WorkoutSetService|Promise<WorkoutSetService>;
  createMessageService?:()=>CoachMessageService|Promise<CoachMessageService>;
  isolatedEngine?:ReturnType<typeof createIsolatedCoachEngineBinding>;
  createIsolatedEngine?:()=>ReturnType<typeof createIsolatedCoachEngineBinding>|Promise<ReturnType<typeof createIsolatedCoachEngineBinding>>;
  createGovernedEngine?:(actorId:string)=>GovernedCoachEngineBinding|Promise<GovernedCoachEngineBinding>;
  candidateEvaluation?:{kind:'injected_fixture';transport:PilotTransport};
  now?: () => Date;
}
const json = (body: unknown, status: number) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
function fail(code: CoachErrorCode,status: number): Response {
  const body: CoachResponse = { version:'coach-assistant.v1',ok:false,mode:'offline',dataSource:'authorized_records',evidence:[],
    error:{code,retryable:['rate_limited','query_failed','provider_unavailable','deadline'].includes(code)},telemetry:{model:null,provider:null,promptVersion:COACH_PROMPT_VERSION,modelCalls:0,dataReads:0,
      tokensIn:0,tokensOut:0,reasoningTokens:0,cacheReadTokens:0,cacheWriteTokens:0,latencyMs:0,costUsd:0,pricingVersion:COACH_PRICING_VERSION} };
  return json(body,status);
}
async function readBytes(request: Request,signal:AbortSignal,limit=8192): Promise<Uint8Array> {
  const reader=request.body?.getReader();
  if (!reader) throw new Error('invalid_input');
  const chunks: Uint8Array[]=[]; let size=0;
  const cancel=()=>{void reader.cancel().catch(()=>{});};
  signal.addEventListener('abort',cancel,{once:true});
  try {
    for (;;) {
      signal.throwIfAborted();
      const {done,value}=await reader.read();
      if(done) break;
      size+=value.length;
      if(size>limit){cancel();throw new Error('invalid_input');}
      chunks.push(value);
    }
    const bytes=new Uint8Array(size); let offset=0;
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return bytes;
  } finally {signal.removeEventListener('abort',cancel);reader.releaseLock();}
}

async function readBody(request:Request,signal:AbortSignal):Promise<unknown> {
  const bytes=await readBytes(request,signal);
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}
  catch{throw new Error('invalid_input');}
}

export async function handleCoachRequest(request: Request,deps: HandlerDependencies): Promise<Response> {
  if(deps.env.COACH_ASSISTANT_ENABLED!=='1'||deps.env.VERCEL_ENV==='production')return fail('disabled',404);
  const controller=new AbortController();
  const cancel=()=>controller.abort(new Error('cancelled'));
  if(request.signal.aborted)cancel();else request.signal.addEventListener('abort',cancel,{once:true});
  const timer=setTimeout(()=>controller.abort(new Error('deadline')),45000);
  const start=performance.now();
  let abortBoundary:(()=>void)|undefined;
  try {
    const work=async()=>{
      controller.signal.throwIfAborted();
      const guard=await deps.guard(request);
      controller.signal.throwIfAborted();
      if(guard instanceof Response) {
        if(guard.status===401)return fail('unauthenticated',401);
        if(guard.status===403)return fail('forbidden',403);
        if(guard.status===429) {
          const response=fail('rate_limited',429);
          const retryAfter=guard.headers.get('Retry-After');
          if(retryAfter&&/^\d{1,6}$/.test(retryAfter))response.headers.set('Retry-After',retryAfter);
          return response;
        }
        return fail('provider_unavailable',503);
      }
      const allowed=(deps.env.COACH_ASSISTANT_PREVIEW_USER_IDS??'').split(',').map(s=>s.trim()).filter(Boolean);
      if(!allowed.includes(guard.userId))return fail('forbidden',403);
      if(request.method==='PUT') {
        if(deps.env.COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED!=='1')return fail('disabled',404);
        const repository=await deps.createRepository();
        const initial=await repository.authorize(guard.userId,guard.userId,controller.signal);
        if(initial.actorId!==guard.userId||initial.subjectId!==guard.userId)return fail('forbidden',403);
        const authorize=async()=>{const fresh=await repository.authorize(guard.userId,guard.userId,controller.signal);if(JSON.stringify(fresh)!==JSON.stringify(initial))throw new Error('forbidden');};
        controller.signal.throwIfAborted();
        const bytes=await readBytes(request,controller.signal,COACH_IMAGE_LIMITS.fileBytes);
        const {isolatedAttachmentStore}=await import('./isolated-attachments');
        const result=await isolatedAttachmentStore.upload(`${guard.userId}:${initial.organizationId}`,request.headers.get('x-coach-conversation-id')??'',request.headers.get('x-coach-attachment-id')??'',request.headers.get('x-coach-upload-token')??'',bytes,controller.signal,authorize);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='busy'?409:400);
      }
      const raw=await readBody(request,controller.signal);
      if(raw && typeof raw==='object' && 'version' in raw && raw.version==='coach-assistant.chat.v1') {
        if(deps.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createChatService)return fail('provider_unavailable',503);
        const result=await executeCoachChatAction(guard.userId,raw,await deps.createRepository(),await deps.createChatService(),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='not_found'?404:result.error==='not_connected'||result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('attachment.')) {
        if(deps.env.COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED!=='1')return fail('disabled',404);
        const context=await (await deps.createRepository()).authorize(guard.userId,guard.userId,controller.signal);
        if(context.actorId!==guard.userId||context.subjectId!==guard.userId)return fail('forbidden',403);
        const {isolatedAttachmentStore}=await import('./isolated-attachments');
        controller.signal.throwIfAborted();
        const result=isolatedAttachmentStore.operation(`${guard.userId}:${context.organizationId}`,raw);
        return json(result,result.ok?200:result.error==='forbidden'?403:400);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('food.')) {
        if(deps.env.COACH_ASSISTANT_FOOD_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createFoodService)return fail('provider_unavailable',503);
        const result=await executeFoodQuantityAction(guard.userId,raw,await deps.createRepository(),await deps.createFoodService(),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('photo.food.')) {
        if(deps.env.COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createPhotoFoodService)return fail('provider_unavailable',503);
        const result=await executePhotoFoodAction(guard.userId,raw,await deps.createRepository(),await deps.createPhotoFoodService(raw),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='not_connected'||result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('diet.')) {
        if(deps.env.COACH_ASSISTANT_DIET_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createFoodPreferenceService)return fail('provider_unavailable',503);
        const result=await executeFoodPreferenceAction(guard.userId,raw,await deps.createRepository(),await deps.createFoodPreferenceService(),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='not_connected'||result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && (raw.operation==='progress.read'||raw.operation.startsWith('measurement.'))) {
        if(deps.env.COACH_ASSISTANT_PROGRESS_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createProgressService)return fail('provider_unavailable',503);
        const result=await executeProgressAction(guard.userId,raw,await deps.createRepository(),await deps.createProgressService(),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='not_connected'||result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('set.')) {
        if(deps.env.COACH_ASSISTANT_WORKOUT_SET_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createWorkoutSetService)return fail('provider_unavailable',503);
        const result=await executeWorkoutSetAction(guard.userId,raw,await deps.createRepository(),await deps.createWorkoutSetService(),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('message.')) {
        if(deps.env.COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createMessageService)return fail('provider_unavailable',503);
        const result=await executeCoachMessageAction(guard.userId,raw,await deps.createRepository(),await deps.createMessageService(),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='not_connected'||result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      if(raw && typeof raw==='object' && 'operation' in raw && typeof raw.operation==='string' && raw.operation.startsWith('memory.')) {
        if(deps.env.COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        if(!deps.createMemoryService)return fail('provider_unavailable',503);
        const result=await executePersistentMemoryAction(guard.userId,raw,await deps.createRepository(),await deps.createMemoryService(),controller.signal);
        return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='uncertain'||result.error==='cancelled'?503:409);
      }
      const durable=deps.env.COACH_ASSISTANT_DURABLE_ACTIONS_ENABLED==='1';
      if(raw && typeof raw==='object' && 'operation' in raw) {
        if(durable) {
          if(!deps.createDurableService)return fail('provider_unavailable',503);
          const result=await executeDurablePreferenceAction(guard.userId,raw,await deps.createRepository(),await deps.createDurableService(),controller.signal);
          return json(result,result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='uncertain'||result.error==='cancelled'?503:409);
        }
        if(deps.env.COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED!=='1')return fail('disabled',404);
        const result=await isolatedActionsBroker.execute(guard.userId,raw,await deps.createRepository(),controller.signal);
        const status=result.ok?200:result.error==='forbidden'?403:result.error==='invalid_input'?400:result.error==='expired'?410:result.error==='not_found'?404:result.error==='uncertain'?503:409;
        return json(result,status);
      }
      const parsed=conversationRequestSchema.or(requestSchema).safeParse(raw);
      if(!parsed.success)return fail('invalid_input',400);
      const synthetic=deps.env.COACH_ASSISTANT_DATA_SOURCE==='synthetic';
      const conversational='version' in parsed.data;
      const clientId='version' in parsed.data?parsed.data.context?.clientId:parsed.data.clientId;
      if(synthetic&&clientId)return fail('forbidden',403);
      let repository=synthetic?fixtureRepository():await deps.createRepository();
      if(durable&&conversational&&!synthetic&&(!clientId||clientId===guard.userId)) {
        if(!deps.createDurableService)return fail('provider_unavailable',503);
        repository=withDurablePreferenceRead(repository,await deps.createDurableService());
      }
      let memoryTurn:ReturnType<typeof createPersistentMemoryTurn>|undefined;
      if(conversational&&!synthetic&&deps.env.COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED==='1') {
        if(!deps.createMemoryService)return fail('provider_unavailable',503);
        if(clientId&&clientId!==guard.userId)return fail('forbidden',403);
        memoryTurn=createPersistentMemoryTurn(repository,await deps.createMemoryService(),parsed.data as import('./contracts').CoachConversationRequest);
        repository=memoryTurn.repository;
      }
      let foodPreferenceTurn:ReturnType<typeof createFoodPreferenceTurn>|undefined;
      if(conversational&&!synthetic&&deps.env.COACH_ASSISTANT_DIET_ACTIONS_ENABLED==='1') {
        if(!deps.createFoodPreferenceService)return fail('provider_unavailable',503);
        if(clientId&&clientId!==guard.userId)return fail('forbidden',403);
        foodPreferenceTurn=createFoodPreferenceTurn(repository,await deps.createFoodPreferenceService(),parsed.data as import('./contracts').CoachConversationRequest);
        repository=foodPreferenceTurn.repository;
      }
      // Only the outer broker signs/filters; double filtering discards valid continuity.
      const historyTurn=foodPreferenceTurn??memoryTurn;
      let capabilityRegistry:ReturnType<typeof createCoachCapabilityRegistry>|undefined;
      if(conversational&&!synthetic&&deps.env.COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED==='1') {
        if(clientId&&clientId!==guard.userId)return fail('forbidden',403);
        if(!deps.createMessageService)return fail('provider_unavailable',503);
        capabilityRegistry=createCoachCapabilityRegistry({message:await deps.createMessageService()});
      }
      const isolatedRequested=conversational&&deps.env.COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED==='1';
      const candidateRequested=conversational&&deps.env.COACH_ASSISTANT_CANDIDATE_EVALUATION_ENABLED==='1';
      const liveRequested=conversational&&deps.env.COACH_ASSISTANT_LIVE_PILOT_ENABLED==='1';
      if([isolatedRequested,candidateRequested,liveRequested].filter(Boolean).length>1)return fail('budget_blocked',503);
      const isolated=isolatedRequested;
      if(isolated&&synthetic)return fail('budget_blocked',503);
      const isolatedEngine=isolated?(deps.isolatedEngine??await deps.createIsolatedEngine?.()):undefined;
      if(isolated&&!isolatedEngine)return fail('budget_blocked',503);
      const candidate=candidateRequested;
      if(candidate&&(!synthetic||deps.candidateEvaluation?.kind!=='injected_fixture'))return fail('budget_blocked',503);
      const live=liveRequested;
      if(live&&synthetic)return fail('budget_blocked',503);
      const governedEngine=live?await deps.createGovernedEngine?.(guard.userId):undefined;
      if(live&&!governedEngine)return fail('budget_blocked',503);
      let foodSelection:ConversationFoodSelection|undefined;
      let foodChange:ConversationFoodChange|undefined;
      let liveFoodService:FoodQuantityService|undefined;
      const conversationInput=conversational?parsed.data as import('./contracts').CoachConversationRequest:undefined;
      const selectedMeal=conversationInput?.context?.includeScreen===true&&conversationInput.context.entity?.kind==='meal'
        ?conversationInput.context.entity:undefined;
      if(live&&selectedMeal&&deps.env.COACH_ASSISTANT_FOOD_ACTIONS_ENABLED==='1'&&deps.createFoodService) {
        if(conversationInput!.context!.surface!=='food')foodSelection={status:'unavailable',reason:'incompatible_surface'};
        else {
          liveFoodService=await deps.createFoodService();
          const resolved=await executeFoodQuantityAction(guard.userId,{
            version:'coach-assistant.v2',conversationId:conversationInput!.conversationId,turnId:conversationInput!.turnId,
            operation:'food.resolve',entryHintId:selectedMeal.id,
          },repository,liveFoodService,controller.signal);
          foodSelection=resolved.ok&&'snapshot'in resolved&&resolved.snapshot.grams!==null
            ?{status:'resolved',snapshot:{entryId:resolved.snapshot.entryId,loggedDate:resolved.snapshot.loggedDate,grams:resolved.snapshot.grams,version:resolved.snapshot.version}}
            :{status:'unavailable',reason:resolved.ok?'version_conflict':['not_found','ambiguous_selection','version_conflict'].includes(resolved.error)?resolved.error as 'not_found'|'ambiguous_selection'|'version_conflict':'version_conflict'};
        }
      }
      const foodReceiptHint=conversationInput?.context?.foodReceipt;
      if(live&&foodReceiptHint&&foodSelection?.status==='resolved'&&foodReceiptHint.entryId===foodSelection.snapshot.entryId&&liveFoodService) {
        const recovered=await executeFoodQuantityAction(guard.userId,{
          version:'coach-assistant.v2',conversationId:conversationInput!.conversationId,turnId:conversationInput!.turnId,
          operation:'food.receipt',entryId:foodReceiptHint.entryId,actionId:foodReceiptHint.actionId,
        },repository,liveFoodService,controller.signal);
        if(recovered.ok&&'receipt'in recovered&&recovered.receipt.status==='applied'&&recovered.receipt.actionId===foodReceiptHint.actionId
          &&recovered.refresh?.entryId===foodSelection.snapshot.entryId&&recovered.refresh.version===foodSelection.snapshot.version
          &&recovered.change?.afterGrams===foodSelection.snapshot.grams) {
          foodChange={entryId:foodSelection.snapshot.entryId,receiptId:recovered.receipt.id,actionId:recovered.receipt.actionId,
            previousGrams:recovered.change.beforeGrams,grams:foodSelection.snapshot.grams,version:foodSelection.snapshot.version,loggedDate:foodSelection.snapshot.loggedDate};
        }
      }
      const durableChat=conversational&&deps.env.COACH_ASSISTANT_CHAT_HISTORY_ENABLED==='1';
      if(durableChat&&(synthetic||candidate||!deps.createChatService))return fail('provider_unavailable',503);
      const runOptions={
        capabilityRegistry,
        filterMemoryHistory:historyTurn?.filterHistory,
        offlineConversationProvider:candidate?deps.candidateEvaluation!.transport:undefined!,
        isolatedActionsEnabled:!durable&&deps.env.COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED==='1',
        workoutSetIntentsEnabled:deps.env.COACH_ASSISTANT_WORKOUT_SET_ACTIONS_ENABLED==='1'&&Boolean(deps.createWorkoutSetService),
        foodQuantityIntentsEnabled:deps.env.COACH_ASSISTANT_FOOD_ACTIONS_ENABLED==='1'&&Boolean(deps.createFoodService),
        foodSelection,
        foodChange,
        actorId:synthetic?'synthetic-client':guard.userId,
        repository,
        now:synthetic?new Date('2026-09-07T03:30:00Z'):(deps.now?.()??new Date()),
        signal:controller.signal,mode:(isolated||candidate||live||deps.env.COACH_ASSISTANT_MODE==='model'?'model':'offline') as 'model'|'offline',
        deadlineMs:Math.max(1,45000-(performance.now()-start)),
      };
      const persisted=durableChat?await runDurableChatTurn(parsed.data as import('./contracts').CoachConversationRequest,runOptions,await deps.createChatService!(),isolatedEngine,governedEngine):undefined;
      if(persisted&&!persisted.saved)return fail('provider_unavailable',503);
      const result=persisted?.saved?persisted.response:await (isolated?isolatedEngine!.run:live?governedEngine!.run:candidate?runConversationCandidate:conversational?runConversation:run)(parsed.data,runOptions);
      if(durable&&result.version==='coach-assistant.v2'&&result.ok&&result.profile&&result.snapshot?.subjectId===guard.userId&&result.dataSource==='authorized_records') {
        const actions=result.snapshot.capabilities.find(capability=>capability.key==='actions');
        if(actions){actions.status='available';actions.reason='durable_preferences_only';}
      }
      if(result.version==='coach-assistant.v2'&&result.ok&&result.snapshot?.subjectId===guard.userId&&result.dataSource==='authorized_records'&&deps.env.COACH_ASSISTANT_PROGRESS_ACTIONS_ENABLED==='1'&&deps.createProgressService) {
        const progress=result.snapshot.capabilities.find(capability=>capability.key==='progress');
        if(progress){progress.status='available';progress.reason='reviewed_self_measurements';}
      }
      if(result.version==='coach-assistant.v2'&&result.ok&&result.snapshot&&deps.env.COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED==='1'&&result.snapshot.subjectId===guard.userId&&result.dataSource==='authorized_records') {
        const {isolatedAttachmentStore}=await import('./isolated-attachments');
        result.attachments=result.attachments.map(attachment=>{
          const resolved=isolatedAttachmentStore.operation(`${guard.userId}:${result.snapshot!.organizationId}`,{version:'coach-assistant.v2',operation:'attachment.status',conversationId:result.conversationId,attachmentId:attachment.id});
          return {...attachment,status:resolved.ok?(resolved.attachment?.status??'unknown'):'unauthorized'};
        });
        result.uploads={images:true,storage:'isolated_ephemeral',analysis:'not_connected',limits:{...COACH_IMAGE_LIMITS}};
      }
      if(result.version==='coach-assistant.v2')historyTurn?.finish(result);
      const code=result.error?.code;
      return json(result,result.ok?200:code==='unauthenticated'?401:code==='forbidden'?403:code==='invalid_input'?400:503);
    };
    return await Promise.race([work(),new Promise<Response>(resolve=>{
      abortBoundary=()=>resolve(fail(request.signal.aborted?'cancelled':'deadline',503));
      controller.signal.addEventListener('abort',abortBoundary,{once:true});
      if(controller.signal.aborted)abortBoundary();
    })]);
  } catch(error) {
    if(error instanceof Error&&error.message==='forbidden')return fail('forbidden',403);
    if(error instanceof Error&&error.message==='budget_blocked')return fail('budget_blocked',503);
    return fail(error instanceof Error&&error.message==='invalid_input'?'invalid_input':'query_failed',error instanceof SyntaxError||error instanceof Error&&error.message==='invalid_input'?400:503);
  } finally {
    clearTimeout(timer);request.signal.removeEventListener('abort',cancel);
    if(abortBoundary)controller.signal.removeEventListener('abort',abortBoundary);
  }
}
