import { workoutSetResultSchema,type WorkoutSetService } from './set-actions';
import { coachMessageResultSchema,type CoachMessageService } from './message-actions';
import { z } from 'zod';
import type { AuthorizedContext } from './context';
import type { CoachConversationRequest } from './contracts';
import type { CoachRepository } from './repository';
import { foodQuantityResultSchema,type FoodQuantityService } from './food-actions';
import { foodPreferenceResultSchema,type FoodPreferenceService } from './food-preference-actions';
export const capabilityChoiceSchema=z.discriminatedUnion('tool',[
 z.object({tool:z.literal('workout.set.read'),args:z.object({}).strict()}).strict(),
 z.object({tool:z.literal('workout.set.propose'),args:z.object({reps:z.number().int().positive().max(2147483647)}).strict()}).strict(),
 z.object({tool:z.literal('coach.message.recipient'),args:z.object({}).strict()}).strict(),
 z.object({tool:z.literal('coach.message.propose'),args:z.object({message:z.string().trim().min(1).max(2000)}).strict()}).strict(),
 z.object({tool:z.literal('none')}).strict(),
 z.object({tool:z.literal('food.quantity.read'),args:z.object({entryId:z.string().uuid()}).strict()}).strict(),
 z.object({tool:z.literal('food.quantity.propose'),args:z.object({entryId:z.string().uuid(),grams:z.number().finite()}).strict()}).strict(),
 z.object({tool:z.literal('food.preference.read'),args:z.object({}).strict()}).strict(),
 z.object({tool:z.literal('food.preference.propose'),args:z.object({dietPattern:z.enum(['omnivore','vegetarian','vegan','pescatarian']).nullable()}).strict()}).strict(),
]);
export type CapabilityChoice=z.infer<typeof capabilityChoiceSchema>;
export type CapabilityResult={tool:CapabilityChoice['tool'];status:'read'|'review_required'|'not_connected'|'rejected';result:unknown;applied:false};
/** Server-created registry. No model-owned identities, versions, apply or receipts. */
export function createCoachCapabilityRegistry(services:{food?:FoodQuantityService;preference?:FoodPreferenceService;set?:WorkoutSetService;selectedSetId?:string;message?:CoachMessageService}){
 return {
 available(input:CoachConversationRequest){
  // Explicit typed model choice may request a profile preference from any surface.
  return [...(services.set&&z.string().uuid().safeParse(services.selectedSetId).success?['workout.set.read','workout.set.propose']:[]),...(services.message?['coach.message.recipient','coach.message.propose']:[]),...(services.food&&input.context?.includeScreen&&input.context.entity?.kind==='meal'?['food.quantity.read','food.quantity.propose']:[]),...(services.preference?['food.preference.read','food.preference.propose']:[])];
 },
 async execute(choice:CapabilityChoice,input:CoachConversationRequest,repository:CoachRepository,context:AuthorizedContext,signal:AbortSignal,onRead:()=>void):Promise<CapabilityResult>{
  const unavailable=():CapabilityResult=>({tool:choice.tool,status:'not_connected',result:{reason:services.food&&input.context?.entity?.kind!=='meal'?'select_food_entry_for_quantity':services.set&&!services.selectedSetId?'select_active_workout_set':'no_requested_available_capability'},applied:false});
  if(choice.tool==='none'||!this.available(input).includes(choice.tool))return unavailable();
  if(context.actorId!==context.subjectId)throw new Error('forbidden');
  const verify=async()=>{signal.throwIfAborted();const fresh=await repository.authorize(context.actorId,context.subjectId,signal);if(JSON.stringify(fresh)!==JSON.stringify(context))throw new Error('forbidden');};
  await verify();
  const base={version:'coach-assistant.v2' as const,conversationId:input.conversationId,turnId:input.turnId};
  const scope={actorId:context.actorId,subjectId:context.subjectId,organizationId:context.organizationId,signal};
  let result:unknown;
  if(choice.tool==='food.quantity.read'||choice.tool==='food.quantity.propose'){
   if(input.context?.entity?.kind!=='meal'||input.context.entity.id!==choice.args.entryId)throw new Error('forbidden');
   const service=services.food!;onRead();const read=foodQuantityResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'food.read',entryId:choice.args.entryId}}));
   await verify();if(!read.ok)return {tool:choice.tool,status:'rejected',result:read,applied:false};
   if(!('snapshot'in read)||read.snapshot.entryId!==choice.args.entryId)throw new Error('invalid_output');
   result=read;
   if(choice.tool==='food.quantity.propose'){
    service.parseQuantityChange({grams:choice.args.grams});onRead();
    const proposed=foodQuantityResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'food.propose',entryId:choice.args.entryId,resourceVersion:read.snapshot.version,after:{grams:choice.args.grams}}}));
    if(proposed.ok&&(!('proposal'in proposed)||proposed.proposal.resource.id!==choice.args.entryId||proposed.proposal.resource.version!==read.snapshot.version||proposed.proposal.after.grams!==choice.args.grams))throw new Error('invalid_output');result=proposed;
   }
  }else if(choice.tool==='food.preference.read'||choice.tool==='food.preference.propose'){
   const service=services.preference!;onRead();const read=foodPreferenceResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'diet.read',profileId:context.subjectId}}));
   await verify();if(!read.ok)return {tool:choice.tool,status:read.error==='not_connected'?'not_connected':'rejected',result:read,applied:false};
   if(!('snapshot'in read)||read.snapshot.profileId!==context.subjectId)throw new Error('invalid_output');result=read;
   if(choice.tool==='food.preference.propose'){
    const after=service.parsePreference({version:1,dietPattern:choice.args.dietPattern});onRead();
    const proposed=foodPreferenceResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'diet.propose',profileId:context.subjectId,resourceVersion:read.snapshot.version,after}}));
    if(proposed.ok&&(!('proposal'in proposed)||proposed.proposal.resource.id!==context.subjectId||proposed.proposal.resource.version!==read.snapshot.version||JSON.stringify(proposed.proposal.after)!==JSON.stringify(after)))throw new Error('invalid_output');result=proposed;
   }
  }
  if(choice.tool==='workout.set.read'||choice.tool==='workout.set.propose'){
   const service=services.set!;const setId=services.selectedSetId!;onRead();
   const read=workoutSetResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'set.read',setId}}));await verify();
   if(!read.ok)return {tool:choice.tool,status:'rejected',result:read,applied:false};
   if(!('snapshot'in read)||read.snapshot.setId!==setId)throw new Error('invalid_output');result=read;
   if(choice.tool==='workout.set.propose'){
    const after=service.parseRepsChange({reps:choice.args.reps});onRead();
    const proposed=workoutSetResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'set.propose',setId,resourceVersion:read.snapshot.version,after}}));
    if(proposed.ok&&(!('proposal'in proposed)||proposed.proposal.resource.id!==setId||proposed.proposal.resource.version!==read.snapshot.version||proposed.proposal.after.reps!==choice.args.reps))throw new Error('invalid_output');result=proposed;
   }
  }
  if(choice.tool==='coach.message.recipient'||choice.tool==='coach.message.propose'){
   const service=services.message!;onRead();const read=coachMessageResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'message.recipient'}}));await verify();
   if(!read.ok)return {tool:choice.tool,status:read.error==='not_connected'?'not_connected':'rejected',result:read,applied:false};
   if(!('recipient'in read))throw new Error('invalid_output');result=read;
   if(choice.tool==='coach.message.propose'){
    onRead();const proposed=coachMessageResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'message.propose',coachId:read.recipient.coachId,resourceVersion:read.recipient.version,after:{message:choice.args.message}}}));
    if(proposed.ok&&(!('proposal'in proposed)||JSON.stringify(proposed.proposal.recipient)!==JSON.stringify(read.recipient)||proposed.proposal.after.message!==choice.args.message))throw new Error('invalid_output');result=proposed;
   }
  }
  await verify();const success=!!result&&typeof result==='object'&&'ok'in result&&result.ok===true;
  return {tool:choice.tool,status:success?choice.tool.endsWith('.propose')?'review_required':'read':'rejected',result,applied:false};
 },
 };
}
export type CoachCapabilityRegistry=ReturnType<typeof createCoachCapabilityRegistry>;
