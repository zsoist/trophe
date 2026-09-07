import { describe, expect, it } from 'vitest';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';

const req = (body: unknown) => new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
const env = { COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:'verified-user',COACH_ASSISTANT_DATA_SOURCE:'synthetic',VERCEL_ENV:'preview' };
const deps = { env,guard:async()=>({userId:'verified-user'}),createRepository:()=>fixtureRepository(),now:()=>new Date('2026-09-07T03:30:00Z') };
describe('private route contract', () => {
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
});
