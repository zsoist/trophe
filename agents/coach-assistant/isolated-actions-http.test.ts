import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
import { defaultWorkoutPreferences } from '@/lib/workout/preferences';

/** Real loopback HTTP, injected auth/repository fixtures; not a Supabase Auth or RLS test. */
describe('isolated action HTTP envelopes',()=>{
  it('proposes, applies once, queries receipt and denies revoked authorization over HTTP',async()=>{
    const actor=randomUUID();const conversationId=randomUUID();let revoked=false;
    const repository=fixtureRepository();repository.dataSource='authorized_records';
    repository.authorize=async()=>{if(revoked)throw new Error('forbidden');return {actorId:actor,subjectId:actor,organizationId:'fixture-org',timezone:'UTC',language:'en'};};
    repository.personalContext=async()=>({rows:[{userId:actor,preferences:defaultWorkoutPreferences,memories:[]}],truncated:false});
    const server=createServer(async(req,res)=>{
      try {
        const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk));
        const result=await handleCoachRequest(new Request('http://127.0.0.1/api/coach-assistant',{method:'POST',body:Buffer.concat(chunks)}),{
          env:{COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:actor,VERCEL_ENV:'preview'},
          guard:async()=>req.headers.authorization==='fixture-session'?{userId:actor}:new Response('',{status:401}),createRepository:()=>repository,
        });
        res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text());
      } catch {res.writeHead(500);res.end();}
    });
    server.listen(0,'127.0.0.1');await once(server,'listening');
    const address=server.address();if(!address||typeof address==='string')throw new Error('test address missing');
    const url=`http://127.0.0.1:${address.port}`;
    const post=(body:unknown,auth=true)=>fetch(url,{method:'POST',headers:auth?{Authorization:'fixture-session'}:{},body:JSON.stringify(body)});
    const base={version:'coach-assistant.v2',conversationId,turnId:randomUUID()};
    const version=createHash('sha256').update(JSON.stringify(defaultWorkoutPreferences)).digest('hex');
    try {
      expect((await post({...base,operation:'receipt',actionId:randomUUID()},false)).status).toBe(401);
      const proposed=await post({...base,operation:'propose',action:'preference.update',resourceVersion:version,after:{durationMinutes:45}});
      expect(proposed.status).toBe(200);expect(proposed.headers.get('cache-control')).toBe('no-store');
      const {proposal}=await proposed.json();
      const apply={...base,operation:'apply',proposalId:proposal.id,hash:proposal.hash,actionId:randomUUID(),resourceVersion:version};
      const first=await (await post(apply)).json();
      expect(first).toMatchObject({ok:true,storage:'isolated_ephemeral',receipt:{status:'applied'}});
      expect((await (await post(apply)).json()).receipt).toEqual(first.receipt);
      expect((await (await post({...base,operation:'receipt',actionId:apply.actionId})).json()).receipt).toEqual(first.receipt);
      expect((await post({...apply,hash:'0'.repeat(64)})).status).toBe(409);
      expect(defaultWorkoutPreferences.durationMinutes).toBe(30);
      revoked=true;
      expect((await post({...base,operation:'receipt',actionId:apply.actionId})).status).toBe(403);
    } finally {server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
  });
});
