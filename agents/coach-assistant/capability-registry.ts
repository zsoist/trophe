import { z } from 'zod';
import type { AuthorizedContext } from './context';
import type { CoachConversationRequest } from './contracts';
import type { CoachRepository } from './repository';
import { foodQuantityResultSchema,type FoodQuantityService } from './food-actions';
import { foodPreferenceResultSchema,type FoodPreferenceService } from './food-preference-actions';
export const capabilityChoiceSchema=z.discriminatedUnion('tool',[
 z.object({tool:z.literal('none')}).strict(),
 z.object({tool:z.literal('food.quantity.read'),args:z.object({entryId:z.string().uuid()}).strict()}).strict(),
 z.object({tool:z.literal('food.quantity.propose'),args:z.object({entryId:z.string().uuid(),grams:z.number().finite()}).strict()}).strict(),
 z.object({tool:z.literal('food.preference.read'),args:z.object({}).strict()}).strict(),
 z.object({tool:z.literal('food.preference.propose'),args:z.object({dietPattern:z.enum(['omnivore','vegetarian','vegan','pescatarian']).nullable()}).strict()}).strict(),
]);
export type CapabilityChoice=z.infer<typeof capabilityChoiceSchema>;
export type CapabilityResult={tool:CapabilityChoice['tool'];status:'read'|'review_required'|'not_connected'|'rejected';result:unknown;applied:false};
/** Server-created registry. No model-owned identities, versions, apply or receipts. */
export function createCoachCapabilityRegistry(services:{food?:FoodQuantityService;preference?:FoodPreferenceService}){
 return {
 available(input:CoachConversationRequest){
  // Explicit typed model choice may request a profile preference from any surface.
  return [...(services.food&&input.context?.includeScreen&&input.context.entity?.kind==='meal'?['food.quantity.read','food.quantity.propose']:[]),...(services.preference?['food.preference.read','food.preference.propose']:[])];
 },
 async execute(choice:CapabilityChoice,input:CoachConversationRequest,repository:CoachRepository,context:AuthorizedContext,signal:AbortSignal,onRead:()=>void):Promise<CapabilityResult>{
  const unavailable=():CapabilityResult=>({tool:choice.tool,status:'not_connected',result:{reason:services.food&&input.context?.entity?.kind!=='meal'?'select_food_entry_for_quantity':'no_requested_available_capability'},applied:false});
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
  }else{
   const service=services.preference!;onRead();const read=foodPreferenceResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'diet.read',profileId:context.subjectId}}));
   await verify();if(!read.ok)return {tool:choice.tool,status:read.error==='not_connected'?'not_connected':'rejected',result:read,applied:false};
   if(!('snapshot'in read)||read.snapshot.profileId!==context.subjectId)throw new Error('invalid_output');result=read;
   if(choice.tool==='food.preference.propose'){
    const after=service.parsePreference({version:1,dietPattern:choice.args.dietPattern});onRead();
    const proposed=foodPreferenceResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'diet.propose',profileId:context.subjectId,resourceVersion:read.snapshot.version,after}}));
    if(proposed.ok&&(!('proposal'in proposed)||proposed.proposal.resource.id!==context.subjectId||proposed.proposal.resource.version!==read.snapshot.version||JSON.stringify(proposed.proposal.after)!==JSON.stringify(after)))throw new Error('invalid_output');result=proposed;
   }
  }
  await verify();const success=!!result&&typeof result==='object'&&'ok'in result&&result.ok===true;
  return {tool:choice.tool,status:success?choice.tool.endsWith('.propose')?'review_required':'read':'rejected',result,applied:false};
 },
 };
}
export type CoachCapabilityRegistry=ReturnType<typeof createCoachCapabilityRegistry>;
