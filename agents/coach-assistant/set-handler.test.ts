import {describe,expect,it,vi} from 'vitest';
import {handleCoachRequest} from './handler';
import {fixtureRepository} from './fixtures';

const id='a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const operation={version:'coach-assistant.v2',conversationId:id,turnId:id,operation:'set.resolve'};
const request=(body:unknown)=>new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
function setup(){
 const repository=fixtureRepository();repository.dataSource='authorized_records';repository.authorize=vi.fn(async()=>({actorId:id,subjectId:id,organizationId:id,timezone:'UTC',language:'es'}));
 const execute=vi.fn().mockResolvedValue({version:'coach-assistant.v2',storage:'database',ok:false,error:'ambiguous_selection'});
 const createWorkoutSetService=vi.fn(()=>({execute,parseRepsChange:(value:unknown)=>value as {reps:number}}));
 const deps={env:{COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:id,COACH_ASSISTANT_WORKOUT_SET_ACTIONS_ENABLED:'1',VERCEL_ENV:'preview'},guard:vi.fn(async()=>({userId:id})),createRepository:vi.fn(()=>repository),createWorkoutSetService};
 return {deps,execute};
}
describe('gated Workout set HTTP transport',()=>{
 it('dispatches latest-set resolution through the existing endpoint and preserves clarification',async()=>{
  const {deps,execute}=setup();const response=await handleCoachRequest(request(operation),deps);
  expect(response.status).toBe(409);expect(await response.json()).toMatchObject({storage:'database',error:'ambiguous_selection'});
  expect(execute).toHaveBeenCalledOnce();expect(execute.mock.calls[0][0]).toMatchObject({actorId:id,subjectId:id,organizationId:id,operation});
 });
 it('stays disabled without touching repository or service and rejects an unreviewed apply before dispatch',async()=>{
  const {deps,execute}=setup();expect((await handleCoachRequest(request(operation),{...deps,env:{...deps.env,COACH_ASSISTANT_WORKOUT_SET_ACTIONS_ENABLED:'0'}})).status).toBe(404);
  expect(deps.createRepository).not.toHaveBeenCalled();expect(deps.createWorkoutSetService).not.toHaveBeenCalled();
  expect((await handleCoachRequest(request({...operation,operation:'set.apply',setId:id,proposalId:id,hash:'a'.repeat(64),actionId:id,resourceVersion:'1',reviewed:false}),deps)).status).toBe(400);
  expect(execute).not.toHaveBeenCalled();
 });
});
