import { z } from 'zod';
import { workoutPreferencesSchema } from '@/lib/workout/preferences';
import { preferenceOperationSchema } from './schema';
import type { CoachActionResult, CoachPreferenceOperation } from './contracts';
import type { CoachRepository } from './repository';

/** Implemented by the shared Workout service, not by this adapter.
 * The service MUST reauthorize current actor/subject/org inside its transaction,
 * including receipt lookup, and atomically persist the mutation and receipt.
 * Proposals are immutable persisted envelopes with expiry. Never retry with a new
 * actionId, write a second mutation here, or use the ephemeral store as fallback.
 */
export interface DurableCoachActionService {
  execute(input:{actorId:string;subjectId:string;organizationId:string;operation:CoachPreferenceOperation;signal:AbortSignal}):Promise<unknown>;
}
export interface DurableCoachProfileService extends DurableCoachActionService {
  read(input:{actorId:string;subjectId:string;organizationId:string;signal:AbortSignal}):Promise<unknown>;
}
/** Replaces, rather than adds to, the bounded personal-context read. */
export function withDurablePreferenceRead(repository:CoachRepository,service:DurableCoachProfileService):CoachRepository {
  return {...repository,personalContext:async args=>{
    const {context,signal}=args;
    if(repository.dataSource!=='authorized_records'||context.actorId!==context.subjectId)throw new Error('forbidden');
    signal.throwIfAborted();
    const parsed=z.object({preferences:workoutPreferencesSchema,version:z.string().min(1).max(128)}).strict().safeParse(await service.read({actorId:context.actorId,subjectId:context.subjectId,organizationId:context.organizationId,signal}));
    signal.throwIfAborted();
    if(!parsed.success)throw new Error('query_failed');
    return {rows:[{userId:context.subjectId,preferences:parsed.data.preferences,preferencesVersion:parsed.data.version,memories:[],memoriesRead:false}],truncated:false};
  }};
}
const failure=(error:CoachActionResult['error']):CoachActionResult=>({version:'coach-assistant.v2',ok:false,storage:'database',error});
const duration=z.union([z.literal(20),z.literal(30),z.literal(45),z.literal(60)]);
const version=z.string().min(1).max(128);
const proposalSchema=z.object({
  id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.literal('preference.update'),
  resource:z.object({kind:z.literal('preference'),id:z.string().uuid(),version}).strict(),
  before:z.object({durationMinutes:duration}).strict(),after:z.object({durationMinutes:duration}).strict(),
  precondition:version,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true),
}).strict();
const receiptSchema=z.object({id:z.string().uuid(),actionId:z.string().uuid(),proposalId:z.string().uuid(),status:z.enum(['applied','rejected','uncertain']),resourceVersion:version.nullable(),recordedAt:z.string().datetime({offset:true})}).strict();
const resultSchema=z.union([
  z.object({version:z.literal('coach-assistant.v2'),storage:z.literal('database'),ok:z.literal(false),error:z.enum(['cancelled','forbidden','invalid_input','version_conflict','expired','not_found','idempotency_conflict','uncertain'])}).strict(),
  z.object({version:z.literal('coach-assistant.v2'),storage:z.literal('database'),ok:z.literal(true),proposal:proposalSchema}).strict(),
  z.object({version:z.literal('coach-assistant.v2'),storage:z.literal('database'),ok:z.literal(true),receipt:receiptSchema}).strict(),
]);

/** Not connected to HTTP until the shared durable service is implemented/tested. */
export async function executeDurablePreferenceAction(actorId:string,raw:unknown,repository:CoachRepository,service:DurableCoachActionService,signal:AbortSignal):Promise<CoachActionResult> {
  const parsed=preferenceOperationSchema.safeParse(raw);
  if(!parsed.success)return failure('invalid_input');
  const input=parsed.data;
  const subjectId=input.clientId??actorId;
  if(subjectId!==actorId)return failure('forbidden');
  if(repository.dataSource!=='authorized_records')return failure('uncertain');
  let dispatched=false;
  try {
    signal.throwIfAborted();
    const context=await repository.authorize(actorId,subjectId,signal);
    signal.throwIfAborted();
    if(context.actorId!==actorId||context.subjectId!==subjectId||!context.organizationId)return failure('forbidden');
    dispatched=true;
    const response=await service.execute({actorId,subjectId,organizationId:context.organizationId,operation:structuredClone(input),signal});
    // Abort after dispatch cannot prove whether the transaction committed.
    if(signal.aborted)return failure('uncertain');
    const validated=resultSchema.safeParse(response);
    if(!validated.success)return failure('uncertain');
    const result=validated.data;
    if(!result.ok)return result;
    if(input.operation==='propose') {
      if(!('proposal' in result))return failure('uncertain');
      const proposal=result.proposal;
      if(proposal.resource.id!==subjectId||proposal.resource.version!==input.resourceVersion||proposal.precondition!==input.resourceVersion||proposal.after.durationMinutes!==input.after.durationMinutes)return failure('uncertain');
    } else {
      if(!('receipt' in result)||result.receipt.actionId!==input.actionId)return failure('uncertain');
      if(input.operation==='apply'&&result.receipt.proposalId!==input.proposalId)return failure('uncertain');
      if(result.receipt.status==='uncertain'||result.receipt.status==='applied'&&result.receipt.resourceVersion===null)return failure('uncertain');
    }
    return result;
  } catch(error) {
    if(!dispatched&&error instanceof Error&&error.message==='forbidden')return failure('forbidden');
    return failure(dispatched?'uncertain':signal.aborted?'cancelled':'uncertain');
  }
}
