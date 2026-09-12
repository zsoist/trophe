import { createHmac, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { attachmentOperationSchema } from './schema';
import { COACH_IMAGE_LIMITS } from './contracts';
import type { CoachAttachmentResult, CoachImageMime } from './contracts';
import { normalizeCoachImage } from './image-validation';

type Entry={id:string;actor:string;conversation:string;mime:CoachImageMime;limit:number;expires:number;state:'prepared'|'uploading'|'available'|'removed';bytes?:Uint8Array;digest?:string;metadata?:CoachAttachmentResult['metadata']};
type DecodePort=(bytes:Uint8Array,mime:CoachImageMime,signal:AbortSignal)=>Promise<Awaited<ReturnType<typeof normalizeCoachImage>>>;
const base={version:'coach-assistant.v2',storage:'isolated_ephemeral',analysis:'not_connected'} as const;
const fail=(error:CoachAttachmentResult['error']):CoachAttachmentResult=>({...base,ok:false,error});

/** Deterministic resource bounds for one isolated store. Tests read these instead of
 * re-deriving limits; no global service or framework is introduced. */
export const ISOLATED_ATTACHMENT_BOUNDS={activeEntries:128,removedTombstones:128,decodeConcurrency:2,decodeQueue:4} as const;

/** No bucket/URL access: private bytes live only in this bounded isolated store. */
export function createIsolatedAttachmentStore(clock:()=>number=Date.now,decode:DecodePort=normalizeCoachImage) {
  const secret=randomBytes(32);const entries=new Map<string,Entry>();
  const token=(entry:Entry)=>createHmac('sha256',secret).update(JSON.stringify([entry.id,entry.actor,entry.conversation,entry.mime,entry.limit,entry.expires])).digest('hex');
  const prune=()=>{for(const [id,entry] of entries)if(entry.expires<=clock())entries.delete(id);};
  /** Removed entries stay only so remove/status/not_found stay coherent; drop the oldest first. */
  const evictRemoved=()=>{
    let removed=0;for(const entry of entries.values())if(entry.state==='removed')removed++;
    for(const [id,entry] of entries){if(removed<=ISOLATED_ATTACHMENT_BOUNDS.removedTombstones)break;if(entry.state==='removed'){entries.delete(id);removed--;}}
  };
  // Bounded decode gate: full decodes are capped and waiters are capped, so callers get
  // backpressure ('busy') instead of unbounded concurrency or an unlimited wait.
  let decoding=0;const decodeWaiters:Array<{signal:AbortSignal;onAbort:()=>void;resolve:(release:()=>void)=>void;reject:(error:Error)=>void}>=[];
  const releaseSlot=()=>{const next=decodeWaiters.shift();if(next){next.signal.removeEventListener('abort',next.onAbort);next.resolve(releaseSlot);}else decoding=Math.max(0,decoding-1);};
  const acquireSlot=(signal:AbortSignal):Promise<()=>void>=>{
    if(signal.aborted)return Promise.reject(new Error('cancelled'));
    if(decoding<ISOLATED_ATTACHMENT_BOUNDS.decodeConcurrency&&!decodeWaiters.length){decoding++;return Promise.resolve(releaseSlot);}
    if(decodeWaiters.length>=ISOLATED_ATTACHMENT_BOUNDS.decodeQueue)return Promise.reject(new Error('busy'));
    return new Promise<()=>void>((resolve,reject)=>{
      const waiter={signal,resolve,reject,onAbort:()=>{const index=decodeWaiters.indexOf(waiter);if(index>=0)decodeWaiters.splice(index,1);reject(new Error('cancelled'));}};
      signal.addEventListener('abort',waiter.onAbort,{once:true});
      decodeWaiters.push(waiter);
    });
  };
  const view=(entry:Entry):CoachAttachmentResult=>({...base,ok:true,state:entry.state,...(entry.state==='removed'?{}:{attachment:{id:entry.id,kind:'image',status:entry.state==='available'?'available':'pending'}}),expiresAt:new Date(entry.expires).toISOString(),...(entry.metadata?{metadata:{...entry.metadata}}:{})});
  return {
    operation(actor:string,raw:unknown):CoachAttachmentResult {
      const parsed=attachmentOperationSchema.safeParse(raw);if(!parsed.success)return fail('invalid_input');
      const input=parsed.data;prune();evictRemoved();
      if(input.operation==='attachment.prepare') {
        const active=[...entries.values()].filter(entry=>entry.state!=='removed');
        const owned=active.filter(entry=>entry.actor===actor&&entry.conversation===input.conversationId);
        if(active.length>=ISOLATED_ATTACHMENT_BOUNDS.activeEntries||owned.length>=COACH_IMAGE_LIMITS.count||owned.reduce((n,e)=>n+Math.max(e.limit,e.bytes?.length??0),0)+input.bytes>COACH_IMAGE_LIMITS.totalBytes||active.reduce((n,e)=>n+Math.max(e.limit,e.bytes?.length??0),0)+input.bytes>32*1024*1024)return fail('limit_exceeded');
        const entry:Entry={id:randomUUID(),actor,conversation:input.conversationId,mime:input.mime,limit:input.bytes,expires:clock()+900000,state:'prepared'};
        entries.set(entry.id,entry);return {...view(entry),uploadToken:token(entry)};
      }
      const entry=entries.get(input.attachmentId);
      if(!entry||entry.actor!==actor||entry.conversation!==input.conversationId)return fail('forbidden');
      if(input.operation==='attachment.remove'){entry.state='removed';delete entry.bytes;delete entry.metadata;delete entry.digest;evictRemoved();}
      return view(entry);
    },
    async upload(actor:string,conversation:string,id:string,providedToken:string,bytes:Uint8Array,signal:AbortSignal,reauthorize?:()=>Promise<void>):Promise<CoachAttachmentResult> {
      prune();const entry=entries.get(id);
      if(!entry||entry.actor!==actor||entry.conversation!==conversation)return fail('forbidden');
      if(!/^[a-f0-9]{64}$/.test(providedToken)||!timingSafeEqual(Buffer.from(providedToken,'hex'),Buffer.from(token(entry),'hex')))return fail('forbidden');
      if(entry.state==='removed')return fail('not_found');
      if(bytes.length!==entry.limit||bytes.length>COACH_IMAGE_LIMITS.fileBytes)return fail('limit_exceeded');
      if(signal.aborted)return fail('cancelled');
      const digest=createHash('sha256').update(bytes).digest('hex');
      if(entry.state==='available')return entry.digest===digest?view(entry):fail('invalid_input');
      if(entry.state==='uploading')return fail('busy');
      entry.state='uploading';
      let release:null|(()=>void)=null;
      try {
        release=await acquireSlot(signal);
        if((entry.state as string)==='removed')return fail('cancelled');
        const image=await decode(bytes,entry.mime,signal);
        if(reauthorize)await reauthorize();
        signal.throwIfAborted();
        const others=[...entries.values()].filter(other=>other.id!==id&&other.state!=='removed');
        const normalizedSize=Math.max(entry.limit,image.bytes.length);
        if(others.reduce((n,e)=>n+Math.max(e.limit,e.bytes?.length??0),0)+normalizedSize>32*1024*1024 || others.filter(e=>e.actor===actor&&e.conversation===conversation).reduce((n,e)=>n+Math.max(e.limit,e.bytes?.length??0),0)+normalizedSize>COACH_IMAGE_LIMITS.totalBytes)return fail('limit_exceeded');
        if(entries.get(id)!==entry||entry.expires<=clock()||(entry.state as string)==='removed')return fail('cancelled');
        entry.bytes=image.bytes;entry.metadata=image.metadata;entry.digest=digest;entry.state='available';
        return view(entry);
      } catch(error) {
        if((entry.state as string)!=='removed')entry.state='prepared';
        return fail(signal.aborted?'cancelled':error instanceof Error&&error.message==='forbidden'?'forbidden':error instanceof Error&&error.message==='busy'?'busy':error instanceof Error&&error.message==='limit_exceeded'?'limit_exceeded':'invalid_image');
      } finally {if(entry.state==='uploading')entry.state='prepared';release?.();}
    },
    /** Read-only test instrumentation; never used for authorization or routing. */
    stats(){prune();let active=0,removed=0;for(const entry of entries.values())if(entry.state==='removed')removed++;else active++;return {active,removed,total:entries.size,decoding,queued:decodeWaiters.length};},
  };
}

export const isolatedAttachmentStore=createIsolatedAttachmentStore();
