import {createHash} from 'node:crypto';
import {conversationRequestSchema} from './schema';
import {runConversation} from './conversation';
import type {CoachChatScope} from './chat-contract';
/** Opaque process-local proof. There is no constructor accepting arbitrary final text. */
export interface VerifiedChatFinal {readonly kind:'verified_coach_chat_final'}
interface FinalData {scope:CoachChatScope;threadId:string;turnId:string;text:string;hash:string;pipelineVersion:string;userTextHash:string}
const finals=new WeakMap<VerifiedChatFinal,FinalData>();
const requests=new WeakMap<VerifiedChatFinal,string>();
export function bindVerifiedChatFinal(proof:VerifiedChatFinal,requestId:string):boolean{if(!finals.has(proof))return false;const prior=requests.get(proof);if(prior&&prior!==requestId)return false;requests.set(proof,requestId);return true;}
export const chatTextHash=(text:string)=>createHash('sha256').update(text).digest('hex');
export function readVerifiedChatFinal(proof:VerifiedChatFinal):FinalData|null{return finals.has(proof)?structuredClone(finals.get(proof)!):null;}
/** Runs the existing verified pipeline unchanged. The browser cannot mark text final.
 * Do not use a serialized proof; server append consumes this same object instance.
 */
export async function runVerifiedChatFinal(input:Parameters<typeof runConversation>[0],options:Parameters<typeof runConversation>[1],scope:CoachChatScope){
 const request=conversationRequestSchema.parse(input);scope=structuredClone(scope);
 if(options.actorId!==scope.actorId||(request.context?.clientId??options.actorId)!==scope.subjectId)throw new Error('forbidden');
 const response=await runConversation(request,{...options});
 if(!response.ok||!response.output||!response.snapshot)return {response,final:null};
 if(response.snapshot.subjectId!==scope.subjectId||response.snapshot.organizationId!==scope.organizationId)throw new Error('forbidden');
 const proof:VerifiedChatFinal=Object.freeze({kind:'verified_coach_chat_final'});
 finals.set(proof,{scope:structuredClone(scope),threadId:request.conversationId,turnId:request.turnId,text:response.output.answer,hash:chatTextHash(response.output.answer),pipelineVersion:response.version,userTextHash:chatTextHash(request.message)});
 return {response,final:proof};
}
