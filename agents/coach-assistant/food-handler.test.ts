import { describe,it,expect,vi } from 'vitest';
import { handleCoachRequest } from './handler';
import { fixtureRepository } from './fixtures';
const id='a2c5ec63-6f35-4671-b4f1-6644ca9d739c';
const operation={version:'coach-assistant.v2',conversationId:id,turnId:id,entryId:id,operation:'food.read'};
const request=(body:unknown)=>new Request('https://preview.invalid/api/coach-assistant',{method:'POST',body:JSON.stringify(body)});
function setup(){
 const repository=fixtureRepository();repository.dataSource='authorized_records';
 repository.authorize=vi.fn(async()=>({actorId:id,subjectId:id,organizationId:'org',timezone:'UTC',language:'en'}));
 const execute=vi.fn().mockResolvedValue({version:'coach-assistant.v2',storage:'database',ok:false,error:'not_found'});
 const createFoodService=vi.fn(()=>({execute,parseQuantityChange:(value:unknown)=>value as {grams:number}}));
 const createDurableService=vi.fn();
 const deps={env:{COACH_ASSISTANT_ENABLED:'1',COACH_ASSISTANT_PREVIEW_USER_IDS:id,COACH_ASSISTANT_FOOD_ACTIONS_ENABLED:'1',COACH_ASSISTANT_DURABLE_ACTIONS_ENABLED:'1',COACH_ASSISTANT_ISOLATED_ACTIONS_ENABLED:'1',VERCEL_ENV:'preview'},guard:vi.fn(async()=>({userId:id})),createRepository:vi.fn(()=>repository),createFoodService,createDurableService};
 return {deps,execute,repository};
}
describe('gated Food HTTP transport',()=>{
 it('keeps Food disabled without touching either service or repository',async()=>{
  const {deps}=setup();deps.env.COACH_ASSISTANT_FOOD_ACTIONS_ENABLED='0';
  const response=await handleCoachRequest(request(operation),deps);
  expect(response.status).toBe(404);expect(deps.createFoodService).not.toHaveBeenCalled();expect(deps.createRepository).not.toHaveBeenCalled();expect(deps.createDurableService).not.toHaveBeenCalled();
 });
 it('fails closed for an unbound service even when other action modes are enabled',async()=>{
  const {deps}=setup();const response=await handleCoachRequest(request(operation),{...deps,createFoodService:undefined});
  expect(response.status).toBe(503);expect(deps.createDurableService).not.toHaveBeenCalled();
 });
 it('dispatches the authorized scope once and returns database errors without fallback',async()=>{
  const {deps,execute}=setup();const response=await handleCoachRequest(request(operation),deps);
  expect(response.status).toBe(404);expect(await response.json()).toMatchObject({storage:'database',error:'not_found'});
  expect(execute).toHaveBeenCalledTimes(1);expect(execute.mock.calls[0][0]).toMatchObject({actorId:id,subjectId:id,organizationId:'org',operation});expect(deps.createDurableService).not.toHaveBeenCalled();expect(response.headers.get('Cache-Control')).toBe('no-store');
 });
 it('rejects forged client scope, unknown operations, and unreviewed apply before dispatch',async()=>{
  const {deps,execute}=setup();
  for(const [body,status] of [[{...operation,clientId:'aac3a82e-898c-4907-b9b9-75133bb6d27f'},403],[{...operation,operation:'food.delete'},400],[{...operation,operation:'food.apply',proposalId:id,actionId:id,hash:'a'.repeat(64),resourceVersion:'0',reviewed:false},400]] as const){
   expect((await handleCoachRequest(request(body),deps)).status).toBe(status);
  }
  expect(execute).not.toHaveBeenCalled();
 });
 it('blocks production before guard and rejects revoked authorization before dispatch',async()=>{
  const {deps,execute,repository}=setup();expect((await handleCoachRequest(request(operation),{...deps,env:{...deps.env,VERCEL_ENV:'production'}})).status).toBe(404);expect(deps.guard).not.toHaveBeenCalled();
  repository.authorize=vi.fn().mockRejectedValue(new Error('forbidden'));
  expect((await handleCoachRequest(request(operation),deps)).status).toBe(403);expect(execute).not.toHaveBeenCalled();
 });
});
