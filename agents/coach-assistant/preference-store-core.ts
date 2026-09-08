import { workoutWorkspaceReducer, type WorkoutWorkspaceState } from '@/lib/workout/workspace-state';
import type { WorkoutDraft } from '@/lib/workout/workspace-state';
import type { WorkoutPreferences } from '@/lib/types';
import type { CoachActionResult, CoachOperation, CoachProposal, CoachReceipt, CoachMemoryCard } from './contracts';

type Preferences = WorkoutPreferences;
export interface FixtureScope { actorId:string; subjectId:string; organizationId:string; preferences:Preferences; memories?:CoachMemoryCard[]; workspace?:WorkoutWorkspaceState }
const scopeKey = (actor:string,subject:string) => JSON.stringify([actor,subject]);

/** A real state transition in a disposable process-local fixture store.
 * Not wired into HTTP or a persistent profile. Never implies cross-device storage.
 * Production connection requires atomic authorization/CAS/receipt persistence.
 */
export interface PreferencePrimitives { hash(value:unknown):string; id():string }
export interface PreferenceStoreValidators {
  operation(value:unknown):CoachOperation|null;
  preferences(value:unknown):Preferences|null;
  memory(value:unknown):CoachMemoryCard|null;
  draft(value:unknown):WorkoutDraft|null;
}

