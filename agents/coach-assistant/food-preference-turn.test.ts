import { describe,it,expect } from 'vitest';
import { createFoodPreferenceTurn } from './food-preference-turn';
import { fixtureRepository } from './fixtures';
import { parseFoodPreferences } from '@/lib/food/preferences';
import type { CoachConversationRequest } from './contracts';
import { windowFor } from './context';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const context={actorId:id(1),subjectId:id(1),organizationId:id(2),timezone:'UTC',language:'en'};
const request:CoachConversationRequest={version:'coach-assistant.v2',conversationId:id(3),turnId:id(4),message:'What should I eat?',history:[{role:'assistant',text:'You are omnivore',derivedToken:'old'},{role:'user',text:'I once ate meat'},{role:'user',kind:'memory_summary',text:'omnivore summary'}]};
describe('fresh dietary profile context',()=>{
 it('keeps fresh declaration separate from Workout and memory and removes stale derived history',async()=>{
  const repo=fixtureRepository();repo.dataSource='authorized_records';repo.authorize=async()=>context;repo.personalContext=async()=>({rows:[{userId:id(1),preferences:{durationMinutes:30},memories:[]}],truncated:false});
  let revision='1';let dietPattern:'vegetarian'|null='vegetarian';let absent=false;
  const service={parsePreference:parseFoodPreferences,execute:async()=>absent?{version:'coach-assistant.v2',storage:'database',ok:false,error:'not_connected'}:{version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{profileId:id(1),version:revision,preferences:{version:1,dietPattern}}}};
  const broker=createFoodPreferenceTurn(repo,service,request);const args={context,window:windowFor('today','UTC',new Date('2026-09-07T12:00:00Z')),limit:1,signal:new AbortController().signal};
  expect(broker.filterHistory(request).history).toEqual([{role:'user',text:'I once ate meat'}]);
  expect((await broker.repository.personalContext!(args)).rows[0]).toMatchObject({preferences:{durationMinutes:30},foodPreference:{version:'1',preferences:{dietPattern:'vegetarian'}}});
  revision='2';dietPattern=null;
  expect((await broker.repository.personalContext!(args)).rows[0].foodPreference).toMatchObject({version:'2',preferences:{dietPattern:null}});
  absent=true;expect((await broker.repository.personalContext!(args)).rows[0].foodPreference).toBeUndefined();
 });
});
