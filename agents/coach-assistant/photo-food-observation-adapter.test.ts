import {beforeEach,describe,expect,it,vi} from 'vitest';
import {PgDialect} from 'drizzle-orm/pg-core';
import type {ExecuteAiTaskResult} from '@/agents/runtime';
import {createDatabasePhotoFoodObservationAdapter,runVerifiedPhotoFoodAnalysis,type VerifiedPhotoFoodAnalysis} from './photo-food-observation-adapter';
import type {PhotoFoodScope} from './photo-food-observation';

const executeAiTask=vi.hoisted(()=>vi.fn());
vi.mock('@/agents/runtime',()=>({executeAiTask}));
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope:PhotoFoodScope={actorId:id(1),subjectId:id(1),organizationId:id(2),conversationId:id(3),attachmentId:id(4)};
const imageBytes=new Uint8Array([1,2,3]);
const imageDigest='039058c6f2c0cb492c533b0a4d14ef77cc0f78abccced5287d84a1a2011cfb81';
const food={name:'Rice',estimated_grams:100,estimated_calories:130,estimated_protein_g:2.7,estimated_carbs_g:28,estimated_fat_g:.3,estimated_fiber_g:.4,estimated_sugar_g:0,confidence:.7,source:'ai_estimate',accuracy_note:'Estimate; confirm grams.'};
const taskResult=(generation=5):ExecuteAiTaskResult<{content:Array<unknown>} >=>({generationId:id(generation),estimatedCostUsd:.001,selectedPolicy:{provider:'anthropic',model:'claude-haiku-4-5-20251001',reasoningEffort:'none',costClass:'cheap',latencyClass:'fast',maxTokens:2048,timeoutMs:30000,maxInputChars:10000000,maxCostUsd:.08,promptVersion:'photo-analyze-v1'},isFallback:false,output:{content:[{type:'tool_use',name:'submit_food_photo_analysis',input:{foods:[structuredClone(food)]}}]},usage:{inputTokens:10,outputTokens:10},latencyMs:1,rawStatus:200});

