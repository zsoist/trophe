import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createIsolatedPreferenceService } from './isolated-preferences';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import type { CoachMemoryCard } from './contracts';

describe('explicit isolated memory control',()=>{
  it('reviews then confirms, corrects and deletes with stable receipts and version invalidation',()=>{
    const actor=randomUUID();const memory:CoachMemoryCard={id:randomUUID(),text:'Prefer mornings',source:'user_input',createdAt:'2026-09-07T00:00:00Z',scope:'user',confirmation:'unconfirmed',version:'initial'};
    const service=createIsolatedPreferenceService([{actorId:actor,subjectId:actor,organizationId:'org',preferences:defaultWorkoutPreferences,memories:[memory]}]);
    const base={version:'coach-assistant.v2',conversationId:randomUUID(),turnId:randomUUID()};
    let version=memory.version;
    for(const action of ['memory.confirm','memory.correct','memory.delete'] as const) {
      const before=service.read(actor,actor)!.memories[0];
      const proposed=service.execute(actor,{...base,operation:'propose',action,memoryId:memory.id,resourceVersion:version,...(action==='memory.correct'?{after:{text:'Prefer afternoons'}}:{})});
      expect(proposed.proposal?.reviewRequired).toBe(true);
      expect(service.read(actor,actor)!.memories[0]).toEqual(before);
      const apply={...base,operation:'apply',proposalId:proposed.proposal!.id,hash:proposed.proposal!.hash,actionId:randomUUID(),resourceVersion:version};
      const result=service.execute(actor,apply);
      expect(result.ok).toBe(true);expect(result.storage).toBe('isolated_ephemeral');
      expect(result.invalidatedMemoryVersions).toEqual([{id:memory.id,version}]);
      expect(service.execute(actor,apply)).toEqual(result);
      expect(service.execute(actor,{...base,operation:'receipt',actionId:apply.actionId})).toEqual(result);
      if(action!=='memory.delete') {
        expect(result.memory).toMatchObject({confirmation:'confirmed',createdAt:memory.createdAt,source:memory.source});
        version=result.memory!.version;
      } else {expect(result.memory).toBeNull();expect(service.read(actor,actor)!.memories).toEqual([]);}
    }
    expect(memory.confirmation).toBe('unconfirmed');expect(memory.text).toBe('Prefer mornings');
  });
  it('rejects foreign IDs, stale corrections and oversized or arbitrary fields',()=>{
    const actor=randomUUID();const memory:CoachMemoryCard={id:randomUUID(),text:'Original',source:'agent_inference',createdAt:'2026-09-07T00:00:00Z',scope:'user',confirmation:'unconfirmed',version:'v1'};
    const service=createIsolatedPreferenceService([{actorId:actor,subjectId:actor,organizationId:'org',preferences:defaultWorkoutPreferences,memories:[memory]}]);
    const base={version:'coach-assistant.v2',conversationId:randomUUID(),turnId:randomUUID(),operation:'propose',action:'memory.correct',memoryId:memory.id,resourceVersion:'v1',after:{text:'Corrected'}};
    expect(service.execute(actor,{...base,memoryId:randomUUID()}).error).toBe('not_found');
    expect(service.execute(actor,{...base,resourceVersion:'stale'}).error).toBe('version_conflict');
    expect(service.execute(actor,{...base,after:{text:'x'.repeat(501)}}).error).toBe('invalid_input');
    expect(service.execute(actor,{...base,after:{text:'valid',source:'user_input'}}).error).toBe('invalid_input');
    service.revoke(actor,actor);expect(service.execute(actor,base).error).toBe('forbidden');
  });
});
