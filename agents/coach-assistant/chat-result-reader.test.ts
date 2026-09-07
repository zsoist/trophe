import {describe,expect,it} from 'vitest';
import {z} from 'zod';
import {readHistoryDelete,readHistoryEnvelope,readHistoryList,readHistoryPage,readHistoryThreadResult} from './chat-result-reader';

const id='00000000-0000-4000-8000-000000000001',date='2026-09-07T10:20:30.123+05:30';
const thread={id,title:'A',createdAt:date,revision:'0',state:'active'};
const message={id,turnId:'00000000-0000-4000-8000-000000000002',role:'user',text:'',sequence:1,revision:'00000000-0000-4000-8000-000000000003',createdAt:date};
const threadSchema=z.object({id:z.string().uuid(),title:z.string().max(80),createdAt:z.string().datetime({offset:true}),revision:z.string().regex(/^(0|[1-9]\\d*)$/),state:z.enum(['active','cleanup_pending','deleted'])});
const messageSchema=z.object({id:z.string().uuid(),turnId:z.string().uuid(),role:z.enum(['user','assistant']),text:z.string(),sequence:z.number().int().positive(),revision:z.string().uuid(),createdAt:z.string().datetime({offset:true})});
const listSchema=z.object({threads:z.array(threadSchema).max(50),nextCursor:z.object({createdAt:z.string().datetime({offset:true}),id:z.string().uuid()}).nullable()});
const pageSchema=z.object({thread:threadSchema,messages:z.array(messageSchema).max(50),nextSequence:z.number().int().positive().nullable()});
const deleteSchema=z.object({thread:threadSchema,cleanup:z.enum(['complete','pending'])});
const threadResultSchema=z.object({thread:threadSchema});
const accepts=(reader:(value:unknown)=>unknown,schema:z.ZodType)=>(value:unknown)=>{let a=true,b=true;try{reader(value);}catch{a=false}b=schema.safeParse(value).success;expect(a).toBe(b);return a;};

describe('browser-safe coach result reader',()=>{
 it('matches current zod acceptance and projects unknown keys',()=>{
  const list={threads:[{...thread,extra:'drop'}],nextCursor:null,extra:'drop'};expect(accepts(readHistoryList,listSchema)(list)).toBe(true);expect(readHistoryList(list)).toEqual({threads:[thread],nextCursor:null});
  const page={thread,messages:[{...message,extra:'drop'}],nextSequence:null};expect(accepts(readHistoryPage,pageSchema)(page)).toBe(true);expect(readHistoryPage(page).messages[0]).toEqual(message);
 });
 it('matches rejection boundaries for malformed dates, revisions, arrays and caps',()=>{
  for(const value of [
   {...thread,createdAt:'2026-02-29T10:20:30Z'},
   {...thread,revision:'01'},
   {...thread,state:'unknown'},
   {...thread,id:'00000000-0000-0000-0000-000000000002'},
  ])expect(()=>readHistoryList({threads:[value],nextCursor:null})).toThrow('history_unavailable');
  expect(()=>readHistoryPage({thread,messages:[],nextSequence:0})).toThrow('history_unavailable');expect(()=>readHistoryList({threads:new Array(51).fill(thread),nextCursor:null})).toThrow('history_unavailable');
 });
 it('validates and projects the database envelope',()=>{const raw={version:'coach-assistant.chat.v1',storage:'database',ok:true,value:{threads:[thread],nextCursor:null},debug:'drop'};expect(readHistoryEnvelope(raw,readHistoryList)).toEqual({threads:[thread],nextCursor:null});expect(()=>readHistoryEnvelope({...raw,ok:false},readHistoryList)).toThrow('history_unavailable');});
 it('covers the create, rename and delete value shapes',()=>{
  const created={thread:{...thread,debug:'drop'}};const deleted={thread:{...thread,state:'cleanup_pending'},cleanup:'pending',debug:'drop'};
  expect(readHistoryThreadResult(created)).toEqual({thread});expect(readHistoryDelete(deleted)).toEqual({thread:{...thread,state:'cleanup_pending'},cleanup:'pending'});
  expect(accepts(readHistoryThreadResult,threadResultSchema)(created)).toBe(true);expect(accepts(readHistoryDelete,deleteSchema)(deleted)).toBe(true);
  expect(()=>readHistoryDelete({...deleted,cleanup:'done'})).toThrow('history_unavailable');
 });
});
