import {describe,it,expect,vi} from 'vitest';
import {PgDialect} from 'drizzle-orm/pg-core';
import {createCoachChatPrivacy} from './chat-privacy';
import type {db} from '@/db/client';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={actorId:id(1),subjectId:id(1),organizationId:id(2),actorRole:'client' as const};
function fixture(){let missingPhoto=false,removed=false,authorized=true;const queries:string[]=[];
 const execute=async(q:Parameters<PgDialect['sqlToQuery']>[0])=>{const {sql}=new PgDialect().sqlToQuery(q);queries.push(sql);
  if(sql.includes('FROM public.profiles a'))return {rows:authorized?[{id:scope.actorId}]:[]};if(sql.includes('coach_chat_contract_version'))return {rows:[{version:'coach-assistant.chat.v1'}]};
  if(sql.includes('coach_photo_food_observations')&&missingPhoto)throw {code:'42P01'};
  if(sql.includes('coach_chat_threads')&&!sql.includes('JOIN'))return {rows:[{id:id(3),title:'Thread',state:'active',revision:'1',created_at:'2026-09-07'}]};
  if(sql.includes('coach_chat_turns'))return {rows:[{thread_id:id(3),content_id:id(4),turn_id:id(5),role:'user',sequence:1,revision:id(6),current:true,pipeline_version:null}]};
  if(sql.includes('coach_attachment_uploads')&&sql.includes("state<>'removed'")&&sql.startsWith('SELECT id,'))return {rows:removed?[]:[{id:id(7),actor_id:scope.actorId,subject_id:scope.actorId,organization_id:scope.organizationId,conversation_id:id(3),bucket:'coach-private',object_path:`${scope.actorId}/${id(7)}.jpg`}]};
  if(sql.startsWith('UPDATE private.coach_attachment_uploads')){removed=true;return {rows:[{id:id(7)}]};}
  if(sql.includes('count(*)::text AS total FROM private.coach_attachment_uploads'))return {rows:[{total:removed?'0':'1'}]};
  if(sql.startsWith('DELETE FROM private'))return {rows:[]};return {rows:[]};};
 const database={execute,transaction:async(work:(tx:{execute:typeof execute})=>Promise<unknown>)=>work({execute})} as unknown as typeof db;
 return {privacy:createCoachChatPrivacy(database),queries,missing:()=>{missingPhoto=true;},removed:()=>{removed=true;},revoke:()=>{authorized=false;}};}
describe('private coach privacy supplement',()=>{
 it('exports only scoped metadata bindings and reports missing optional sidecar honestly',async()=>{const f=fixture();f.missing();const r=await f.privacy.export(scope,new AbortController().signal);expect(r).toMatchObject({status:'partial',contentSource:'public.agent_conversation_export',threads:[{id:id(3)}],turnBindings:[{content_id:id(4)}],unavailable:['photoFoodObservations']});expect(JSON.stringify(r)).not.toContain('message text');expect(f.queries.join('\n')).toContain('h.actor_id=');});
 it('rejects cross-user export and blocks profile erasure without attachment removal',async()=>{const f=fixture();expect(await f.privacy.export({...scope,subjectId:id(9)},new AbortController().signal)).toMatchObject({status:'forbidden'});expect(await f.privacy.eraseBeforeProfileDelete(scope.actorId,undefined,new AbortController().signal)).toEqual({status:'pending',remaining:1});});
 it('does not misreport a revoked actor or cancelled request as a partial export',async()=>{const f=fixture();f.revoke();expect(await f.privacy.export(scope,new AbortController().signal)).toMatchObject({status:'forbidden',unavailable:[]});const cancelled=new AbortController();cancelled.abort();expect(await fixture().privacy.export(scope,cancelled.signal)).toMatchObject({status:'cancelled',unavailable:[]});});
 it('rejects a removal receipt that does not attest the inventoried object',async()=>{const f=fixture();const remove=vi.fn(async()=>({removed:true as const,bucket:'coach-private',objectPath:'different.jpg'}));expect(await f.privacy.eraseBeforeProfileDelete(scope.actorId,{remove},new AbortController().signal)).toEqual({status:'failed',remaining:null});expect(f.queries.join('\n')).not.toContain('UPDATE private.coach_attachment_uploads');});
 it('removes exact private objects before deleting their metadata and verifies none remain',async()=>{const f=fixture();const remove=vi.fn(async(input:{bucket:string;objectPath:string})=>({removed:true as const,bucket:input.bucket,objectPath:input.objectPath}));expect(await f.privacy.eraseBeforeProfileDelete(scope.actorId,{remove},new AbortController().signal)).toEqual({status:'complete',remaining:0});expect(remove).toHaveBeenCalledWith(expect.objectContaining({actorId:scope.actorId,subjectId:scope.actorId,bucket:'coach-private'}),expect.any(AbortSignal));const joined=f.queries.join('\n');expect(joined.indexOf("state<>'removed'")).toBeLessThan(joined.indexOf('UPDATE private.coach_attachment_uploads'));expect(joined.indexOf('UPDATE private.coach_attachment_uploads')).toBeLessThan(joined.indexOf('DELETE FROM private.coach_attachment_uploads'));});
});
