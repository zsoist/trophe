import photoV3Foods from '../../tests/fixtures/coach-photo-v3-observation.json';
import { describe, expect, it, vi } from 'vitest';
import { decidePilotBudgetCommand, type PilotAttemptRecord, type PilotBudgetCommand, type PilotBudgetStore } from './pilot-budget';
import { createGovernedCoachEngineBinding, verifyGovernedCoachEngineExecution } from './governed-engine';
import { runVerifiedChatFinalWithGovernedEngine } from './chat-final';
import { runConversationCandidate } from './conversation-candidate';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
import type { GovernedCoachTransport } from './governed-transport';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { parseFoodQuantityChange } from '@/lib/food/log-edit-service';
import { ASK_TROPHE_SHARED_PILOT_ID } from '@/lib/workout/shared-pilot-budget';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const env = () => ({
  VERCEL_ENV: 'preview',
  COACH_ASSISTANT_ENABLED: '1',
  COACH_ASSISTANT_LIVE_PILOT_ENABLED: '1',
  COACH_ASSISTANT_FOOD_ACTIONS_ENABLED: '1',
  COACH_ASSISTANT_PREVIEW_USER_IDS: id(1),
  TROPHE_ALLOW_PAID_AI: '1',
  OPENAI_API_KEY: 'test-only-placeholder',
});
const request = {
  version: 'coach-assistant.v2' as const,
  conversationId: id(2),
  turnId: id(3),
  message: 'Fueron 150 gramos, no 250',
  context: { surface: 'food' as const, includeScreen: true },
};

function repository() {
  const repo = fixtureRepository();
  repo.dataSource = 'authorized_records';
  repo.authorize = async () => ({ actorId: id(1), subjectId: id(1), organizationId: id(4), timezone: 'America/Bogota', language: 'es' });
  repo.plan = async () => ({ rows: [], truncated: false });
  repo.workouts = async () => ({ rows: [], truncated: false });
  repo.nutrition = async () => ({ rows: [{ id: id(5), userId: id(1), date: '2026-09-08', calories: 500, proteinG: 30 }], truncated: false });
  repo.personalContext = async () => ({ rows: [{ userId: id(1), preferences: defaultWorkoutPreferences, memories: [] }], truncated: false });
  return repo;
}

function fixture() {
  const records = new Map<string, PilotAttemptRecord>();
  const events: string[] = [];
  const store: PilotBudgetStore = {
    execute: vi.fn(async (command: PilotBudgetCommand) => {
      events.push(command.operation);
      const decision = decidePilotBudgetCommand({
        pilotId: command.binding.pilotId,
        budgetDay: '2026-09-08',
        capNanoUsd: 2_700_000_000,
        chargedNanoUsd: [...records.values()].reduce((sum, row) => sum + row.chargedNanoUsd, 0),
        turnAttemptCount: [...records.values()].filter(row => row.binding.turnId === command.binding.turnId).length,
        accountingBlocked: [...records.values()].some(row => row.accountingAlert),
        existing: records.get(command.binding.attemptId),
      }, command);
      if (decision.ok && decision.write !== 'none') records.set(command.binding.attemptId, structuredClone(decision.record));
      return { storage: 'database' as const, ...decision };
    }),
  };
  const transport = vi.fn<GovernedCoachTransport>(async input => {
    events.push('provider');
    const payload = JSON.parse(input.prompt) as { evidence: Array<{ id: string }> };
    return {
      requestId: 'req_private_pilot',
      responseModel: 'gpt-5.6-luna',
      output: {
        answer: 'Revisar el contexto anotado puede ayudar a organizar una conversación útil.',
        followUp: '¿Quieres revisar el cambio antes de confirmarlo?',
        evidenceRefs: payload.evidence.map(item => item.id),
        entityRefs: [],
        facts: payload.evidence.map(item => ({ kind: 'record_fact', evidenceId: item.id })),
        generalExplanationRefs: ['records_are_partial_view'],
        limitations: ['incomplete_records'],
        escalation: false,
        actionIntent: { action: 'food.quantity.update', target: { previousGrams: 250, grams: 150 } },
      },
      usage: { inputTokens: 1000, outputTokens: 200, reasoningTokens: 50 },
      latencyMs: 4,
      rawStatus: 200,
    };
  });
  const options = {
    actorId: id(1), repository: repository(), mode: 'model' as const,
    now: new Date('2026-09-08T18:00:00Z'), signal: new AbortController().signal,
    foodQuantityIntentsEnabled: true,
  };
  return { store, transport, options, events, records };
}

