import { describe,it,expect,vi } from 'vitest';
import { executeWorkoutSetAction,type WorkoutSetService } from './set-actions';
import { fixtureRepository } from './fixtures';
import { parseWorkoutSetRepsChange } from '@/lib/workout/set-edit-service';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1),scope={actorId:actor,subjectId:actor,organizationId:id(2),timezone:'UTC',language:'en'};
const raw={version:'coach-assistant.v2',conversationId:id(3),turnId:id(4),setId:id(5),operation:'set.read'};
describe('Workout set action boundary',()=>{
 it('requires self, authorized records and unchanged current organization after service dispatch',async()=>{
  const repo=fixtureRepository();repo.dataSource='authorized_records';repo.authorize=vi.fn(async()=>({...scope}));
  const service:WorkoutSetService={parseRepsChange:parseWorkoutSetRepsChange,execute:vi.fn(async()=>({version:'coach-assistant.v2',storage:'database',ok:false,error:'not_found'}))};
  expect(await executeWorkoutSetAction(actor,{...raw,clientId:id(8)},repo,service,new AbortController().signal)).toMatchObject({error:'forbidden'});expect(service.execute).not.toHaveBeenCalled();
  const auth=vi.fn().mockResolvedValueOnce(scope).mockResolvedValue({...scope,organizationId:id(9)});repo.authorize=auth;
  expect(await executeWorkoutSetAction(actor,raw,repo,service,new AbortController().signal)).toMatchObject({error:'forbidden'});
 });
 it('distinguishes cancelled before dispatch from uncertain after dispatch',async()=>{
  const repo=fixtureRepository();repo.dataSource='authorized_records';repo.authorize=async()=>scope;
  const controller=new AbortController();controller.abort();
  const service:WorkoutSetService={parseRepsChange:parseWorkoutSetRepsChange,execute:vi.fn(async()=>{throw new Error('connection lost');})};
  expect(await executeWorkoutSetAction(actor,raw,repo,service,controller.signal)).toMatchObject({error:'cancelled'});expect(service.execute).not.toHaveBeenCalled();
  expect(await executeWorkoutSetAction(actor,raw,repo,service,new AbortController().signal)).toMatchObject({error:'uncertain'});
 });
});
