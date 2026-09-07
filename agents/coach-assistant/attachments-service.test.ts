import { createHash } from 'node:crypto';
import { describe,it,expect,vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { createPrivateAttachmentService } from './attachments-service';
import { attachmentObjectPath,type PrivateCoachImageStorage } from './attachments-storage';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={actorId:id(1),subjectId:id(1),organizationId:id(2)};
const base={version:'coach-assistant.v2',conversationId:id(3)};
const prepare={...base,operation:'attachment.prepare',requestId:id(4),mime:'image/png',bytes:3};
const hash=(data:Uint8Array)=>createHash('sha256').update(data).digest('hex');
/** Real lifecycle SQL code with transactional DB/storage doubles, not PostgreSQL. */
function fixture(){
 let rows:Record<string,Record<string,unknown>>={};let revoked=false,failFinalize=false,failDelete=false,failRemoveFinalize=false;const objects=new Set<string>();let seconds:number[]=[];
 const storage:PrivateCoachImageStorage={bucket:'coach-attachments-test',assertStored:vi.fn(async s=>{if(!objects.has(attachmentObjectPath(s)))throw new Error('storage_unavailable');}),put:vi.fn<PrivateCoachImageStorage['put']>(async(s,bytes,_mime,_signal,authorize)=>{await authorize();const path=attachmentObjectPath(s);objects.add(path);return {path,sourceDigest:hash(bytes),normalizedDigest:hash(bytes),metadata:{mime:'image/jpeg',bytes:3,width:1,height:1}};}),remove:vi.fn(async s=>{if(failDelete)throw new Error('lost delete');objects.delete(attachmentObjectPath(s));}),signedRead:vi.fn(async(_s,expiresIn)=>({url:'http://127.0.0.1/signed',expiresIn}))};
 const tx={execute:async(query:Parameters<PgDialect['sqlToQuery']>[0])=>{
  const {sql,params:p}=new PgDialect().sqlToQuery(query);
  if(sql.includes('FROM public.profiles actor'))return {rows:revoked?[]:[{id:scope.actorId}]};
  if(sql.includes('AS total,count(*)'))return {rows:[{total:String(Object.values(rows).filter(r=>r.state!=='removed').length),owned:String(Object.values(rows).filter(r=>r.state!=='removed'&&r.actor_id===p[0]&&r.subject_id===p[1]&&r.organization_id===p[2]&&r.conversation_id===p[3]).length)}]};
  if(sql.includes("interval '15 minutes'"))return {rows:[{expires:'2026-09-07T12:15:00Z'}]};
  if(sql.includes('INSERT INTO private.coach_attachment_uploads')){rows[String(p[0])]={id:p[0],actor_id:p[1],subject_id:p[2],organization_id:p[3],conversation_id:p[4],request_id:p[5],bucket:p[6],object_path:p[7],mime:p[8],input_bytes:p[9],upload_token_hash:p[10],expires_at:p[11],state:'prepared',source_digest:null,normalized_digest:null,metadata:null,expired:false};return {rows:[]};}
  if(sql.includes('SELECT *,expires_at')){
   if(sql.includes('request_id='))return {rows:Object.values(rows).filter(r=>r.actor_id===p[0]&&r.request_id===p[1])};
   if(sql.includes('SKIP LOCKED'))return {rows:Object.values(rows).filter(r=>r.bucket===p[0]&&r.state!=='removed'&&r.expired)};
   const r=rows[String(p[0])];return {rows:r&&r.actor_id===p[1]&&r.subject_id===p[2]&&r.organization_id===p[3]&&r.conversation_id===p[4]?[r]:[]};
  }
  if(sql.includes('SET source_digest=')){rows[String(p[1])].source_digest=p[0];return {rows:[]};}
  if(sql.includes("SET state='available'")){if(failFinalize)throw new Error('finalize failed');Object.assign(rows[String(p[3])],{state:'available',source_digest:p[0],normalized_digest:p[1],metadata:JSON.parse(String(p[2]))});return {rows:[]};}
  if(sql.includes("SET state='removed'")){if(failRemoveFinalize)throw new Error('delete commit result lost');Object.assign(rows[String(p[0])],{state:'removed',metadata:null});return {rows:[]};}
  if(sql.includes('SELECT expires_at<=clock_timestamp()'))return {rows:[{expired:rows[String(p[0])].expired}]};
  if(sql.includes('floor(extract(epoch'))return {rows:[{seconds:seconds.shift()??900}]};
  return {rows:[]};
 }};
 const database={transaction:async(work:(t:typeof tx)=>Promise<unknown>)=>{const before=structuredClone(rows);try{return await work(tx);}catch(e){rows=before;throw e;}}} as unknown as Parameters<typeof createPrivateAttachmentService>[0];
 const service=createPrivateAttachmentService(database,storage,new Uint8Array(32).fill(7));const signal=new AbortController().signal;
 return {service,signal,storage,objects,remaining:(values:number[])=>{seconds=values;},failRemoveFinalize:(v:boolean)=>{failRemoveFinalize=v;},rows:()=>rows,revoke:()=>{revoked=true;},failFinalize:(v:boolean)=>{failFinalize=v;},failDelete:(v:boolean)=>{failDelete=v;},expire:()=>{for(const r of Object.values(rows))r.expired=true;}};
}
describe('durable private attachment lifecycle',()=>{
 it('prepares stably, stores only token hash, authorizes recovery and rejects cross-thread idempotency',async()=>{
  const f=fixture();const a=await f.service.operation(scope,prepare,f.signal);const b=await f.service.operation(scope,prepare,f.signal);expect(a).toEqual(b);expect(a.ok).toBe(true);
  expect(JSON.stringify(f.rows())).not.toContain(a.uploadToken!);expect(await f.service.operation(scope,{...prepare,conversationId:id(8)},f.signal)).toMatchObject({error:'idempotency_conflict'});
  const s={...scope,conversationId:id(3),attachmentId:a.attachment!.id};expect(await f.service.upload(s,a.uploadToken!,new Uint8Array([1,2,3]),f.signal)).toMatchObject({state:'available',storage:'private_storage'});
  expect(await f.service.upload(s,a.uploadToken!,new Uint8Array([1,2,3]),f.signal)).toMatchObject({state:'available'});expect(f.storage.put).toHaveBeenCalledTimes(1);
  f.revoke();expect(await f.service.operation(scope,{...base,operation:'attachment.status',attachmentId:s.attachmentId},f.signal)).toMatchObject({error:'forbidden'});
 });
 it('preserves committed source identity and orphan path after failed finalize, then cleans abandoned data idempotently',async()=>{
  const f=fixture();const a=await f.service.operation(scope,prepare,f.signal);const s={...scope,conversationId:id(3),attachmentId:a.attachment!.id};f.failFinalize(true);
  expect(await f.service.upload(s,a.uploadToken!,new Uint8Array([1,2,3]),f.signal)).toMatchObject({error:'uncertain'});expect(f.objects.size).toBe(1);expect(f.rows()[s.attachmentId]).toMatchObject({state:'prepared',source_digest:hash(new Uint8Array([1,2,3]))});
  expect(await f.service.upload(s,a.uploadToken!,new Uint8Array([3,2,1]),f.signal)).toMatchObject({error:'idempotency_conflict'});
  f.expire();f.failDelete(true);expect(await f.service.cleanup(f.signal)).toEqual({ok:false,removed:0});expect(f.rows()[s.attachmentId].state).toBe('prepared');
  f.failDelete(false);expect(await f.service.cleanup(f.signal)).toEqual({ok:true,removed:1});expect(f.objects.size).toBe(0);expect(await f.service.cleanup(f.signal)).toEqual({ok:true,removed:0});
 });
 it('uses a signing margin across a clock-second boundary without extending retention',async()=>{
  const f=fixture();const a=await f.service.operation(scope,prepare,f.signal);const s={...scope,conversationId:id(3),attachmentId:a.attachment!.id};await f.service.upload(s,a.uploadToken!,new Uint8Array([1,2,3]),f.signal);
  f.remaining([10,9]);expect(await f.service.operation(scope,{...base,operation:'attachment.read',attachmentId:s.attachmentId},f.signal)).toMatchObject({ok:true,read:{expiresIn:8}});
  f.remaining([2]);expect(await f.service.operation(scope,{...base,operation:'attachment.read',attachmentId:s.attachmentId},f.signal)).toMatchObject({error:'expired'});expect(f.storage.signedRead).toHaveBeenCalledTimes(1);
 });
 it('withholds availability after object deletion succeeds but SQL removal fails',async()=>{
  const f=fixture();const a=await f.service.operation(scope,prepare,f.signal);const s={...scope,conversationId:id(3),attachmentId:a.attachment!.id};await f.service.upload(s,a.uploadToken!,new Uint8Array([1,2,3]),f.signal);f.failRemoveFinalize(true);
  const remove={...base,operation:'attachment.remove',attachmentId:s.attachmentId,reviewed:true};expect(await f.service.operation(scope,remove,f.signal)).toMatchObject({error:'uncertain'});expect(f.objects.size).toBe(0);expect(f.rows()[s.attachmentId].state).toBe('available');
  expect(await f.service.operation(scope,{...base,operation:'attachment.status',attachmentId:s.attachmentId},f.signal)).toMatchObject({ok:false,error:'uncertain'});
  f.failRemoveFinalize(false);expect(await f.service.operation(scope,remove,f.signal)).toMatchObject({state:'removed'});
 });
 it('recovers immutable stored bytes with same identity after finalize failure and removes only reviewed owned objects',async()=>{
  const f=fixture();const a=await f.service.operation(scope,prepare,f.signal);const s={...scope,conversationId:id(3),attachmentId:a.attachment!.id};f.failFinalize(true);await f.service.upload(s,a.uploadToken!,new Uint8Array([1,2,3]),f.signal);f.failFinalize(false);
  expect(await f.service.upload(s,a.uploadToken!,new Uint8Array([1,2,3]),f.signal)).toMatchObject({state:'available'});
  expect(await f.service.operation(scope,{...base,operation:'attachment.remove',attachmentId:s.attachmentId,reviewed:false},f.signal)).toMatchObject({error:'invalid_input'});
  expect(await f.service.operation(scope,{...base,operation:'attachment.remove',attachmentId:s.attachmentId,reviewed:true},f.signal)).toMatchObject({state:'removed'});expect(f.objects.size).toBe(0);
 });
});