beforeEach(()=>executeAiTask.mockReset());
describe('durable Photo Food observation adapter with injected SQL/runtime',()=>{
 it('runs the existing task once and binds server scope/digest into opaque proof metadata',async()=>{
  executeAiTask.mockResolvedValue(taskResult());const invoke=vi.fn();
  const result=await runVerifiedPhotoFoodAnalysis(scope,{digest:imageDigest,bytes:imageBytes},{requestId:'request-1',invoke});
  expect(executeAiTask).toHaveBeenCalledTimes(1);expect(result.proof).toEqual({kind:'verified_photo_food_analysis'});
  expect(executeAiTask.mock.calls[0][0]).toMatchObject({task:'photo_analyze',context:{userId:scope.actorId,organizationId:scope.organizationId,requestId:'request-1',metadata:{coachPhotoFood:{conversationId:scope.conversationId,attachmentId:scope.attachmentId,imageDigest}}}});await executeAiTask.mock.calls[0][0].invoke({policy:taskResult().selectedPolicy,signal:new AbortController().signal});expect(invoke).toHaveBeenCalledWith(expect.objectContaining({image:{bytes:imageBytes,mediaType:'image/jpeg'}}));
  await expect(runVerifiedPhotoFoodAnalysis(scope,{digest:'a'.repeat(64),bytes:imageBytes},{invoke})).rejects.toThrow('invalid_image_binding');
 });
 it('rejects ambiguous, dropped, unconfirmed or wrong-policy task output',async()=>{
  for(const mutate of [(r:ReturnType<typeof taskResult>)=>{r.selectedPolicy.provider='openai';},(r:ReturnType<typeof taskResult>)=>{r.output.content=[];},(r:ReturnType<typeof taskResult>)=>{r.output.content.push(r.output.content[0]);},(r:ReturnType<typeof taskResult>)=>{(r.output.content[0] as {input:{foods:unknown[]}}).input.foods=[food,{...food,estimated_grams:0}];},(r:ReturnType<typeof taskResult>)=>{(r.output.content[0] as {input:{foods:Array<typeof food&{needs_confirmation?:boolean}>}}).input.foods[0].needs_confirmation=true;},(r:ReturnType<typeof taskResult>)=>{(r.output.content[0] as {input:{foods:Array<typeof food&{action?:string}>}}).input.foods[0].action='food.photo.apply';}]){
   const result=taskResult();mutate(result);executeAiTask.mockResolvedValueOnce(result);await expect(runVerifiedPhotoFoodAnalysis(scope,{digest:imageDigest,bytes:imageBytes},{invoke:vi.fn()})).rejects.toThrow();
  }
 });
 function fixture(){
  let active:Record<string,unknown>|null=null,authorized=true,attachment=true,generation=true,expired=false,receiptFails=false,threadRevoked=false;const statements:string[]=[];
  const tx={execute:async(q:Parameters<PgDialect['sqlToQuery']>[0])=>{const {sql,params:p}=new PgDialect().sqlToQuery(q);statements.push(sql);
   if(sql.includes('FROM public.profiles actor'))return {rows:authorized?[{id:scope.actorId}]:[]};
   if(sql.includes('coach_chat_contract_version'))return {rows:[{version:'coach-assistant.chat.v1'}]};
   if(sql.includes('FROM private.coach_chat_threads'))return {rows:threadRevoked?[]:[{id:scope.conversationId}]};
   if(sql.includes('FROM private.coach_attachment_uploads')&&!sql.includes('JOIN private'))return {rows:attachment?[{normalized_digest:imageDigest,state:'available',expired}]:[]};
   if(sql.includes('FROM public.agent_runs'))return {rows:generation?[{generation_id:p[0]}]:[]};
   if(sql.includes('FROM private.coach_photo_food_observations WHERE generation_id'))return {rows:active&&active.generation_id===p[0]?[active]:[]};
   if(sql.includes('UPDATE private.coach_photo_food_observations')){if(active)active.active=false;return {rows:[]};}
   if(sql.includes('INSERT INTO private.coach_photo_food_observations')){if(receiptFails)throw Error('insert failed');active={id:p[0],actor_id:p[1],subject_id:p[2],organization_id:p[3],conversation_id:p[4],attachment_id:p[5],revision:p[6],image_digest:p[7],generation_id:p[8],foods:JSON.parse(String(p[9])),active:true};return {rows:[{id:p[0]}]};}
   if(sql.includes('FROM private.coach_photo_food_observations o'))return {rows:active&&active.active&&attachment&&!expired?[{...active,attachment_digest:imageDigest,attachment_state:'available',attachment_expired:false}]:[]};
   if(sql.includes('SET LOCAL')||sql.includes('pg_advisory_xact_lock'))return {rows:[]};throw Error(`unexpected ${sql}`);
  }};
  const database={$client:{},transaction:async(work:(value:typeof tx)=>Promise<unknown>)=>{const before=structuredClone(active);try{return await work(tx);}catch(error){active=before;throw error;}}} as unknown as Parameters<typeof createDatabasePhotoFoodObservationAdapter>[0];
  return {adapter:createDatabasePhotoFoodObservationAdapter(database),tx,database,statements,state:()=>active,revokeRestore:()=>{authorized=true;threadRevoked=true;},revoke:()=>{authorized=false;},remove:()=>{attachment=false;},expire:()=>{expired=true;},missingGeneration:()=>{generation=false;},failInsert:()=>{receiptFails=true;}};
 }
 async function proof(generation=5){executeAiTask.mockResolvedValueOnce(taskResult(generation));return (await runVerifiedPhotoFoodAnalysis(scope,{digest:imageDigest,bytes:imageBytes},{invoke:vi.fn()})).proof;}
 it('rejects revoke/restore during provider execution before an observation exists',async()=>{
  const f=fixture();const adapter=createDatabasePhotoFoodObservationAdapter(f.database,{readNormalized:async()=>imageBytes.slice()});
  executeAiTask.mockImplementationOnce(async()=>{expect(f.state()).toBeNull();f.revokeRestore();return taskResult();});
  await expect(adapter.analyzeAndRecord(scope,{invoke:vi.fn()},new AbortController().signal)).rejects.toThrow('forbidden');expect(f.state()).toBeNull();
 });
 it('records normalized output only after current auth, attachment and durable generation evidence',async()=>{
  const f=fixture(),p=await proof();const recorded=await f.adapter.record(scope,p,new AbortController().signal);expect(recorded).toMatchObject({...scope,source:'validated_photo_analysis',imageDigest,foods:[{name:'Rice'}]});expect(f.state()).toMatchObject({actor_id:scope.actorId,attachment_id:scope.attachmentId,generation_id:id(5),active:true});expect(f.statements.join('\n')).not.toContain('http');
  const loaded=await f.adapter.load(scope,new AbortController().signal,f.tx as never);expect(loaded).toMatchObject({id:(recorded as {id:string}).id,revision:(recorded as {revision:string}).revision,source:'validated_photo_analysis'});
  expect(f.statements.find(statement=>statement.includes('FROM private.coach_photo_food_observations o'))).toContain('FOR UPDATE OF o,a FOR SHARE OF g');
 });
 it('rejects control fields in a durable observation before normalization',async()=>{
  const f=fixture(),p=await proof();await f.adapter.record(scope,p,new AbortController().signal);
  const stored=f.state();expect(stored).not.toBeNull();(stored!.foods as Array<Record<string,unknown>>)[0].operation='food.photo.apply';
  await expect(f.adapter.load(scope,new AbortController().signal,f.tx as never)).rejects.toThrow('untrusted_instruction');
 });
 it('loads exact private normalized bytes, reauthorizes and records through one composed call',async()=>{
  const f=fixture(),authorizeCalls:{count:number}={count:0};executeAiTask.mockResolvedValueOnce(taskResult());
  const storage={readNormalized:vi.fn(async(rawScope:PhotoFoodScope,expected:string,_signal:AbortSignal,authorize:()=>Promise<void>)=>{expect(rawScope).toEqual(scope);expect(expected).toBe(imageDigest);await authorize();authorizeCalls.count++;return imageBytes.slice();})};
  const adapter=createDatabasePhotoFoodObservationAdapter(f.database,storage);
  const recorded=await adapter.analyzeAndRecord(scope,{invoke:vi.fn()},new AbortController().signal);
  expect(storage.readNormalized).toHaveBeenCalledTimes(1);expect(authorizeCalls.count).toBe(1);expect(executeAiTask).toHaveBeenCalledTimes(1);expect(recorded).toMatchObject({source:'validated_photo_analysis',imageDigest});
 });
 it('rejects forged proof, wrong scope, missing generation, unavailable image and revocation',async()=>{
  const forged={kind:'verified_photo_food_analysis'} as VerifiedPhotoFoodAnalysis;await expect(fixture().adapter.record(scope,forged,new AbortController().signal)).rejects.toThrow('forbidden');
  for(const kind of ['missingGeneration','remove','expire','revoke'] as const){const f=fixture(),p=await proof();f[kind]();await expect(f.adapter.record(scope,p,new AbortController().signal)).rejects.toThrow();expect(f.state()).toBeNull();}
  const f=fixture(),p=await proof();await expect(f.adapter.record({...scope,conversationId:id(99)},p,new AbortController().signal)).rejects.toThrow('forbidden');
 });
 it('supersedes observation revision atomically and fails closed on rollback or stale attachment',async()=>{
  const f=fixture(),p=await proof(),first=await f.adapter.record(scope,p,new AbortController().signal) as {revision:string};expect(await f.adapter.record(scope,p,new AbortController().signal)).toMatchObject({revision:first.revision});
  const second=await f.adapter.record(scope,await proof(6),new AbortController().signal) as {revision:string};expect(second.revision).not.toBe(first.revision);expect(f.state()).toMatchObject({revision:second.revision,active:true});
  f.failInsert();await expect(f.adapter.record(scope,await proof(7),new AbortController().signal)).rejects.toThrow();expect(f.state()).toMatchObject({revision:second.revision,active:true});f.remove();expect(await f.adapter.load(scope,new AbortController().signal,f.tx as never)).toBeNull();
 });
});
