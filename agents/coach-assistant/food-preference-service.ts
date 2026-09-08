import { createHash,randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { db } from '@/db/client';
import { writeFoodPreferences } from '@/lib/food/preference-service';
import { parseFoodPreferences } from '@/lib/food/preferences';
import { foodPreferenceOperationSchema,foodPreferenceProposalSchema,foodPreferenceResultSchema,type FoodPreferenceService } from './food-preference-actions';
import type { FoodPreferenceResult,FoodPreferenceProposal,FoodPreferenceRefresh } from './food-preference-contracts';
import type { CoachReceipt } from './contracts';

type Database=typeof db;
type Transaction=Parameters<Parameters<Database['transaction']>[0]>[0];
type Scope={actorId:string;subjectId:string;organizationId:string;signal:AbortSignal};
const action='food.preference.update';
const fail=(error:Extract<FoodPreferenceResult,{ok:false}>['error']):FoodPreferenceResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
class Rejected extends Error {constructor(readonly reason:Extract<FoodPreferenceResult,{ok:false}>['error']){super(reason);}}
const envelopeSchema=z.object({proposal:foodPreferenceProposalSchema}).strict();
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
async function authorize(tx:Transaction,scope:Scope) {
  scope.signal.throwIfAborted();
  const found=await tx.execute(sql`SELECT actor.id FROM public.profiles actor
    JOIN public.client_profiles cp ON cp.user_id=actor.id
    JOIN public.organization_members member ON member.user_id=actor.id
    WHERE actor.id=${scope.actorId}::uuid AND actor.id=${scope.subjectId}::uuid
      AND actor.role::text='client' AND member.role::text='client' AND member.org_id=${scope.organizationId}::uuid
    FOR SHARE OF actor,cp,member`);
  if(found.rows.length!==1)throw new Rejected('forbidden');
  scope.signal.throwIfAborted();
}
async function version(tx:Transaction,profileId:string) {
  const result=await tx.execute<{revision:string}>(sql`SELECT revision::text FROM private.coach_food_preference_versions WHERE subject_id=${profileId}::uuid`);
  if(result.rows.length!==1)throw new Rejected('uncertain');
  return result.rows[0].revision;
}

/** Concrete transaction service. Requires AG1's isolated schema extension before
 * connection: the SAME action ledger plus profile preference revisions, never a new ledger.
 * No production migration or HTTP enablement is performed by this factory.
 */
export function createFoodPreferenceService(database:Database):FoodPreferenceService {
  return {parsePreference:parseFoodPreferences,async execute(scope) {
    const parsed=foodPreferenceOperationSchema.safeParse(scope.operation);
    if(!parsed.success)return fail('invalid_input');
    const operation=parsed.data;
    if(operation.profileId!==scope.subjectId||scope.actorId!==scope.subjectId||(operation.clientId??scope.actorId)!==scope.subjectId)return fail('forbidden');
    try {
      if(operation.operation==='diet.propose')parseFoodPreferences(operation.after);
      return await database.transaction(async tx=>{
        await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);
        if(operation.operation==='diet.apply'||operation.operation==='diet.receipt')await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':'+operation.actionId},0))`);
        await authorize(tx,scope);
        if(operation.operation==='diet.apply'||operation.operation==='diet.receipt') {
          const prior=await tx.execute<{subject_id:string;organization_id:string;conversation_id:string;proposal_id:string;request_hash:string;resource_version:string;action:string;envelope:unknown;result:unknown}>(sql`
            SELECT r.subject_id,r.organization_id,r.conversation_id,r.proposal_id,r.request_hash,r.resource_version,r.result,p.action,p.envelope
            FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id AND p.subject_id=r.subject_id AND p.organization_id=r.organization_id AND p.conversation_id=r.conversation_id
            WHERE r.actor_id=${scope.actorId}::uuid AND r.action_id=${operation.actionId}::uuid`);
          if(prior.rows.length) {
            const stored=prior.rows[0];const envelope=envelopeSchema.safeParse(stored.envelope);
            if(stored.action!==action||!envelope.success||envelope.data.proposal.resource.id!==operation.profileId||stored.subject_id!==scope.subjectId||stored.organization_id!==scope.organizationId||stored.conversation_id!==operation.conversationId||(operation.operation==='diet.apply'&&(stored.proposal_id!==operation.proposalId||stored.request_hash!==operation.hash||stored.resource_version!==operation.resourceVersion)))throw new Rejected('idempotency_conflict');
            const result=foodPreferenceResultSchema.safeParse(stored.result);
            if(!result.success||!result.data.ok||!('receipt' in result.data)||result.data.receipt.actionId!==operation.actionId||result.data.receipt.proposalId!==stored.proposal_id)throw new Rejected('uncertain');
            scope.signal.throwIfAborted();return result.data;
          }
          if(operation.operation==='diet.receipt')return fail('not_found');
        }
        const current=await tx.execute<{food_preferences:unknown}>(sql`SELECT cp.food_preferences FROM public.client_profiles cp WHERE cp.user_id=${scope.subjectId}::uuid FOR UPDATE`);
        if(current.rows.length!==1)throw new Rejected('not_found');
        const before=parseFoodPreferences(current.rows[0].food_preferences);
        const currentVersion=await version(tx,scope.subjectId);
        if(operation.operation==='diet.read'){scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{profileId:scope.subjectId,version:currentVersion,preferences:before}} as FoodPreferenceResult;}
        if(operation.operation==='diet.propose') {
          if(currentVersion!==operation.resourceVersion)throw new Rejected('version_conflict');
          if(canonical(before)===canonical(operation.after))throw new Rejected('invalid_input');
          const count=await tx.execute<{count:string}>(sql`SELECT count(*)::text FROM private.coach_action_proposals WHERE actor_id=${scope.actorId}::uuid AND expires_at>now()`);
          if(Number(count.rows[0].count)>=128)throw new Rejected('uncertain');
          const after=parseFoodPreferences(operation.after);
          const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);
          const proposal:FoodPreferenceProposal={id:randomUUID(),hash:'',action,resource:{kind:'food_preference',id:operation.profileId,version:currentVersion},before,after,precondition:currentVersion,expiresAt:new Date(clock.rows[0].expires).toISOString(),reviewRequired:true};
          const envelope={proposal};
          proposal.hash=digest({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:operation.conversationId,envelope});
          if(new TextEncoder().encode(JSON.stringify(envelope)).length>4096)throw new Rejected('invalid_input');
          await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at)
            VALUES (${proposal.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,${action},${proposal.hash},${currentVersion},${JSON.stringify(envelope)}::jsonb,${proposal.expiresAt}::timestamptz)`);
          scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,proposal} as FoodPreferenceResult;
        }
        if(operation.operation!=='diet.apply')throw new Rejected('invalid_input');
        const saved=await tx.execute<{envelope:unknown;expired:boolean;request_hash:string;resource_version:string}>(sql`SELECT envelope,expires_at<=clock_timestamp() AS expired,request_hash,resource_version FROM private.coach_action_proposals
          WHERE id=${operation.proposalId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${operation.conversationId}::uuid AND action=${action}`);
        const stored=saved.rows[0];if(!stored)throw new Rejected('not_found');
        const envelope=envelopeSchema.parse(stored.envelope);const proposal=envelope.proposal;
        if(proposal.resource.id!==operation.profileId||proposal.id!==operation.proposalId||stored.request_hash!==operation.hash||proposal.hash!==operation.hash)throw new Rejected('invalid_input');
        if(stored.expired)throw new Rejected('expired');
        if(currentVersion!==operation.resourceVersion||stored.resource_version!==currentVersion||proposal.resource.version!==currentVersion||proposal.precondition!==currentVersion||canonical(proposal.before)!==canonical(before))throw new Rejected('version_conflict');
        const claimedHash=digest({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:operation.conversationId,envelope:{...envelope,proposal:{...proposal,hash:''}}});
        if(claimedHash!==proposal.hash)throw new Rejected('invalid_input');
        scope.signal.throwIfAborted();
        await authorize(tx,scope);
        const updated=await writeFoodPreferences(tx,{actorId:scope.actorId,subjectId:scope.subjectId,organizationId:scope.organizationId,before,after:proposal.after});
        if(canonical(updated)!==canonical(proposal.after))throw new Rejected('version_conflict');
        const nextVersion=await version(tx,operation.profileId);if(nextVersion===currentVersion)throw new Rejected('uncertain');
        const clock=await tx.execute<{recorded:string}>(sql`SELECT clock_timestamp()::text AS recorded`);
        const receipt:CoachReceipt={id:randomUUID(),actionId:operation.actionId,proposalId:proposal.id,status:'applied',resourceVersion:nextVersion,recordedAt:new Date(clock.rows[0].recorded).toISOString()};
        const refresh:FoodPreferenceRefresh={profileId:operation.profileId,previousVersion:currentVersion,version:nextVersion,strategy:'refetch',discardDerivedContext:true};
        const result:FoodPreferenceResult={version:'coach-assistant.v2',storage:'database',ok:true,receipt,refresh};
        await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result)
          VALUES (${receipt.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,${operation.actionId}::uuid,${proposal.id}::uuid,${operation.hash},${currentVersion},${JSON.stringify(result)}::jsonb)`);
        await tx.execute(sql`INSERT INTO public.audit_log(actor_id,actor_role,action,table_name,record_id,new_value)
          VALUES (${scope.actorId}::uuid,'client'::user_role,'food_preference_updated','client_profiles',${operation.profileId}::uuid,${JSON.stringify({actionId:operation.actionId,version:nextVersion})}::jsonb)`);
        scope.signal.throwIfAborted();return result;
      });
    } catch(error) {
      const databaseCode=(value:unknown):unknown=>value&&typeof value==='object'&&'code' in value?value.code:undefined;
      const cause=error&&typeof error==='object'&&'cause' in error?error.cause:undefined;
      if([databaseCode(error),databaseCode(cause)].some(code=>code==='42703'||code==='42P01'))return fail('not_connected');
      if(error instanceof Error&&['invalid_input','forbidden','version_conflict'].includes(error.message))return fail(error.message as 'invalid_input'|'forbidden'|'version_conflict');
      if(error instanceof Rejected)return fail(error.reason);
      if(error instanceof z.ZodError)return fail('invalid_input');
      if(error instanceof TRPCError&&error.code==='CONFLICT')return fail('version_conflict');
      if(error instanceof TRPCError&&error.code==='FORBIDDEN')return fail('forbidden');
      return fail('uncertain');
    }
  }};
}
