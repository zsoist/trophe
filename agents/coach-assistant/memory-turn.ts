import { createHash,createHmac,randomBytes,timingSafeEqual } from 'node:crypto';
import type { CoachRepository } from './repository';
import type { CoachConversationRequest,CoachConversationResponse } from './contracts';
import type { AuthorizedContext } from './context';
import type { PersistentMemoryService } from './memory-contracts';
import { persistentMemoryResultSchema } from './memory-contracts';
// Ephemeral signing key: restart invalidates old derived history, never memory.
const key=randomBytes(32);
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
/** Per-turn broker, no shared cache or new persistent controller. */
export function createPersistentMemoryTurn(repository:CoachRepository,service:PersistentMemoryService,request:CoachConversationRequest){
 let captured:{context:AuthorizedContext;version:string}|undefined;
 function token(text:string){return captured?createHmac('sha256',key).update(JSON.stringify({scope:captured.context,conversationId:request.conversationId,version:captured.version,text})).digest('hex'):null;}
 function allowed(text:string,claimed?:string){const expected=token(text);return !!expected&&!!claimed&&/^[a-f0-9]{64}$/.test(claimed)&&timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(claimed,'hex'));}
 const scoped:CoachRepository={...repository,personalContext:async args=>{
  if(repository.dataSource!=='authorized_records'||args.context.actorId!==args.context.subjectId)throw new Error('forbidden');
  const initial=await repository.authorize(args.context.actorId,args.context.subjectId,args.signal);
  if(JSON.stringify(initial)!==JSON.stringify(args.context))throw new Error('forbidden');
  const profile=repository.personalContext?await repository.personalContext(args):{rows:[{userId:args.context.subjectId,preferences:null,memories:[]}],truncated:false};
  const result=persistentMemoryResultSchema.parse(await service.execute({actorId:initial.actorId,subjectId:initial.subjectId,organizationId:initial.organizationId,operation:{version:'coach-assistant.v2',operation:'memory.read',conversationId:request.conversationId,turnId:request.turnId},signal:args.signal}));
  args.signal.throwIfAborted();
  const fresh=await repository.authorize(initial.actorId,initial.subjectId,args.signal);
  if(JSON.stringify(fresh)!==JSON.stringify(initial))throw new Error('forbidden');
  if(!result.ok||!('memories' in result)||result.memories.some(m=>m.conversationId!==request.conversationId)||profile.truncated||profile.rows.length!==1||profile.rows[0].userId!==initial.subjectId)throw new Error('query_failed');
  captured={context:initial,version:hash([result.scopeRevision,result.memories.map(m=>({id:m.id,version:m.version,text:m.text})).sort((a,b)=>a.id.localeCompare(b.id))])};
  return {rows:[{...profile.rows[0],memoriesRead:true,memories:result.memories.map(m=>({...m,userId:initial.subjectId,scope:'agent' as const}))}],truncated:false};
 }};
 return {repository:scoped,
  filterHistory(input:CoachConversationRequest):CoachConversationRequest {
   return {...input,history:input.history?.filter(item=>item.role==='user'&&item.kind!=='memory_summary'||allowed(item.text,item.derivedToken)).map(item=>({role:item.role,text:item.text}))};
  },
  finish(response:CoachConversationResponse){
   if(response.ok&&captured){response.memoryContext={version:captured.version,historyPolicy:'user_historical_derived_verified',...(response.output?{derivedHistoryToken:token(response.output.answer.slice(0,500))!}:{})};}
  },
 };
}
