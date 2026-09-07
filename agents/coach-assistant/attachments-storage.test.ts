import { describe,it,expect,vi } from 'vitest';
import sharp from 'sharp';
import { createPrivateCoachImageStorage,attachmentObjectPath } from './attachments-storage';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={actorId:id(1),subjectId:id(1),organizationId:id(2),conversationId:id(3),attachmentId:id(4)};
const bucket='coach-attachments-test';
/** SDK transport double, not a running Storage service. */
function fixture(){
 const objects=new Map<string,Uint8Array>();let publicBucket=false;let afterUpload:(()=>void)|undefined;
 const fetchImpl=vi.fn<typeof fetch>(async(input,init)=>{
  const url=new URL(String(input));const path=url.pathname;const method=init?.method??'GET';
  if(path.includes('/bucket/'))return Response.json({id:bucket,name:bucket,public:publicBucket});
  if(path.includes('/object/sign/'))return Response.json({signedURL:path.replace('/storage/v1','')+'?token=fixture'});
  if(method==='DELETE'){for(const name of JSON.parse(String(init?.body)).prefixes)objects.delete(name);return Response.json([]);}
  const key=path.split(`/${bucket}/`)[1];
  if(method==='POST'){
   if(objects.has(key))return Response.json({message:'exists',statusCode:'409',error:'Duplicate'},{status:409});
   objects.set(key,new Uint8Array(init?.body as ArrayBuffer));afterUpload?.();return Response.json({Key:`${bucket}/${key}`,Id:id(5)});
  }
  const data=objects.get(key);return data?new Response(Buffer.from(data),{headers:{'Content-Type':'image/jpeg'}}):Response.json({message:'missing'},{status:404});
 });
 return {storage:createPrivateCoachImageStorage({url:'http://127.0.0.1:54321',serviceKey:'isolated-fixture-key',bucket,fetchImpl}),fetchImpl,objects,public:()=>{publicBucket=true;},afterUpload:(callback:()=>void)=>{afterUpload=callback;}};
}
describe('concrete Supabase private image SDK adapter',()=>{
 it('normalizes before storage, recovers identical bytes without overwrite, signs bounded reads and removes via API',async()=>{
  const f=fixture();const bytes=await sharp({create:{width:3,height:2,channels:3,background:'red'}}).png().withMetadata({orientation:6}).toBuffer();const signal=new AbortController().signal;const authorize=vi.fn(async()=>{});
  const first=await f.storage.put(scope,bytes,'image/png',signal,authorize);expect(first.path).toBe(attachmentObjectPath(scope));expect(first.metadata.mime).toBe('image/jpeg');
  const stored=f.objects.get(first.path)!;const metadata=await sharp(stored).metadata();expect(metadata.format).toBe('jpeg');expect(metadata.exif).toBeUndefined();expect(metadata.orientation).toBeUndefined();
  expect(await f.storage.readNormalized(scope,first.normalizedDigest,signal,authorize)).toEqual(stored);
  await expect(f.storage.readNormalized(scope,'0'.repeat(64),signal,authorize)).rejects.toThrow('storage_unavailable');
  expect(await f.storage.put(scope,bytes,'image/png',signal,authorize)).toEqual(first);expect(f.objects.size).toBe(1);
  const read=await f.storage.signedRead(scope,60,signal,authorize);expect(read.url).toContain('/object/sign/');expect(read.expiresIn).toBe(60);
  await f.storage.remove(scope,signal);expect(f.objects.size).toBe(0);expect(authorize).toHaveBeenCalled();
 });
 it('rejects public buckets, foreign self scope, oversized signing lifetime and invalid images before upload',async()=>{
  const f=fixture();const bytes=await sharp({create:{width:1,height:1,channels:3,background:'red'}}).png().toBuffer();const signal=new AbortController().signal;
  await expect(f.storage.put(scope,new Uint8Array([0]),'image/png',signal,async()=>{})).rejects.toThrow();expect(f.fetchImpl).not.toHaveBeenCalled();
  f.public();await expect(f.storage.put(scope,bytes,'image/png',signal,async()=>{})).rejects.toThrow('storage_unavailable');expect(f.objects.size).toBe(0);
  expect(()=>attachmentObjectPath({...scope,subjectId:id(8)})).toThrow('forbidden');await expect(f.storage.signedRead(scope,61,signal,async()=>{})).rejects.toThrow('invalid_input');
  expect(()=>createPrivateCoachImageStorage({url:'https://production.invalid',serviceKey:'fixture',bucket})).toThrow('invalid_isolated_storage_config');
 });
 it('propagates abort to SDK fetch and leaves a possibly stored object for explicit cleanup',async()=>{
  const f=fixture();const controller=new AbortController();f.afterUpload(()=>controller.abort());const bytes=await sharp({create:{width:1,height:1,channels:3,background:'red'}}).png().toBuffer();
  await expect(f.storage.put(scope,bytes,'image/png',controller.signal,async()=>{})).rejects.toThrow();expect(f.objects.size).toBe(1);
  expect(f.fetchImpl.mock.calls.every(([,init])=>init?.signal?.aborted===true)).toBe(true);
  await f.storage.remove(scope,new AbortController().signal);expect(f.objects.size).toBe(0);
 });
});
