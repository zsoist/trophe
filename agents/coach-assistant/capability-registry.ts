import {z} from 'zod';
import type {AuthorizedContext} from './context';
import type {CoachConversationRequest} from './contracts';
import type {CoachRepository} from './repository';
import {coachMessageResultSchema,type CoachMessageService} from './message-actions';

export const capabilityChoiceSchema=z.discriminatedUnion('tool',[
 z.object({tool:z.literal('coach.message.recipient'),args:z.object({}).strict()}).strict(),
 z.object({tool:z.literal('coach.message.propose'),args:z.object({message:z.string().trim().min(1).max(2000)}).strict()}).strict(),
 z.object({tool:z.literal('none')}).strict(),
]);
export type CapabilityChoice=z.infer<typeof capabilityChoiceSchema>;
export type CapabilityResult={tool:CapabilityChoice['tool'];status:'read'|'review_required'|'not_connected'|'rejected';result:unknown;applied:false};

/** Server-created message registry. The model can prepare exact review content;
 * recipient identity, versions, apply and receipts remain server/UI owned. */
export function createCoachCapabilityRegistry(services:{message?:CoachMessageService}){
 return {
  available():ReadonlyArray<'coach.message.recipient'|'coach.message.propose'>{return services.message?['coach.message.recipient','coach.message.propose']:[];},
  async execute(choice:CapabilityChoice,input:CoachConversationRequest,repository:CoachRepository,context:AuthorizedContext,signal:AbortSignal,onRead:()=>void):Promise<CapabilityResult>{
   const unavailable=():CapabilityResult=>({tool:choice.tool,status:'not_connected',result:{reason:'human_message_service_not_connected'},applied:false});
   if(choice.tool==='none'||!this.available().includes(choice.tool))return unavailable();
   if(context.actorId!==context.subjectId)throw new Error('forbidden');
   const verify=async()=>{signal.throwIfAborted();const fresh=await repository.authorize(context.actorId,context.subjectId,signal);if(JSON.stringify(fresh)!==JSON.stringify(context))throw new Error('forbidden');};
   await verify();const service=services.message!;const base={version:'coach-assistant.v2' as const,conversationId:input.conversationId,turnId:input.turnId};const scope={actorId:context.actorId,subjectId:context.subjectId,organizationId:context.organizationId,signal};
   onRead();const read=coachMessageResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'message.recipient'}}));await verify();
   if(!read.ok)return {tool:choice.tool,status:read.error==='not_connected'?'not_connected':'rejected',result:read,applied:false};
   if(!('recipient'in read))throw new Error('invalid_output');let result:unknown=read;
   if(choice.tool==='coach.message.propose'){
    onRead();const proposed=coachMessageResultSchema.parse(await service.execute({...scope,operation:{...base,operation:'message.propose',coachId:read.recipient.coachId,resourceVersion:read.recipient.version,after:{message:choice.args.message}}}));
    if(proposed.ok&&(!('proposal'in proposed)||JSON.stringify(proposed.proposal.recipient)!==JSON.stringify(read.recipient)||proposed.proposal.after.message!==choice.args.message))throw new Error('invalid_output');result=proposed;
   }
   await verify();const success=!!result&&typeof result==='object'&&'ok'in result&&result.ok===true;
   return {tool:choice.tool,status:success?choice.tool==='coach.message.propose'?'review_required':'read':'rejected',result,applied:false};
  },
 };
}
export type CoachCapabilityRegistry=ReturnType<typeof createCoachCapabilityRegistry>;
