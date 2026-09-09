import { z } from 'zod';
import type { CoachRepository } from './repository';
import type { FoodQuantityOperation, FoodQuantityResult } from './food-contracts';

const version=z.string().min(1).max(128);
const common={version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),turnId:z.string().uuid(),clientId:z.string().uuid().optional()};
const base={...common,entryId:z.string().uuid()};
/** Structural envelope only: the shared Food service validates the quantity domain. */
export const foodQuantityOperationSchema=z.discriminatedUnion('operation',[
  z.object({...common,operation:z.literal('food.resolve'),entryHintId:z.string().uuid().optional(),loggedDateHint:z.string().date().optional(),expectedPreviousGrams:z.number().positive().max(10000).optional()}).strict()
    .refine(value=>Boolean(value.entryHintId)||value.expectedPreviousGrams!==undefined),
  z.object({...base,operation:z.literal('food.read')}).strict(),
  z.object({...base,operation:z.literal('food.propose'),resourceVersion:version,after:z.object({grams:z.number().finite()}).strict()}).strict(),
  z.object({...base,operation:z.literal('food.apply'),proposalId:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),actionId:z.string().uuid(),resourceVersion:version,reviewed:z.literal(true)}).strict(),
  z.object({...base,operation:z.literal('food.receipt'),actionId:z.string().uuid()}).strict(),
]);
export const foodEntryValuesSchema=z.object({loggedDate:z.string().date(),foodName:z.string().min(1).max(200),foodId:z.string().uuid().nullable(),source:z.string().min(1).max(80).nullable(),sourceId:z.string().min(1).max(500).nullable(),grams:z.number().positive().nullable(),quantity:z.number().nonnegative(),calories:z.number().nonnegative(),proteinG:z.number().nonnegative(),carbsG:z.number().nonnegative(),fatG:z.number().nonnegative(),fiberG:z.number().nonnegative().nullable(),sugarG:z.number().nonnegative().nullable()}).strict();
export const foodQuantityProposalSchema=z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.literal('food.quantity.update'),resource:z.object({kind:z.literal('food_entry'),id:z.string().uuid(),version}).strict(),before:foodEntryValuesSchema,after:foodEntryValuesSchema,expectedVersion:version,precondition:version,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
const receipt=z.object({id:z.string().uuid(),actionId:z.string().uuid(),proposalId:z.string().uuid(),status:z.enum(['applied','rejected','uncertain']),resourceVersion:version.nullable(),recordedAt:z.string().datetime({offset:true})}).strict();
const refresh=z.object({entryId:z.string().uuid(),loggedDate:z.string().date(),previousVersion:version,version,strategy:z.literal('refetch')}).strict();
const change=z.object({beforeGrams:z.number().positive().max(10000),afterGrams:z.number().positive().max(10000)}).strict().refine(value=>value.beforeGrams!==value.afterGrams);
const resultBase={version:z.literal('coach-assistant.v2'),storage:z.literal('database')};
export const foodQuantityResultSchema=z.union([
  z.object({...resultBase,ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','ambiguous_selection','version_conflict','expired','idempotency_conflict','cancelled','uncertain'])}).strict(),
  z.object({...resultBase,ok:z.literal(true),snapshot:foodEntryValuesSchema.extend({entryId:z.string().uuid(),version})}).strict(),
  z.object({...resultBase,ok:z.literal(true),proposal:foodQuantityProposalSchema}).strict(),
  z.object({...resultBase,ok:z.literal(true),receipt,refresh:refresh.optional(),change:change.optional()}).strict(),
]);

/** The AG3 Food transaction service implements this port over the shared ledger. No calculation or mutation
 * is duplicated here. parseQuantityChange delegates the existing editFieldsSchema.
 * execute reauthorizes current self/org and entry ownership inside its transaction,
 * locks/version-checks the entry and derivation basis, and commits update+receipt
 * atomically. Every ordinary Food edit must invalidate the same resource version.
 */
export interface FoodQuantityService {
  parseQuantityChange(input:unknown):{grams:number};
  execute(input:{actorId:string;subjectId:string;organizationId:string;operation:FoodQuantityOperation;signal:AbortSignal}):Promise<unknown>;
}
const fail=(error:Extract<FoodQuantityResult,{ok:false}>['error']):FoodQuantityResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});

