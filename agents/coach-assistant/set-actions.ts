import { z } from 'zod';
import type { CoachRepository } from './repository';
import type { WorkoutSetOperation, WorkoutSetResult } from './set-contracts';

const version=z.string().min(1).max(128);
const base={version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),turnId:z.string().uuid(),setId:z.string().uuid(),clientId:z.string().uuid().optional()};
/** Domain validation is delegated to the shared Workout writer. */
export const workoutSetOperationSchema=z.discriminatedUnion('operation',[
  z.object({...base,operation:z.literal('set.read')}).strict(),
  z.object({...base, setId:z.never().optional(),operation:z.literal('set.resolve'),sessionId:z.string().uuid(),exerciseId:z.string().uuid()}).strict(),
  z.object({...base,operation:z.literal('set.propose'),resourceVersion:version,after:z.object({reps:z.number().finite()}).strict()}).strict(),
  z.object({...base,operation:z.literal('set.apply'),proposalId:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),actionId:z.string().uuid(),resourceVersion:version,reviewed:z.literal(true)}).strict(),
  z.object({...base,operation:z.literal('set.receipt'),actionId:z.string().uuid()}).strict(),
]);
export const workoutSetValuesSchema=z.object({sessionId:z.string().uuid(),exerciseId:z.string().uuid(),setNumber:z.number().int().positive(),reps:z.number().int().nullable(),weightKg:z.number().finite().nullable(),rpe:z.number().finite().nullable(),isWarmup:z.boolean().nullable(),isPr:z.boolean().nullable()}).strict();
export const workoutSetProposalSchema=z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.literal('workout.set.reps.update'),resource:z.object({kind:z.literal('workout_set'),id:z.string().uuid(),version}).strict(),before:workoutSetValuesSchema,after:workoutSetValuesSchema,precondition:version,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
const receipt=z.object({id:z.string().uuid(),actionId:z.string().uuid(),proposalId:z.string().uuid(),status:z.enum(['applied','rejected','uncertain']),resourceVersion:version.nullable(),recordedAt:z.string().datetime({offset:true})}).strict();
const refresh=z.object({setId:z.string().uuid(),sessionId:z.string().uuid(),exerciseId:z.string().uuid(),previousVersion:version,version,strategy:z.literal('refetch')}).strict();
const resultBase={version:z.literal('coach-assistant.v2'),storage:z.literal('database')};
export const workoutSetResultSchema=z.union([
  z.object({...resultBase,ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','session_completed','ambiguous_selection','version_conflict','expired','idempotency_conflict','cancelled','uncertain'])}).strict(),
  z.object({...resultBase,ok:z.literal(true),snapshot:workoutSetValuesSchema.extend({setId:z.string().uuid(),version})}).strict(),
  z.object({...resultBase,ok:z.literal(true),proposal:workoutSetProposalSchema}).strict(),
  z.object({...resultBase,ok:z.literal(true),receipt,refresh:refresh.optional()}).strict(),
]);

export interface WorkoutSetService {
  parseRepsChange(input:unknown):{reps:number};
  execute(input:{actorId:string;subjectId:string;organizationId:string;operation:WorkoutSetOperation;signal:AbortSignal}):Promise<unknown>;
}
const fail=(error:Extract<WorkoutSetResult,{ok:false}>['error']):WorkoutSetResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});

/** Route activation requires isolated SQL acceptance. */
export async function executeWorkoutSetAction(actorId:string,raw:unknown,repository:CoachRepository,service:WorkoutSetService,signal:AbortSignal):Promise<WorkoutSetResult> {
  const parsed=workoutSetOperationSchema.safeParse(raw);
  if(!parsed.success)return fail('invalid_input');
  const operation=parsed.data;
  const subjectId=operation.clientId??actorId;
  if(subjectId!==actorId)return fail('forbidden');
  if(repository.dataSource!=='authorized_records')return fail('uncertain');
  if(operation.operation==='set.propose') {
    try {
      const validated=service.parseRepsChange(operation.after);
      if(validated.reps!==operation.after.reps)return fail('invalid_input');
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
    const validated=workoutSetResultSchema.safeParse(output);
    if(!validated.success)return fail('uncertain');
    const result=validated.data;
    if(!result.ok)return result;
    if(operation.operation==='set.resolve')return 'snapshot' in result&&result.snapshot.sessionId===operation.sessionId&&result.snapshot.exerciseId===operation.exerciseId?result:fail('uncertain');
    if(operation.operation==='set.read') {
      return 'snapshot' in result&&result.snapshot.setId===operation.setId?result:fail('uncertain');
    }
    if(operation.operation==='set.propose') {
      if(!('proposal' in result))return fail('uncertain');
      const p=result.proposal;
      if(p.resource.id!==operation.setId||p.resource.version!==operation.resourceVersion||p.precondition!==operation.resourceVersion||p.after.reps!==operation.after.reps)return fail('uncertain');
      const before={...p.before,reps:null};const after={...p.after,reps:null};
      if(JSON.stringify(before)!==JSON.stringify(after))return fail('uncertain');
      return result;
    }
    if(!('receipt' in result)||result.receipt.actionId!==operation.actionId||result.receipt.status==='uncertain')return fail('uncertain');
    if(operation.operation==='set.apply'&&result.receipt.proposalId!==operation.proposalId)return fail('uncertain');
    if(result.receipt.status!=='applied'&&result.refresh)return fail('uncertain');
    if(result.receipt.status==='applied') {
      if(!result.refresh||result.refresh.setId!==operation.setId||result.refresh.version!==result.receipt.resourceVersion)return fail('uncertain');
      if(operation.operation==='set.apply'&&result.refresh.previousVersion!==operation.resourceVersion)return fail('uncertain');
    }
    return result;
  } catch(error) {
    if(dispatched)return fail('uncertain');
    if(signal.aborted)return fail('cancelled');
    return fail(error instanceof Error&&error.message==='forbidden'?'forbidden':'uncertain');
  }
}
