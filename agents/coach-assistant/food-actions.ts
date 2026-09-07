import { z } from 'zod';
import type { CoachRepository } from './repository';
import type { FoodQuantityOperation, FoodQuantityResult } from './food-contracts';

const version=z.string().min(1).max(128);
const base={version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),turnId:z.string().uuid(),entryId:z.string().uuid(),clientId:z.string().uuid().optional()};
/** Structural envelope only: the shared Food service validates the quantity domain. */
export const foodQuantityOperationSchema=z.discriminatedUnion('operation',[
  z.object({...base,operation:z.literal('food.read')}).strict(),
  z.object({...base,operation:z.literal('food.propose'),resourceVersion:version,after:z.object({grams:z.number().finite()}).strict()}).strict(),
  z.object({...base,operation:z.literal('food.apply'),proposalId:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),actionId:z.string().uuid(),resourceVersion:version,reviewed:z.literal(true)}).strict(),
  z.object({...base,operation:z.literal('food.receipt'),actionId:z.string().uuid()}).strict(),
]);
export const foodEntryValuesSchema=z.object({loggedDate:z.string().date(),foodName:z.string().min(1).max(200),grams:z.number().positive().nullable(),quantity:z.number().nonnegative(),calories:z.number().nonnegative(),proteinG:z.number().nonnegative(),carbsG:z.number().nonnegative(),fatG:z.number().nonnegative(),fiberG:z.number().nonnegative().nullable(),sugarG:z.number().nonnegative().nullable()}).strict();
export const foodQuantityProposalSchema=z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.literal('food.quantity.update'),resource:z.object({kind:z.literal('food_entry'),id:z.string().uuid(),version}).strict(),before:foodEntryValuesSchema,after:foodEntryValuesSchema,precondition:version,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
const receipt=z.object({id:z.string().uuid(),actionId:z.string().uuid(),proposalId:z.string().uuid(),status:z.enum(['applied','rejected','uncertain']),resourceVersion:version.nullable(),recordedAt:z.string().datetime({offset:true})}).strict();
const refresh=z.object({entryId:z.string().uuid(),loggedDate:z.string().date(),previousVersion:version,version,strategy:z.literal('refetch')}).strict();
const resultBase={version:z.literal('coach-assistant.v2'),storage:z.literal('database')};
export const foodQuantityResultSchema=z.union([
  z.object({...resultBase,ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','version_conflict','expired','idempotency_conflict','cancelled','uncertain'])}).strict(),
  z.object({...resultBase,ok:z.literal(true),snapshot:foodEntryValuesSchema.extend({entryId:z.string().uuid(),version})}).strict(),
  z.object({...resultBase,ok:z.literal(true),proposal:foodQuantityProposalSchema}).strict(),
  z.object({...resultBase,ok:z.literal(true),receipt,refresh:refresh.optional()}).strict(),
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

/** Not connected to HTTP until the shared writer and isolated SQL tests are ready. */
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
    const validated=foodQuantityResultSchema.safeParse(output);
    if(!validated.success)return fail('uncertain');
    const result=validated.data;
    if(!result.ok)return result;
    if(operation.operation==='food.read') {
      return 'snapshot' in result&&result.snapshot.entryId===operation.entryId?result:fail('uncertain');
    }
    if(operation.operation==='food.propose') {
      if(!('proposal' in result))return fail('uncertain');
      const p=result.proposal;
      if(p.resource.id!==operation.entryId||p.resource.version!==operation.resourceVersion||p.precondition!==operation.resourceVersion||p.after.grams!==operation.after.grams)return fail('uncertain');
      // This operation changes grams and derived macros only, never identity/day/name.
      if(p.before.loggedDate!==p.after.loggedDate||p.before.foodName!==p.after.foodName||p.before.quantity!==p.after.quantity)return fail('uncertain');
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
