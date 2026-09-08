import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { createIsolatedAttachmentStore } from './isolated-attachments';
import { normalizeCoachImage } from './image-validation';

const png=()=>sharp({create:{width:4,height:3,channels:3,background:'#ff0000'}}).png().toBuffer();
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
});
