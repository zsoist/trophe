import {describe,expect,it,vi} from 'vitest';
import {handleCoachRequest} from './handler';
import {fixtureRepository} from './fixtures';
import {createIsolatedCoachEngineBinding} from './isolated-engine';

const id='a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const operation={version:'coach-assistant.v2',conversationId:id,turnId:id,operation:'message.recipient'};
const request=(body:unknown)=>new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
function setup(){
 const repository=fixtureRepository();repository.dataSource='authorized_records';repository.authorize=vi.fn(async()=>({actorId:id,subjectId:id,organizationId:id,timezone:'UTC',language:'es'}));
 const execute=vi.fn().mockResolvedValue({ok:false,error:'not_found'});const createMessageService=vi.fn(()=>({execute}));
 const deps={env:{COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:id,COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED:'1',VERCEL_ENV:'preview'},guard:vi.fn(async()=>({userId:id})),createRepository:vi.fn(()=>repository),createMessageService};
 return {deps,execute};
}
describe('gated human coach message transport',()=>{
 it('dispatches only through the injected human message service',async()=>{const {deps,execute}=setup();const response=await handleCoachRequest(request(operation),deps);expect(response.status).toBe(404);expect(execute).toHaveBeenCalledOnce();expect(execute.mock.calls[0][0]).toMatchObject({actorId:id,subjectId:id,organizationId:id,operation});});
 it('stays dark without repository/service access and rejects unreviewed apply',async()=>{const {deps,execute}=setup();expect((await handleCoachRequest(request(operation),{...deps,env:{...deps.env,COACH_ASSISTANT_MESSAGE_ACTIONS_ENABLED:'0'}})).status).toBe(404);expect(deps.createRepository).not.toHaveBeenCalled();expect(deps.createMessageService).not.toHaveBeenCalled();expect((await handleCoachRequest(request({...operation,operation:'message.apply',coachId:id,proposalId:id,hash:'a'.repeat(64),resourceVersion:'1',actionId:id,reviewed:false}),deps)).status).toBe(400);expect(execute).not.toHaveBeenCalled();});
 it('connects the isolated Coach turn to review-only message preparation',async()=>{
  const {deps,execute}=setup(),coachId=crypto.randomUUID(),proposalId=crypto.randomUUID();
  const env={...deps.env,CI:'true',GITHUB_ACTIONS:'true',CI_REAL_SUPABASE:'1',COACH_ASSISTANT_ISOLATED_ENGINE_ENABLED:'1',COACH_ASSISTANT_DATA_SOURCE:'authorized_records',DATABASE_URL:'postgresql://fixture:fixture@127.0.0.1:54322/postgres',NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321'};
  const proposal={id:proposalId,hash:'a'.repeat(64),action:'chat.message.send' as const,recipient:{coachId,name:'Coach Fixture',version:'1'},after:{message:'Hola, ¿podrías ayudarme a revisar mi plan?'},expiresAt:'2026-09-08T12:05:00Z',reviewRequired:true as const};
  execute.mockImplementation(async scope=>scope.operation.operation==='message.recipient'?{ok:true,recipient:proposal.recipient}:scope.operation.operation==='message.propose'?{ok:true,proposal}:{ok:false,error:'invalid_input'});
  const response=await handleCoachRequest(request({version:'coach-assistant.v2',conversationId:id,turnId:id,message:'Redacta un mensaje a mi coach',context:{surface:'messages',includeScreen:true}}),{...deps,env,isolatedEngine:createIsolatedCoachEngineBinding(env)});
  expect(response.status).toBe(200);expect(await response.json()).toMatchObject({ok:true,capabilityResult:{tool:'coach.message.propose',status:'review_required',applied:false,result:{proposal:{after:{message:proposal.after.message}}}},receipts:[]});
 });
});
