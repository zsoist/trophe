import type {PersistentMemoryResult,PersistentMemoryCard} from './memory-contracts';
import {literal,enumeration,pattern,object,array,nullable,uuid,datetime,hash} from './result-reader-checks';
const revision=pattern(/^\d{1,20}$/);
const text=(value:unknown)=>typeof value==='string'&&value.trim().length>=1&&value.trim().length<=400;
const card=object({id:uuid,text,createdAt:datetime,version:revision,confirmation:literal('confirmed'),source:literal('user_input'),retention:literal('persistent'),conversationId:uuid});
const proposal=object({id:uuid,hash,action:enumeration(['memory.confirm','memory.correct','memory.delete']),resource:object({kind:literal('memory'),id:uuid,version:revision}),before:nullable(card),after:nullable(object({text,source:literal('user_input'),retention:literal('persistent')})),expiresAt:datetime,reviewRequired:literal(true)});
const base={version:literal('coach-assistant.v2'),storage:literal('database')};
const variants=[
 object({...base,ok:literal(false),error:enumeration(['invalid_input','forbidden','not_found','version_conflict','expired','idempotency_conflict','uncertain','cancelled'])}),
 object({...base,ok:literal(true),memories:array(card,20),scopeRevision:revision,derivedContext:literal('excluded')}),
 object({...base,ok:literal(true),proposal}),
 object({...base,ok:literal(true),receipt:object({id:uuid,actionId:uuid,proposalId:uuid,status:literal('applied'),resourceVersion:revision,recordedAt:datetime}),refresh:object({conversationId:uuid,strategy:literal('refetch'),discardDerivedContext:literal(true),invalidatedMemoryVersions:array(object({id:uuid,version:revision}),1)})}),
];
const normalizedCard=(value:PersistentMemoryCard):PersistentMemoryCard=>({...value,text:value.text.trim()});
/** Shape validation only; scope authorization and action semantics remain server-side.
 * Matches the authoritative schema's trim transform without mutating input JSON.
 */
export function readPersistentMemoryResult(value:unknown):PersistentMemoryResult|null{
 if(!variants.some(check=>check(value)))return null;
 const result=value as PersistentMemoryResult;
 if(result.ok&&'memories'in result)return {...result,memories:result.memories.map(normalizedCard)};
 if(result.ok&&'proposal'in result)return {...result,proposal:{...result.proposal,resource:{...result.proposal.resource},before:result.proposal.before?normalizedCard(result.proposal.before):null,after:result.proposal.after?{...result.proposal.after,text:result.proposal.after.text.trim()}:null}};
 return result;
}
export const persistentMemoryResultReader={safeParse(value:unknown):{success:true;data:PersistentMemoryResult}|{success:false}{const data=readPersistentMemoryResult(value);return data?{success:true,data}:{success:false};}};
