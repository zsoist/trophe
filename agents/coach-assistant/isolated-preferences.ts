import { createHash, randomUUID } from 'node:crypto';
import { workoutPreferencesSchema } from '@/lib/workout/preferences';
import { preferenceOperationSchema } from './schema';
import type { CoachActionResult, CoachProposal, CoachReceipt } from './contracts';

type Preferences = ReturnType<typeof workoutPreferencesSchema.parse>;
interface FixtureScope { actorId:string; subjectId:string; organizationId:string; preferences:Preferences }
const hash = (value:unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const scopeKey = (actor:string,subject:string) => JSON.stringify([actor,subject]);

/** A real state transition in a disposable process-local fixture store.
 * Not wired into HTTP or a persistent profile. Never implies cross-device storage.
 * Production connection requires atomic authorization/CAS/receipt persistence.
 */
export function createIsolatedPreferenceService(fixtures:FixtureScope[], now:()=>Date = ()=>new Date()) {
  if(fixtures.length>64) throw new Error('fixture_limit');
  const grants = new Map<string,string>();
  const profiles = new Map<string,Preferences>();
  const proposals = new Map<string,{proposal:CoachProposal;actor:string;subject:string;org:string;conversation:string}>();
  const receipts = new Map<string,{receipt:CoachReceipt;proposalId:string;hash:string;version:string;conversation:string}>();
  for(const fixture of fixtures) {
    const preferences=workoutPreferencesSchema.parse(fixture.preferences);
    const existing=profiles.get(fixture.subjectId);
    if(existing&&hash(existing)!==hash(preferences))throw new Error('conflicting_fixture');
    profiles.set(fixture.subjectId,preferences);
    grants.set(scopeKey(fixture.actorId,fixture.subjectId),fixture.organizationId);
  }
  const result = (value:Omit<CoachActionResult,'version'|'storage'>):CoachActionResult => ({version:'coach-assistant.v2',storage:'isolated_ephemeral',...value});
  return {
    /** Fixture administration only. Revocation invalidates even receipt access. */
    revoke(actorId:string,subjectId:string) { grants.delete(scopeKey(actorId,subjectId)); },
    read(actorId:string,subjectId:string) {
      if(!grants.has(scopeKey(actorId,subjectId)))return null;
      const preferences=profiles.get(subjectId);
      return preferences?{preferences:structuredClone(preferences),version:hash(preferences),storage:'isolated_ephemeral' as const}:null;
    },
    execute(actorId:string,raw:unknown):CoachActionResult {
      const parsed=preferenceOperationSchema.safeParse(raw);
      if(!parsed.success)return result({ok:false,error:'invalid_input'});
      const input=parsed.data;
      const subject=input.clientId??actorId;
      const org=grants.get(scopeKey(actorId,subject));
      const preferences=profiles.get(subject);
      if(!org||!preferences)return result({ok:false,error:'forbidden'});
      const version=hash(preferences);
      if(input.operation==='receipt') {
        const prior=receipts.get(scopeKey(scopeKey(actorId,subject),input.actionId));
        if(!prior||prior.conversation!==input.conversationId)return result({ok:false,error:'not_found'});
        return result({ok:true,receipt:structuredClone(prior.receipt)});
      }
      if(input.operation==='propose') {
        if(version!==input.resourceVersion)return result({ok:false,error:'version_conflict'});
        // Reuse the application's existing full preference validator.
        const after=workoutPreferencesSchema.safeParse({...preferences,...input.after});
        if(!after.success)return result({ok:false,error:'invalid_input'});
        if(proposals.size>=256)return result({ok:false,error:'uncertain'});
        const id=randomUUID();
        const proposal:CoachProposal={id,hash:'',action:'preference.update',resource:{kind:'preference',id:subject,version},before:{durationMinutes:preferences.durationMinutes},after:{durationMinutes:after.data.durationMinutes},precondition:version,expiresAt:new Date(now().getTime()+300000).toISOString(),reviewRequired:true};
        proposal.hash=hash({proposal,actorId,subject,org,conversation:input.conversationId});
        proposals.set(id,{proposal,actor:actorId,subject,org,conversation:input.conversationId});
        return result({ok:true,proposal:structuredClone(proposal)});
      }
      const key=scopeKey(scopeKey(actorId,subject),input.actionId);
      const prior=receipts.get(key);
      if(prior) {
        if(prior.proposalId!==input.proposalId||prior.hash!==input.hash||prior.version!==input.resourceVersion||prior.conversation!==input.conversationId)return result({ok:false,error:'idempotency_conflict'});
        return result({ok:true,receipt:structuredClone(prior.receipt)});
      }
      const stored=proposals.get(input.proposalId);
      if(!stored||stored.actor!==actorId||stored.subject!==subject||stored.org!==org||stored.conversation!==input.conversationId)return result({ok:false,error:'not_found'});
      const proposal=stored.proposal;
      if(proposal.hash!==input.hash)return result({ok:false,error:'invalid_input'});
      if(now().getTime()>=new Date(proposal.expiresAt).getTime())return result({ok:false,error:'expired'});
      if(input.resourceVersion!==version||proposal.resource.version!==version)return result({ok:false,error:'version_conflict'});
      if(receipts.size>=256)return result({ok:false,error:'uncertain'});
      const next=workoutPreferencesSchema.parse({...preferences,...proposal.after});
      // No await between authority/version check, mutation and receipt insertion:
      // the fixture transaction is atomic within this synchronous store.
      const receipt:CoachReceipt={id:randomUUID(),actionId:input.actionId,proposalId:proposal.id,status:'applied',resourceVersion:hash(next),recordedAt:now().toISOString()};
      profiles.set(subject,next);
      receipts.set(key,{receipt,proposalId:proposal.id,hash:proposal.hash,version:input.resourceVersion,conversation:input.conversationId});
      return result({ok:true,receipt:structuredClone(receipt)});
    },
  };
}
