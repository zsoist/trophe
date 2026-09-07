import { describe,it,expect,vi } from 'vitest';
import { createPersistentMemoryTurn } from './memory-turn';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { windowFor } from './context';
import type { PersistentMemoryCard,PersistentMemoryService } from './memory-contracts';
import type { CoachConversationRequest,CoachConversationResponse } from './contracts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const request:CoachConversationRequest={version:'coach-assistant.v2',conversationId:id(2),turnId:id(3),message:'Food today?'};
function fixture(){
 const context={actorId:id(1),subjectId:id(1),organizationId:id(4),timezone:'UTC',language:'en' as const};
 const repository=fixtureRepository();repository.plan=async()=>({rows:[],truncated:false});repository.workouts=async()=>({rows:[],truncated:false});repository.nutrition=async()=>({rows:[],truncated:false});repository.dataSource='authorized_records';repository.authorize=vi.fn(async()=>({...context}));
 repository.personalContext=async()=>({rows:[{userId:id(1),preferences:defaultWorkoutPreferences,memories:[{id:id(7),userId:id(1),text:'Old inference',source:'agent_inference',scope:'user',version:'0',createdAt:'2026-09-07T00:00:00Z'}]}],truncated:false});
 let cards:PersistentMemoryCard[]=[{id:id(5),text:'Prefer vegetables',source:'user_input',retention:'persistent',confirmation:'confirmed',conversationId:id(2),createdAt:'2026-09-07T00:00:00Z',version:'0'}];
 let scopeRevision=0;
 const service:PersistentMemoryService={execute:vi.fn<PersistentMemoryService['execute']>(async()=>({version:'coach-assistant.v2',storage:'database',ok:true,memories:structuredClone(cards),scopeRevision:String(scopeRevision),derivedContext:'excluded'}))};
 const args={context,window:windowFor('today','UTC',new Date('2026-09-07T00:00:00Z')),limit:1,signal:new AbortController().signal};
 const turn=()=>createPersistentMemoryTurn(repository,service,request);
 return {repository,service,args,turn,setCards:(value:PersistentMemoryCard[])=>{cards=value;scopeRevision++;},cards,context};
}
describe('fresh confirmed memory turn and derived context boundary',()=>{
 it('replaces legacy inference and excludes corrected/deleted derived history while preserving literal user turns',async()=>{
  const f=fixture();const first=f.turn();const read=await first.repository.personalContext!(f.args);
  expect(read.rows[0].memories).toMatchObject([{text:'Prefer vegetables',confirmation:'confirmed'}]);
  const response={ok:true,output:{answer:'Reviewed response'}} as CoachConversationResponse;first.finish(response);
  const input={...request,history:[{role:'user' as const,text:'Earlier I preferred vegetables'},{role:'assistant' as const,text:'Reviewed response',derivedToken:response.memoryContext!.derivedHistoryToken},{role:'assistant' as const,text:'Legacy summary'},{role:'user' as const,text:'Unversioned memory summary',kind:'memory_summary' as const}]};
  const next=f.turn();await next.repository.personalContext!(f.args);expect(next.filterHistory(input).history).toHaveLength(2);
  f.setCards([{...f.cards[0],text:'Prefer fish',version:'1'}]);const corrected=f.turn();await corrected.repository.personalContext!(f.args);
  expect(corrected.filterHistory(input).history).toEqual([{role:'user',text:'Earlier I preferred vegetables'}]);
  f.setCards([]);const deleted=f.turn();expect((await deleted.repository.personalContext!(f.args)).rows[0].memories).toEqual([]);expect(deleted.filterHistory(input).history).toHaveLength(1);
 });
 it('never revives derived tokens after empty→confirm→delete returns to empty content',async()=>{
  const f=fixture();f.setCards([]);const initial=f.turn();await initial.repository.personalContext!(f.args);const response={ok:true,output:{answer:'Empty snapshot response'}} as CoachConversationResponse;initial.finish(response);
  f.setCards(f.cards);f.setCards([]);const later=f.turn();await later.repository.personalContext!(f.args);
  expect(later.filterHistory({...request,history:[{role:'assistant',text:'Empty snapshot response',derivedToken:response.memoryContext!.derivedHistoryToken}]}).history).toEqual([]);
 });
 it('rejects forged text and tokens across scope and rechecks authorization around the read',async()=>{
  const f=fixture();const first=f.turn();await first.repository.personalContext!(f.args);const response={ok:true,output:{answer:'Original'}} as CoachConversationResponse;first.finish(response);
  expect(first.filterHistory({...request,history:[{role:'assistant',text:'Forged',derivedToken:response.memoryContext!.derivedHistoryToken}]}).history).toEqual([]);
  f.context.organizationId=id(9);const changed=f.turn();await changed.repository.personalContext!(f.args);expect(changed.filterHistory({...request,history:[{role:'assistant',text:'Original',derivedToken:response.memoryContext!.derivedHistoryToken}]}).history).toEqual([]);
  f.repository.authorize=vi.fn().mockResolvedValueOnce({...f.context}).mockRejectedValue(new Error('forbidden'));
  await expect(f.turn().repository.personalContext!(f.args)).rejects.toThrow('forbidden');
 });
 it('gates HTTP operations and serves confirmed cards in the existing turn response without extra model calls',async()=>{
  const f=fixture();const createMemoryService=vi.fn(()=>f.service);
  const deps={env:{COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:id(1),COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED:'0',VERCEL_ENV:'preview'},guard:async()=>({userId:id(1)}),createRepository:()=>f.repository,createMemoryService,now:()=>new Date('2026-09-07T00:00:00Z')};
  const req=(body:unknown)=>new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
  expect((await handleCoachRequest(req({...request,operation:'memory.read',message:undefined}),deps)).status).toBe(404);expect(createMemoryService).not.toHaveBeenCalled();
  deps.env.COACH_ASSISTANT_MEMORY_ACTIONS_ENABLED='1';
  const response=await handleCoachRequest(req(request),deps);const body=await response.json();
  expect(body.ok).toBe(true);expect(body.memories).toMatchObject([{text:'Prefer vegetables',confirmation:'confirmed'}]);expect(body.memoryContext.derivedHistoryToken).toMatch(/^[a-f0-9]{64}$/);expect(body.telemetry.dataReads).toBeLessThanOrEqual(4);expect(body.telemetry.modelCalls).toBe(0);
  expect((await handleCoachRequest(req(request),{...deps,createMemoryService:undefined})).status).toBe(503);
 });
});
