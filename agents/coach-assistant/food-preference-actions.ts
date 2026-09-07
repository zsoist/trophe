import { FOOD_DIET_PATTERNS,type FoodPreferences } from '@/lib/food/preferences';
import { z } from 'zod';
import type { CoachRepository } from './repository';
import type { FoodPreferenceOperation, FoodPreferenceResult } from './food-preference-contracts';

export const foodPreferenceValuesSchema=z.object({version:z.literal(1),dietPattern:z.enum(FOOD_DIET_PATTERNS).nullable()}).strict();
const version=z.string().min(1).max(128);
const base={version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),turnId:z.string().uuid(),profileId:z.string().uuid(),clientId:z.string().uuid().optional()};
/** Domain validation is delegated to the shared Workout writer. */
export const foodPreferenceOperationSchema=z.discriminatedUnion('operation',[
  z.object({...base,operation:z.literal('diet.read')}).strict(),
  z.object({...base,operation:z.literal('diet.propose'),resourceVersion:version,after:foodPreferenceValuesSchema}).strict(),
  z.object({...base,operation:z.literal('diet.apply'),proposalId:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),actionId:z.string().uuid(),resourceVersion:version,reviewed:z.literal(true)}).strict(),
  z.object({...base,operation:z.literal('diet.receipt'),actionId:z.string().uuid()}).strict(),
]);

export const foodPreferenceProposalSchema=z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.literal('food.preference.update'),resource:z.object({kind:z.literal('food_preference'),id:z.string().uuid(),version}).strict(),before:foodPreferenceValuesSchema,after:foodPreferenceValuesSchema,precondition:version,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
const receipt=z.object({id:z.string().uuid(),actionId:z.string().uuid(),proposalId:z.string().uuid(),status:z.enum(['applied','rejected','uncertain']),resourceVersion:version.nullable(),recordedAt:z.string().datetime({offset:true})}).strict();
const refresh=z.object({profileId:z.string().uuid(),previousVersion:version,version,strategy:z.literal('refetch'),discardDerivedContext:z.literal(true)}).strict();
const resultBase={version:z.literal('coach-assistant.v2'),storage:z.literal('database')};
export const foodPreferenceResultSchema=z.union([
  z.object({...resultBase,ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','not_connected','version_conflict','expired','idempotency_conflict','cancelled','uncertain'])}).strict(),
  z.object({...resultBase,ok:z.literal(true),snapshot:z.object({profileId:z.string().uuid(),version,preferences:foodPreferenceValuesSchema}).strict()}).strict(),
  z.object({...resultBase,ok:z.literal(true),proposal:foodPreferenceProposalSchema}).strict(),
  z.object({...resultBase,ok:z.literal(true),receipt,refresh:refresh.optional()}).strict(),
]);

export interface FoodPreferenceService {
  parsePreference(input:unknown):FoodPreferences;
  execute(input:{actorId:string;subjectId:string;organizationId:string;operation:FoodPreferenceOperation;signal:AbortSignal}):Promise<unknown>;
}
const fail=(error:Extract<FoodPreferenceResult,{ok:false}>['error']):FoodPreferenceResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});

/** Route activation requires isolated SQL acceptance. */
export async function executeFoodPreferenceAction(actorId:string,raw:unknown,repository:CoachRepository,service:FoodPreferenceService,signal:AbortSignal):Promise<FoodPreferenceResult> {
  const parsed=foodPreferenceOperationSchema.safeParse(raw);
  if(!parsed.success)return fail('invalid_input');
  const operation=parsed.data;
  const subjectId=operation.clientId??actorId;
  if(subjectId!==actorId)return fail('forbidden');
  if(repository.dataSource!=='authorized_records')return fail('uncertain');
  if(operation.operation==='diet.propose') {
    try {
      const validated=service.parsePreference(operation.after);
      if(JSON.stringify(validated)!==JSON.stringify(operation.after))return fail('invalid_input');
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
    const validated=foodPreferenceResultSchema.safeParse(output);
    if(!validated.success)return fail('uncertain');
    const result=validated.data;
    if(!result.ok)return result;
    if(operation.operation==='diet.read') {
      return 'snapshot' in result&&result.snapshot.profileId===operation.profileId?result:fail('uncertain');
    }
    if(operation.operation==='diet.propose') {
      if(!('proposal' in result))return fail('uncertain');
      const p=result.proposal;
      if(p.resource.id!==operation.profileId||p.resource.version!==operation.resourceVersion||p.precondition!==operation.resourceVersion||JSON.stringify(p.after)!==JSON.stringify(operation.after))return fail('uncertain');
      return result;
    }
    if(!('receipt' in result)||result.receipt.actionId!==operation.actionId||result.receipt.status==='uncertain')return fail('uncertain');
    if(operation.operation==='diet.apply'&&result.receipt.proposalId!==operation.proposalId)return fail('uncertain');
    if(result.receipt.status!=='applied'&&result.refresh)return fail('uncertain');
    if(result.receipt.status==='applied') {
      if(!result.refresh||result.refresh.profileId!==operation.profileId||result.refresh.version!==result.receipt.resourceVersion)return fail('uncertain');
      if(operation.operation==='diet.apply'&&result.refresh.previousVersion!==operation.resourceVersion)return fail('uncertain');
    }
    return result;
  } catch(error) {
    if(dispatched)return fail('uncertain');
    if(signal.aborted)return fail('cancelled');
    return fail(error instanceof Error&&error.message==='forbidden'?'forbidden':'uncertain');
  }
}
