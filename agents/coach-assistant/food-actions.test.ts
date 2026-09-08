import { parseFoodQuantityChange } from '@/lib/food/log-edit-service';
import { describe,it,expect,vi } from 'vitest';
import { executeFoodQuantityAction, type FoodQuantityService } from './food-actions';
import { fixtureRepository } from './fixtures';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const actor=id(1);const entry=id(2);
const base={version:'coach-assistant.v2',conversationId:id(3),turnId:id(4),entryId:entry};
const before={loggedDate:'2026-09-07',foodName:'Fixture rice',grams:250,quantity:1,calories:500,proteinG:10,carbsG:100,fatG:5,fiberG:2,sugarG:1};
const after={...before,grams:150,calories:300,proteinG:6,carbsG:60,fatG:3,fiberG:1.2,sugarG:0.6};
const proposal={id:id(5),hash:'a'.repeat(64),action:'food.quantity.update',resource:{kind:'food_entry',id:entry,version:'7'},before,after,precondition:'7',expiresAt:'2026-09-07T01:00:00Z',reviewRequired:true};
const propose={...base,operation:'food.propose',resourceVersion:'7',after:{grams:150}};
const apply={...base,operation:'food.apply',proposalId:proposal.id,hash:proposal.hash,actionId:id(6),resourceVersion:'7',reviewed:true};
const receipt={id:id(7),actionId:id(6),proposalId:proposal.id,status:'applied',resourceVersion:'8',recordedAt:'2026-09-07T00:00:00Z'};
const refresh={entryId:entry,loggedDate:before.loggedDate,previousVersion:'7',version:'8',strategy:'refetch'};
function fixture() {
  const repository=fixtureRepository();repository.dataSource='authorized_records';
  repository.authorize=vi.fn().mockResolvedValue({actorId:actor,subjectId:actor,organizationId:id(8),timezone:'UTC',language:'en'});
  // The actual shared Food validator; only the database service response is injected.
  const service:FoodQuantityService={parseQuantityChange:parseFoodQuantityChange,execute:vi.fn().mockResolvedValue({version:base.version,storage:'database',ok:true,proposal})};
  return {repository,service,signal:new AbortController().signal};
}
describe('Food grams adapter with injected shared service (no SQL or macro-calculation evidence)',()=>{
  it('returns the shared service review of 250g to 150g and delegates validation/calculation',async()=>{
    const deps=fixture();const result=await executeFoodQuantityAction(actor,propose,deps.repository,deps.service,deps.signal);
    expect(result).toMatchObject({ok:true,proposal:{before:{grams:250,calories:500},after:{grams:150,calories:300},reviewRequired:true}});
    expect(deps.service.execute).toHaveBeenCalledExactlyOnceWith({actorId:actor,subjectId:actor,organizationId:id(8),operation:propose,signal:deps.signal});
  });
  it('rejects invalid shared quantities, unreviewed apply, foreign client and a wrong returned entry',async()=>{
    const deps=fixture();
    expect(await executeFoodQuantityAction(actor,{...propose,after:{grams:-1}},deps.repository,deps.service,deps.signal)).toMatchObject({error:'invalid_input'});
    expect(await executeFoodQuantityAction(actor,{...apply,reviewed:false},deps.repository,deps.service,deps.signal)).toMatchObject({error:'invalid_input'});
    expect(await executeFoodQuantityAction(actor,{...propose,clientId:id(9)},deps.repository,deps.service,deps.signal)).toMatchObject({error:'forbidden'});
    expect(deps.service.execute).not.toHaveBeenCalled();
    vi.mocked(deps.service.execute).mockResolvedValue({version:base.version,storage:'database',ok:true,proposal:{...proposal,resource:{...proposal.resource,id:id(9)}}});
    expect(await executeFoodQuantityAction(actor,propose,deps.repository,deps.service,deps.signal)).toMatchObject({error:'uncertain'});
  });
  it('requires the actual bound receipt and a refetch boundary instead of an optimistic success',async()=>{
    const deps=fixture();vi.mocked(deps.service.execute).mockResolvedValue({version:base.version,storage:'database',ok:true,receipt,refresh});
    expect(await executeFoodQuantityAction(actor,apply,deps.repository,deps.service,deps.signal)).toMatchObject({ok:true,receipt,refresh});
    vi.mocked(deps.service.execute).mockResolvedValue({version:base.version,storage:'database',ok:true,receipt});
    expect(await executeFoodQuantityAction(actor,apply,deps.repository,deps.service,deps.signal)).toMatchObject({error:'uncertain'});
    vi.mocked(deps.service.execute).mockResolvedValue({version:base.version,storage:'database',ok:true,receipt,refresh:{...refresh,entryId:id(9)}});
    expect(await executeFoodQuantityAction(actor,apply,deps.repository,deps.service,deps.signal)).toMatchObject({error:'uncertain'});
  });
  it('propagates a stale proposal refusal and rechecks receipt authorization without redispatching on errors',async()=>{
    const deps=fixture();vi.mocked(deps.service.execute).mockResolvedValue({version:base.version,storage:'database',ok:false,error:'version_conflict'});
    expect(await executeFoodQuantityAction(actor,apply,deps.repository,deps.service,deps.signal)).toMatchObject({error:'version_conflict'});
    vi.mocked(deps.service.execute).mockClear();repositoryRevoked(deps.repository);
    expect(await executeFoodQuantityAction(actor,{...base,operation:'food.receipt',actionId:id(6)},deps.repository,deps.service,deps.signal)).toMatchObject({error:'forbidden'});
    expect(deps.service.execute).not.toHaveBeenCalled();
  });
});
function repositoryRevoked(repository:ReturnType<typeof fixtureRepository>) {repository.authorize=async()=>{throw new Error('forbidden');};}
