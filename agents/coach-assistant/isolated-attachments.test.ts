import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { ISOLATED_ATTACHMENT_BOUNDS, createIsolatedAttachmentStore } from './isolated-attachments';
import type { CoachImageMime } from './contracts';
import { normalizeCoachImage } from './image-validation';

const png=()=>sharp({create:{width:4,height:3,channels:3,background:'#ff0000'}}).png().toBuffer();
const flush=()=>new Promise(resolve=>setImmediate(resolve));
/** Deterministic decode port: no real Sharp decode, no real memory pressure. */
const gatedDecode=()=>{
  const releases:Array<()=>void>=[];let live=0,peak=0;
  const decode=async(_bytes:Uint8Array,_mime:CoachImageMime,signal:AbortSignal)=>{
    live++;peak=Math.max(peak,live);
    await new Promise<void>(resolve=>{releases.push(resolve);signal.addEventListener('abort',()=>resolve(),{once:true});});
    live--;
    return {bytes:Buffer.alloc(32),metadata:{mime:'image/jpeg' as const,bytes:32,width:8,height:4}};
  };
  return {decode,releases,get live(){return live;},get peak(){return peak;}};
};
describe('isolated image attachment boundaries',()=>{
  it('validates real image bytes, binds owner/thread/token and replays an identical upload',async()=>{
    const store=createIsolatedAttachmentStore();const conversationId=randomUUID();const bytes=await png();
    const prepared=store.operation('actor:org',{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId,mime:'image/png',bytes:bytes.length});
    const id=prepared.attachment!.id;const token=prepared.uploadToken!;const signal=new AbortController().signal;
    expect((await store.upload('other:org',conversationId,id,token,bytes,signal)).error).toBe('forbidden');
    expect((await store.upload('actor:org',randomUUID(),id,token,bytes,signal)).error).toBe('forbidden');
    expect((await store.upload('actor:org',conversationId,id,'0'.repeat(64),bytes,signal)).error).toBe('forbidden');
    const result=await store.upload('actor:org',conversationId,id,token,bytes,signal);
    expect(result).toMatchObject({ok:true,state:'available',storage:'isolated_ephemeral',analysis:'not_connected',metadata:{mime:'image/jpeg',width:4,height:3}});
    expect(await store.upload('actor:org',conversationId,id,token,bytes,signal)).toEqual(result);
    const removed=store.operation('actor:org',{version:'coach-assistant.v2',operation:'attachment.remove',conversationId,attachmentId:id,reviewed:true});
    expect(removed.state).toBe('removed');expect(removed.attachment).toBeUndefined();
    expect((await store.upload('actor:org',conversationId,id,token,bytes,signal)).error).toBe('not_found');
  });
  it('rejects MIME spoofing, executable formats, foreign URLs and more than three reservations',async()=>{
    const bytes=await png();const signal=new AbortController().signal;
    await expect(normalizeCoachImage(bytes,'image/jpeg',signal)).rejects.toThrow('invalid_image');
    await expect(normalizeCoachImage(Buffer.from('<svg onload="run()"/>'),'image/png',signal)).rejects.toThrow('invalid_image');
    const store=createIsolatedAttachmentStore();const input={version:'coach-assistant.v2',operation:'attachment.prepare',conversationId:randomUUID(),mime:'image/png',bytes:100};
    expect(store.operation('actor',{...input,url:'https://arbitrary.invalid'}).error).toBe('invalid_input');
    for(let i=0;i<3;i++)expect(store.operation('actor',input).ok).toBe(true);
    expect(store.operation('actor',input).error).toBe('limit_exceeded');
  });
  it('allows an interrupted upload retry and refuses a revoked final authorization',async()=>{
    const store=createIsolatedAttachmentStore();const conversationId=randomUUID();const bytes=await png();
    const prepared=store.operation('actor',{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId,mime:'image/png',bytes:bytes.length});
    const aborted=new AbortController();aborted.abort();
    expect((await store.upload('actor',conversationId,prepared.attachment!.id,prepared.uploadToken!,bytes,aborted.signal)).error).toBe('cancelled');
    expect((await store.upload('actor',conversationId,prepared.attachment!.id,prepared.uploadToken!,bytes,new AbortController().signal,async()=>{throw new Error('forbidden');})).error).toBe('forbidden');
    expect((await store.upload('actor',conversationId,prepared.attachment!.id,prepared.uploadToken!,bytes,new AbortController().signal)).ok).toBe(true);
  });
  it('applies orientation and strips metadata instead of preserving EXIF',async()=>{
    const bytes=await sharp({create:{width:4,height:3,channels:3,background:'#00ff00'}}).withMetadata({orientation:6}).jpeg().toBuffer();
    const image=await normalizeCoachImage(bytes,'image/jpeg',new AbortController().signal);
    const metadata=await sharp(image.bytes).metadata();
    expect(metadata.width).toBe(3);expect(metadata.height).toBe(4);expect(metadata.exif).toBeUndefined();expect(metadata.orientation).toBeUndefined();
  });
  it('normalizes a second owner/thread concurrently instead of reporting a global busy',async()=>{
    const store=createIsolatedAttachmentStore();const bytes=await png();const signal=new AbortController().signal;
    const conversationA=randomUUID(),conversationB=randomUUID();
    const preparedA=store.operation('owner-a:org',{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId:conversationA,mime:'image/png',bytes:bytes.length});
    const preparedB=store.operation('owner-b:org',{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId:conversationB,mime:'image/png',bytes:bytes.length});
    // First call runs synchronously into normalizeCoachImage (an await) and holds any
    // decode gate it set; the unrelated second upload must not observe that gate.
    const first=store.upload('owner-a:org',conversationA,preparedA.attachment!.id,preparedA.uploadToken!,bytes,signal);
    const duplicate=await store.upload('owner-a:org',conversationA,preparedA.attachment!.id,preparedA.uploadToken!,bytes,signal);
    expect(duplicate.error).toBe('busy');
    const second=await store.upload('owner-b:org',conversationB,preparedB.attachment!.id,preparedB.uploadToken!,bytes,signal);
    expect(second).toMatchObject({ok:true,state:'available'});
    expect(await first).toMatchObject({ok:true,state:'available'});
  });
  it('frees store capacity when a reservation is removed',async()=>{
    const store=createIsolatedAttachmentStore();
    for(let i=0;i<128;i++){
      const conversationId=randomUUID();
      const prepared=store.operation('owner:org',{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId,mime:'image/png',bytes:1});
      expect(prepared.ok).toBe(true);
      expect(store.operation('owner:org',{version:'coach-assistant.v2',operation:'attachment.remove',conversationId,attachmentId:prepared.attachment!.id,reviewed:true}).ok).toBe(true);
    }
    expect(store.operation('owner:org',{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId:randomUUID(),mime:'image/png',bytes:1}).ok).toBe(true);
  });
  it('bounds concurrent image decodes and rejects overflow beyond a bounded queue',async()=>{
    const bounds=ISOLATED_ATTACHMENT_BOUNDS;const gated=gatedDecode();
    // The bound must admit at least two independent owners while still bounding the rest.
    expect(bounds.decodeConcurrency).toBeGreaterThanOrEqual(2);
    const store=createIsolatedAttachmentStore(Date.now,gated.decode);const bytes=await png();
    const signal=new AbortController().signal;
    const launch=(index:number)=>{
      const owner=`owner-${index}:org`,conversationId=randomUUID();
      const prepared=store.operation(owner,{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId,mime:'image/png',bytes:bytes.length});
      return store.upload(owner,conversationId,prepared.attachment!.id,prepared.uploadToken!,bytes,signal);
    };
    const admitted=bounds.decodeConcurrency+bounds.decodeQueue;
    const pending=Array.from({length:admitted},(_,index)=>launch(index));
    const overflow=await launch(admitted);
    expect(overflow.error).toBe('busy');
    await flush();
    expect(gated.live).toBe(bounds.decodeConcurrency);
    expect(store.stats().decoding).toBe(bounds.decodeConcurrency);
    expect(store.stats().queued).toBe(bounds.decodeQueue);
    let guard=admitted+bounds.decodeQueue;
    while(gated.releases.length&&guard-->0){gated.releases.shift()!();await flush();}
    const results=await Promise.all(pending);
    expect(results.every(result=>result.ok&&result.state==='available')).toBe(true);
    expect(gated.peak).toBe(bounds.decodeConcurrency);
    expect(store.stats().decoding).toBe(0);
    expect(store.stats().queued).toBe(0);
  });
  it('removes a cancelled waiter from the decode queue without leaking capacity',async()=>{
    const bounds=ISOLATED_ATTACHMENT_BOUNDS;const gated=gatedDecode();
    const store=createIsolatedAttachmentStore(Date.now,gated.decode);const bytes=await png();
    const signal=new AbortController().signal;
    const prepare=(owner:string)=>{
      const conversationId=randomUUID();
      const prepared=store.operation(owner,{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId,mime:'image/png',bytes:bytes.length});
      return {owner,conversationId,id:prepared.attachment!.id,token:prepared.uploadToken!};
    };
    const a=prepare('owner-a:org'),b=prepare('owner-b:org'),c=prepare('owner-c:org');
    const running=[store.upload(a.owner,a.conversationId,a.id,a.token,bytes,signal),store.upload(b.owner,b.conversationId,b.id,b.token,bytes,signal)];
    const abortQueued=new AbortController();
    const queued=store.upload(c.owner,c.conversationId,c.id,c.token,bytes,abortQueued.signal);
    await flush();
    expect(store.stats().queued).toBe(1);
    abortQueued.abort();
    expect((await queued).error).toBe('cancelled');
    expect(store.stats().queued).toBe(0);
    expect(store.stats().decoding).toBe(bounds.decodeConcurrency);
    // A freed slot must go to the next real waiter, proving the stale waiter was not leaked.
    const d=prepare('owner-d:org');
    const extra=store.upload(d.owner,d.conversationId,d.id,d.token,bytes,signal);
    await flush();
    expect(store.stats().queued).toBe(1);
    gated.releases.shift()!();
    await flush();
    expect(store.stats().queued).toBe(0);
    expect(store.stats().decoding).toBe(bounds.decodeConcurrency);
    let guard=8;while(gated.releases.length&&guard-->0){gated.releases.shift()!();await flush();}
    expect((await Promise.all([...running,extra])).every(result=>result.ok)).toBe(true);
    expect(store.stats().decoding).toBe(0);
    // A cancelled waiter leaves the reservation retryable rather than stuck uploading/busy.
    const retry=store.upload(c.owner,c.conversationId,c.id,c.token,bytes,signal);
    await flush();
    guard=8;while(gated.releases.length&&guard-->0){gated.releases.shift()!();await flush();}
    expect((await retry).ok).toBe(true);
  });
  it('releases decode capacity exactly once when a decode fails',async()=>{
    const gated=gatedDecode();let failNext=true;
    const decode=async(bytes:Uint8Array,mime:CoachImageMime,signal:AbortSignal)=>{
      const image=await gated.decode(bytes,mime,signal);
      if(failNext){failNext=false;throw new Error('invalid_image');}
      return image;
    };
    const store=createIsolatedAttachmentStore(Date.now,decode);const bytes=await png();
    const signal=new AbortController().signal;
    const prepare=(owner:string)=>{
      const conversationId=randomUUID();
      const prepared=store.operation(owner,{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId,mime:'image/png',bytes:bytes.length});
      return {owner,conversationId,id:prepared.attachment!.id,token:prepared.uploadToken!};
    };
    const a=prepare('owner-a:org'),b=prepare('owner-b:org');
    const first=store.upload(a.owner,a.conversationId,a.id,a.token,bytes,signal);
    const second=store.upload(b.owner,b.conversationId,b.id,b.token,bytes,signal);
    await flush();
    let guard=8;while(gated.releases.length&&guard-->0){gated.releases.shift()!();await flush();}
    expect((await first).error).toBe('invalid_image');
    expect(await second).toMatchObject({ok:true,state:'available'});
    // The failed decode must not have leaked its slot: a fresh upload is admitted immediately.
    const c=prepare('owner-c:org');
    const third=store.upload(c.owner,c.conversationId,c.id,c.token,bytes,signal);
    await flush();
    expect(gated.live).toBe(1);
    guard=8;while(gated.releases.length&&guard-->0){gated.releases.shift()!();await flush();}
    expect(await third).toMatchObject({ok:true,state:'available'});
    expect(store.stats().decoding).toBe(0);
  });
  it('bounds removed tombstones under churn while preserving recent removal semantics',async()=>{
    const bounds=ISOLATED_ATTACHMENT_BOUNDS;
    const store=createIsolatedAttachmentStore();
    const cycles=bounds.removedTombstones*4+7;
    let first:{owner:string;conversationId:string;id:string}|null=null;
    let last:{owner:string;conversationId:string;id:string;token:string}|null=null;
    for(let index=0;index<cycles;index++){
      const owner='owner:org',conversationId=randomUUID();
      const prepared=store.operation(owner,{version:'coach-assistant.v2',operation:'attachment.prepare',conversationId,mime:'image/png',bytes:1});
      expect(prepared.ok).toBe(true);
      const removed=store.operation(owner,{version:'coach-assistant.v2',operation:'attachment.remove',conversationId,attachmentId:prepared.attachment!.id,reviewed:true});
      expect(removed.state).toBe('removed');
      if(!first){first={owner,conversationId,id:prepared.attachment!.id};}
      last={owner,conversationId,id:prepared.attachment!.id,token:prepared.uploadToken!};
    }
    const stats=store.stats();
    expect(stats.removed).toBeLessThanOrEqual(bounds.removedTombstones);
    expect(stats.total).toBeLessThanOrEqual(bounds.activeEntries+bounds.removedTombstones);
    // Recent removals keep status/upload semantics: state removed, re-upload not_found.
    const status=store.operation(last!.owner,{version:'coach-assistant.v2',operation:'attachment.status',conversationId:last!.conversationId,attachmentId:last!.id});
    expect(status.state).toBe('removed');expect(status.attachment).toBeUndefined();
    expect((await store.upload(last!.owner,last!.conversationId,last!.id,last!.token,new Uint8Array(1),new AbortController().signal)).error).toBe('not_found');
    // Only the retained window keeps an id; an evicted tombstone behaves like any unknown id.
    expect(store.operation(first!.owner,{version:'coach-assistant.v2',operation:'attachment.status',conversationId:first!.conversationId,attachmentId:first!.id}).error).toBe('forbidden');
  });
});
