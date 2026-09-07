import { createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import type { AuthorizedContext } from './context';
import type { CoachConversationRequest,CoachConversationResponse } from './contracts';
// Process restart invalidates derived history, never persisted profile or memory.
const key=randomBytes(32);
/** Single signing authority. Outer brokers compose all source revisions before capture. */
export function createDerivedHistoryBinding(conversationId:string){
 let captured:{context:AuthorizedContext;version:string}|undefined;
 const token=(text:string)=>captured?createHmac('sha256',key).update(JSON.stringify({scope:captured.context,conversationId,version:captured.version,text})).digest('hex'):null;
 function allowed(text:string,claimed?:string){const expected=token(text);return !!expected&&!!claimed&&/^[a-f0-9]{64}$/.test(claimed)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(claimed,'hex'));}
 return {
 capture(context:AuthorizedContext,version:string){captured={context:structuredClone(context),version};},
 clear(){captured=undefined;},
 filterHistory(input:CoachConversationRequest):CoachConversationRequest{return {...input,history:input.history?.filter(item=>item.role==='user'&&item.kind!=='memory_summary'||allowed(item.text,item.derivedToken)).map(item=>({role:item.role,text:item.text}))};},
 finish(response:CoachConversationResponse){if(response.ok&&captured)response.memoryContext={version:captured.version,historyPolicy:'user_historical_derived_verified',...(response.output?{derivedHistoryToken:token(response.output.answer.slice(0,500))!}:{})};},
 };
}