export function createPreferenceStoreCore(fixtures:FixtureScope[], primitives:PreferencePrimitives, validators:PreferenceStoreValidators, now:()=>Date = ()=>new Date()) {
  const hash=(value:unknown)=>{const digest=primitives.hash(value);if(!/^[a-f0-9]{64}$/.test(digest))throw new Error('invalid_hash_primitive');return digest;};
  const randomUUID=()=>{const id=primitives.id();if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))throw new Error('invalid_id_primitive');return id;};
  if(fixtures.length>64) throw new Error('fixture_limit');
  const workspaces = new Map<string,WorkoutWorkspaceState>();
  const grants = new Map<string,string>();
  const memories = new Map<string,CoachMemoryCard>();
  const profiles = new Map<string,Preferences>();
  const proposals = new Map<string,{proposal:CoachProposal;actor:string;subject:string;org:string;conversation:string}>();
  const receipts = new Map<string,{receipt:CoachReceipt;proposalId:string;hash:string;version:string;conversation:string;draftRefresh?:CoachActionResult['draftRefresh'];memory?:CoachMemoryCard|null;invalidatedMemoryVersions?:Array<{id:string;version:string}>}>();
  for(const fixture of fixtures) {
    if(fixture.workspace) {
      if(!validators.draft(fixture.workspace.draft))throw new Error('invalid_draft_fixture');
      const existingWorkspace=workspaces.get(fixture.subjectId);
      if(existingWorkspace&&hash(existingWorkspace)!==hash(fixture.workspace))throw new Error('conflicting_draft_fixture');
      workspaces.set(fixture.subjectId,structuredClone(fixture.workspace));
    }
    const preferences=validators.preferences(fixture.preferences);
    if(!preferences)throw new Error('invalid_preference_fixture');
    const existing=profiles.get(fixture.subjectId);
    if(existing&&hash(existing)!==hash(preferences))throw new Error('conflicting_fixture');
    profiles.set(fixture.subjectId,preferences);
    if((fixture.memories?.length??0)>10)throw new Error('memory_fixture_limit');
    for(const raw of fixture.memories??[]) {
      const card=validators.memory(raw);
      if(!card)throw new Error('invalid_memory_fixture');
      if(card.scope!=='user')throw new Error('memory_scope_not_supported');
      const key=scopeKey(fixture.subjectId,card.id);
      if(memories.has(key)&&hash(memories.get(key))!==hash(card))throw new Error('conflicting_memory_fixture');
      memories.set(key,card);
    }
    grants.set(scopeKey(fixture.actorId,fixture.subjectId),fixture.organizationId);
  }
  const result = (value:Omit<CoachActionResult,'version'|'storage'>):CoachActionResult => ({version:'coach-assistant.v2',storage:'isolated_ephemeral',...value});
  return {
    /** Fixture administration only: bind the latest owner-verified UI state.
     * No HTTP operation exposes this. Historical receipts remain immutable.
     */
    bindWorkspace(actorId:string,subjectId:string,workspace:WorkoutWorkspaceState):CoachActionResult {
      if(!grants.has(scopeKey(actorId,subjectId)))return result({ok:false,error:'forbidden'});
      if(workspace.draft!==null&&!validators.draft(workspace.draft))return result({ok:false,error:'invalid_input'});
      if(workspace.draft===null)workspaces.delete(subjectId);
      else workspaces.set(subjectId,structuredClone(workspace));
      return result({ok:true});
    },
    /** Fixture administration only. Revocation invalidates even receipt access. */
    revoke(actorId:string,subjectId:string) { grants.delete(scopeKey(actorId,subjectId)); },
    read(actorId:string,subjectId:string) {
      if(!grants.has(scopeKey(actorId,subjectId)))return null;
      const preferences=profiles.get(subjectId);
      return preferences?{draftVersion:workspaces.has(subjectId)?hash(workspaces.get(subjectId)):undefined,workspace:structuredClone(workspaces.get(subjectId)),preferences:structuredClone(preferences),memories:[...memories.entries()].filter(([key])=>JSON.parse(key)[0]===subjectId).map(([,card])=>structuredClone(card)),version:hash(preferences),storage:'isolated_ephemeral' as const}:null;
    },
    execute(actorId:string,raw:unknown,signal?:AbortSignal):CoachActionResult {
      if(signal?.aborted)return result({ok:false,error:'cancelled'});
      const input=validators.operation(raw);
      if(!input)return result({ok:false,error:'invalid_input'});
      const subject=input.clientId??actorId;
      const org=grants.get(scopeKey(actorId,subject));
      const preferences=profiles.get(subject);
      if(!org||!preferences)return result({ok:false,error:'forbidden'});
      const version=hash(preferences);
      if(input.operation==='receipt') {
        const prior=receipts.get(scopeKey(scopeKey(actorId,subject),input.actionId));
        if(!prior||prior.conversation!==input.conversationId)return result({ok:false,error:'not_found'});
        return result({ok:true,receipt:structuredClone(prior.receipt),...(prior.draftRefresh?{draftRefresh:structuredClone(prior.draftRefresh)}:{}),...(prior.invalidatedMemoryVersions?{memory:structuredClone(prior.memory),invalidatedMemoryVersions:structuredClone(prior.invalidatedMemoryVersions)}:{})});
      }
      if(input.operation==='propose' && input.action==='draft.update') {
        const workspace=workspaces.get(subject);
        if(!workspace?.draft)return result({ok:false,error:'not_found'});
        const draftVersion=hash(workspace);
        if(input.resourceVersion!==draftVersion)return result({ok:false,error:'version_conflict'});
        if(hash(input.after)===hash(workspace.draft))return result({ok:false,error:'invalid_input'});
        try { workoutWorkspaceReducer(workspace,{type:'draft.updated',payload:{draft:input.after}}); }
        catch { return result({ok:false,error:'version_conflict'}); }
        if(proposals.size>=256)return result({ok:false,error:'uncertain'});
        const proposal:CoachProposal={id:randomUUID(),hash:'',action:'draft.update',resource:{kind:'draft',id:subject,version:draftVersion},before:{name:workspace.draft.name},after:{name:input.after.name},draftReview:{before:structuredClone(workspace.draft),after:structuredClone(input.after)},precondition:draftVersion,expiresAt:new Date(now().getTime()+300000).toISOString(),reviewRequired:true};
        proposal.hash=hash({proposal,actorId,subject,org,conversation:input.conversationId});
        proposals.set(proposal.id,{proposal,actor:actorId,subject,org,conversation:input.conversationId});
        return result({ok:true,proposal:structuredClone(proposal)});
      }
      if(input.operation==='propose' && input.action!=='preference.update') {
        const memory=memories.get(scopeKey(subject,input.memoryId));
        if(!memory)return result({ok:false,error:'not_found'});
        if(memory.version!==input.resourceVersion)return result({ok:false,error:'version_conflict'});
        if(proposals.size>=256)return result({ok:false,error:'uncertain'});
        const proposal:CoachProposal={id:randomUUID(),hash:'',action:input.action,resource:{kind:'memory',id:memory.id,version:memory.version},before:{text:memory.text,confirmation:memory.confirmation},after:input.action==='memory.delete'?{deleted:true}:{text:input.action==='memory.correct'?input.after.text:memory.text,confirmation:'confirmed'},precondition:memory.version,expiresAt:new Date(now().getTime()+300000).toISOString(),reviewRequired:true};
        proposal.hash=hash({proposal,actorId,subject,org,conversation:input.conversationId});
        proposals.set(proposal.id,{proposal,actor:actorId,subject,org,conversation:input.conversationId});
        return result({ok:true,proposal:structuredClone(proposal)});
      }
      if(input.operation==='propose' && input.action==='preference.update') {
        if(version!==input.resourceVersion)return result({ok:false,error:'version_conflict'});
        // Reuse the application's existing full preference validator.
        const after=validators.preferences({...preferences,...input.after});
        if(!after)return result({ok:false,error:'invalid_input'});
        if(proposals.size>=256)return result({ok:false,error:'uncertain'});
        const id=randomUUID();
        const proposal:CoachProposal={id,hash:'',action:'preference.update',resource:{kind:'preference',id:subject,version},before:{durationMinutes:preferences.durationMinutes},after:{durationMinutes:after.durationMinutes},precondition:version,expiresAt:new Date(now().getTime()+300000).toISOString(),reviewRequired:true};
        proposal.hash=hash({proposal,actorId,subject,org,conversation:input.conversationId});
        proposals.set(id,{proposal,actor:actorId,subject,org,conversation:input.conversationId});
        return result({ok:true,proposal:structuredClone(proposal)});
      }
      if(input.operation!=='apply')return result({ok:false,error:'invalid_input'});
      const key=scopeKey(scopeKey(actorId,subject),input.actionId);
      const prior=receipts.get(key);
      if(prior) {
        if(prior.proposalId!==input.proposalId||prior.hash!==input.hash||prior.version!==input.resourceVersion||prior.conversation!==input.conversationId)return result({ok:false,error:'idempotency_conflict'});
        return result({ok:true,receipt:structuredClone(prior.receipt),...(prior.draftRefresh?{draftRefresh:structuredClone(prior.draftRefresh)}:{}),...(prior.invalidatedMemoryVersions?{memory:structuredClone(prior.memory),invalidatedMemoryVersions:structuredClone(prior.invalidatedMemoryVersions)}:{})});
      }
      const stored=proposals.get(input.proposalId);
      if(!stored||stored.actor!==actorId||stored.subject!==subject||stored.org!==org||stored.conversation!==input.conversationId)return result({ok:false,error:'not_found'});
      const proposal=stored.proposal;
      if(proposal.hash!==input.hash)return result({ok:false,error:'invalid_input'});
      if(now().getTime()>=new Date(proposal.expiresAt).getTime())return result({ok:false,error:'expired'});
      if(proposal.resource.kind==='draft') {
        const workspace=workspaces.get(subject);
        if(!workspace||!proposal.draftReview)return result({ok:false,error:'not_found'});
        const previousVersion=hash(workspace);
        if(input.resourceVersion!==previousVersion||proposal.resource.version!==previousVersion)return result({ok:false,error:'version_conflict'});
        const parsedDraft=validators.draft(proposal.draftReview.after);
        if(!parsedDraft)return result({ok:false,error:'invalid_input'});
        let next:WorkoutWorkspaceState;
        try { next=workoutWorkspaceReducer(workspace,{type:'draft.updated',payload:{draft:structuredClone(parsedDraft)}}); }
        catch { return result({ok:false,error:'version_conflict'}); }
        if(receipts.size>=256)return result({ok:false,error:'uncertain'});
        const nextVersion=hash(next);
        const draftRefresh={draft:structuredClone(parsedDraft),previousVersion,version:nextVersion,reviewRequired:true as const};
        const receipt:CoachReceipt={id:randomUUID(),actionId:input.actionId,proposalId:proposal.id,status:'applied',resourceVersion:nextVersion,recordedAt:now().toISOString()};
        workspaces.set(subject,next);
        receipts.set(key,{receipt,proposalId:proposal.id,hash:proposal.hash,version:input.resourceVersion,conversation:input.conversationId,draftRefresh});
        return result({ok:true,receipt:structuredClone(receipt),draftRefresh:structuredClone(draftRefresh)});
      }
      if(proposal.resource.kind==='memory') {
        const memoryKey=scopeKey(subject,proposal.resource.id);
        const memory=memories.get(memoryKey);
        if(!memory)return result({ok:false,error:'not_found'});
        if(input.resourceVersion!==memory.version||proposal.resource.version!==memory.version)return result({ok:false,error:'version_conflict'});
        if(receipts.size>=256)return result({ok:false,error:'uncertain'});
        const next=proposal.action==='memory.delete'?null:{...memory,text:String(proposal.after.text),confirmation:'confirmed' as const,version:hash({previous:memory.version,after:proposal.after,proposalId:proposal.id})};
        const receipt:CoachReceipt={id:randomUUID(),actionId:input.actionId,proposalId:proposal.id,status:'applied',resourceVersion:next?.version??null,recordedAt:now().toISOString()};
        const invalidatedMemoryVersions=[{id:memory.id,version:memory.version}];
        if(next)memories.set(memoryKey,next);else memories.delete(memoryKey);
        receipts.set(key,{receipt,proposalId:proposal.id,hash:proposal.hash,version:input.resourceVersion,conversation:input.conversationId,memory:next,invalidatedMemoryVersions});
        return result({ok:true,receipt:structuredClone(receipt),memory:structuredClone(next),invalidatedMemoryVersions:structuredClone(invalidatedMemoryVersions)});
      }
      if(input.resourceVersion!==version||proposal.resource.version!==version)return result({ok:false,error:'version_conflict'});
      if(receipts.size>=256)return result({ok:false,error:'uncertain'});
      const next=validators.preferences({...preferences,...proposal.after});
      if(!next)return result({ok:false,error:'invalid_input'});
      // No await between authority/version check, mutation and receipt insertion:
      // the fixture transaction is atomic within this synchronous store.
      const receipt:CoachReceipt={id:randomUUID(),actionId:input.actionId,proposalId:proposal.id,status:'applied',resourceVersion:hash(next),recordedAt:now().toISOString()};
      profiles.set(subject,next);
      receipts.set(key,{receipt,proposalId:proposal.id,hash:proposal.hash,version:input.resourceVersion,conversation:input.conversationId});
      return result({ok:true,receipt:structuredClone(receipt)});
    },
  };
}
