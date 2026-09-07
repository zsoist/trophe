import { createHash } from 'node:crypto';
import { reviewDraftRefresh } from './draft-refresh';
import { describe, it, expect } from 'vitest';
import { createIsolatedPreferenceService } from './isolated-preferences';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';
import { createInitialWorkspaceState, workoutWorkspaceReducer } from '@/lib/workout/workspace-state';
const actor='a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const id='aac3a82e-898c-4907-b9b9-75133bb6d27f';
const base={version:'coach-assistant.v2',conversationId:id,turnId:id};
function fixture(pending=false) {
  const workspace=workoutWorkspaceReducer(createInitialWorkspaceState(),{type:'draft.created',payload:{kind:'cardio',name:'Walk'}});
  if(pending)workspace.stage='live';
  const service=createIsolatedPreferenceService([{actorId:actor,subjectId:actor,organizationId:'org',preferences:defaultWorkoutPreferences,workspace}]);
  const resourceVersion=service.read(actor,actor)!.draftVersion!;
  const propose={...base,operation:'propose',action:'draft.update',resourceVersion,after:{...workspace.draft,durationMinutes:20,name:'Morning walk'}};
  return {service,propose,workspace};
}
describe('canonical isolated draft boundary',()=>{
  it('requires review and refuses to overwrite a newer unsaved workspace',()=>{
    const {service,propose,workspace}=fixture();
    const proposal=service.execute(actor,propose).proposal!;
    const applied=service.execute(actor,{...base,operation:'apply',proposalId:proposal.id,hash:proposal.hash,resourceVersion:propose.resourceVersion,actionId:id});
    const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
    expect(reviewDraftRefresh(workspace,applied.draftRefresh!,hash,false)).toEqual({ok:false,error:'review_required'});
    const edited=structuredClone(workspace);edited.draft!.name='User edit';
    expect(reviewDraftRefresh(edited,applied.draftRefresh!,hash,true)).toEqual({ok:false,error:'version_conflict'});
    expect(reviewDraftRefresh(workspace,applied.draftRefresh!,hash,true).ok).toBe(true);
    expect(workspace.draft!.name).toBe('Walk');
  });
  it('reviews full snapshots, changes only isolated state and returns an immutable retryable refresh boundary',()=>{
    const {service,propose,workspace}=fixture();
    const proposal=service.execute(actor,propose).proposal!;
    expect(proposal.draftReview?.after.name).toBe('Morning walk');
    expect(service.read(actor,actor)?.workspace?.draft?.name).toBe('Walk');
    proposal.draftReview!.after.name='tampered';
    const apply={...base,operation:'apply',proposalId:proposal.id,hash:proposal.hash,resourceVersion:propose.resourceVersion,actionId:id};
    const first=service.execute(actor,apply);
    expect(first.storage).toBe('isolated_ephemeral');
    expect(first.draftRefresh?.draft.name).toBe('Morning walk');
    expect(workspace.draft?.name).toBe('Walk');
    first.draftRefresh!.draft.name='mutated';
    expect(service.execute(actor,apply).draftRefresh?.draft.name).toBe('Morning walk');
    expect(service.execute(actor,{...base,operation:'receipt',actionId:id}).draftRefresh?.draft.name).toBe('Morning walk');
    expect(service.execute(actor,{...apply,hash:'0'.repeat(64)}).error).toBe('idempotency_conflict');
    expect(service.execute(actor,{...apply,conversationId:actor}).error).toBe('idempotency_conflict');
  });
  it('rejects stale competing proposals, invalid drafts and blocked workspace transitions',()=>{
    const {service,propose}=fixture();
    const first=service.execute(actor,propose).proposal!;
    const second=service.execute(actor,{...propose,after:{...propose.after,name:'Second'}}).proposal!;
    service.execute(actor,{...base,operation:'apply',proposalId:first.id,hash:first.hash,resourceVersion:propose.resourceVersion,actionId:id});
    expect(service.execute(actor,{...base,operation:'apply',proposalId:second.id,hash:second.hash,resourceVersion:propose.resourceVersion,actionId:actor}).error).toBe('version_conflict');
    expect(service.execute(actor,{...propose,after:{...propose.after,durationMinutes:-1}}).error).toBe('invalid_input');
    const blocked=fixture(true);
    expect(blocked.service.execute(actor,blocked.propose).error).toBe('version_conflict');
  });
  it('cancels before mutation and denies receipt access after revocation',()=>{
    const {service,propose}=fixture();
    const proposal=service.execute(actor,propose).proposal!;
    const apply={...base,operation:'apply',proposalId:proposal.id,hash:proposal.hash,resourceVersion:propose.resourceVersion,actionId:id};
    const abort=new AbortController();abort.abort();
    expect(service.execute(actor,apply,abort.signal).error).toBe('cancelled');
    expect(service.read(actor,actor)?.workspace?.draft?.name).toBe('Walk');
    expect(service.execute(actor,apply).receipt?.status).toBe('applied');
    service.revoke(actor,actor);
    expect(service.execute(actor,{...base,operation:'receipt',actionId:id}).error).toBe('forbidden');
  });
});
