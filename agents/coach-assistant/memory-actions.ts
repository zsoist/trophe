import type { CoachRepository } from './repository';
import { persistentMemoryOperationSchema,persistentMemoryResultSchema,type PersistentMemoryResult,type PersistentMemoryService } from './memory-contracts';
const fail=(error:Extract<PersistentMemoryResult,{ok:false}>['error']):PersistentMemoryResult=>({version:'coach-assistant.v2',storage:'database',ok:false,error});
/** HTTP adapter: only the database service may publish persistent results. */
export async function executePersistentMemoryAction(actorId:string,raw:unknown,repository:CoachRepository,service:PersistentMemoryService,signal:AbortSignal):Promise<PersistentMemoryResult>{
 const parsed=persistentMemoryOperationSchema.safeParse(raw);if(!parsed.success)return fail('invalid_input');
 const operation=parsed.data;const subjectId=operation.clientId??actorId;
 if(actorId!==subjectId||repository.dataSource!=='authorized_records')return fail('forbidden');
 let dispatched=false;
 try{
  signal.throwIfAborted();const context=await repository.authorize(actorId,subjectId,signal);signal.throwIfAborted();
  if(context.actorId!==actorId||context.subjectId!==subjectId||!context.organizationId)return fail('forbidden');
  dispatched=true;const output=await service.execute({actorId,subjectId,organizationId:context.organizationId,operation,signal});
  if(signal.aborted)return fail('uncertain');
  const parsedResult=persistentMemoryResultSchema.safeParse(output);if(!parsedResult.success)return fail('uncertain');const result=parsedResult.data;
  if(!result.ok)return result;
  if(operation.operation==='memory.read')return 'memories' in result&&result.memories.every(card=>card.conversationId===operation.conversationId)?result:fail('uncertain');
  if(operation.operation==='memory.apply'||operation.operation==='memory.receipt')return 'receipt' in result&&result.receipt.actionId===operation.actionId&&result.refresh.conversationId===operation.conversationId&&(operation.operation!=='memory.apply'||result.receipt.proposalId===operation.proposalId)?result:fail('uncertain');
  if(!('proposal' in result))return fail('uncertain');const p=result.proposal;
  if(operation.operation==='memory.propose')return p.action==='memory.confirm'&&p.before===null&&p.after?.text===operation.after.text?result:fail('uncertain');
  if(p.action!==operation.operation||p.resource.id!==operation.memoryId||p.resource.version!==operation.resourceVersion||p.before?.conversationId!==operation.conversationId)return fail('uncertain');
  return operation.operation==='memory.delete'?p.after===null?result:fail('uncertain'):p.after?.text===operation.after.text?result:fail('uncertain');
 }catch(error){return fail(dispatched?'uncertain':signal.aborted?'cancelled':error instanceof Error&&error.message==='forbidden'?'forbidden':'uncertain');}
}
