import { expect, it, vi } from 'vitest';
import { handleCoachRequest } from './handler';
import { runConversation } from './conversation';
import { fixtureRepository } from './fixtures';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { parseFoodPreferences } from '@/lib/food/preferences';
import type { CoachConversationRequest } from './contracts';
import type { createIsolatedCoachEngineBinding } from './isolated-engine';
import type { PersistentMemoryService } from './memory-contracts';
const actor='00000000-0000-4000-8000-000000000001';
const request:CoachConversationRequest={version:'coach-assistant.v2',conversationId:actor,turnId:actor,message:'My workout today'};
const req=(body:unknown)=>new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
it('uses only the outer signed history binding through the actual handler and keeps inactive factories untouched',async()=>{
 const context={actorId:actor,subjectId:actor,organizationId:actor,timezone:'UTC',language:'en'};
 const repository=fixtureRepository();repository.dataSource='authorized_records';repository.authorize=async()=>context;
 repository.plan=repository.workouts=repository.nutrition=async()=>({rows:[],truncated:false});
 let memoryRevision='0',dietRevision='0';
 const createMemoryService=vi.fn(()=>({execute:async()=>({version:'coach-assistant.v2',storage:'database',ok:true,memories:[],scopeRevision:memoryRevision,derivedContext:'excluded'})} as PersistentMemoryService));
 const createFoodPreferenceService=vi.fn(()=>({parsePreference:parseFoodPreferences,execute:async()=>({version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{profileId:actor,version:dietRevision,preferences:{version:1,dietPattern:null}}})}));
 const histories:unknown[]=[];
 // Isolated engine port is injected; actual handler, collector and brokers run. No provider/SQL claim.
 const isolatedEngine:ReturnType<typeof createIsolatedCoachEngineBinding>={kind:'isolated_coach_engine_binding',run:async(raw,options)=>{
  const response=await runConversation(raw,{...options,mode:'offline'});
  histories.push(options.filterMemoryHistory?.(raw as CoachConversationRequest).history);
  return {...response,evaluation:{transport:'injected_fixture' as const,records:'authorized_records' as const,release:'unapproved_candidate' as const,semanticQualityVerified:false as const}};
 }};
 const config={guard:async()=>({userId:actor}),createRepository:()=>repository,
  createDurableService:()=>({read:async()=>({preferences:defaultWorkoutPreferences,version:'1'}),execute:vi.fn()}),
  createMemoryService,createFoodPreferenceService,isolatedEngine,
  env:{VERCEL_ENV:'preview',COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:actor,COACH_ASSISTANT_DATA_SOURCE:'authorized_records',COACH_ASSISTANT_DURABLE_ACTIONS_ENABLED:'1',COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED:'1',COACH_ASSISTANT_DIET_ACTIONS_ENABLED:'1',COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED:'1'}};
 const first=await (await handleCoachRequest(req(request),config)).json();expect(first.ok).toBe(true);
 expect(first.memoryContext.derivedHistoryToken).toMatch(/^[a-f0-9]{64}$/);
 const next={...request,history:[{role:'user',text:request.message},{role:'assistant',text:first.output.answer.slice(0,500),derivedToken:first.memoryContext.derivedHistoryToken}]};
 expect((await handleCoachRequest(req(next),config)).status).toBe(200);expect(histories.at(-1)).toHaveLength(2);
 memoryRevision='1';expect((await handleCoachRequest(req(next),config)).status).toBe(200);expect(histories.at(-1)).toHaveLength(1);
 memoryRevision='0';dietRevision='1';expect((await handleCoachRequest(req(next),config)).status).toBe(200);expect(histories.at(-1)).toHaveLength(1);
 createMemoryService.mockClear();createFoodPreferenceService.mockClear();
 expect((await handleCoachRequest(req(request),{...config,guard:async()=>new Response('',{status:401})})).status).toBe(401);
 expect(createMemoryService).not.toHaveBeenCalled();expect(createFoodPreferenceService).not.toHaveBeenCalled();
 await handleCoachRequest(req(request),{...config,env:{...config.env,COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED:'0',COACH_ASSISTANT_DIET_ACTIONS_ENABLED:'0'}});
 expect(createMemoryService).not.toHaveBeenCalled();expect(createFoodPreferenceService).not.toHaveBeenCalled();
});
