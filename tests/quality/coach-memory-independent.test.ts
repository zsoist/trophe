import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { createIsolatedPreferenceService } from '@/agents/coach-assistant/isolated-preferences';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';

it('returned memory invalidation metadata cannot mutate the canonical receipt',()=>{
  const actor=randomUUID(),memoryId=randomUUID();
  const service=createIsolatedPreferenceService([{actorId:actor,subjectId:actor,organizationId:'org',preferences:defaultWorkoutPreferences,memories:[{id:memoryId,text:'Morning',source:'user_input',createdAt:'2026-09-07T00:00:00Z',scope:'user',confirmation:'unconfirmed',version:'v1'}]}]);
  const base={version:'coach-assistant.v2',conversationId:randomUUID(),turnId:randomUUID()};
  const proposal=service.execute(actor,{...base,operation:'propose',action:'memory.confirm',memoryId,resourceVersion:'v1'}).proposal!;
  const apply={...base,operation:'apply',proposalId:proposal.id,hash:proposal.hash,actionId:randomUUID(),resourceVersion:'v1'};
  const result=service.execute(actor,apply);expect(result.ok).toBe(true);
  result.invalidatedMemoryVersions![0].version='tampered';
  expect(service.execute(actor,{...base,operation:'receipt',actionId:apply.actionId}).invalidatedMemoryVersions).toEqual([{id:memoryId,version:'v1'}]);
  expect(service.execute(actor,apply).invalidatedMemoryVersions).toEqual([{id:memoryId,version:'v1'}]);
});
