import { z } from 'zod';
import { measurementValuesSchema } from '@/lib/workout/measurement-service';
import type { CoachRepository } from './repository';
import type { ProgressResult } from './progress-contracts';
const revision=z.string().regex(/^[1-9][0-9]{0,18}$/);
const base={version:z.literal('coach-assistant.v2'),conversationId:z.string().uuid(),turnId:z.string().uuid(),clientId:z.string().uuid().optional()};
export const progressOperationSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('progress.read'),days:z.union([z.literal(30),z.literal(90),z.literal(365)])}).strict(),
 z.object({...base,operation:z.literal('measurement.propose'),resourceVersion:revision,after:measurementValuesSchema,inputSource:z.literal('explicit_user')}).strict(),
 z.object({...base,operation:z.literal('measurement.apply'),proposalId:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),resourceVersion:revision,actionId:z.string().uuid(),reviewed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('measurement.receipt'),actionId:z.string().uuid()}).strict(),
]);
export type ProgressOperation=z.infer<typeof progressOperationSchema>;
export const measurementProposalSchema=z.object({id:z.string().uuid(),hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.literal('measurement.create'),resource:z.object({kind:z.literal('measurement'),id:z.string().uuid(),version:revision}).strict(),before:z.null(),after:measurementValuesSchema,precondition:revision,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true),inputSource:z.literal('explicit_user')}).strict();
const point=z.object({date:z.string().date(),value:z.number().finite(),sourceIds:z.array(z.string().uuid()).max(250)}).strict();
const trend=z.object({metric:z.enum(['weightKg','bodyFatPct','waistCm']),unit:z.enum(['kg','percentage_points','cm']),observations:z.number().int().min(0).max(250),days:z.number().int().min(0).max(250),first:point.nullable(),last:point.nullable(),change:z.number().finite().nullable(),aggregation:z.literal('daily_mean'),status:z.enum(['available','insufficient_dates'])}).strict();
export const progressResultSchema=z.union([
 z.object({version:z.literal('coach-assistant.v2'),storage:z.literal('database'),ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','not_connected','version_conflict','expired','idempotency_conflict','uncertain','cancelled'])}).strict(),
 z.object({version:z.literal('coach-assistant.v2'),storage:z.literal('database'),ok:z.literal(true),proposal:measurementProposalSchema}).strict(),
 z.object({version:z.literal('coach-assistant.v2'),storage:z.literal('database'),ok:z.literal(true),snapshot:z.object({subjectId:z.string().uuid(),version:revision,window:z.object({start:z.string().date(),end:z.string().date(),timezone:z.string().min(1).max(100),days:z.union([z.literal(30),z.literal(90),z.literal(365)])}).strict(),measurements:z.array(z.object({id:z.string().uuid(),measuredDate:z.string().date(),weightKg:z.number().finite().nullable(),bodyFatPct:z.number().finite().nullable(),waistCm:z.number().finite().nullable()}).strict()).max(250),trends:z.array(trend).length(3),truncated:z.boolean(),duplicateRowsDropped:z.number().int().min(0).max(250),invalidValuesExcluded:z.number().int().min(0).max(750),limitations:z.array(z.string().max(500)).max(12)}).strict()}).strict(),
 z.object({version:z.literal('coach-assistant.v2'),storage:z.literal('database'),ok:z.literal(true),receipt:z.object({id:z.string().uuid(),actionId:z.string().uuid(),proposalId:z.string().uuid(),status:z.literal('applied'),resourceVersion:revision,recordedAt:z.string().datetime({offset:true}),action:z.literal('measurement.create')}).strict(),refresh:z.object({measurementId:z.string().uuid(),measuredDate:z.string().date(),previousVersion:revision,version:revision,strategy:z.literal('refetch')}).strict()}).strict(),
]);
export interface ProgressService {execute(scope:{actorId:string;subjectId:string;organizationId:string;operation:ProgressOperation;signal:AbortSignal}):Promise<ProgressResult>}
const fail=(error:Extract<ProgressResult,{ok:false}>['error']):ProgressResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
/** Server authenticated context only. No route or tool-registry activation. */
export async function executeProgressAction(actorId:string,raw:unknown,repository:CoachRepository,service:ProgressService,signal:AbortSignal):Promise<ProgressResult>{
 const parsed=progressOperationSchema.safeParse(raw);if(!parsed.success)return fail('invalid_input');
 const op=parsed.data,subjectId=op.clientId??actorId;if(subjectId!==actorId)return fail('forbidden');
 if(repository.dataSource!=='authorized_records')return fail('not_connected');
 let dispatched=false;
 try{
  signal.throwIfAborted();const context=await repository.authorize(actorId,subjectId,signal);
  if(context.actorId!==actorId||context.subjectId!==subjectId||!context.organizationId)return fail('forbidden');
  signal.throwIfAborted();dispatched=true;
  const rawResult=await service.execute({actorId,subjectId,organizationId:context.organizationId,operation:structuredClone(op),signal});
  if(signal.aborted)return fail('uncertain');
  const fresh=await repository.authorize(actorId,subjectId,signal);if(JSON.stringify(fresh)!==JSON.stringify(context))return fail('forbidden');
  const parsedResult=progressResultSchema.safeParse(rawResult);if(!parsedResult.success)return fail('uncertain');const result=parsedResult.data;
  if(!result.ok)return result;
  if(op.operation==='progress.read')return 'snapshot' in result&&result.snapshot.subjectId===subjectId&&result.snapshot.window.days===op.days?result:fail('uncertain');
  if(op.operation==='measurement.propose')return 'proposal' in result&&result.proposal.id===result.proposal.resource.id&&result.proposal.resource.version===op.resourceVersion&&result.proposal.precondition===op.resourceVersion&&JSON.stringify(result.proposal.after)===JSON.stringify(op.after)?result:fail('uncertain');
  if(!('receipt' in result)||result.receipt.actionId!==op.actionId||result.refresh.measurementId!==result.receipt.proposalId||result.refresh.version!==result.receipt.resourceVersion)return fail('uncertain');
  if(op.operation==='measurement.apply'&&(result.receipt.proposalId!==op.proposalId||result.refresh.previousVersion!==op.resourceVersion))return fail('uncertain');
  return result;
 }catch(error){return fail(dispatched?'uncertain':signal.aborted?'cancelled':error instanceof Error&&error.message==='forbidden'?'forbidden':'uncertain');}
}
