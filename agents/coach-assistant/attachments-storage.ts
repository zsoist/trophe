import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizeCoachImage } from './image-validation';
import type { CoachImageMime } from './contracts';
import { COACH_IMAGE_LIMITS } from './contracts';
const uuid=z.string().uuid();
const scopeSchema=z.object({actorId:uuid,subjectId:uuid,organizationId:uuid,conversationId:uuid,attachmentId:uuid}).strict();
export type AttachmentStorageScope=z.infer<typeof scopeSchema>;
export const attachmentObjectPath=(raw:AttachmentStorageScope)=>{const s=scopeSchema.parse(raw);if(s.actorId!==s.subjectId)throw new Error('forbidden');return `${s.organizationId}/${s.subjectId}/${s.conversationId}/${s.attachmentId}.jpg`;};
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
/** Existing Supabase SDK, isolated endpoint only. Never creates a bucket or reads env.
 * Injected fetch tests exercise SDK requests; they are not a real Storage server.
 */
export function createPrivateCoachImageStorage(config:{url:string;serviceKey:string;bucket:string;fetchImpl?:typeof fetch}){
 const endpoint=new URL(config.url);
 if(endpoint.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||endpoint.username||endpoint.password||endpoint.search||endpoint.hash||endpoint.pathname!=='/'||!/^coach-attachments-[a-z0-9-]+$/.test(config.bucket)||!config.serviceKey)throw new Error('invalid_isolated_storage_config');
 const clientFor=(signal:AbortSignal)=>createClient(endpoint.origin,config.serviceKey,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input,init)=>{const inherited=init?.signal??(input instanceof Request?input.signal:undefined);return (config.fetchImpl??fetch)(input,{...init,signal:inherited?AbortSignal.any([signal,inherited]):signal});}}});
 async function privateBucket(signal:AbortSignal){
  signal.throwIfAborted();const result=await clientFor(signal).storage.getBucket(config.bucket);signal.throwIfAborted();
  if(result.error||!result.data||result.data.public!==false||result.data.id!==config.bucket)throw new Error('storage_unavailable');
 }
 async function storedDigest(path:string,signal:AbortSignal){
  const result=await clientFor(signal).storage.from(config.bucket).download(path);signal.throwIfAborted();
  if(result.error||!result.data||result.data.size>COACH_IMAGE_LIMITS.fileBytes)throw new Error('storage_unavailable');
  return hash(new Uint8Array(await result.data.arrayBuffer()));
 }
 return {bucket:config.bucket,
  async assertStored(scope:AttachmentStorageScope,expectedDigest:string,signal:AbortSignal,authorize:()=>Promise<void>){
   const path=attachmentObjectPath(scope);await authorize();await privateBucket(signal);
   if(await storedDigest(path,signal)!==expectedDigest)throw new Error('storage_unavailable');await authorize();signal.throwIfAborted();
  },
  async put(scope:AttachmentStorageScope,bytes:Uint8Array,mime:CoachImageMime,signal:AbortSignal,authorize:()=>Promise<void>){
   const path=attachmentObjectPath(scope);signal.throwIfAborted();
   const image=await normalizeCoachImage(bytes,mime,signal);await authorize();await privateBucket(signal);signal.throwIfAborted();
   const normalizedDigest=hash(image.bytes);
   const result=await clientFor(signal).storage.from(config.bucket).upload(path,image.bytes,{contentType:'image/jpeg',cacheControl:'0',upsert:false});
   signal.throwIfAborted();
   if(result.error){
    // A lost response can leave an immutable object. Recover only exact bytes,
    // never overwrite a different upload or assume conflict means success.
    if(await storedDigest(path,signal)!==normalizedDigest)throw new Error('idempotency_conflict');
   }else if(result.data?.path!==path)throw new Error('storage_unavailable');
   await authorize();signal.throwIfAborted();
   return {path,sourceDigest:hash(bytes),normalizedDigest,metadata:image.metadata};
  },
  async remove(scope:AttachmentStorageScope,signal:AbortSignal){
   const path=attachmentObjectPath(scope);await privateBucket(signal);
   const result=await clientFor(signal).storage.from(config.bucket).remove([path]);signal.throwIfAborted();if(result.error)throw new Error('storage_unavailable');
  },
  async signedRead(scope:AttachmentStorageScope,expiresIn:number,signal:AbortSignal,authorize:()=>Promise<void>){
   if(!Number.isInteger(expiresIn)||expiresIn<1||expiresIn>60)throw new Error('invalid_input');
   const path=attachmentObjectPath(scope);await authorize();await privateBucket(signal);
   const result=await clientFor(signal).storage.from(config.bucket).createSignedUrl(path,expiresIn);signal.throwIfAborted();
   if(result.error||!result.data?.signedUrl)throw new Error('storage_unavailable');const url=new URL(result.data.signedUrl);
   if(url.origin!==endpoint.origin||url.pathname!==`/storage/v1/object/sign/${config.bucket}/${path}`||!url.searchParams.get('token'))throw new Error('storage_unavailable');
   await authorize();signal.throwIfAborted();return {url:url.toString(),expiresIn};
  },
 };
}
export type PrivateCoachImageStorage=ReturnType<typeof createPrivateCoachImageStorage>;
