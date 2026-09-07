import { describe,it,expect } from 'vitest';
import { foodQuantityResultSchema } from './food-actions';
import { foodQuantityResultReader } from './food-result-reader';
const id='00000000-0000-4000-8000-000000000001';
const values={loggedDate:'2024-02-29',foodName:'Rice',grams:10,quantity:1,calories:20,proteinG:1,carbsG:2,fatG:0,fiberG:null,sugarG:null};
const base={version:'coach-assistant.v2',storage:'database'};
const fixtures=[{...base,ok:false,error:'forbidden'}, {...base,ok:true,snapshot:{...values,entryId:id,version:'1'}}, {...base,ok:true,proposal:{id,hash:'a'.repeat(64),action:'food.quantity.update',resource:{kind:'food_entry',id,version:'1'},before:values,after:{...values,grams:20},precondition:'1',expiresAt:'2024-02-29T12:30:00+05:30',reviewRequired:true}}, {...base,ok:true,receipt:{id,actionId:id,proposalId:id,status:'applied',resourceVersion:'2',recordedAt:'2024-02-29T12:30Z'},refresh:{entryId:id,loggedDate:'2024-02-29',previousVersion:'1',version:'2',strategy:'refetch'}}];
const replacements:unknown[]=[undefined,null,true,false,0,-0,-1,1,0.5,NaN,Infinity,-Infinity,'','x','x'.repeat(129),'x'.repeat(201),[],{},'2023-02-29','2000-02-29','1900-02-29','0000-02-29','2024-04-31','2024-02-29T23:59:59.123Z','2024-02-29T24:00Z','2024-02-29T12:30+23:59','2024-02-29T12:30+24:00','2024-02-29T12:30+0530',id,id.toUpperCase(),'00000000-0000-0000-0000-000000000000','ffffffff-ffff-ffff-ffff-ffffffffffff','FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF','00000000-0000-9000-8000-000000000001','a'.repeat(64),'A'.repeat(64),'applied','rejected','uncertain','invalid_input','forbidden','not_found','version_conflict','expired','idempotency_conflict','cancelled'];
function parity(value:unknown){const expected=foodQuantityResultSchema.safeParse(value);const actual=foodQuantityResultReader.safeParse(value);expect(actual.success,JSON.stringify(value)).toBe(expected.success);if(expected.success&&actual.success)expect(actual.data).toEqual(expected.data);}
function paths(value:unknown,prefix:string[]=[]):string[][] {return value&&typeof value==='object'&&!Array.isArray(value)?Object.entries(value).flatMap(([key,child])=>[[...prefix,key],...paths(child,[...prefix,key])]):[];}
describe('Food browser reader differential acceptance against authoritative Zod',()=>{
 it('matches every variant and mutations at every nested field',()=>{
  for(const fixture of fixtures){parity(fixture);for(const path of paths(fixture)){
   for(const replacement of replacements){const copy=structuredClone(fixture);let target=copy as Record<string,unknown>;for(const key of path.slice(0,-1))target=target[key] as Record<string,unknown>;target[path.at(-1)!]=replacement;parity(copy);}
   const copy=structuredClone(fixture);let target=copy as Record<string,unknown>;for(const key of path.slice(0,-1))target=target[key] as Record<string,unknown>;delete target[path.at(-1)!];parity(copy);
  }}
 });
 it('rejects extra keys at every object, mixed variants and invalid roots; permits optional refresh omission',()=>{
  for(const fixture of fixtures){for(const path of [[],...paths(fixture)]){
   const copy=structuredClone(fixture);let target:unknown=copy;for(const key of path)target=(target as Record<string,unknown>)[key];
   if(target&&typeof target==='object'&&!Array.isArray(target)){(target as Record<string,unknown>).extra=true;parity(copy);}
  }}
  for(const value of replacements)parity(value);
  parity({...fixtures[1],proposal:(fixtures[2] as Record<string,unknown>).proposal});
  const copy={...fixtures[3]} as Record<string,unknown>;delete copy.refresh;parity(copy);copy.refresh=undefined;parity(copy);
 });
});
