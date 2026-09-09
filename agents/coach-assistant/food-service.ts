import { createHash,randomUUID } from 'node:crypto';
import { and,eq,sql } from 'drizzle-orm';
import { TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { db } from '@/db/client';
import { foodLog } from '@/db/schema/food';
import { applyFoodLogEdit,deriveFoodLogEdit,parseFoodQuantityChange,type FoodLogRow,type FoodEditValues } from '@/lib/food/log-edit-service';
import { foodQuantityOperationSchema,foodQuantityProposalSchema,foodQuantityResultSchema,foodEntryValuesSchema,type FoodQuantityService } from './food-actions';
import type { FoodQuantityResult,FoodQuantityProposal,FoodQuantityRefresh } from './food-contracts';
import type { CoachReceipt } from './contracts';

type Database=typeof db;
type Transaction=Parameters<Parameters<Database['transaction']>[0]>[0];
type Scope={actorId:string;subjectId:string;organizationId:string;signal:AbortSignal};
const action='food.quantity.update';
const fail=(error:Extract<FoodQuantityResult,{ok:false}>['error']):FoodQuantityResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
class Rejected extends Error {constructor(readonly reason:Extract<FoodQuantityResult,{ok:false}>['error']){super(reason);}}
const expectedEditSchema=z.object({foodName:z.string(),quantity:z.number(),qtyG:z.string().nullable(),calories:z.number().nullable(),proteinG:z.number().nullable(),carbsG:z.number().nullable(),fatG:z.number().nullable(),fiberG:z.number().nullable(),sugarG:z.number().nullable()}).strict();
const envelopeSchema=z.object({proposal:foodQuantityProposalSchema,expectedEdit:expectedEditSchema,foodId:z.string().uuid().nullable()}).strict();
function canonical(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(canonical).join(',')}]`;
  if(value!==null&&typeof value==='object')return `{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical((value as Record<string,unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value:unknown){return createHash('sha256').update(canonical(value)).digest('hex');}
function values(row:FoodLogRow){return foodEntryValuesSchema.parse({loggedDate:row.loggedDate,foodName:row.foodName,foodId:row.foodId,source:row.source,sourceId:row.sourceId,grams:row.qtyG===null?null:Number(row.qtyG),quantity:row.quantity,calories:row.calories,proteinG:row.proteinG,carbsG:row.carbsG,fatG:row.fatG,fiberG:row.fiberG,sugarG:row.sugarG});}
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
async function version(tx:Transaction,entryId:string) {
  const result=await tx.execute<{revision:string}>(sql`SELECT revision::text FROM private.coach_food_entry_versions WHERE entry_id=${entryId}::uuid`);
  if(result.rows.length!==1)throw new Rejected('uncertain');
  return result.rows[0].revision;
}

/** Concrete transaction service. Requires AG1's isolated schema extension before
 * connection: the SAME action ledger plus Food entry revisions, never a new ledger.
 * No production migration or HTTP enablement is performed by this factory.
 */
export function createFoodQuantityService(database:Database):FoodQuantityService {
  return {parseQuantityChange:parseFoodQuantityChange,async execute(scope) {
    const parsed=foodQuantityOperationSchema.safeParse(scope.operation);
    if(!parsed.success)return fail('invalid_input');
    const operation=parsed.data;
    if(scope.actorId!==scope.subjectId||(operation.clientId??scope.actorId)!==scope.subjectId)return fail('forbidden');
    try {
      if(operation.operation==='food.propose')parseFoodQuantityChange(operation.after);
      return await database.transaction(async tx=>{
        await tx.execute(sql`SET LOCAL statement_timeout='5000ms'`);
        if(operation.operation==='food.apply'||operation.operation==='food.receipt')await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${scope.actorId+':'+operation.actionId},0))`);
        await authorize(tx,scope);
        if(operation.operation==='food.apply'||operation.operation==='food.receipt') {
          const prior=await tx.execute<{subject_id:string;organization_id:string;conversation_id:string;proposal_id:string;request_hash:string;resource_version:string;action:string;envelope:unknown;result:unknown}>(sql`
            SELECT r.subject_id,r.organization_id,r.conversation_id,r.proposal_id,r.request_hash,r.resource_version,r.result,p.action,p.envelope
            FROM private.coach_action_receipts r JOIN private.coach_action_proposals p ON p.id=r.proposal_id AND p.actor_id=r.actor_id AND p.subject_id=r.subject_id AND p.organization_id=r.organization_id AND p.conversation_id=r.conversation_id
            WHERE r.actor_id=${scope.actorId}::uuid AND r.action_id=${operation.actionId}::uuid`);
          if(prior.rows.length) {
            const stored=prior.rows[0];const envelope=envelopeSchema.safeParse(stored.envelope);
            if(stored.action!==action||!envelope.success||envelope.data.proposal.resource.id!==operation.entryId||stored.subject_id!==scope.subjectId||stored.organization_id!==scope.organizationId||stored.conversation_id!==operation.conversationId||(operation.operation==='food.apply'&&(stored.proposal_id!==operation.proposalId||stored.request_hash!==operation.hash||stored.resource_version!==operation.resourceVersion)))throw new Rejected('idempotency_conflict');
            const result=foodQuantityResultSchema.safeParse(stored.result);
            if(!result.success||!result.data.ok||!('receipt' in result.data)||result.data.receipt.actionId!==operation.actionId||result.data.receipt.proposalId!==stored.proposal_id)throw new Rejected('uncertain');
            const beforeGrams=envelope.data.proposal.before.grams,afterGrams=envelope.data.proposal.after.grams;
            if(beforeGrams===null||afterGrams===null||beforeGrams===afterGrams)throw new Rejected('uncertain');
            scope.signal.throwIfAborted();return {...result.data,change:{beforeGrams,afterGrams}};
          }
          if(operation.operation==='food.receipt')return fail('not_found');
        }
        let entryId:string;
        if(operation.operation==='food.resolve') {
          const candidates=await tx.execute<{id:string}>(operation.entryHintId
            ? operation.expectedPreviousGrams===undefined
              ? sql`SELECT id FROM public.food_log WHERE id=${operation.entryHintId}::uuid AND user_id=${scope.subjectId}::uuid LIMIT 2 FOR UPDATE`
              : sql`SELECT id FROM public.food_log WHERE id=${operation.entryHintId}::uuid AND user_id=${scope.subjectId}::uuid AND qty_g=${operation.expectedPreviousGrams}::numeric LIMIT 2 FOR UPDATE`
            : operation.loggedDateHint
              ? sql`SELECT id FROM public.food_log WHERE user_id=${scope.subjectId}::uuid AND logged_date=${operation.loggedDateHint}::date AND qty_g=${operation.expectedPreviousGrams}::numeric ORDER BY created_at DESC NULLS FIRST LIMIT 2 FOR UPDATE`
              : sql`SELECT id FROM public.food_log WHERE user_id=${scope.subjectId}::uuid AND qty_g=${operation.expectedPreviousGrams}::numeric ORDER BY created_at DESC NULLS FIRST LIMIT 2 FOR UPDATE`);
          if(!candidates.rows.length)throw new Rejected('not_found');
          if(candidates.rows.length!==1)throw new Rejected('ambiguous_selection');
          entryId=candidates.rows[0].id;
        } else entryId=operation.entryId;
        const [existing]=await tx.select().from(foodLog).where(and(eq(foodLog.id,entryId),eq(foodLog.userId,scope.subjectId))).limit(1).for('update');
        if(!existing)throw new Rejected('not_found');
        const currentVersion=await version(tx,entryId);
        const before=values(existing);
        if(operation.operation==='food.resolve'&&operation.expectedPreviousGrams!==undefined&&before.grams!==operation.expectedPreviousGrams)throw new Rejected('version_conflict');
        if(operation.operation==='food.read'||operation.operation==='food.resolve') {scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,snapshot:{...before,entryId,version:currentVersion}} as FoodQuantityResult;}
        // Hold the canonical nutrient source stable through preview/write/receipt.
        if(existing.foodId)await tx.execute(sql`SELECT id FROM public.foods WHERE id=${existing.foodId}::uuid FOR SHARE`);
        if(operation.operation==='food.propose') {
          if(currentVersion!==operation.resourceVersion)throw new Rejected('version_conflict');
          if(before.grams===operation.after.grams)throw new Rejected('invalid_input');
          const count=await tx.execute<{count:string}>(sql`SELECT count(*)::text FROM private.coach_action_proposals WHERE actor_id=${scope.actorId}::uuid AND expires_at>now()`);
          if(Number(count.rows[0].count)>=128)throw new Rejected('uncertain');
          const expectedEdit=await deriveFoodLogEdit(tx,existing,operation.after);
          const after=values({...existing,...expectedEdit});
          const clock=await tx.execute<{expires:string}>(sql`SELECT (clock_timestamp()+interval '5 minutes')::text AS expires`);
          const proposal:FoodQuantityProposal={id:randomUUID(),hash:'',action,resource:{kind:'food_entry',id:operation.entryId,version:currentVersion},before,after,expectedVersion:currentVersion,precondition:currentVersion,expiresAt:new Date(clock.rows[0].expires).toISOString(),reviewRequired:true};
          const envelope={proposal,expectedEdit,foodId:existing.foodId};
          proposal.hash=digest({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:operation.conversationId,envelope});
          if(new TextEncoder().encode(JSON.stringify(envelope)).length>4096)throw new Rejected('invalid_input');
          await tx.execute(sql`INSERT INTO private.coach_action_proposals(id,actor_id,subject_id,organization_id,conversation_id,action,request_hash,resource_version,envelope,expires_at)
            VALUES (${proposal.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,${action},${proposal.hash},${currentVersion},${JSON.stringify(envelope)}::jsonb,${proposal.expiresAt}::timestamptz)`);
          scope.signal.throwIfAborted();return {version:'coach-assistant.v2',storage:'database',ok:true,proposal} as FoodQuantityResult;
        }
        if(operation.operation!=='food.apply')throw new Rejected('invalid_input');
        const saved=await tx.execute<{envelope:unknown;expired:boolean;request_hash:string;resource_version:string}>(sql`SELECT envelope,expires_at<=clock_timestamp() AS expired,request_hash,resource_version FROM private.coach_action_proposals
          WHERE id=${operation.proposalId}::uuid AND actor_id=${scope.actorId}::uuid AND subject_id=${scope.subjectId}::uuid AND organization_id=${scope.organizationId}::uuid AND conversation_id=${operation.conversationId}::uuid AND action=${action}`);
        const stored=saved.rows[0];if(!stored)throw new Rejected('not_found');
        const envelope=envelopeSchema.parse(stored.envelope);const proposal=envelope.proposal;
        if(proposal.resource.id!==operation.entryId||proposal.id!==operation.proposalId||stored.request_hash!==operation.hash||proposal.hash!==operation.hash)throw new Rejected('invalid_input');
        if(stored.expired)throw new Rejected('expired');
        if(currentVersion!==operation.resourceVersion||stored.resource_version!==currentVersion||proposal.resource.version!==currentVersion||proposal.expectedVersion!==currentVersion||proposal.precondition!==currentVersion||canonical(proposal.before)!==canonical(before)||envelope.foodId!==existing.foodId)throw new Rejected('version_conflict');
        const claimedHash=digest({actor:scope.actorId,subject:scope.subjectId,organization:scope.organizationId,conversation:operation.conversationId,envelope:{...envelope,proposal:{...proposal,hash:''}}});
        if(claimedHash!==proposal.hash)throw new Rejected('invalid_input');
        await authorize(tx,scope);
        scope.signal.throwIfAborted();
        const updated=await applyFoodLogEdit({ctx:{db:tx},existing,input:parseFoodQuantityChange({grams:proposal.after.grams}),ownerUserId:scope.subjectId,correctedBy:scope.actorId,expectedEdit:envelope.expectedEdit as FoodEditValues,transactional:true});
        if(canonical(values(updated.updated))!==canonical(proposal.after))throw new Rejected('version_conflict');
        const nextVersion=await version(tx,operation.entryId);if(nextVersion===currentVersion)throw new Rejected('uncertain');
        const clock=await tx.execute<{recorded:string}>(sql`SELECT clock_timestamp()::text AS recorded`);
        const receipt:CoachReceipt={id:randomUUID(),actionId:operation.actionId,proposalId:proposal.id,status:'applied',resourceVersion:nextVersion,recordedAt:new Date(clock.rows[0].recorded).toISOString()};
        const refresh:FoodQuantityRefresh={entryId:operation.entryId,loggedDate:before.loggedDate,previousVersion:currentVersion,version:nextVersion,strategy:'refetch'};
        if(proposal.before.grams===null||proposal.after.grams===null)throw new Rejected('uncertain');
        const result:FoodQuantityResult={version:'coach-assistant.v2',storage:'database',ok:true,receipt,refresh,change:{beforeGrams:proposal.before.grams,afterGrams:proposal.after.grams}};
        await tx.execute(sql`INSERT INTO private.coach_action_receipts(id,actor_id,subject_id,organization_id,conversation_id,action_id,proposal_id,request_hash,resource_version,result)
          VALUES (${receipt.id}::uuid,${scope.actorId}::uuid,${scope.subjectId}::uuid,${scope.organizationId}::uuid,${operation.conversationId}::uuid,${operation.actionId}::uuid,${proposal.id}::uuid,${operation.hash},${currentVersion},${JSON.stringify(result)}::jsonb)`);
        await tx.execute(sql`INSERT INTO public.audit_log(actor_id,actor_role,action,table_name,record_id,new_value)
          VALUES (${scope.actorId}::uuid,'client'::user_role,'food_quantity_updated','food_log',${operation.entryId}::uuid,${JSON.stringify({actionId:operation.actionId,version:nextVersion})}::jsonb)`);
        scope.signal.throwIfAborted();return result;
      });
    } catch(error) {
      if(error instanceof Rejected)return fail(error.reason);
      if(error instanceof z.ZodError)return fail('invalid_input');
      if(error instanceof TRPCError&&error.code==='CONFLICT')return fail('version_conflict');
      if(error instanceof TRPCError&&error.code==='FORBIDDEN')return fail('forbidden');
      return fail('uncertain');
    }
  }};
}