describe('governed LIVE-01 app engine', () => {
  it('uses durable admission before Luna and returns only a reviewable Food intent', async () => {
    const test = fixture();
    const engine = createGovernedCoachEngineBinding({ env: env(), actorId: id(1), persistentStore: test.store, transport: test.transport });
    const response = await engine.run(request, test.options);

    expect(response.ok).toBe(true);
    expect(response.output?.answer).not.toContain('Private Luna pilot:');
    expect(response.output?.answer).toContain('Puedo preparar esa corrección de cantidad para que la revises.');
    expect(response.actionIntents).toEqual([expect.objectContaining({
      action: 'food.quantity.update', source: 'provider_tool', reviewRequired: true,
      target: { selection: 'authorized_food_entry', entryHintId: null, previousGrams: 250, grams: 150 },
    })]);
    expect(response.proposals).toEqual([]);
    expect(response.receipts).toEqual([]);
    expect(response.telemetry).toMatchObject({ model: 'gpt-5.6-luna', provider: 'openai', modelCalls: 1 });
    expect(response.telemetry.costUsd).toBeGreaterThan(0);
    expect(test.events).toEqual(['reserve', 'claim_dispatch', 'provider', 'settle']);
    expect(verifyGovernedCoachEngineExecution(engine, request, id(1), response)).toBe(true);
    expect(verifyGovernedCoachEngineExecution(engine, request, id(1), structuredClone(response))).toBe(false);
  });

  it('mints a durable chat final only from the exact governed binding', async () => {
    const test = fixture();
    const engine = createGovernedCoachEngineBinding({ env: env(), actorId: id(1), persistentStore: test.store, transport: test.transport });
    const scope = { actorId: id(1), subjectId: id(1), organizationId: id(4), actorRole: 'client' as const };
    const result = await runVerifiedChatFinalWithGovernedEngine(request, test.options, scope, engine);
    expect(result.response.ok).toBe(true);
    expect(result.final).not.toBeNull();
  });

  it('fails closed without Preview spend gates and rejects a forged boundary', async () => {
    const test = fixture();
    expect(() => createGovernedCoachEngineBinding({
      env: { ...env(), TROPHE_ALLOW_PAID_AI: '0' }, actorId: id(1), persistentStore: test.store, transport: test.transport,
    })).toThrow('governed_pilot_disabled');
    expect(test.transport).not.toHaveBeenCalled();

    const response = await runConversationCandidate(request, {
      ...test.options,
      offlineConversationProvider: test.transport,
      governedPilotBoundary: { kind: 'governed_live_pilot' },
      providerEvidence: 'provider_real',
    });
    expect(response.error?.code).toBe('budget_blocked');
    expect(test.transport).not.toHaveBeenCalled();
  });

  it('creates the live engine only after authentication, allowlist and mode selection', async () => {
    const test = fixture();
    const liveEnv = env();
    const engine = createGovernedCoachEngineBinding({ env: liveEnv, actorId: id(1), persistentStore: test.store, transport: test.transport });
    const factory = vi.fn(async () => engine);
    const deps = {
      env: liveEnv,
      guard: async () => ({ userId: id(1) }),
      createRepository: repository,
      createGovernedEngine: factory,
      createFoodService: async () => ({}) as never,
      now: () => test.options.now,
    };
    const createRequest = () => new Request('https://private.invalid/api/coach-assistant', {
      method: 'POST', body: JSON.stringify(request),
    });

    expect((await handleCoachRequest(createRequest(), { ...deps, guard: async () => new Response('', { status: 401 }) })).status).toBe(401);
    expect(factory).not.toHaveBeenCalled();
    const response = await handleCoachRequest(createRequest(), deps);
    expect(response.status).toBe(200);
    expect((await response.json()).actionIntents[0]).toMatchObject({ action: 'food.quantity.update' });
    expect(factory).toHaveBeenCalledExactlyOnceWith(id(1));

    const conflicting = await handleCoachRequest(createRequest(), {
      ...deps,
      env: { ...liveEnv, COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED: '1' },
    });
    expect(conflicting.status).toBe(503);
    expect((await conflicting.json()).error.code).toBe('budget_blocked');
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it('resolves the selected Food entry on the server before offering a natural one-amount intent to Luna', async () => {
    const test = fixture();
    const selectedEntry=id(52);
    const natural={...request,message:'Déjalo en 150 g',context:{surface:'food' as const,includeScreen:true,entity:{kind:'meal' as const,id:selectedEntry}}};
    const engine=createGovernedCoachEngineBinding({env:env(),actorId:id(1),persistentStore:test.store,transport:test.transport});
    const execute=vi.fn().mockResolvedValue({version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{entryId:selectedEntry,version:'1',loggedDate:'2026-09-08',foodName:'Rice',foodId:null,source:'manual',sourceId:'live02',grams:250,quantity:1,calories:310,proteinG:6.5,carbsG:64,fatG:2.5,fiberG:4.5,sugarG:0.8}});
    const response=await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(natural)}),{
      env:env(),guard:async()=>({userId:id(1)}),createRepository:repository,createGovernedEngine:async()=>engine,
      createFoodService:async()=>({parseQuantityChange:parseFoodQuantityChange,execute}),now:()=>test.options.now,
    });
    const body=await response.json();
    expect(response.status).toBe(200);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({operation:expect.objectContaining({operation:'food.resolve',entryHintId:selectedEntry})}));
    expect(body.actionIntents).toEqual([expect.objectContaining({target:{selection:'authorized_food_entry',entryHintId:selectedEntry,previousGrams:250,grams:150}})]);
    expect(test.transport.mock.calls[0][0].system).toContain('actionsAvailable is the complete allowlist');
  });

  it('feeds one durable photo observation into the Luna turn without creating a Food write', async () => {
    const test=fixture(),attachmentId=id(60),observationId=id(61);
    const photoRequest={...request,turnId:id(62),message:'¿Qué ves en esta comida?',attachments:[{id:attachmentId,kind:'image' as const,status:'available' as const}]};
    const transport=vi.fn<GovernedCoachTransport>(async input=>{
      const payload=JSON.parse(input.prompt) as {photoObservations:Array<{attachmentId:string;trust:string;items:Array<{foodName:string}>}>};
      expect(payload.photoObservations).toEqual([{observationId,attachmentId,source:'validated_photo_analysis',trust:'untrusted_image_data',reviewRequired:true,items:[{identity:'unassessed',name:'Unidentified food component',note:'Confirma los ingredientes.'}]}]);
      return {requestId:'req_photo_text',responseModel:'gpt-5.6-luna',output:{answer:'Parece una comida completa; puedo ayudarte a revisar la porción.',followUp:null,evidenceRefs:[],entityRefs:[],facts:[],generalExplanationRefs:[],limitations:[],escalation:false,actionIntent:null},usage:{inputTokens:900,outputTokens:100,reasoningTokens:20},latencyMs:3,rawStatus:200};
    });
    const engine=createGovernedCoachEngineBinding({env:env(),actorId:id(1),persistentStore:test.store,transport});
    const execute=vi.fn().mockResolvedValue({version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{observationId,attachmentId,source:'validated_photo_analysis',trust:'untrusted_image_data',reviewRequired:true,items:[{index:0,version:'a'.repeat(64),foodName:'Arroz con pollo',estimatedGrams:240,estimatedCalories:420,confidence:.7,accuracyNote:'Confirma los ingredientes.'}]}});
    const response=await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(photoRequest)}),{
      env:{...env(),COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED:'1',COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED:'1'},guard:async()=>({userId:id(1)}),createRepository:repository,createGovernedEngine:async()=>engine,
      createFoodService:async()=>({}) as never,createPhotoFoodService:async()=>({execute}),now:()=>test.options.now,
    });
    const body=await response.json();
    expect(response.status).toBe(200);expect(body.output.answer).toContain('Revisión de la foto: Componente por identificar.');expect(body.output.answer).toContain('Parece una comida completa');
    expect(body.proposals).toEqual([]);expect(body.receipts).toEqual([]);expect(body.actionIntents).toEqual([]);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({actorId:id(1),subjectId:id(1),organizationId:id(4),operation:expect.objectContaining({operation:'photo.food.read',conversationId:photoRequest.conversationId,turnId:photoRequest.turnId,attachmentId})}));
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('admits text for four valid synthetic observation rows with identity notes',async()=>{
    const test=fixture(),attachmentId=id(60);
    const photoRequest={...request,message:'¿Qué ves en esta comida?',attachments:[{id:attachmentId,kind:'image',status:'available'}]};
    const engine=createGovernedCoachEngineBinding({env:env(),actorId:id(1),persistentStore:test.store,transport:test.transport});
    const execute=vi.fn().mockResolvedValue({version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{observationId:id(61),attachmentId,source:'validated_photo_analysis',trust:'untrusted_image_data',reviewRequired:true,items:Array.from({length:4},(_,index)=>({index,version:'a'.repeat(64),foodName:'Uncertain food component',estimatedGrams:100,estimatedCalories:100,confidence:.4,accuracyNote:'Identity and portion remain uncertain. '.repeat(6)}))}});
    const response=await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(photoRequest)}),{env:{...env(),COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED:'1',COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED:'1'},guard:async()=>({userId:id(1)}),createRepository:repository,createGovernedEngine:async()=>engine,createFoodService:async()=>({}) as never,createPhotoFoodService:async()=>({execute}),now:()=>test.options.now});
    const body=await response.json();
    expect(body.error).toBeUndefined();expect(test.transport).toHaveBeenCalledOnce();
    const call=test.transport.mock.calls[0][0],payload=JSON.parse(call.prompt);
    expect(new TextEncoder().encode(call.system+call.prompt+JSON.stringify(call.schema)).length).toBeLessThanOrEqual(7500);
    expect(payload.photoObservations[0]).toMatchObject({observationId:id(61),attachmentId,trust:'untrusted_image_data',reviewRequired:true});
    expect(payload.photoObservations[0].items).toEqual(Array.from({length:4},()=>({identity:'unassessed',name:'Unidentified food component',note:'Identity and portion remain uncertain. '.repeat(6)})));
  });

  it.each(['real_notes','maximum_notes'] as const)('keeps %s photo review usable within the companion budget',async scenario=>{
    const test=fixture(),attachmentId=id(60);
    const foods=scenario==='real_notes'?photoV3Foods:Array.from({length:8},()=>({...photoV3Foods[2],name:'Brown component '.repeat(12),accuracy_note:'Identity and weight are uncertain. '.repeat(14)}));
    const items=foods.map((food,index)=>({index,version:'a'.repeat(64),foodName:food.name,identityStatus:food.identity_status,estimatedGrams:food.estimated_grams,estimatedCalories:food.estimated_calories,confidence:food.confidence,accuracyNote:food.accuracy_note}));
    const original=JSON.stringify(items);
    const photoRequest={...request,message:'Analiza los alimentos visibles de esta foto. Indica porciones estimadas y lo que no puedes identificar con certeza. No registres nada todavía.',attachments:[{id:attachmentId,kind:'image',status:'available'}]};
    const engine=createGovernedCoachEngineBinding({env:env(),actorId:id(1),persistentStore:test.store,transport:test.transport});
    const execute=vi.fn().mockResolvedValue({version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{observationId:id(61),attachmentId,source:'validated_photo_analysis',trust:'untrusted_image_data',reviewRequired:true,items}});
    const response=await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(photoRequest)}),{env:{...env(),COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED:'1',COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED:'1'},guard:async()=>({userId:id(1)}),createRepository:repository,createGovernedEngine:async()=>engine,createFoodService:async()=>({}) as never,createPhotoFoodService:async()=>({execute}),now:()=>test.options.now});
    const body=await response.json();expect(response.status).toBe(200);expect(body.ok).toBe(true);expect(body.error).toBeUndefined();
    expect(body.proposals).toEqual([]);expect(body.receipts).toEqual([]);expect(JSON.stringify(items)).toBe(original);
    if(scenario==='maximum_notes'){
      expect(test.transport).not.toHaveBeenCalled();expect(test.store.execute).not.toHaveBeenCalled();expect(body.telemetry.modelCalls).toBe(0);
      expect(body.output.answer).toContain('La foto está lista para revisar');expect(body.output.limitations).toContain('La explicación adicional no está disponible en este mensaje.');
    }else{
      expect(test.transport).toHaveBeenCalledOnce();const call=test.transport.mock.calls[0][0],payload=JSON.parse(call.prompt);
      expect(new TextEncoder().encode(call.system+call.prompt+JSON.stringify(call.schema)).length).toBeLessThanOrEqual(7500);
      expect(payload.photoObservations[0].items.map((item:{note:string})=>item.note)).toEqual(foods.map(food=>food.accuracy_note));
      expect(payload.photoObservations[0].items[2].name).toBe('Unidentified food component');
      expect(payload.generalExplanations.every((item:object)=>Object.keys(item).sort().join(',')==='id,text')).toBe(true);
    }
  });

  it('returns a recoverable photo error before Luna when the observation is unavailable', async () => {
    const test=fixture(),attachmentId=id(63),photoRequest={...request,turnId:id(64),message:'¿Qué ves?',attachments:[{id:attachmentId,kind:'image' as const,status:'available' as const}]};
    const transport=vi.fn<GovernedCoachTransport>();
    const engine=createGovernedCoachEngineBinding({env:env(),actorId:id(1),persistentStore:test.store,transport});
    const execute=vi.fn().mockResolvedValue({version:'coach-assistant.v2',storage:'database',ok:false,error:'not_connected'});
    const response=await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(photoRequest)}),{
      env:{...env(),COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED:'1',COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED:'1'},guard:async()=>({userId:id(1)}),createRepository:repository,createGovernedEngine:async()=>engine,
      createFoodService:async()=>({}) as never,createPhotoFoodService:async()=>({execute}),now:()=>test.options.now,
    });
    const body=await response.json();
    expect(response.status).toBe(503);expect(body.error).toEqual({code:'attachment_analysis_failed',retryable:true});expect(transport).not.toHaveBeenCalled();
    expect(body.proposals).toEqual([]);expect(body.receipts).toEqual([]);
  });

  it('rejects a multi-photo turn before any vision or Luna dispatch',async()=>{
    const test=fixture(),createPhotoFoodService=vi.fn(),photoRequest={...request,turnId:id(65),message:'¿Qué ves?',attachments:[id(66),id(67)].map(attachmentId=>({id:attachmentId,kind:'image' as const,status:'available' as const}))};
    const transport=vi.fn<GovernedCoachTransport>(),engine=createGovernedCoachEngineBinding({env:env(),actorId:id(1),persistentStore:test.store,transport});
    const response=await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(photoRequest)}),{
      env:{...env(),COACH_ASSISTANT_PRIVATE_ATTACHMENTS_ENABLED:'1',COACH_ASSISTANT_PHOTO_FOOD_ACTIONS_ENABLED:'1'},guard:async()=>({userId:id(1)}),createRepository:repository,createGovernedEngine:async()=>engine,
      createFoodService:async()=>({}) as never,createPhotoFoodService,now:()=>test.options.now,
    });
    expect(response.status).toBe(503);expect((await response.json()).error).toEqual({code:'attachment_analysis_failed',retryable:true});
    expect(createPhotoFoodService).not.toHaveBeenCalled();expect(transport).not.toHaveBeenCalled();
  });

  it('grounds a Food follow-up only in a revalidated receipt and canonical refetch', async () => {
    const test=fixture(),selectedEntry=id(53),actionId=id(54),proposalId=id(55),receiptId=id(56);
    const followUp={...request,message:'¿Qué cambió?',context:{surface:'food' as const,includeScreen:true,entity:{kind:'meal' as const,id:selectedEntry},foodReceipt:{entryId:selectedEntry,actionId}}};
    const transport=vi.fn<GovernedCoachTransport>(async input=>{
      const payload=JSON.parse(input.prompt) as {evidence:Array<{id:string}>};
      expect(payload.evidence.slice(0,2).map(item=>item.id)).toEqual(['food.change.previousQuantity','food.change.currentQuantity']);
      return {requestId:'req_live02_followup',responseModel:'gpt-5.6-luna',output:{answer:'Cambió de 250 g a 150 g.',followUp:null,evidenceRefs:['food.change.previousQuantity','food.change.currentQuantity'],entityRefs:[],facts:[{kind:'record_fact',evidenceId:'food.change.previousQuantity'},{kind:'record_fact',evidenceId:'food.change.currentQuantity'}],generalExplanationRefs:[],limitations:[],escalation:false,actionIntent:null},usage:{inputTokens:900,outputTokens:120,reasoningTokens:40},latencyMs:3,rawStatus:200};
    });
    const engine=createGovernedCoachEngineBinding({env:env(),actorId:id(1),persistentStore:test.store,transport});
    const snapshot={entryId:selectedEntry,version:'2',loggedDate:'2026-09-08',foodName:'Rice',foodId:null,source:'manual',sourceId:'live02',grams:150,quantity:1,calories:186,proteinG:3.9,carbsG:38.4,fatG:1.5,fiberG:2.7,sugarG:0.5};
    const execute=vi.fn(async({operation}:{operation:{operation:string}})=>operation.operation==='food.receipt'
      ?{version:'coach-assistant.v2',storage:'database',ok:true,receipt:{id:receiptId,actionId,proposalId,status:'applied',resourceVersion:'2',recordedAt:'2026-09-09T12:18:23Z'},refresh:{entryId:selectedEntry,loggedDate:'2026-09-08',previousVersion:'1',version:'2',strategy:'refetch'},change:{beforeGrams:250,afterGrams:150}}
      :{version:'coach-assistant.v2',storage:'database',ok:true,snapshot});
    const response=await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(followUp)}),{
      env:env(),guard:async()=>({userId:id(1)}),createRepository:repository,createGovernedEngine:async()=>engine,
      createFoodService:async()=>({parseQuantityChange:parseFoodQuantityChange,execute} as never),now:()=>test.options.now,
    });
    const body=await response.json();
    expect(response.status).toBe(200);expect(body.actionIntents).toEqual([]);expect(body.proposals).toEqual([]);expect(body.receipts).toEqual([]);
    expect(body.output.answer).toContain('The previous confirmed Food quantity was 250 g.');expect(body.output.answer).toContain('The confirmed Food quantity is 150 g.');
    expect(body.output.answer).not.toContain('Cambió de 250 g a 150 g.');
    expect(execute.mock.calls.map(([value])=>(value as {operation:{operation:string}}).operation.operation)).toEqual(['food.resolve','food.receipt']);
  });

  it('stops the authenticated route before provider dispatch when the durable authority reaches its smoke target', async () => {
    const test = fixture();
    const seen: PilotBudgetCommand[] = [];
    const execute = vi.fn(async (command: PilotBudgetCommand) => {
      seen.push(command);
      return {
      storage: 'database' as const,
      ok: false as const,
      error: 'budget_blocked' as const,
      };
    });
    const engine = createGovernedCoachEngineBinding({
      env: env(), actorId: id(1), persistentStore: { execute }, transport: test.transport,
    });
    const response = await handleCoachRequest(new Request('https://private.invalid/api/coach-assistant', {
      method: 'POST', body: JSON.stringify(request),
    }), {
      env: env(),
      guard: async () => ({ userId: id(1) }),
      createRepository: repository,
      createGovernedEngine: async () => engine,
      createFoodService: async () => ({}) as never,
      now: () => test.options.now,
    });

    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('budget_blocked');
    expect(execute).toHaveBeenCalledTimes(1);
    expect(seen[0].binding.pilotId).toBe(ASK_TROPHE_SHARED_PILOT_ID);
    expect(test.transport).not.toHaveBeenCalled();
  });
});
