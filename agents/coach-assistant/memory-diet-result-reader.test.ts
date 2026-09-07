import {describe,it,expect} from 'vitest';
import {persistentMemoryResultSchema} from './memory-contracts';
import {foodPreferenceResultSchema} from './food-preference-actions';
import {persistentMemoryResultReader} from './memory-result-reader';
import {foodPreferenceResultReader} from './food-preference-result-reader';
const id='00000000-0000-4000-8000-000000000001',date='2024-02-29T12:30:00+05:30',base={version:'coach-assistant.v2',storage:'database'};
const card={id,text:'  Prefiero entrenar temprano  ',createdAt:date,version:'01',confirmation:'confirmed',source:'user_input',retention:'persistent',conversationId:id};
const memoryProposal={id,hash:'a'.repeat(64),action:'memory.confirm',resource:{kind:'memory',id,version:'0'},before:null,after:{text:'  texto  ',source:'user_input',retention:'persistent'},expiresAt:date,reviewRequired:true};
const memory=[{...base,ok:false,error:'forbidden'},{...base,ok:true,memories:[card],scopeRevision:'1',derivedContext:'excluded'},{...base,ok:true,proposal:memoryProposal},{...base,ok:true,proposal:{...memoryProposal,action:'memory.correct',before:card}},{...base,ok:true,proposal:{...memoryProposal,action:'memory.delete',before:card,after:null}},{...base,ok:true,receipt:{id,actionId:id,proposalId:id,status:'applied',resourceVersion:'2',recordedAt:date},refresh:{conversationId:id,strategy:'refetch',discardDerivedContext:true,invalidatedMemoryVersions:[{id,version:'1'}]}}];
const preferences={version:1,dietPattern:'vegan'};
const diet=[{...base,ok:false,error:'not_connected'},{...base,ok:true,snapshot:{profileId:id,version:'0',preferences}},{...base,ok:true,proposal:{id,hash:'a'.repeat(64),action:'food.preference.update',resource:{kind:'food_preference',id,version:'1'},before:{version:1,dietPattern:null},after:preferences,precondition:'1',expiresAt:date,reviewRequired:true}},{...base,ok:true,receipt:{id,actionId:id,proposalId:id,status:'applied',resourceVersion:'2',recordedAt:date},refresh:{profileId:id,previousVersion:'1',version:'2',strategy:'refetch',discardDerivedContext:true}}];
const replacements:unknown[]=[undefined,null,true,false,0,-1,1,0.5,NaN,Infinity,'',' ',' texto ','x'.repeat(128),'x'.repeat(129),'x'.repeat(400),'x'.repeat(401),' '+ 'x'.repeat(400)+' ','0','01','9'.repeat(20),'9'.repeat(21),[],{},id,id.toUpperCase(),'00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff','FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF','00000000-0000-9000-8000-000000000001','2023-02-29T12:30Z','2000-02-29T12:30Z','1900-02-29T12:30Z','0000-02-29T12:30Z','2024-04-31T12:30Z','2024-02-29T23:59:59.123Z','2024-02-29T24:00Z','2024-02-29T12:30+23:59','2024-02-29T12:30+24:00','2024-02-29T12:30+0530','a'.repeat(64),'A'.repeat(64),'applied','rejected','uncertain','invalid_input','forbidden','not_found','not_connected','version_conflict','expired','idempotency_conflict','cancelled','omnivore','vegetarian','vegan','pescatarian','keto'];
const paths=(v:unknown,p:string[]=[]):string[][]=>v&&typeof v==='object'?Object.entries(v).flatMap(([k,c])=>[[...p,k],...paths(c,[...p,k])]):[];
function suite(fixtures:unknown[],schema:{safeParse:(v:unknown)=>{success:boolean;data?:unknown}},reader:{safeParse:(v:unknown)=>{success:boolean;data?:unknown}}){
 const parity=(v:unknown)=>{const expected=schema.safeParse(v),actual=reader.safeParse(v);expect(actual.success,JSON.stringify(v)).toBe(expected.success);if(expected.success)expect(actual.data).toEqual(expected.data);};
 for(const fixture of fixtures){parity(fixture);for(const path of paths(fixture)){
  for(const replacement of replacements){const copy=structuredClone(fixture);let target=copy as Record<string,unknown>;for(const key of path.slice(0,-1))target=target[key] as Record<string,unknown>;target[path.at(-1)!]=replacement;parity(copy);}
  const copy=structuredClone(fixture);let target=copy as Record<string,unknown>;for(const key of path.slice(0,-1))target=target[key] as Record<string,unknown>;delete target[path.at(-1)!];parity(copy);
 }
 for(const path of [[],...paths(fixture)]){const copy=structuredClone(fixture);let target=copy as Record<string,unknown>;for(const key of path)target=target[key] as Record<string,unknown>;if(target&&typeof target==='object'&&!Array.isArray(target)){target.extra=true;parity(copy);}}
 }
 for(const value of replacements)parity(value);
}
describe('small browser memory/diet JSON readers',()=>{
 it('matches every memory variant, nested scope field and trim transform against the server schema',()=>{suite(memory,persistentMemoryResultSchema,persistentMemoryResultReader);});
 it('matches every dietary variant and nested profile/receipt/refresh shape against the server schema',()=>{suite(diet,foodPreferenceResultSchema,foodPreferenceResultReader);});
 it('bounds arrays, rejects mixed variants and preserves input while trimming memory output',()=>{
  for(const count of [0,20,21]){const value={...memory[1],memories:Array.from({length:count},()=>card)};expect(persistentMemoryResultReader.safeParse(value).success).toBe(persistentMemoryResultSchema.safeParse(value).success);}
  const fixture=structuredClone(memory[1]);const r=persistentMemoryResultReader.safeParse(fixture);expect(r.success).toBe(true);if(r.success&&r.data.ok&&'memories'in r.data)expect(r.data.memories[0].text).toBe(card.text.trim());expect(fixture).toEqual(memory[1]);
  expect(persistentMemoryResultReader.safeParse({...memory[1],proposal:memoryProposal}).success).toBe(false);expect(foodPreferenceResultReader.safeParse({...diet[1],receipt:(diet[3] as Record<string,unknown>).receipt}).success).toBe(false);
 });
 it('keeps optional dietary refresh and required memory refresh parity without inferring authorization',()=>{
  for(const root of [memory[5],diet[3]]){const value={...root} as Record<string,unknown>;delete value.refresh;const server=root===memory[5]?persistentMemoryResultSchema:foodPreferenceResultSchema,reader=root===memory[5]?persistentMemoryResultReader:foodPreferenceResultReader;expect(reader.safeParse(value).success).toBe(server.safeParse(value).success);value.refresh=undefined;expect(reader.safeParse(value).success).toBe(server.safeParse(value).success);}
  expect(foodPreferenceResultReader.safeParse({...diet[1],snapshot:{profileId:'00000000-0000-4000-8000-000000000099',version:'1',preferences}}).success).toBe(true);
 });
});
