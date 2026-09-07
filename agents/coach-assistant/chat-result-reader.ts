import {COACH_CHAT_VERSION} from './chat-contract';

export interface HistoryThread {id:string;title:string;createdAt:string;revision:string;state:'active'|'cleanup_pending'|'deleted'}
export interface HistoryMessage {id:string;turnId:string;role:'user'|'assistant';text:string;sequence:number;revision:string;createdAt:string}
export interface HistoryCursor {createdAt:string;id:string}
export interface HistoryList {threads:HistoryThread[];nextCursor:HistoryCursor|null}
export interface HistoryPage {thread:HistoryThread;messages:HistoryMessage[];nextSequence:number|null}
export interface HistoryDelete {thread:HistoryThread;cleanup:'complete'|'pending'}
export interface HistoryThreadResult {thread:HistoryThread}

const uuid=/^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
const dateTime=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const revision=/^(0|[1-9]\d*)$/;
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const isUuid=(value:unknown):value is string=>typeof value==='string'&&uuid.test(value);
const isDateTime=(value:unknown):value is string=>{
 if(typeof value!=='string')return false;const match=dateTime.exec(value);if(!match)return false;
 const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]),hour=Number(match[4]),minute=Number(match[5]),second=match[6]===undefined?0:Number(match[6]);
 const leap=year%4===0&&(year%100!==0||year%400===0),daysInMonth=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
 const days=daysInMonth[month-1]??0;
 return month>=1&&month<=12&&day>=1&&day<=days&&hour<=23&&minute<=59&&second<=59&&Number(match[8].slice(1,3))<=23&&Number(match[8].slice(4))<=59;
};
const isRevision=(value:unknown):value is string=>typeof value==='string'&&revision.test(value);
const isInt=(value:unknown):value is number=>typeof value==='number'&&Number.isInteger(value);
const invalid=():never=>{throw new Error('history_unavailable');};
const pick=(value:Record<string,unknown>,keys:readonly string[])=>Object.fromEntries(keys.map(key=>[key,value[key]]));
function object(value:unknown):Record<string,unknown>{return isRecord(value)?value:invalid();}
function array(value:unknown):unknown[]{return Array.isArray(value)?value:invalid();}

export function readHistoryThread(value:unknown):HistoryThread{
 const item=object(value);if(!isUuid(item.id)||typeof item.title!=='string'||item.title.length>80||!isDateTime(item.createdAt)||!isRevision(item.revision)||!['active','cleanup_pending','deleted'].includes(String(item.state)))return invalid();
 return pick(item,['id','title','createdAt','revision','state']) as unknown as HistoryThread;
}
export function readHistoryMessage(value:unknown):HistoryMessage{
 const item=object(value);if(!isUuid(item.id)||!isUuid(item.turnId)||!['user','assistant'].includes(String(item.role))||typeof item.text!=='string'||!isInt(item.sequence)||item.sequence<=0||!isUuid(item.revision)||!isDateTime(item.createdAt))return invalid();
 return pick(item,['id','turnId','role','text','sequence','revision','createdAt']) as unknown as HistoryMessage;
}
export function readHistoryCursor(value:unknown):HistoryCursor{
 const item=object(value);if(!isDateTime(item.createdAt)||!isUuid(item.id))return invalid();
 return pick(item,['createdAt','id']) as unknown as HistoryCursor;
}
export function readHistoryList(value:unknown):HistoryList{
 const item=object(value),threads=array(item.threads);if(threads.length>50||!threads.every(item=>{try{readHistoryThread(item);return true}catch{return false}}))return invalid();
 if(item.nextCursor!==null&&item.nextCursor!==undefined){try{readHistoryCursor(item.nextCursor);}catch{return invalid();}}
 if(item.nextCursor===undefined)return invalid();return {threads:threads.map(readHistoryThread),nextCursor:item.nextCursor===null?null:readHistoryCursor(item.nextCursor)};
}
export function readHistoryPage(value:unknown):HistoryPage{
 const item=object(value),messages=array(item.messages);if(messages.length>50||!messages.every(item=>{try{readHistoryMessage(item);return true}catch{return false}})||!isRecord(item.thread))return invalid();
 if(item.nextSequence!==null&&(!isInt(item.nextSequence)||item.nextSequence<=0))return invalid();
 if(item.nextSequence===undefined)return invalid();return {thread:readHistoryThread(item.thread),messages:messages.map(readHistoryMessage),nextSequence:item.nextSequence};
}
export function readHistoryDelete(value:unknown):HistoryDelete{
 const item=object(value);if(!isRecord(item.thread)||!['complete','pending'].includes(String(item.cleanup)))return invalid();return {thread:readHistoryThread(item.thread),cleanup:item.cleanup as HistoryDelete['cleanup']};
}
export function readHistoryThreadResult(value:unknown):HistoryThreadResult{
 const item=object(value);if(!isRecord(item.thread))return invalid();return {thread:readHistoryThread(item.thread)};
}

/** Parse the stable database envelope and project only fields owned by its value reader. */
export function readHistoryEnvelope<T>(value:unknown,readValue:(value:unknown)=>T):T{
 const envelope=object(value);if(envelope.version!==COACH_CHAT_VERSION||envelope.storage!=='database'||envelope.ok!==true||!('value' in envelope))return invalid();return readValue(envelope.value);
}
