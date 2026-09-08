import { z } from 'zod';
import type { CoachRepository } from './repository';
import type { PhotoFoodResult } from './photo-food-contracts';
const uuid=z.string().uuid(),hash=z.string().regex(/^[a-f0-9]{64}$/);
const base={version:z.literal('coach-assistant.v2'),conversationId:uuid,turnId:uuid,clientId:uuid.optional()};
const meal=z.enum(['breakfast','lunch','dinner','snack','pre_workout','post_workout']);
export const photoFoodPortionSchema=z.object({loggedDate:z.string().date(),mealType:meal,grams:z.number().finite().min(0.1).max(10000).refine(v=>Math.abs(Math.round(v*100)-v*100)<1e-7)}).strict();
export const photoFoodOperationSchema=z.discriminatedUnion('operation',[
 z.object({...base,operation:z.literal('photo.food.read'),attachmentId:uuid}).strict(),
 z.object({...base,operation:z.literal('photo.food.propose'),attachmentId:uuid,observationId:uuid,itemIndex:z.number().int().min(0).max(7),resourceVersion:hash,after:photoFoodPortionSchema}).strict(),
 z.object({...base,operation:z.literal('photo.food.apply'),proposalId:uuid,hash,actionId:uuid,resourceVersion:hash,reviewed:z.literal(true)}).strict(),
 z.object({...base,operation:z.literal('photo.food.receipt'),actionId:uuid}).strict(),
]);
export type PhotoFoodOperation=z.infer<typeof photoFoodOperationSchema>;
export const photoFoodReviewSchema=photoFoodPortionSchema.extend({foodName:z.string().min(1).max(200),calories:z.number().finite().min(0).max(10000),proteinG:z.number().finite().min(0).max(1000),carbsG:z.number().finite().min(0).max(1000),fatG:z.number().finite().min(0).max(1000),fiberG:z.number().finite().min(0).max(1000),sugarG:z.number().finite().min(0).max(1000),confidence:z.number().finite().min(0).max(0.75),source:z.literal('photo_ai'),nutrition:z.literal('estimated'),portion:z.literal('explicit_user')}).strict();
export const photoFoodProposalSchema=z.object({id:uuid,hash,action:z.literal('food.photo.create'),resource:z.object({kind:z.literal('food_entry'),id:uuid,version:hash}).strict(),before:z.null(),after:photoFoodReviewSchema,evidence:z.object({observationId:uuid,observationRevision:uuid,attachmentId:uuid,imageDigest:hash,itemIndex:z.number().int().min(0).max(7),source:z.enum(['validated_photo_analysis','offline_fixture']),trust:z.literal('untrusted_image_data')}).strict(),precondition:hash,expiresAt:z.string().datetime({offset:true}),reviewRequired:z.literal(true)}).strict();
const common={version:z.literal('coach-assistant.v2'),storage:z.enum(['database','offline_fixture','isolated_database_fixture']),evaluation:z.object({mode:z.literal('isolated_authorized_fixture'),observation:z.literal('offline_fixture'),visionVerified:z.literal(false),paidApiCalls:z.literal(0)}).strict().optional()};
export const photoFoodResultSchema=z.union([
 z.object({...common,storage:z.literal('database'),ok:z.literal(false),error:z.enum(['invalid_input','forbidden','not_found','not_connected','version_conflict','expired','idempotency_conflict','uncertain','cancelled'])}).strict(),
 z.object({...common,ok:z.literal(true),proposal:photoFoodProposalSchema}).strict(),
 z.object({...common,ok:z.literal(true),snapshot:z.object({observationId:uuid,attachmentId:uuid,source:z.enum(['validated_photo_analysis','offline_fixture']),trust:z.literal('untrusted_image_data'),reviewRequired:z.literal(true),items:z.array(z.object({index:z.number().int().min(0).max(7),version:hash,foodName:z.string().min(1).max(200),estimatedGrams:z.number().finite().positive(),estimatedCalories:z.number().finite().min(0),confidence:z.number().finite().min(0).max(0.75),accuracyNote:z.string().max(500)}).strict()).min(1).max(8)}).strict()}).strict(),
 z.object({...common,storage:z.enum(['database','isolated_database_fixture']),ok:z.literal(true),receipt:z.object({id:uuid,actionId:uuid,proposalId:uuid,status:z.literal('applied'),action:z.literal('food.photo.create'),resourceVersion:z.string().regex(/^[0-9]{1,20}$/),recordedAt:z.string().datetime({offset:true})}).strict(),refresh:z.object({entryId:uuid,loggedDate:z.string().date(),previousVersion:hash,version:z.string().regex(/^[0-9]{1,20}$/),strategy:z.literal('refetch')}).strict()}).strict(),
]).superRefine((result,ctx)=>{if((result.storage==='isolated_database_fixture')!==(result.evaluation!==undefined))ctx.addIssue({code:'custom',message:'Fixture evaluation metadata must match isolated storage'});});
export interface PhotoFoodService {execute(scope:{actorId:string;subjectId:string;organizationId:string;operation:PhotoFoodOperation;signal:AbortSignal}):Promise<PhotoFoodResult>}
const fail=(error:Extract<PhotoFoodResult,{ok:false}>['error']):PhotoFoodResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
export async function executePhotoFoodAction(actorId:string,raw:unknown,repository:CoachRepository,service:PhotoFoodService,signal:AbortSignal):Promise<PhotoFoodResult>{
 const parsed=photoFoodOperationSchema.safeParse(raw);if(!parsed.success)return fail('invalid_input');const op=parsed.data,subjectId=op.clientId??actorId;if(actorId!==subjectId)return fail('forbidden');if(repository.dataSource!=='authorized_records')return fail('not_connected');let dispatched=false;
 try{
  signal.throwIfAborted();const context=await repository.authorize(actorId,subjectId,signal);if(context.actorId!==actorId||context.subjectId!==subjectId||!context.organizationId)return fail('forbidden');signal.throwIfAborted();dispatched=true;
  const output=await service.execute({actorId,subjectId,organizationId:context.organizationId,operation:op,signal});if(signal.aborted)return fail('uncertain');const fresh=await repository.authorize(actorId,subjectId,signal);if(JSON.stringify(fresh)!==JSON.stringify(context))return fail('forbidden');
  const checked=photoFoodResultSchema.safeParse(output);if(!checked.success)return fail('uncertain');const result=checked.data;if(!result.ok)return result;
  if(op.operation==='photo.food.read')return 'snapshot' in result&&result.snapshot.attachmentId===op.attachmentId&&(result.storage!=='database')===(result.snapshot.source==='offline_fixture')?result:fail('uncertain');
  if(op.operation==='photo.food.propose'){
   if(!('proposal' in result))return fail('uncertain');const p=result.proposal;
   if(p.resource.id!==p.id||p.resource.version!==op.resourceVersion||p.precondition!==op.resourceVersion||p.evidence.attachmentId!==op.attachmentId||p.evidence.observationId!==op.observationId||p.evidence.itemIndex!==op.itemIndex||p.after.grams!==op.after.grams||p.after.loggedDate!==op.after.loggedDate||p.after.mealType!==op.after.mealType||(result.storage!=='database')!==(p.evidence.source==='offline_fixture'))return fail('uncertain');return result;
  }
  if(!('receipt' in result)||result.receipt.actionId!==op.actionId||result.refresh.entryId!==result.receipt.proposalId||result.refresh.version!==result.receipt.resourceVersion)return fail('uncertain');if(op.operation==='photo.food.apply'&&(result.receipt.proposalId!==op.proposalId||result.refresh.previousVersion!==op.resourceVersion))return fail('uncertain');return result;
 }catch(error){return fail(dispatched?'uncertain':signal.aborted?'cancelled':error instanceof Error&&error.message==='forbidden'?'forbidden':'uncertain');}
}