/** Handler transport is gated; concrete route activation requires isolated SQL acceptance. */
export async function executeFoodQuantityAction(actorId:string,raw:unknown,repository:CoachRepository,service:FoodQuantityService,signal:AbortSignal):Promise<FoodQuantityResult> {
  const parsed=foodQuantityOperationSchema.safeParse(raw);
  if(!parsed.success)return fail('invalid_input');
  const operation=parsed.data;
  const subjectId=operation.clientId??actorId;
  if(subjectId!==actorId)return fail('forbidden');
  if(repository.dataSource!=='authorized_records')return fail('uncertain');
  if(operation.operation==='food.propose') {
    try {
      const validated=service.parseQuantityChange(operation.after);
      if(validated.grams!==operation.after.grams)return fail('invalid_input');
    } catch {return fail('invalid_input');}
  }
  let dispatched=false;
  try {
    signal.throwIfAborted();
    const context=await repository.authorize(actorId,subjectId,signal);
    signal.throwIfAborted();
    if(context.actorId!==actorId||context.subjectId!==subjectId||!context.organizationId)return fail('forbidden');
    dispatched=true;
    const output=await service.execute({actorId,subjectId,organizationId:context.organizationId,operation:structuredClone(operation),signal});
    if(signal.aborted)return fail('uncertain');
    const fresh=await repository.authorize(actorId,subjectId,signal);
    if(JSON.stringify(fresh)!==JSON.stringify(context))return fail('forbidden');
    const validated=foodQuantityResultSchema.safeParse(output);
    if(!validated.success)return fail('uncertain');
    const result=validated.data;
    if(!result.ok)return result;
    if(operation.operation==='food.resolve') {
      return 'snapshot' in result&&(!operation.entryHintId||result.snapshot.entryId===operation.entryHintId)&&(!operation.loggedDateHint||result.snapshot.loggedDate===operation.loggedDateHint)&&(operation.expectedPreviousGrams===undefined||result.snapshot.grams===operation.expectedPreviousGrams)?result:fail('uncertain');
    }
    if(operation.operation==='food.read') {
      return 'snapshot' in result&&result.snapshot.entryId===operation.entryId?result:fail('uncertain');
    }
    if(operation.operation==='food.propose') {
      if(!('proposal' in result))return fail('uncertain');
      const p=result.proposal;
      if(p.resource.id!==operation.entryId||p.resource.version!==operation.resourceVersion||p.expectedVersion!==operation.resourceVersion||p.precondition!==operation.resourceVersion||p.after.grams!==operation.after.grams)return fail('uncertain');
      // This operation changes grams and derived macros only, never identity/day/name.
      if(p.before.loggedDate!==p.after.loggedDate||p.before.foodName!==p.after.foodName||p.before.foodId!==p.after.foodId||p.before.source!==p.after.source||p.before.sourceId!==p.after.sourceId||p.before.quantity!==p.after.quantity)return fail('uncertain');
      return result;
    }
    if(!('receipt' in result)||result.receipt.actionId!==operation.actionId||result.receipt.status==='uncertain')return fail('uncertain');
    if(operation.operation==='food.apply'&&result.receipt.proposalId!==operation.proposalId)return fail('uncertain');
    if(result.receipt.status!=='applied'&&result.refresh)return fail('uncertain');
    if(result.receipt.status==='applied') {
      if(!result.refresh||result.refresh.entryId!==operation.entryId||result.refresh.version!==result.receipt.resourceVersion)return fail('uncertain');
      if(operation.operation==='food.apply'&&result.refresh.previousVersion!==operation.resourceVersion)return fail('uncertain');
    }
    return result;
  } catch(error) {
    if(dispatched)return fail('uncertain');
    if(signal.aborted)return fail('cancelled');
    return fail(error instanceof Error&&error.message==='forbidden'?'forbidden':'uncertain');
  }
}
