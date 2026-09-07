import { describe, expect, it, vi } from 'vitest';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';

const req = (body: unknown) => new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
const env = { COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:'verified-user',COACH_ASSISTANT_DATA_SOURCE:'synthetic',VERCEL_ENV:'preview' };
const deps = { env,guard:async()=>({userId:'verified-user'}),createRepository:()=>fixtureRepository(),now:()=>new Date('2026-09-07T03:30:00Z') };
describe('private route contract', () => {
  it('advertises isolated uploads separately from image analysis only for enabled authorized self scope',async()=>{
    const repository=fixtureRepository();repository.dataSource='authorized_records';
    const body={version:'coach-assistant.v2',conversationId:'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId:'aac3a82e-898c-4907-b9b9-75133bb6d27f',message:'Today?'};
    const config={...deps,guard:async()=>({userId:'synthetic-client'}),createRepository:()=>repository,env:{...env,COACH_ASSISTANT_PREVIEW_USER_IDS:'synthetic-client',COACH_ASSISTANT_DATA_SOURCE:'authorized_records',COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED:'1'}};
    const enabled=await (await handleCoachRequest(req(body),config)).json();
    expect(enabled.ok).toBe(true);
    expect(enabled.uploads).toMatchObject({images:true,storage:'isolated_ephemeral',analysis:'not_connected',limits:{fileBytes:5242880,totalBytes:15728640}});
    expect(enabled.snapshot.capabilities.find((item:{key:string})=>item.key==='images').status).toBe('not_connected');
    const disabled=await (await handleCoachRequest(req(body),{...config,env:{...config.env,COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED:'0'}})).json();
    expect(disabled.uploads).toBeUndefined();
    const synthetic=await (await handleCoachRequest(req(body),{...config,env:{...config.env,COACH_ASSISTANT_DATA_SOURCE:'synthetic'}})).json();
    expect(synthetic.uploads).toBeUndefined();
  });
  it('cancels an interrupted binary request without fabricating a completed attachment',async()=>{
    const abort=new AbortController();
    const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(new Uint8Array([137,80]));}});
    const request=new Request('https://preview.invalid/api/coach-assistant',{method:'PUT',body:stream,signal:abort.signal,duplex:'half'} as RequestInit);
    const repository=fixtureRepository();repository.authorize=async()=>({actorId:'verified-user',subjectId:'verified-user',organizationId:'org',timezone:'UTC',language:'en'});
    const result=handleCoachRequest(request,{...deps,createRepository:()=>repository,env:{...env,COACH_ASSISTANT_ISOLATED_ATTACHMENTS_ENABLED:'1'}});
    setTimeout(()=>abort.abort(),5);
    const body=await (await result).json();
    expect(body.error.code).toBe('cancelled');expect(body.attachment).toBeUndefined();
  });
  it('serves the shared v2 conversation on the same guarded endpoint', async () => {
    const response=await handleCoachRequest(req({version:'coach-assistant.v2',conversationId:'a2c5ec63-6f35-4671-b4f1-6644ca9d739c',turnId:'aac3a82e-898c-4907-b9b9-75133bb6d27f',message:'Food and training this week?',context:{surface:'food',includeScreen:true}}),deps);
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.version).toBe('coach-assistant.v2');
    expect(body.snapshot.surface).toBe('food');
    expect(body.dataSource).toBe('synthetic');
    expect(body.telemetry.modelCalls).toBe(0);
  });
  it('denies production and flag-off without touching auth or data', async () => {
    const guard = async()=>{throw new Error('must not run');};
    expect((await handleCoachRequest(req({}),{...deps,guard,env:{}})).status).toBe(404);
    expect((await handleCoachRequest(req({}),{...deps,guard,env:{...env,VERCEL_ENV:'production'}})).status).toBe(404);
  });
  it('denies missing/expired auth and users outside the preview allowlist', async () => {
    const unauthorized=await handleCoachRequest(req({}),{...deps,guard:async()=>new Response('',{status:401})});
    expect(unauthorized.status).toBe(401);
    expect((await unauthorized.json()).error.code).toBe('unauthenticated');
    expect((await handleCoachRequest(req({}),{...deps,guard:async()=>({userId:'other'})})).status).toBe(403);
  });
  it('returns typed synthetic data only through explicit server configuration', async () => {
    const result = await handleCoachRequest(req({message:'Today?',intent:'today'}),deps);
    expect(result.status).toBe(200);
    expect((await result.json()).dataSource).toBe('synthetic');
    const forged = await handleCoachRequest(req({message:'Today?',intent:'today',fixtures:[]}),deps);
    expect(forged.status).toBe(400);
  });
  it('rejects oversized bodies before parsing', async () => {
    expect((await handleCoachRequest(req({message:'x'.repeat(20000),intent:'today'}),deps)).status).toBe(400);
  });
  it('normalizes rate limit errors and preserves safe retry timing',async()=>{
    const response=await handleCoachRequest(req({}),{...deps,guard:async()=>new Response('sensitive raw',{status:429,headers:{'Retry-After':'30'}})});
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('30');
    expect((await response.json()).error).toEqual({code:'rate_limited',retryable:true});
  });
  it.each(['{broken',new Uint8Array([0xff,0xfe])])('normalizes malformed JSON or UTF8 to invalid_input',async body=>{
    const request=new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body});
    const response=await handleCoachRequest(request,deps);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('invalid_input');
  });
  it('loads the disabled production route without database configuration',async()=>{
    vi.stubEnv('NODE_ENV','production');vi.stubEnv('VERCEL_ENV','production');vi.stubEnv('DATABASE_URL',undefined);
    try {
      const {POST}=await import('@/app/api/coach-assistant/route');
      expect((await POST(req({}) as Parameters<typeof POST>[0])).status).toBe(404);
    } finally {vi.unstubAllEnvs();}
  });
  it('marks transient guard failures retryable without leaking their response',async()=>{
    const response=await handleCoachRequest(req({}),{...deps,guard:async()=>new Response('raw provider message',{status:503})});
    expect((await response.json()).error).toEqual({code:'provider_unavailable',retryable:true});
  });
});
