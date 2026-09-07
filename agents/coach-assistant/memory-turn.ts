import { workoutProfileVersion } from './profile-context';
import { createHash } from 'node:crypto';
import { createDerivedHistoryBinding } from './derived-history';
const hash=(value:unknown)=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
import type { CoachRepository } from './repository';
import type { CoachConversationRequest } from './contracts';
import type { PersistentMemoryService } from './memory-contracts';
import { persistentMemoryResultSchema } from './memory-contracts';
/** Per-turn broker, no shared cache or new persistent controller. */
export function createPersistentMemoryTurn(repository:CoachRepository,service:PersistentMemoryService,request:CoachConversationRequest){
 const history=createDerivedHistoryBinding(request.conversationId);
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
  const contextVersion=hash([workoutProfileVersion(profile.rows[0]),result.scopeRevision,result.memories.map(m=>({id:m.id,version:m.version,text:m.text})).sort((a,b)=>a.id.localeCompare(b.id))]);
  history.capture(initial,contextVersion);
  return {rows:[{...profile.rows[0],memoryContextVersion:contextVersion,memoriesRead:true,memories:result.memories.map(m=>({...m,userId:initial.subjectId,scope:'agent' as const}))}],truncated:false};
 }};
 return {repository:scoped,filterHistory:history.filterHistory,finish:history.finish};
}
